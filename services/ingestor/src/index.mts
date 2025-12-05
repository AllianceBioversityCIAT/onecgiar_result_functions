import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "node:crypto";

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET || "my-bulk-pipeline";
const SUMMARY_BUCKET =
  process.env.SUMMARY_BUCKET ||
  process.env.BULK_BUCKET ||
  process.env.BUCKET ||
  "my-bulk-pipeline";
const SUMMARIES_PREFIX =
  (process.env.SUMMARIES_PREFIX || "summaries/").replace(/^\/+|\/+$/g, "") +
  "/";
const SUMMARY_POLL_INTERVAL_MS = Number(
  process.env.SUMMARY_POLL_INTERVAL_MS || "1000"
);
const SUMMARY_MAX_WAIT_MS = Number(
  process.env.SUMMARY_MAX_WAIT_MS || "10000"
);
const SUMMARY_DEFAULT_WAIT_SECONDS = Number(
  process.env.SUMMARY_DEFAULT_WAIT_SECONDS || "10"
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getSummaryKey(jobId: string) {
  return `${SUMMARIES_PREFIX}${jobId}/summary.json`;
}

async function headObjectOrNull(bucket: string, key: string) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err: any) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404 || err?.name === "NotFound") return null;
    throw err;
  }
}

async function getObjectJson(bucket: string, key: string) {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (Body && typeof (Body as any).transformToString === "function") {
    return JSON.parse(await (Body as any).transformToString());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of Body as any) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

async function getSummaryIfChanged(
  bucket: string,
  key: string,
  previousEtag?: string
) {
  const head = await headObjectOrNull(bucket, key);
  if (!head) return { etag: undefined, data: null };
  const etag = head.ETag;
  if (etag && previousEtag && etag === previousEtag)
    return { etag, data: null };
  const data = await getObjectJson(bucket, key);
  return { etag, data };
}

export const handler = async (event: any) => {
  const body =
    typeof event.body === "string"
      ? event.body
      : JSON.stringify(event.body ?? "[]");
  const items = JSON.parse(body);
  const jobId = crypto.randomUUID();
  const key = `raw/${jobId}.json`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(JSON.stringify(items)),
      ContentType: "application/json",
    })
  );

  const waitSeconds = SUMMARY_DEFAULT_WAIT_SECONDS;
  const timeoutMs = Math.min(waitSeconds * 1000, SUMMARY_MAX_WAIT_MS);
  const deadline = Date.now() + timeoutMs;
  const summaryKey = getSummaryKey(jobId);

  let lastEtag: string | undefined;
  let lastSummary: any = null;

  // Poll summary until ready or timeout
  while (waitSeconds > 0 && Date.now() < deadline) {
    try {
      const changed = await getSummaryIfChanged(
        SUMMARY_BUCKET,
        summaryKey,
        lastEtag
      );
      if (changed?.etag) lastEtag = changed.etag;
      if (changed?.data) {
        lastSummary = changed.data;
        if (lastSummary.status && lastSummary.status !== "running") break;
      }
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode;
      const code = err?.name || err?.code;
      console.error(
        "Error polling summary:",
        code,
        status,
        err?.message || err
      );
      break;
    }
    await sleep(SUMMARY_POLL_INTERVAL_MS);
  }

  const responseBody: any = {
    job_id: jobId,
    count: items.length,
  };

  if (lastSummary && lastSummary.status && lastSummary.status !== "running") {
    responseBody.summary = lastSummary;
    responseBody.summary_status = lastSummary.status;
    responseBody.summary_source = "poll";
  } else if (waitSeconds > 0) {
    if (lastSummary) {
      responseBody.summary = lastSummary;
      responseBody.summary_status = lastSummary.status;
    }
    responseBody.summary_pending = true;
    responseBody.summary_wait_ms = timeoutMs;
    responseBody.summary_location = {
      bucket: SUMMARY_BUCKET,
      key: summaryKey,
    };
  }

  return {
    statusCode: 202,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(responseBody),
  };
};
