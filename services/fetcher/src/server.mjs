import express from "express";
import { normalizeCommon } from "./normalizer.mjs";
import { validateByType } from "./validator/registry.js";
import { offloadRequestBody } from "./utils.js";
import { ProcessorFactory } from "./processors/factory.mjs";
import { Logger } from "./utils/logger.mjs";
import { S3Utils } from "./utils/s3.mjs";
import { ExternalApiClient } from "./clients/external-api.mjs";
import { requireApiKey } from "./auth/require-api-key.mjs";
import { AUTH_REQUEST_KEY } from "./auth/constants.mjs";
import resultsRouter from "./controllers/results.controllers.mjs";

import openapi from "./docs/openapi.json" with { type: "json" };

const DEFAULT_OP = (process.env.DEFAULT_OP || "create").toLowerCase();
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10");

/**
 * The reporting platform's own id for a result, read wherever it sits.
 *
 * The value travels on `data`, but by the time a result reaches the processing loop it
 * has been through `normalizeCommon` and re-wrapped, so the same field can be found one
 * level up or nested under `data`. Returning null rather than undefined keeps the key
 * present in the JSON response: a caller reading `external_reference` gets an explicit
 * "we have none for this row" instead of a missing property.
 */
function externalReferenceOf(source) {
  if (!source || typeof source !== "object") return null;
  return source.external_reference ?? source.data?.external_reference ?? null;
}

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

