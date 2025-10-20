import fetch from "node-fetch";
import { ExternalApiResponse, ProcessedResult } from "../types.js";

export class ExternalApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout = 30000) {
    this.baseUrl = baseUrl || (process as any).env.EXTERNAL_API_URL || "";
    this.timeout = timeout;
  }

  async sendResult(result: ProcessedResult): Promise<ExternalApiResponse> {
    if (!this.baseUrl) {
      throw new Error("External API URL not configured");
    }

    console.log(`[ExternalApiClient] Sending result to ${this.baseUrl}`, {
      resultId: result.idempotencyKey,
      type: result.type,
    });

    try {
      const base = this.baseUrl.replace(/\/+$/, "");
      const url = `${base}/create`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(result),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as ExternalApiResponse;

      console.log(
        `[ExternalApiClient] Success response for ${result.idempotencyKey}`,
        {
          status: data.status,
          message: data.message,
          resultsCount: data.response?.results?.length || 0,
        }
      );

      return data;
    } catch (error) {
      console.error(
        `[ExternalApiClient] Error sending result ${result.idempotencyKey}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Sends a result once and returns both the possibly enriched result (adding result_id/result_code)
   * and the raw API response. On failure returns the original result and throws the error upward if desired.
   */
  async enrichResult(
    result: ProcessedResult
  ): Promise<{ enriched: ProcessedResult; apiResponse?: ExternalApiResponse }> {
    try {
      console.log(`[ExternalApiClient] Enriching result ${result}`);
      const apiResponse = await this.sendResult(result);

      const externalResult = apiResponse.response?.results?.[0];
      if (externalResult) {
        const enriched: ProcessedResult = {
          ...result,
          result_id: externalResult.id,
          result_code: externalResult.result_code,
        };
        return { enriched, apiResponse };
      }

      console.warn(
        `[ExternalApiClient] No result data in response for ${result.idempotencyKey}`
      );
      return { enriched: result, apiResponse };
    } catch (error) {
      console.error(
        `[ExternalApiClient] Failed to enrich result ${result.idempotencyKey}:`,
        error
      );
      return { enriched: result };
    }
  }
}
