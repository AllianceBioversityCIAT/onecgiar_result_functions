/**
 * Bilateral result types (same order / labels as GET /sync OpenAPI enum).
 * Used by the scheduled cron to sync all types in sequence.
 */
export const BILATERAL_RESULT_TYPES = Object.freeze([
  "Policy change",
  "Innovation use",
  "Other outcome",
  "Capacity sharing for development",
  "Knowledge product",
  "Innovation development",
  "Other output",
  "Impact contribution",
  "Innovation Package",
]);
