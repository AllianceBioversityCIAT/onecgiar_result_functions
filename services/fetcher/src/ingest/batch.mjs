import { createHash } from "node:crypto";
import { normalizeCommon } from "../normalizer.mjs";
import { validateByType } from "../validator/registry.js";

/**
 * The reporting platform's own id for a result, read wherever it sits.
 *
 * The value travels on `data`, but by the time a result reaches the processing loop it
 * has been through `normalizeCommon` and re-wrapped, so the same field can be found one
 * level up or nested under `data`. Returning null rather than undefined keeps the key
 * present in the JSON response: a caller reading `external_reference` gets an explicit
 * "we have none for this row" instead of a missing property.
 */
export function externalReferenceOf(source) {
  if (!source || typeof source !== "object") return null;
  return source.external_reference ?? source.data?.external_reference ?? null;
}

/**
 * Sorts a batch into the rows worth sending on and the rows to hand straight back.
 *
 * Everything a row has to survive before it can be offloaded, forwarded to Reporting and
 * indexed happens here — shape, then the type's minimum data set — so an incomplete row
 * costs the caller a response and nothing else.
 *
 * @returns {{accepted: object[], rejected: object[]}} `rejected` entries carry the row's index
 *   and its `external_reference`: the caller has to show its own user which record failed, and
 *   an array index alone does not tell them that.
 */
export function prepareResults(list, { tenant, opDefault, jobId, nowIso, requestId }) {
  const accepted = [];
  const rejected = [];

  for (let i = 0; i < list.length; i++) {
    const it = list[i] || {};
    const type = String(it.type || "").toLowerCase();
    const op = String(it.op || opDefault).toLowerCase();
    const data = it.data;
    const externalReference = externalReferenceOf(it.data);

    if (!type) {
      rejected.push({
        index: i,
        external_reference: externalReference,
        reason: "type is required",
      });
      continue;
    }
    if (!data || typeof data !== "object") {
      rejected.push({
        index: i,
        type,
        external_reference: externalReference,
        reason: "data is required",
      });
      continue;
    }

    let normalized;
    try {
      normalized = normalizeCommon ? normalizeCommon({ ...data }) : { ...data };
    } catch (normErr) {
      console.error("[ingest] normalizeCommon failed", {
        index: i,
        type,
        error: normErr?.message,
        stack: normErr?.stack,
        requestId,
      });
      rejected.push({
        index: i,
        type,
        external_reference: externalReference,
        reason: `normalization_error: ${normErr?.message}`,
      });
      continue;
    }

    const v = validateByType(type, normalized);
    if (!v.ok) {
      rejected.push({
        index: i,
        type,
        external_reference: externalReference,
        errors: v.errors,
        // Include detailed errors if available for better debugging
        ...(v.detailedErrors ? { detailedErrors: v.detailedErrors } : {}),
      });
      continue;
    }

    const normalizedData =
      normalized && typeof normalized === "object" ? normalized : {};
    const handle = normalizedData?.knowledge_product?.handle;
    const resultId =
      normalizedData?.result_id !== undefined
        ? normalizedData.result_id
        : normalizedData?.id;
    let uniqueId = resultId ?? handle;

    if (!uniqueId) {
      const contentHash = createHash("sha256")
        .update(JSON.stringify(normalizedData))
        .digest("hex")
        .slice(0, 16);
      uniqueId = `auto-${contentHash}`;
    }

    const idempotencyKey = `${tenant}:${type}:${op}:${uniqueId}`;
    const payloadData =
      normalizedData?.data &&
      typeof normalizedData.data === "object" &&
      Object.keys(normalizedData.data).length
        ? { ...normalizedData.data }
        : { ...normalizedData };

    accepted.push({
      type,
      received_at: nowIso,
      idempotencyKey,
      tenant,
      op,
      ...(jobId ? { jobId } : {}),
      ...(resultId !== undefined ? { result_id: resultId } : {}),
      ...normalizedData,
      data: payloadData,
    });
  }

  return { accepted, rejected };
}

/**
 * The status and verdict for a batch that got past the all-rejected check.
 *
 * A row turned away here and a row that Reporting refused are the same news to the caller —
 * something they sent is not in PRMS — so both make the batch a 207 and both make `ok` false.
 * Reporting only the downstream failures used to answer `200 ok:true` to a batch half of which
 * had been dropped, and a caller trusting that field never went looking in `rejected`.
 */
export function ingestOutcome({ rejectedCount, totalFailed }) {
  if (rejectedCount === 0 && totalFailed === 0) {
    return {
      status: 200,
      ok: true,
      message: "All results processed successfully",
    };
  }

  const parts = [];
  if (rejectedCount > 0) parts.push(`${rejectedCount} rejected before processing`);
  if (totalFailed > 0) parts.push(`${totalFailed} failed during processing`);

  return { status: 207, ok: false, message: `Processed with ${parts.join(" and ")}` };
}
