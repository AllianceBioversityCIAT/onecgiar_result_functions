import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateByType } from "../src/validator/registry.js";
import { validInnovationUse } from "./fixtures/innovation-use.mjs";

/**
 * P2-4106: count_unit and use_nature on Innovation Use actors. The fetcher rejects only what
 * PRMS would also refuse with a 400 (unknown code, households without a total). Farmers-only and
 * missing-answer rules stay in PRMS, which returns them as outcomes[].warnings.
 */
function withActor(actor) {
  const data = validInnovationUse();
  data.innovation_use.current_innovation_use_numbers.actors = [actor];
  return validateByType("innovation_use", data);
}

const farmers = (extra) => ({ actor_type_id: 1, sex_and_age_disaggregation: true, how_many: 40, ...extra });

describe("innovation use actor follow-up answers", () => {
  it("accepts a row without the answers (producers that do not send them yet)", () => {
    assert.equal(withActor(farmers({})).ok, true);
  });

  it("accepts every allowed code, and empty values", () => {
    for (const count_unit of ["households", "individuals", "", null]) {
      for (const use_nature of ["information_received", "innovation_applied", "", null]) {
        assert.equal(withActor(farmers({ count_unit, use_nature })).ok, true, `${count_unit}/${use_nature}`);
      }
    }
  });

  it("leaves a code on a non-Farmers actor to PRMS (it ignores it and warns)", () => {
    assert.equal(withActor(farmers({ actor_type_id: 2, count_unit: "individuals" })).ok, true);
  });

  it("rejects an unknown count_unit, listing the allowed values", () => {
    const result = withActor(farmers({ count_unit: "Households" }));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("/actors/0/count_unit") && e.includes("individuals")), JSON.stringify(result.errors));
  });

  it("rejects an unknown use_nature", () => {
    const result = withActor(farmers({ use_nature: "applied" }));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("/actors/0/use_nature")), JSON.stringify(result.errors));
  });

  it("rejects households without a how_many total", () => {
    const actor = { actor_type_id: 1, sex_and_age_disaggregation: false, count_unit: "households", women: 5, men: 5 };
    const result = withActor(actor);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("how_many")), JSON.stringify(result.errors));
  });

  it("rejects households with an empty how_many", () => {
    assert.equal(withActor(farmers({ count_unit: "households", how_many: null })).ok, false);
  });

  it("accepts households with a breakdown as long as how_many is there (PRMS discards the breakdown)", () => {
    const actor = farmers({ count_unit: "households", sex_and_age_disaggregation: false, how_many: 500, women: 200, men: 300 });
    assert.equal(withActor(actor).ok, true);
  });
});
