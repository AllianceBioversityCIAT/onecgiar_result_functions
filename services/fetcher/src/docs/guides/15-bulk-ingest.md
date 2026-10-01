# Bulk Ingest

The **Bulk Ingest API** processes results asynchronously. When a request is successfully authenticated and accepted, the API returns a `202 Accepted` response with a `job_id` and the location of the job summary.

The `job_id` can be used to track the processing outcome and reconcile the submitted results.

  
✅ Job Accepted — `202`

```text
{
  "job_id":"415d86bf-d2a3-4955-8cc0-1037051f31de",
  "summary_location": {
    "bucket":"my-bulk-pipeline",
    "key":"summaries/415d86bf-d2a3-4955-8cc0-1037051f31de/summary.json"
  },
  "summary_url":"https://my-bulk-pipeline.s3.us-east-1.amazonaws.com/summaries/415d86bf-d2a3-4955-8cc0-1037051f31de/summary.json"
}
```

> ℹ️ A `202` response means that the job was **accepted for asynchronous processing**. It does not mean that every result was successfully ingested.

**🔐 Authentication Errors**

The `x-api-key` is validated against **CLARISA before the bulk job is created**.

| HTTP | Meaning |
| --- | --- |
| `401` | The `x-api-key` header is missing, or the API key is invalid. The job is not created. |
| `503` | CLARISA could not be reached, or the API key could not be validated due to a temporary authentication service issue. The job is not created, and the request may be retried. |

Rejected authentication requests do **not** generate a `job_id` or start the Bulk Ingest pipeline.  
  
📊 Job Summary

Once processing starts, the job status and processing counters are available in `summary.json`.

The summary includes the number of successfully processed and failed results and provides locations for the detailed reconciliation files.

The job can have the following statuses:

- `running` — processing is still in progress.
- `succeeded` — all results were processed successfully.
- `partial_failed` — processing completed, but one or more results failed.
For completed jobs, the summary provides access to:

- `success-details.json` — details of successfully processed results.
- `failure-details.json` — details of results that could not be processed.
