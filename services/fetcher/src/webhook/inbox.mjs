import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

import { redact } from "../utils/redact.mjs";

/**
 * A sink for the callbacks Reporting sends when a Science Program approves or rejects a result.
 *
 * It exists so the team can confirm, from either environment, that a decision actually produced a
 * delivery — without waiting for the receiving platform to tell us, and without reading CloudWatch.
 * Registering this URL is the whole setup: `POST /webhook` with it, then watch `GET /webhook/inbox`.
 *
 * It records and nothing else. No forwarding, no processing, no acting on the decision.
 */

const PREFIX = "webhook-inbox/";

/** Bounded so one caller cannot ask us to fetch an unbounded number of objects. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Headers worth keeping. Reporting sends `x-prms-delivery-id` on every delivery and
 * `x-prms-signature` when the endpoint has a secret — the two that say which delivery this was and
 * whether it was signed. The rest is API Gateway noise, and one of them is a credential on other
 * routes, which is why this is an allow-list rather than a filter.
 */
const KEPT_HEADERS = [
  "x-prms-delivery-id",
  "x-prms-signature",
  "content-type",
  "user-agent",
  "x-forwarded-for",
  "x-amzn-trace-id",
];

const s3 = new S3Client({ region: process.env.AWS_REGION });

function bucket() {
  return process.env.S3_BUCKET || "";
}

function pickHeaders(headers = {}) {
  const out = {};
  for (const name of KEPT_HEADERS) {
    const value = headers[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/**
 * The key is the receipt time in ISO form, so S3's lexicographic listing is already chronological
 * and `list` can take the newest by reading from the end. The suffix only breaks ties between two
 * deliveries landing in the same millisecond.
 */
function keyFor(receivedAt) {
  const stamp = receivedAt.replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${PREFIX}${stamp}-${suffix}.json`;
}

/**
 * Store one delivery. Returns the S3 key.
 *
 * Throws when it cannot store, and the route turns that into a 503 on purpose: Reporting retries a
 * failed delivery five times, so a refusal buys another chance to capture the evidence. Answering
 * 200 on a storage failure would acknowledge a delivery we did not keep, and it would never come
 * back.
 */
export async function record({ headers, body, receivedAt }) {
  const target = bucket();
  if (!target) {
    throw new Error("S3_BUCKET is not configured; cannot record the delivery");
  }

  const key = keyFor(receivedAt);
  const record = {
    received_at: receivedAt,
    delivery_id: headers?.["x-prms-delivery-id"] ?? null,
    signed: headers?.["x-prms-signature"] !== undefined,
    headers: pickHeaders(headers),
    // `redact` is a tripwire, not the point: the body is what the caller came to read, and nothing
    // in the documented payload is a credential. It runs because this lands in durable storage.
    body: redact(body ?? null),
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: target,
      Key: key,
      Body: JSON.stringify(record),
      ContentType: "application/json",
    }),
  );

  return key;
}

/** The newest `limit` keys under the prefix, oldest-to-newest within the page. */
async function newestKeys(target, limit) {
  const window = [];
  let token;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: target,
        Prefix: PREFIX,
        ContinuationToken: token,
      }),
    );

    for (const object of page.Contents ?? []) {
      window.push(object.Key);
      // Keys sort chronologically, so keeping a rolling tail costs one array per page instead of
      // holding every key ever written.
      if (window.length > limit) window.shift();
    }

    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  return window;
}

/**
 * The most recent deliveries, newest first.
 *
 * A malformed object is reported in place rather than dropped: an entry that cannot be parsed is
 * itself a finding, and silently skipping it would make the inbox look emptier than it is.
 */
export async function list(limit = DEFAULT_LIMIT) {
  const target = bucket();
  if (!target) {
    throw new Error("S3_BUCKET is not configured; cannot read the inbox");
  }

  const bounded = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const keys = await newestKeys(target, bounded);

  const deliveries = await Promise.all(
    keys.reverse().map(async (key) => {
      try {
        const { Body } = await s3.send(
          new GetObjectCommand({ Bucket: target, Key: key }),
        );
        return { key, ...JSON.parse(await Body.transformToString()) };
      } catch (error) {
        return { key, error: `could not be read: ${error?.message}` };
      }
    }),
  );

  return { bucket: target, prefix: PREFIX, count: deliveries.length, deliveries };
}

export const INBOX_PREFIX = PREFIX;
export const INBOX_MAX_LIMIT = MAX_LIMIT;
