const SENSITIVE_KEYS = new Set([
  "x-api-key",
  "api_key",
  "apikey",
  "authorization",
  "password",
  "secret",
  "token",
]);

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 8;

/**
 * Returns a copy of `value` with credential-looking keys replaced by a placeholder.
 *
 * This is a tripwire, not the primary defence. By design the caller's API key never enters a
 * `result`, a payload, or an error context — it lives only on the request object and inside
 * `ExternalApiClient`. This exists for the day someone changes that without noticing that these
 * objects are written to durable storage nobody reviews.
 *
 * Applied only at the two points where a whole object leaves the process for S3, never per log
 * line: a deep clone on the hot path would cost real time against a risk that should not exist.
 */
export function redact(value, depth = 0) {
  if (value === null || typeof value !== "object" || depth > MAX_DEPTH) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase())
      ? REDACTED
      : redact(val, depth + 1);
  }
  return out;
}
