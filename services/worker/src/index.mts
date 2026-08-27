import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

const s3 = new S3Client({});
const fetchFn = globalThis.fetch;

// ENV (all as strings)
const BUCKET = process.env.BUCKET || "XXX";
const PRMS_URL = process.env.PRMS_URL || "XXX";
const TENANT = process.env.TENANT || "XXX";
const OP = process.env.OP || "XXX";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || "15000");
const SUMMARIES_PREFIX =
  (process.env.SUMMARIES_PREFIX || "summaries/").replace(/^\/+|\/+$/g, "") +
  "/";
const SUMMARY_FAILURE_SAMPLE_LIMIT = Number(
  process.env.SUMMARY_FAILURE_SAMPLE_LIMIT || "20"
);
const SUCCESSES_PREFIX =
  (process.env.SUCCESSES_PREFIX || "successes/").replace(/^\/+|\/+$/g, "") +
  "/";
const FAILURES_PREFIX =
  (process.env.FAILURES_PREFIX || "failures/").replace(/^\/+|\/+$/g, "") + "/";
const DETAIL_READ_CONCURRENCY = Number(
  process.env.DETAIL_READ_CONCURRENCY || "25"
);

function log(level: "debug" | "info" | "warn" | "error", ...args: unknown[]) {
  const order = { debug: 0, info: 1, warn: 2, error: 3 } as const;
  const cur =
    (LOG_LEVEL as keyof typeof order) in order
      ? order[LOG_LEVEL as keyof typeof order]
      : 1;
  if (order[level] >= cur)
    console[level === "error" ? "error" : level](...args);
}

async function streamToString(stream: any): Promise<string> {
  const src = stream instanceof Readable ? stream : Readable.fromWeb(stream);
  const chunks: Buffer[] = [];
  for await (const chunk of src) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}

type FailureDetail = {
  messageId: string;
  reason: string;
  key?: string;
  payload?: any;
  external_reference?: string | null;
  type?: string;
};
type SuccessDetail = {
  messageId: string;
  key: string;
  external_reference: string | null;
  result_code: number | null;
  result_id?: number;
  type?: string;
};
type DetailsLocation = { bucket: string; key: string };
type JobSummary = {
  jobId: string;
  status: string;
  total: number;
  processed: number;
  successCount: number;
  failureCount: number;
  failuresDetail: FailureDetail[];
  createdAt: string;
  updatedAt: string;
  bucket?: string;
  rawKey?: string;
  chunksPrefix?: string;
  successesPrefix?: string;
  failuresPrefix?: string;
  successDetailsLocation?: DetailsLocation;
  failureDetailsLocation?: DetailsLocation;
};
type SummaryDelta = { success: number; failures: FailureDetail[] };

async function getChunkFromEvent(
  record: any
): Promise<{ chunk: any; apiKey?: string; key: string; bucket: string }> {
  const body = JSON.parse(record.body);
  const s3Event = body?.Records?.[0];
  if (!s3Event) throw new Error("Invalid SQS message (no S3 event)");

  const bucket = s3Event.s3.bucket.name || BUCKET;
  const key = decodeURIComponent(
    String(s3Event.s3.object.key).replace(/\+/g, " ")
  );

  log("info", `Reading S3: bucket=${bucket} key=${key}`);

  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const jsonText = await streamToString(obj.Body);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err: any) {
    log("error", "Invalid JSON:", err?.message);
    throw err;
  }

  // Chunks carrying an API key are wrapped as { apiKey, result } by the splitter
  const wrapped =
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    typeof parsed.apiKey === "string" &&
    parsed.result !== undefined;

  return {
    chunk: wrapped ? parsed.result : parsed,
    apiKey: wrapped ? parsed.apiKey : undefined,
    key,
    bucket,
  };
}

