const isEmpty = (v) => {
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
      .map((regionObject) => RegionMapper.from(regionObject.region_object));
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
      .map((countryObject) => CountryMapper.from(countryObject.country_object));
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
      );
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
      );
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
    return evidenceObjects.map((evidenceObject) =>
      EvidencesMapper.from(evidenceObject),
    );
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
    this.toc_alignment = [];
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
    this.evidences = EvidencesMapper.fromArray(rawData?.result_evidence_array);
    this.primary_entity = PrimaryEntityMapper.fromArray(
      rawData?.obj_result_by_initiatives,
    );
  }
}
