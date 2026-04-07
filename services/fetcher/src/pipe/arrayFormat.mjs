import { isEmpty } from "../mappers/response-result.mjs";

export const arrayFormat = (value) => {
  if (isEmpty(value)) {
    return value;
  }
  if (typeof value === "string") {
    const result = [];
    const rawValues = value.split(",").map((item) => item.trim());
    for (const rawValue of rawValues) {
      if (isEmpty(rawValue)) {
        continue;
      }
      result.push(rawValue);
    }
    return result;
  }

  if (Array.isArray(value)) {
    return value.map((item) => item.trim());
  }

  return value;
};
