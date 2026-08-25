# Module Spec — Fetcher Ingestion Authentication & Envelope Pass-Through — Design

> Cites `requirements.md` in this folder. Baseline: `onecgiar_pr/docs/prd.md` AC-3 / AC-4 / AC-9,
> `onecgiar_pr/docs/detailed-design/detailed-design.md` W6.

> **Paths in this spec.** Bare paths (`services/fetcher/src/...`) are relative to this repo,
> `onecgiar_result_functions`. Paths prefixed `onecgiar_pr/` live in the PRMS repo.


## 1. Summary

The Fetcher becomes an authenticating gateway that **passes the caller's credential through** rather than substituting its own. Reporting needs no change: it already reads `x-api-key`, validates against CLARISA, and keeps the resolved `mis`.

One sentence captures the whole design: **the platform's identity must travel with the credential, not in the payload.**

## 2. Today vs. proposed

```
TODAY
                    (no auth)                    (Fetcher's own key)
  Platform ───────────────────▶ Fetcher ─────────────────────────────▶ Reporting
                                                                          │
                                        CLARISA validates ───────────────▶│
                                        returns mis = FETCHER  ❌         │
                                                                          ▼
                                                      external_platform_id = the Fetcher
                                                      external_reference   = NULL

PROPOSED
              (platform's key)                  (same key, forwarded)
  Platform ───────────────────▶ Fetcher ─────────────────────────────▶ Reporting
                                   │                                      │
              CLARISA validates ──▶│◀── mis = PLATFORM                    │
                     (hop 1)       │            CLARISA validates ───────▶│
                                   │                   (hop 2)            │
                                   │            returns mis = PLATFORM ✅ │
                                   │                                      ▼
                                   │                    external_platform_id = the platform
                                   └── forwards envelope ──▶ external_reference = idempotencyKey
```

## 3. Why validate at both hops

It looks redundant. It is not, and the two hops answer different questions.

**Hop 1 (Fetcher)** — *should I do this work at all?* The Fetcher validates, normalises, runs a type processor, calls Reporting and indexes into OpenSearch. Rejecting an unauthenticated request costs one CLARISA call; accepting it costs all of that plus a write to OpenSearch (NFR-3). The Fetcher also needs to *know* who is calling for its own logs and error attribution.

**Hop 2 (Reporting)** — *do I trust the caller?* Reporting cannot take the Fetcher's word for who is calling. If it did, the identity it persists would be an assertion by an upstream service rather than something CLARISA resolved, and the whole `mis`-not-`tenant` distinction P2-3166 rests on would collapse into "whatever the previous hop said". Reporting is JWT-excluded precisely because its perimeter is the key.

So: hop 1 protects the Fetcher's own work, hop 2 protects the data. Removing either weakens something real.

## 4. Fetcher: the auth layer

### 4.1 Shape

New module in `services/fetcher/src`, mirroring the structure Reporting already uses so the two are recognisably the same mechanism:

| File | Role |
|---|---|
| `src/auth/clarisa-api-key.client.mjs` | POSTs to CLARISA `/api/auth/validate-api-key`, returns the success payload or `null` |
| `src/auth/require-api-key.mjs` | Express middleware: extract → validate → attach → next, or `401` |
| `src/auth/constants.mjs` | `microservice_name` (`'PRMS Fetcher Service'`), the header name, the request key |

Mounted on `POST /ingest` only (`server.mjs:51`), **before** `express.json()` does any work on the body — or at minimum before the validation loop starts.

### 4.2 The CLARISA contract to mirror

Reporting's `ClarisaApiKeyValidationService` is the reference implementation. Same endpoint, same request shape:

```
POST {CLA_VALIDATE_URL}/api/auth/validate-api-key
{
  "api_key":          "<the caller's key>",
  "microservice_name": "PRMS Fetcher Service",
  "endpoint_accessed": "/ingest",
  "ip_address":        "<optional>"
}
```

**`microservice_name = 'PRMS Fetcher Service'`.** Confirmed with CLARISA (2026-08-25) that this is an identifier we choose and that it needs no prior registration — it only has to read sensibly to someone looking at it inside CLARISA. The value mirrors what the service calls itself in its own README, and sits in parallel with Reporting's `'Bilateral Service'`.

> Worth recording, because whoever reads a CLARISA audit log later will hit it: **this component has three names in the repo.** The folder is `services/fetcher`, `package.json` says `@prms/normalizer`, the build artefact is `normalizer.zip`, and the README calls it "PRMS Fetcher Service". Picking the README's name is the least surprising choice for an outside reader, but do not expect to find the string `fetcher` in the package metadata.

