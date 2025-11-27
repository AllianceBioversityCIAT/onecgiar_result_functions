import { LambdaEvent, ResultData } from "./types.js";
import { ProcessorFactory } from "./processors/factory.js";
import { S3Utils } from "./utils/s3.js";
import { Logger } from "./utils/logger.js";

export const handler = async (event: LambdaEvent) => {
  const startTime = Date.now();
  const logger = new Logger();
  const s3Utils = new S3Utils();
  const processorFactory = new ProcessorFactory(logger);

  logger.info("Handler started", undefined, {
    source: event.source,
    detailType: event["detail-type"],
  });

  try {
    const detail = event?.detail ?? {};
    let rawData: any;
    const detailIndexRaw =
      (detail as any)?.result_index ?? (detail as any)?.resultIndex;
    const parsedDetailIndex =
      typeof detailIndexRaw === "number"
        ? detailIndexRaw
        : typeof detailIndexRaw === "string"
        ? Number.parseInt(detailIndexRaw, 10)
        : undefined;
    const hasSpecificIndex =
      parsedDetailIndex !== undefined &&
      Number.isInteger(parsedDetailIndex) &&
      parsedDetailIndex >= 0;

    if (detail?.s3) {
      logger.info("Loading data from S3", undefined, {
        bucket: detail.s3.bucket,
        key: detail.s3.key,
      });
      rawData = await s3Utils.getJsonFromS3(detail.s3.bucket, detail.s3.key);
    } else {
      rawData = detail?.payload ?? {};
    }

    let results: ResultData[] = [];

    if (Array.isArray(rawData)) {
      if (hasSpecificIndex) {
        results = rawData[parsedDetailIndex]
          ? [rawData[parsedDetailIndex]]
          : [];
        if (!results.length) {
          logger.warn("Detail index not found in raw array", undefined, {
            requestedIndex: parsedDetailIndex,
            available: rawData.length,
          });
          results = rawData;
        }
      } else {
        results = rawData;
      }
    } else if (rawData.results && Array.isArray(rawData.results)) {
      if (hasSpecificIndex) {
        const candidate = rawData.results[parsedDetailIndex];
        if (candidate !== undefined) {
          results = [candidate];
        } else {
          logger.warn("Detail index not found in results array", undefined, {
            requestedIndex: parsedDetailIndex,
            available: rawData.results.length,
          });
          results = rawData.results;
        }
      } else {
        results = rawData.results;
      }
    } else if (rawData.data) {
      results = Array.isArray(rawData.data) ? rawData.data : [rawData.data];
    } else {
      results = [rawData];
    }

    const nowIso = new Date().toISOString();

    const rootTenant = (rawData as any)?.tenant;
    const rootOp = (rawData as any)?.op;
    const rootJobId = (rawData as any)?.jobId || detail?.jobId;
    const detailIdempotencyKey = detail?.idempotencyKey;

    const crypto = await import("crypto");

    results = results.map((r: any, idx: number) => {
      if (!r || typeof r !== "object") {
        return {
          type: "unknown",
          received_at: nowIso,
          idempotencyKey: `invalid-${idx}`,
          raw: r,
        } as any;
      }

      const type = r.type || r.result_type || "knowledge_product";
      const received_at = r.received_at || nowIso;

      let idempotencyKey = detailIdempotencyKey || r.idempotencyKey;

      if (!idempotencyKey) {
        const handle = r.knowledge_product?.handle;
        const naturalId = r.result_id ?? r.id ?? handle ?? null;
        idempotencyKey = naturalId ? String(naturalId) : undefined;
      }

      if (!idempotencyKey) {
        const base = JSON.stringify({
          tenant: r.tenant || rootTenant || "",
          type,
          title: r.title,
          created_date: r.created_date,
          submitted_by: r.submitted_by?.email,
        });
        idempotencyKey = crypto
          .createHash("sha256")
          .update(base)
          .digest("hex")
          .slice(0, 20);
      }

      const tenant = r.tenant || rootTenant;
      const op = r.op || rootOp;
      const jobId = r.jobId || rootJobId;

      return {
        type,
        received_at,
        idempotencyKey,
        ...(tenant ? { tenant } : {}),
        ...(op ? { op } : {}),
        ...(jobId ? { jobId } : {}),
        ...r,
      };
    });

    if (!results.length) {
      logger.warn("No results to process");
      return {
        ok: false,
        message: "No results found in event",
        processed: 0,
        successful: 0,
        failed: 0,
      };
    }

    logger.info(`Processing ${results.length} results`);

    const resultsByType = new Map<string, ResultData[]>();

    for (const result of results) {
      const type = result.type || "unknown";
      if (!resultsByType.has(type)) {
        resultsByType.set(type, []);
      }
      resultsByType.get(type)!.push(result);
    }

    const allProcessingResults = [];
    let totalSuccessful = 0;
    let totalFailed = 0;

    for (const [type, typeResults] of resultsByType) {
      logger.info(`Processing ${typeResults.length} results of type: ${type}`);

      try {
        if (!processorFactory.isTypeSupported(type)) {
          logger.error(`Unsupported result type: ${type}`, undefined, {
            supportedTypes: processorFactory.getSupportedTypes(),
          });

          for (const result of typeResults) {
            const error = new Error(`Unsupported result type: ${type}`);

            // Save error to S3 if jobId is available
            if (result.jobId) {
              await s3Utils.saveErrorToS3(result.jobId, result, error, {
                stage: "unsupported_type",
                supportedTypes: processorFactory.getSupportedTypes(),
              });
            }

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

        const batchSize = parseInt((process as any).env.BATCH_SIZE || "10");
        const batches = [];

        for (let i = 0; i < typeResults.length; i += batchSize) {
          batches.push(typeResults.slice(i, i + batchSize));
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

                  // Save error to S3 if jobId is available
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
                logger.error("Processing failed", result.idempotencyKey, error);
                totalFailed++;

                // Save error to S3 if jobId is available
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
        logger.error(`Failed to process type ${type}`, undefined, error);

        for (const result of typeResults) {
          // Save error to S3 if jobId is available
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
        (r): r is any => r.success && "result" in r && r.result !== undefined
      )
      .map((r) => r.result);

    if (successfulResults.length > 0) {
      await s3Utils.saveProcessedResults(successfulResults, "final");
    }

    const processingTimeMs = Date.now() - startTime;
    logger.logBatchSummary(
      results.length,
      totalSuccessful,
      totalFailed,
      processingTimeMs
    );

    const response = {
      ok: totalFailed === 0,
      message:
        totalFailed === 0
          ? "All results processed successfully"
          : `Processed with ${totalFailed} failures`,
      processed: results.length,
      successful: totalSuccessful,
      failed: totalFailed,
      processingTimeMs,
      logs: logger.getLogsSummary(),
      correlationId: detail?.correlationId,
      timestamp: new Date().toISOString(),
    };

    logger.info("Handler completed", undefined, response);
    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("Handler failed", undefined, error);

    return {
      ok: false,
      message: `Handler failed: ${errorMessage}`,
      processed: 0,
      successful: 0,
      failed: 0,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    };
  }
};
