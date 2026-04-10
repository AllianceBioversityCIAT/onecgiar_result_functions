/**
 * Sync job logic - performs the actual synchronization work
 */
import { ExternalApiClient } from "./clients/external-api.mjs";
import { OpenSearchClient } from "./clients/opensearch.mjs";
import { Logger } from "./utils/logger.mjs";

/**
 * Runs the sync job
 * @param {Object} options - Job options
 * @param {string} options.env - Environment (testing, staging, production)
 * @param {string} options.requestId - Request ID for tracing
 * @param {string} [options.result_type] - Optional result type filter
 * @param {number} [options.page] - Optional page number (if not provided, syncs all pages)
 * @param {number} [options.limit] - Optional page size (default: 100)
 * @returns {Promise<Object>} Job result
 */
export async function runSyncJob(options = {}) {
  const {
    env = "testing",
    requestId = `job-${Date.now()}`,
    result_type,
    page,
    limit = 100,
    ...otherFilters
  } = options;

  const logger = new Logger("SyncJob");
  const startTime = Date.now();

  logger.info("Starting sync job", requestId, {
    env,
    result_type,
    page,
    limit,
    filters: otherFilters,
  });

  try {
    // Initialize clients
    const externalApiClient = new ExternalApiClient();
    const openSearchClient = new OpenSearchClient();

    // Validate that result_type is provided (mandatory for OpenSearch index mapping)
    if (!result_type) {
      throw new Error(
        "result_type is required to map to the correct OpenSearch index"
      );
    }

    logger.info(`Fetching results for result_type: ${result_type}`, requestId);

    // Fetch results from external API
    let items = [];
    let meta = {};

    if (page !== undefined && page !== null && page !== "") {
      // Single page mode
      const apiResponse = await externalApiClient.fetchResultsList({
        result_type,
        page: Number(page),
        limit: Math.min(Math.max(Number(limit), 1), 500),
        ...otherFilters,
      });
      items = apiResponse?.response?.items || [];
      meta = apiResponse?.response?.meta || {};
    } else {
      // Fetch all pages
      let currentPage = 1;
      let hasMore = true;
      const pageSize = Math.min(Math.max(Number(limit), 1), 500);

      while (hasMore) {
        const apiResponse = await externalApiClient.fetchResultsList({
          result_type,
          page: currentPage,
          limit: pageSize,
          ...otherFilters,
        });
        const pageItems = apiResponse?.response?.items || [];
        if (currentPage === 1) meta = apiResponse?.response?.meta || {};
        items = items.concat(pageItems);
        logger.info(
          `Fetched page ${currentPage}: ${pageItems.length} items (total: ${items.length})`,
          requestId
        );
        if (pageItems.length < pageSize) hasMore = false;
        else currentPage += 1;
      }
    }

    logger.info(
      `Fetched ${items.length} items from external API`,
      requestId,
      { result_type, meta }
    );

    if (items.length === 0) {
      logger.info("No results to sync", requestId);
      return {
        success: true,
        message: "No results matched the given filters",
        fetched: 0,
        indexed: 0,
        failed: 0,
        meta,
      };
    }

    // Ensure OpenSearch index exists
    await openSearchClient.ensureIndex(result_type);

    // Process and index items into OpenSearch
    const timestamp = new Date().toISOString();
    const osResults = items.map(async (item) => {
      const idempotencyKey = `prms.result-management.api:${item.result_type_id}:${item.id}`;

      // Sanitize fields that might cause mapper_parsing_exception
      const sanitizedPayload = { ...item };
      delete sanitizedPayload.created_by;
      delete sanitizedPayload.last_updated_by;
      delete sanitizedPayload.submitted_by;

      const openSearchRecord = {
        ...sanitizedPayload,
        type: result_type,
        idempotencyKey,
        received_at: timestamp,
        tenant: "prms",
        payload: sanitizedPayload,
      };

      try {
        const osRes = await openSearchClient.indexResult(openSearchRecord);
        return {
          success: true,
          id: idempotencyKey,
          version: osRes._version,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown Error";
        logger.error(`Failed to index item ${idempotencyKey}`, requestId, {
          error: errorMessage,
        });
        return {
          success: false,
          id: idempotencyKey,
          error: errorMessage,
        };
      }
    });

    const batchResults = await Promise.all(osResults);
    const successful = batchResults.filter((r) => r.success).length;
    const failed = batchResults.filter((r) => !r.success).length;

    const duration = Date.now() - startTime;

    logger.info("Sync job completed", requestId, {
      fetched: items.length,
      indexed: successful,
      failed,
      duration: `${duration}ms`,
    });

    return {
      success: true,
      message: "Sync process completed",
      fetched: items.length,
      indexed: successful,
      failed,
      duration: `${duration}ms`,
      meta,
      results: batchResults,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    logger.error("Sync job failed", requestId, {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
