import { OpenSearchClient } from "../clients/opensearch.mjs";
import { ResultResponseMapper, isEmpty } from "../mappers/response-result.mjs";

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
  /** @deprecated Prefer slug `innovation_package`. Same PRMS type name in OpenSearch. */
  innovation_use_ipsr: "Innovation Package",
  /** IPSR / Innovation Package — `obj_result_type.name` in PRMS is **Innovation Package** (id 10); index `prms-results-innovation_package`. */
  innovation_package: "Innovation Package",
  complementary_innovation: "Complementary innovation",
};

/** Maps PRMS `status_id` (numeric) to display name. */
export const RESULT_STATUS_BY_ID = {
  1: "Editing",
  2: "Quality Assessed",
  3: "Submitted",
  4: "Discontinued",
  5: "Pending Review",
  6: "Approved",
  7: "Rejected",
};

/** Bilateral / PRMS: stored `source` field → filter labels (GET /result?source=) */
export const SOURCE_FILTER_LABEL_TO_STORED = {
  "w1/w2": "Result",
  "w3/bilateral": "API",
};

/**
 * Maps query values like W1/W2, W3/Bilateral to OpenSearch `source` terms (Result, API).
 * @param {string[]|undefined} labels
 * @returns {string[]}
 */
export const mapSourceFilterLabelsToStored = (labels) => {
  if (!Array.isArray(labels) || labels.length === 0) return [];
  const out = [];
  for (const label of labels) {
    const key = String(label).trim().toLowerCase().replaceAll(/\s+/g, "");
    const stored = SOURCE_FILTER_LABEL_TO_STORED[key];
    if (stored) out.push(stored);
  }
  return [...new Set(out)];
};

/**
 * OpenSearch often maps string `source` as text + `.keyword`; `terms` on `source` alone misses exact values.
 */
const expandSourceTermVariants = (values) => {
  const out = new Set();
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (!s) continue;
    out.add(s);
    out.add(s.toLowerCase());
    out.add(s.toUpperCase());
    const titled =
      s.length > 0
        ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
        : s;
    out.add(titled);
  }
  return [...out];
};

/**
 * @param {string[]|undefined} values
 * @returns {object|null}
 */
const sourceFieldTermsClause = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const expanded = expandSourceTermVariants(values);
  return {
    bool: {
      should: [
        { terms: { "source.keyword": expanded } },
        { terms: { source: expanded } },
      ],
      minimum_should_match: 1,
    },
  };
};

/**
 * Matches the **lead** centre's acronym, case-insensitively.
 *
 * `leading_result.acronym.keyword` is an exact, case-sensitive term, and the acronyms
 * CLARISA stores are mixed case — "Bioversity (Alliance)", "WorldFish", "AfricaRice",
 * "UC Davis". The filter used to upper-case the incoming value before matching, so those
 * centres could never be found: `BIOVERSITY (ALLIANCE)` returned 0 against 5963
 * documents, the largest bucket in the index. Only all-caps acronyms (IITA, CIP, ILRI)
 * happened to work, which made the filter look intermittent rather than broken.
 *
 * `case_insensitive` on a term query needs OpenSearch 7.10+/2.x; the cluster runs 2.19.
 * The variant-expansion trick used for `source` is not enough here — it produces four
 * fixed casings, none of which reconstructs "Bioversity (Alliance)" from user input.
 *
 * Scope is deliberately the lead centre only: a centre that contributed without leading
 * is in `result_center_array` and is not matched. That is the documented meaning of
 * `centerAcronym`.
 *
 * @param {string[]|undefined} values
 * @returns {object|null}
 */
const centerAcronymClause = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;
  const wanted = values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
  if (wanted.length === 0) return null;

  return {
    bool: {
      should: wanted.map((value) => ({
        term: {
          "leading_result.acronym.keyword": {
            value,
            case_insensitive: true,
          },
        },
      })),
      minimum_should_match: 1,
    },
  };
};

const buildFilters = (filters) => {
  const keys = {
    centerAcronym: centerAcronymClause(filters.centerAcronym),
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
    fundingType: sourceFieldTermsClause(filters.fundingType),
    sourceStored: sourceFieldTermsClause(filters.sourceStored),
    year: {
      term: {
        "obj_version.phase_year": filters.year,
      },
    },
    statusId: {
      terms: {
        status_id: filters.statusId,
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
