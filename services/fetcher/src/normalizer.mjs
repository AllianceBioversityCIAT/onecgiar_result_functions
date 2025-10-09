export function normalizeCommon(d) {
  const toStr = (v) => (v == null ? "" : String(v));
  const trim = (v) => toStr(v).trim();
  const collapse = (v) => trim(v).replace(/\s+/g, " ");
  const parseNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const normalizeNumberField = (obj, key) => {
    if (!(key in obj)) return;
    const parsed = parseNum(obj[key]);
    if (parsed == null) {
      delete obj[key];
    } else {
      obj[key] = parsed;
    }
  };

  // Campos mínimos (si existen)
  if ("title" in d) d.title = collapse(d.title);
  if ("description" in d) d.description = collapse(d.description);
  normalizeNumberField(d, "result_level");
  normalizeNumberField(d, "indicator_category");

  // contributing_initiatives: mayúsculas y trim
  if (Array.isArray(d.contributing_initiatives)) {
    d.contributing_initiatives = d.contributing_initiatives.map((x) =>
      String(x).toUpperCase().trim()
    );
  }

  return d;
}
