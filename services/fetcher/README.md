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
POST /webhook, GET /webhook       → register / read your callback destination     (requires x-api-key)
GET  /health, GET /openapi.json, GET /docs
```

Bulk sync, single-result PATCH update, and DELETE are **not** exposed here (use the separate sync/other services).

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
