# Module Spec — Fetcher Ingestion Authentication & Envelope Pass-Through — Requirements

> **Status:** proposed — not implemented
> **Scope:** cross-repo. Most of the work is in `onecgiar_result_functions/services/fetcher`; the PRMS side already accepts everything this spec forwards.
> **Related:** [P2-3166](https://cgiarmel.atlassian.net/browse/P2-3166) — this spec is what makes its AC3 actually resolvable in production.
> **Sibling spec:** `onecgiar_pr/docs/specs/bilateral/webhook-external-platforms/` — the consumer of the identity this spec makes correct.

> **Paths in this spec.** Bare paths (`services/fetcher/src/...`) are relative to this repo,
> `onecgiar_result_functions`. Paths prefixed `onecgiar_pr/` live in the PRMS repo.


## 1. Module / Feature

Require and validate a CLARISA API key at the Fetcher's ingestion endpoint, forward that same key to PRMS Reporting instead of substituting the Fetcher's own, and stop dropping the request envelope on the way.

Two services:

| Repo | Service | Role |
|---|---|---|
| `onecgiar_result_functions` | `services/fetcher` | Public ingestion gateway. Validates, normalises, processes, calls Reporting, indexes in OpenSearch |
| `onecgiar_pr` | `onecgiar_pr/onecgiar-pr-server/src/api/bilateral` | Persists the result. Already validates the key against CLARISA and keeps the resolved identity |

## 2. Context

External platforms do not call PRMS Reporting directly — they call the **Fetcher**, which validates and normalises, then forwards to `POST /api/bilateral/create`.

P2-3166 Phase 1 made Reporting persist *which platform* a result came from, taken from the `mis` CLARISA returns when validating the API key. That is the only trustworthy identity available: CLARISA resolves it from the key itself, unlike the request body's `tenant`, which the caller declares.

**The problem this spec fixes.** Verified in `onecgiar_result_functions` on 2026-08-25:

1. **The Fetcher requires no authentication.** `POST /ingest` (`services/fetcher/src/server.mjs:51`) has no auth middleware — `express.json()` is the only `app.use`. No `x-api-key` is read anywhere outside the outbound client. `src/docs/openapi.json` declares no `securitySchemes`, so the published contract says the same.

2. **The Fetcher sends its own key to Reporting.** `ExternalApiClient` reads `process.env.EXTERNAL_API_KEY` — a single per-environment key belonging to the Fetcher (`src/clients/external-api.mjs:10`).

3. **Therefore `mis` would identify the Fetcher, not the originating platform.** Every result ingested through the Fetcher would land in Reporting with the same `external_platform_id`. P2-3166's dispatcher would route every callback back to the Fetcher rather than to the platform that submitted the result — satisfying AC3's letter and failing its purpose.

4. **The envelope is discarded.** The Fetcher builds a full envelope internally — `{ type, received_at, idempotencyKey, tenant, op, jobId?, data }` at `src/server.mjs:170-188`, with `idempotencyKey = ${tenant}:${type}:${op}:${uniqueId}` — and then sends only three of those fields:

   ```js
   // src/clients/external-api.mjs:42
   const payload = {
     type: result.type,
     data: result.data,
     ...(result.jobId ? { jobId: result.jobId } : {}),
   };
   ```

   `RootResultsDto` on the Reporting side declares `idempotencyKey`, `tenant`, `op` and `received_at`, and P2-3166 reads `idempotencyKey` into `result.external_reference`. **So `external_reference` is guaranteed NULL for everything ingested through the Fetcher today.** Conversely `jobId` is sent and is *not* in `RootResultsDto`, so `whitelist: true` strips it silently.

Baseline citations:
- `docs/prd.md:167` — **AC-3 Authorization**: frontend gates are UX only, the backend must enforce. Extends to a gateway: an unauthenticated ingestion endpoint in front of an authenticated one moves the perimeter, it does not create one.
- `docs/prd.md:172` — **AC-4 Bilateral / platform-report stability**: additive changes only.
- `docs/prd.md:195` — **AC-9 Security and secrets**: API keys must never be logged, printed or echoed. Directly constrains §5.
- `docs/detailed-design/detailed-design.md:265` — **W6 Bilateral / platform-report enrichment**: "Both surfaces are JWT-excluded — protect by IP allowlist, signed tokens, or other layer as appropriate **at the perimeter**."
- `onecgiar_pr/onecgiar-pr-server/docs/bilateral-result-summaries.en.md` — the authoritative payload contract.

## 3. In Scope / Out of Scope

### In scope

- An API key requirement on the Fetcher's `POST /ingest`, validated against CLARISA at the Fetcher.
- Forwarding the caller's key — not the Fetcher's — to `POST /api/bilateral/create`.
- Forwarding the envelope fields Reporting already declares, so `external_reference` is populated.
- Aligning email validation between the Fetcher's JSON Schema and Reporting's DTO.
- Declaring the security scheme in the Fetcher's published OpenAPI document.

### Out of scope

- **Any change to PRMS Reporting.** It already reads `x-api-key`, validates against CLARISA, keeps the `mis`, and declares every envelope field. This spec sends it what it already accepts.
- The Fetcher's read endpoints (`GET /result`, `GET /result/{code}`). Whether reads need the same treatment is a separate decision — see OQ-3.
- The other services in the monorepo (`ingestor`, `splitter`, `sync`, `worker`). If they also call Reporting, they need the same review; not covered here.
- Changing what `data` contains. The new `external_*` columns are **not** payload fields — see §6.
- The webhook dispatcher itself, which is P2-3166.

## 4. Requirements

### Functional

| ID | Requirement |
|---|---|
| **FE-1** | `POST /ingest` requires an API key in the `x-api-key` header. A request without one is rejected `401` before any validation, normalisation or processing work happens. |
| **FE-2** | The key is validated at the Fetcher against CLARISA. An invalid key is rejected `401`. The Fetcher does not forward an unvalidated key. |
| **FE-3** | The **caller's** key is forwarded to `POST /api/bilateral/create`. The Fetcher's own `EXTERNAL_API_KEY` stops being the credential used for ingestion traffic. |
| **FE-4** | The envelope fields Reporting declares — `idempotencyKey`, `tenant`, `op`, `received_at` — are forwarded, so `result.external_reference` is populated for results ingested through the Fetcher. |
| **FE-5** | Email fields in the Fetcher's schemas (`lead_contact_person.email`, `created_by.email`, `submitted_by.email`) validate as emails, so a malformed address is rejected at the Fetcher rather than after a round trip to Reporting. |
| **FE-6** | The Fetcher's `openapi.json` declares the `x-api-key` security scheme and applies it to `POST /ingest`, so the published contract matches the enforced behaviour. |

### Non-functional

| ID | Requirement |
|---|---|
| **NFR-1** | The API key is never logged, echoed into a response body, written to S3 error payloads, or included in an error message (`onecgiar_pr/docs/prd.md` AC-9). This includes the existing `console.log` statements in `ExternalApiClient`, which currently log the whole result object. |
| **NFR-2** | A CLARISA outage must produce a clear `503`-class failure, not a silent accept. Failing open on an authentication check is not acceptable. |
| **NFR-3** | Rejection happens before the expensive work. Today `/ingest` validates, normalises, processes and writes to OpenSearch; an unauthenticated request must not reach any of it. |
| **NFR-4** | The change is additive for callers that already send a valid key. Callers that send none begin failing — see §7, this is a breaking change and needs a rollout. |

## 5. Constraint — the key must not leak into logs

`ExternalApiClient` currently logs the entire result object and the full outbound payload:

```js
console.log("[ExternalApiClient] Enriching result", result);
console.log(`[ExternalApiClient] Payload being sent to ${url}:`, JSON.stringify(payload, null, 2));
```

Once the caller's key travels with the request, any log line that prints the request context risks printing the credential. `onecgiar_pr/docs/prd.md` AC-9 and `onecgiar_pr/.cursorrules` both forbid it outright.

The key must live only in the header, never in an object that gets serialised into a log, a response, or the S3 error bucket (`src/utils/s3.mjs` writes result payloads on failure).

## 6. The new `external_*` columns are not payload fields

Worth stating because it was the original question: `external_platform_id`, `external_platform_code` and `external_reference` should **not** be added to `common_fields.json`.

- `external_platform_id` / `external_platform_code` are **derived server-side** from the authenticated key. Reporting's `CreateBilateralDto` does not declare them (verified: zero occurrences), so sending them would be stripped by `whitelist: true` — and *accepting* them would undo the reason P2-3166 uses `mis` instead of `tenant`.
- `external_reference` comes from `idempotencyKey`, which the Fetcher already generates. It belongs in the **envelope**, not in `data`, and Reporting already declares it there (FE-4).

So the answer to "how do the new fields fit into Common Fields" is: they do not. The identity flows through the **credential**, and the correlation key flows through the **envelope**.

## 7. Breaking change and rollout — decided

FE-1 makes an endpoint that accepted anonymous requests start requiring a key. Every current caller breaks the moment it ships.

**Decision (Juan David, 2026-08-25): hard cutover, no grace period.** Callers request an API key from CLARISA and use it. There is no flag, no logged-but-allowed window, no dual mode.

This is the right call and worth recording why: a temporary "accept without a key but log it" mode is an endpoint that is knowingly open, and the removal date always slips. The alternative was carrying a deliberate security hole to spare callers a configuration step they have to take anyway.

Practical consequence for the build: **no feature flag, no dual-path code.** The middleware rejects or it does not. That removes a branch from every task in group B.

## 8. Open questions

| ID | Question | Owner | Blocking? |
|---|---|---|---|
| ~~**OQ-1**~~ | ~~Rollout: hard cutover or grace period?~~ **Resolved 2026-08-25 — hard cutover.** Callers request a key. No flag, no dual mode. See §7. | — | No |
| ~~**OQ-2**~~ | ~~Does CLARISA accept the same key under two `microservice_name` values?~~ **Resolved 2026-08-25 by CLARISA (Juan David): yes.** `microservice_name` *does* participate in validation, but a key that is valid in CLARISA is usable across N clients — so the same key validates at both hops under different names. The two-hop design stands as written, and the Fetcher validates under its own identity rather than impersonating `'Bilateral Service'`. | — | No |
| **OQ-3** | Do the read endpoints (`GET /result`, `GET /result/{code}`) also require a key? They expose result data from OpenSearch. | Product | No — FE-1 covers ingestion only |
| **OQ-4** | Two CLARISA validations per ingest (Fetcher + Reporting), each an HTTP call with a 5s timeout. Acceptable, or should the Fetcher cache validations briefly? | Us | No — see `design.md` §6 |
| ~~**OQ-6**~~ | ~~`endpoint_accessed` and whether the Fetcher's `microservice_name` must be pre-registered.~~ **Resolved 2026-08-25 by CLARISA (Juan David):** send `/ingest`, no registration needed — CLARISA validates it on their side. And `microservice_name` is an identifier we choose; it does not need to exist beforehand. It should just read sensibly to someone looking at it inside CLARISA. See `design.md` §4.2 for the chosen value. | — | No |
| **OQ-5** | Do `ingestor`, `splitter`, `sync` or `worker` also call `POST /api/bilateral/create` with `EXTERNAL_API_KEY`? If so they have the same identity problem and need the same review. | Us | No |
