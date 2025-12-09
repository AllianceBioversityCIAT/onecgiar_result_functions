import express from "express";
import { normalizeCommon } from "./normalizer.mjs"; 
import { validateByType } from "./validator/registry.js"; 
import { offloadRequestBody } from "./utils.js"; 
import { ProcessorFactory } from "./processors/factory.mjs";
import { Logger } from "./utils/logger.mjs";
import { S3Utils } from "./utils/s3.mjs";
import { ExternalApiClient } from "./clients/external-api.mjs";
import { OpenSearchClient } from "./clients/opensearch.mjs";

import openapi from "./docs/openapi.json" with { type: "json" };

const DEFAULT_OP = (process.env.DEFAULT_OP || "create").toLowerCase();
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10");

const app = express();
app.use(express.json({ limit: "5mb" }));

const externalApiClient = new ExternalApiClient();
const openSearchClient = new OpenSearchClient();

const RESULT_TYPE_FIXED_FIELDS = {
  knowledge_product: { result_type_id: 6, result_level_id: 4 },
  capacity_sharing: { result_type_id: 3, result_level_id: 4 },
  innovation_development: { result_type_id: 7, result_level_id: 4 },
  innovation_use: { result_type_id: 2, result_level_id: 3 },
  other_output: { result_type_id: 8, result_level_id: 4 },
  other_outcome: { result_type_id: 4, result_level_id: 3 },
  policy_change: { result_type_id: 1, result_level_id: 3 },
};

const RESULT_TYPE_ALIASES = {
  kp: "knowledge_product",
  knowledgeproduct: "knowledge_product",
  cs: "capacity_sharing",
  capacitysharing: "capacity_sharing",
  id: "innovation_development",
  innovationdevelopment: "innovation_development",
  iu: "innovation_use",
  innovationuse: "innovation_use",
  oo: "other_output",
  otheroutput: "other_output",
  oc: "other_outcome",
  otheroutcome: "other_outcome",
  pc: "policy_change",
  policychange: "policy_change",
};

const normalizeResultTypeValue = (value) => {
  if (!value) {
    return "";
  }
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
};

const resolveCanonicalResultType = (value) => {
  const normalized = normalizeResultTypeValue(value);
  if (!normalized) {
    return "";
  }
  return RESULT_TYPE_ALIASES[normalized] || normalized;
};

