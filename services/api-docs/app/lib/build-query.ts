export type FilterState = {
  page: number;
  size: number;
  year: string;
  centerAcronym: string;
  resultCode: string;
  resultType: string[];
  statusId: number[];
  source: string[];
};

export function buildResultQueryString(f: FilterState): string {
  const p = new URLSearchParams();
  p.set("page", String(f.page));
  p.set("size", String(f.size));

  if (f.year.trim()) p.set("year", f.year.trim());
  if (f.centerAcronym.trim())
    p.set("centerAcronym", f.centerAcronym.trim().toUpperCase());
  if (f.resultCode.trim())
    p.set("resultCode", f.resultCode.trim().toUpperCase());
  if (f.resultType.length)
    p.set("resultType", f.resultType.join(","));
  if (f.statusId.length)
    p.set("statusId", f.statusId.join(","));
  if (f.source.length) p.set("source", f.source.join(","));

  return p.toString();
}
