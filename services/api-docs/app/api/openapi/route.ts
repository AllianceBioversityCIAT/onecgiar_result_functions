import { NextResponse } from "next/server";

const fetcherBase =
  process.env.FETCHER_PROXY_TARGET?.replace(/\/+$/, "") ??
  "http://127.0.0.1:3000";

/** Strip legacy paths if an older fetcher deployment still lists them. */
const OMIT_PATHS = ["/update/{id}", "/delete/{id}", "/sync"] as const;

/**
 * Proxies the fetcher OpenAPI JSON for the in-app reference UI.
 */
export async function GET() {
  try {
    const res = await fetch(`${fetcherBase}/openapi.json`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "Could not load OpenAPI from fetcher",
          fetcherStatus: res.status,
        },
        { status: 502 },
      );
    }
    const spec = (await res.json()) as Record<string, unknown>;
    const paths = spec.paths;
    if (paths && typeof paths === "object" && !Array.isArray(paths)) {
      const p = paths as Record<string, unknown>;
      for (const key of OMIT_PATHS) {
        delete p[key];
      }
    }
    return NextResponse.json(spec, {
      headers: {
        "Cache-Control":
          "private, no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "OpenAPI proxy failed. Start the fetcher and check FETCHER_PROXY_TARGET.",
      },
      { status: 502 },
    );
  }
}
