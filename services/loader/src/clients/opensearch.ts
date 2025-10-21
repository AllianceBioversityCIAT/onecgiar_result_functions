import fetch from "node-fetch";
import { ProcessedResult } from "../types.js";

export class OpenSearchClient {
  private endpoint: string;
  private auth?: { username: string; password: string };
  private indexPrefix: string;

  constructor(endpoint?: string, indexPrefix = "prms-results") {
    this.endpoint =
      endpoint ||
      (process as any).env.OPENSEARCH_ENDPOINT ||
      "https://localhost:9200";
    this.indexPrefix = indexPrefix;

    if (
      (process as any).env.OPENSEARCH_USERNAME &&
      (process as any).env.OPENSEARCH_PASSWORD
    ) {
      this.auth = {
        username: (process as any).env.OPENSEARCH_USERNAME,
        password: (process as any).env.OPENSEARCH_PASSWORD,
      };
    }
  }

  private getIndexName(resultType: string): string {
    // Crear índice específico por tipo: prms-results-knowledge-product, etc.
    return `${this.indexPrefix}-${resultType.replace(/_/g, "-")}`;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
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

  private async ensureAlias(indexName: string): Promise<void> {
    const aliasName = this.indexPrefix;

    try {
      const existing = await this.makeRequest(
        "GET",
        `/_alias/${encodeURIComponent(aliasName)}`
      );

      if (existing?.[indexName]?.aliases?.[aliasName]) {
        return;
      }
    } catch (error: any) {
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

      console.log(`[OpenSearchClient] Alias ensured`, {
        alias: aliasName,
        index: indexName,
      });
    } catch (error) {
      console.error(
        `[OpenSearchClient] Failed to ensure alias ${aliasName} for ${indexName}:`,
        error
      );
    }
  }

  private async makeRequest(
    method: string,
    path: string,
    body?: any
  ): Promise<any> {
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
          ({ rejectUnauthorized: false } as any)),
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

  async indexResult(result: any): Promise<any> {
    const indexName = this.getIndexName(result.type);
    let documentId = result.result_id || result.idempotencyKey;

    if (!documentId) {
      // Fallback: build hash from title + received_at
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
      hasResultId: !!result.result_id,
      hasResultCode: !!result.result_code,
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

  async bulkIndex(results: ProcessedResult[]): Promise<any> {
    if (!results.length) {
      return { items: [] };
    }

    console.log(`[OpenSearchClient] Bulk indexing ${results.length} results`);

    try {
      const body = [];

      for (const result of results) {
        const indexName = this.getIndexName(result.type);
        const documentId = result.result_id || result.idempotencyKey;

        // Index action
        body.push(
          JSON.stringify({
            index: {
              _index: indexName,
              _id: documentId,
            },
          })
        );

        // Document
        body.push(
          JSON.stringify({
            ...result,
            indexed_at: new Date().toISOString(),
            tenant_type: `${result.tenant}_${result.type}`,
            has_external_id: !!result.result_id,
          })
        );
      }

      // El bulk API requiere newlines al final
      const bulkBody = body.join("\n") + "\n";

      const response = await this.makeRequest(
        "POST",
        "/_bulk?refresh=true",
        bulkBody
      );

      // Contar errores
      const errors = (response.items || []).filter(
        (item: any) =>
          item.index?.error || item.create?.error || item.update?.error
      );

      if (errors.length > 0) {
        console.warn(
          `[OpenSearchClient] Bulk index completed with ${errors.length} errors:`,
          errors
        );
      } else {
        console.log(
          `[OpenSearchClient] Bulk index completed successfully for ${results.length} results`
        );
      }

      return response;
    } catch (error) {
      console.error("[OpenSearchClient] Error in bulk index:", error);
      throw error;
    }
  }

  async ensureIndex(resultType: string): Promise<void> {
    const indexName = this.getIndexName(resultType);

    try {
      // Verificar si el índice existe
      try {
        await this.makeRequest("HEAD", `/${indexName}`);
        // Si no lanza error, el índice existe
        await this.ensureAlias(indexName);
        return;
      } catch (error: any) {
        // Si es 404, el índice no existe, continuar para crearlo
        if (!error.message?.includes("404")) {
          throw error;
        }
      }

      console.log(`[OpenSearchClient] Creating index ${indexName}`);

      const indexConfig = {
        mappings: {
          properties: {
            type: { type: "keyword" },
            result_type_id: { type: "integer" },
            result_level_id: { type: "integer" },
            result_id: { type: "integer" },
            result_code: { type: "integer" },
            idempotencyKey: { type: "keyword" },
            received_at: { type: "date" },
            indexed_at: { type: "date" },
            has_external_id: { type: "boolean" },
            // Campos específicos para knowledge products
            title: { type: "text", analyzer: "standard" },
            description: { type: "text", analyzer: "standard" },
            lead_center: { type: "keyword" },
            // Raw external API full JSON
            external_api_raw: { type: "object" },
            // Original input before enrichment
            input_raw: { type: "object" },
            // Campos anidados para búsquedas más complejas
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
          number_of_replicas: 0, // Para desarrollo, en producción usar 1
        },
      };

      await this.makeRequest("PUT", `/${indexName}`, indexConfig);

      console.log(`[OpenSearchClient] Index ${indexName} created successfully`);
      await this.ensureAlias(indexName);
    } catch (error) {
      console.error(
        `[OpenSearchClient] Error ensuring index ${indexName}:`,
        error
      );
      // No lanzamos el error para evitar que falle el procesamiento
    }
  }

  // Método para buscar documentos (útil para debugging)
  async search(indexName: string, query: any): Promise<any> {
    try {
      return await this.makeRequest("POST", `/${indexName}/_search`, query);
    } catch (error) {
      console.error(`[OpenSearchClient] Search failed in ${indexName}:`, error);
      throw error;
    }
  }

  // Método para obtener un documento específico
  async getDocument(resultType: string, documentId: string): Promise<any> {
    const indexName = this.getIndexName(resultType);
    try {
      return await this.makeRequest("GET", `/${indexName}/_doc/${documentId}`);
    } catch (error) {
      console.error(`[OpenSearchClient] Get document failed:`, error);
      throw error;
    }
  }
}
