import { OpenSearchClient } from "../clients/opensearch.mjs";
import { ResultResponseMapper } from "../mappers/response-result.mjs";
import { isEmpty } from "../mappers/response-result.mjs";

const responseFormat = (data, status) => ({
  results: data,
  statusCode: status,
});
const openCli = new OpenSearchClient();

export const RESULT_TYPES_MAP = {
  policy_change: "Policy change",
  innovation_use: "Innovation use",
  capacity_change: "Capacity change",
  other_outcome: "Other outcome",
  capacity_sharing_for_development: "Capacity sharing for development",
  knowledge_product: "Knowledge product",
  innovation_development: "Innovation development",
  other_output: "Other output",
  impact_contribution: "Impact contribution",
  innovation_use_ipsr: "Innovation Use(IPSR)",
  complementary_innovation: "Complementary innovation",
};

const buildFilters = (filters) => {
  const keys = {
    centerAcronym: {
      terms: {
        "leading_result.acronym.keyword": filters.centerAcronym,
      },
    },
    resultType: {
      terms: {
        "obj_result_type.name.keyword": filters.resultType
          ?.map((type) => RESULT_TYPES_MAP?.[type] ?? null)
          .filter((type) => !isEmpty(type)),
      },
    },
    resultCode: {
      terms: {
        result_code: filters.resultCode,
      },
    },
    fundingType: {
      terms: {
        source: filters.fundingType,
      },
    },
    year: {
      term: {
        "obj_version.phase_year": filters.year,
      },
    },
  };

  const processedFilters = [];
  for (const filterKey in filters) {
    if (isEmpty(keys[filterKey]) || isEmpty(filters[filterKey])) {
      continue;
    }
    processedFilters.push(keys[filterKey]);
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
            result_code: {
              order: "desc",
            },
          },
          {
            "obj_version.phase_year": {
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
