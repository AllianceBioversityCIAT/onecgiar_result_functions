import ajv from "./ajv.js";
import common from "./schemas/common_fields.json" with { type: "json" };
import kp from "./schemas/knowledge_product.json" with { type: "json" };
import cs from "./schemas/capacity_sharing.json" with { type: "json" };
import id from "./schemas/innovation_development.json" with { type: "json" };
import oo from "./schemas/other_output.json" with { type: "json" };

ajv.addSchema(common);

const validators = {
  knowledge_product: ajv.compile(kp),
  kp: ajv.compile(kp),
  capacity_sharing: ajv.compile(cs),
  cs: ajv.compile(cs),
  innovation_development: ajv.compile(id),
  id: ajv.compile(id),
  other_output: ajv.compile(oo),
  oo: ajv.compile(oo),
};

export function validateByType(type, data) {
  const v = validators[type];
  if (!v) {
    return { ok: false, errors: [`Unknown result type '${type}'`] };
  }
  const valid = v(data);
  if (!valid) {
    const errors = (v.errors || []).map(
      (e) => `${e.instancePath || "(root)"} ${e.message}`
    );
    return { ok: false, errors };
  }
  return { ok: true, data };
}
