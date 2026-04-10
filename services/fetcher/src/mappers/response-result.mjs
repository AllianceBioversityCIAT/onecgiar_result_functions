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

export class GeographicFocusMapper {
  constructor(geographicScope) {
    this.code = geographicScope?.id;
    this.description = geographicScope?.description;
  }

  static from(geographicScope) {
    return isEmpty(geographicScope)
      ? null
      : new GeographicFocusMapper(geographicScope);
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
    this.result_title = rawData.title;
    this.description = rawData.description;
    this.result_level = ResultLevelMapper.from(rawData?.obj_result_level);
    this.indicator_category = IndicatorCategoryMapper.from(
      rawData?.obj_result_type,
    );
    this.toc_alignment = TocMapper.fromArray(rawData?.obj_results_toc_result);
    this.geographic_focus = GeographicFocusMapper.from(
      rawData?.obj_geographic_scope,
    );
    this.regions = RegionMapper.fromArray(rawData?.result_region_array);
    this.countries = CountryMapper.fromArray(rawData?.result_country_array);
    this.contributing_centers = ContributingCenterMapper.fromArray(
      rawData?.result_center_array,
    );
    this.contributing_partners = ContributingPartnerMapper.fromArray(
      rawData?.result_by_institution_array,
    );
    this.dac_scores = isEmpty(rawData?.dac_scores) ? null : rawData.dac_scores;
    this.obj_status = isEmpty(rawData?.obj_status) ? null : rawData.obj_status;
    this.bilateral_projects = Array.isArray(rawData?.bilateral_projects)
      ? rawData.bilateral_projects
      : [];
    this.evidences = EvidencesMapper.fromArray(rawData?.evidence_array);
    this.primary_entity = PrimaryEntityMapper.fromArray(
      rawData?.obj_result_by_initiatives,
    );
    this.created_by = CreatedByMapper.from(rawData?.obj_created);
    this.source = normalizeStoredSource(rawData?.source);
    this.source_definition = storedSourceToDefinition(this.source);
  }
}
