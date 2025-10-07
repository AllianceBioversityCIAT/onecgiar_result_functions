import { buildDetailWithOffload, putEventsBatch } from "../utils.js";
import { validateByType } from "../validator/registry.js";
import { normalizeCommon } from "../normalizer.mjs";

const BUS = process.env.EVENT_BUS || "prms-ingestion-bus";
const SRC_NS = process.env.SOURCE_NS || "client";
const DEFAULT_OP = process.env.DEFAULT_OP || "create";

export const handler = async (req) => {
  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return r(400, { ok: false, error: "invalid_json" });
  }

  const tenant = (body.tenant || "unknown").toLowerCase();
  const opDefault = (body.op || DEFAULT_OP).toLowerCase();

  const list = Array.isArray(body.results)
    ? body.results
    : body.results
    ? [body.results]
    : [];

  if (!list.length)
    return r(400, {
      ok: false,
      error: "results is required (array or object)",
    });

  const entries = [];
  const rejected = [];
  const acceptedIndexes = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i] || {};
    const type = String(item.type || "").toLowerCase();
    const op = String(item.op || opDefault).toLowerCase();
    const data = item.data;

    if (!type) {
      rejected.push({ index: i, reason: "type is required" });
      continue;
    }
    if (!data || typeof data !== "object") {
      rejected.push({ index: i, type, reason: "data is required" });
      continue;
    }

    // Normalizar “comunes” antes de validar
    const normalized = normalizeCommon({ ...data });

    // Validar por tipo
    const v = validateByType(type, normalized);
    if (!v.ok) {
      rejected.push({ index: i, type, errors: v.errors });
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
    const { detail } = await buildDetailWithOffload(detailPayload);

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
    return r(422, {
      ok: false,
      acceptedCount: 0,
      rejectedCount: rejected.length,
      rejected,
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
          failed.push({
            index: originalIdx,
            code: e.ErrorCode,
            message: e.ErrorMessage,
          });
        }
      }
      accIdx += ents.length;
    }

    return r(202, {
      ok: failedCount === 0,
      acceptedCount: entries.length,
      rejectedCount: rejected.length,
      failedCount,
      eventIds,
      rejected,
      failed,
    });
  } catch (e) {
    console.error("PutEvents error", e);
    return r(500, { ok: false, error: e.message, rejected });
  }
};

const r = (code, body) => ({
  statusCode: code,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
