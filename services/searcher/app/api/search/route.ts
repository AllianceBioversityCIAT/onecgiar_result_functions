import { NextRequest, NextResponse } from "next/server";
import { searchOpenSearch } from "@/lib/opensearch";

const INDEX_PATTERN = "prms-results-management-api*";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const size = parseInt(searchParams.get("size") || "20");

    const index = INDEX_PATTERN;

    const query = {
      match_all: {},
    };

    const response = await searchOpenSearch(index, query, size);

    const results = response.hits.hits.map((hit: any) => ({
      id: hit._id,
      ...hit._source,
    }));

    return NextResponse.json({
      total: response.hits.total,
      results,
    });
  } catch (error) {
    console.error("OpenSearch search error:", error);
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
