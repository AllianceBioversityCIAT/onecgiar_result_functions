import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({
  allErrors: true,
  removeAdditional: true,
  strict: false,
});
addFormats(ajv);

// Custom keyword: maxWords
ajv.addKeyword({
  keyword: "maxWords",
  type: "string",
  errors: true,
  metaSchema: { type: "integer", minimum: 1 },
  validate(limit, data) {
    if (typeof data !== "string") return true;
    const words = data.trim().split(/\s+/).filter(Boolean);
    return words.length <= limit;
  },
});

export default ajv;
