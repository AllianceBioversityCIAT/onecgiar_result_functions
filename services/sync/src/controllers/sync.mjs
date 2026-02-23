import { ExternalApiClient } from "../clients/external-api.mjs";
import { OpenSearchClient } from "../clients/opensearch.mjs";
import { Logger } from "../utils/logger.mjs";

export class SyncController {
    externalApiClient;
    openSearchClient;
    logger;

    constructor() {
        this.externalApiClient = new ExternalApiClient();
        this.openSearchClient = new OpenSearchClient();
        this.logger = new Logger("SyncController");
    }

    async syncResults(req, res) {
        try {
            this.logger.info("Received sync request with query parameters", req.query);

            const { result_type, ...otherFilters } = req.query;

            // Ensure result_type is provided as it is mandatory
            if (!result_type) {
                this.logger.error("Missing mandatory parameter: result_type");
                return res.status(400).json({
                    error: "Missing mandatory parameter",
                    details: "result_type is required to map to the correct OpenSearch index",
                });
            }

            this.logger.info(`Valid result_type provided: ${result_type}. Fetching results...`);

            // 1. Fetch data from External API
            const apiResponse = await this.externalApiClient.fetchResultsList({
                result_type,
                ...otherFilters,
            });

            const items = apiResponse?.response?.items || [];
            const meta = apiResponse?.response?.meta || {};

            this.logger.info(`Fetched ${items.length} items from external API for result_type ${result_type}`);

            if (items.length === 0) {
                return res.status(200).json({
                    message: "No results matched the given filters.",
                    meta,
                    syncedCount: 0,
                });
            }

            // 2. Ensure the OpenSearch index exists for this result_type
            await this.openSearchClient.ensureIndex(result_type);

            // 3. Process and index items into OpenSearch
            const indexResults = [];
            const timestamp = new Date().toISOString();

            // We use Promise.all to map them concurrently (with small batches to avoid overwhelming OS)
            // Since mapping is fast, we construct the results first
            const osResults = items.map(async (item) => {
                // Construct the expected schema for OpenSearch mapping
                const idempotencyKey = `prms.result-management.api:${item.result_type_id}:${item.id}`;

                // Sanitize fields that might come as strings/numbers from external API but OpenSearch expects as objects natively
                const sanitizedPayload = { ...item };

                // Remove the fields that cause mapper_parsing_exception entirely from the raw payload
                // The main resulting index properties (like type, code, id) are outside of this payload scope
                delete sanitizedPayload.created_by;
                delete sanitizedPayload.last_updated_by;
                delete sanitizedPayload.submitted_by;

                const openSearchRecord = {
                    ...sanitizedPayload,
                    type: result_type,
                    idempotencyKey,
                    received_at: timestamp,
                    // Since tenant depends on the environment setup in fetcher, we assume default or extract if available
                    tenant: "prms",
                    // Store original payload for reference exactly as specified (but sanitized for OpenSearch strict mapping avoiding index 400s)
                    payload: sanitizedPayload,
                };

                try {
                    const osRes = await this.openSearchClient.indexResult(openSearchRecord);
                    return {
                        success: true,
                        id: idempotencyKey,
                        version: osRes._version,
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Unknown Error";
                    this.logger.error(`Failed to index item ${idempotencyKey}:`, error);
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

            this.logger.info(`Sync completed. Successfully indexed: ${successful}, Failed: ${failed}`);

            return res.status(200).json({
                message: "Sync process completed",
                stats: {
                    fetched: items.length,
                    successfullyIndexed: successful,
                    failedToIndex: failed,
                },
                meta,
                results: batchResults,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
            this.logger.error("Error during sync process:", error);

            return res.status(500).json({
                error: "Internal server error during sync",
                details: errorMessage,
            });
        }
    }
}
