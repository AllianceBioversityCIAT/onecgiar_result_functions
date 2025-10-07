export function normalizeCommon(d) {
  const toStr = (v) => (v == null ? "" : String(v));
  const trim = (v) => toStr(v).trim();
  const collapse = (v) => trim(v).replace(/\s+/g, " ");
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  // Campos mínimos (si existen)
  if ("title" in d) d.title = collapse(d.title);
  if ("description" in d) d.description = collapse(d.description);
  if ("result_level" in d) d.result_level = toNum(d.result_level);
  if ("indicator_category" in d)
    d.indicator_category = toNum(d.indicator_category);

  // contributing_initiatives: mayúsculas y trim
  if (Array.isArray(d.contributing_initiatives)) {
    d.contributing_initiatives = d.contributing_initiatives.map((x) =>
      String(x).toUpperCase().trim()
    );
  }

  return d;
}
