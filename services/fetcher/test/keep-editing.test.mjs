import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prepareResults } from "../src/ingest/batch.mjs";
import { validInnovationUse } from "./fixtures/innovation-use.mjs";

const CONTEXT = {
  tenant: "prms.result-management.api",
  opDefault: "create",
  nowIso: "2026-02-11T09:00:00.000Z",
  requestId: "keep-editing-test",
};

/**
 * P2-3428 — `keep_editing` asks Reporting to create the result in 'editing' instead of
 * 'pending review', so the reporting user finishes it in PRMS.
 *
 * The field travels **inside `data`**, per result. That is not a preference, it is what the
 * transport allows: the ingest handler rebuilds the envelope as `{tenant, op, jobId, results}`
 * (`src/server.mjs:154`) and drops every other top-level key, so a batch-level flag is gone
 * before the validator ever sees it.
 *
 * What these tests pin down is the pass-through: `ExternalApiClient.sendResult` forwards only
 * `{type, data, idempotencyKey, tenant, op, received_at}`, so a flag that does not survive into
 * `accepted[i].data` never reaches Reporting at all — and the feature fails silently, which is
 * the failure mode this whole field was introduced to avoid.
 */
function row(data) {
  return { type: "innovation_use", data };
}

describe("keep_editing", () => {
  it("carries the flag through to the payload Reporting receives", () => {
    const data = validInnovationUse();
    data.external_reference = "STAR-KEEPEDIT-1";
    data.keep_editing = true;

    const { accepted, rejected } = prepareResults([row(data)], CONTEXT);

    assert.equal(rejected.length, 0, JSON.stringify(rejected));
    assert.equal(accepted.length, 1);
    assert.equal(
      accepted[0].data.keep_editing,
      true,
      "the flag must survive inside `data` — that object is the whole payload Reporting gets",
    );
  });

  it("defaults to absent, which Reporting reads as pending review", () => {
    const data = validInnovationUse();
    data.external_reference = "STAR-KEEPEDIT-2";

    const { accepted, rejected } = prepareResults([row(data)], CONTEXT);

    assert.equal(rejected.length, 0, JSON.stringify(rejected));
    assert.equal(accepted[0].data.keep_editing, undefined);
  });

  it("accepts an explicit false without changing anything else", () => {
    const data = validInnovationUse();
    data.external_reference = "STAR-KEEPEDIT-3";
    data.keep_editing = false;

    const { accepted, rejected } = prepareResults([row(data)], CONTEXT);

    assert.equal(rejected.length, 0, JSON.stringify(rejected));
    assert.equal(accepted[0].data.keep_editing, false);
  });

  /**
   * Before the schema declared it, `keep_editing: "definitely-not-a-boolean"` was forwarded
   * verbatim — the schemas set `additionalProperties: true`, so nothing stripped or checked it.
   * Declaring the field is what turns that into an error the producer can act on, at the hop
   * that knows which row failed.
   */
  it("rejects a non-boolean instead of forwarding it", () => {
    const data = validInnovationUse();
    data.external_reference = "STAR-KEEPEDIT-4";
    data.keep_editing = "definitely-not-a-boolean";

    const { accepted, rejected } = prepareResults([row(data)], CONTEXT);

    assert.equal(accepted.length, 0);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].external_reference, "STAR-KEEPEDIT-4");
    assert.ok(
      rejected[0].errors.some((e) => e.includes("keep_editing")),
      `expected a keep_editing error, got: ${JSON.stringify(rejected[0].errors)}`,
    );
  });
});
