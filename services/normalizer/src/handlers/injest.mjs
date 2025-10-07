import crypto from "node:crypto";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const eb = new EventBridgeClient({});
const s3 = new S3Client({});

const BUS = process.env.EVENT_BUS || "prms-ingestion-bus";
const BUCK = process.env.S3_BUCKET || "";
const MAX = Number(process.env.MAX_INLINE_BYTES || 200000);
const SRCNS = process.env.SOURCE_NS || "client";
const DEFOP = (process.env.DEFAULT_OP || "create").toLowerCase();

export const handler = async (req) => {
  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return resp(400, { ok: false, error: "invalid_json" });
  }

  // --- wrapper esperado: { tenant, op?, results: [{ type, op?, data }] }
  const tenant = (body.tenant || "unknown").toLowerCase();
  const opDefault = (body.op || DEFOP).toLowerCase();
  const list = Array.isArray(body.results)
    ? body.results
    : body.results
    ? [body.results]
    : [];

  if (!list.length) {
    return resp(422, { ok: false, error: "results_required" });
  }

  // Construimos entradas EB (1 evento por item)
  const entries = [];
  const rejected = [];

  for (let i = 0; i < list.length; i++) {
    const it = list[i] || {};
    const type = String(it.type || "").toLowerCase();
    const op = String(it.op || opDefault).toLowerCase();
    const data = it.data;

    if (!type) {
      rejected.push({ index: i, reason: "type_required" });
      continue;
    }
    if (!data || typeof data !== "object") {
      rejected.push({ index: i, type, reason: "data_required" });
      continue;
    }

    // Aquí podrías normalizar o validar; por ahora solo embalamos lo recibido
    const idemp = `${tenant}:${type}:${op}:${safeId(data)}`;
    const corr = crypto.randomUUID();
    const payload = {
      ...data,
      tenant,
      type,
      op,
      received_at: new Date().toISOString(),
      idempotency_key: idemp,
      correlation_id: corr,
    };

    // Si excede MAX → offload a S3
    const raw = JSON.stringify(payload);
    let detailObj = {
      payload,
      idempotencyKey: idemp,
      correlationId: corr,
      ts: Date.now(),
    };

    if (Buffer.byteLength(raw, "utf8") > MAX) {
      if (!BUCK)
        return resp(500, {
          ok: false,
          error: "payload_too_large_and_no_bucket",
        });
      const key = `ingest/${Date.now()}-${sha(idemp)}.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCK,
          Key: key,
          Body: raw,
          ContentType: "application/json",
        })
      );
      detailObj = {
        s3: { bucket: BUCK, key },
        idempotencyKey: idemp,
        correlationId: corr,
        ts: Date.now(),
      };
    }

    entries.push({
      Source: `${SRCNS}.${tenant}`, // p.ej. client.star
      DetailType: `${type}.${op}`, // p.ej. knowledge_product.create
      EventBusName: BUS,
      Detail: JSON.stringify(detailObj),
    });
  }

  if (!entries.length) {
    return resp(422, { ok: false, error: "all_items_invalid", rejected });
  }

  // Publicamos en lotes de 10
  const outs = [];
  for (let i = 0; i < entries.length; i += 10) {
    const chunk = entries.slice(i, i + 10);
    const out = await eb.send(new PutEventsCommand({ Entries: chunk }));
    outs.push(out);
  }

  const eventIds = [];
  let failedCount = 0;
  const failed = [];
  outs.forEach((o, baseIdx) => {
    const ents = o.Entries || [];
    failedCount += o.FailedEntryCount || 0;
    ents.forEach((e, j) => {
      if (e?.EventId) eventIds.push(e.EventId);
      if (e?.ErrorCode || e?.ErrorMessage) {
        failed.push({
          index: baseIdx * 10 + j,
          code: e.ErrorCode,
          message: e.ErrorMessage,
        });
      }
    });
  });

  return resp(202, {
    ok: failedCount === 0,
    acceptedCount: entries.length,
    rejectedCount: rejected.length,
    failedCount,
    eventIds,
    rejected,
    failed,
  });
};

// ---------- helpers ----------
const resp = (code, body) => ({
  statusCode: code,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const safeId = (d) => d && (d.id ?? d.handle ?? d.title ?? "na");
