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
  const [sortField, setSortField] = useState<
    "id" | "resultCode" | "uploadDate"
  >("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

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
    const buildName = (person?: any) => {
      if (!person) return "N/A";
      const fullName = [person.first_name, person.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      return fullName || person.name || person.email || "N/A";
    };

    return results.map((result) => {
      const response = result.external_api_raw?.response ?? {};
      const leadCenter =
        response.result_center_array?.find(
          (center: any) => center?.is_leading_result
        )?.clarisa_center_object?.clarisa_institution?.acronym || "N/A";
      const indicatorType = response.obj_result_type?.name || "N/A";
      const createdName = buildName(response.obj_created);
      const submitterName = buildName(response.obj_external_submitter);
      const uploadDate = response.external_submitted_date || "N/A";

      return {
        id: String(response.id || result.id || "N/A"),
        resultCode: String(response.result_code || "N/A"),
        title: String(response.title || "N/A"),
        leadCenter,
        indicatorType,
        createdName,
        submitterName,
        uploadDate,
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
        ? item.submitterName.toLowerCase().includes(submitterQuery)
        : true;
      const creatorMatches = creatorQuery
        ? item.createdName.toLowerCase().includes(creatorQuery)
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

  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults];

    sorted.sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;

      const parseNumber = (value: string) => {
        const num = Number(value);
        return Number.isNaN(num) ? null : num;
      };

      if (sortField === "uploadDate") {
        const aTime =
          a.uploadDate && a.uploadDate !== "N/A" ? Date.parse(a.uploadDate) : 0;
        const bTime =
          b.uploadDate && b.uploadDate !== "N/A" ? Date.parse(b.uploadDate) : 0;
        return (aTime - bTime) * direction;
      }

      const aValue = sortField === "id" ? a.id : a.resultCode;
      const bValue = sortField === "id" ? b.id : b.resultCode;

      const aNum = parseNumber(aValue);
      const bNum = parseNumber(bValue);

      if (aNum !== null && bNum !== null) {
        return (aNum - bNum) * direction;
      }

      return aValue.localeCompare(bValue) * direction;
    });

    return sorted;
  }, [filteredResults, sortDirection, sortField]);

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

  const handleSortChange = (field: "id" | "resultCode" | "uploadDate") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
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
    sortField,
    sortDirection,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredResults.length / rowsPerPage)
  );

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedResults = sortedResults.slice(
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
      <main className="mx-auto w-full max-w-480 space-y-8 px-10 py-12">
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
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          onPrevious={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          onNext={() =>
            setCurrentPage((prev) => Math.min(prev + 1, totalPages))
          }
        />
      </main>
    </div>
  );
}