// Wraps a single object (already normalized) in the envelope required by PRMS
function buildEnvelope(singleObject: any, jobId: string) {
  return {
    tenant: TENANT,
    op: OP,
    jobId,
    results: [singleObject],
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Extract jobId from S3 key (e.g., "chunks/833a2c20-0372-4501-a5b8-93b721b38285/part-00001.json" -> "833a2c20-0372-4501-a5b8-93b721b38285")
function extractJobId(key: string): string {
  const match = key.match(/chunks\/([^\/]+)\//);
  return match ? match[1] : "unknown-job";
}

function getSummaryKey(jobId: string) {
  return `${SUMMARIES_PREFIX}${jobId}/summary.json`;
}

async function getJobSummary(bucket: string, jobId: string): Promise<JobSummary> {
  const key = getSummaryKey(jobId);
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const jsonText = await streamToString(obj.Body);
    const parsed = JSON.parse(jsonText);
    // Normalize legacy failureSamples -> failuresDetail
    if (!parsed.failuresDetail && Array.isArray(parsed.failureSamples)) {
      parsed.failuresDetail = parsed.failureSamples;
    }
    parsed.failuresDetail = Array.isArray(parsed.failuresDetail)
      ? parsed.failuresDetail
      : [];
    return parsed;
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === "NoSuchKey") {
      const nowIso = new Date().toISOString();
      return {
        jobId,
        status: "running",
        total: 0,
        processed: 0,
        successCount: 0,
        failureCount: 0,
        failuresDetail: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }
    throw err;
  }
}

async function saveJobSummary(
  bucket: string,
  jobId: string,
  summary: JobSummary
): Promise<void> {
  // Clean legacy field to avoid duplicate keys
  if ((summary as any).failureSamples) delete (summary as any).failureSamples;
  const key = getSummaryKey(jobId);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(summary, null, 2),
      ContentType: "application/json",
    })
  );
  log("debug", `Summary saved for job ${jobId} at ${key}`);
}

async function applySummaryDelta(
  bucket: string,
  jobId: string,
  delta: SummaryDelta
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const summary = await getJobSummary(bucket, jobId);

    const successDelta = delta.success ?? 0;
    const failureDelta = delta.failures?.length ?? 0;

    summary.successCount = (summary.successCount || 0) + successDelta;
    summary.failureCount = (summary.failureCount || 0) + failureDelta;
    summary.processed = (summary.successCount || 0) + (summary.failureCount || 0);

    // Normalize legacy failureSamples -> failuresDetail
    if (!summary.failuresDetail && Array.isArray((summary as any).failureSamples)) {
      summary.failuresDetail = (summary as any).failureSamples;
    }

    const existingSamples = Array.isArray(summary.failuresDetail)
      ? summary.failuresDetail
      : [];
    const newSamples = delta.failures ?? [];

    summary.failuresDetail = [...newSamples, ...existingSamples].slice(
      0,
      SUMMARY_FAILURE_SAMPLE_LIMIT
    );

    summary.total = Number(summary.total || 0);
    summary.createdAt = summary.createdAt || nowIso;
    summary.updatedAt = nowIso;

    summary.successesPrefix = `${SUCCESSES_PREFIX}${jobId}/`;
    summary.failuresPrefix = `${FAILURES_PREFIX}${jobId}/`;

    const totalKnown = Number.isFinite(summary.total) && summary.total > 0;
    if (totalKnown && summary.processed >= summary.total) {
      summary.status =
        summary.failureCount > 0 ? "partial_failed" : "succeeded";

      try {
        summary.successDetailsLocation = await consolidateDetails(
          bucket,
          jobId,
          SUCCESSES_PREFIX,
          "success-details.json"
        );
        summary.failureDetailsLocation = await consolidateDetails(
          bucket,
          jobId,
          FAILURES_PREFIX,
          "failure-details.json"
        );
      } catch (err: any) {
        // The per-chunk prefixes stay readable, so reconciliation is still
        // possible without the consolidated files.
        log(
          "error",
          `Failed to consolidate details for job ${jobId}:`,
          err?.message || err
        );
      }
    } else if (!summary.status) {
      summary.status = "running";
    }

    log(
      "info",
      `Updating summary for job=${jobId} in bucket=${bucket} -> status=${summary.status}, total=${summary.total}, processed=${summary.processed}, success=${summary.successCount}, failures=${summary.failureCount}`
    );

    await saveJobSummary(bucket, jobId, summary);
  } catch (err: any) {
    log(
      "error",
      `Failed to update summary for job ${jobId}:`,
      err?.message || err
    );
  }
}

// --- Reconciliation details ------------------------------------------------
// One object per chunk, so a redelivery overwrites its own record instead of
// appending a duplicate. The key mirrors the chunk that produced it:
//   chunks/<jobId>/part-00001.json -> successes|failures/<jobId>/part-00001.json
function getDetailKey(prefix: string, jobId: string, chunkKey: string) {
  const part = chunkKey.split("/").pop();
  return `${prefix}${jobId}/${part || "unknown.json"}`;
}

