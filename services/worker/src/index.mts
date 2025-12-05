import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
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
};
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
};
type SummaryDelta = { success: number; failures: FailureDetail[] };

async function getChunkFromEvent(
  record: any
): Promise<{ chunk: any; key: string; bucket: string }> {
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

  return { chunk: parsed, key, bucket };
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

    const totalKnown = Number.isFinite(summary.total) && summary.total > 0;
    if (totalKnown && summary.processed >= summary.total) {
      summary.status =
        summary.failureCount > 0 ? "partial_failed" : "succeeded";
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

      const res = await fetchWithTimeout(PRMS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      if (jobId !== "unknown-job") {
        const delta = ensureDelta(jobId, bucket);
        delta.failures.push({
          messageId,
          reason: err?.message || "Unknown error",
          key,
          payload,
        });
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
