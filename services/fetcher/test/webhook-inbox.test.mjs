import assert from "node:assert/strict";
import { describe, it, beforeEach, mock } from "node:test";

process.env.S3_BUCKET = process.env.S3_BUCKET || "test-bucket";

const { S3Client } = await import("@aws-sdk/client-s3");
const inbox = await import("../src/webhook/inbox.mjs");

/**
 * P2-3166 — the sink that lets us confirm a decision produced a delivery.
 *
 * Every assertion here is about the contract Reporting's dispatcher relies on, because the sink is
 * only worth having if it behaves the way the dispatcher expects: a 2xx settles a delivery as SENT
 * and it is never sent again, so the one thing this must never do is acknowledge a delivery it
 * failed to keep.
 *
 * S3 is stubbed at `S3Client.prototype.send`: the module builds its client at import time, so
 * swapping the prototype method is what reaches the instance it already holds.
 */
const sent = [];

function stubS3(handler) {
  mock.method(S3Client.prototype, "send", async function (command) {
    sent.push(command);
    return handler(command);
  });
}

function bodyOf(command) {
  return JSON.parse(command.input.Body);
}

const DELIVERY = {
  result_id: 11876,
  external_reference: "19973",
  decision: "approved",
  decided_at: "2026-09-22T10:00:00.000Z",
  data: { title: "test result" },
};

const HEADERS = {
  "content-type": "application/json",
  "x-prms-delivery-id": "4417",
  "x-prms-signature": "a".repeat(64),
  "x-api-key": "must-not-be-stored",
};

describe("webhook inbox", () => {
  beforeEach(() => {
    sent.length = 0;
    mock.restoreAll();
  });

  it("stores the delivery and reports the key it wrote", async () => {
    stubS3(async () => ({}));

    const key = await inbox.record({
      headers: HEADERS,
      body: DELIVERY,
      receivedAt: "2026-09-22T10:00:01.000Z",
    });

    assert.ok(key.startsWith(inbox.INBOX_PREFIX), key);
    assert.equal(sent.length, 1);

    const stored = bodyOf(sent[0]);
    assert.deepEqual(stored.body, DELIVERY, "the payload must be kept verbatim");
    assert.equal(stored.delivery_id, "4417");
    assert.equal(stored.signed, true, "a signed delivery has to read as signed");
  });

  it("keeps the delivery headers but never the API key", async () => {
    stubS3(async () => ({}));

    await inbox.record({
      headers: HEADERS,
      body: DELIVERY,
      receivedAt: "2026-09-22T10:00:01.000Z",
    });

    const stored = bodyOf(sent[0]);
    assert.equal(stored.headers["x-prms-delivery-id"], "4417");
    assert.equal(
      "x-api-key" in stored.headers,
      false,
      "the header allow-list exists so a credential cannot reach durable storage",
    );
  });

  it("records an unsigned delivery as unsigned rather than omitting it", async () => {
    stubS3(async () => ({}));

    const { "x-prms-signature": _omitted, ...unsigned } = HEADERS;
    await inbox.record({
      headers: unsigned,
      body: DELIVERY,
      receivedAt: "2026-09-22T10:00:01.000Z",
    });

    assert.equal(bodyOf(sent[0]).signed, false);
  });

  it("propagates a storage failure instead of swallowing it", async () => {
    stubS3(async () => {
      throw new Error("S3 is down");
    });

    await assert.rejects(
      inbox.record({
        headers: HEADERS,
        body: DELIVERY,
        receivedAt: "2026-09-22T10:00:01.000Z",
      }),
      /S3 is down/,
      "the route turns this into a 503 so Reporting retries; swallowing it loses the delivery",
    );
  });

  it("returns the newest deliveries first and caps the limit", async () => {
    const keys = Array.from(
      { length: 5 },
      (_, i) => `${inbox.INBOX_PREFIX}2026-09-22T10-00-0${i}-000Z-aaaaaa.json`,
    );

    stubS3(async (command) => {
      if (command.constructor.name === "ListObjectsV2Command") {
        return { Contents: keys.map((Key) => ({ Key })), IsTruncated: false };
      }
      return {
        Body: {
          transformToString: async () =>
            JSON.stringify({ received_at: command.input.Key }),
        },
      };
    });

    const { deliveries, count } = await inbox.list(3);

    assert.equal(count, 3, "limit is honoured");
    assert.deepEqual(
      deliveries.map((d) => d.key),
      [keys[4], keys[3], keys[2]],
      "newest first — keys sort chronologically, so the tail is the newest",
    );
  });

  it("reports an unreadable object in place instead of dropping it", async () => {
    const key = `${inbox.INBOX_PREFIX}2026-09-22T10-00-00-000Z-aaaaaa.json`;

    stubS3(async (command) => {
      if (command.constructor.name === "ListObjectsV2Command") {
        return { Contents: [{ Key: key }], IsTruncated: false };
      }
      return {
        Body: { transformToString: async () => "{ not json" },
      };
    });

    const { deliveries } = await inbox.list();

    assert.equal(deliveries.length, 1, "a bad object is a finding, not a reason to show fewer");
    assert.match(deliveries[0].error, /could not be read/);
  });
});
