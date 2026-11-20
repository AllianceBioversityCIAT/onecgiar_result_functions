import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prepareResults } from "../src/ingest/batch.mjs";
import { EvidencesMapper } from "../src/mappers/response-result.mjs";
import { validInnovationUse } from "./fixtures/innovation-use.mjs";

const CONTEXT = {
  tenant: "prms.result-management.api",
  opDefault: "create",
  nowIso: "2026-02-11T09:00:00.000Z",
  requestId: "evidence-is-public-test",
};

/**
 * P2-4110 — each evidence item may carry `is_public` (boolean | null). The Fetcher validates
 * with `removeAdditional: true`, so a key missing from the schema is stripped silently before
 * Reporting sees it: `false` would arrive as "untagged", which PRMS treats as public.
 */
function ingest(evidence) {
  const data = validInnovationUse();
  data.external_reference = "STAR-EVP-1";
  data.evidence = evidence;
  return prepareResults([{ type: "innovation_use", data }], CONTEXT);
}

const LINK = "https://cgiar.sharepoint.com/x";

describe("evidence is_public", () => {
  it("keeps is_public:false on the payload Reporting receives", () => {
    const { accepted, rejected } = ingest([
      { link: LINK, description: "Contract", is_public: false },
    ]);
    assert.equal(rejected.length, 0, JSON.stringify(rejected));
    assert.deepEqual(accepted[0].data.evidence, [
      { link: LINK, description: "Contract", is_public: false },
    ]);
  });

  it("keeps true and null", () => {
    const { accepted, rejected } = ingest([
      { link: "https://a.org/1", is_public: true },
      { link: "https://a.org/2", is_public: null },
    ]);
    assert.equal(rejected.length, 0, JSON.stringify(rejected));
    assert.equal(accepted[0].data.evidence[0].is_public, true);
    assert.equal(accepted[0].data.evidence[1].is_public, null);
  });

  it("rejects a non-boolean is_public with an error on that field", () => {
    const { accepted, rejected } = ingest([
      { link: LINK, is_public: "no" },
    ]);
    assert.equal(accepted.length, 0);
    assert.equal(rejected.length, 1);
    assert.match(JSON.stringify(rejected), /is_public/);
  });

  it("accepts an item without is_public, unchanged", () => {
    const { accepted, rejected } = ingest([
      { link: "https://a.org/1", description: "d" },
    ]);
    assert.equal(rejected.length, 0, JSON.stringify(rejected));
    assert.deepEqual(accepted[0].data.evidence, [
      { link: "https://a.org/1", description: "d" },
    ]);
  });

  it("EvidencesMapper returns false, true and null as stored", () => {
    const out = EvidencesMapper.fromArray([
      { link: "a", description: "x", is_public: false },
      { link: "b", description: "y", is_public: true },
      { link: "c", description: "z", is_public: null },
    ]);
    assert.deepEqual(
      out.map((e) => e.is_public),
      [false, true, null],
    );
  });

  it("EvidencesMapper maps a missing is_public to null", () => {
    const [e] = EvidencesMapper.fromArray([{ link: "a" }]);
    assert.equal(e.is_public, null);
  });
});
