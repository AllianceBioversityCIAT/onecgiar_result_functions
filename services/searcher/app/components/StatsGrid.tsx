'use client';

interface StatSummary {
  label: string;
  value: string;
}

interface StatsGridProps {
  stats: StatSummary[];
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stats.map((stat) => (
        <article key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">{stat.label}</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{stat.value}</p>
        </article>
      ))}
    </section>
  );
}
