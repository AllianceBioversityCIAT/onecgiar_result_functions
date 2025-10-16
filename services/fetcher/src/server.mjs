import express from "express";

import { normalizeCommon } from "./normalizer.mjs"; 
import { validateByType } from "./validator/registry.js"; 
import { buildDetailWithOffload, putEvent } from "./utils.js"; 

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

  const rejected = [];
  const perResultStatus = [];
  let acceptedCount = 0;
  let failedCount = 0;
  const eventIds = [];

  for (let i = 0; i < list.length; i++) {
    const it = list[i] || {};
    const type = String(it.type || "").toLowerCase();
    const op = String(it.op || opDefault).toLowerCase();
    const data = it.data;

    console.log('[ingest:item:start]', { index: i, type, op, hasData: !!data });

    if (!type) {
      rejected.push({ index: i, reason: "type is required" });
      console.warn('[ingest:item:reject]', { index: i, reason: 'type_required' });
      continue;
    }
    if (!data || typeof data !== "object") {
      rejected.push({ index: i, type, reason: "data is required" });
      console.warn('[ingest:item:reject]', { index: i, type, reason: 'data_required' });
      continue;
    }

    const normalized = normalizeCommon
      ? normalizeCommon({ ...data })
      : { ...data };

    const v = validateByType(type, normalized);
    if (!v.ok) {
      rejected.push({ index: i, type, errors: v.errors });
      console.warn('[ingest:item:reject]', { index: i, type, errors: v.errors });
      continue;
    }

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

    console.log('[ingest:item:detailBuilt]', {
      index: i,
      offloaded: !!detail.s3,
      idempotencyKey: detail.idempotencyKey,
      correlationId: detail.correlationId,
      s3Key: detail.s3?.key,
      detailSize: Buffer.byteLength(JSON.stringify(detail), 'utf8')
    });

    const entry = {
      Source: `${tenant}`,
      DetailType: `${op}`,
      EventBusName: BUS,
      Detail: JSON.stringify(detail),
    };

    try {
      const out = await putEvent(entry);
      const e = out.Entries?.[0];
      if (e?.EventId) {
        eventIds.push(e.EventId);
        perResultStatus.push({ index: i, eventId: e.EventId, ok: true });
        acceptedCount++;
      } else if (e?.ErrorCode || e?.ErrorMessage) {
        failedCount++;
        perResultStatus.push({
          index: i,
            ok: false,
            code: e.ErrorCode,
            message: e.ErrorMessage,
        });
      } else {
        failedCount++;
        perResultStatus.push({ index: i, ok: false, message: 'unknown_eventbridge_response' });
      }
    } catch (err) {
      failedCount++;
      perResultStatus.push({ index: i, ok: false, message: err?.message });
      console.error('[ingest:item:eventError]', { index: i, error: err?.message });
    }
  }

  if (!acceptedCount) {
    console.warn('[ingest] all results rejected', { requestId, rejectedCount: rejected.length });
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
  // Summary response after per-result sends
  return res.status(202).json({
    ok: failedCount === 0,
    status: failedCount === 0 ? 'accepted' : 'partial_failure',
    acceptedCount,
    rejectedCount: rejected.length,
    failedCount,
    eventIds,
    rejected,
    perResultStatus,
    requestId,
  });
});

export default app;
