import {
  ResultData,
  ProcessedResult,
  ProcessingResult,
  ProcessorInterface,
} from "../../types.js";
import { ExternalApiClient } from "../../clients/external-api.js";
import { OpenSearchClient } from "../../clients/opensearch.js";
import { Logger } from "../../utils/logger.js";

export class KnowledgeProductProcessor implements ProcessorInterface {
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
      this.logger.info("Starting knowledge product processing", resultId, {
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
      } = await this.externalApiClient.enrichResult(enrichedResult);

      if (!externalApiResponse) {
        this.logger.warn(
          "External API did not return enrichment (using local enriched result)",
          resultId
        );
      }

      await this.openSearchClient.ensureIndex(result.type);

      this.logger.info("Indexing in OpenSearch", resultId);
      const indexDoc = {
        ...externallyEnrichedResult,
        external_api_raw:
          externalApiResponse?.response || externalApiResponse || null,
        input_raw: result,
      };

      const opensearchResponse = await this.openSearchClient.indexResult(
        indexDoc
      );

      this.logger.success(
        "Knowledge product processed successfully",
        resultId,
        {
          hasExternalId: !!externallyEnrichedResult.result_id,
          hasResultCode: !!externallyEnrichedResult.result_code,
          opensearchVersion: opensearchResponse._version,
        }
      );

      return {
        success: true,
        result: externallyEnrichedResult,
        externalApiResponse,
        opensearchResponse,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Knowledge product processing failed", resultId, error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private enrichWithFixedFields(result: ResultData): ProcessedResult {
    return {
      ...result,
      result_type_id: 6,
      result_level_id: 4,
    };
  }

  /**
   * Proccess multiples knowledge products in parallel (con límite de concurrencia)
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
