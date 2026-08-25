import { validateApiKey } from "./clarisa-api-key.client.mjs";
import {
  API_KEY_HEADER,
  AUTH_REQUEST_KEY,
  INGEST_ENDPOINT_ACCESSED,
  UNAUTHORIZED_MESSAGE,
} from "./constants.mjs";

/**
 * Reads the caller's API key from the request.
 *
 * Handles both shapes a proxy can produce for a repeated header: an array (Node/Express) and a
 * comma-joined string (ALB and API Gateway HTTP v2 collapse duplicates this way). Taking the first
 * value keeps a duplicated header from turning into a confusing 401 on "key1,key2".
 */
function extractApiKey(req) {
  const raw = req.headers[API_KEY_HEADER];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return first?.split(",")[0]?.trim() || undefined;
}

function extractClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor || req.socket?.remoteAddress;

  return typeof ip === "string" ? ip.split(",")[0].trim() : undefined;
}

function requestIdOf(req) {
  return req.headers["x-amzn-trace-id"] || req.headers["x-request-id"];
}

/**
 * Express middleware guarding ingestion: extract the key, validate it against CLARISA, hand the
 * resolved platform down to the handler, or reject.
 *
 * Mounted at route level (`app.post("/ingest", requireApiKey, handler)`) rather than as an
 * `app.use`, so the guard cannot be detached by reordering lines or bypassed by another route
 * registered above it.
 *
 * Two rejection modes, never an accept (requirements.md NFR-2):
 *   401 — no key, or CLARISA says the key is not valid.
 *   503 — CLARISA could not be reached or answered unusably. Retryable, and says so.
 */
export async function requireApiKey(req, res, next) {
  const requestId = requestIdOf(req);
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      message: UNAUTHORIZED_MESSAGE,
      requestId,
    });
  }

  const outcome = await validateApiKey(apiKey, {
    endpointAccessed: INGEST_ENDPOINT_ACCESSED,
    ipAddress: extractClientIp(req),
  });

  if (outcome.status === "valid") {
    // The key rides the request object, never the result payload: `result` is serialised to S3
    // and echoed in the HTTP response, and a credential must not travel in either (NFR-1).
    req[AUTH_REQUEST_KEY] = { apiKey, mis: outcome.mis };
    return next();
  }

  if (outcome.status === "unavailable") {
    return res.status(503).set("Retry-After", "30").json({
      ok: false,
      error: "auth_unavailable",
      message: "Authentication service unavailable. Retry later.",
      requestId,
    });
  }

  return res.status(401).json({
    ok: false,
    error: "unauthorized",
    message: UNAUTHORIZED_MESSAGE,
    requestId,
  });
}
