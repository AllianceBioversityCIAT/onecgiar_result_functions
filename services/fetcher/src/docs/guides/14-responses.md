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
