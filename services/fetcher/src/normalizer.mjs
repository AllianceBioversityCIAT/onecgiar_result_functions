export function normalizeCommon(d) {
  const startTs = Date.now();
  try {
    console.log("[normalizer] start normalizeCommon", {
      hasTitle: "title" in d,
      hasDescription: "description" in d,
      contributingInitiativesCount: Array.isArray(d.contributing_initiatives)
        ? d.contributing_initiatives.length
        : 0,
      keys: Object.keys(d),
    });
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

    if ("title" in d) d.title = collapse(d.title);
    if ("description" in d) d.description = collapse(d.description);

    if (Array.isArray(d.contributing_initiatives)) {
      d.contributing_initiatives = d.contributing_initiatives.map((x) =>
        String(x).toUpperCase().trim()
      );
      console.log("[normalizer] normalized contributing_initiatives", {
        resulting: d.contributing_initiatives,
      });
    }

    const tookMs = Date.now() - startTs;
    console.log("[normalizer] complete normalizeCommon", {
      tookMs,
      titlePreview: d.title ? d.title.slice(0, 80) : undefined,
      descriptionPreview: d.description
        ? d.description.slice(0, 80)
        : undefined,
    });
    return d;
  } catch (error) {
    console.error("[normalizer] ERROR in normalizeCommon", {
      error: error.message,
      stack: error.stack,
      dataKeys: Object.keys(d || {}),
    });
    throw error;
  }
}