function getConsolidatedKey(jobId: string, name: string) {
  return `${SUMMARIES_PREFIX}${jobId}/${name}`;
}

// Pulls what PRMS echoed back for the single result carried by this chunk.
// Nothing is invented: a field the response does not carry stays null, except
// external_reference, which falls back to the value we sent in the chunk.
function buildSuccessDetail(
  parsedBody: any,
  chunk: any,
  key: string,
  messageId: string
): SuccessDetail {
  const row = parsedBody?.results?.[0] ?? {};
  const enriched = row?.result ?? {};
  const sent = chunk?.data ?? chunk ?? {};

  const externalReference =
    row.external_reference ??
    enriched.external_reference ??
    enriched.data?.external_reference ??
    sent.external_reference ??
    null;
  const resultCode = enriched.result_code ?? row.result_code ?? null;
  const resultId = enriched.result_id ?? row.result_id;
  const type = row.resultType ?? enriched.type ?? chunk?.type;

  return {
    messageId,
    key,
    external_reference: externalReference,
    result_code: resultCode,
    ...(resultId !== undefined ? { result_id: resultId } : {}),
    ...(type !== undefined ? { type } : {}),
  };
}

// Compact record for reconciliation. The full payload stays out of it: it is
// already kept by saveErrorToS3 under errors/<jobId>/.
function buildFailureDetail(
  messageId: string,
  reason: string,
  key: string,
  payload: any
): FailureDetail {
  const sent = payload?.results?.[0] ?? {};
  const data = sent?.data ?? sent ?? {};
  return {
    messageId,
    reason,
    key,
    external_reference: data?.external_reference ?? null,
    ...(sent?.type !== undefined ? { type: sent.type } : {}),
  };
}

async function saveDetail(
  bucket: string,
  prefix: string,
  jobId: string,
  chunkKey: string,
  detail: SuccessDetail | FailureDetail
) {
  if (jobId === "unknown-job" || !chunkKey) {
    log("warn", `Skipping detail record (jobId=${jobId}, key=${chunkKey})`);
    return;
  }
  const key = getDetailKey(prefix, jobId, chunkKey);
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(detail),
        ContentType: "application/json",
      })
    );
    log("debug", `Detail saved at ${key}`);
  } catch (err: any) {
    // Reconciliation is best-effort: never fail a message that PRMS accepted,
    // a redelivery would post it twice.
    log("error", `Failed to save detail ${key}:`, err?.message || err);
  }
}

async function listDetailKeys(bucket: string, prefix: string) {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page: any = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const obj of page?.Contents ?? []) if (obj?.Key) keys.push(obj.Key);
    token = page?.IsTruncated ? page?.NextContinuationToken : undefined;
  } while (token);
  return keys.sort();
}

// Compacts the per-chunk objects into a single file next to summary.json.
// The per-chunk prefix stays the source of truth; `count` lets a consumer
// check this file against the summary counters.
async function consolidateDetails(
  bucket: string,
  jobId: string,
  prefix: string,
  outName: string
): Promise<DetailsLocation | undefined> {
  const keys = await listDetailKeys(bucket, `${prefix}${jobId}/`);
  const records: any[] = [];

  for (let i = 0; i < keys.length; i += DETAIL_READ_CONCURRENCY) {
    const batch = keys.slice(i, i + DETAIL_READ_CONCURRENCY);
    const parsed = await Promise.all(
      batch.map(async (key) => {
        try {
          const obj = await s3.send(
            new GetObjectCommand({ Bucket: bucket, Key: key })
          );
          return JSON.parse(await streamToString(obj.Body));
        } catch (err: any) {
          log("error", `Failed to read detail ${key}:`, err?.message || err);
          return null;
        }
      })
    );
    records.push(...parsed.filter((r) => r !== null));
  }

  const key = getConsolidatedKey(jobId, outName);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify({ jobId, count: records.length, results: records }, null, 2),
      ContentType: "application/json",
    })
  );
  log("info", `Consolidated ${records.length} records at ${key}`);
  return { bucket, key };
}

// Save error details to S3
async function saveErrorToS3(
  bucket: string,
  key: string,
  messageId: string,
  payload: any,
  error: any
) {
  try {
    const jobId = extractJobId(key);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const errorKey = `errors/${jobId}/${timestamp}-${messageId}.json`;

    const errorData = {
      timestamp: new Date().toISOString(),
      jobId,
      messageId,
      originalKey: key,
      error: {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      },
      payload,
    };

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: errorKey,
        Body: JSON.stringify(errorData, null, 2),
        ContentType: "application/json",
      })
    );

    log("info", `Error saved to S3: ${errorKey}`);
  } catch (saveErr: any) {
    log("error", `Failed to save error to S3:`, saveErr?.message || saveErr);
  }
}

