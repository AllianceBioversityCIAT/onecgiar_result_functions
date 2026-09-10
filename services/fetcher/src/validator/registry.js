import ajv from "./ajv.js";
import { validateInnovationUseMds } from "./innovation-use-mds.js";
import common from "./schemas/common_fields.json" with { type: "json" };
import kp from "./schemas/knowledge_product.json" with { type: "json" };
import cs from "./schemas/capacity_sharing.json" with { type: "json" };
import id from "./schemas/innovation_development.json" with { type: "json" };
import iu from "./schemas/innovation_use.json" with { type: "json" };
import oo from "./schemas/other_output.json" with { type: "json" };
import oc from "./schemas/other_outcome.json" with { type: "json" };
import pc from "./schemas/policy_change.json" with { type: "json" };

ajv.addSchema(common);

const validators = {
  knowledge_product: ajv.compile(kp),
  kp: ajv.compile(kp),
  capacity_sharing: ajv.compile(cs),
  cs: ajv.compile(cs),
  innovation_development: ajv.compile(id),
  id: ajv.compile(id),
  innovation_use: ajv.compile(iu),
  iu: ajv.compile(iu),
  other_output: ajv.compile(oo),
  oo: ajv.compile(oo),
  other_outcome: ajv.compile(oc),
  oc: ajv.compile(oc),
  policy_change: ajv.compile(pc),
  pc: ajv.compile(pc),
};

/**
 * Completeness gates that run once a type's schema is satisfied.
 *
 * Kept out of the schemas because these are rules about whether a result says enough to be
 * reported, not about the shape of the JSON — and because expressing "exactly one of a positive
 * amount or an explicit not-yet-known" in draft-07 produces an error a producer cannot act on.
 */
const minimumDataSets = {
  innovation_use: validateInnovationUseMds,
  iu: validateInnovationUseMds,
};

export function validateByType(type, data) {
  const v = validators[type];
  if (!v) {
    return { ok: false, errors: [`Unknown result type '${type}'`] };
  }
  const valid = v(data);
  if (!valid) {
    const errors = (v.errors || []).map((e) => {
      let message = `${e.instancePath || "(root)"} ${e.message}`;
      
      // Add more context for enum errors
      if (e.keyword === "enum" && e.params && e.params.allowedValues) {
        message += `. Allowed values: ${JSON.stringify(e.params.allowedValues)}`;
      }
      
      // Add context for required field errors
      if (e.keyword === "required" && e.params && e.params.missingProperty) {
        message += `. Missing required property: ${e.params.missingProperty}`;
      }
      
      // Add context for minimum items
      if (e.keyword === "minItems" && e.params) {
        message += `. Minimum required: ${e.params.limit}`;
      }
      
      return {
        path: e.instancePath || "(root)",
        message: e.message,
        keyword: e.keyword,
        params: e.params,
        fullMessage: message,
      };
    });
    
    // Return both detailed errors and simplified string messages for backward compatibility
    return { 
      ok: false, 
      errors: errors.map(e => e.fullMessage),
      detailedErrors: errors,
    };
  }

  // Only after the shape holds: the minimum-data-set rules read fields the schema has already
  // type-checked, and running them on a payload that failed above would bury the real error
  // under complaints about fields the caller has not written yet.
  const mds = minimumDataSets[type];
  if (mds) {
    const complete = mds(data);
    if (!complete.ok) return complete;
  }

  return { ok: true, data };
}
