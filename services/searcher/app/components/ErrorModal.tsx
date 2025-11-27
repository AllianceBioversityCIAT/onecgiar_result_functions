"use client";

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorData: any;
}

export function ErrorModal({ isOpen, onClose, errorData }: ErrorModalProps) {
  if (!isOpen || !errorData) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString();
  };

  const parseErrorMessage = () => {
    try {
      const msg = errorData.error?.message || "";
      const match = msg.match(/PRMS responded \d+: (.+)/);
      if (match) {
        return JSON.parse(match[1]);
      }
      return null;
    } catch {
      return null;
    }
  };

  const prmsError = parseErrorMessage();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-200 bg-gradient-to-r from-red-50 to-orange-50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Error Details</h2>
              <p className="text-sm text-slate-600">Job ID: {errorData.jobId}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-slate-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[calc(90vh-120px)] overflow-y-auto p-6">
          {/* Summary */}
          <div className="mb-6 grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timestamp</span>
              <p className="text-sm text-slate-900">{formatDate(errorData.timestamp)}</p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Original Key</span>
              <p className="truncate text-sm text-slate-900" title={errorData.originalKey}>
                {errorData.originalKey}
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Message ID</span>
              <p className="truncate text-sm text-slate-900">{errorData.messageId}</p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result Type</span>
              <p className="text-sm text-slate-900">{errorData.payload?.results?.[0]?.type || "N/A"}</p>
            </div>
          </div>

          {/* PRMS Validation Errors */}
          {prmsError && prmsError.rejected && (
            <div className="mb-6">
              <h3 className="mb-3 text-lg font-semibold text-slate-900">Validation Errors</h3>
              <div className="space-y-3">
                {prmsError.rejected.map((reject: any, idx: number) => (
                  <div key={idx} className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Index {reject.index}
                      </span>
                      <span className="text-sm font-medium text-slate-700">{reject.type}</span>
                    </div>
                    <ul className="space-y-1">
                      {reject.errors?.map((err: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-red-800">
                          <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          {err}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Stack */}
          {errorData.error && (
            <div className="mb-6">
              <h3 className="mb-3 text-lg font-semibold text-slate-900">Error Stack</h3>
              <div className="rounded-lg border border-slate-200 bg-slate-900 p-4">
                <pre className="overflow-x-auto text-xs text-slate-100">
                  {errorData.error.stack || errorData.error.message}
                </pre>
              </div>
            </div>
          )}

          {/* Payload Preview */}
          {errorData.payload && (
            <div>
              <h3 className="mb-3 text-lg font-semibold text-slate-900">Payload Preview</h3>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tenant</span>
                  <p className="text-sm text-slate-900">{errorData.payload.tenant}</p>
                </div>
                <div className="mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Operation</span>
                  <p className="text-sm text-slate-900">{errorData.payload.op}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</span>
                  <p className="text-sm text-slate-900">
                    {errorData.payload.results?.[0]?.data?.title || "N/A"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Full JSON */}
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700 hover:text-slate-900">
              View Full JSON
            </summary>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-900 p-4">
              <pre className="overflow-x-auto text-xs text-slate-100">
                {JSON.stringify(errorData, null, 2)}
              </pre>
            </div>
          </details>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-800 sm:w-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
