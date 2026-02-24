import fetch from "node-fetch";

export class ExternalApiClient {
  baseUrl;
  timeout;

  constructor(baseUrl, timeout = 30000) {
    this.baseUrl = baseUrl || process.env.EXTERNAL_API_URL || "";
    this.timeout = timeout;
  }

  /**
   * Fetches results from the external API's bilateral/list endpoint with specified filters
   * 
   * @param {Object} query - The query parameters
   * @returns {Promise<Object>} The API response containing items and meta
   */
  async fetchResultsList(query = {}) {
    if (!this.baseUrl) {
      throw new Error("External API URL not configured");
    }

    const base = this.baseUrl.replace(/\/+$/, "");
    let url = `${base}/list`;

    const queryParams = new URLSearchParams();
    
    // Append all allowed query parameters
    const allowedParams = [
      'page', 'limit', 'source', 'portfolio', 'phase_year', 
      'result_type', 'status_id', 'status', 'last_updated_from', 
      'last_updated_to', 'created_from', 'created_to', 'center', 
      'initiative_lead_code', 'search'
    ];

    for (const param of allowedParams) {
      if (query[param] !== undefined && query[param] !== null) {
        queryParams.append(param, String(query[param]));
      }
    }

    if (queryParams.toString()) {
      url += `?${queryParams.toString()}`;
    }

    console.log(`[ExternalApiClient] Fetching results list from ${url}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        let parsedBody;
        try {
          parsedBody = JSON.parse(errorBody);
        } catch {
          parsedBody = undefined;
        }

        console.error(`[ExternalApiClient] Error fetching results list:`, errorBody);

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
      
      console.log(`[ExternalApiClient] Successfully fetched results list. Total items: ${data?.response?.items?.length || 0}`);
      
      return data;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[ExternalApiClient] Timeout (${this.timeout}ms) fetching results list`);
      }
      console.error(`[ExternalApiClient] Failed to fetch results list:`, error);
      throw error;
    }
  }
}
