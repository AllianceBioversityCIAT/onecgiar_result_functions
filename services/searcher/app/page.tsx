"use client";

import { useEffect, useMemo, useState } from "react";
import { FilterPanel, FiltersState } from "@/app/components/FilterPanel";
import { HeroSection } from "@/app/components/HeroSection";
import { PageHeader } from "@/app/components/PageHeader";
import { ResultsTable } from "@/app/components/ResultsTable";
import { StatsGrid } from "@/app/components/StatsGrid";
import { DisplayResult } from "@/app/types/results";

interface Result {
  id: string;
  indexed_at?: string;
  data?: {
    title?: string;
    description?: string;
    created_date?: string;
    result_type_id?: number;
    result_level_id?: number;
    [key: string]: any;
  };
  input_raw?: {
    data?: {
      submitted_by?: {
        name?: string;
      };
      created_by?: {
        name?: string;
      };
    };
  };
  external_api_raw?: {
    response?: {
      result_code?: string;
      title?: string;
      result_center_array?: Array<Record<string, any>>;
      [key: string]: any;
    };
  };
}

const DEFAULT_ROWS_PER_PAGE = 10;

export default function Home() {
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [titleFilter, setTitleFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [centerFilter, setCenterFilter] = useState("");
  const [submitterFilter, setSubmitterFilter] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE);

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const response = await fetch("/api/search?size=50");
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const displayResults: DisplayResult[] = useMemo(() => {
    return results.map((result) => {
      const response = result.external_api_raw?.response ?? {};
      const leadCenter =
        response.result_center_array?.find(
          (center: any) => center?.is_leading_result
        )?.clarisa_center_object?.clarisa_institution?.acronym || "N/A";
      const submittedBy = result.input_raw?.data?.submitted_by?.name || "N/A";
      const createdBy = result.input_raw?.data?.created_by?.name || "N/A";

      return {
        id: String(response.id || result.id || "N/A"),
        resultCode: String(response.result_code || "N/A"),
        title: String(response.title || "N/A"),
        leadCenter,
        submittedBy,
        createdBy,
      };
    });
  }, [results]);

  const leadCentersCount = useMemo(() => {
    const centers = new Set<string>();
    displayResults.forEach((item) => {
      if (item.leadCenter && item.leadCenter !== "N/A") {
        centers.add(item.leadCenter);
      }
    });
    return centers.size;
  }, [displayResults]);

  const filteredResults = useMemo(() => {
    const titleQuery = titleFilter.trim().toLowerCase();
    const codeQuery = codeFilter.trim().toLowerCase();
    const centerQuery = centerFilter.trim().toLowerCase();
    const submitterQuery = submitterFilter.trim().toLowerCase();
    const creatorQuery = creatorFilter.trim().toLowerCase();

    return displayResults.filter((item) => {
      const titleMatches = titleQuery
        ? item.title.toLowerCase().includes(titleQuery)
        : true;
      const codeMatches = codeQuery
        ? item.resultCode.toLowerCase().includes(codeQuery)
        : true;
      const centerMatches = centerQuery
        ? item.leadCenter.toLowerCase().includes(centerQuery)
        : true;
      const submitterMatches = submitterQuery
        ? item.submittedBy.toLowerCase().includes(submitterQuery)
        : true;
      const creatorMatches = creatorQuery
        ? item.createdBy.toLowerCase().includes(creatorQuery)
        : true;

      return (
        titleMatches &&
        codeMatches &&
        centerMatches &&
        submitterMatches &&
        creatorMatches
      );
    });
  }, [
    displayResults,
    titleFilter,
    codeFilter,
    centerFilter,
    submitterFilter,
    creatorFilter,
  ]);

  const stats = useMemo(
    () => [
      { label: "Indexed results", value: results.length.toLocaleString() },
      {
        label: "Matching filters",
        value: filteredResults.length.toLocaleString(),
      },
      { label: "Lead centers", value: leadCentersCount.toLocaleString() },
    ],
    [results.length, filteredResults.length, leadCentersCount]
  );

  const lastIndexed = useMemo(() => {
    const timestamps = results
      .map((item) =>
        item.indexed_at ? new Date(item.indexed_at).getTime() : null
      )
      .filter((value): value is number => value !== null);
    if (!timestamps.length) return null;
    return new Date(Math.max(...timestamps)).toLocaleString();
  }, [results]);

  const resetFilters = () => {
    setTitleFilter("");
    setCodeFilter("");
    setCenterFilter("");
    setSubmitterFilter("");
    setCreatorFilter("");
  };

  const filtersState: FiltersState = useMemo(
    () => ({
      code: codeFilter,
      title: titleFilter,
      center: centerFilter,
      submitter: submitterFilter,
      creator: creatorFilter,
    }),
    [codeFilter, titleFilter, centerFilter, submitterFilter, creatorFilter]
  );

  const handleFilterChange = (key: keyof FiltersState, value: string) => {
    switch (key) {
      case "code":
        setCodeFilter(value);
        break;
      case "title":
        setTitleFilter(value);
        break;
      case "center":
        setCenterFilter(value);
        break;
      case "submitter":
        setSubmitterFilter(value);
        break;
      case "creator":
        setCreatorFilter(value);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    titleFilter,
    codeFilter,
    centerFilter,
    submitterFilter,
    creatorFilter,
    rowsPerPage,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredResults.length / rowsPerPage)
  );

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedResults = filteredResults.slice(
    startIndex,
    startIndex + rowsPerPage
  );
  const showingFrom = filteredResults.length === 0 ? 0 : startIndex + 1;
  const showingTo =
    filteredResults.length === 0 ? 0 : startIndex + paginatedResults.length;

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-slate-50 pt-24 sm:pt-28">
      <PageHeader onRefresh={fetchResults} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <HeroSection lastIndexed={lastIndexed} />
        <StatsGrid stats={stats} />
        <FilterPanel
          filters={filtersState}
          onFilterChange={handleFilterChange}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={setRowsPerPage}
          showingFrom={showingFrom}
          showingTo={showingTo}
          filteredCount={filteredResults.length}
          onReset={resetFilters}
        />
        <ResultsTable
          results={paginatedResults}
          filteredCount={filteredResults.length}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevious={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          onNext={() =>
            setCurrentPage((prev) => Math.min(prev + 1, totalPages))
          }
        />
      </main>
    </div>
  );
}
