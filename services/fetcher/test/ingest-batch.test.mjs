import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ingestOutcome, prepareResults } from "../src/ingest/batch.mjs";
import { innovationUseRow, validInnovationUse } from "./fixtures/innovation-use.mjs";

const CONTEXT = {
  tenant: "prms.result-management.api",
  opDefault: "create",
  nowIso: "2026-02-11T09:00:00.000Z",
  requestId: "test-request",
};

function incompleteInnovationUse() {
  const data = validInnovationUse();
  data.external_reference = "STAR-0002";
  delete data.innovation_use.innovation_use_level;
  return data;
}

describe("ingest batch", () => {
  it("keeps an incomplete innovation use out of the accepted rows", () => {
    const { accepted, rejected } = prepareResults(
      [innovationUseRow(incompleteInnovationUse())],
      CONTEXT,
    );

    assert.equal(accepted.length, 0, "an incomplete row must never reach Reporting");
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].index, 0);
    assert.equal(rejected[0].type, "innovation_use");
    assert.equal(rejected[0].external_reference, "STAR-0002");
    assert.ok(
      rejected[0].errors.some((e) => e.includes("innovation_use_level")),
      `expected the level error, got: ${JSON.stringify(rejected[0].errors)}`,
    );
    assert.equal(rejected[0].detailedErrors[0].keyword, "mds");
  });

  it("splits a mixed batch and keeps each row's position", () => {
    const complete = validInnovationUse();
    complete.external_reference = "STAR-0001";

    const { accepted, rejected } = prepareResults(
      [innovationUseRow(complete), innovationUseRow(incompleteInnovationUse())],
      CONTEXT,
    );

    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].type, "innovation_use");
    assert.equal(accepted[0].external_reference, "STAR-0001");
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].index, 1);
  });

  describe("batch verdict", () => {
    it("is 200 and ok only when the whole batch got through", () => {
      assert.deepEqual(ingestOutcome({ rejectedCount: 0, totalFailed: 0 }), {
        status: 200,
        ok: true,
        message: "All results processed successfully",
      });
    });

    it("is 207 and not ok when a row was rejected before processing", () => {
      // The case this change exists for: locally rejected rows used to leave the batch
      // reporting 200 / ok:true, so a caller never went looking in rejected[].
      const outcome = ingestOutcome({ rejectedCount: 1, totalFailed: 0 });
      assert.equal(outcome.status, 207);
      assert.equal(outcome.ok, false);
      assert.match(outcome.message, /1 rejected before processing/);
    });

    it("is 207 and not ok when Reporting refused a row", () => {
      const outcome = ingestOutcome({ rejectedCount: 0, totalFailed: 2 });
      assert.equal(outcome.status, 207);
      assert.equal(outcome.ok, false);
      assert.match(outcome.message, /2 failed during processing/);
    });

    it("names both when the batch lost rows on both sides", () => {
      const outcome = ingestOutcome({ rejectedCount: 1, totalFailed: 3 });
      assert.equal(outcome.status, 207);
      assert.equal(outcome.ok, false);
      assert.match(outcome.message, /1 rejected before processing and 3 failed during processing/);
    });
  });

  it("a mixed batch of innovation use rows answers 207", () => {
    const complete = validInnovationUse();
    const { accepted, rejected } = prepareResults(
      [innovationUseRow(complete), innovationUseRow(incompleteInnovationUse())],
      CONTEXT,
    );
    const outcome = ingestOutcome({
      rejectedCount: rejected.length,
      // Nothing failed downstream — the 207 comes from the local rejection alone.
      totalFailed: 0,
    });

    assert.equal(accepted.length, 1);
    assert.equal(outcome.status, 207);
    assert.equal(outcome.ok, false);
  });

  it("a batch with nothing left to send accepts nothing", () => {
    // server.mjs turns this into the 422 that a fully invalid batch still gets.
    const { accepted, rejected } = prepareResults(
      [innovationUseRow(incompleteInnovationUse())],
      CONTEXT,
    );
    assert.equal(accepted.length, 0);
    assert.equal(rejected.length, 1);
  });
});
