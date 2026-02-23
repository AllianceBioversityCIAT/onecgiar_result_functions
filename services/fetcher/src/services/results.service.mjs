import { OpenSearchClient } from "../clients/opensearch.mjs";
import { ResultResponseMapper } from "../mappers/response-result.mjs";
import { isEmpty } from "../mappers/response-result.mjs";

const responseFormat = (data, status) => ({
  results: data,
  statusCode: status,
});
const openCli = new OpenSearchClient();

const buildFilters = (filters) => {
  const keys = {
    centerAcronym:
      "result_center_array.clarisa_center_object.clarisa_institution.acronym.keyword",
    resultCode: "result_code",
    fundingType: "source.keyword",
  };

  const processedFilters = [];
  for (const filterKey in filters) {
    if (isEmpty(keys[filterKey]) || isEmpty(filters[filterKey])) {
      continue;
    }
    processedFilters.push({
      term: { [keys[filterKey]]: filters[filterKey] },
    });
  }
  return processedFilters;
};

export const getResult = async (page, size, filters) => {
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
    const processedFilters = buildFilters(filters);
    let query = {};
    if (processedFilters.length > 0) {
      query = {
        bool: {
          must: processedFilters,
        },
      };
    } else {
      query = {
        match_all: {},
      };
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
        query,
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
