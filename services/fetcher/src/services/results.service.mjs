import { OpenSearchClient } from "../clients/opensearch.mjs";
import { ResultResponseMapper } from "../mappers/response-result.mjs";

const responseFormat = (data, status) => ({
  results: data,
  statusCode: status,
});
const openCli = new OpenSearchClient();

export const getResult = async (page, size) => {
  try {
    if (page < 1 || size < 1) {
      return responseFormat(
        {
          data: [],
          total: 0,
          page: page,
          size: size,
          totalPages: 0,
        },
        400,
      );
    }
    const response = await openCli.makeRequest(
      "POST",
      "/prms-results-*/_search",
      {
        size: size,
        from: (page - 1) * size,
        sort: [
          {
            result_id: {
              order: "desc",
            },
          },
        ],
        query: {
          match_all: {},
        },
      },
    );
    const results = response.hits.hits.map(
      (hit) => new ResultResponseMapper(hit._source),
    );

    return responseFormat(
      {
        data: results,
        total: response.hits.total.value,
        page: page,
        size: size,
        totalPages: Math.ceil(response.hits.total.value / size),
      },
      200,
    );
  } catch (err) {
    console.error("[ResultsService] -> Error fetching results", err);
    return responseFormat("Internal server error", 500);
  }
};

export const getResultByCode = async (resultCode) => {
  try {
    const response = await openCli.makeRequest(
      "POST",
      "/prms-results-*/_search",
      {
        size: 1,
        query: {
          term: { result_code: resultCode },
        },
        sort: [
          {
            result_id: {
              order: "desc",
            },
          },
        ],
      },
    );
    const results = response.hits.hits.map(
      (hit) => new ResultResponseMapper(hit._source),
    );
    return responseFormat(results.length > 0 ? results[0] : null, 200);
  } catch (error) {
    console.error(
      "[ResultsService] -> Error fetching result by code: " + resultCode,
      error,
    );
    return responseFormat("Internal server error", 500);
  }
};
