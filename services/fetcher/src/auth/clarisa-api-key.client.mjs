import fetch from "node-fetch";
import { CLARISA_MICROSERVICE_NAME } from "./constants.mjs";

const VALIDATE_PATH = "/api/auth/validate-api-key";
const TIMEOUT_MS = 5000;

/** So a missing CLA_VALIDATE_URL screams once per container, not once per request. */
let missingUrlReported = false;

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}

/**
 * Validates an API key against CLARISA.
 *
 * Mirrors Reporting's `ClarisaApiKeyValidationService` — same endpoint, same request shape — with
 * one deliberate divergence: it returns THREE states instead of collapsing everything to `null`.
 *
 * Reporting turns any failure into a 401. That is wrong for a gateway: during a CLARISA outage a
 * 401 tells callers "your credential is bad", which is false and sends them off to rotate keys and
 * redeploy for nothing. Splitting `invalid` from `unavailable` lets the middleware answer 401 vs
 * 503 (requirements.md NFR-2). Please do not "fix" this back into a boolean.
 *
 * The fail-closed invariant is preserved by construction: `valid` is the only status the caller is
 * allowed to continue on. This function never throws and never returns null.
 *
 * @param {string} apiKey the caller's key, already extracted and trimmed
 * @param {{ endpointAccessed: string, ipAddress?: string }} options
 * @returns {Promise<
 *   | { status: "valid", mis: { id: number, name: string, acronym: string }, environment: string, scopes: string[] }
 *   | { status: "invalid" }
 *   | { status: "unavailable", reason: string }
 * >}
 */
export async function validateApiKey(apiKey, { endpointAccessed, ipAddress } = {}) {
  const baseUrl = trimTrailingSlashes(process.env.CLA_VALIDATE_URL ?? "");

  if (!baseUrl) {
    if (!missingUrlReported) {
      missingUrlReported = true;
      console.error(
        "[ClarisaApiKeyClient] CLA_VALIDATE_URL is not configured. Every ingest request will be rejected with 503 until it is set."
      );
    }
    return { status: "unavailable", reason: "cla_validate_url_missing" };
  }

  const url = `${baseUrl}${VALIDATE_PATH}`;
  const payload = {
    api_key: apiKey,
    microservice_name: CLARISA_MICROSERVICE_NAME,
    endpoint_accessed: endpointAccessed,
    ...(ipAddress ? { ip_address: ipAddress } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let body;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    if (response.ok && body?.valid === true) {
      return {
        status: "valid",
        mis: body.mis,
        environment: body.environment,
        scopes: body.scopes ?? [],
      };
    }

    // CLARISA answered and said no — a clean rejection, not something to retry.
    if (body?.valid === false || response.status === 401 || response.status === 403) {
      return { status: "invalid" };
    }

    // Anything else is CLARISA being unusable, including a 4xx that means *we* built a bad
    // request. Never a rejection of the caller's key: that would blame them for our bug.
    console.warn(
      `[ClarisaApiKeyClient] Unusable validation response for ${endpointAccessed}:`,
      response.status,
      response.statusText
    );
    return { status: "unavailable", reason: `http_${response.status}` };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "timeout" : "transport_error";
    console.warn(
      `[ClarisaApiKeyClient] API key validation failed for ${endpointAccessed}: ${reason}`,
      error?.message
    );
    return { status: "unavailable", reason };
  } finally {
    clearTimeout(timeoutId);
  }
}
