export const isEmpty = (v) => {
  return (
    v === null ||
    v === "" ||
    (typeof v === "number" && Number.isNaN(v)) ||
    v === undefined ||
    (Array.isArray(v) && v.length === 0)
  );
};

/** OpenSearch `source`: Result = W1/W2, API = W3/Bilateral (bilateral list semantics). */
export const normalizeStoredSource = (stored) => {
  if (stored === null || stored === undefined || stored === "") return null;
  const lower = String(stored).trim().toLowerCase();
  if (lower === "result") return "Result";
  if (lower === "api") return "API";
  return String(stored).trim();
};

export const storedSourceToDefinition = (normalizedSource) => {
  if (normalizedSource == null || normalizedSource === "") return null;
  const lower = String(normalizedSource).toLowerCase();
  if (lower === "result") return "W1/W2";
  if (lower === "api") return "W3/Bilateral";
  return null;
};

const INITIATIVE_ROLE_LABELS = {
  1: "Primary submitter",
  2: "Contributor",
};

export class ResultLevelMapper {
  constructor(resultLevel) {
    this.code = resultLevel?.id;
    this.name = resultLevel?.name;
    this.description = resultLevel?.description;
  }

  static from(resultLevel) {
    return isEmpty(resultLevel) ? null : new ResultLevelMapper(resultLevel);
  }
}

export class IndicatorCategoryMapper {
  constructor(resultType) {
    this.code = resultType?.id;
    this.name = resultType?.name;
  }

  static from(resultType) {
    return isEmpty(resultType)
      ? null
      : new IndicatorCategoryMapper(resultType);
  }
}

/** PRMS `obj_result_type.id` for Knowledge product (= `indicator_category.code`). */
const KNOWLEDGE_PRODUCT_TYPE_ID = 6;

export class KnowledgeProductSummaryMapper {
  constructor(handle) {
    this.handle = handle;
  }

  static isKnowledgeProductType(resultType) {
    if (resultType == null || typeof resultType !== "object") return false;
    const id = Number(resultType.id);
    if (!Number.isNaN(id) && id === KNOWLEDGE_PRODUCT_TYPE_ID) return true;
    const n = String(resultType.name ?? "").toLowerCase();
    return n.includes("knowledge") && n.includes("product");
  }

  /**
   * OpenSearch may expose `knowledge_product_summary` and/or nested `knowledge_product.handle`.
   */
  static fromRaw(rawData) {
    if (!KnowledgeProductSummaryMapper.isKnowledgeProductType(rawData?.obj_result_type)) {
      return null;
    }
    const summary = rawData?.knowledge_product_summary;
    const fromSummary =
      summary != null &&
        typeof summary === "object" &&
        typeof summary.handle === "string" &&
        summary.handle.trim() !== ""
        ? summary.handle.trim()
        : null;
    const kp = rawData?.knowledge_product;
    const fromKp =
      kp != null &&
        typeof kp === "object" &&
        typeof kp.handle === "string" &&
        kp.handle.trim() !== ""
        ? kp.handle.trim()
        : null;
    const handle = fromSummary ?? fromKp ?? null;
    if (handle == null) return null;
    return new KnowledgeProductSummaryMapper(handle);
  }
}

/** PRMS `obj_result_type.id` for Innovation development (= `indicator_category.code`). */
const INNOVATION_DEVELOPMENT_TYPE_ID = 7;

export class InnovationDevelopmentSummaryMapper {
  static isInnovationDevelopmentType(resultType) {
    if (resultType == null || typeof resultType !== "object") return false;
    const id = Number(resultType.id);
    if (!Number.isNaN(id) && id === INNOVATION_DEVELOPMENT_TYPE_ID) return true;
    const n = String(resultType.name ?? "").toLowerCase();
    return n.includes("innovation") && n.includes("development");
  }

  /**
   * Passthrough de `innovation_development_summary` desde OpenSearch (estructura PRMS completa).
   */
  static fromRaw(rawData) {
    if (
      !InnovationDevelopmentSummaryMapper.isInnovationDevelopmentType(
        rawData?.obj_result_type,
      )
    ) {
      return null;
    }
    const s = rawData?.innovation_development_summary;
    if (s == null || typeof s !== "object" || Array.isArray(s)) return null;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(s);
      } catch {
        /* continue */
      }
    }
    try {
      return JSON.parse(JSON.stringify(s));
    } catch {
      return null;
    }
  }
}

/** PRMS `obj_result_type.id` for Innovation use (= `indicator_category.code`). */
const INNOVATION_USE_TYPE_ID = 2;

export class InnovationUseSummaryMapper {
  static isInnovationUseType(resultType) {
    if (resultType == null || typeof resultType !== "object") return false;
    const id = Number(resultType.id);
    if (!Number.isNaN(id) && id === INNOVATION_USE_TYPE_ID) return true;
    const n = String(resultType.name ?? "").toLowerCase().trim();
    return n === "innovation use";
  }

