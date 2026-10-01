# Quickstart

Everything you need before your first call: where the API lives and how to authenticate with your API key.

## Service URLs — Production

| **Description** | **URL** | Type |
| --- | --- | --- |
| **API Reference (this page)** | [https://v6a9z2e4y5.execute-api.us-east-1.amazonaws.com/docs](https://v6a9z2e4y5.execute-api.us-east-1.amazonaws.com/docs) | **Documentation** |
| **API Normal Ingest (Recommended for submitting a single result)** | [https://v6a9z2e4y5.execute-api.us-east-1.amazonaws.com/](https://v6a9z2e4y5.execute-api.us-east-1.amazonaws.com/ingest) | **1-10 Results** |
| **API Bulk Ingest (Recommended for sending multiple results)** | [https://bla4fsvgni.execute-api.us-east-1.amazonaws.com/ingest](https://bla4fsvgni.execute-api.us-east-1.amazonaws.com/ingest) | Bulk Upload |

## Service URLs — Test

| **Description** | **URL** | Type |
| --- | --- | --- |
| **API Reference (this page)** | [https://v2f4lv8av4.execute-api.us-east-1.amazonaws.com/docs/](https://v2f4lv8av4.execute-api.us-east-1.amazonaws.com/docs/#/default/post_ingest) | **Documentation** |
| **API Normal Ingest (Recommended for submitting a single result)** | [https://v2f4lv8av4.execute-api.us-east-1.amazonaws.com/](https://v2f4lv8av4.execute-api.us-east-1.amazonaws.com/) | **1-10 Results** |
| **API Bulk Ingest (Recommended for sending multiple results)** | [https://0w16ghmybe.execute-api.us-east-1.amazonaws.com](https://0w16ghmybe.execute-api.us-east-1.amazonaws.com/)[/ingest](https://v2f4lv8av4.execute-api.us-east-1.amazonaws.com/ingest) | **Bulk Upload** |

---

## Authentication

Every call to the **Normal Ingest API and Bulk Ingest API** requires a CLARISA API key in the `x-api-key` header.  
There is no anonymous access and no `Authorization: Bearer` alternative.

For Bulk Ingest, the key is validated before the job is accepted. An invalid or missing key does not create a bulk job.

| **Endpoint** | **Key required** |
| --- | --- |
| `POST /ingest` | ✅ |
| `POST /webhook` <br>`GET /webhook` | ✅ |
| `GET /docs` <br>`GET /openapi.json` <br>`GET /health` | ❌ Open |

```bash
curl -X POST "<Normal Ingest URL>/ingest" \
  -H "x-api-key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d @payload.json
```

## How to get your key

**Keys are issued by the PRMS team — one per tool and per environment.** Do not reuse a key across tools, and do not share it between environments: your key is what identifies your platform, so a shared key makes two systems indistinguishable to PRMS.

Request yours before you start testing:

- Open a ticket with **PRMS Tech Support**, or
- Contact the PRMS team directly.
Tell us which tool it is for (STAR, MEL, TIP, …) and which environment you need (TEST or PRODUCTION).

## Your key is your identity

PRMS resolves your platform from the key on every call. Two consequences worth knowing:

- **Webhook registration needs no platform field.** You cannot register a callback destination for anybody but yourself, and nobody can register one for you.
- **`external_reference` round-trips per platform.** The identifier you send comes back to you, and only to you.

## Error responses

| **HTTP** | **Body** | **What it means** |
| --- | --- | --- |
| **401** | `{"ok": false, "error": "unauthorized", "message": "Unauthorized", "requestId": "…"}` | No key sent, or CLARISA says the key is not valid. Do not retry — fix the key. |
| **503** | `{"ok": false, "error": "…", "message": "…", "requestId": "…"}` | CLARISA could not be reached to validate your key. **Retryable** — your key may be perfectly fine. |

> The `requestId` in the body is the one to quote when you contact support about a rejected call.
