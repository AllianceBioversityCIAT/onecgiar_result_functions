import ajv from "./ajv.js";
import common from "./schemas/common_fields.json" with { type: "json" };
import kp from "./schemas/knowledge_product.json" with { type: "json" };
import cs from "./schemas/capacity_sharing.json" with { type: "json" };

ajv.addSchema(common);

const validators = {
  knowledge_product: ajv.compile(kp),
  kp: ajv.compile(kp),
  capacity_sharing: ajv.compile(cs),
  cs: ajv.compile(cs),
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