**`endpoint_accessed = '/ingest'`.** Confirmed the same day: send it as-is, no registration step, CLARISA validates it on their side.

Success returns `{ valid: true, mis: { id, name, acronym }, environment, scopes }` — for example:

```json
{
  "valid": true,
  "environment": "PROD",
  "scopes": ["institutions:read"],
  "mis": { "id": 12, "name": "CGIAR Platform for Big Data in Agriculture", "acronym": "BIGDATA" }
}
```

Anything else — including a transport failure — is a rejection.

**`scopes` is not part of this check.** Confirmed with CLARISA (2026-08-25): scopes gate different functionalities and none applies here. The Fetcher must not start filtering on them — inventing a scope requirement that CLARISA does not model would reject valid callers.

**Two behaviours to copy deliberately:**

- A `{ valid: false }` response is a clean rejection, not an error to retry.
- A CLARISA outage is **also** a rejection (NFR-2). Reporting logs a warning and returns `null`; the guard turns that into `401`. Failing open on an auth check is not an option, even though it means a CLARISA outage stops ingestion. That is the correct trade for a credential check.

**`microservice_name` — resolved, and the answer matters.** Confirmed with CLARISA (2026-08-25): the field *does* participate in validation, **and** a key that is valid in CLARISA is usable across N clients. So the same key validates at both hops under different names.

That is the answer the design needed. The Fetcher validates under **its own** `microservice_name`, not by impersonating `'Bilateral Service'` — which keeps the audit trail honest about which hop saw the request, and means a rejection at hop 1 is distinguishable from one at hop 2.

### 4.3 What the middleware attaches

The resolved `mis` goes on the request for the handler to use — the same pattern as Reporting's guard putting it on `request[EXTERNAL_PLATFORM_REQUEST_KEY]`, and the same pattern as `req.user`.

The Fetcher does not need to *send* the `mis` anywhere — Reporting resolves it again from the forwarded key. It is useful locally for log attribution: "platform X submitted N results, M rejected" is far better operationally than today's anonymous counts.

## 5. Fetcher: the outbound call

Two changes in `src/clients/external-api.mjs`.

### 5.1 Forward the caller's key

`getRequestHeaders()` builds `X-API-Key` from `this.apiKey`, seeded from `process.env.EXTERNAL_API_KEY`. It becomes per-request: the key the middleware validated, passed down from the handler.

`EXTERNAL_API_KEY` should not silently remain as a fallback for ingestion traffic. A fallback here fails in the worst way — quietly, by attributing a platform's result to the Fetcher, which is exactly the bug this spec exists to fix. If some non-ingest path genuinely needs a service credential, it should ask for it explicitly rather than inherit it.

### 5.2 Forward the envelope

```js
// current — src/clients/external-api.mjs:42
const payload = {
  type: result.type,
  data: result.data,
  ...(result.jobId ? { jobId: result.jobId } : {}),
};

// proposed
const payload = {
  type: result.type,
  data: result.data,
  idempotencyKey: result.idempotencyKey,
  tenant: result.tenant,
  op: result.op,
  received_at: result.received_at,
};
```

Every added field is already declared on `RootResultsDto`, so this is additive and needs no change in Reporting (AC-4).

`idempotencyKey` is what lands in `result.external_reference`. It is already built as `${tenant}:${type}:${op}:${uniqueId}` (`server.mjs:170`) — stable, meaningful, and exactly the correlation handle an external platform needs to match our callback against its own record.

**On `jobId`:** it is sent today and `RootResultsDto` does not declare it, so `whitelist: true` drops it silently. Either it is meaningful and Reporting should declare it, or it is not and the Fetcher should stop sending it. Right now it is neither — decide, do not leave it.

**On `tenant`:** forwarded for traceability, and it must stay non-authoritative. Reporting must keep routing on `mis`. Anything that starts routing on `tenant` reintroduces the vulnerability the pass-through is being built to close: a caller naming a platform it is not.

## 6. On validating twice (OQ-4)

Two CLARISA round trips per ingest, each with a 5s timeout, on a path that already does substantial work. Measure before optimising: if CLARISA validation is fast, this is noise next to the processing and the OpenSearch write.

If it does matter, a short-lived in-process cache keyed on a hash of the key is the cheap fix — but it trades away immediate revocation, and for a credential check that is a real cost. Do not build it speculatively.

## 7. Schema coherence — email (FE-5)

`common_fields.json` declares email fields as bare strings:

```json
"email": { "type": "string", "description": "..." }
```