app.post("/ingest", requireApiKey, async (req, res) => {
  const startTime = Date.now();
  const requestId =
    req.headers["x-amzn-trace-id"] || req.headers["x-request-id"];
  const body = req.body || {};
  const auth = req[AUTH_REQUEST_KEY];

  const logger = new Logger();
  const s3Utils = new S3Utils();
  // Built here, per request, so the caller's key — and only the caller's key — reaches Reporting.
  // The client is injected downstream; the credential itself never enters a processor or a result.
  //
  // `requireApiKey` guarantees `auth.apiKey`, so the constructor's throw is unreachable today.
  // It is caught anyway because Express 4 does not handle a rejected promise from an async
  // handler: an uncaught throw here would hang the request instead of failing it. If this ever
  // fires, the guard has been detached from the route.
  let externalApiClient;
  try {
    externalApiClient = new ExternalApiClient(undefined, 30000, auth?.apiKey);
  } catch (error) {
    console.error("[ingest] cannot build the external API client", {
      requestId,
      message: error?.message,
    });
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: "Ingestion is misconfigured.",
      requestId,
    });
  }

  const processorFactory = new ProcessorFactory(logger, externalApiClient);

  console.log("[ingest] request received", {
    requestId,
    platform: auth.mis?.acronym,
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
    console.warn("[ingest] empty results list", { requestId });
    return res.status(400).json({
      ok: false,
      error: "results_missing",
      message: "results is required (array or object)",
      requestId,
    });
  }

  if (list.length > 100) {
    console.warn("[ingest] batch too large", { requestId, count: list.length });
    return res.status(413).json({
      ok: false,
      error: "results_too_many",
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
    // Echoed on every rejection below. A rejected row is exactly where the caller needs
    // it — that is the row it has to show its own user — and it used to come back with
    // nothing but an array index to go on.
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
    const crypto = await import("crypto");
    const handle = normalizedData?.knowledge_product?.handle;
    const resultId =
      normalizedData?.result_id !== undefined
        ? normalizedData.result_id
        : normalizedData?.id;
    let uniqueId = resultId ?? handle;

    if (!uniqueId) {
      const contentHash = crypto
        .createHash("sha256")
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
    console.log("[ingest] Data offloaded to S3", {
      bucket: pointer.s3.bucket,
      key: pointer.s3.key,
      correlationId: pointer.correlationId,
    });
  } catch (err) {
    console.error("[ingest] failed full body offload", {
      message: err?.message,
    });
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
    console.log(
      `[ingest] Processing ${typeResults.length} results of type: ${type}`,
    );

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
                processingResult.result,
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
                      externalApiResponse: processingResult.externalApiResponse,
                    },
                  );
                }
              }

              // Enhance error response with better structure
              const response = {
                ...processingResult,
                resultId: result.idempotencyKey,
                resultType: result.type,
                external_reference: externalReferenceOf(result),
              };

              // If there's an error, make error details more accessible
              if (!processingResult.success) {
                response.errorDetails = {
                  message: processingResult.error || "Processing failed",
                  externalError: processingResult.externalError,
                  externalApiResponse: processingResult.externalApiResponse,
                  // Include validation errors if present
                  ...(processingResult.validationErrors
                    ? { validationErrors: processingResult.validationErrors }
                    : {}),
                };
              }

              return response;
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
              console.error(
                "[ingest] Processing failed",
                result.idempotencyKey,
                error,
              );
              totalFailed++;

              if (result.jobId) {
                await s3Utils.saveErrorToS3(result.jobId, result, error, {
                  stage: "processing_exception",
                  type: result.type,
                });
              }

              // Extract error details from caught error
              const errorDetails = {
                message: errorMessage,
                ...(error && typeof error === "object" && "apiResponse" in error
                  ? { externalApiResponse: error.apiResponse }
                  : {}),
                ...(error &&
                typeof error === "object" &&
                "responseBody" in error
                  ? { externalResponseBody: error.responseBody }
                  : {}),
                ...(error && typeof error === "object" && "status" in error
                  ? {
                      httpStatus: error.status,
                      httpStatusText: error.statusText,
                    }
                  : {}),
              };

              return {
                success: false,
                error: errorMessage,
                errorDetails,
                resultId: result.idempotencyKey,
                resultType: result.type,
                external_reference: externalReferenceOf(result),
              };
            }
          }),
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

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        allProcessingResults.push({
          success: false,
          error: errorMessage,
          errorDetails: {
            message: errorMessage,
            stage: "type_processing_failed",
            ...(error && typeof error === "object" && "apiResponse" in error
              ? { externalApiResponse: error.apiResponse }
              : {}),
          },
          resultId: result.idempotencyKey,
          resultType: type,
          external_reference: externalReferenceOf(result),
        });
        totalFailed++;
      }
    }
  }

  const successfulResults = allProcessingResults
    .filter((r) => r.success && "result" in r && r.result !== undefined)
    .map((r) => r.result);

  if (successfulResults.length > 0) {
    try {
      await s3Utils.saveProcessedResults(successfulResults, "final");
    } catch (error) {
      console.error("[ingest] Failed to save processed results to S3", error);
    }
  }

  const processingTimeMs = Date.now() - startTime;
  logger.logBatchSummary(
    acceptedResults.length,
    totalSuccessful,
    totalFailed,
    processingTimeMs,
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
    ...(pointer
      ? {
          offload: pointer.s3,
          correlationId: pointer.correlationId,
        }
      : {}),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Webhook registration — where a platform tells PRMS how to call it back when a Science Program
 * approves or rejects one of its results.
 *
 * Exposed here rather than pointing integrators at Reporting directly: they hold one base URL and
 * one key, and they do not need to know Reporting exists. This is a forward and nothing more —
 * Reporting resolves the recipient from the key and guards the URL.
 *
 * Ordering worth knowing, because the obvious assumption is wrong: registering is **not** a
 * prerequisite for submitting results. The destination is resolved when a Science Program decides,
 * not when a result is ingested. What matters is that one exists before that decision — a decision
 * taken with none registered is not delivered later, because no delivery is ever queued.
 */
function webhookClientFor(req, res, requestId) {
  const auth = req[AUTH_REQUEST_KEY];

  // `requireApiKey` guarantees the key, so this is unreachable today. Caught anyway for the same
  // reason as in /ingest: Express 4 hangs on a rejected promise from an async handler, so an
  // uncaught throw would leave the request open instead of failing it.
  try {
    return new ExternalApiClient(undefined, 30000, auth?.apiKey);
  } catch (error) {
    console.error("[webhook] cannot build the external API client", {
      requestId,
      message: error?.message,
    });
    res.status(500).json({
      ok: false,
      error: "internal_error",
      message: "Could not reach the reporting service.",
      requestId,
    });
    return undefined;
  }
}

/**
 * Surfaces Reporting's own status instead of flattening everything to 500.
 *
 * A 400 from the URL guard is the caller's mistake and has to read as one — collapsing it would
 * send them hunting a bug on our side. A 401 here, after we already accepted their key, means the
 * two hops disagree, and that is worth seeing rather than masking.
 */
function respondWithUpstreamFailure(res, error, requestId) {
  const status =
    typeof error?.status === "number" && error.status >= 400 ? error.status : 502;

  return res.status(status).json({
    ok: false,
    error: status === 504 ? "upstream_timeout" : "webhook_registration_failed",
    message: error?.apiResponse?.message ?? error?.message ?? "Unknown error",
    requestId,
  });
}

app.post("/webhook", requireApiKey, async (req, res) => {
  const requestId =
    req.headers["x-amzn-trace-id"] || req.headers["x-request-id"];

  const client = webhookClientFor(req, res, requestId);
  if (!client) return undefined;

  try {
    // `url` is passed through untouched. Reporting validates it — including refusing anything that
    // points inside a private network — and its message is what the caller needs to fix theirs.
    const result = await client.registerWebhook(req.body?.url);
    return res.status(200).json({ ok: true, ...result, requestId });
  } catch (error) {
    return respondWithUpstreamFailure(res, error, requestId);
  }
});

app.get("/webhook", requireApiKey, async (req, res) => {
  const requestId =
    req.headers["x-amzn-trace-id"] || req.headers["x-request-id"];

  const client = webhookClientFor(req, res, requestId);
  if (!client) return undefined;

  try {
    const result = await client.getWebhook();
    return res.status(200).json({ ok: true, ...result, requestId });
  } catch (error) {
    return respondWithUpstreamFailure(res, error, requestId);
  }
});

app.use("/result", resultsRouter);

export default app;
