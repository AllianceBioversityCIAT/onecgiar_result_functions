export type LeadingResult = {
  acronym?: string | null;
  name?: string | null;
  code?: string | number | null;
};

export type ResultRow = {
  result_code?: number;
  result_title?: string | null;
  leading_result?: LeadingResult | null;
  primary_entity?: {
    official_code?: string | null;
    name?: string | null;
  } | null;
  year?: number | null;
  status_id?: number;
  source?: string | null;
  source_definition?: string | null;
  last_update_at?: string;
  is_active?: boolean;
  indicator_category?: { code?: number | null; name?: string | null } | null;
  knowledge_product_summary?: { handle?: string | null } | null;
  innovation_development_summary?: Record<string, unknown> | null;
  innovation_use_summary?: Record<string, unknown> | null;
  capacity_development_summary?: Record<string, unknown> | null;
  policy_change_summary?: Record<string, unknown> | null;
  obj_status?: { status_name?: string } | null;
  prms_link?: string;
};

export type ResultListPayload = {
  data: ResultRow[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
};

/** Full document from GET /result/:code (ResultResponseMapper JSON) */
export type ResultDetail = {
  result_code?: number;
  result_title?: string | null;
  description?: string | null;
  primary_entity?: {
    official_code?: string | null;
    name?: string | null;
  } | null;
  lead_contact_person?: string | null;
  dac_scores?: unknown;
  toc_alignment?: Array<{
    entity?: { official_code?: string | null; name?: string | null } | null;
    initiative_role?: unknown;
    toc_results?: Array<{
      level?: unknown;
      sub_entity?: {
        official_code?: string | null;
        description?: string | null;
      } | null;
      result_name?: string | null;
    }>;
  }>;
  contributing_centers?: Array<{
    code?: number | null;
    name?: string | null;
    acronym?: string | null;
    is_lead?: boolean;
  }>;
  contributing_partners?: Array<{
    code?: number | string | null;
    name?: string | null;
    acronym?: string | null;
  }>;
  bilateral_projects?: Array<Record<string, unknown>>;
  indicator_category?: { code?: number | null; name?: string | null } | null;
  knowledge_product_summary?: { handle?: string | null } | null;
  innovation_development_summary?: Record<string, unknown> | null;
  innovation_use_summary?: Record<string, unknown> | null;
  capacity_development_summary?: Record<string, unknown> | null;
  policy_change_summary?: Record<string, unknown> | null;
  geographic_focus?: {
    code?: number | null;
    name?: string | null;
    description?: string | null;
  } | null;
  regions?: Array<{ code?: number | null; name?: string | null }>;
  countries?: Array<{ code?: string | null; name?: string | null }>;
  evidences?: Array<{ link?: string | null; description?: string | null }>;
  prms_link?: string;
};
