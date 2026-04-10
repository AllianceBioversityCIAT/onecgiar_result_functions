"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SubmitEventHandler,
} from "react";
import {
  buildProxiedPath,
  buildQueryString,
  defaultJsonBodyString,
  jsonBodyExamples,
  listOperations,
  paramExample,
} from "../lib/openapi-helpers";
import type { HttpMethod, ListedOperation, OpenApiDocument } from "../lib/openapi-types";

function methodColor(method: HttpMethod): string {
  switch (method) {
    case "get":
      return "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400";
    case "post":
      return "bg-sky-600/15 text-sky-700 dark:text-sky-400";
    case "patch":
      return "bg-amber-600/15 text-amber-800 dark:text-amber-300";
    case "delete":
      return "bg-rose-600/15 text-rose-700 dark:text-rose-400";
    default:
      return "bg-[var(--accent-soft)] text-[var(--accent)]";
  }
}

function usesBody(method: HttpMethod): boolean {
  return method === "post" || method === "put" || method === "patch";
}

export function ApiReference() {
  const [doc, setDoc] = useState<OpenApiDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState("");
  const [bodyExampleKey, setBodyExampleKey] = useState<string | null>(null);

  const [tryLoading, setTryLoading] = useState(false);
  const [tryStatus, setTryStatus] = useState<number | null>(null);
  const [tryBody, setTryBody] = useState<string>("");
  const [tryError, setTryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/openapi", { cache: "no-store" });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
        }
        const json = JSON.parse(text) as OpenApiDocument;
        if (!cancelled) {
          setDoc(json);
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load spec");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const operations = useMemo(
    () => (doc ? listOperations(doc) : []),
    [doc],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return operations;
    return operations.filter(({ method, path, operation }) => {
      const hay = `${method} ${path} ${operation.summary ?? ""} ${operation.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [operations, filter]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return operations.find(
      (o) => opId(o.method, o.path) === selectedId,
    ) ?? null;
  }, [operations, selectedId]);

  const applyOperation = useCallback((item: ListedOperation) => {
    const { operation } = item;
    const pathParams: Record<string, string> = {};
    const queryParams: Record<string, string> = {};
    for (const p of operation.parameters ?? []) {
      if (p.in === "path") pathParams[p.name] = paramExample(p);
      if (p.in === "query") queryParams[p.name] = paramExample(p);
    }
    setPathValues(pathParams);
    setQueryValues(queryParams);
    setBodyText(defaultJsonBodyString(operation));
    const examples = jsonBodyExamples(operation.requestBody?.content);
    setBodyExampleKey(examples[0]?.key ?? null);
    setTryStatus(null);
    setTryBody("");
    setTryError(null);
  }, []);

  useEffect(() => {
    if (!doc) return;
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && filtered.some((o) => opId(o.method, o.path) === prev)) {
        return prev;
      }
      return opId(filtered[0].method, filtered[0].path);
    });
  }, [doc, filtered]);

  useEffect(() => {
    if (!selectedId) return;
    const item = operations.find((o) => opId(o.method, o.path) === selectedId);
    if (item) applyOperation(item);
  }, [selectedId, operations, applyOperation]);

  const onPickExample = (key: string) => {
    if (!selected) return;
    const examples = jsonBodyExamples(selected.operation.requestBody?.content);
    const ex = examples.find((e) => e.key === key);
    if (ex) {
      setBodyExampleKey(key);
      try {
        setBodyText(JSON.stringify(ex.value, null, 2));
      } catch {
        setBodyText("{}");
      }
    }
  };

  const onTry: SubmitEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!selected) return;
    const { method, path, operation } = selected;
    const built = buildProxiedPath(path, pathValues);
    if (/\{[^}]+\}/.test(built)) {
      setTryError("Fill in all path parameters (placeholders remain).");
      setTryStatus(null);
      setTryBody("");
      return;
    }
    const qs = buildQueryString(operation.parameters, queryValues);
    const url = `/api/proxy${built}${qs}`;

    setTryLoading(true);
    setTryError(null);
    setTryStatus(null);
    setTryBody("");

    try {
      const init: RequestInit = {
        method: method.toUpperCase(),
        headers: { Accept: "application/json" },
      };
      if (usesBody(method)) {
        const trimmed = bodyText.trim();
        if (trimmed) {
          (init.headers as Record<string, string>)["Content-Type"] =
            "application/json";
          init.body = bodyText;
        }
      }
      const res = await fetch(url, init);
      const text = await res.text();
      setTryStatus(res.status);
      try {
        const j = JSON.parse(text);
        setTryBody(JSON.stringify(j, null, 2));
      } catch {
        setTryBody(text || "(empty body)");
      }
    } catch (err) {
      setTryError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setTryLoading(false);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {loadError}
        </p>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-[var(--ink-muted)]">
        Loading API specification…
      </div>
    );
  }

  const pathParams = selected?.operation.parameters?.filter((p) => p.in === "path") ?? [];
  const queryParams =
    selected?.operation.parameters?.filter((p) => p.in === "query") ?? [];
  const bodyExamples = selected
    ? jsonBodyExamples(selected.operation.requestBody?.content)
    : [];

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 border-b border-[var(--border)] pb-8">
        <p className="text-sm font-medium tracking-wide text-[var(--accent)]">
          CGIAR · PRMS
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          API reference
        </h1>
        <p className="max-w-2xl text-base text-[var(--ink-muted)]">
          {doc.info?.title ?? "API"} {doc.info?.version ? `· v${doc.info.version}` : null}
          . Generated from the fetcher OpenAPI document. Requests use{" "}
          <code className="text-sm text-[var(--accent)]">/api/proxy</code> (same
          origin as this app).
        </p>
        {doc.info?.description ? (
          <p className="max-w-3xl whitespace-pre-wrap text-sm text-[var(--ink-muted)]">
            {doc.info.description}
          </p>
        ) : null}
      </header>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <aside className="lg:w-72 lg:shrink-0">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[var(--ink-muted)]">
              Filter operations
            </span>
            <input
              type="search"
              placeholder="path, method, summary…"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--ink)] outline-none ring-[var(--accent)] transition focus:ring-2"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <nav
            className="mt-4 max-h-[60vh] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[var(--shadow)] lg:max-h-[calc(100vh-12rem)]"
            aria-label="Operations"
          >
            <ul className="flex flex-col gap-0.5">
              {filtered.map((op) => {
                const id = opId(op.method, op.path);
                const active = id === selectedId;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${active
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "text-[var(--ink)] hover:bg-[var(--bg-elevated)]"
                        }`}
                    >
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${methodColor(op.method)}`}
                      >
                        {op.method}
                      </span>
                      <span className="min-w-0 truncate font-mono text-xs">
                        {op.path}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          {selected ? (
            <>
              <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-1 text-xs font-bold uppercase ${methodColor(selected.method)}`}
                  >
                    {selected.method}
                  </span>
                  <code className="text-base text-[var(--ink)]">
                    {selected.path}
                  </code>
                </div>
                {selected.operation.summary ? (
                  <h2 className="font-display mt-3 text-xl font-semibold text-[var(--ink)]">
                    {selected.operation.summary}
                  </h2>
                ) : null}
                {selected.operation.description ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ink-muted)]">
                    {selected.operation.description}
                  </p>
                ) : null}

                {pathParams.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">
                      Path parameters
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                      <table className="w-full min-w-[480px] text-left text-sm">
                        <thead className="border-b border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--ink-muted)]">
                          <tr>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Required</th>
                            <th className="px-3 py-2 font-medium">Description</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pathParams.map((p) => (
                            <tr
                              key={p.name}
                              className="border-b border-[var(--border)] last:border-0"
                            >
                              <td className="px-3 py-2 font-mono text-[var(--accent)]">
                                {p.name}
                              </td>
                              <td className="px-3 py-2">
                                {p.required ? "yes" : "no"}
                              </td>
                              <td className="max-w-xs px-3 py-2 text-[var(--ink-muted)]">
                                {p.description ?? "—"}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="w-full min-w-[8rem] rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 font-mono text-xs outline-none ring-[var(--accent)] focus:ring-2"
                                  value={pathValues[p.name] ?? ""}
                                  onChange={(e) =>
                                    setPathValues((s) => ({
                                      ...s,
                                      [p.name]: e.target.value,
                                    }))
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {queryParams.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">
                      Query parameters
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead className="border-b border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--ink-muted)]">
                          <tr>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Required</th>
                            <th className="px-3 py-2 font-medium">Description</th>
                            <th className="px-3 py-2 font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {queryParams.map((p) => (
                            <tr
                              key={p.name}
                              className="border-b border-[var(--border)] last:border-0"
                            >
                              <td className="px-3 py-2 font-mono text-[var(--accent)]">
                                {p.name}
                              </td>
                              <td className="px-3 py-2">
                                {p.required ? "yes" : "no"}
                              </td>
                              <td className="max-w-md px-3 py-2 text-[var(--ink-muted)]">
                                {p.description ?? "—"}
                              </td>
                              <td className="px-3 py-2">
                                {(p.enum?.length ?? p.schema?.enum?.length) ? (
                                  <select
                                    className="w-full max-w-xs rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs outline-none ring-[var(--accent)] focus:ring-2"
                                    value={queryValues[p.name] ?? ""}
                                    onChange={(e) =>
                                      setQueryValues((s) => ({
                                        ...s,
                                        [p.name]: e.target.value,
                                      }))
                                    }
                                  >
                                    <option value="">—</option>
                                    {(p.enum ?? p.schema?.enum ?? []).map(
                                      (opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                ) : (
                                  <input
                                    className="w-full min-w-[10rem] rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 font-mono text-xs outline-none ring-[var(--accent)] focus:ring-2"
                                    value={queryValues[p.name] ?? ""}
                                    onChange={(e) =>
                                      setQueryValues((s) => ({
                                        ...s,
                                        [p.name]: e.target.value,
                                      }))
                                    }
                                  />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {selected.operation.responses &&
                  Object.keys(selected.operation.responses).length > 0 ? (
                  <div className="mt-6">
                    <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">
                      Responses
                    </h3>
                    <ul className="space-y-1 text-sm text-[var(--ink-muted)]">
                      {Object.entries(selected.operation.responses).map(
                        ([code, r]) => (
                          <li key={code}>
                            <code className="text-[var(--accent)]">{code}</code>{" "}
                            — {r.description ?? "—"}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : null}
              </section>

              <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
                <h3 className="font-display text-lg font-semibold text-[var(--ink)]">
                  Try request
                </h3>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Sends a browser <code className="text-xs">fetch</code> to this
                  app&apos;s proxy. Ensure{" "}
                  <code className="text-xs">FETCHER_PROXY_TARGET</code> points to
                  your API.
                </p>

                <form onSubmit={onTry} className="mt-4 flex flex-col gap-4">
                  {usesBody(selected.method) &&
                  selected.operation.requestBody?.content?.["application/json"] ? (
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-[var(--ink)]">
                          JSON body
                        </span>
                        {bodyExamples.length > 1 ? (
                          <select
                            className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs outline-none"
                            value={bodyExampleKey ?? ""}
                            onChange={(e) => onPickExample(e.target.value)}
                          >
                            {bodyExamples.map((ex) => (
                              <option key={ex.key} value={ex.key}>
                                {ex.summary ?? ex.key}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </div>
                      <textarea
                        className="h-64 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-xs text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
                        spellCheck={false}
                        value={bodyText}
                        onChange={(e) => setBodyText(e.target.value)}
                      />
                    </div>
                  ) : null}

                  <button
                    type="submit"
                    disabled={tryLoading}
                    className="w-fit rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  >
                    {tryLoading ? "Sending…" : "Send request"}
                  </button>
                </form>

                {tryError ? (
                  <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                    {tryError}
                  </p>
                ) : null}

                {tryStatus === null ? null : (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-[var(--ink)]">
                      Status:{" "}
                      <code
                        className={
                          tryStatus >= 200 && tryStatus < 300
                            ? "text-emerald-600"
                            : "text-rose-600"
                        }
                      >
                        {tryStatus}
                      </code>
                    </p>
                    <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 font-mono text-xs text-[var(--ink)]">
                      {tryBody}
                    </pre>
                  </div>
                )}
              </section>
            </>
          ) : (
            <p className="text-[var(--ink-muted)]">Select an operation.</p>
          )}
        </main>
      </div>
    </div>
  );
}

function opId(method: HttpMethod, path: string): string {
  return `${method}:${path}`;
}
