import type {
  HttpMethod,
  ListedOperation,
  OpenApiDocument,
  OpenApiMediaType,
  OpenApiOperation,
  OpenApiParameter,
} from "./openapi-types";

const METHODS: HttpMethod[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
];

/** Global sort: all GETs first, then post → put → patch → delete → options → head; same method → path A→Z */
const METHOD_SORT_ORDER: Record<HttpMethod, number> = {
  get: 0,
  post: 1,
  put: 2,
  patch: 3,
  delete: 4,
  options: 5,
  head: 6,
};

export function listOperations(doc: OpenApiDocument): ListedOperation[] {
  const out: ListedOperation[] = [];
  for (const path of Object.keys(doc.paths ?? {}).sort()) {
    const item = doc.paths[path];
    if (!item) continue;
    for (const method of METHODS) {
      const op = item[method];
      if (op) out.push({ method, path, operation: op });
    }
  }
  out.sort((a, b) => {
    const da = METHOD_SORT_ORDER[a.method];
    const db = METHOD_SORT_ORDER[b.method];
    if (da !== db) return da - db;
    return a.path.localeCompare(b.path);
  });
  return out;
}

export function paramExample(p: OpenApiParameter): string {
  const ex = p.example ?? p.schema?.example ?? p.schema?.default;
  if (ex === undefined || ex === null) return "";
  return String(ex);
}

export function jsonBodyExamples(
  content: Record<string, OpenApiMediaType> | undefined,
): { key: string; summary?: string; value: unknown }[] {
  const json = content?.["application/json"];
  if (!json?.examples || typeof json.examples !== "object") return [];
  return Object.entries(json.examples).map(([key, v]) => ({
    key,
    summary: v.summary,
    value: v.value,
  }));
}

export function defaultJsonBodyString(op: OpenApiOperation): string {
  const content = op.requestBody?.content;
  const fromExamples = jsonBodyExamples(content);
  if (fromExamples.length > 0) {
    try {
      return JSON.stringify(fromExamples[0].value, null, 2);
    } catch {
      return "{}";
    }
  }
  const json = content?.["application/json"];
  if (json?.example !== undefined) {
    try {
      return JSON.stringify(json.example, null, 2);
    } catch {
      return "{}";
    }
  }
  return "{}";
}

export function buildProxiedPath(
  pathTemplate: string,
  pathValues: Record<string, string>,
): string {
  return pathTemplate.replaceAll(/\{([^}]+)\}/g, (_, name: string) => {
    const v = pathValues[name];
    return v !== undefined && v !== "" ? encodeURIComponent(v) : `{${name}}`;
  });
}

export function buildQueryString(
  params: OpenApiParameter[] | undefined,
  queryValues: Record<string, string>,
): string {
  if (!params?.length) return "";
  const q = new URLSearchParams();
  for (const p of params) {
    if (p.in !== "query") continue;
    const v = queryValues[p.name];
    if (v !== undefined && v !== "") q.set(p.name, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