const applyFixedFieldsForType = (resultType, data = {}) => {
  const fixed = RESULT_TYPE_FIXED_FIELDS[resultType];
  if (!fixed) {
    return { ...data };
  }

  return {
    ...data,
    ...fixed,
  };
};

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
  const startTime = Date.now();
  const requestId =
    req.headers["x-amzn-trace-id"] || req.headers["x-request-id"];
  const body = req.body || {};

  const logger = new Logger();
  const s3Utils = new S3Utils();
  const processorFactory = new ProcessorFactory(logger);

  console.log('[ingest] request received', {
    requestId,
    hasBody: !!body,
    rawKeys: Object.keys(body || {}),
    tenantRaw: body.tenant,
    opRaw: body.op,
    jobIdRaw: body.jobId,
  });

  const tenant = String(body.tenant || "unknown").toLowerCase();
  const opDefault = String(body.op || DEFAULT_OP).toLowerCase();
  const jobId = body.jobId ? String(body.jobId) : undefined;

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

  if (list.length > 100) {
    console.warn('[ingest] batch too large', { requestId, count: list.length });
    return res.status(413).json({
      ok: false,
      error: 'results_too_many',
      message: `Maximum 100 results allowed per request. Received ${list.length}. Nothing processed.`,
      limit: 100,
      received: list.length,
      requestId,
    });
  }

  const rejected = [];
  const acceptedResults = [];
  const nowIso = new Date().toISOString();

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

    let normalized;
    try {
      normalized = normalizeCommon ? normalizeCommon({ ...data }) : { ...data };
    } catch (normErr) {
      console.error('[ingest] normalizeCommon failed', {
        index: i,
        type,
        error: normErr?.message,
        stack: normErr?.stack,
        requestId
      });
      rejected.push({ index: i, type, reason: `normalization_error: ${normErr?.message}` });
      continue;
    }

    const v = validateByType(type, normalized);
    if (!v.ok) {
      rejected.push({ index: i, type, errors: v.errors });
      continue;
    }

    const normalizedData = normalized && typeof normalized === "object" ? normalized : {};
    const crypto = await import('crypto');
    const handle = normalizedData?.knowledge_product?.handle;
    const resultId = normalizedData?.result_id !== undefined ? normalizedData.result_id : normalizedData?.id;
    let uniqueId = resultId ?? handle;
    
    if (!uniqueId) {
      const contentHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(normalizedData))
        .digest('hex')
        .slice(0, 16);
      uniqueId = `auto-${contentHash}`;
    }
    
    const idempotencyKey = `${tenant}:${type}:${op}:${uniqueId}`;
    const payloadData =
      normalizedData?.data && typeof normalizedData.data === "object" && Object.keys(normalizedData.data).length
        ? { ...normalizedData.data }
        : { ...normalizedData };

    acceptedResults.push({
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

  if (!acceptedResults.length) {
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

  let pointer;
  const ingestionEnvelope = {
    tenant,
    op: opDefault,
    ...(jobId ? { jobId } : {}),
    results: acceptedResults,
    received_at: nowIso,
    requestId,
    rejected,
  };

  try {
    pointer = await offloadRequestBody(ingestionEnvelope);
    console.log('[ingest] Data offloaded to S3', { 
      bucket: pointer.s3.bucket, 
      key: pointer.s3.key,
      correlationId: pointer.correlationId 
    });
  } catch (err) {
    console.error('[ingest] failed full body offload', { message: err?.message });
  }

  const resultsByType = new Map();
  for (const result of acceptedResults) {
    const type = result.type || "unknown";
    if (!resultsByType.has(type)) {
      resultsByType.set(type, []);
    }
    resultsByType.get(type).push(result);
  }

  const allProcessingResults = [];
  let totalSuccessful = 0;
  let totalFailed = 0;

  for (const [type, typeResults] of resultsByType) {
    console.log(`[ingest] Processing ${typeResults.length} results of type: ${type}`);

    try {
      if (!processorFactory.isTypeSupported(type)) {
        console.error(`[ingest] Unsupported result type: ${type}`, {
          supportedTypes: processorFactory.getSupportedTypes(),
        });

        for (const result of typeResults) {
          allProcessingResults.push({
            success: false,
            error: `Unsupported result type: ${type}`,
            resultId: result.idempotencyKey,
          });
          totalFailed++;
        }
        continue;
      }

      const processor = processorFactory.getProcessor(type);

      const batches = [];
      for (let i = 0; i < typeResults.length; i += BATCH_SIZE) {
        batches.push(typeResults.slice(i, i + BATCH_SIZE));
      }

      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map(async (result) => {
            try {
              const processingResult = await processor.process(result);
              logger.logProcessingResult(
                processingResult,
                processingResult.result
              );

              if (processingResult.success) {
                totalSuccessful++;
              } else {
                totalFailed++;

                if (result.jobId) {
                  await s3Utils.saveErrorToS3(
                    result.jobId,
                    result,
                    new Error(processingResult.error || "Processing failed"),
                    {
                      stage: "processing",
                      externalError: processingResult.externalError,
                      externalApiResponse:
                        processingResult.externalApiResponse,
                    }
                  );
                }
              }

              return {
                ...processingResult,
                resultId: result.idempotencyKey,
                resultType: result.type,
              };
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              console.error('[ingest] Processing failed', result.idempotencyKey, error);
              totalFailed++;

              if (result.jobId) {
                await s3Utils.saveErrorToS3(result.jobId, result, error, {
                  stage: "processing_exception",
                  type: result.type,
                });
              }

              return {
                success: false,
                error: errorMessage,
                resultId: result.idempotencyKey,
                resultType: result.type,
              };
            }
          })
        );

        allProcessingResults.push(...batchResults);
      }
    } catch (error) {
      console.error(`[ingest] Failed to process type ${type}`, error);

      for (const result of typeResults) {
        if (result.jobId) {
          await s3Utils.saveErrorToS3(result.jobId, result, error, {
            stage: "type_processing_failed",
            resultType: type,
          });
        }

        allProcessingResults.push({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          resultId: result.idempotencyKey,
          resultType: type,
        });
        totalFailed++;
      }
    }
  }

  const successfulResults = allProcessingResults
    .filter(
      (r) => r.success && "result" in r && r.result !== undefined
    )
    .map((r) => r.result);

  if (successfulResults.length > 0) {
    try {
      await s3Utils.saveProcessedResults(successfulResults, "final");
    } catch (error) {
      console.error('[ingest] Failed to save processed results to S3', error);
    }
  }

  const processingTimeMs = Date.now() - startTime;
  logger.logBatchSummary(
    acceptedResults.length,
    totalSuccessful,
    totalFailed,
    processingTimeMs
  );

  return res.status(totalFailed === 0 ? 200 : 207).json({
    ok: totalFailed === 0,
    message:
      totalFailed === 0
        ? "All results processed successfully"
        : `Processed with ${totalFailed} failures`,
    processed: acceptedResults.length,
    successful: totalSuccessful,
    failed: totalFailed,
    rejectedCount: rejected.length,
    rejected,
    results: allProcessingResults,
    processingTimeMs,
    logs: logger.getLogsSummary(),
    requestId,
    ...(pointer ? { 
      offload: pointer.s3,
      correlationId: pointer.correlationId 
    } : {}),
    timestamp: new Date().toISOString(),
  });
});

