# Response Examples

## Successful Request

When the payload passes validation and events are successfully published to EventBridge:

```json
{
  "ok": true,
  "message": "All results processed successfully",
  "processed": 1,
  "successful": 1,
  "failed": 0,
  "rejectedCount": 0,
  "rejected": [],
  "results": [
    {...Metadata}
}
```

**Explanation:**

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| **ok** | boolean | **Indicates if the request was processed successfully.** |
| **status** | string | **Always "accepted" when all events are validated and published.** |
| **acceptedCount** | number | **Number of accepted results.** |
| **rejectedCount** | number | **Number of rejected results due to validation errors.** |
| **failedCount** | number | **Number of results that failed for technical reasons (EventBridge, etc.).** |
| **eventIds** | array[string] | **EventBridge identifiers for successfully published events.** |
| **rejected** | array[object] | **Empty array when all results are accepted.** |
| **failed** | array[object] | **Empty array when no events failed.** |
| **requestId** | string | **AWS request trace ID for correlation and debugging.** |

---

## Warnings 🆕 2026-11

Each row in `results[]` carries the PRMS answer at `externalApiResponse.response.outcomes[]`. When PRMS creates or updates the result but leaves part of the payload out, that row lists why in `warnings`. An empty array means nothing was left out.

```json
{
  "result_code": "10070",
  "operation": "created",
  "status": "editing",
  "external_reference": "MY-REF-001",
  "warnings": [
    {
      "field": "contributing_partners",
      "index": 2,
      "code": "partner_ambiguous",
      "message": "Partner \"AARI\" matches 2 CLARISA institutions; it was not linked. Send its CLARISA institution_id.",
      "institution_id": null,
      "name": null,
      "acronym": "AARI",
      "candidate_institution_ids": [2734, 3856]
    }
  ]
}
```

| **Field** | **Description** |
| --- | --- |
| **field** | Payload section the warning is about. Today always `contributing_partners`. |
| **index** | Position of the entry in that array (0-based). |
| **code** | `partner_unresolved`, `partner_ambiguous` or `partner_is_cgiar_center`. See **Common fields → How a partner is linked**. |
| **message** | Human-readable reason. |
| **institution_id / name / acronym** | What you sent for that entry. |
| **candidate_institution_ids** | `partner_ambiguous` only: the institutions that matched. |
| **resolved_institution_id** | `partner_is_cgiar_center` only: the center the entry resolved to. |

A warning does not fail the row: `success` stays `true`. Read `warnings` on every row, fix the entry, and correct the result if needed.

---

## Validation Failure Normal API

If one or more results fail schema validation, the API will return a structured error message detailing which properties are missing or invalid.

```json
{
  "ok": false,
  "error": "validation_failed",
  "message": "Every result was rejected. See 'rejected'.",
  "acceptedCount": 0,
  "rejectedCount": 1,
  "rejected": [
    {
      "index": 0,
      "type": "knowledge_product",
      "errors": [
        "(root) must have required property 'submitted_by'"
      ]
    }
  ],
  "requestId": "Root=1-68e94068-747a2a3177dc4a6313b35cd6"
}
```

**Explanation:**

| **Field** | **Type** | **Description** |
| --- | --- | --- |
| **ok** | boolean | **Indicates the request failed validation.** |
| **error** | string | **Error type identifier (validation_failed).** |
| **message** | string | **Describes the general reason for rejection.** |
| **acceptedCount** | number | **Always 0 if no results passed validation.** |
| **rejectedCount** | number | **Number of rejected results.** |
| **rejected** | array[object] | **Detailed list of rejected entries, including index, type, and validation errors.** |
| **requestId** | string | **AWS request trace ID for correlation.** |
