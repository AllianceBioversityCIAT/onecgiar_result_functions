import fetch from "node-fetch";

export class OpenSearchClient {
  endpoint;
  auth;
  indexPrefix;

  constructor(endpoint, indexPrefix = "prms-results") {
    const baseEndpoint =
      endpoint ||
      process.env.OPENSEARCH_ENDPOINT ||
      "https://localhost:9200";

    this.endpoint = baseEndpoint.replace(/\/+$/, "");
    this.indexPrefix = indexPrefix;

    if (
      process.env.OPENSEARCH_USERNAME &&
      process.env.OPENSEARCH_PASSWORD
    ) {
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

  async makeRequest(
    method,
    path,
    body
  ) {
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
        ...(process.env.NODE_ENV !== "production" &&
          ({ rejectUnauthorized: false })),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenSearch ${method} ${path} failed: ${response.status} ${response.statusText} - ${errorText}`
        );
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

  async indexResult(result) {
    const indexName = this.getIndexName(result.type);
    let documentId = result.idempotencyKey || result.result_id || result.id;

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
      hasResultId: !!result.result_id,
      hasResultCode: !!result.result_code,
      hasId: !!result.id,
    });

    try {
      const document = {
        ...result,
        indexed_at: new Date().toISOString(),
        has_external_id: !!result.result_id,
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
        const documentId = result.idempotencyKey || result.result_id || result.id;

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
            indexed_at: new Date().toISOString(),
            tenant_type: `${result.tenant}_${result.type}`,
            has_external_id: !!result.result_id,
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
        (item) =>
          item.index?.error || item.create?.error || item.update?.error
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
