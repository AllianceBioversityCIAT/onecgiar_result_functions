"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface PageHeaderProps {
  onRefresh: () => void;
}

export function PageHeader({ onRefresh }: PageHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-40 bg-slate-900/95 text-white shadow backdrop-blur">
      <div className="mx-auto flex w-full max-w-480 items-center justify-between gap-6 px-10 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-slate-300">
            Observability
          </p>
          <h1 className="text-xl font-semibold">Result Management API</h1>
        </div>
        <div className="flex items-center gap-3">
          <nav className="flex gap-2">
            <Link
              href="/"
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                pathname === "/"
                  ? "bg-white/10 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/5"
              }`}
            >
              Results
            </Link>
            <Link
              href="/errors"
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                pathname === "/errors"
                  ? "bg-red-500 text-white"
                  : "text-red-300 hover:text-white hover:bg-red-500/20"
              }`}
            >
              Errors
            </Link>
          </nav>
          <button
            className="rounded-md border border-white/30 px-4 py-2 text-sm font-medium text-white/90 transition hover:border-white hover:bg-white/10"
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}
