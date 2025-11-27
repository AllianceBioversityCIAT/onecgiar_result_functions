"use client";

import { useState } from "react";
import { DisplayResult } from "@/app/types/results";

interface ResultsTableProps {
  results: DisplayResult[];
  fullResults: any[]; // Raw results from API
  filteredCount: number;
  currentPage: number;
  totalPages: number;
  sortField: "id" | "resultCode" | "uploadDate";
  sortDirection: "asc" | "desc";
  onSortChange: (field: "id" | "resultCode" | "uploadDate") => void;
  onPrevious: () => void;
  onNext: () => void;
}

export function ResultsTable({
  results,
  fullResults,
  filteredCount,
  currentPage,
  totalPages,
  sortField,
  sortDirection,
  onSortChange,
  onPrevious,
  onNext,
}: ResultsTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const disablePrevious = currentPage === 1;
  const disableNext = currentPage === totalPages;

  const copyToClipboard = async (result: any, id: string) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const renderSortButton = (
    label: string,
    field: "id" | "resultCode" | "uploadDate"
  ) => {
    const isActive = sortField === field;
    const arrow = isActive ? (sortDirection === "asc" ? "▲" : "▼") : "↕";

    return (
      <button
        type="button"
        onClick={() => onSortChange(field)}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${
          isActive ? "text-emerald-600" : "text-slate-600"
        }`}
      >
        {label}
        <span className="text-[10px]">{arrow}</span>
      </button>
    );
  };

  const formatUploadDate = (value: string) => {
    if (!value || value === "N/A") return "N/A";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toLocaleString();
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Synced results
            </h3>
            <p className="text-sm text-slate-500">
              Consolidated, real-time data streamed from OpenSearch.
            </p>
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
              <th className="px-6 py-3">{renderSortButton("Result ID", "id")}</th>
              <th className="px-6 py-3">
                {renderSortButton("Result code", "resultCode")}
              </th>
              <th className="px-6 py-3">Title</th>
              <th className="px-6 py-3">Lead center</th>
              <th className="px-6 py-3">Indicator type</th>
              <th className="px-6 py-3">
                {renderSortButton("Upload date", "uploadDate")}
              </th>
              <th className="px-6 py-3">Created by</th>
              <th className="px-6 py-3">Submitted by</th>
              <th className="px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {results.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-10 text-center text-slate-400"
                >
                  No results founds or they don&apos;t match your filters.
                </td>
              </tr>
            ) : (
              results.map((item, index) => {
                const fullResult = fullResults[index];
                const itemId = `${item.id}-${item.resultCode}`;
                const isCopied = copiedId === itemId;
                
                return (
                  <tr
                    key={itemId}
                    className="hover:bg-slate-50/60"
                  >
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {item.id}
                    </td>
                    <td className="px-6 py-4">{item.resultCode}</td>
                    <td className="px-6 py-4">{item.title}</td>
                    <td className="px-6 py-4">{item.leadCenter}</td>
                    <td className="px-6 py-4">{item.indicatorType}</td>
                    <td className="px-6 py-4">{formatUploadDate(item.uploadDate)}</td>
                    <td className="px-6 py-4">{item.createdName}</td>
                    <td className="px-6 py-4">{item.submitterName}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => copyToClipboard(fullResult, itemId)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                          isCopied
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                        title="Copy full JSON to clipboard"
                      >
                        {isCopied ? (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Copied!
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy JSON
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })
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
