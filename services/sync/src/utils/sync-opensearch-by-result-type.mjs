#!/usr/bin/env node
/**
 * Triggers the OpenSearch sync Lambda once per result type (indicator category).
 * Pagination is handled by the sync service; this script only fires one GET per type.
 *
 * Usage:
 *   node scripts/sync-opensearch-by-result-type.mjs
 *
 * Date window (UTC):
 *   By default uses the previous UTC calendar day: [yesterday 00:00, today 00:00),
 *   matching `last_updated_to` as an exclusive upper bound (same idea as your API examples).
 *
 * Env:
 *   SYNC_BASE_URL       — default: Lambda /sync URL below
 *   LIMIT               — default: 500
 *   PORTFOLIO           — default: P25
 *   LAST_UPDATED_FROM   — optional ISO-8601; if set, LAST_UPDATED_TO must also be set
 *   LAST_UPDATED_TO     — optional ISO-8601 (exclusive end recommended)
 *   SYNC_UTC_DAY        — optional YYYY-MM-DD: sync that UTC day only (overrides default window;
 *                         ignored if LAST_UPDATED_FROM and LAST_UPDATED_TO are both set)
 *
 * Examples:
 *   # Daily cron: no args → yesterday UTC
 *   node scripts/sync-opensearch-by-result-type.mjs
 *
 *   # Backfill one UTC day
 *   SYNC_UTC_DAY=2026-04-21 node scripts/sync-opensearch-by-result-type.mjs
 *
 *   # Manual window
 *   LAST_UPDATED_FROM=2026-04-21T00:00:00.000Z LAST_UPDATED_TO=2026-04-22T00:00:00.000Z \
 *     node scripts/sync-opensearch-by-result-type.mjs
 */

const DEFAULT_BASE =
  'https://45c4ybmjm62fvlziasswa544uy0yhtdc.lambda-url.us-east-1.on.aws/sync';

/** Must match bilateral list `result_type` values (result_type.name). */
const RESULT_TYPES = [
  'Policy change',
  'Innovation use',
  'Other outcome',
  'Capacity sharing for development',
  'Knowledge product',
  'Innovation development',
  'Other output',
  'Impact contribution',
  'Innovation Package',
];

const baseUrl = process.env.SYNC_BASE_URL ?? DEFAULT_BASE;
const limit = process.env.LIMIT ?? '500';
const portfolio = process.env.PORTFOLIO ?? 'P25';

/** Start of UTC calendar day for `d` (00:00:00.000Z). */
function utcStartOfDay(d) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/** Previous full UTC day as [from, to) ISO strings — typical “run cron on day D for day D−1”. */
function defaultYesterdayUtcWindow() {
  const now = new Date();
  const todayStart = utcStartOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);
  return {
    from: yesterdayStart.toISOString(),
    to: todayStart.toISOString(),
  };
}

/** One UTC day from SYNC_UTC_DAY=YYYY-MM-DD → [day 00:00, next day 00:00). */
function windowForUtcDay(yyyyMmDd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!m) {
    throw new Error(
      `SYNC_UTC_DAY must be YYYY-MM-DD, got: ${JSON.stringify(yyyyMmDd)}`,
    );
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const from = new Date(Date.UTC(y, mo - 1, d));
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function resolveLastUpdatedWindow() {
  const fromEnv = process.env.LAST_UPDATED_FROM;
  const toEnv = process.env.LAST_UPDATED_TO;
  if (fromEnv && toEnv) {
    return { from: fromEnv, to: toEnv };
  }
  if (fromEnv || toEnv) {
    console.warn(
      'sync-opensearch-by-result-type: set both LAST_UPDATED_FROM and LAST_UPDATED_TO, or neither. Using automatic UTC window.',
    );
  }
  if (process.env.SYNC_UTC_DAY) {
    return windowForUtcDay(process.env.SYNC_UTC_DAY);
  }
  return defaultYesterdayUtcWindow();
}

const { from: lastUpdatedFrom, to: lastUpdatedTo } = resolveLastUpdatedWindow();

async function main() {
  console.error(
    `Window (UTC): last_updated_from=${lastUpdatedFrom} last_updated_to=${lastUpdatedTo}`,
  );
  for (const resultType of RESULT_TYPES) {
    const u = new URL(
      baseUrl.includes('://') ? baseUrl : `https://${baseUrl}`,
    );
    u.searchParams.set('result_type', resultType);
    u.searchParams.set('limit', limit);
    u.searchParams.set('portfolio', portfolio);
    u.searchParams.set('last_updated_from', lastUpdatedFrom);
    u.searchParams.set('last_updated_to', lastUpdatedTo);

    console.error(`==> ${resultType}`);
    const res = await fetch(u, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(`HTTP ${res.status} for ${resultType}: ${text.slice(0, 500)}`);
      process.exitCode = 1;
      continue;
    }
    console.log(text);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
