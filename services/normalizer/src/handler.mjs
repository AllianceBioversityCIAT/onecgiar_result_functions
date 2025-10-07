import { buildDetailWithOffload, putEventsBatch } from "./src/utils.js";
import { validateByType } from "./src/validator/registry.js";
import { normalizeCommon } from "./src/normalizer.mjs";

const SERVICE_VERSION = process.env.SERVICE_VERSION || "normalizer-20241007";
const BUS = process.env.EVENT_BUS || "prms-ingestion-bus";
const SRC_NS = process.env.SOURCE_NS || "client";
const DEFAULT_OP = process.env.DEFAULT_OP || "create";

const log = (level, message, meta = {}) => {
  const payload = {
    level,
    msg: message,
    service: "normalizer",
    version: SERVICE_VERSION,
    ...meta,
  };
  const serialized = JSON.stringify(payload);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
};

export const handler = async (req, context = {}) => {
  log("debug", "Initializing handler");
  const requestId =
    context.awsRequestId ||
    req?.requestContext?.requestId ||
    req?.headers?.["x-amzn-trace-id"];
  log("info", "Handler invoked", { requestId });

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (err) {
    log("warn", "Invalid JSON received", { error: err?.message, requestId });
    return r(400, {
      ok: false,
      error: "invalid_json",
      message: err?.message,
      requestId,
    });
  }

  const tenant = (body.tenant || "unknown").toLowerCase();
  const opDefault = (body.op || DEFAULT_OP).toLowerCase();

  const list = Array.isArray(body.results)
    ? body.results
    : body.results
    ? [body.results]
    : [];

  log("info", "Incoming payload", {
    tenant,
    opDefault,
    receivedCount: list.length,
    requestId,
  });

  if (!list.length) {
    log("warn", "Missing results in payload", { tenant, requestId });
    return r(400, {
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
    const item = list[i] || {};
    const type = String(item.type || "").toLowerCase();
    const op = String(item.op || opDefault).toLowerCase();
    const data = item.data;

    if (!type) {
      const rejection = { index: i, reason: "type is required" };
      rejected.push(rejection);
      log("warn", "Rejected item missing type", { index: i, requestId });
      continue;
    }
    if (!data || typeof data !== "object") {
      const rejection = { index: i, type, reason: "data is required" };
      rejected.push(rejection);
      log("warn", "Rejected item missing data", { index: i, type, requestId });
      continue;
    }

    // Normalizar “comunes” antes de validar
    const normalized = normalizeCommon({ ...data });

    // Validar por tipo
    const v = validateByType(type, normalized);
    if (!v.ok) {
      const rejection = { index: i, type, errors: v.errors };
      rejected.push(rejection);
      log("warn", "Rejected item by schema validation", {
        index: i,
        type,
        errors: v.errors,
        requestId,
      });
      continue;
    }

    // Metadata útil para downstream
    const detailPayload = {
      ...normalized,
      tenant,
      type,
      op,
      received_at: new Date().toISOString(),
      idempotencyKey: `${tenant}:${type}:${op}:${normalized.id ?? "na"}`,
    };

    // Offload si excede MAX
    const { detail, offloaded } = await buildDetailWithOffload(detailPayload);
    if (offloaded) {
      log("info", "Payload offloaded to S3", {
        index: i,
        tenant,
        type,
        requestId,
      });
    }

    // Armar entry
    const entry = {
      Source: `${SRC_NS}.${tenant}`,
      DetailType: `${type}.${op}`,
      EventBusName: BUS,
      Detail: JSON.stringify(detail),
    };

    entries.push(entry);
    acceptedIndexes.push(i);
  }

  if (!entries.length) {
    log("warn", "All items rejected", {
      tenant,
      rejectedCount: rejected.length,
      requestId,
    });
    return r(422, {
      ok: false,
      error: "validation_failed",
      message: "Every result was rejected. See details in 'rejected'.",
      acceptedCount: 0,
      rejectedCount: rejected.length,
      rejected,
      requestId,
    });
  }

  try {
    const outs = await putEventsBatch(entries);
    // Flatten resultados
    const eventIds = [];
    let failedCount = 0;
    const failed = [];

    let accIdx = 0;
    for (const out of outs) {
      const failedInChunk = out?.FailedEntryCount || 0;
      failedCount += failedInChunk;
      const ents = out?.Entries || [];
      for (let k = 0; k < ents.length; k++) {
        const e = ents[k];
        const globalIndex = accIdx + k; // index in entries[]
        const originalIdx = acceptedIndexes[globalIndex]; // original results[] index
        if (e?.EventId) eventIds.push(e.EventId);
        if (e?.ErrorCode || e?.ErrorMessage) {
          const failure = {
            index: originalIdx,
            code: e.ErrorCode,
            message: e.ErrorMessage,
            requestId,
          };
          failed.push(failure);
          log("warn", "EventBridge reported failed entry", failure);
        }
      }
      accIdx += ents.length;
    }

    const response = {
      ok: failedCount === 0,
      status: failedCount === 0 ? "accepted" : "partial_failure",
      acceptedCount: entries.length,
      rejectedCount: rejected.length,
      failedCount,
      eventIds,
      rejected,
      failed,
    };

    log("info", "Processing completed", {
      tenant,
      acceptedCount: response.acceptedCount,
      rejectedCount: response.rejectedCount,
      failedCount: response.failedCount,
      requestId,
    });

    return r(202, {
      ...response,
      requestId,
    });
  } catch (error) {
    log("error", "PutEvents error", {
      message: error?.message,
      stack: error?.stack,
      requestId,
    });
    return r(500, {
      ok: false,
      error: "eventbridge_error",
      message: error?.message,
      rejected,
      requestId,
    });
  }
};

const r = (code, body) => ({
  statusCode: code,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    serviceVersion: SERVICE_VERSION,
    ...body,
  }),
});
