import ajv from "./ajv.js";
import common from "./schemas/common_fields.json" with { type: "json" };
import kp from "./schemas/knowledge_product.json" with { type: "json" };

// registra el schema base (para que el $ref resuelva)
ajv.addSchema(common);

const validators = {
  knowledge_product: ajv.compile(kp),
  kp: ajv.compile(kp), // alias corto opcional
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
