import fetch from "node-fetch";

export class ExternalApiClient {
  baseUrl;
  timeout;

  constructor(baseUrl, timeout = 30000) {
    this.baseUrl = baseUrl || process.env.EXTERNAL_API_URL || "";
    this.timeout = timeout;
  }

  async sendResult(result) {
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
      ...(result.jobId ? { jobId: result.jobId } : {}),
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
        let parsedBody;
        try {
          parsedBody = JSON.parse(errorBody);
        } catch {
          parsedBody = undefined;
        }

        console.error(
          `[ExternalApiClient] Error response body for ${result.idempotencyKey}:`,
          errorBody
        );

        const err = new Error(
          `HTTP ${response.status}: ${response.statusText} - ${errorBody}`
        );
        err.status = response.status;
        err.statusText = response.statusText;
        err.apiResponse = parsedBody ?? errorBody;
        err.responseBody = errorBody;
        err.url = url;
        throw err;
      }

      const data = await response.json();

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
      if (error instanceof Error && error.name === "AbortError") {
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

  async deleteResult(resultId) {
    const numericId = Number(resultId);
    if (!Number.isFinite(numericId)) {
      throw new Error(
        "A valid numeric resultId is required to delete a result"
      );
    }

    if (!this.baseUrl) {
      throw new Error("External API URL not configured");
    }

    const base = this.baseUrl.replace(/\/+$/, "");
    const url = `${base}/delete/${encodeURIComponent(String(numericId))}`;

    console.log(`[ExternalApiClient] Deleting result ${numericId} via ${url}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const err = new Error(
          `HTTP ${response.status}: ${response.statusText} deleting result ${numericId}`
        );
        err.status = response.status;
        err.statusText = response.statusText;
        err.apiResponse = body;
        err.url = url;
        throw err;
      }

      console.log(
        `[ExternalApiClient] Delete result ${numericId} response:`,
        body
      );

      return {
        status: response.status,
        statusText: response.statusText,
        response: body,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(
          `[ExternalApiClient] Timeout (${this.timeout}ms) deleting result ${numericId}`
        );
      }

      console.error(
        `[ExternalApiClient] Failed to delete result ${numericId}:`,
        error
      );
      throw error;
    }
  }

  async updateResult(resultId, payload) {
    const numericId = Number(resultId);
    if (!Number.isFinite(numericId)) {
      throw new Error(
        "A valid numeric resultId is required to update a result"
      );
    }

    if (!payload || typeof payload !== "object") {
      throw new Error("Update payload must be an object");
    }

    const type =
      typeof payload.type === "string" ? payload.type.trim() : undefined;
    if (!type) {
      throw new Error("Update payload must include a type");
    }

    if (!payload.data || typeof payload.data !== "object") {
      throw new Error("Update payload must include a data object");
    }

    if (!this.baseUrl) {
      throw new Error("External API URL not configured");
    }

    const body = {
      type,
      data: payload.data,
      ...(payload.jobId ? { jobId: payload.jobId } : {}),
    };

    const base = this.baseUrl.replace(/\/+$/, "");
    const url = `${base}/update/${encodeURIComponent(String(numericId))}`;

    console.log(`[ExternalApiClient] Updating result ${numericId} via ${url}`, {
      type,
      hasJobId: !!payload.jobId,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type") || "";
      const responseBody = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        const err = new Error(
          `HTTP ${response.status}: ${response.statusText} updating result ${numericId}`
        );
        err.status = response.status;
        err.statusText = response.statusText;
        err.apiResponse = responseBody;
        err.url = url;
        throw err;
      }

      console.log(
        `[ExternalApiClient] Update result ${numericId} response:`,
        responseBody
      );

      return responseBody;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(
          `[ExternalApiClient] Timeout (${this.timeout}ms) updating result ${numericId}`
        );
      }

      console.error(
        `[ExternalApiClient] Failed to update result ${numericId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Sends a result once and returns both the possibly enriched result (adding result_id/result_code)
   * and the raw API response. On failure returns the original result and throws the error upward if desired.
   */
  async enrichResult(result) {
    try {
      const apiResponse = await this.sendResult(result);
      const enriched = { ...result };
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
      const apiResponse =
        error && typeof error === "object" && "apiResponse" in error
          ? error.apiResponse
          : undefined;
      console.error(
        `[ExternalApiClient] Failed to enrich result ${result.idempotencyKey}:`,
        error
      );
      return {
        enriched: result,
        apiResponse,
        success: false,
        error: errorMessage,
      };
    }
  }

  extractPrimaryResult(payload) {
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

  parseNumeric(value) {
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
