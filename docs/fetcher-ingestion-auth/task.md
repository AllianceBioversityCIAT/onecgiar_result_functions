# Module Spec — Fetcher Ingestion Authentication & Envelope Pass-Through — Tasks

> Cites `requirements.md` and `design.md` in this folder.
> **Status:** not started, **no blockers**. Every open question was resolved with CLARISA on 2026-08-25.

> **Paths in this spec.** Bare paths (`services/fetcher/src/...`) are relative to this repo,
> `onecgiar_result_functions`. Paths prefixed `onecgiar_pr/` live in the PRMS repo.


## 1. Scope

Every task lives in `onecgiar_result_functions/services/fetcher` unless stated. **PRMS Reporting needs no change** — it already reads `x-api-key`, validates against CLARISA, keeps the `mis`, and declares every envelope field this spec forwards.

Tasks split into two groups that can ship independently:

| Group | Tasks | Ships independently? |
|---|---|---|
| **A — coherence** | `FE-T-5`, `FE-T-6` | Yes. No behaviour change for valid callers, no rollout needed |
| **B — authentication** | `FE-T-1` … `FE-T-4`, `FE-T-7` | No — sequential. Breaking change, hard cutover. **No open questions left** |

Group A is worth shipping first: it is small, it fixes a real papercut, and it does not wait on anyone.

## 2. Pre-flight

- [x] ~~OQ-2 — same key under two `microservice_name` values?~~ **Yes** (CLARISA, 2026-08-25). A key valid in CLARISA is usable across N clients, so both hops validate. Design unchanged.
- [x] ~~OQ-6 — `endpoint_accessed` and pre-registering the Fetcher's name.~~ **Send `/ingest` as-is; `microservice_name` is ours to choose, no registration needed** (CLARISA, 2026-08-25). Chosen: `'PRMS Fetcher Service'`.
- [x] ~~OQ-1 — rollout shape.~~ **Hard cutover, no grace period** (2026-08-25). Build with no flag and no dual path.
- [ ] Confirm which environments have `CLA_VALIDATE_URL` reachable from the Fetcher's runtime (it is a Lambda; egress is not automatic).
- [ ] OQ-5 swept: `grep -rn "EXTERNAL_API_KEY" services/` to see whether `ingestor`, `splitter`, `sync` or `worker` share the same identity problem.

## 3. Task list — Group A (no blockers)

### `FE-T-5` — Email format coherence (FE-5) ⬜

`src/validator/schemas/common_fields.json`: add `"format": "email"` to `lead_contact_person.email`, `created_by.email`, `submitted_by.email`.

`ajv-formats` is already installed and registered in `src/validator/ajv.js` — no new dependency.

> `lead_contact_person` is otherwise coherent with Reporting's `LeadContactPersonDto`: `{ email, name }`, both required, object required at root. Verified on both sides. Only the format is missing.

### `FE-T-6` — Declare the security scheme in OpenAPI (FE-6) ⬜

`src/docs/openapi.json`: add `components.securitySchemes.ApiKeyAuth` (`apiKey` / `header` / `x-api-key`) and apply it to `POST /ingest`.

Ship this **with** `FE-T-1`, not before — advertising a requirement that is not enforced is worse than either state alone.

## 4. Task list — Group B (unblocked)

### `FE-T-1` — CLARISA validation client ⬜

`src/auth/clarisa-api-key.client.mjs` + `src/auth/constants.mjs`.

Mirror `onecgiar_pr/onecgiar-pr-server/src/api/bilateral/services/clarisa-api-key-validation.service.ts`: `POST {CLA_VALIDATE_URL}/api/auth/validate-api-key` with `{ api_key, microservice_name, endpoint_accessed, ip_address? }`, 5s timeout. Return the success payload (`{ valid, mis, environment, scopes }`) or `null`.

Two behaviours to copy on purpose:
- `{ valid: false }` → clean rejection, not a retry.
- **A CLARISA outage is also a rejection** (NFR-2). Never fail open on an auth check.

`microservice_name` is `'PRMS Fetcher Service'` and `endpoint_accessed` is `/ingest` — both settled with CLARISA. No registration step precedes this.

### `FE-T-2` — The middleware (FE-1, FE-2) ⬜

`src/auth/require-api-key.mjs`. Extract `x-api-key` → validate → attach the `mis` to the request → `next()`, or `401`.

