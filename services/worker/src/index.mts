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

  log("info", `🪣 Reading S3: bucket=${bucket} key=${key}`);

  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const jsonText = await streamToString(obj.Body);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err: any) {
    log("error", "❌ Invalid JSON:", err?.message);
    throw err;
  }

  return { chunk: parsed, key, bucket };
}

// Wraps a single object (already normalized) in the envelope required by PRMS
function buildEnvelope(singleObject: any) {
  return {
    tenant: TENANT,
    op: OP,
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

    log("info", `💾 Error saved to S3: ${errorKey}`);
  } catch (saveErr: any) {
    log("error", `❌ Failed to save error to S3:`, saveErr?.message || saveErr);
  }
}

export const handler = async (event: any) => {
  const failures: Array<{ itemIdentifier: string }> = [];
  log("info", `🚀 SQS batch received: ${event.Records?.length || 0} messages`);

  for (const record of event.Records ?? []) {
    const messageId = record.messageId;
    let key = "";
    let bucket = BUCKET;
    let payload: any = null;

    try {
      const chunkData = await getChunkFromEvent(record);
      key = chunkData.key;
      bucket = chunkData.bucket;
      payload = buildEnvelope(chunkData.chunk);

      const preview = JSON.stringify(payload);
      log(
        "debug",
        `📤 Body to send (${key}): ${
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
        log("error", `❌ ${errorMsg}`);
        const error = new Error(errorMsg);

        // Save error to S3
        await saveErrorToS3(bucket, key, messageId, payload, error);

        throw error;
      }

      log("info", `✅ PRMS OK for ${key} (message ${messageId})`);
    } catch (err: any) {
      log("error", `🛑 Error processing ${messageId}:`, err?.message || err);

      // Save error to S3 if we have the necessary data
      if (key && payload) {
        await saveErrorToS3(bucket, key, messageId, payload, err);
      }

      failures.push({ itemIdentifier: messageId });
    }
  }

  if (failures.length) log("warn", `⚠️ Failed messages: ${failures.length}`);
  else log("info", "🏁 Batch processed successfully.");

  // SQS partial batch response
  return { batchItemFailures: failures };
};
