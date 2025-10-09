import express from "express";
import swaggerUi from "swagger-ui-express";

// Reusa tu lógica actual:
import { normalizeCommon } from "./normalizer.mjs"; // asegúrate que exporte esta función
import { validateByType } from "./validator/registry.js"; // ya lo tienes
import { buildDetailWithOffload, putEventsBatch } from "./utils.js"; // ya lo tienes

// Carga OpenAPI (JSON) para Swagger UI
import openapi from "./docs/openapi.json" assert { type: "json" };

const BUS = process.env.EVENT_BUS || "prms-ingestion-bus";
const DEFAULT_OP = (process.env.DEFAULT_OP || "create").toLowerCase();

const app = express();
app.use(express.json({ limit: "5mb" }));

// Healthcheck
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "normalizer", ts: new Date().toISOString() });
});

// Swagger UI
app.get("/openapi.json", (_req, res) => res.json(openapi));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));

// Ingest endpoint
app.post("/ingest", async (req, res) => {
  const requestId =
    req.headers["x-amzn-trace-id"] || req.headers["x-request-id"];
  const body = req.body || {};

  const tenant = String(body.tenant || "unknown").toLowerCase();
  const opDefault = String(body.op || DEFAULT_OP).toLowerCase();

  const list = Array.isArray(body.results)
    ? body.results
    : body.results
    ? [body.results]
    : [];
  if (!list.length) {
    return res.status(400).json({
      ok: false,
      error: "results_missing",
      message: "results is required (array or object)",
      requestId,
    });
  }

  const entries = [];
  const rejected = [];
  const acceptedIndexes = [];

  for (let i = 0; i < list.length; i++) {
    const it = list[i] || {};
    const type = String(it.type || "").toLowerCase();
    const op = String(it.op || opDefault).toLowerCase();
    const data = it.data;

    if (!type) {
      rejected.push({ index: i, reason: "type is required" });
      continue;
    }
    if (!data || typeof data !== "object") {
      rejected.push({ index: i, type, reason: "data is required" });
      continue;
    }

    // Normaliza (si tu normalizer incluye esta función)
    const normalized = normalizeCommon
      ? normalizeCommon({ ...data })
      : { ...data };

    // Valida por tipo (Ajv)
    const v = validateByType(type, normalized);
    if (!v.ok) {
      rejected.push({ index: i, type, errors: v.errors });
      continue;
    }

    // Construye detail (offload a S3 si excede tamaño)
    const detailPayload = {
      ...normalized,
      tenant,
      type,
      op,
      received_at: new Date().toISOString(),
      idempotencyKey: `${tenant}:${type}:${op}:${
        normalized.id ?? normalized.handle ?? "na"
      }`,
    };

    const { detail } = await buildDetailWithOffload(detailPayload);

    // Entrada EventBridge
    entries.push({
      Source: `client.${tenant}`, // p.ej. client.star
      DetailType: `${type}.${op}`, // p.ej. knowledge_product.create
      EventBusName: BUS,
      Detail: JSON.stringify(detail),
    });
    acceptedIndexes.push(i);
  }

  if (!entries.length) {
    return res.status(422).json({
      ok: false,
      error: "validation_failed",
      message: "Every result was rejected. See 'rejected'.",
      acceptedCount: 0,
      rejectedCount: rejected.length,
      rejected,
      requestId,
    });
  }

  try {
    const outs = await putEventsBatch(entries);

    const eventIds = [];
    let failedCount = 0;
    const failed = [];

    let accIdx = 0;
    for (const out of outs) {
      failedCount += out?.FailedEntryCount || 0;
      const ents = out?.Entries || [];
      for (let k = 0; k < ents.length; k++) {
        const e = ents[k];
        if (e?.EventId) eventIds.push(e.EventId);
        if (e?.ErrorCode || e?.ErrorMessage) {
          failed.push({
            index: acceptedIndexes[accIdx + k],
            code: e.ErrorCode,
            message: e.ErrorMessage,
          });
        }
      }
      accIdx += ents.length;
    }

    return res.status(202).json({
      ok: failedCount === 0,
      status: failedCount === 0 ? "accepted" : "partial_failure",
      acceptedCount: entries.length,
      rejectedCount: rejected.length,
      failedCount,
      eventIds,
      rejected,
      failed,
      requestId,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "eventbridge_error",
      message: err?.message,
      rejected,
      requestId,
    });
  }
});

export default app;
