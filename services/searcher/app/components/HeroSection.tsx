"use client";

interface HeroSectionProps {
  lastIndexed: string | null;
}

export function HeroSection({ lastIndexed }: HeroSectionProps) {
  return (
    <section className="rounded-2xl bg-linear-to-r from-emerald-500 via-sky-500 to-indigo-500 p-6 text-white shadow-lg">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-white/80">
            Realtime Snapshot
          </p>
          <h2 className="text-3xl font-bold">Results in OpenSearch</h2>
          <p className="mt-2 max-w-2xl text-white/90">
            Monitor every record synced from the Result Management API into
            OpenSearch, filter by code or title, and quickly identify who
            created or submitted each entry.
          </p>
        </div>
        <div className="rounded-xl bg-white/15 px-4 py-3 text-sm shadow-inner backdrop-blur">
          <p className="text-white/70">Latest indexing</p>
          <p className="text-lg font-semibold">
            {lastIndexed || "No timestamp found"}
          </p>
        </div>
      </div>
    </section>
  );
}