app.patch("/update/:id", async (req, res) => {
  const requestId =
    req.headers["x-amzn-trace-id"] || req.headers["x-request-id"];
  const logger = new Logger();
  const rawId = req.params.id;
  const resultId = Number(rawId);

  if (!Number.isFinite(resultId)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_result_id",
      message: "Parameter :id must be a valid number",
      requestId,
    });
  }

  const body = req.body || {};
  let type = resolveCanonicalResultType(body.type);
  let data = body.data;

  const resultList = Array.isArray(body.results)
    ? body.results
    : body.results
    ? [body.results]
    : [];
  const firstResult = resultList[0];

  if ((!type || !type.length) && firstResult?.type) {
    type = resolveCanonicalResultType(firstResult.type);
  }
  if (
    (!data || typeof data !== "object") &&
    firstResult?.data &&
    typeof firstResult.data === "object"
  ) {
    data = firstResult.data;
  }

  if (!type) {
    return res.status(400).json({
      ok: false,
      error: "type_required",
      message: "Body must include a valid type",
      requestId,
    });
  }

  if (!data || typeof data !== "object") {
    return res.status(400).json({
      ok: false,
      error: "data_required",
      message: "Body must include a data object to update",
      requestId,
    });
  }

  const tenantRaw =
    body.tenant !== undefined && body.tenant !== null
      ? String(body.tenant).trim()
      : firstResult?.tenant && typeof firstResult.tenant === "string"
      ? String(firstResult.tenant).trim()
      : undefined;
  const tenant = tenantRaw ? tenantRaw.toLowerCase() : undefined;
  const jobIdRaw =
    body.jobId !== undefined && body.jobId !== null
      ? String(body.jobId).trim()
      : firstResult?.jobId !== undefined && firstResult?.jobId !== null
      ? String(firstResult.jobId).trim()
      : undefined;
  const jobId = jobIdRaw || undefined;
  const providedIdempotencyKeyRaw =
    body.idempotencyKey !== undefined && body.idempotencyKey !== null
      ? String(body.idempotencyKey).trim()
      : firstResult?.idempotencyKey !== undefined &&
        firstResult?.idempotencyKey !== null
      ? String(firstResult.idempotencyKey).trim()
      : undefined;
  const providedIdempotencyKey = providedIdempotencyKeyRaw || undefined;

  let receivedAt =
    body.received_at ||
    body.receivedAt ||
    firstResult?.received_at ||
    firstResult?.receivedAt;
  if (receivedAt) {
    const parsed = new Date(receivedAt);
    receivedAt = Number.isNaN(parsed.getTime())
      ? new Date().toISOString()
      : parsed.toISOString();
  } else {
    receivedAt = new Date().toISOString();
  }

  const enrichedData = applyFixedFieldsForType(type, data);
  const fixedFields = RESULT_TYPE_FIXED_FIELDS[type];

  try {
    logger.info("Updating result in external API", resultId, {
      type,
    });

    const externalResponse = await externalApiClient.updateResult(resultId, {
      type,
      data: enrichedData,
      ...(jobId ? { jobId } : {}),
    });

    const responsePayload =
      externalResponse?.response ??
      externalResponse?.data ??
      externalResponse ??
      null;

    let opensearchOutcome = null;

    if (responsePayload) {
      const normalizedType =
        typeof responsePayload?.type === "string" && responsePayload.type
          ? responsePayload.type.toLowerCase()
          : type;
      const normalizedTenant =
        typeof responsePayload?.tenant === "string" && responsePayload.tenant
          ? responsePayload.tenant.toLowerCase()
          : tenant || "unknown";

      const baseDocument = {
        ...responsePayload,
        type: normalizedType,
        tenant: normalizedTenant,
        idempotencyKey:
          responsePayload?.idempotencyKey ||
          providedIdempotencyKey ||
          `${normalizedTenant}:${normalizedType}:result:${resultId}`,
        received_at: responsePayload?.received_at || receivedAt,
        result_id: responsePayload?.result_id ?? resultId,
      };

      if (fixedFields) {
        baseDocument.data = {
          ...(baseDocument.data && typeof baseDocument.data === "object"
            ? baseDocument.data
            : {}),
          ...fixedFields,
        };
      }

      logger.info("Updating result documents in OpenSearch", resultId, {
        type,
      });

      const updateResponse = await openSearchClient.updateDocumentsByResultId(
        resultId,
        baseDocument
      );

      if (!updateResponse.updated) {
        logger.warn(
          "No OpenSearch documents matched for update, indexing fallback document",
          resultId,
          { type }
        );
        await openSearchClient.ensureIndex(type);
        const indexResponse = await openSearchClient.indexResult(baseDocument);
        opensearchOutcome = {
          action: "indexed",
          response: indexResponse,
        };
      } else {
        opensearchOutcome = {
          action: "updated",
          ...updateResponse,
        };
      }
    } else {
      logger.warn(
        "External API did not return payload to update OpenSearch",
        resultId
      );
    }

    return res.status(200).json({
      ok: true,
      message: "Result updated",
      resultId,
      type,
      requestId,
      external: externalResponse,
      opensearch: opensearchOutcome,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      typeof error?.status === "number" && error.status >= 400
        ? error.status
        : 500;

    logger.error("Result update failed", resultId, {
      status,
      error: message,
    });

    return res.status(status).json({
      ok: false,
      error: "result_update_failed",
      message,
      resultId,
      requestId,
      details: error?.apiResponse ?? error?.responseBody,
      timestamp: new Date().toISOString(),
    });
  }
});

