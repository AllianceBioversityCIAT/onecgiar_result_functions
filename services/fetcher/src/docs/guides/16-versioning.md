# Versioning — `POST /version`


Use this when a result reported in a **previous phase** also needs to be reported in the **current phase**. The new version keeps the same `result_code`; the previous version is left untouched.

**Request**

```json
{
  "result_code": "28565",
  "external_reference": "STAR-9f2c-4471"
}
```

| Field | Required | Description |
| --- | --- | --- |
| `result_code` | Yes | PRMS result code of the result in the previous phase. It is the same code shown in the reporting tool and it does not change across phases. |
| `external_reference` | No | Your own id for this record, echoed back verbatim in the response so you can match it. |

**Eligibility**

The result must meet all of these conditions:

- It exists and is active in a **previous** phase.
- It is a **W3/Bilateral** result.
- It is **not a Knowledge Product**. To report a KP in a new phase, send it with its own CGSpace handle.
- It is **Approved** in the previous phase.
- It has **not** already been carried into the current phase.
- It was reported by **your platform**. Only the platform that reported a result can carry it forward.

**What happens**

- A new version is created in the open reporting phase with the **same `result_code`**, copied from the approved version.
- The new version starts in **Editing**. The centre completes or updates it in PRMS and then submits it for review.
- The request carries **no result data**. Content changes are made in PRMS.

**Response (success)**

```json
{
  "result_code": "28565",
  "external_reference": "STAR-9f2c-4471",
  "previous": { "result_id": 11422, "phase_id": 35 },
  "current": {
    "result_id": 12877,
    "phase_id": 36,
    "phase_name": "Reporting 2026",
    "status": "Editing",
    "status_id": 1
  }
}
```

**Errors**

| HTTP | When |
| --- | --- |
| 400 | `result_code` is missing, or the result is not W3/Bilateral |
| 403 | The result was reported by another platform, or its lead centre is outside your scope |
| 404 | No active result exists for that `result_code` |
| 409 | The result is already in the current phase, only exists in the current phase, is a Knowledge Pro |
