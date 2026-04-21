/**
 * HTTP orchestration: one GET /sync per bilateral result_type (pagination stays in sync service).
 * Used by the scheduled cron Lambda; can also be run as a CLI when SYNC_BASE_URL is set.
 */
import { BILATERAL_RESULT_TYPES } from "../constants/bilateral-result-types.mjs";
import { resolveLastUpdatedWindowUtc } from "./cron-date-window.mjs";

const DEFAULT_FETCH_TIMEOUT_MS = Number(process.env.SYNC_HTTP_TIMEOUT_MS || 120000);

/**
 * @param {string} from
 * @param {string} to
 */
function toIsoQueryParams(from, to) {
  const f = from.trim();
  const t = to.trim();
  if (f.includes("T") || t.includes("T")) {
    return { last_updated_from: f, last_updated_to: t };
  }
  const [yf, mf, df] = f.split("-").map((x) => Number.parseInt(x, 10));
  const [yt, mt, dt] = t.split("-").map((x) => Number.parseInt(x, 10));
  return {
    last_updated_from: new Date(Date.UTC(yf, mf - 1, df)).toISOString(),
    last_updated_to: new Date(Date.UTC(yt, mt - 1, dt)).toISOString(),
  };
}

/**
 * @param {Record<string, unknown>} [options]
 * @param {Record<string, unknown>} [options.payload] EventBridge / cron JSON (filters + dates)
 * @param {string} [options.requestId]
 * @param {string} [options.syncBaseUrl] Overrides SYNC_BASE_URL
 * @returns {Promise<object>}
 */
export async function runSyncOpenSearchByResultType(options = {}) {
  const payload = /** @type {Record<string, string | undefined>} */ (
    options.payload && typeof options.payload === "object" ? options.payload : {}
  );
  const requestId = options.requestId || "";
  const base =
    (options.syncBaseUrl || process.env.SYNC_BASE_URL || "").trim();

  if (!base) {
    throw new Error(
      "SYNC_BASE_URL is required (deploy sets it to the sync HTTP API /sync URL)"
    );
  }

  const limit = String(
    payload.limit ?? process.env.LIMIT ?? process.env.CronJobLimit ?? "500"
  );
  const portfolioRaw = payload.portfolio ?? process.env.PORTFOLIO ?? process.env.CronJobPortfolio ?? "P25";
  const portfolio = portfolioRaw === undefined || portfolioRaw === null ? "" : String(portfolioRaw);

  const ymdWindow = resolveLastUpdatedWindowUtc(payload);
  const { last_updated_from: isoFrom, last_updated_to: isoTo } = toIsoQueryParams(
    ymdWindow.last_updated_from,
    ymdWindow.last_updated_to
  );

  console.error(
    `Window (UTC): last_updated_from=${isoFrom} last_updated_to=${isoTo}${requestId ? ` (${requestId})` : ""}`
  );

  const perType = [];
  let anyHttpError = false;

  let baseUrlStr = base.trim().replace(/\/+$/, "");
  if (!/\/sync$/i.test(baseUrlStr)) {
    baseUrlStr = `${baseUrlStr}/sync`;
  }
  const baseForFetch = baseUrlStr.includes("://")
    ? baseUrlStr
    : `https://${baseUrlStr}`;

  const OPTIONAL_QUERY_KEYS = [
    "source",
    "phase_year",
    "status_id",
    "status",
    "created_from",
    "created_to",
    "center",
    "initiative_lead_code",
    "search",
  ];

  for (const resultType of BILATERAL_RESULT_TYPES) {
    const u = new URL(baseForFetch);
    u.searchParams.set("result_type", resultType);
    u.searchParams.set("limit", limit);
    if (portfolio.trim() !== "") {
      u.searchParams.set("portfolio", portfolio.trim());
    }
    u.searchParams.set("last_updated_from", isoFrom);
    u.searchParams.set("last_updated_to", isoTo);

    for (const key of OPTIONAL_QUERY_KEYS) {
      const v = payload[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        if (key === "phase_year" && (Number(v) === 0 || v === "0")) continue;
        u.searchParams.set(key, String(v));
      }
    }

    console.error(`==> ${resultType}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      DEFAULT_FETCH_TIMEOUT_MS
    );

    let res;
    try {
      res = await fetch(u.toString(), {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Fetch failed for ${resultType}: ${msg}`);
      anyHttpError = true;
      perType.push({
        result_type: resultType,
        ok: false,
        error: msg,
        url: u.toString(),
      });
      continue;
    }
    clearTimeout(timeoutId);

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 2000) };
    }

    if (!res.ok) {
      console.error(
        `HTTP ${res.status} for ${resultType}: ${text.slice(0, 500)}`
      );
      anyHttpError = true;
      perType.push({
        result_type: resultType,
        ok: false,
        status: res.status,
        body,
        url: u.toString(),
      });
      continue;
    }

    perType.push({
      result_type: resultType,
      ok: true,
      status: res.status,
      body,
    });
  }

  if (anyHttpError) {
    throw new Error(
      "sync-opensearch-by-result-type: one or more GET /sync calls failed (see logs and perType)"
    );
  }

  return {
    mode: "http_sync_by_result_type",
    window: ymdWindow,
    isoWindow: { last_updated_from: isoFrom, last_updated_to: isoTo },
    types: BILATERAL_RESULT_TYPES.length,
    perType,
  };
}

async function cliMain() {
  await runSyncOpenSearchByResultType({ payload: {} });
}

const runAsScript = process.argv[1]?.includes("sync-opensearch-by-result-type.mjs");
if (runAsScript) {
  cliMain().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