export const handler = async (event: any) => {
  const failures: Array<{ itemIdentifier: string }> = [];
  const summaryDeltas = new Map<
    string,
    { bucket: string; success: number; failures: FailureDetail[] }
  >();
  log("info", `SQS batch received: ${event.Records?.length || 0} messages`);

  const ensureDelta = (jobId: string, bucket: string) => {
    if (!summaryDeltas.has(jobId))
      summaryDeltas.set(jobId, { bucket, success: 0, failures: [] });
    return summaryDeltas.get(jobId)!;
  };

  for (const record of event.Records ?? []) {
    const messageId = record.messageId;
    let key = "";
    let bucket = BUCKET;
    let jobId = "unknown-job";
    let payload: any = null;

    try {
      const chunkData = await getChunkFromEvent(record);
      key = chunkData.key;
      bucket = chunkData.bucket;
      jobId = extractJobId(key);
      payload = buildEnvelope(chunkData.chunk, jobId);

      const preview = JSON.stringify(payload);
      log(
        "debug",
        `Body to send (${key}): ${
          preview.length > 2000
            ? preview.slice(0, 2000) + " ... [truncated]"
            : preview
        }`
      );

      if (!chunkData.apiKey) {
        log("warn", `No API key in chunk ${key}; sending request without x-api-key`);
      }

      const res = await fetchWithTimeout(PRMS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(chunkData.apiKey ? { "x-api-key": chunkData.apiKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        const errorMsg = `PRMS responded ${res.status}: ${txt.substring(
          0,
          500
        )}`;
        log("error", errorMsg);
        throw new Error(errorMsg);
      }

      // Even with 2xx, PRMS could signal logical failures in the body (e.g., duplicates).
      const resBody = await res.text();
      let parsedBody: any = null;
      if (resBody) {
        try {
          parsedBody = JSON.parse(resBody);
        } catch {
          // Ignore non-JSON body
          log("debug", "Non-JSON PRMS body, treating as success");
        }
      }

      if (parsedBody) {
        const logicalError =
          parsedBody?.ok === false ||
          parsedBody?.error ||
          parsedBody?.failed > 0 ||
          parsedBody?.failureCount > 0 ||
          (parsedBody?.successful === 0 && parsedBody?.total > 0);
        if (logicalError) {
          const logicalMsg = `PRMS logical error (status ${res.status}): ${resBody.substring(
            0,
            500
          )}`;
          log("error", logicalMsg);
          throw new Error(logicalMsg);
        }
      }

      log("info", `PRMS OK for ${key} (message ${messageId})`);

      await saveDetail(
        bucket,
        SUCCESSES_PREFIX,
        jobId,
        key,
        buildSuccessDetail(parsedBody, chunkData.chunk, key, messageId)
      );

      if (jobId !== "unknown-job") {
        const delta = ensureDelta(jobId, bucket);
        delta.success += 1;
      }
    } catch (err: any) {
      log("error", `Error processing ${messageId}:`, err?.message || err);

      // Save error to S3 only once (here in the catch block)
      if (key && payload) {
        await saveErrorToS3(bucket, key, messageId, payload, err);
      }

      const failureDetail = buildFailureDetail(
        messageId,
        err?.message || "Unknown error",
        key,
        payload
      );
      await saveDetail(bucket, FAILURES_PREFIX, jobId, key, failureDetail);

      if (jobId !== "unknown-job") {
        const delta = ensureDelta(jobId, bucket);
        delta.failures.push({ ...failureDetail, payload });
      }

      failures.push({ itemIdentifier: messageId });
    }
  }

  if (failures.length) log("warn", `Failed messages: ${failures.length}`);
  else log("info", "Batch processed successfully.");

  if (summaryDeltas.size) {
    await Promise.all(
      [...summaryDeltas.entries()].map(([jobId, delta]) =>
        applySummaryDelta(delta.bucket || BUCKET, jobId, {
          success: delta.success,
          failures: delta.failures,
        })
      )
    );
  }

  // SQS partial batch response
  return { batchItemFailures: failures };
};
