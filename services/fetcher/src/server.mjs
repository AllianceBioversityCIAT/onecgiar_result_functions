import express from "express";
import { normalizeCommon } from "./normalizer.mjs"; 
import { validateByType } from "./validator/registry.js"; 
import { offloadRequestBody } from "./utils.js"; 
import { ProcessorFactory } from "./processors/factory.mjs";
import { Logger } from "./utils/logger.mjs";
import { S3Utils } from "./utils/s3.mjs";

import openapi from "./docs/openapi.json" with { type: "json" };

const DEFAULT_OP = (process.env.DEFAULT_OP || "create").toLowerCase();
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10");

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

    const crypto = await import('crypto');
    const handle = normalized?.knowledge_product?.handle;
    const resultId = normalized?.result_id !== undefined ? normalized.result_id : normalized?.id;
    let uniqueId = resultId ?? handle;
    
    if (!uniqueId) {
      const contentHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(normalized))
        .digest('hex')
        .slice(0, 16);
      uniqueId = `auto-${contentHash}`;
    }
    
    const idempotencyKey = `${tenant}:${type}:${op}:${uniqueId}`;

    acceptedResults.push({
      type,
      received_at: nowIso,
      idempotencyKey,
      tenant,
      op,
      ...(jobId ? { jobId } : {}),
      ...(resultId !== undefined ? { result_id: resultId } : {}),
      ...normalized,
      data: {
        ...(normalized.data || {}),
      },
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

export default app;
