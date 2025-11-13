'use client';

interface PageHeaderProps {
  onRefresh: () => void;
}

export function PageHeader({ onRefresh }: PageHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-slate-900/95 text-white shadow backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-300">Observability</p>
          <h1 className="text-xl font-semibold">Result Management API</h1>
        </div>
        <div className="flex gap-3">
          <button
            className="rounded-md border border-white/30 px-4 py-2 text-sm font-medium text-white/90 transition hover:border-white hover:bg-white/10"
            onClick={onRefresh}
          >
            Refresh data
          </button>
          <button className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400">
            Export view
          </button>
        </div>
      </div>
    </header>
  );
}
