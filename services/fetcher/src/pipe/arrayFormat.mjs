import { isEmpty } from "../mappers/response-result.mjs";

export const arrayFormat = (value) => {
  if (isEmpty(value)) {
    return value;
  }
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim());
  }

  if (Array.isArray(value)) {
    return value.map((item) => item.trim());
  }

  return value;
};
