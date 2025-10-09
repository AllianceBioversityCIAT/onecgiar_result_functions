import crypto from "node:crypto";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const eb = new EventBridgeClient({});
const s3 = new S3Client({});

const BUS = process.env.EVENT_BUS || "xxxx";
const BUCKET = process.env.S3_BUCKET || "";
const MAX = Number(process.env.MAX_INLINE_BYTES || 200000);

export async function buildDetailWithOffload(payload) {
  const raw = JSON.stringify(payload);
  const idem = payload.idempotencyKey || sha(raw);
  const corr = payload.correlationId || crypto.randomUUID();

  if (Buffer.byteLength(raw, "utf8") > MAX) {
    if (!BUCKET) throw new Error("payload_too_large_and_no_bucket");
    const key = `ingest/${Date.now()}-${idem}.json`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: raw,
        ContentType: "application/json",
      })
    );
    return {
      detail: {
        s3: { bucket: BUCKET, key },
        idempotencyKey: idem,
        correlationId: corr,
        ts: Date.now(),
      },
      offloaded: true,
    };
  }

  return {
    detail: {
      payload,
      idempotencyKey: idem,
      correlationId: corr,
      ts: Date.now(),
    },
    offloaded: false,
  };
}

export async function putEventsBatch(entries) {
  const chunks = chunk(entries, 10);
  const results = [];
  for (const c of chunks) {
    const out = await eb.send(new PutEventsCommand({ Entries: c }));
    results.push(out);
  }
  return results;
}

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
