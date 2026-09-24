import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateByType } from "../src/validator/registry.js";
import { validInnovationUse } from "./fixtures/innovation-use.mjs";

/**
 * Driven through `validateByType` rather than the gate directly: what matters is that an
 * incomplete row is refused on the path `/ingest` actually takes, with the errors a caller
 * gets back in `rejected[]`.
 */
function validate(data) {
  return validateByType("innovation_use", data);
}

/** Asserts the row was refused, and that the complaint is about the field under test. */
function refusedAt(data, pathFragment) {
  const result = validate(data);
  assert.equal(result.ok, false, "expected the row to be rejected");
  const matching = result.errors.filter((e) => e.includes(pathFragment));
  assert.ok(
    matching.length > 0,
    `expected an error mentioning '${pathFragment}', got: ${JSON.stringify(result.errors)}`,
  );
  return matching;
}

describe("innovation use minimum data set", () => {
  it("accepts a complete row", () => {
    assert.equal(validate(validInnovationUse()).ok, true);
  });

  describe("bilateral project investment", () => {
    it("accepts a positive amount", () => {
      const data = validInnovationUse();
      data.contributing_bilateral_projects = [
        { grant_title: "Seed Adoption Initiative", usd_budget: 1 },
      ];
      assert.equal(validate(data).ok, true);
    });

    it("accepts an amount that is yet to be determined", () => {
      const data = validInnovationUse();
      data.contributing_bilateral_projects = [
        { grant_title: "Innovation Monitoring Fund", is_determined: true },
      ];
      assert.equal(validate(data).ok, true);
    });

    it("accepts an identified project with no budget", () => {
      const data = validInnovationUse();
      data.contributing_bilateral_projects = [{ grant_title: "Unfunded grant" }];
      assert.equal(validate(data).ok, true);
    });

    it("accepts a zero amount as an unspecified budget", () => {
      const data = validInnovationUse();
      data.contributing_bilateral_projects = [
        { grant_title: "Zeroed grant", usd_budget: 0 },
      ];
      assert.equal(validate(data).ok, true);
    });

    it("still requires at least one identified bilateral project", () => {
      const data = validInnovationUse();
      data.contributing_bilateral_projects = [];
      refusedAt(data, "/contributing_bilateral_projects");
    });

    it("still requires grant_title on each bilateral project", () => {
      const data = validInnovationUse();
      data.contributing_bilateral_projects = [{}];
      refusedAt(data, "/contributing_bilateral_projects/0");
    });

    it("refuses an amount and the to-be-determined flag together", () => {
      const data = validInnovationUse();
      data.contributing_bilateral_projects = [
        { grant_title: "Contradictory grant", usd_budget: 5000, is_determined: true },
      ];
      const [error] = refusedAt(data, "/contributing_bilateral_projects/0");
      assert.match(error, /not both/);
    });

    it("names the grant with contradictory budget data", () => {
      const data = validInnovationUse();
      data.contributing_bilateral_projects = [
        { grant_title: "Funded", usd_budget: 5000 },
        { grant_title: "Contradictory", usd_budget: 5000, is_determined: true },
      ];
      const errors = refusedAt(data, "/contributing_bilateral_projects/1");
      assert.equal(errors.length, 1);
    });

    it("leaves the rule to Innovation Use alone", () => {
      // Other types share contributing_bilateral_projects but not the gate: the schema keeps
      // budget optional for them, and this asserts the gate did not leak across types.
      const data = validInnovationUse();
      delete data.innovation_use;
      data.other_output = {};
      data.contributing_bilateral_projects = [{ grant_title: "Unfunded grant" }];
      assert.equal(validateByType("other_output", data).ok, true);
    });
  });

  describe("innovation use level", () => {
    it("accepts a row with no level", () => {
      const data = validInnovationUse();
      delete data.innovation_use.innovation_use_level;
      assert.equal(validate(data).ok, true);
    });

    it("accepts a null level as omitted", () => {
      const data = validInnovationUse();
      data.innovation_use.innovation_use_level = null;
      assert.equal(validate(data).ok, true);
    });

    it("refuses a level object carrying neither half", () => {
      const data = validInnovationUse();
      data.innovation_use.innovation_use_level = {};
      refusedAt(data, "/innovation_use/innovation_use_level");
    });

    it("accepts a level identified by name alone", () => {
      const data = validInnovationUse();
      data.innovation_use.innovation_use_level = { name: "Scaling" };
      assert.equal(validate(data).ok, true);
    });

    it("accepts a level identified by code alone", () => {
      const data = validInnovationUse();
      data.innovation_use.innovation_use_level = { level: 2 };
      assert.equal(validate(data).ok, true);
    });
  });

  describe("measures", () => {
    it("refuses a row with no measures", () => {
      const data = validInnovationUse();
      delete data.innovation_use.current_innovation_use_numbers.measures;
      refusedAt(data, "/current_innovation_use_numbers/measures");
    });

    it("refuses an empty measures array", () => {
      const data = validInnovationUse();
      data.innovation_use.current_innovation_use_numbers.measures = [];
      refusedAt(data, "/current_innovation_use_numbers/measures");
    });

    it("refuses a measure with no quantity", () => {
      const data = validInnovationUse();
      data.innovation_use.current_innovation_use_numbers.measures = [
        { unit_of_measure: "Hectares" },
      ];
      refusedAt(data, "/measures/0/quantity");
    });

    it("refuses a measure whose unit is blank", () => {
      const data = validInnovationUse();
      data.innovation_use.current_innovation_use_numbers.measures = [
        { unit_of_measure: "   ", quantity: 12 },
      ];
      refusedAt(data, "/measures/0/unit_of_measure");
    });

    it("accepts a quantity of 0 — measured, and the answer is none", () => {
      const data = validInnovationUse();
      data.innovation_use.current_innovation_use_numbers.measures = [
        { unit_of_measure: "Hectares", quantity: 0 },
      ];
      assert.equal(validate(data).ok, true);
    });

    it("accepts a whole-number quantity", () => {
      // Regression: quantity used to be oneOf [string, integer, number], which every integer
      // matched twice and so failed as 'must match exactly one schema in oneOf'.
      const data = validInnovationUse();
      data.innovation_use.current_innovation_use_numbers.measures = [
        { unit_of_measure: "# of Innovations", quantity: 7 },
      ];
      assert.equal(validate(data).ok, true);
    });

    it("accepts one complete measure alongside others", () => {
      const data = validInnovationUse();
      data.innovation_use.current_innovation_use_numbers.measures = [
        { unit_of_measure: "Hectares", quantity: "1500.5" },
        { unit_of_measure: "# of Innovations", quantity: 2 },
      ];
      assert.equal(validate(data).ok, true);
    });
  });

  describe("actors", () => {
    it("requires actors when the numbers are not to be determined", () => {
      const data = validInnovationUse();
      delete data.innovation_use.current_innovation_use_numbers.actors;
      refusedAt(data, "/current_innovation_use_numbers/actors");
    });

    it("refuses an empty actors list the same way as a missing one", () => {
      const data = validInnovationUse();
      data.innovation_use.current_innovation_use_numbers.actors = [];
      refusedAt(data, "/current_innovation_use_numbers/actors");
    });

    it("waives actors when the numbers are to be determined", () => {
      const data = validInnovationUse();
      data.innovation_use.current_innovation_use_numbers = {
        innov_use_to_be_determined: true,
        measures: [{ unit_of_measure: "# of Innovations", quantity: 1 }],
      };
      assert.equal(validate(data).ok, true);
    });

    it("still requires a measure when the numbers are to be determined", () => {
      const data = validInnovationUse();
      data.innovation_use.current_innovation_use_numbers = {
        innov_use_to_be_determined: true,
      };
      refusedAt(data, "/current_innovation_use_numbers/measures");
    });
  });

  it("reports every gap at once, so a producer fixes the row in one pass", () => {
    const data = validInnovationUse();
    delete data.innovation_use.innovation_use_level;
    delete data.innovation_use.current_innovation_use_numbers.actors;
    delete data.innovation_use.current_innovation_use_numbers.measures;
    data.contributing_bilateral_projects = [{ grant_title: "Unfunded grant" }];

    const result = validate(data);
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 2);
    for (const error of result.detailedErrors) {
      assert.equal(error.keyword, "mds");
    }
  });
});
