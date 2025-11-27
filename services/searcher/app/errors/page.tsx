"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { ErrorModal } from "@/app/components/ErrorModal";

interface ErrorFile {
  key: string;
  lastModified: string;
  size: number;
}

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    fetchErrors();
  }, []);

  const fetchErrors = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/errors");
      if (!response.ok) throw new Error("Failed to fetch errors");
      const data = await response.json();
      setErrors(data.errors || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchErrorDetail = async (key: string) => {
    try {
      setLoadingDetail(true);
      const response = await fetch(`/api/errors?key=${encodeURIComponent(key)}`);
      if (!response.ok) throw new Error("Failed to fetch error details");
      const data = await response.json();
      setSelectedError(data);
    } catch (err) {
      console.error("Error fetching details:", err);
      alert("Failed to load error details");
    } finally {
      setLoadingDetail(false);
    }
  };

  const extractJobId = (key: string) => {
    const match = key.match(/errors\/([^/]+)\.json/);
    return match ? match[1] : key;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const filteredErrors = errors.filter((err) =>
    extractJobId(err.key).toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) return <div className="p-8">Loading errors...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 pt-24 sm:pt-28">
      <PageHeader onRefresh={fetchErrors} />
      <main className="mx-auto w-full max-w-480 space-y-8 px-10 py-12">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Pipeline Errors</h1>
          <p className="mt-2 text-slate-600">
            Browse and investigate processing errors from the S3 error bucket
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Total Errors</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{errors.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Filtered</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{filteredErrors.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Latest</p>
            <p className="mt-1 text-sm text-slate-900">
              {errors[0] ? formatDate(errors[0].lastModified) : "N/A"}
            </p>
          </div>
        </div>

        {/* Filter */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label htmlFor="filter" className="block text-sm font-medium text-slate-700">
            Filter by Job ID
          </label>
          <input
            id="filter"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Enter job ID or part of it..."
            className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        {/* Errors Table */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="text-lg font-semibold text-slate-900">Error Files</h3>
            <p className="text-sm text-slate-500">
              Click on any row to view detailed error information
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Job ID</th>
                  <th className="px-6 py-3">Last Modified</th>
                  <th className="px-6 py-3">Size</th>
                  <th className="px-6 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredErrors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                      No errors found
                    </td>
                  </tr>
                ) : (
                  filteredErrors.map((err) => {
                    const jobId = extractJobId(err.key);
                    return (
                      <tr
                        key={err.key}
                        className="cursor-pointer hover:bg-slate-50/60"
                        onClick={() => fetchErrorDetail(err.key)}
                      >
                        <td className="px-6 py-4">
                          <code className="rounded bg-slate-100 px-2 py-1 text-xs font-mono text-slate-800">
                            {jobId}
                          </code>
                        </td>
                        <td className="px-6 py-4">{formatDate(err.lastModified)}</td>
                        <td className="px-6 py-4">{formatSize(err.size)}</td>
                        <td className="px-6 py-4">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchErrorDetail(err.key);
                            }}
                            className="rounded-md bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Modal */}
      <ErrorModal
        isOpen={!!selectedError}
        onClose={() => setSelectedError(null)}
        errorData={selectedError}
      />

      {/* Loading overlay for detail fetch */}
      {loadingDetail && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
          <div className="rounded-lg bg-white px-6 py-4 shadow-xl">
            <p className="text-sm font-medium text-slate-700">Loading error details...</p>
          </div>
        </div>
      )}
    </div>
  );
}
