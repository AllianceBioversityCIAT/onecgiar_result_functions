"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SubmitEventHandler,
} from "react";
import {
  DEFAULT_PHASE_YEAR,
  PHASE_YEAR_OPTIONS,
  RESULT_TYPE_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
} from "../lib/result-constants";
import { buildResultQueryString, type FilterState } from "../lib/build-query";
import type { ResultListPayload, ResultRow } from "../lib/types";

const defaultFilters = (): FilterState => ({
  page: 1,
  size: 25,
  year: DEFAULT_PHASE_YEAR,
  centerAcronym: "",
  resultCode: "",
  resultType: [],
  /** Quality Assessed (status_id 2) — default scope for the explorer */
  statusId: [2],
  source: [],
});

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatLeadingResult(lr: ResultRow["leading_result"]): string {
  if (lr == null || typeof lr !== "object") return "Not defined";
  const ac = typeof lr.acronym === "string" ? lr.acronym.trim() : "";
  const nm = typeof lr.name === "string" ? lr.name.trim() : "";
  if (!ac && !nm) return "Not defined";
  if (ac && nm) return `${ac} · ${nm}`;
  return ac || nm;
}

/** Avoid String(object) → "[object Object]" for API error payloads */
function serializeApiMessage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.description ?? value.toString();
  if (typeof value === "function") {
    return value.name ? `Function: ${value.name}` : "Function";
  }
  return null;
}

