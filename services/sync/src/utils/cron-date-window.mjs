/**
 * UTC date window for cron sync.
 * Default: current UTC calendar day [today 00:00Z, tomorrow 00:00Z) as
 * last_updated_from / last_updated_to (YYYY-MM-DD for the API).
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** @param {Date} d */
function toYmdUtc(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** @param {string} ymd YYYY-MM-DD */
function addOneUtcDay(ymd) {
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  const ms = Date.UTC(y, m - 1, d) + 86400000;
  return toYmdUtc(new Date(ms));
}

/**
 * Resolves last_updated_from / last_updated_to (YYYY-MM-DD, UTC calendar dates).
 * Priority:
 * 1. payload: both last_updated_from and last_updated_to (non-empty)
 * 2. env: both LAST_UPDATED_FROM and LAST_UPDATED_TO (non-empty)
 * 3. SYNC_UTC_DAY (env or payload): single UTC day backfill → [day, day+1)
 * 4. Default: current UTC day — today through tomorrow 00:00Z (dates = today, tomorrow)
 *
 * @param {Record<string, string | undefined>} [payload]
 * @returns {{ last_updated_from: string, last_updated_to: string }}
 */
export function resolveLastUpdatedWindowUtc(payload = {}) {
  const env = process.env;

  const pFrom = payload.last_updated_from?.trim();
  const pTo = payload.last_updated_to?.trim();
  if (pFrom && pTo) {
    return { last_updated_from: pFrom, last_updated_to: pTo };
  }

  const eFrom = env.LAST_UPDATED_FROM?.trim();
  const eTo = env.LAST_UPDATED_TO?.trim();
  if (eFrom && eTo) {
    return { last_updated_from: eFrom, last_updated_to: eTo };
  }

  const day =
    (payload.sync_utc_day || env.SYNC_UTC_DAY || "").trim();
  if (day) {
    return {
      last_updated_from: day,
      last_updated_to: addOneUtcDay(day),
    };
  }

  const now = new Date();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  return {
    last_updated_from: toYmdUtc(todayStart),
    last_updated_to: toYmdUtc(tomorrowStart),
  };
}
