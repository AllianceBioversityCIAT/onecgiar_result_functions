import fetch from "node-fetch";

export class OpenSearchClient {
  endpoint;
  auth;
  indexPrefix;

  constructor(endpoint, indexPrefix = "prms-results") {
    const baseEndpoint =
      endpoint || process.env.OPENSEARCH_ENDPOINT || "https://localhost:9200";

    this.endpoint = baseEndpoint.replace(/\/+$/, "");
    this.indexPrefix = indexPrefix;

    if (process.env.OPENSEARCH_USERNAME && process.env.OPENSEARCH_PASSWORD) {
      this.auth = {
        username: process.env.OPENSEARCH_USERNAME,
        password: process.env.OPENSEARCH_PASSWORD,
      };
    }
  }

  getIndexName(resultType) {
    return `${this.indexPrefix}-${resultType}`;
  }

  getGlobalAlias() {
    return `${this.indexPrefix}-management-api`;
  }

  async indexExists(name) {
    try {
      await this.makeRequest("HEAD", `/${encodeURIComponent(name)}`);
      return true;
    } catch (error) {
      if (error?.message?.includes("404")) {
        return false;
      }
      throw error;
    }
  }

  getHeaders() {
    const headers = {
      "Content-Type": "application/json",
    };

    if (this.auth) {
      const credentials = Buffer.from(
        `${this.auth.username}:${this.auth.password}`
      ).toString("base64");
      headers.Authorization = `Basic ${credentials}`;
    }

    return headers;
  }

  async ensureAlias(indexName) {
    const aliasName = this.getGlobalAlias();

    try {
      const existing = await this.makeRequest(
        "GET",
        `/_alias/${encodeURIComponent(aliasName)}`
      );

      if (existing?.[indexName]?.aliases?.[aliasName]) {
        console.log(
          `[OpenSearchClient] Index ${indexName} already in alias ${aliasName}`
        );
        return;
      }
    } catch (error) {
      if (error?.message?.includes("404")) {
        const aliasNameIsIndex = await this.indexExists(aliasName);
        if (aliasNameIsIndex) {
          const message = `Index with name '${aliasName}' exists but should be an alias. Please delete or rename the index manually.`;
          console.error(`[OpenSearchClient] ${message}`);
          throw new Error(message);
        }
      }
      if (!error?.message?.includes("404")) {
        console.warn(
          `[OpenSearchClient] Unable to verify alias ${aliasName} before ensuring`,
          error
        );
      }
    }

    try {
      await this.makeRequest("POST", "/_aliases", {
        actions: [
          {
            add: {
              index: indexName,
              alias: aliasName,
            },
          },
        ],
      });

      console.log(
        `[OpenSearchClient] Added index ${indexName} to alias ${aliasName}`
      );
    } catch (error) {
      console.error(
        `[OpenSearchClient] Failed to add index ${indexName} to alias ${aliasName}:`,
        error
      );
    }
  }

