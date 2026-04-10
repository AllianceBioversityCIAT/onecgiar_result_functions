import type { Metadata } from "next";
import Link from "next/link";
import { ApiReference } from "../components/ApiReference";

export const metadata: Metadata = {
  title: "API reference · PRMS Results",
  description:
    "Browse the fetcher OpenAPI document, parameters, and send try-it requests via the app proxy.",
};

export default function ReferencePage() {
  return (
    <>
      <nav className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
        >
          ← Results explorer
        </Link>
      </nav>
      <ApiReference />
    </>
  );
}
