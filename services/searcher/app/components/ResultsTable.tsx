'use client';

import { DisplayResult } from '@/app/types/results';

interface ResultsTableProps {
  results: DisplayResult[];
  filteredCount: number;
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function ResultsTable({
  results,
  filteredCount,
  currentPage,
  totalPages,
  onPrevious,
  onNext,
}: ResultsTableProps) {
  const disablePrevious = currentPage === 1;
  const disableNext = currentPage === totalPages;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Synced results</h3>
            <p className="text-sm text-slate-500">Consolidated, real-time data streamed from OpenSearch.</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {filteredCount} active
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-3">Result ID</th>
              <th className="px-6 py-3">Result code</th>
              <th className="px-6 py-3">Title</th>
              <th className="px-6 py-3">Lead center</th>
              <th className="px-6 py-3">Submitted by</th>
              <th className="px-6 py-3">Created by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {results.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                  No results match your filters.
                </td>
              </tr>
            ) : (
              results.map((item) => (
                <tr key={`${item.id}-${item.resultCode}`} className="hover:bg-slate-50/60">
                  <td className="px-6 py-4 font-semibold text-slate-900">{item.id}</td>
                  <td className="px-6 py-4">{item.resultCode}</td>
                  <td className="px-6 py-4">{item.title}</td>
                  <td className="px-6 py-4">{item.leadCenter}</td>
                  <td className="px-6 py-4">{item.submittedBy}</td>
                  <td className="px-6 py-4">{item.createdBy}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          Page {currentPage} of {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-slate-200 px-3 py-1 font-medium text-slate-600 transition hover:border-emerald-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onPrevious}
            disabled={disablePrevious}
          >
            Previous
          </button>
          <button
            className="rounded-md border border-slate-200 px-3 py-1 font-medium text-slate-600 transition hover:border-emerald-500 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onNext}
            disabled={disableNext}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