  async makeRequest(method, path, body) {
    const url = `${this.endpoint}${path}`;

    try {
      console.log(`[OpenSearchClient] -> ${method} ${path}`, {
        endpoint: this.endpoint,
        url,
      });

      const response = await fetch(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        ...(process.env.NODE_ENV !== "production" && {
          rejectUnauthorized: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let parsedBody;
        try {
          parsedBody = JSON.parse(errorText);
        } catch {
          parsedBody = undefined;
        }

        const err = new Error(
          `OpenSearch ${method} ${path} failed: ${response.status} ${response.statusText} - ${errorText}`
        );
        err.status = response.status;
        err.statusText = response.statusText;
        err.responseBody = parsedBody ?? errorText;
        err.source = "opensearch";
        throw err;
      }

      const contentLength = response.headers.get("content-length");
      const contentType = response.headers.get("content-type") || "";

      if (
        method === "HEAD" ||
        response.status === 204 ||
        contentLength === "0" ||
        (!contentLength && !contentType)
      ) {
        return {};
      }

      if (contentType.includes("application/json")) {
        return await response.json();
      }

      return await response.text();
    } catch (error) {
      console.error(
        `[OpenSearchClient] Request failed: ${method} ${url}`,
        error
      );
      throw error;
    }
  }

  parseNumericId(value) {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return undefined;
  }

  buildResultIdQuery(numericId) {
    return {
      size: 1000,
      query: {
        bool: {
          should: [
            { term: { result_id: numericId } },
            { term: { id: numericId } },
            { term: { id: String(numericId) } },
            { term: { "data.result_id": numericId } },
            { term: { "data.id": numericId } },
            { term: { "data.id": String(numericId) } },
          ],
          minimum_should_match: 1,
        },
      },
    };
  }

  async searchDocumentsByResultId(resultId) {
    const numericId = Number(resultId);
    if (!Number.isFinite(numericId)) {
      throw new Error(
        "A valid numeric resultId is required to search documents"
      );
    }

    const query = this.buildResultIdQuery(numericId);
    return this.search(query, true);
  }

  async indexResult(result) {
    const indexName = this.getIndexName(result.type);
    const resolvedResultId = this.parseNumericId(
      result.result_id ??
        result.id ??
        result?.data?.result_id ??
        result?.data?.id
    );
    let documentId =
      result.idempotencyKey ||
      resolvedResultId ||
      result.result_id ||
      result.id;

    if (!documentId) {
      try {
        const crypto = await import("crypto");
        const base = `${result.type}|${result.title}|${result.received_at}`;
        documentId = crypto
          .createHash("sha256")
          .update(base)
          .digest("hex")
          .slice(0, 24);
        console.warn(
          `[OpenSearchClient] documentId missing, generated fallback ${documentId}`
        );
      } catch (e) {
        throw new Error("Cannot generate documentId fallback");
      }
    }

    console.log(`[OpenSearchClient] Indexing result to ${indexName}`, {
      documentId,
      type: result.type,
      idempotencyKey: result.idempotencyKey,
      hasResultId: resolvedResultId !== undefined,
      hasResultCode: !!result.result_code,
      hasId: !!result.id,
    });

    try {
      const document = {
        ...result,
        ...(resolvedResultId !== undefined
          ? { result_id: resolvedResultId }
          : {}),
        indexed_at: new Date().toISOString(),
        has_external_id: resolvedResultId !== undefined,
      };

      const response = await this.makeRequest(
        "PUT",
        `/${indexName}/_doc/${encodeURIComponent(documentId)}?refresh=true`,
        document
      );

      console.log(
        `[OpenSearchClient] Successfully indexed result ${documentId}`,
        {
          index: indexName,
          version: response._version,
          result: response.result,
        }
      );

      return response;
    } catch (error) {
      console.error(
        `[OpenSearchClient] Error indexing result ${documentId}:`,
        error
      );
      throw error;
    }
  }

  async bulkIndex(results) {
    if (!results.length) {
      return { items: [] };
    }

    console.log(`[OpenSearchClient] Bulk indexing ${results.length} results`);

    try {
      const body = [];
      const indexTypes = new Set();

      for (const result of results) {
        const indexName = this.getIndexName(result.type);
        const resolvedResultId = this.parseNumericId(
          result.result_id ??
            result.id ??
            result?.data?.result_id ??
            result?.data?.id
        );
        const documentId =
          result.idempotencyKey ||
          resolvedResultId ||
          result.result_id ||
          result.id;

        indexTypes.add(result.type);

        body.push(
          JSON.stringify({
            index: {
              _index: indexName,
              _id: documentId,
            },
          })
        );

        body.push(
          JSON.stringify({
            ...result,
            ...(resolvedResultId !== undefined
              ? { result_id: resolvedResultId }
              : {}),
            indexed_at: new Date().toISOString(),
            tenant_type: `${result.tenant}_${result.type}`,
            has_external_id: resolvedResultId !== undefined,
          })
        );
      }

      for (const resultType of indexTypes) {
        await this.ensureIndex(resultType);
      }

      const bulkBody = body.join("\n") + "\n";

      const response = await this.makeRequest(
        "POST",
        "/_bulk?refresh=true",
        bulkBody
      );

      const errors = (response.items || []).filter(
        (item) => item.index?.error || item.create?.error || item.update?.error
      );

      if (errors.length > 0) {
        console.warn(
          `[OpenSearchClient] Bulk index completed with ${errors.length} errors:`,
          errors
        );
      } else {
        console.log(
          `[OpenSearchClient] Bulk index completed successfully for ${
            results.length
          } results across indices: ${Array.from(indexTypes)
            .map((t) => this.getIndexName(t))
            .join(", ")}`
        );
      }

      return response;
    } catch (error) {
      console.error("[OpenSearchClient] Error in bulk index:", error);
      throw error;
    }
  }

  async ensureIndex(resultType) {
    const indexName = this.getIndexName(resultType);
    const aliasName = this.getGlobalAlias();

    try {
      try {
        const info = await this.makeRequest(
          "GET",
          `/_alias/${encodeURIComponent(aliasName)}`
        );
        if (info?.[aliasName]?.aliases) {
          console.log(`[OpenSearchClient] Global alias ${aliasName} exists`);
        }
      } catch (error) {
        if (error?.message?.includes("404")) {
          const aliasNameIsIndex = await this.indexExists(aliasName);
          if (aliasNameIsIndex) {
            throw new Error(
              `Index with name '${aliasName}' exists but should be an alias. Please delete or rename the index manually.`
            );
          }
        } else {
          console.warn(
            `[OpenSearchClient] Unable to verify global alias ${aliasName} before ensuring index`,
            error
          );
        }
      }

      try {
        await this.makeRequest("HEAD", `/${indexName}`);
        console.log(`[OpenSearchClient] Index ${indexName} already exists`);
        await this.ensureAlias(indexName);
        return;
      } catch (error) {
        if (!error.message?.includes("404")) {
          throw error;
        }
      }

      console.log(`[OpenSearchClient] Creating physical index ${indexName}`);

      const indexConfig = {
        mappings: {
          properties: {
            type: { type: "keyword" },
            result_type_id: { type: "integer" },
            result_level_id: { type: "integer" },
            result_id: { type: "integer" },
            result_code: { type: "integer" },
            idempotencyKey: { type: "keyword" },
            jobId: { type: "keyword" },
            received_at: { type: "date" },
            indexed_at: { type: "date" },
            has_external_id: { type: "boolean" },

            title: { type: "text", analyzer: "standard" },
            description: { type: "text", analyzer: "standard" },

            submitted_by: {
              type: "object",
              properties: {
                email: { type: "keyword" },
                name: { type: "text" },
              },
            },
            payload: {
              type: "object",
              enabled: true,
            },
          },
        },
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
      };

      await this.makeRequest("PUT", `/${indexName}`, indexConfig);

      console.log(
        `[OpenSearchClient] Physical index ${indexName} created successfully`
      );
      await this.ensureAlias(indexName);
    } catch (error) {
      console.error(
        `[OpenSearchClient] Error ensuring index ${indexName}:`,
        error
      );

      if (
        error instanceof Error &&
        error.message.includes("should be an alias")
      ) {
        throw error;
      }
    }
  }

  async deleteByResultId(resultId) {
    const numericId = Number(resultId);
    if (!Number.isFinite(numericId)) {
      throw new Error(
        "A valid numeric resultId is required to delete documents"
      );
    }

    console.log(
      `[OpenSearchClient] Searching documents to delete for result_id/id=${numericId}`
    );

    let searchResponse;
    try {
      searchResponse = await this.searchDocumentsByResultId(numericId);
    } catch (error) {
      if (error?.status === 404 || error?.message?.includes("404")) {
        console.warn(
          `[OpenSearchClient] No alias/index found while deleting result_id=${numericId}`
        );
        return { deleted: 0, attempts: 0, results: [] };
      }
      throw error;
    }

    const hits = searchResponse?.hits?.hits || [];
    if (!hits.length) {
      console.log(
        `[OpenSearchClient] No documents matched result_id=${numericId}`
      );
      return { deleted: 0, attempts: 0, results: [] };
    }

    console.log(
      `[OpenSearchClient] Deleting ${hits.length} documents for result_id=${numericId}`
    );

    const results = [];

    for (const hit of hits) {
      const targetIndex = hit._index;
      const documentId = hit._id;
      try {
        await this.makeRequest(
          "DELETE",
          `/${targetIndex}/_doc/${encodeURIComponent(documentId)}?refresh=true`
        );
        results.push({
          index: targetIndex,
          id: documentId,
          success: true,
        });
      } catch (error) {
        console.error(
          `[OpenSearchClient] Failed to delete document ${documentId} from ${targetIndex}`,
          error
        );
        results.push({
          index: targetIndex,
          id: documentId,
          success: false,
          error: error?.message,
        });
      }
    }

    const deleted = results.filter((item) => item.success).length;

    return {
      deleted,
      attempts: results.length,
      results,
    };
  }

  async updateDocumentsByResultId(resultId, document) {
    const numericId = Number(resultId);
    if (!Number.isFinite(numericId)) {
      throw new Error(
        "A valid numeric resultId is required to update documents"
      );
    }

    if (!document || typeof document !== "object") {
      throw new Error("A document payload is required to update OpenSearch");
    }

    console.log(
      `[OpenSearchClient] Searching documents to update for result_id/id=${numericId}`
    );

    let searchResponse;
    try {
      searchResponse = await this.searchDocumentsByResultId(numericId);
    } catch (error) {
      if (error?.status === 404 || error?.message?.includes("404")) {
        console.warn(
          `[OpenSearchClient] No alias/index found while updating result_id=${numericId}`
        );
        return { updated: 0, attempts: 0, results: [] };
      }
      throw error;
    }

    const hits = searchResponse?.hits?.hits || [];
    if (!hits.length) {
      console.warn(
        `[OpenSearchClient] No documents matched result_id=${numericId} for update`
      );
      return { updated: 0, attempts: 0, results: [] };
    }

    const results = [];

    for (const hit of hits) {
      const targetIndex = hit._index;
      const documentId = hit._id;
      const existingSource = hit?._source || {};
      const updatedDocument = { ...document };

      updatedDocument.type = updatedDocument.type || existingSource.type;
      updatedDocument.tenant = updatedDocument.tenant || existingSource.tenant;
      updatedDocument.idempotencyKey =
        updatedDocument.idempotencyKey ||
        existingSource.idempotencyKey ||
        documentId;
      updatedDocument.received_at =
        updatedDocument.received_at ||
        existingSource.received_at ||
        new Date().toISOString();
      updatedDocument.result_id =
        this.parseNumericId(
          updatedDocument.result_id ??
            updatedDocument.id ??
            updatedDocument?.data?.result_id ??
            updatedDocument?.data?.id ??
            existingSource.result_id ??
            existingSource.id
        ) ?? numericId;

      const resolvedResultId = this.parseNumericId(updatedDocument.result_id);

      const body = {
        ...updatedDocument,
        indexed_at: new Date().toISOString(),
        has_external_id: resolvedResultId !== undefined,
        // Preserve existing payload if present, otherwise use new payload if provided
        payload: updatedDocument.payload !== undefined 
          ? updatedDocument.payload 
          : existingSource.payload,
      };

      try {
        await this.makeRequest(
          "PUT",
          `/${targetIndex}/_doc/${encodeURIComponent(documentId)}?refresh=true`,
          body
        );
        results.push({
          index: targetIndex,
          id: documentId,
          success: true,
        });
      } catch (error) {
        console.error(
          `[OpenSearchClient] Failed to update document ${documentId} in ${targetIndex}`,
          error
        );
        results.push({
          index: targetIndex,
          id: documentId,
          success: false,
          error: error?.message,
        });
      }
    }

    const updated = results.filter((item) => item.success).length;
    return { updated, attempts: results.length, results };
  }

  async search(query, useAlias = true) {
    const searchTarget = useAlias ? this.getGlobalAlias() : undefined;
    if (!searchTarget && useAlias) {
      throw new Error("Global alias not configured for search");
    }

    try {
      const target = searchTarget || "_all";
      return await this.makeRequest("POST", `/${target}/_search`, query);
    } catch (error) {
      console.error(
        `[OpenSearchClient] Search failed in ${searchTarget || "_all"}:`,
        error
      );
      throw error;
    }
  }

  async getDocument(resultType, documentId) {
    const indexName = this.getIndexName(resultType);
    try {
      return await this.makeRequest(
        "GET",
        `/${indexName}/_doc/${encodeURIComponent(documentId)}`
      );
    } catch (error) {
      console.error(`[OpenSearchClient] Get document failed:`, error);
      throw error;
    }
  }

  async searchAll(query) {
    return this.search(query, true);
  }

  async searchByType(resultType, query) {
    const indexName = this.getIndexName(resultType);
    try {
      return await this.makeRequest("POST", `/${indexName}/_search`, query);
    } catch (error) {
      console.error(`[OpenSearchClient] Search failed in ${indexName}:`, error);
      throw error;
    }
  }
}
