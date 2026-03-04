export const isEmpty = (v) => {
  return (
    v === null ||
    v === "" ||
    (typeof v === "number" && isNaN(v)) ||
    v === undefined ||
    (Array.isArray(v) && v.length === 0)
  );
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
    return !isEmpty(resultLevel) ? new ResultLevelMapper(resultLevel) : null;
  }
}

export class IndicatorCategoryMapper {
  constructor(resultType) {
    this.code = resultType?.id;
    this.name = resultType?.name;
  }

  static from(resultType) {
    return !isEmpty(resultType)
      ? new IndicatorCategoryMapper(resultType)
      : null;
  }
}

export class GeographicFocusMapper {
  constructor(geographicScope) {
    this.code = geographicScope?.id;
    this.description = geographicScope?.description;
  }

  static from(geographicScope) {
    return !isEmpty(geographicScope)
      ? new GeographicFocusMapper(geographicScope)
      : null;
  }
}

export class RegionMapper {
  constructor(regionObject) {
    this.code = regionObject?.um49Code;
    this.name = regionObject?.name;
  }

  static from(regionObject) {
    return !isEmpty(regionObject) ? new RegionMapper(regionObject) : null;
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
    return !isEmpty(countryObject) ? new CountryMapper(countryObject) : null;
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
    this.code = contributingCenterObject?.code;
    this.name = contributingCenterObject?.clarisa_institution?.name;
    this.acronym = contributingCenterObject?.clarisa_institution.acronym;
  }

  static from(contributingCenterObject) {
    return !isEmpty(contributingCenterObject)
      ? new ContributingCenterMapper(contributingCenterObject)
      : null;
  }

  static fromArray(contributingCenterObjects) {
    if (isEmpty(contributingCenterObjects)) return [];
    return contributingCenterObjects
      .filter((el) => !isEmpty(el?.clarisa_center_object))
      .map((contributingCenterObject) =>
        ContributingCenterMapper.from(
          contributingCenterObject.clarisa_center_object,
        ),
      )
      .filter((el) => !isEmpty(el));
  }
}

export class ContributingPartnerMapper {
  constructor(contributingPartnerObject) {
    this.code = contributingPartnerObject?.id;
    this.name = contributingPartnerObject?.name;
    this.acronym = contributingPartnerObject?.acronym;
  }

  static from(contributingPartnerObject) {
    return !isEmpty(contributingPartnerObject)
      ? new ContributingPartnerMapper(contributingPartnerObject)
      : null;
  }

  static fromArray(contributingPartnerObjects) {
    if (isEmpty(contributingPartnerObjects)) return [];
    return contributingPartnerObjects
      .filter((el) => !isEmpty(el?.obj_institutions))
      .map((contributingPartnerObject) =>
        ContributingPartnerMapper.from(
          contributingPartnerObject.contributing_partner_object,
        ),
      )
      .filter((el) => !isEmpty(el));
  }
}

export class EvidencesMapper {
  constructor(evidenceObject) {
    this.link = evidenceObject?.link;
    this.description = evidenceObject?.description;
  }

  static from(evidenceObject) {
    return !isEmpty(evidenceObject)
      ? new EvidencesMapper(evidenceObject)
      : null;
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
    return !isEmpty(primaryEntityObject)
      ? new PrimaryEntityMapper(primaryEntityObject)
      : null;
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
    return !isEmpty(entityObject) ? new EntityMapper(entityObject) : null;
  }
}

export class SubEntityMapper {
  constructor(subEntityObject) {
    this.official_code = subEntityObject?.official_code;
    this.description = null; //TODO: data not found
  }

  static from(subEntityObject) {
    return !isEmpty(subEntityObject)
      ? new SubEntityMapper(subEntityObject)
      : null;
  }
}

export class TocResultMapper {
  constructor(tocResultObject) {
    this.level = tocResultObject?.level;
    this.sub_entity = SubEntityMapper.from(tocResultObject);
    this.result_name = tocResultObject?.title;
  }

  static from(tocResultObject) {
    return !isEmpty(tocResultObject)
      ? new TocResultMapper(tocResultObject)
      : null;
  }

  static fromArray(tocResultObjects) {
    if (isEmpty(tocResultObjects)) return [];
    const dataList = [];
    for (const tocResultObject of tocResultObjects) {
      const tocResult = TocResultMapper.from(tocResultObject);
      if (!isEmpty(tocResult)) {
        dataList.push(tocResult);
      }
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
    return !isEmpty(tocObject) ? new TocMapper(tocObject) : null;
  }

  static fromArray(tocObjects) {
    if (isEmpty(tocObjects)) return [];
    const dataList = [];
    for (const tocObject of tocObjects) {
      const toc = TocMapper.from(tocObject);
      if (!isEmpty(toc)) {
        dataList.push(toc);
      }
    }
    return dataList;
  }
}
export class ResultResponseMapper {
  constructor(rawData) {
    this.result_code = rawData.result_code;
    this.year = null;
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
    this.evidences = EvidencesMapper.fromArray(rawData?.evidence_array);
    this.primary_entity = PrimaryEntityMapper.fromArray(
      rawData?.obj_result_by_initiatives,
    );
  }
}