  /**
   * Passthrough de `innovation_use_summary` desde OpenSearch (estructura PRMS completa).
   */
  static fromRaw(rawData) {
    if (
      !InnovationUseSummaryMapper.isInnovationUseType(rawData?.obj_result_type)
    ) {
      return null;
    }
    const s = rawData?.innovation_use_summary;
    if (s == null || typeof s !== "object" || Array.isArray(s)) return null;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(s);
      } catch {
        /* continue */
      }
    }
    try {
      return JSON.parse(JSON.stringify(s));
    } catch {
      return null;
    }
  }
}

/**
 * Capacity sharing / capacity development (PRMS): matches
 * `RESULT_TYPES_MAP.capacity_sharing_for_development` label and similar names.
 */
export class CapacityDevelopmentSummaryMapper {
  static isCapacityDevelopmentType(resultType) {
    if (resultType == null || typeof resultType !== "object") return false;
    const n = String(resultType.name ?? "").toLowerCase().trim();
    if (n === "capacity sharing for development") return true;
    if (
      n.includes("capacity") &&
      n.includes("development") &&
      !n.includes("innovation")
    ) {
      return true;
    }
    return false;
  }

  /**
   * Passthrough de `capacity_development_summary` desde OpenSearch.
   */
  static fromRaw(rawData) {
    if (
      !CapacityDevelopmentSummaryMapper.isCapacityDevelopmentType(
        rawData?.obj_result_type,
      )
    ) {
      return null;
    }
    const s = rawData?.capacity_development_summary;
    if (s == null || typeof s !== "object" || Array.isArray(s)) return null;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(s);
      } catch {
        /* continue */
      }
    }
    try {
      return JSON.parse(JSON.stringify(s));
    } catch {
      return null;
    }
  }
}

/** PRMS `obj_result_type.id` for Policy change (= `indicator_category.code`). */
const POLICY_CHANGE_TYPE_ID = 1;

export class PolicyChangeSummaryMapper {
  static isPolicyChangeType(resultType) {
    if (resultType == null || typeof resultType !== "object") return false;
    const id = Number(resultType.id);
    if (!Number.isNaN(id) && id === POLICY_CHANGE_TYPE_ID) return true;
    const n = String(resultType.name ?? "").toLowerCase().trim();
    return n === "policy change";
  }

  /**
   * Passthrough de `policy_change_summary` desde OpenSearch.
   */
  static fromRaw(rawData) {
    if (!PolicyChangeSummaryMapper.isPolicyChangeType(rawData?.obj_result_type)) {
      return null;
    }
    const s = rawData?.policy_change_summary;
    if (s == null || typeof s !== "object" || Array.isArray(s)) return null;
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(s);
      } catch {
        /* continue */
      }
    }
    try {
      return JSON.parse(JSON.stringify(s));
    } catch {
      return null;
    }
  }
}

export class RegionMapper {
  constructor(regionObject) {
    this.code = regionObject?.um49Code;
    this.name = regionObject?.name;
  }

  static from(regionObject) {
    return isEmpty(regionObject) ? null : new RegionMapper(regionObject);
  }

  static fromArray(regionObjects) {
    if (isEmpty(regionObjects)) return [];
    return regionObjects
      .filter((el) => !isEmpty(el?.region_object))
      .map((regionObject) => RegionMapper.from(regionObject.region_object))
      .filter((el) => !isEmpty(el));
  }
}

export class CountryMapper {
  constructor(countryObject) {
    this.code = countryObject?.iso_alpha_2;
    this.name = countryObject?.name;
  }

  static from(countryObject) {
    return isEmpty(countryObject) ? null : new CountryMapper(countryObject);
  }

  static fromArray(countryObjects) {
    if (isEmpty(countryObjects)) return [];
    return countryObjects
      .filter((el) => !isEmpty(el?.country_object))
      .map((countryObject) => CountryMapper.from(countryObject.country_object))
      .filter((el) => !isEmpty(el));
  }
}

export class ContributingCenterMapper {
  constructor(contributingCenterObject) {
    this.code = contributingCenterObject?.clarisa_center_object?.code;
    this.name =
      contributingCenterObject?.clarisa_center_object?.clarisa_institution?.name;
    this.acronym =
      contributingCenterObject?.clarisa_center_object?.clarisa_institution?.acronym;
    this.is_lead = contributingCenterObject?.is_leading_result;
  }

  static from(contributingCenterObject) {
    return isEmpty(contributingCenterObject)
      ? null
      : new ContributingCenterMapper(contributingCenterObject);
  }