app.delete("/delete/:id", async (req, res) => {
  const requestId =
    req.headers["x-amzn-trace-id"] || req.headers["x-request-id"];
  const logger = new Logger();
  const rawId = req.params.id;
  const resultId = Number(rawId);

  if (!Number.isFinite(resultId)) {
    return res.status(400).json({
      ok: false,
      error: "invalid_result_id",
      message: "Parameter :id must be a valid number",
      requestId,
    });
  }

  try {
    logger.info("Deleting result in external API", resultId);
    const externalResponse = await externalApiClient.deleteResult(resultId);

    logger.info("Deleting result documents in OpenSearch", resultId);
    const opensearchDeletion = await openSearchClient.deleteByResultId(resultId);

    logger.success("Result deletion completed", resultId, {
      opensearchDeleted: opensearchDeletion.deleted,
    });

    return res.status(200).json({
      ok: true,
      message: "Result deleted",
      resultId,
      external: externalResponse,
      opensearch: opensearchDeletion,
      requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status =
      typeof error?.status === "number" && error.status >= 400
        ? error.status
        : 500;

    logger.error("Result deletion failed", resultId, {
      status,
      error: message,
    });

    return res.status(status).json({
      ok: false,
      error: "result_delete_failed",
      message,
      resultId,
      requestId,
      details: error?.apiResponse ?? error?.responseBody,
      timestamp: new Date().toISOString(),
    });
  }
});

export default app;
