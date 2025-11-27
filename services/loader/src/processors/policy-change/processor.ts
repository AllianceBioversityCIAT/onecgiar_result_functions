import {
  ResultData,
  ProcessedResult,
  ProcessingResult,
  ProcessorInterface,
} from "../../types.js";
import { ExternalApiClient } from "../../clients/external-api.js";
import { OpenSearchClient } from "../../clients/opensearch.js";
import { Logger } from "../../utils/logger.js";

export class PolicyChangeProcessor implements ProcessorInterface {
  private externalApiClient: ExternalApiClient;
  private openSearchClient: OpenSearchClient;
  private logger: Logger;

  constructor(logger: Logger) {
    this.externalApiClient = new ExternalApiClient();
    this.openSearchClient = new OpenSearchClient();
    this.logger = logger;
  }

  async process(result: ResultData): Promise<ProcessingResult> {
    const resultId = result.idempotencyKey;

    try {
      this.logger.info("Starting policy change processing", resultId, {
        type: result.type,
      });

      const normalizedLeadCenter = (() => {
        const lc = (result as any).lead_center;
        if (!lc) return undefined;
        if (typeof lc === "string") return lc;
        if (typeof lc === "object") {
          return (
            lc.acronym ||
            lc.name ||
            (lc.institution_id ? `INST-${lc.institution_id}` : undefined)
          );
        }
        return undefined;
      })();

      const resultForEnrichment = {
        ...result,
        lead_center: normalizedLeadCenter,
      } as ResultData;

      const enrichedResult = this.enrichWithFixedFields(resultForEnrichment);

      this.logger.info("Sending to external API (single call)", resultId);
      const {
        enriched: externallyEnrichedResult,
        apiResponse: externalApiResponse,
        success: externalSuccess = true,
        error: externalError,
      } = await this.externalApiClient.enrichResult(enrichedResult);

      if (!externalSuccess) {
        const message =
          externalError || "External API failed; skipping OpenSearch indexing";
        this.logger.error(message, resultId);
        return {
          success: false,
          error: message,
          externalSuccess,
          externalError: externalError,
        };
      }

      if (!externalApiResponse) {
        this.logger.warn(
          "External API did not return enrichment (using local enriched result)",
          resultId
        );
      }

      await this.openSearchClient.ensureIndex(result.type);

      this.logger.info("Indexing in OpenSearch", resultId);
      const indexDoc = externalApiResponse?.response ?? null;

      if (!indexDoc) {
        this.logger.warn("No response data to index in OpenSearch", resultId);
        return {
          success: true,
          result: externallyEnrichedResult,
          externalApiResponse,
          opensearchResponse: null,
        };
      }

      const opensearchResponse = await this.openSearchClient.indexResult({
        ...indexDoc,
        type: result.type,
        idempotencyKey: result.idempotencyKey,
        received_at: result.received_at,
        tenant: result.tenant,
      });

      this.logger.success("Policy change processed successfully", resultId, {
        hasExternalId: !!externallyEnrichedResult.result_id,
        hasResultCode: !!externallyEnrichedResult.result_code,
        opensearchVersion: opensearchResponse._version,
      });

      return {
        success: true,
        result: externallyEnrichedResult,
        externalApiResponse,
        opensearchResponse,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Policy change processing failed", resultId, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private enrichWithFixedFields(result: ResultData): ProcessedResult {
    const enriched = { ...result };
    enriched.data = {
      ...(enriched.data || {}),
      result_type_id: 1,
      result_level_id: 3,
    };
    return enriched as ProcessedResult;
  }

  /**
   * Process multiple policy change results in parallel (with concurrency limit)
   */
  async processBatch(
    results: ResultData[],
    concurrency = 5
  ): Promise<ProcessingResult[]> {
    const batches = [];
    for (let i = 0; i < results.length; i += concurrency) {
      batches.push(results.slice(i, i + concurrency));
    }

    const allResults: ProcessingResult[] = [];

    for (const batch of batches) {
      const batchPromises = batch.map((result) => this.process(result));
      const batchResults = await Promise.allSettled(batchPromises);

      for (const settledResult of batchResults) {
        if (settledResult.status === "fulfilled") {
          allResults.push(settledResult.value);
        } else {
          allResults.push({
            success: false,
            error: settledResult.reason?.message || "Promise rejected",
          });
        }
      }
    }

    return allResults;
  }
}
