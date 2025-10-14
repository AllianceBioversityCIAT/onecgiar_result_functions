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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.baseUrl, {
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

  async enrichResult(result: ProcessedResult): Promise<ProcessedResult> {
    try {
      const apiResponse = await this.sendResult(result);

      // Extraer id y result_code de la respuesta
      const externalResult = apiResponse.response?.results?.[0];
      if (externalResult) {
        return {
          ...result,
          result_id: externalResult.id,
          result_code: externalResult.result_code,
        };
      }

      console.warn(
        `[ExternalApiClient] No result data in response for ${result.idempotencyKey}`
      );
      return result;
    } catch (error) {
      console.error(
        `[ExternalApiClient] Failed to enrich result ${result.idempotencyKey}:`,
        error
      );
      // En caso de error, devolvemos el resultado sin enriquecer
      return result;
    }
  }
}