  static fromArray(contributingCenterObjects) {
    if (isEmpty(contributingCenterObjects)) return [];
    return contributingCenterObjects
      .filter((el) => !isEmpty(el))
      .map((contributingCenterObject) =>
        ContributingCenterMapper.from(contributingCenterObject),
      )
      .filter((el) => !isEmpty(el));
  }
}

export class ContributingPartnerMapper {
  constructor(contributingPartnerObject) {
    this.code =
      contributingPartnerObject?.institutions_id ?? contributingPartnerObject?.id;
    this.name = contributingPartnerObject?.name;
    this.acronym = contributingPartnerObject?.acronym;
  }

  static from(contributingPartnerObject) {
    return isEmpty(contributingPartnerObject)
      ? null
      : new ContributingPartnerMapper(contributingPartnerObject);
  }

  static fromArray(contributingPartnerObjects) {
    if (isEmpty(contributingPartnerObjects)) return [];
    return contributingPartnerObjects
      .filter((el) => !isEmpty(el))
      .map((el) => {
        const source =
          el?.contributing_partner_object !== undefined &&
            el?.contributing_partner_object !== null
            ? el.contributing_partner_object
            : el;
        return ContributingPartnerMapper.from(source);
      })
      .filter((el) => !isEmpty(el));
  }
}

export class EvidencesMapper {
  constructor(evidenceObject) {
    this.link = evidenceObject?.link;
    this.description = evidenceObject?.description;
  }

  static from(evidenceObject) {
    return isEmpty(evidenceObject)
      ? null
      : new EvidencesMapper(evidenceObject);
  }

  static fromArray(evidenceObjects) {
    if (isEmpty(evidenceObjects)) return [];
    return evidenceObjects
      .map((evidenceObject) => EvidencesMapper.from(evidenceObject))
      .filter((el) => !isEmpty(el));
  }
}

export class PrimaryEntityMapper {
  constructor(primaryEntityObject) {
    this.official_code = primaryEntityObject?.official_code;
    this.name = primaryEntityObject?.name;
  }

  static from(primaryEntityObject) {
    return isEmpty(primaryEntityObject)
      ? null
      : new PrimaryEntityMapper(primaryEntityObject);
  }

  static fromArray(primaryEntityObjects) {
    if (isEmpty(primaryEntityObjects)) return null;
    const primaryEntities = primaryEntityObjects.find(
      (el) => el?.initiative_role_id === "1",
    );
    return PrimaryEntityMapper.from(primaryEntities?.obj_initiative);
  }
}

export class EntityMapper {
  constructor(entityObject) {
    this.official_code = entityObject?.official_code;
    this.name = entityObject?.name;
  }

  static from(entityObject) {
    return isEmpty(entityObject) ? null : new EntityMapper(entityObject);
  }
}

export class SubEntityMapper {
  constructor(subEntityObject) {
    this.official_code = subEntityObject?.official_code;
    this.description = null; // TODO: data not found
  }

  static from(subEntityObject) {
    return isEmpty(subEntityObject)
      ? null
      : new SubEntityMapper(subEntityObject);
  }
}

export class TocResultMapper {
  constructor(tocResultObject) {
    this.level = tocResultObject?.level;
    this.sub_entity = SubEntityMapper.from(tocResultObject);
    this.result_name = tocResultObject?.title;
  }

  static from(tocResultObject) {
    return isEmpty(tocResultObject)
      ? null
      : new TocResultMapper(tocResultObject);
  }

  static fromArray(tocResultObjects) {
    if (isEmpty(tocResultObjects)) return [];
    const dataList = [];
    for (const tocResultObject of tocResultObjects) {
      const tocResult = TocResultMapper.from(tocResultObject);
      if (isEmpty(tocResult)) continue;
      dataList.push(tocResult);
    }
    return dataList;
  }
}

export class TocMapper {
  constructor(tocObject) {
    this.entity = EntityMapper.from(tocObject);
    this.initiative_role = tocObject?.initiative_role;
    this.toc_results = TocResultMapper.fromArray(tocObject?.toc_mappings);
  }

  static from(tocObject) {
    return isEmpty(tocObject) ? null : new TocMapper(tocObject);
  }

  static fromArray(tocObjects) {
    if (isEmpty(tocObjects)) return [];
    const dataList = [];
    for (const tocObject of tocObjects) {
      const toc = TocMapper.from(tocObject);
      if (isEmpty(toc)) continue;
      dataList.push(toc);
    }
    return dataList;
  }
}

export class CreatedByMapper {
  constructor(createdByObject) {
    this.first_name = createdByObject?.first_name;
    this.last_name = createdByObject?.last_name;
    this.email = createdByObject?.email;
  }

  static from(createdByObject) {
    return isEmpty(createdByObject)
      ? null
      : new CreatedByMapper(createdByObject);
  }
}

