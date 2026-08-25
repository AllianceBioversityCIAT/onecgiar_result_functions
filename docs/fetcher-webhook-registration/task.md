# Fetcher — expose webhook registration

> **Repo:** `onecgiar_result_functions`. Paths are relative to `services/fetcher/`.
> **Depends on:** the auth work in `docs/fetcher-ingestion-auth/` (implemented, uncommitted at time of writing).
> **Reporting side:** already built — `POST/GET /api/bilateral/webhook` on branch `P2-webhook-registration`, merged into `performance-refactor`.

## Context

A platform registers where PRMS should call it back when a Science Program approves or rejects one of its results. The endpoint exists in Reporting; this exposes it through the Fetcher so an integrator has **one base URL and one key** and never learns Reporting exists.

Nothing here validates or transforms. Reporting owns the rules: it resolves the recipient from the key, guards the URL against SSRF, and stores the row. A second copy of that logic here would be a second thing to keep in sync.

## What to build

```
POST {fetcher}/webhook   { url }   → forwards to POST /api/bilateral/webhook
GET  {fetcher}/webhook             → forwards to GET  /api/bilateral/webhook
```

Both behind `requireApiKey`, mounted at route level like `/ingest`.

### T1 — Extend the client

`src/clients/external-api.mjs` currently exposes `sendResult` / `enrichResult`, both hard-wired to `/create`. Add two thin methods next to them: `registerWebhook(url)` and `getWebhook()`.

They reuse `getRequestHeaders()` — that is the whole point, since it already carries the per-request caller key with no `EXTERNAL_API_KEY` fallback.

Two things to copy from `sendResult` and one not to:

- **Copy** the `AbortController` timeout and the `validateStatus`-free error path that captures `response.status` and the body.
- **Copy** the log shape: identifiers only. `[ExternalApiClient] Registering webhook` plus the status — **never the URL**, which is a webhook destination (`onecgiar_pr/docs/prd.md` AC-9 and `.cursorrules` name webhook URLs explicitly, and the AC5 deviation in P2-3166 exists for exactly this).
- **Do not copy** `enrichResult`'s swallow-and-return-shape. Registration is a single synchronous operation for the caller; a failure should surface as a failure, not as `{ success: false }` they have to inspect.

### T2 — Routes in `server.mjs`

Mirror the `/ingest` shape at line 54: `app.post("/webhook", requireApiKey, handler)` and the same for `GET`.

Build the client per request from `req[AUTH_REQUEST_KEY].apiKey`, exactly as `/ingest` does — including the try/catch around the constructor. The comment there explains why it exists (Express 4 hangs on a rejected promise from an async handler); the same reasoning applies unchanged.

**Pass Reporting's status through rather than flattening to 200/500.** A `400` from the URL guard is the caller's mistake and needs to read as one; collapsing it into a `500` would send them hunting a bug on our side. A `401` from Reporting after the Fetcher accepted the key means the two hops disagree — that is worth seeing as a `401`, not masked.

### T3 — OpenAPI

`src/docs/openapi.json` is the document integrators read. Add both operations, and reuse the `securitySchemes` entry the auth work added rather than declaring a second one.

Describe the ordering honestly, because the obvious assumption is wrong: **registration is not a prerequisite for submitting results.** The destination is resolved when a Science Program decides, not when a result is ingested. What matters is that a destination exists before that decision — and a decision taken with none registered is not delivered later, because no delivery row is ever created.

### T4 — README

A short "Register your callback" section: the two calls, that the key identifies the platform so there is no recipient field, and the ordering note from T3.

## Verification

```bash
cd services/fetcher
npm run build      # esbuild bundle must still succeed
npm run dev
```

1. `POST /webhook` with no key → `401` from `requireApiKey`, no call to Reporting.
2. With a valid key and a good URL → `200`, and the row appears in Reporting's `webhook_endpoint` with `recipient_id` = that platform's `mis.id`.
3. `POST` again with a different URL → the same row is updated, not a second one.
4. `POST` with `http://`, `localhost`, or `169.254.169.254` → **`400` from Reporting**, surfaced as `400`. This is the test that proves the status pass-through works and that we are not duplicating the guard.
5. `GET /webhook` before registering → whatever Reporting returns for "nothing registered", unchanged.
6. Grep the logs of a real registration for the key **and for the URL** — zero hits for both.

**End-to-end, both services:** register through the Fetcher → ingest a result with the same key → approve it in PRMS → confirm the POST arrives at the registered URL. Then register a different URL and confirm the next approval goes there.

## Out of scope

- Validating the URL here. Reporting owns it; a second copy would drift.
- A delete/disable operation. Reporting exposes none.
- The read endpoints' auth posture (`GET /result`, `GET /result/:code`) — see the review notes; unchanged by this work.
