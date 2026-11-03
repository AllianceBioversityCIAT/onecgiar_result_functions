import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ResultResponseMapper } from "../src/mappers/response-result.mjs";

/**
 * `phase_id` is the PRMS reporting phase id (`obj_version.id`), the same value the links
 * carry in `?phase=`. Consumers (STAR) build deep links to any PRMS section with it, so it
 * must always agree with the links — and `year` alone is not enough: one year can map to
 * more than one phase (2025 holds phases 6 and 7).
 */
const baseDoc = (overrides = {}) => ({
  result_code: "31035",
  status_id: "1",
  created_date: "2026-09-30T11:15:54.882Z",
  last_updated_date: "2026-09-30T11:23:38.866Z",
  is_active: true,
  title: "Phase id test",
  ...overrides,
});

describe("ResultResponseMapper phase_id", () => {
  it("exposes obj_version.id as a number, next to year", () => {
    const r = new ResultResponseMapper(
      baseDoc({ obj_version: { id: "8", phase_year: 2026, phase_name: "Reporting 2026" } }),
    );
    assert.equal(r.phase_id, 8);
    assert.equal(r.year, 2026);
  });

  it("tells apart two phases of the same year", () => {
    const six = new ResultResponseMapper(baseDoc({ obj_version: { id: "6", phase_year: 2025 } }));
    const seven = new ResultResponseMapper(baseDoc({ obj_version: { id: "7", phase_year: 2025 } }));
    assert.equal(six.year, seven.year);
    assert.notEqual(six.phase_id, seven.phase_id);
  });

  it("agrees with the ?phase= of the computed links", () => {
    const r = new ResultResponseMapper(baseDoc({ obj_version: { id: "8", phase_year: 2026 } }));
    assert.match(r.pdf_link, /\?phase=8$/);
    assert.match(r.prms_link, /\?phase=8$/);
  });

  it("falls back to the same default the links use when obj_version is missing", () => {
    const r = new ResultResponseMapper(baseDoc());
    assert.equal(r.phase_id, 6);
    assert.match(r.prms_link, /\?phase=6$/);
  });
});
