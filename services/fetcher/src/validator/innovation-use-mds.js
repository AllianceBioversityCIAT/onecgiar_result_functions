/**
 * Innovation Use minimum data set (P2-3428, P2-3785, P2-3819).
 *
 * Mirrors the gate the bilateral server applies before a result can be submitted, so an
 * external producer hears about an incomplete row here — in the same `rejected[]` entry as a
 * shape error — instead of after the payload has been offloaded, forwarded to Reporting and
 * indexed. Reporting stays the authoritative validator; this is the earlier, clearer answer,
 * not a replacement for it.
 *
 * Division of labour with innovation_use.json: the schema declares *shape* (what type each
 * field is), this file owns *completeness* (which of them an Innovation Use cannot go without).
 * Keeping the two apart is what stops one missing field from being reported twice, in two
 * different vocabularies — `validateByType` only reaches this gate once the schema is happy.
 */

const IU = "/innovation_use";
const NUMBERS = `${IU}/current_innovation_use_numbers`;
const MEASURES = `${NUMBERS}/measures`;
const BILATERALS = "/contributing_bilateral_projects";

function isFilled(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * A quantity of 0 is a real answer — "we measured, and it is none" — so what counts is that a
 * number was supplied, not that it is truthy. Numeric strings are accepted because the schema
 * lets quantity arrive as one.
 */
function isNumeric(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (isFilled(value)) return Number.isFinite(Number(value));
  return false;
}

function isPositiveAmount(value) {
  return isNumeric(value) && Number(value) > 0;
}

function error(path, message) {
  return {
    path,
    message,
    keyword: "mds",
    params: { mds: "innovation_use" },
    fullMessage: `${path} ${message}`,
  };
}

/**
 * Actors are the count the indicator is built on, so they are required unless the producer has
 * explicitly said the numbers are not known yet. `innov_use_to_be_determined` is that statement,
 * and only an explicit `true` waives the requirement: an absent flag is not a claim.
 */
function checkActors(numbers, errors) {
  if (numbers?.innov_use_to_be_determined === true) return;

  const actors = numbers?.actors;
  if (!Array.isArray(actors) || actors.length === 0) {
    errors.push(
      error(
        `${NUMBERS}/actors`,
        "is required unless 'innov_use_to_be_determined' is true: list at least one actor",
      ),
    );
  }
}

/**
 * Optional. When current use is known and a producer supplies measures, at least one row must
 * carry both parts of a valid pair. When the use is marked TBD, the measure list is not applicable.
 */
function checkMeasures(numbers, errors) {
  const measures = numbers?.measures;

  if (!Array.isArray(measures) || measures.length === 0) return;

  const complete = measures.some(
    (measure) =>
      isFilled(measure?.unit_of_measure) && isNumeric(measure?.quantity),
  );
  if (complete) return;

  // Nothing qualified, so every entry is worth naming — pointing at the array alone would leave
  // the producer guessing which half of which measure it is missing.
  measures.forEach((measure, index) => {
    if (!isFilled(measure?.unit_of_measure)) {
      errors.push(
        error(`${MEASURES}/${index}/unit_of_measure`, "must not be blank"),
      );
    }
    if (!isNumeric(measure?.quantity)) {
      errors.push(
        error(`${MEASURES}/${index}/quantity`, "must be a number"),
      );
    }
  });
}

/** A positive amount and an explicit TBD flag are contradictory budget claims. */
function checkContradictoryBilateralInvestment(projects, errors) {
  if (!Array.isArray(projects)) return;

  projects.forEach((project, index) => {
    const path = `${BILATERALS}/${index}`;
    const hasAmount = isPositiveAmount(project?.usd_budget);
    const isDetermined = project?.is_determined === true;

    if (hasAmount && isDetermined) {
      errors.push(
        error(
          path,
          "must provide either a positive 'usd_budget' or 'is_determined': true, not both",
        ),
      );
      return;
    }

  });
}

/**
 * @returns {{ok: true} | {ok: false, errors: string[], detailedErrors: object[]}}
 *   The same two-shaped answer `validateByType` returns for a schema failure, so a caller — and
 *   the `rejected[]` entry it ends up in — cannot tell which of the two gates refused the row.
 */
export function validateInnovationUseMds(data) {
  const errors = [];
  const numbers = data?.innovation_use?.current_innovation_use_numbers;

  checkActors(numbers, errors);
  if (numbers?.innov_use_to_be_determined !== true) {
    checkMeasures(numbers, errors);
  }
  checkContradictoryBilateralInvestment(
    data?.contributing_bilateral_projects,
    errors,
  );

  if (errors.length === 0) return { ok: true };

  return {
    ok: false,
    errors: errors.map((e) => e.fullMessage),
    detailedErrors: errors,
  };
}
