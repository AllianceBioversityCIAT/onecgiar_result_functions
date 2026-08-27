/**
 * Validates a caller's API key against CLARISA, for the Bulk Ingest edge.
 *
 * DELIBERATE DUPLICATION. `services/fetcher/src/auth/clarisa-api-key.client.mjs`
 * does the same job for the Fetcher and is the reference implementation for the
 * CLARISA contract below (path, payload fields, and the three-state
 * classification). It is intentionally NOT imported: the Fetcher is owned by
 * another maintainer and this Lambda must not couple to its internals.
 *
 * What that costs: if CLARISA changes the validation contract, both copies have
 * to change. The tests in test/api-key.test.mjs pin the wire format precisely so
 * a drift shows up as a red test instead of a production 503. If a third caller
 * ever needs this, that is the moment to extract it to a shared module — not
 * before.
 *
 * Three states, never a boolean. `invalid` means CLARISA said no; anything else
 * that goes wrong is `unavailable`. Turning an outage into a 401 would tell the
 * producer their credential is broken and send them off to rotate keys for
 * nothing.
 *
 * Fail-closed by construction: `valid` is the only status a caller may continue
 * on, and this function never throws.
 */

const VALIDATE_PATH = "/api/auth/validate-api-key";
const TIMEOUT_MS = Number(process.env.CLA_VALIDATE_TIMEOUT_MS || "5000");

/**
 * Our own name in CLARISA's audit trail. Not the Fetcher's: a rejection at the
 * Bulk edge should be distinguishable from one at the Fetcher. Needs no prior
 * registration in CLARISA.
 */
const MICROSERVICE_NAME = "PRMS Bulk Ingest Service";
const ENDPOINT_ACCESSED = "/bulk/ingest";

export type ClarisaMis = { id: number; name: string; acronym: string };

export type ApiKeyValidation =
  | {
      status: "valid";
      mis?: ClarisaMis;
      environment?: string;
      scopes: string[];
    }
  | { status: "invalid" }
  | { status: "unavailable"; reason: string };

/** So a missing CLA_VALIDATE_URL is reported once per container, not per request. */
let missingUrlReported = false;

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

export async function validateApiKey(
  apiKey: string,
  context: { ipAddress?: string } = {}
): Promise<ApiKeyValidation> {
  const baseUrl = trimTrailingSlashes(process.env.CLA_VALIDATE_URL ?? "");

  if (!baseUrl) {
    if (!missingUrlReported) {
      missingUrlReported = true;
      console.error(
        "[ClarisaApiKeyClient] CLA_VALIDATE_URL is not configured. Every bulk request will be rejected with 503 until it is set."
      );
    }
    return { status: "unavailable", reason: "cla_validate_url_missing" };
  }

  const payload = {
    api_key: apiKey,
    microservice_name: MICROSERVICE_NAME,
    endpoint_accessed: ENDPOINT_ACCESSED,
    ...(context.ipAddress ? { ip_address: context.ipAddress } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${VALIDATE_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let body: any;
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

    // CLARISA answered and said no. A clean rejection, not something to retry.
    if (
      body?.valid === false ||
      response.status === 401 ||
      response.status === 403
    ) {
      return { status: "invalid" };
    }

    // Anything else means CLARISA is unusable, including a 4xx caused by us
    // building a bad request. Never a rejection of the caller's key: that would
    // blame them for our bug.
    console.warn(
      `[ClarisaApiKeyClient] Unusable validation response: ${response.status} ${response.statusText}`
    );
    return { status: "unavailable", reason: `http_${response.status}` };
  } catch (error: any) {
    const reason = error?.name === "AbortError" ? "timeout" : "transport_error";
    console.warn(
      `[ClarisaApiKeyClient] API key validation failed: ${reason}`,
      error?.message
    );
    return { status: "unavailable", reason };
  } finally {
    clearTimeout(timeoutId);
  }
}
