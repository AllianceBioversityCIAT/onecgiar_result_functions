import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({
  allErrors: true,
  removeAdditional: true,
  strict: false,
});
addFormats(ajv);

export default ajv;
