import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import { validateApiKey } from "./auth/clarisa-api-key.client.mjs";

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
const SUMMARY_MAX_WAIT_MS = Number(process.env.SUMMARY_MAX_WAIT_MS || "10000");
const SUMMARY_DEFAULT_WAIT_SECONDS = Number(
  process.env.SUMMARY_DEFAULT_WAIT_SECONDS || "10"
);
const SUMMARY_URL_TTL_SECONDS = Number(
  process.env.SUMMARY_URL_TTL_SECONDS || "3600"
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
  const { Body } = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
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

function getHeader(headers: any, name: string) {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value as string | undefined;
  }
  return undefined;
}

// A repeated header reaches us as an array (REST v1 multiValueHeaders) or joined
// by commas (HTTP v2 collapses duplicates). Taking the first value keeps
// "key1,key2" from being sent to CLARISA as if it were one key.
function getApiKey(headers: any) {
  const raw = getHeader(headers, "x-api-key");
  const first = Array.isArray(raw) ? raw[0] : raw;
  return typeof first === "string" ? first.split(",")[0].trim() : undefined;
}

function getSourceIp(event: any) {
  const forwardedFor = getHeader(event?.headers, "x-forwarded-for");
  if (typeof forwardedFor === "string" && forwardedFor)
    return forwardedFor.split(",")[0].trim();
  const ctx = event?.requestContext;
  return ctx?.identity?.sourceIp ?? ctx?.http?.sourceIp ?? undefined;
}

export const handler = async (event: any) => {
  const apiKey = getApiKey(event.headers);
  if (!apiKey) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Missing x-api-key header" }),
    };
  }

  // Fail fast at the edge: an invalid key would otherwise be accepted with a 202
  // and only surface as a failed job after the whole pipeline had run. The
  // Fetcher still validates every request the worker sends; this does not
  // replace that check, it just refuses the work up front.
  const validation = await validateApiKey(apiKey, {
    ipAddress: getSourceIp(event),
  });

  if (validation.status === "unavailable") {
    // CLARISA could not answer. The key may well be fine, so this is retryable
    // and must not be reported as an authentication failure.
    console.error(
      `[ingestor] API key validation unavailable: ${validation.reason}`
    );
    return {
      statusCode: 503,
      headers: { "content-type": "application/json", "retry-after": "30" },
      body: JSON.stringify({
        message: "Authentication service unavailable. Retry later.",
      }),
    };
  }

  if (validation.status !== "valid") {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Invalid x-api-key" }),
    };
  }

  const body =
    typeof event.body === "string"
      ? event.body
      : JSON.stringify(event.body ?? "[]");
  const parsedBody = JSON.parse(body);
  // Accept both a bare array and an envelope with results
  const items = Array.isArray(parsedBody)
    ? parsedBody
    : Array.isArray(parsedBody?.results)
      ? parsedBody.results
      : null;

  if (!items) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Body must be an array of results or an object with a results array",
      }),
    };
  }

  // Keep the incoming envelope (tenant, op, ...) and carry the API key with it
  const rawEnvelope = Array.isArray(parsedBody)
    ? { apiKey, results: items }
    : { ...parsedBody, apiKey, results: items };

  const jobId = crypto.randomUUID();
  const key = `raw/${jobId}.json`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(JSON.stringify(rawEnvelope)),
      ContentType: "application/json",
    })
  );

  const summaryKey = getSummaryKey(jobId);

  const responseBody: any = {
    job_id: jobId,
    count: items.length,
    summary_location: {
      bucket: SUMMARY_BUCKET,
      key: summaryKey,
    },
    summary_url:
      "https://" + SUMMARY_BUCKET + ".s3.us-east-1.amazonaws.com/" + summaryKey,
  };

  return {
    statusCode: 202,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(responseBody),
  };
};

