# Request structure — `POST /ingest`

Each request must follow this structure:

```json
{
  "tenant": "prms.result-management.api",
  "op": "dataset.ingest.requested",
  "results": [
    {
      "type": "knowledge_product",
      "data": { ... }
    }
  ]
}
```

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **tenant** | string | ✅ | **Identifier of the system or instance submitting the data.** | "prms.result-management.api” |
| **op** | string | ✅ | **Operation type: create.** | "dataset.ingest.requested" |
| **results** | array | ✅ | **List of results to be processed. Each item includes type and data.** | `[ <br>{ <br>"`**`type`**`": "knowledge_product", <br>"`**`data`**`": {...} <br>} <br>]` |
| **type** | string | ✅ | **Type of result to validate (knowledge_product, policy_change, etc.).** | "knowledge_product" |
| **data** | object | ✅ | **Payload containing the result data according to its type.** | { "title": "Improved seed varieties..." } |
