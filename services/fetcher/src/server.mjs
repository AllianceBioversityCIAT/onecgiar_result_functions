import express from "express";

import { normalizeCommon } from "./normalizer.mjs"; 
import { validateByType } from "./validator/registry.js"; 
import { buildDetailWithOffload, putEventsBatch, offloadRequestBody } from "./utils.js"; 

import openapi from "./docs/openapi.json" with { type: "json" };

const BUS = process.env.EVENT_BUS || "default";
const DEFAULT_OP = (process.env.DEFAULT_OP || "create").toLowerCase();

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "normalizer", ts: new Date().toISOString() });
});

app.get("/openapi.json", (_req, res) => res.json(openapi));

const swaggerHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>PRMS Normalizer API</title>
      <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui.css" />
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-bundle.js"></script>
      <script>
        SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIBundle.presets.standalone
          ]
        });
      </script>
    </body>
    </html>`;

app.get("/docs", (_req, res) => {
  res.send(swaggerHtml);
});

app.post("/ingest", async (req, res) => {
  const requestId =
    req.headers["x-amzn-trace-id"] || req.headers["x-request-id"];
  const body = req.body || {};

  console.log('[ingest] request received', {
    requestId,
    hasBody: !!body,
    rawKeys: Object.keys(body || {}),
    tenantRaw: body.tenant,
    opRaw: body.op,
  });

  const tenant = String(body.tenant || "unknown").toLowerCase();
  const opDefault = String(body.op || DEFAULT_OP).toLowerCase();

  const list = Array.isArray(body.results)
    ? body.results
    : body.results
    ? [body.results]
    : [];
  if (!list.length) {
    console.warn('[ingest] empty results list', { requestId });
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

    const normalized = normalizeCommon ? normalizeCommon({ ...data }) : { ...data };
    const v = validateByType(type, normalized);
    if (!v.ok) {
      rejected.push({ index: i, type, errors: v.errors });
      continue;
    }
    list[i].data = normalized;
    list[i]._meta = { type, op };
    acceptedIndexes.push(i);
  }

  if (!acceptedIndexes.length) {
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

  const ingestionEnvelope = {
    tenant,
    op: opDefault,
    results: list,
    received_at: new Date().toISOString(),
    requestId,
    rejected,
    acceptedIndexes,
  };

  let pointer;
  try {
    pointer = await offloadRequestBody(ingestionEnvelope);
  } catch (err) {
    console.error('[ingest] failed full body offload', { message: err?.message });
    return res.status(500).json({ ok: false, error: 'offload_failed', message: err?.message, requestId });
  }

  for (const idx of acceptedIndexes) {
    const it = list[idx];
    const type = it._meta.type;
    const op = it._meta.op;
    const normalized = it.data;
    const idempotencyKey = `${tenant}:${type}:${op}:${normalized.id ?? normalized.handle ?? 'na'}`;
    const detail = {
      s3: pointer.s3,
      correlationId: pointer.correlationId,
      idempotencyKey,
      tenant,
      type,
      op,
      result_index: idx,
      ts: Date.now(),
      offloadBytes: pointer.offloadBytes,
      fullBody: true,
    };
    entries.push({
      Source: tenant,
      DetailType: op,
      EventBusName: BUS,
      Detail: JSON.stringify(detail),
    });
  }

  
  try {
    const outs = await putEventsBatch(entries);
    console.log('[ingest] putEventsBatch completed', {
      batches: outs.length,
      totalEntries: entries.length,
      rejectedCount: rejected.length
    });

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
      offload: pointer?.s3,
      correlationId: pointer?.correlationId,
    });
  } catch (err) {
    console.error('[ingest] eventbridge error', { message: err?.message, requestId });
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
