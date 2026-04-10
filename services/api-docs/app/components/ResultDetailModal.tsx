"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { ResultDetail } from "../lib/types";

type Props = {
  resultCode: string | null;
  onClose: () => void;
};

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display mt-8 border-b border-[var(--border)] pb-2 text-base font-semibold text-[var(--ink)] first:mt-0">
      {children}
    </h3>
  );
}

function Dl({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="mt-3 grid gap-2 sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-x-4">
      {rows.map(({ label, value }) => (
        <div key={label} className="contents">
          <dt className="text-sm font-medium text-[var(--ink-muted)]">{label}</dt>
          <dd className="text-sm text-[var(--ink)]">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

const DAC_AXIS_LABELS: Record<string, string> = {
  gender: "Gender",
  climate_change: "Climate change",
  nutrition: "Nutrition",
  environmental_biodiversity: "Environmental & biodiversity",
  poverty: "Poverty",
};

function humanizeDacKey(key: string): string {
  return (
    DAC_AXIS_LABELS[key] ??
    key
      .replaceAll(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function isDacScoresRecord(
  v: unknown,
): v is Record<
  string,
  { tag_title?: string; impact_area_names?: string[] }
> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return false;
  return entries.every(([, val]) => {
    if (val === null || typeof val !== "object" || Array.isArray(val)) {
      return false;
    }
    const o = val as Record<string, unknown>;
    return (
      o.tag_title === undefined ||
      typeof o.tag_title === "string" ||
      o.tag_title === null
    );
  });
}

function DacScoresBlock({ value }: { value: unknown }): ReactNode {
  if (value === undefined || value === null) return "—";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (isDacScoresRecord(value)) {
    const keys = Object.keys(value).sort();
    if (keys.length === 0) return "—";
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {keys.map((axis) => {
          const row = value[axis];
          const title =
            typeof row?.tag_title === "string" ? row.tag_title : "—";
          const areas = Array.isArray(row?.impact_area_names)
            ? row.impact_area_names.filter(
                (x): x is string => typeof x === "string" && x.trim() !== "",
              )
            : [];
          return (
            <div
              key={axis}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/60 p-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                {humanizeDacKey(axis)}
              </p>
              <p className="mt-1.5 text-sm font-medium text-[var(--ink)]">
                {title}
              </p>
              {areas.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-xs text-[var(--ink-muted)]">
                  {areas.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  try {
    return (
      <pre className="max-h-48 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  } catch {
    return "—";
  }
}

/** Lower = earlier in list. Primary submitter first, then contributor, then rest. */
function tocAlignmentSortKey(initiativeRole: unknown): number {
  if (initiativeRole === 1 || initiativeRole === "1") return 0;
  if (initiativeRole === 2 || initiativeRole === "2") return 1;
  if (
    typeof initiativeRole === "object" &&
    initiativeRole !== null &&
    "name" in initiativeRole &&
    typeof (initiativeRole as { name: unknown }).name === "string"
  ) {
    const n = (initiativeRole as { name: string }).name.toLowerCase();
    if (n.includes("primary")) return 0;
    if (n.includes("contributor")) return 1;
    return 2;
  }
  const s = String(initiativeRole ?? "").toLowerCase();
  if (s.includes("primary")) return 0;
  if (s.includes("contributor")) return 1;
  return 2;
}

export function ResultDetailModal({ resultCode, onClose }: Props) {
  const [detail, setDetail] = useState<ResultDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (code: string) => {
    setLoading(true);
    setLoadError(null);
    setDetail(null);
    try {
      const res = await fetch(`/api/proxy/result/${encodeURIComponent(code)}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(
          res.ok ? "Invalid JSON" : `HTTP ${res.status}: ${text.slice(0, 120)}`,
        );
      }
      if (!res.ok) {
        const msg =
          typeof json === "object" &&
          json !== null &&
          "message" in json &&
          typeof (json as { message: unknown }).message === "string"
            ? (json as { message: string }).message
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (json === null) {
        setDetail(null);
        return;
      }
      setDetail(json as ResultDetail);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!resultCode) return;
    void load(resultCode);
  }, [resultCode, load]);

  useEffect(() => {
    if (!resultCode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resultCode, onClose]);

  if (!resultCode) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-detail-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(92vh,900px)] w-full max-w-3xl flex-col rounded-t-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] sm:rounded-[var(--radius)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--accent)]">
              Result detail
            </p>
            <h2
              id="result-detail-title"
              className="font-display truncate text-xl font-semibold text-[var(--ink)]"
            >
              {loading
                ? `Code ${resultCode}`
                : detail?.result_title
                  ? detail.result_title
                  : `Code ${resultCode}`}
            </h2>
            {detail?.prms_link ? (
              <a
                href={detail.prms_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Open in PRMS
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--ink-muted)] transition hover:bg-[var(--bg-elevated)]"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-12 text-center text-[var(--ink-muted)]">
              Loading…
            </p>
          ) : loadError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
              {loadError}
            </p>
          ) : detail === null && !loadError ? (
            <p className="py-12 text-center text-[var(--ink-muted)]">
              No result found for code{" "}
              <code className="text-[var(--accent)]">{resultCode}</code>.
            </p>
          ) : detail ? (
            <>
              <SectionTitle>General information</SectionTitle>
              <Dl
                rows={[
                  {
                    label: "Code",
                    value: detail.result_code ?? resultCode,
                  },
                  {
                    label: "Primary entity",
                    value:
                      detail.primary_entity &&
                      (detail.primary_entity.name ||
                        detail.primary_entity.official_code)
                        ? [
                            detail.primary_entity.name,
                            detail.primary_entity.official_code
                              ? `(${detail.primary_entity.official_code})`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")
                        : "—",
                  },
                  {
                    label: "Title",
                    value: detail.result_title ?? "—",
                  },
                  {
                    label: "Description",
                    value: detail.description ? (
                      <span className="whitespace-pre-wrap">
                        {detail.description}
                      </span>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    label: "Lead contact",
                    value: detail.lead_contact_person ?? "—",
                  },
                  {
                    label: "DAC scores",
                    value: <DacScoresBlock value={detail.dac_scores} />,
                  },
                ]}
              />

              <SectionTitle>Contributors &amp; partners</SectionTitle>
              <div className="mt-3 space-y-4 text-sm">
                <div>
                  <p className="font-medium text-[var(--ink-muted)]">
                    ToC alignment
                  </p>
                  {detail.toc_alignment && detail.toc_alignment.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc space-y-3 text-[var(--ink)]">
                      {[...detail.toc_alignment]
                        .sort(
                          (a, b) =>
                            tocAlignmentSortKey(a.initiative_role) -
                            tocAlignmentSortKey(b.initiative_role),
                        )
                        .map((toc, i) => (
                        <li key={i} className="list-none">
                          {toc.entity?.name || toc.entity?.official_code ? (
                            <p className="font-medium">
                              {toc.entity?.name ?? "—"}
                              {toc.entity?.official_code
                                ? ` · ${toc.entity.official_code}`
                                : ""}
                            </p>
                          ) : null}
                          {toc.initiative_role != null &&
                          toc.initiative_role !== "" ? (
                            <p className="text-xs text-[var(--ink-muted)]">
                              Role: {String(toc.initiative_role)}
                            </p>
                          ) : null}
                          {toc.toc_results && toc.toc_results.length > 0 ? (
                            <ul className="ml-3 mt-1 list-disc space-y-1 text-[var(--ink-muted)]">
                              {toc.toc_results.map((tr, j) => (
                                <li key={j}>
                                  {tr.result_name ?? "—"}
                                  {tr.level != null && tr.level !== ""
                                    ? ` · level ${String(tr.level)}`
                                    : ""}
                                  {tr.sub_entity?.official_code
                                    ? ` · ${tr.sub_entity.official_code}`
                                    : ""}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-[var(--ink-muted)]">—</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[var(--ink-muted)]">—</p>
                  )}
                </div>

                <div>
                  <p className="font-medium text-[var(--ink-muted)]">
                    Centers (contributing)
                  </p>
                  {detail.contributing_centers &&
                  detail.contributing_centers.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {detail.contributing_centers.map((c, i) => (
                        <li key={i}>
                          {c.acronym || c.name || c.code != null
                            ? `${c.acronym ? `${c.acronym} · ` : ""}${c.name ?? ""}${c.code != null ? ` (${c.code})` : ""}`
                            : "—"}
                          {c.is_lead ? (
                            <span className="ml-2 text-xs text-[var(--accent)]">
                              (lead)
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[var(--ink-muted)]">—</p>
                  )}
                </div>

                <div>
                  <p className="font-medium text-[var(--ink-muted)]">
                    Partners
                  </p>
                  {detail.contributing_partners &&
                  detail.contributing_partners.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {detail.contributing_partners.map((p, i) => (
                        <li key={i}>
                          {p.acronym || p.name
                            ? `${p.acronym ? `${p.acronym} · ` : ""}${p.name ?? ""}`
                            : p.code != null
                              ? String(p.code)
                              : "—"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[var(--ink-muted)]">—</p>
                  )}
                </div>

                <div>
                  <p className="font-medium text-[var(--ink-muted)]">
                    Bilateral projects
                  </p>
                  {detail.bilateral_projects &&
                  detail.bilateral_projects.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {detail.bilateral_projects.map((bp, i) => (
                        <li key={i}>
                          {typeof bp.short_name === "string"
                            ? bp.short_name
                            : typeof bp.grant_title === "string"
                              ? bp.grant_title
                              : JSON.stringify(bp)}
                          {typeof bp.organization_code === "string" ||
                          typeof bp.organization_code === "number"
                            ? ` · ${bp.organization_code}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[var(--ink-muted)]">—</p>
                  )}
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
                  <p className="font-display text-sm font-semibold text-[var(--ink)]">
                    Geographic location
                  </p>

                  <div className="mt-3 space-y-4">
                    <div className="rounded-lg border-l-4 border-[var(--accent)] bg-[var(--bg-elevated)]/50 py-3 pl-4 pr-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                        Geographic focus
                      </p>
                      {(() => {
                        const foc = detail.geographic_focus;
                        const name = foc?.name?.trim() || "";
                        const desc = foc?.description?.trim() || "";
                        return (
                          <>
                            <p className="mt-2 text-base font-semibold text-[var(--ink)]">
                              {name ? (
                                name
                              ) : desc ? (
                                desc
                              ) : (
                                <span className="text-sm font-normal text-[var(--ink-muted)]">
                                  No catalogue label on this document — see
                                  countries/regions if present.
                                </span>
                              )}
                            </p>
                            {name && desc && name !== desc ? (
                              <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                                {desc}
                              </p>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>

                    <div className="rounded-lg border-l-4 border-amber-700/60 bg-[var(--bg-elevated)]/50 py-3 pl-4 pr-3 dark:border-amber-500/50">
                      <p className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                        Regions
                      </p>
                      {detail.regions && detail.regions.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-sm text-[var(--ink)]">
                          {detail.regions.map((r, i) => (
                            <li key={`${r.code ?? ""}-${r.name ?? ""}-${i}`}>
                              {r.name ?? "—"}
                              {r.code != null ? ` (${r.code})` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--ink-muted)]">
                          —
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border-l-4 border-emerald-800/50 bg-[var(--bg-elevated)]/50 py-3 pl-4 pr-3 dark:border-emerald-500/50">
                      <p className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
                        Countries
                      </p>
                      {detail.countries && detail.countries.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-sm text-[var(--ink)]">
                          {detail.countries.map((c, i) => (
                            <li key={`${c.code ?? ""}-${c.name ?? ""}-${i}`}>
                              {c.name ?? "—"}
                              {c.code ? ` (${c.code})` : ""}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--ink-muted)]">
                          —
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <SectionTitle>Evidence</SectionTitle>
              {detail.evidences && detail.evidences.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {detail.evidences.map((ev, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-3"
                    >
                      {ev.link ? (
                        <a
                          href={ev.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                        >
                          {ev.link}
                        </a>
                      ) : (
                        <span className="text-sm text-[var(--ink-muted)]">
                          (no link)
                        </span>
                      )}
                      {ev.description ? (
                        <p className="mt-2 text-sm text-[var(--ink-muted)]">
                          {ev.description}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[var(--ink-muted)]">—</p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
