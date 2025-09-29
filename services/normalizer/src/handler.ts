import crypto from "node:crypto";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const eb = new EventBridgeClient({});
const s3 = new S3Client({});
const BUS = process.env.EVENT_BUS || "xxxx";
const BUCKET = process.env.S3_BUCKET || "xxxx";
const MAX = Number(process.env.MAX_INLINE_BYTES || 200000);
const SRC = process.env.SOURCE_NS || "xxxx";
const DTYPE = process.env.DETAIL_TYPE || "xxxx";

export const handler = async (req) => {
  let body = {};
  try {
    body = req.body ? JSON.parse(req.body) : {};
  } catch {
    return r(400, { error: "invalid_json" });
  }
  if (!body.id || !body.title) return r(422, { error: "missing_fields" });

  const raw = JSON.stringify(body);
  const idem = body.id || sha(raw);
  const corr = crypto.randomUUID();

  let detail = {
    payload: body,
    idempotencyKey: idem,
    correlationId: corr,
    ts: Date.now(),
  };

  if (Buffer.byteLength(raw, "utf8") > MAX) {
    if (!BUCKET) return r(500, { error: "payload_too_large" });
    const key = `ingest/${Date.now()}-${idem}.json`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: raw,
        ContentType: "application/json",
      })
    );
    detail = {
      s3: { bucket: BUCKET, key },
      idempotencyKey: idem,
      correlationId: corr,
      ts: Date.now(),
    };
  }

  console.log("EB: putting event", {
    Source: SRC,
    DetailType: DTYPE,
    EventBusName: BUS,
    DetailPreview: detail, // o JSON.stringify(detail).slice(0,500)
  });

  const out = await eb.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: SRC,
          DetailType: DTYPE,
          EventBusName: BUS,
          Detail: JSON.stringify(detail),
        },
      ],
    })
  );

  return r(202, {
    status: "accepted",
    eventId: out.Entries?.[0]?.EventId || null,
    correlationId: corr,
  });
};

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const r = (c, b) => ({
  statusCode: c,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(b),
});