Reporting validates the same field with `@IsEmail()` (`LeadContactPersonDto`). So a malformed address passes the Fetcher, gets processed, and is rejected by Reporting — the caller learns about it after a round trip, with the error attributed to the wrong hop.

The fix is one keyword:

```json
"email": { "type": "string", "format": "email", "description": "..." }
```

`ajv-formats` is already installed and registered (`src/validator/ajv.js`), so this works with no new dependency. Applies to `lead_contact_person.email`, `created_by.email`, `submitted_by.email`.

**`lead_contact_person` is otherwise coherent** — verified on both sides: `{ email, name }`, both required, and the object itself required at the root. Nothing to change beyond the format.

## 8. OpenAPI (FE-6)

`src/docs/openapi.json` declares no `securitySchemes`, so the published contract advertises an open endpoint. Add the scheme and apply it to `POST /ingest`:

```json
"components": {
  "securitySchemes": {
    "ApiKeyAuth": { "type": "apiKey", "in": "header", "name": "x-api-key" }
  }
}
```

This is the document integrators read. Shipping FE-1 without it means callers discover the requirement from a `401`.

## 9. Alternatives considered

**Keep the Fetcher's key and route on `tenant`.** Zero work on the credential path. Rejected: `tenant` is self-declared, so a caller could aim PRMS callbacks at any platform it names. This is the specific attack P2-3166 Phase 1 was designed to prevent, and it would be reintroduced at the gateway.

**Fetcher holds a key per platform and picks one by `tenant`.** Keeps a single inbound credential. Rejected for the same reason — the selection is still driven by a self-declared field — plus it puts every platform's credential in the Fetcher's configuration, widening the blast radius of a Fetcher compromise from one key to all of them.

**Validate only at the Fetcher and have it assert the identity to Reporting** (e.g. a signed header). Saves the second CLARISA call. Rejected: Reporting would be trusting an upstream assertion instead of CLARISA, and its perimeter is precisely the key. It also makes Reporting's security depend on the Fetcher not being compromised.

**Validate only at Reporting, leave the Fetcher open.** Cheapest. Rejected: it moves the perimeter without creating one — an unauthenticated endpoint doing normalisation, processing and OpenSearch writes in front of an authenticated one (NFR-3, and `onecgiar_pr/docs/prd.md` AC-3's spirit).

## 10. Files

**`onecgiar_result_functions/services/fetcher`** — all of the work

| File | Change |
|---|---|
| `src/auth/clarisa-api-key.client.mjs` | **new** — CLARISA validation client |
| `src/auth/require-api-key.mjs` | **new** — Express middleware |
| `src/auth/constants.mjs` | **new** — header name, microservice name, request key |
| `src/server.mjs` | mount the middleware on `POST /ingest`; pass the key down to the client |
| `src/clients/external-api.mjs` | per-request key; forward the envelope; audit the `console.log` calls (NFR-1) |
| `src/validator/schemas/common_fields.json` | `"format": "email"` on three fields |
| `src/docs/openapi.json` | `securitySchemes` + apply to `/ingest` |
| `src/lambda.mjs` | verify the middleware applies on the Lambda path too, not only `local.mjs` |
| `README.md` | document the new requirement and the env vars |

**`onecgiar_pr`** — none. Reporting already accepts all of it.

## 11. Verification

### Fetcher

```bash
cd services/fetcher
npm run build          # esbuild bundle must still succeed
```

The cases that matter:

1. `POST /ingest` with no `x-api-key` → `401`, and **nothing** written to OpenSearch, no call to Reporting.
2. With an invalid key → `401`, same.
3. With a valid key → the request proceeds, and Reporting receives **that** key, not `EXTERNAL_API_KEY`.
4. CLARISA unreachable → `401`/`503`, never an accept (NFR-2).
5. `idempotencyKey` arrives in the outbound payload.
6. `lead_contact_person.email = "not-an-email"` → rejected at the Fetcher, no call to Reporting.
7. **No log line, response body, or S3 error payload contains the key** (NFR-1). Grep the emitted logs of a real ingest for the key value.

### End-to-end, both services

1. Register two distinct platforms in CLARISA with different keys.
2. Ingest a result through the Fetcher with platform A's key. Confirm in PRMS that `result.external_platform_id` is **A's** `mis.id` — not the Fetcher's — and that `external_reference` matches the `idempotencyKey`.
3. Repeat with platform B and confirm a different `external_platform_id`. **This is the assertion the whole spec exists for**: two platforms through one gateway must land as two identities.
4. Approve both results in PRMS. With P2-3166 endpoints registered per platform, confirm each callback goes to its own destination.
5. Retry step 2 with a key that CLARISA has revoked; confirm rejection at hop 1.