export class LastSubmissionSubmittedByMapper {
  constructor(user) {
    this.user_id =
      user?.user_id != null && user?.user_id !== ""
        ? Number(user.user_id)
        : null;
    this.first_name = user?.first_name;
    this.last_name = user?.last_name;
  }

  static from(user) {
    return isEmpty(user) ? null : new LastSubmissionSubmittedByMapper(user);
  }
}

export class LastSubmissionMapper {
  constructor(raw) {
    const created = raw?.created_date
      ? new Date(raw.created_date)
      : null;
    this.created_date =
      created && !Number.isNaN(created.getTime())
        ? created.toISOString()
        : null;
    this.comment =
      raw?.comment === undefined || raw?.comment === null
        ? null
        : raw.comment;
    this.status =
      raw?.status === undefined || raw?.status === null
        ? null
        : Boolean(raw.status);
    this.status_id =
      raw?.status_id != null && raw?.status_id !== ""
        ? Number(raw.status_id)
        : null;
    this.submitted_by = LastSubmissionSubmittedByMapper.from(
      raw?.submitted_by,
    );
  }

  static from(raw) {
    if (raw == null || typeof raw !== "object") return null;
    return new LastSubmissionMapper(raw);
  }
}

export class ResultResponseMapper {
  constructor(rawData) {
    this.created_date = new Date(rawData.created_date)?.toISOString();
    this.last_updated_date = new Date(rawData.last_updated_date)?.toISOString();
    this.result_code = Number(rawData?.result_code);
    this.status_id = Number(rawData?.status_id);
    this.year = rawData?.obj_version?.phase_year;
    this.pdf_link = `${process.env.REPORTING_BASE_URL}/reports/result-details/${this.result_code}?phase=${"6"}`;
    this.prms_link = `${process.env.REPORTING_BASE_URL}/result/result-detail/${this.result_code}/general-information?phase=${"6"}`;
    this.last_update_at = new Date(rawData.last_updated_date).toISOString();
    this.is_active = Boolean(Number(rawData.is_active));
    this.created_by = CreatedByMapper.from(rawData?.obj_created);
    this.source = normalizeStoredSource(rawData?.source);
    this.source_definition = storedSourceToDefinition(this.source);
    this.obj_status = isEmpty(rawData?.obj_status) ? null : rawData.obj_status;
    this.last_submission = LastSubmissionMapper.from(
      rawData?.last_submission,
    );
    this.result_level = ResultLevelMapper.from(rawData?.obj_result_level);
    this.indicator_category = IndicatorCategoryMapper.from(
      rawData?.obj_result_type,
    );
    this.result_title = rawData.title;
    this.description = rawData.description;
    this.lead_contact_person =
      rawData?.lead_contact_person ??
      rawData?.leadContactPerson ??
      (typeof rawData?.obj_lead_contact === "object" &&
        rawData.obj_lead_contact !== null
        ? rawData.obj_lead_contact?.full_name ??
        rawData.obj_lead_contact?.name ??
        null
        : null) ??
      null;
    this.dac_scores = isEmpty(rawData?.dac_scores) ? null : rawData.dac_scores;
    this.primary_entity = PrimaryEntityMapper.fromArray(
      rawData?.obj_result_by_initiatives,
    );
    this.toc_alignment = TocMapper.fromArray(rawData?.obj_results_toc_result);
    this.contributing_centers = ContributingCenterMapper.fromArray(
      rawData?.result_center_array,
    );
    this.contributing_partners = ContributingPartnerMapper.fromArray(
      rawData?.result_by_institution_array,
    );
    this.bilateral_projects = Array.isArray(rawData?.bilateral_projects)
      ? rawData.bilateral_projects
      : [];
    this.leading_result =
      rawData?.leading_result !== undefined &&
        rawData?.leading_result !== null
        ? rawData.leading_result
        : null;
    const geoScope = rawData?.obj_geographic_scope;
    this.geographic_focus = isEmpty(geoScope)
      ? null
      : {
        code: geoScope?.id,
        name: geoScope?.name,
        description: geoScope?.description,
      };
    this.regions = RegionMapper.fromArray(rawData?.result_region_array);
    this.countries = CountryMapper.fromArray(rawData?.result_country_array);
    this.evidences = EvidencesMapper.fromArray(rawData?.evidence_array);
    this.knowledge_product_summary =
      KnowledgeProductSummaryMapper.fromRaw(rawData);
    this.innovation_development_summary =
      InnovationDevelopmentSummaryMapper.fromRaw(rawData);
    this.innovation_use_summary =
      InnovationUseSummaryMapper.fromRaw(rawData);
    this.capacity_development_summary =
      CapacityDevelopmentSummaryMapper.fromRaw(rawData);
    this.policy_change_summary = PolicyChangeSummaryMapper.fromRaw(rawData);
  }
}
