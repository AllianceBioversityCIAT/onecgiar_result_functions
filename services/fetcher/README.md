# PRMS Fetcher Service - v2.0.0

🚀 **PRMS Results Ingestion, Validation, and Processing Service**

This service validates, normalizes, processes and stores research results for the CGIAR PRMS (Performance and Results Management System).

## 🎯 What's New in v2.0

**Major architectural change:** Unified synchronous processing pipeline!

- ✅ **Eliminated EventBridge** - Direct synchronous processing
- ✅ **Unified Service** - Validation + External API + OpenSearch in one call
- ✅ **Immediate Feedback** - Complete response with processing results
- ✅ **Simplified Architecture** - One service instead of two
- ✅ **Better Observability** - Detailed logs in response

**Before (v1.x):**
```
POST /ingest → Validate → EventBridge → 202 Accepted
                               ↓ (async)
                          Loader Lambda
```

**Now (v2.0):**
```
POST /ingest → Validate → Process → External API → OpenSearch → 200 OK
```

**HTTP surface (this service):**
```
GET  /result, GET /result/{code}  → OpenSearch
POST /ingest                      → validate, process, external API, OpenSearch  (requires x-api-key)
POST /version                     → carry an approved result into the current phase (requires x-api-key)
POST /webhook, GET /webhook       → register / read your callback destination     (requires x-api-key)
GET  /health, GET /openapi.json, GET /docs
```

Bulk sync, single-result PATCH update, and DELETE are **not** exposed here (use the separate sync/other services).

---

## 🔁 Continuing a result in a new phase

An approved result does not have to be re-reported from scratch each year. `POST /version`
carries it into the open reporting phase, keeping the same result code so the trace between
phases survives:

```bash
curl -X POST "$FETCHER_URL/version" \
  -H "x-api-key: $YOUR_CLARISA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"result_code":"28565","external_reference":"STAR-9f2c-4471"}'
```

**Send only the result code.** It is stable across phases, so PRMS resolves which version to
continue and derives the target Science Program from the result itself — there is no internal
id to keep and no programme to look up. `external_reference` is optional and comes back
verbatim, as everywhere else.

**The new version lands in `Draft`.** This continues a result; it does not report on it.
Whoever edits it next — through the API or in the PRMS reporting tool — is who submits it for
review, and that submission is what starts the Science Program's approval workflow. The
decision then reaches you through your registered callback, so the previous section applies
unchanged.

A result is carried forward **once**. If a version already exists in the current phase there
is nothing left to do and the call is refused.

**What gets refused, and why it says so:** the result must exist, must not live only in the
current phase, must not already have a version there, must have arrived through this API,
must be **approved**, and must belong to you — the platform that reported a result is the one
that may continue it. **Knowledge Products cannot be carried forward at all**: their metadata
is owned by CGSpace, so a new knowledge product is reported with its own handle instead.

Every refusal names the rule it hit rather than failing generically, so the message is the
thing to read before retrying.

---

## 🔔 Register your callback

PRMS POSTs to a URL of your choosing when a Science Program approves or rejects one of your
results. Register it once:

```bash
curl -X POST "$FETCHER_URL/webhook" \
  -H "x-api-key: $YOUR_CLARISA_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-platform.example.org/prms/callback"}'
```

`GET /webhook` returns what is currently registered.

**There is no recipient field.** The destination is bound to the platform that owns the API key, so
you can only ever register your own — and calling `POST` again replaces your URL rather than adding
a second one.

**Registering is not a prerequisite for submitting results.** The destination is looked up when a
Science Program *decides* on a result, not when the result is ingested — and those can be days
apart. What matters is that a destination exists before that decision: a decision taken while none
is registered is not delivered afterwards, because no delivery is ever queued for it.

The URL must be `https` and publicly reachable. Addresses inside private networks are refused.

### Matching a callback to your own record

Send `external_reference` inside each result's `data` when you ingest — your consecutive number,
your UUID, whatever your system already uses:

```json
{ "type": "knowledge_product", "data": { "external_reference": "STAR-9f2c-4471", "...": "..." } }
```

PRMS stores it verbatim and hands it back verbatim, at the top level of the decision callback and in
the ingest response. No prefix, no parsing.

In the ingest response it comes back on **every** row, whatever happened to it:

| Where | Field |
|---|---|
| A row that was processed (success or failure) | `results[].external_reference` |
| A row rejected before processing (schema, missing `type`/`data`) | `rejected[].external_reference` |
| Decision webhook | `external_reference` (top level) |

A rejected row is the one you most need to find again — it is the row you have to show your own
user — so it carries the reference alongside its `index` and errors.

**It is optional and stays optional.** Not every producer has such an id, and a bilateral result
created inside the PRMS UI has no external system behind it at all — those carry `null`, which is
the honest answer rather than an invented value.

But without it you cannot correlate: the callback tells you *what* was decided and *why*, and
nothing that points at your row.

---

## 🔐 Authentication

`POST /ingest` **requires** an `x-api-key` header carrying the calling platform's CLARISA API key.

```bash
curl -X POST https://<host>/ingest \
  -H 'content-type: application/json' \
  -H 'x-api-key: <your CLARISA API key>' \
  -d '{ "tenant": "your-platform", "results": [ ... ] }'
```

The key is validated against CLARISA on every request and then **forwarded unchanged** to PRMS
Reporting. That is the point: Reporting resolves *which platform* reported a result from the key
itself, so results submitted through this gateway keep the identity of their originating platform
instead of this service's. The `tenant` field in the body is caller-declared and is used only for
traceability — never for identity.

| Response | Meaning |
|---|---|
| `401` | No key, or CLARISA says the key is not valid |
| `503` | CLARISA could not be reached. Retryable — see `Retry-After`. Never an accept |

Requests are rejected before any validation, normalisation, processing or indexing happens.

**Required environment variable:** `CLA_VALIDATE_URL` (CLARISA base URL). Without it the service
rejects every ingest request with `503` and logs an error once at startup of the first request.
`EXTERNAL_API_KEY` is no longer used by the ingestion path.

The read endpoints (`GET /result`, `GET /result/{code}`) are currently open.

---

For complete documentation, including:
- Result types and schemas
- Request/response examples
- OpenSearch integration
- Deployment guide
- Migration guide from v1.x

Please see the old README.md or visit `/docs` endpoint for interactive API documentation.

---

**Version**: 2.0.0  
**Last Updated**: 2024-12-03  
**Node Version**: 20+  
**Developed with ❤️ for CGIAR**
