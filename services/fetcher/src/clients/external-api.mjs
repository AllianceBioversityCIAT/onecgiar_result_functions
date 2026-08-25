import fetch from "node-fetch";

/**
 * Errors thrown from `sendResult` carry `apiResponse` and `responseBody` — Reporting's full error
 * body, which echoes the caller's payload back. Log the diagnosis, not the cargo.
 */
function summarizeError(error) {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }

  return {
    name: error.name,
    message: error.message,
    ...(error.status !== undefined ? { status: error.status } : {}),
    ...(error.statusText !== undefined ? { statusText: error.statusText } : {}),
    ...(error.url !== undefined ? { url: error.url } : {}),
  };
}

export class ExternalApiClient {
  baseUrl;
  apiKey;
  timeout;

  /**
   * `apiKey` is the credential of the platform that called us, validated by `requireApiKey` and
   * handed down per request. It is deliberately NOT defaulted to `process.env.EXTERNAL_API_KEY`:
   * that fallback fails in the worst possible way — silently, by attributing a platform's result
   * to the Fetcher, which is the exact bug this credential pass-through exists to close.
   *
   * Throwing here rather than in `getRequestHeaders()` is on purpose. `getRequestHeaders()` runs
   * inside `enrichResult`'s try/catch, which converts a throw into `{ success: false }` per
   * result — so a wiring mistake would surface as a plausible-looking 207 over a whole batch
   * instead of a loud failure. Constructed in the request handler, this throw is uncaught.
   */
  constructor(baseUrl, timeout = 30000, apiKey) {
    if (!apiKey) {
      throw new Error("ExternalApiClient requires the caller's API key");
    }

    this.baseUrl = baseUrl || process.env.EXTERNAL_API_URL || "";
    this.apiKey = apiKey;
    this.timeout = timeout;
  }

  getRequestHeaders() {
    if (!this.apiKey) {
      throw new Error("External API key not configured");
    }

    return {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-Key": this.apiKey,
    };
  }

  async sendResult(result) {
    if (!this.baseUrl) {
      throw new Error("External API URL not configured");
    }

    const base = this.baseUrl.replace(/\/+$/, "");
    const url = `${base}/create`;

    console.log(`[ExternalApiClient] Sending result to ${url}`, {
      resultId: result.idempotencyKey,
      type: result.type,
    });

    // The envelope Reporting already declares on `RootResultsDto`. `idempotencyKey` is what lands
    // in `result.external_reference` there, so an external platform can match our callbacks against
    // its own record. `jobId` is intentionally absent: Reporting does not declare it, so
    // `whitelist: true` dropped it silently — it stays a Fetcher-local field for error correlation.
    const payload = {
      type: result.type,
      data: result.data,
      idempotencyKey: result.idempotencyKey,
      tenant: result.tenant,
      op: result.op,
      received_at: result.received_at,
    };

    console.log(`[ExternalApiClient] Payload shape for ${url}:`, {
      idempotencyKey: payload.idempotencyKey,
      type: payload.type,
      tenant: payload.tenant,
      op: payload.op,
      dataKeys: Object.keys(payload.data ?? {}).length,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: "POST",
        headers: this.getRequestHeaders(),
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

        // Truncated: Reporting's validation errors quote back the values we sent, which are the
        // caller's payload, not ours to spray across CloudWatch in full.
        console.error(
          `[ExternalApiClient] Error response body for ${result.idempotencyKey}:`,
          errorBody.slice(0, 500)
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
        summarizeError(error)
      );
      throw error;
    }
  }

  /**
   * Sends a result once and returns both the possibly enriched result (adding result_id/result_code)
   * and the raw API response. On failure returns the original result and throws the error upward if desired.
   */
  /**
   * Registers (or replaces) this platform's webhook destination in Reporting.
   *
   * A thin forward on purpose. Reporting owns every rule: it resolves the recipient from the API
   * key — so the body carries no recipient field and one platform cannot register another's
   * destination — and it guards the URL against pointing at something internal. Re-validating here
   * would be a second copy of that logic to keep in sync, and the two would drift.
   *
   * Unlike `enrichResult`, failures throw. Registration is a single operation the caller is waiting
   * on; turning it into `{ success: false }` would make them inspect a 200 to find out it failed.
   */
  async registerWebhook(url) {
    return this.callWebhookEndpoint("POST", { url });
  }

  /** The destination currently registered for this platform, as Reporting reports it. */
  async getWebhook() {
    return this.callWebhookEndpoint("GET");
  }

  /**
   * Shared transport for the two webhook calls.
   *
   * **Never logs `url`.** It is a webhook destination, and both `docs/prd.md` AC-9 and
   * `.cursorrules` name webhook URLs — complete or partial — among the things that must not reach
   * logs or output. The same reason P2-3166's failure alert quotes a delivery id instead of a URL.
   *
   * Reporting's status is attached to the error rather than flattened, so the caller can pass it
   * through: a 400 from the URL guard is the caller's mistake and has to read as one.
   */
  async callWebhookEndpoint(method, body) {
    if (!this.baseUrl) {
      throw new Error("External API URL not configured");
    }

    const base = this.baseUrl.replace(/\/+$/, "");
    const endpoint = `${base}/webhook`;

    console.log(`[ExternalApiClient] ${method} webhook registration`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(endpoint, {
        method,
        headers: this.getRequestHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : undefined;
      } catch {
        parsed = undefined;
      }

      console.log(
        `[ExternalApiClient] webhook registration responded`,
        response.status
      );

      if (!response.ok) {
        const err = new Error(
          `Reporting rejected the webhook registration (HTTP ${response.status})`
        );
        err.status = response.status;
        // Reporting's message explains *why* the URL was refused; the caller needs it to fix theirs.
        err.apiResponse = parsed;
        throw err;
      }

      return parsed;
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error(
          `Timed out after ${this.timeout}ms registering the webhook`
        );
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

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
        summarizeError(error)
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
