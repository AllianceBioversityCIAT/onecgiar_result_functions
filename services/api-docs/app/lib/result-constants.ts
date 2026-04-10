/** Phase years available in the results explorer filter */
export const PHASE_YEAR_OPTIONS = [2022, 2023, 2024, 2025] as const;

export const DEFAULT_PHASE_YEAR = "2025";

export const RESULT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "policy_change", label: "Policy change" },
  { value: "innovation_use", label: "Innovation use" },
  { value: "capacity_change", label: "Capacity change" },
  { value: "other_outcome", label: "Other outcome" },
  {
    value: "capacity_sharing_for_development",
    label: "Capacity sharing for development",
  },
  { value: "knowledge_product", label: "Knowledge product" },
  { value: "innovation_development", label: "Innovation development" },
  { value: "other_output", label: "Other output" },
  { value: "impact_contribution", label: "Impact contribution" },
  { value: "innovation_use_ipsr", label: "Innovation Use (IPSR)" },
];

export const STATUS_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Editing" },
  { value: 2, label: "Quality Assessed" },
  { value: 3, label: "Submitted" },
  { value: 4, label: "Discontinued" },
  { value: 5, label: "Pending Review" },
  { value: 6, label: "Approved" },
  { value: 7, label: "Rejected" },
];

export const SOURCE_OPTIONS = [
  { value: "W1/W2", label: "W1/W2 (Result)" },
  { value: "W3/Bilateral", label: "W3/Bilateral (API)" },
] as const;
