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
    console.log("[ExternalApiClient] Enriching result", result);

    if (!this.baseUrl) {
      throw new Error("External API URL not configured");
    }

    const base = this.baseUrl.replace(/\/+$/, "");
    const url = `${base}/create`;

    console.log(`[ExternalApiClient] Sending result to ${url}`, {
      resultId: result.idempotencyKey,
      type: result.type,
    });

    const payload = {
      type: result.type,
      data: result.data,
    };

    console.log(
      `[ExternalApiClient] Payload being sent to ${url}:`,
      JSON.stringify(payload, null, 2)
    );

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(
        `[ExternalApiClient] Response status for ${result.idempotencyKey}:`,
        response.status,
        response.statusText
      );

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `[ExternalApiClient] Error response body for ${result.idempotencyKey}:`,
          errorBody
        );
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorBody}`);
      }

      const data = (await response.json()) as ExternalApiResponse;

      console.log(
        `[ExternalApiClient] Full API response for ${result.idempotencyKey}:`,
        JSON.stringify(data, null, 2)
      );

      const responsePayload = data?.response;
      const resultsCount = (() => {
        if (!responsePayload) {
          return 0;
        }

        if (Array.isArray(responsePayload)) {
          return responsePayload.length;
        }

        if (Array.isArray(responsePayload?.results)) {
          return responsePayload.results.length;
        }

        return 1;
      })();

      console.log(
        `[ExternalApiClient] Success response for ${result.idempotencyKey}`,
        {
          status: data.status ?? data.statusCode,
          message: data.message,
          resultsCount,
        }
      );

      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error(
          `[ExternalApiClient] Timeout (${this.timeout}ms) sending result ${result.idempotencyKey}`
        );
      }
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
  async enrichResult(result: ProcessedResult): Promise<{
    enriched: ProcessedResult;
    apiResponse?: ExternalApiResponse;
    success: boolean;
    error?: string;
  }> {
    try {
      const apiResponse = await this.sendResult(result);
      const enriched: ProcessedResult = { ...result };
      const primaryResult = this.extractPrimaryResult(apiResponse?.response);

      if (primaryResult && typeof primaryResult === "object") {
        const resultId = this.parseNumeric(
          primaryResult.id ?? primaryResult.result_id
        );
        const resultCode = this.parseNumeric(
          primaryResult.result_code ?? primaryResult.code
        );

        if (resultId !== undefined) {
          enriched.result_id = resultId;
        }

        if (resultCode !== undefined) {
          enriched.result_code = resultCode;
        }
      } else {
        console.warn(
          `[ExternalApiClient] No usable result data in response for ${result.idempotencyKey}`
        );
      }

      return { enriched, apiResponse, success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[ExternalApiClient] Failed to enrich result ${result.idempotencyKey}:`,
        error
      );
      return { enriched: result, success: false, error: errorMessage };
    }
  }

  private extractPrimaryResult(payload: any): any {
    if (!payload) {
      return undefined;
    }

    if (Array.isArray(payload)) {
      return payload[0];
    }

    if (Array.isArray(payload?.results)) {
      return payload.results[0];
    }

    if (Array.isArray(payload?.data)) {
      return payload.data[0];
    }

    if (payload?.results && typeof payload.results === "object") {
      return payload.results;
    }

    return payload;
  }

  private parseNumeric(value: unknown): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === "number" && !Number.isNaN(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return undefined;
  }
}