Mount on `POST /ingest` in `src/server.mjs:51`, **before** the validation/normalisation loop (NFR-3). Verify it also applies on the Lambda path (`src/lambda.mjs`), not only `src/local.mjs`.

Blocked by `FE-T-1`.

### `FE-T-3` — Forward the caller's key (FE-3) ⬜

`src/clients/external-api.mjs`: `getRequestHeaders()` uses the per-request validated key instead of `process.env.EXTERNAL_API_KEY`.

**Do not leave `EXTERNAL_API_KEY` as a silent fallback for ingestion.** It fails in the worst way — quietly attributing a platform's result to the Fetcher, which is the exact bug this spec exists to fix. If a non-ingest path needs a service credential, it asks for it explicitly.

Blocked by `FE-T-2`.

### `FE-T-4` — Forward the envelope (FE-4) ⬜

Same file. Add `idempotencyKey`, `tenant`, `op`, `received_at` to the outbound payload. All four are already declared on `RootResultsDto`, so this is additive.

**And decide `jobId`.** It is sent today and Reporting does not declare it, so `whitelist: true` drops it silently. Either Reporting declares it or the Fetcher stops sending it — leaving it as a field that travels and vanishes is the worst of the three.

Blocked by `FE-T-2`.

### `FE-T-7` — Audit logging for the credential (NFR-1) ⬜

`src/clients/external-api.mjs` currently logs the whole result object and the full outbound payload:

```js
console.log("[ExternalApiClient] Enriching result", result);
console.log(`[ExternalApiClient] Payload being sent to ${url}:`, JSON.stringify(payload, null, 2));
```

Once the caller's key travels per-request, any log line printing request context risks printing the credential. `onecgiar_pr/docs/prd.md` AC-9 and `onecgiar_pr/.cursorrules` forbid it.

Also check `src/utils/s3.mjs`, which writes result payloads to the error bucket on failure.

Log identifiers — `idempotencyKey`, the platform acronym, counts — never credentials or whole payloads.

Blocked by `FE-T-3`.

## 5. Verification

```bash
cd services/fetcher
npm run build     # the esbuild bundle must still succeed
npm run dev       # exercise locally against a CLARISA test key
```

The cases that matter more than the count:

1. `POST /ingest` with **no** key → `401`, and nothing reaches OpenSearch or Reporting.
2. Invalid key → `401`, same.
3. Valid key → proceeds, and Reporting receives **that** key, not `EXTERNAL_API_KEY`.
4. CLARISA unreachable → rejection, never an accept.
5. `idempotencyKey` present in the outbound payload.
6. `lead_contact_person.email = "not-an-email"` → rejected at the Fetcher, no call to Reporting.
7. **Grep a real ingest's logs for the key value — zero hits.** Same for the S3 error payload.

### End-to-end, both services

1. Two platforms registered in CLARISA with different keys.
2. Ingest through the Fetcher with platform A's key. In PRMS, confirm `result.external_platform_id` is **A's** `mis.id` and `external_reference` equals the `idempotencyKey`.
3. Repeat with platform B → a **different** `external_platform_id`. **This is the assertion the whole spec exists for**: two platforms through one gateway must land as two identities.
4. Approve both in PRMS. With P2-3166 endpoints registered per platform, each callback reaches its own destination.
5. Revoke A's key in CLARISA and retry → rejected at hop 1.

## 6. Rollout

**Group A** ships on its own. No caller-visible change for valid input.

**Group B is a breaking change, shipped as a hard cutover.** `POST /ingest` accepts anonymous requests today; every current caller breaks the moment `FE-T-2` ships. That is the intended behaviour — decided 2026-08-25.

- **No feature flag, no dual mode.** The middleware rejects or it does not. Do not build a "log and allow" path; it was considered and rejected.
- Callers request a key from CLARISA and deploy it on their side. That is on them, and it is a step they have to take regardless.
- Announce the cutover date before shipping so nobody is surprised by a `401` — but the date does not wait on anyone confirming they are ready.

**Deployment note:** the Fetcher is not declared in this monorepo's `template.yaml` (which only carries the Sync functions), and `package.json` builds a zip via esbuild. Confirm where it is actually deployed and that `CLA_VALIDATE_URL` is configured there before `FE-T-2` reaches any environment.
