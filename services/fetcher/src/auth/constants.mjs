/**
 * Identifiers for the Fetcher's own hop of CLARISA API key validation.
 *
 * `CLARISA_MICROSERVICE_NAME` is ours to choose and needs no prior registration in CLARISA
 * (confirmed 2026-08-25); it only has to read sensibly to whoever inspects an audit log there.
 * It deliberately does NOT reuse Reporting's 'Bilateral Service': validating under our own name
 * keeps the trail honest about which hop saw the request, so a rejection at the Fetcher is
 * distinguishable from one at Reporting.
 */
export const CLARISA_MICROSERVICE_NAME = "PRMS Fetcher Service";

/** Sent to CLARISA as `endpoint_accessed`. No registration step precedes this. */
export const INGEST_ENDPOINT_ACCESSED = "/ingest";

/** Express lower-cases incoming header names, so this matches any casing the caller sends. */
export const API_KEY_HEADER = "x-api-key";

/**
 * Where `requireApiKey` parks the authenticated caller on the request object, mirroring how
 * Reporting's guard uses `request[EXTERNAL_PLATFORM_REQUEST_KEY]` and how JWT middleware uses
 * `req.user`. Holds `{ apiKey, mis }` — the key is needed to forward it to Reporting, the `mis`
 * for local log attribution.
 */
export const AUTH_REQUEST_KEY = "auth";

export const UNAUTHORIZED_MESSAGE = "Unauthorized";
