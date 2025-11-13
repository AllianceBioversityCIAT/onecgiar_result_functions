"use client";

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export interface FiltersState {
  code: string;
  title: string;
  center: string;
  submitter: string;
  creator: string;
}

interface FilterPanelProps {
  filters: FiltersState;
  onFilterChange: (key: keyof FiltersState, value: string) => void;
  rowsPerPage: number;
  onRowsPerPageChange: (value: number) => void;
  showingFrom: number;
  showingTo: number;
  filteredCount: number;
  onReset: () => void;
}

const FILTER_CONFIG: Array<{
  key: keyof FiltersState;
  label: string;
  placeholder: string;
}> = [
  { key: "code", label: "Result code", placeholder: "e.g. 6423" },
  { key: "title", label: "Title contains", placeholder: "Search by title" },
  { key: "center", label: "Lead center", placeholder: "e.g. ICARDA" },
  { key: "submitter", label: "Submitted by", placeholder: "Search submitter" },
  { key: "creator", label: "Created by", placeholder: "Search creator" },
];

export function FilterPanel({
  filters,
  onFilterChange,
  rowsPerPage,
  onRowsPerPageChange,
  showingFrom,
  showingTo,
  filteredCount,
  onReset,
}: FilterPanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Dynamic filters
            </p>
            <p className="text-sm text-slate-500">
              Showing {showingFrom} - {showingTo} of {filteredCount}{" "}
              {filteredCount === 1 ? "match" : "matches"}
            </p>
          </div>
          <div className="flex flex-1 items-center justify-end gap-3 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              <select
                className="rounded-md border border-slate-200 px-2 py-1 focus:border-emerald-500 focus:outline-none"
                value={rowsPerPage}
                onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
              >
                {ROWS_PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="text-xs font-semibold uppercase tracking-wide text-emerald-600 hover:text-emerald-500"
              onClick={onReset}
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 px-6 pb-4 pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {FILTER_CONFIG.map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1">
            <label
              className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              htmlFor={`${key}Filter`}
            >
              {label}
            </label>
            <input
              id={`${key}Filter`}
              type="text"
              value={filters[key]}
              onChange={(e) => onFilterChange(key, e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
