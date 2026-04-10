export type ResultRow = {
  result_code?: number;
  result_title?: string | null;
  year?: number | null;
  status_id?: number;
  source?: string | null;
  source_definition?: string | null;
  last_update_at?: string;
  is_active?: boolean;
  indicator_category?: { name?: string | null } | null;
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