export function ResultsExplorer() {
  const [filters, setFilters] = useState<FilterState>(() => defaultFilters());
  const [payload, setPayload] = useState<ResultListPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");

  const fetchResults = useCallback(async (f: FilterState) => {
    const qs = buildResultQueryString(f);
    setLoading(true);
    setError(null);
    setLastQuery(qs);
    try {
      const res = await fetch(`/api/proxy/result?${qs}`, {
        headers: { Accept: "application/json" },
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          res.ok
            ? "Response was not valid JSON"
            : `HTTP ${res.status}: ${text.slice(0, 200)}`,
        );
      }
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        if (typeof json === "object" && json !== null && "message" in json) {
          const fromBody = serializeApiMessage(
            (json as { message: unknown }).message,
          );
          if (fromBody !== null) msg = fromBody;
        }
        throw new Error(msg);
      }
      const body = json as Partial<ResultListPayload>;
      setPayload({
        data: Array.isArray(body.data) ? body.data : [],
        total: Number(body.total) || 0,
        page: Number(body.page) || f.page,
        size: Number(body.size) || f.size,
        totalPages: Number(body.totalPages) || 0,
      });
    } catch (e) {
      setPayload(null);
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchResults(defaultFilters());
  }, [fetchResults]);

  const onSubmit: SubmitEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    const next = { ...filters, page: 1 };
    setFilters(next);
    void fetchResults(next);
  };

  const reset = () => {
    const fresh = defaultFilters();
    setFilters(fresh);
    void fetchResults(fresh);
  };

  const goPage = (page: number) => {
    const next = { ...filters, page };
    setFilters(next);
    void fetchResults(next);
  };

  const changeSize = (size: number) => {
    const next = { ...filters, size, page: 1 };
    setFilters(next);
    void fetchResults(next);
  };

  const toggleResultType = (value: string) => {
    setFilters((s) => ({
      ...s,
      resultType: s.resultType.includes(value)
        ? s.resultType.filter((x) => x !== value)
        : [...s.resultType, value],
    }));
  };

  const toggleStatus = (value: number) => {
    setFilters((s) => ({
      ...s,
      statusId: s.statusId.includes(value)
        ? s.statusId.filter((x) => x !== value)
        : [...s.statusId, value],
    }));
  };

  const toggleSource = (value: string) => {
    setFilters((s) => ({
      ...s,
      source: s.source.includes(value)
        ? s.source.filter((x) => x !== value)
        : [...s.source, value],
    }));
  };

  const statusLabel = useCallback((id?: number) => {
    if (id == null) return "—";
    return STATUS_OPTIONS.find((o) => o.value === id)?.label ?? String(id);
  }, []);

  const pageInfo = useMemo(() => {
    if (!payload) return null;
    const { page, totalPages, total, size } = payload;
    const from = total === 0 ? 0 : (page - 1) * size + 1;
    const to = Math.min(page * size, total);
    return { page, totalPages, total, from, to };
  }, [payload]);

  const renderTableBody = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan={9} className="px-4 py-16 text-center">
            <span className="inline-flex items-center gap-2 text-[var(--ink-muted)]">
              <span
                className="size-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"
                aria-hidden
              /> Loading results…
            </span>
          </td>
        </tr>
      );
    }
    if (!payload || payload.data.length === 0) {
      return (
        <tr>
          <td
            colSpan={9}
            className="px-4 py-14 text-center text-[var(--ink-muted)]"
          >
            No data to show. Adjust filters or ensure the fetcher service is
            running.
          </td>
        </tr>
      );
    }
    return payload.data.map((row: ResultRow, i: number) => (
      <tr
        key={`${row.result_code ?? i}-${i}`}
        className="border-b border-[var(--border)]/70 transition hover:bg-[var(--bg-elevated)]/50"
      >
        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-medium text-[var(--accent)]">
          {row.result_code ?? "—"}
        </td>
        <td className="max-w-xs px-4 py-3 text-[var(--ink)]">
          <span className="line-clamp-2" title={row.result_title ?? ""}>
            {row.result_title ?? "—"}
          </span>
        </td>
        <td className="max-w-[200px] px-4 py-3 text-[var(--ink-muted)]">
          <span
            className="line-clamp-2 text-sm"
            title={formatLeadingResult(row.leading_result)}
          >
            {formatLeadingResult(row.leading_result)}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">
          {row.indicator_category?.name ?? "—"}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          {row.year ?? "—"}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-[var(--ink)]">
              {row.source_definition ?? row.source ?? "—"}
            </span>
            {row.source_definition && row.source ? (
              <span className="text-xs text-[var(--ink-muted)]">
                {row.source}
              </span>
            ) : null}
          </div>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-[var(--ink-muted)]">
          {row.obj_status?.status_name ?? statusLabel(row.status_id)}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--ink-muted)]">
          {formatDate(row.last_update_at)}
        </td>
        <td className="px-4 py-3">
          {row.prms_link ? (
            <a
              href={row.prms_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Open
            </a>
          ) : (
            "—"
          )}
        </td>
      </tr>
    ));
  };

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 border-b border-[var(--border)] pb-8">
        <p className="text-sm font-medium tracking-wide text-[var(--accent)]">
          CGIAR · PRMS
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          Results explorer
        </h1>
        <p className="max-w-2xl text-base text-[var(--ink-muted)]">
          Live query against the fetcher{" "}
          <code className="rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 text-sm text-[var(--accent)]">
            GET /result
          </code>{" "}
          endpoint (proxied via{" "}
          <code className="text-sm text-[var(--ink-muted)]">/api/proxy</code>
          ). Start the fetcher service and set{" "}
          <code className="text-sm">FETCHER_PROXY_TARGET</code> if it is not
          running at{" "}
          <code className="text-sm">127.0.0.1:3000</code>.
        </p>
      </header>

      <section
        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]"
        aria-labelledby="filters-heading"
      >
        <h2
          id="filters-heading"
          className="font-display mb-5 text-lg font-semibold text-[var(--ink)]"
        >
          Filters
        </h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--ink-muted)]">Year</span>
              <select
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--ink)] outline-none ring-[var(--accent)] transition focus:ring-2"
                value={filters.year}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, year: e.target.value }))
                }
              >
                {PHASE_YEAR_OPTIONS.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--ink-muted)]">
                Center (acronym)
              </span>
              <input
                type="text"
                placeholder="ABC"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 uppercase outline-none ring-[var(--accent)] transition focus:ring-2"
                value={filters.centerAcronym}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, centerAcronym: e.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--ink-muted)]">
                Result code
              </span>
              <input
                type="text"
                placeholder="Code"
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 outline-none ring-[var(--accent)] transition focus:ring-2"
                value={filters.resultCode}
                onChange={(e) =>
                  setFilters((s) => ({ ...s, resultCode: e.target.value }))
                }
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-[var(--ink-muted)]">
              Source (W1/W2 vs W3/Bilateral)
            </p>
            <div className="flex flex-wrap gap-2">
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleSource(opt.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${filters.source.includes(opt.value)
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--ink-muted)] hover:border-[var(--ink-muted)]"
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-[var(--ink-muted)]">
              Status (statusId)
            </p>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleStatus(opt.value)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition sm:text-sm ${filters.statusId.includes(opt.value)
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--ink-muted)] hover:border-[var(--ink-muted)]"
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-[var(--ink-muted)]">
              Result type
            </p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <div className="flex flex-wrap gap-2">
                {RESULT_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleResultType(opt.value)}
                    className={`rounded-md border px-2 py-1 text-xs transition ${filters.resultType.includes(opt.value)
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-transparent bg-[var(--surface)] text-[var(--ink-muted)] hover:border-[var(--border)]"
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-5">
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "Loading…" : "Apply filters"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm font-medium text-[var(--ink-muted)] transition hover:bg-[var(--bg-elevated)]"
            >
              Clear and search
            </button>
            {lastQuery ? (
              <span className="text-xs text-[var(--ink-muted)]">
                Query:{" "}
                <code className="break-all rounded bg-[var(--bg-elevated)] px-1">
                  {lastQuery}
                </code>
              </span>
            ) : null}
          </div>
        </form>
      </section>

      <section
        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"
        aria-labelledby="table-heading"
      >
        <div className="flex flex-col gap-4 border-b border-[var(--border)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="table-heading"
              className="font-display text-lg font-semibold text-[var(--ink)]"
            >
              Results
            </h2>
            {pageInfo ? (
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                {pageInfo.total === 0
                  ? "No rows"
                  : `${pageInfo.from}–${pageInfo.to} of ${pageInfo.total}`}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Click &quot;Apply filters&quot; to load data.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-[var(--ink-muted)]">
              Per page <select
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[var(--ink)] outline-none"
                value={filters.size}
                onChange={(e) => changeSize(Number(e.target.value))}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error ? (
          <div
            className="m-5 rounded-lg border border-[var(--warn)]/30 bg-orange-50 px-4 py-3 text-sm text-[var(--warn)]"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]/80">
                <th className="px-4 py-3 font-semibold text-[var(--ink-muted)]">
                  Code
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--ink-muted)]">
                  Title
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--ink-muted)]">
                  Leading result
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--ink-muted)]">
                  Type
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--ink-muted)]">
                  Year
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--ink-muted)]">
                  Source
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--ink-muted)]">
                  Status
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--ink-muted)]">
                  Updated
                </th>
                <th className="px-4 py-3 font-semibold text-[var(--ink-muted)]">
                  PRMS
                </th>
              </tr>
            </thead>
            <tbody>{renderTableBody()}</tbody>
          </table>
        </div>

        {payload && payload.totalPages > 1 ? (
          <footer className="flex flex-col items-center justify-between gap-4 border-t border-[var(--border)] p-5 sm:flex-row">
            <p className="text-sm text-[var(--ink-muted)]">
              Page{" "}
              <strong className="text-[var(--ink)]">{payload.page}</strong> of{" "}
              <strong className="text-[var(--ink)]">{payload.totalPages}</strong>
            </p>
            <nav
              className="flex flex-wrap items-center gap-2"
              aria-label="Pagination"
            >
              <button
                type="button"
                disabled={payload.page <= 1 || loading}
                onClick={() => goPage(1)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                First
              </button>
              <button
                type="button"
                disabled={payload.page <= 1 || loading}
                onClick={() => goPage(payload.page - 1)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={payload.page >= payload.totalPages || loading}
                onClick={() => goPage(payload.page + 1)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                Next
              </button>
              <button
                type="button"
                disabled={payload.page >= payload.totalPages || loading}
                onClick={() => goPage(payload.totalPages)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                Last
              </button>
            </nav>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
