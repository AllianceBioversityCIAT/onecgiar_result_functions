import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Readable } from "node:stream";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
// built on the fly so the tests exercise the real handler; tmp/ is gitignored
const bundlePath = path.join(here, "tmp", "worker.cjs");

const BUCKET = "my-bulk-pipeline";

// In-memory S3 shared with the bundle: the SDK stays external at build time so
// both sides patch the same S3Client.
const store = new Map();
let fetchImpl = async () => {
  throw new Error("fetch not configured");
};

let handler;

before(async () => {
  process.env.BUCKET = BUCKET;
  process.env.PRMS_URL = "http://prms.test/ingest";
  process.env.TENANT = "prms";
  process.env.OP = "create";
  process.env.LOG_LEVEL = "error";

  globalThis.fetch = (...args) => fetchImpl(...args);

  await build({
    entryPoints: [path.join(here, "..", "src", "index.mts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["@aws-sdk/client-s3"],
    outfile: bundlePath,
    logLevel: "error",
  });

  const sdk = require("@aws-sdk/client-s3");
  sdk.S3Client.prototype.send = async function (command) {
    const name = command.constructor.name;
    const input = command.input;

    if (name === "PutObjectCommand") {
      const body = Buffer.isBuffer(input.Body)
        ? input.Body.toString("utf8")
        : String(input.Body);
      store.set(`${input.Bucket}/${input.Key}`, body);
      return {};
    }

    if (name === "GetObjectCommand") {
      const id = `${input.Bucket}/${input.Key}`;
      if (!store.has(id)) {
        const err = new Error("NoSuchKey");
        err.name = "NoSuchKey";
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return { Body: Readable.from([Buffer.from(store.get(id))]) };
    }

    if (name === "ListObjectsV2Command") {
      const prefix = `${input.Bucket}/${input.Prefix}`;
      const contents = [...store.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((k) => ({ Key: k.slice(input.Bucket.length + 1) }));
      return { Contents: contents, IsTruncated: false };
    }

    throw new Error(`unexpected command ${name}`);
  };

  ({ handler } = require(bundlePath));
});

beforeEach(() => {
  store.clear();
});

// --- helpers ---------------------------------------------------------------

function seedJob(jobId, total) {
  // Mirrors what the splitter writes before the worker sees any chunk.
  store.set(
    `${BUCKET}/summaries/${jobId}/summary.json`,
    JSON.stringify({
      jobId,
      status: "running",
      total,
      processed: 0,
      successCount: 0,
      failureCount: 0,
      failureSamples: [],
      bucket: BUCKET,
      rawKey: `raw/${jobId}.json`,
      chunksPrefix: `chunks/${jobId}/`,
      successesPrefix: `successes/${jobId}/`,
      failuresPrefix: `failures/${jobId}/`,
      createdAt: "2026-08-27T00:00:00.000Z",
      updatedAt: "2026-08-27T00:00:00.000Z",
    })
  );
}

function seedChunk(jobId, part, externalReference) {
  const key = `chunks/${jobId}/part-${String(part).padStart(5, "0")}.json`;
  store.set(
    `${BUCKET}/${key}`,
    JSON.stringify({
      apiKey: "test-key",
      result: {
        type: "innovation_use",
        data: {
          external_reference: externalReference,
          title: `result ${part}`,
        },
      },
    })
  );
  return key;
}

function sqsRecord(messageId, key) {
  return {
    messageId,
    body: JSON.stringify({
      Records: [
        { s3: { bucket: { name: BUCKET }, object: { key } } },
      ],
    }),
  };
}

// Mimics the fetcher: echoes the result enriched with result_id/result_code.
function fetcherRespondsWith({ failFor = [], resultCodeFor = () => 8930 } = {}) {
  return async (_url, options) => {
    const payload = JSON.parse(options.body);
    const sent = payload.results[0];
    const externalReference = sent?.data?.external_reference;

    if (failFor.includes(externalReference)) {
      return {
        ok: false,
        status: 422,
        text: async () =>
          JSON.stringify({
            ok: false,
            error: "validation_failed",
            message: "(root) must have required property 'lead_contact_person'",
          }),
      };
    }

    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          processed: 1,
          successful: 1,
          failed: 0,
          results: [
            {
              success: true,
              resultId: `prms:innovation_use:create:${externalReference}`,
              resultType: "innovation_use",
              result: {
                ...sent.data,
                type: "innovation_use",
                result_id: 12000 + resultCodeFor(externalReference),
                result_code: resultCodeFor(externalReference),
              },
            },
          ],
        }),
    };
  };
}

function readJson(key) {
  const raw = store.get(`${BUCKET}/${key}`);
  return raw === undefined ? undefined : JSON.parse(raw);
}

function keysUnder(prefix) {
  return [...store.keys()]
    .filter((k) => k.startsWith(`${BUCKET}/${prefix}`))
    .map((k) => k.slice(BUCKET.length + 1))
    .sort();
}

// --- tests -----------------------------------------------------------------

test("full success: every external_reference is paired with its result_code", async () => {
  const jobId = "job-success";
  seedJob(jobId, 3);
  const refs = ["ABC-001", "ABC-002", "ABC-003"];
  const records = refs.map((ref, i) =>
    sqsRecord(`m${i + 1}`, seedChunk(jobId, i + 1, ref))
  );
  fetchImpl = fetcherRespondsWith({
    resultCodeFor: (ref) => 8930 + refs.indexOf(ref),
  });

  const out = await handler({ Records: records });
  assert.deepEqual(out.batchItemFailures, []);

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.status, "succeeded");
  assert.equal(summary.successCount, 3);
  assert.equal(summary.failureCount, 0);
  assert.deepEqual(summary.successDetailsLocation, {
    bucket: BUCKET,
    key: `summaries/${jobId}/success-details.json`,
  });

  // one object per chunk, key derived from the chunk
  assert.deepEqual(keysUnder(`successes/${jobId}/`), [
    `successes/${jobId}/part-00001.json`,
    `successes/${jobId}/part-00002.json`,
    `successes/${jobId}/part-00003.json`,
  ]);

  const details = readJson(`summaries/${jobId}/success-details.json`);
  assert.equal(details.count, 3);
  assert.deepEqual(
    details.results.map((r) => ({
      external_reference: r.external_reference,
      result_code: r.result_code,
    })),
    [
      { external_reference: "ABC-001", result_code: 8930 },
      { external_reference: "ABC-002", result_code: 8931 },
      { external_reference: "ABC-003", result_code: 8932 },
    ]
  );
  assert.equal(details.results[0].result_id, 20930);
  assert.equal(details.results[0].type, "innovation_use");

  const failures = readJson(`summaries/${jobId}/failure-details.json`);
  assert.equal(failures.count, 0);
  assert.deepEqual(failures.results, []);
});

test("partial_failed: complete success and failure detail, and both add up to total", async () => {
  const jobId = "job-partial";
  seedJob(jobId, 3);
  const refs = ["ABC-001", "ABC-002", "ABC-003"];
  const records = refs.map((ref, i) =>
    sqsRecord(`m${i + 1}`, seedChunk(jobId, i + 1, ref))
  );
  fetchImpl = fetcherRespondsWith({ failFor: ["ABC-002"] });

  const out = await handler({ Records: records });
  assert.deepEqual(out.batchItemFailures, [{ itemIdentifier: "m2" }]);

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.status, "partial_failed");
  assert.equal(summary.successCount, 2);
  assert.equal(summary.failureCount, 1);

  const successes = readJson(`summaries/${jobId}/success-details.json`);
  const failures = readJson(`summaries/${jobId}/failure-details.json`);

  assert.equal(successes.count, 2);
  assert.equal(failures.count, 1);
  assert.equal(successes.count + failures.count, summary.total);

  assert.deepEqual(
    successes.results.map((r) => r.external_reference).sort(),
    ["ABC-001", "ABC-003"]
  );

  const failed = failures.results[0];
  assert.equal(failed.external_reference, "ABC-002");
  assert.equal(failed.type, "innovation_use");
  assert.equal(failed.key, `chunks/${jobId}/part-00002.json`);
  assert.match(failed.reason, /PRMS responded 422/);
  // the compact record does not carry the full payload
  assert.equal(failed.payload, undefined);
});

test("total failure: successCount 0 and complete failure detail", async () => {
  const jobId = "job-failed";
  seedJob(jobId, 2);
  const refs = ["ABC-001", "ABC-002"];
  const records = refs.map((ref, i) =>
    sqsRecord(`m${i + 1}`, seedChunk(jobId, i + 1, ref))
  );
  fetchImpl = fetcherRespondsWith({ failFor: refs });

  const out = await handler({ Records: records });
  assert.equal(out.batchItemFailures.length, 2);

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.successCount, 0);
  assert.equal(summary.failureCount, 2);
  assert.equal(summary.failureCount, summary.total);
  assert.equal(summary.status, "partial_failed");

  const successes = readJson(`summaries/${jobId}/success-details.json`);
  const failures = readJson(`summaries/${jobId}/failure-details.json`);
  assert.equal(successes.count, 0);
  assert.equal(failures.count, 2);
  assert.deepEqual(
    failures.results.map((r) => r.external_reference).sort(),
    ["ABC-001", "ABC-002"]
  );
});

test("redelivery: reprocessing the same chunk does not duplicate the detail", async () => {
  const jobId = "job-redelivery";
  seedJob(jobId, 1);
  const key = seedChunk(jobId, 1, "ABC-001");
  fetchImpl = fetcherRespondsWith();

  await handler({ Records: [sqsRecord("m1", key)] });
  // same chunk delivered again, different SQS messageId
  await handler({ Records: [sqsRecord("m1-redelivered", key)] });

  assert.deepEqual(keysUnder(`successes/${jobId}/`), [
    `successes/${jobId}/part-00001.json`,
  ]);

  const details = readJson(`summaries/${jobId}/success-details.json`);
  assert.equal(details.count, 1);
  assert.equal(details.results[0].external_reference, "ABC-001");
});

test("redelivery of a failure: one record per chunk", async () => {
  const jobId = "job-redelivery-failure";
  seedJob(jobId, 1);
  const key = seedChunk(jobId, 1, "ABC-099");
  fetchImpl = fetcherRespondsWith({ failFor: ["ABC-099"] });

  await handler({ Records: [sqsRecord("m1", key)] });
  await handler({ Records: [sqsRecord("m1-redelivered", key)] });

  assert.deepEqual(keysUnder(`failures/${jobId}/`), [
    `failures/${jobId}/part-00001.json`,
  ]);

  const failures = readJson(`summaries/${jobId}/failure-details.json`);
  assert.equal(failures.count, 1);
  assert.equal(failures.results[0].external_reference, "ABC-099");
});

test("legacy summary without the new fields: filled in without breaking", async () => {
  const jobId = "job-legacy";
  // summary written before this feature existed
  store.set(
    `${BUCKET}/summaries/${jobId}/summary.json`,
    JSON.stringify({
      jobId,
      status: "running",
      total: 1,
      processed: 0,
      successCount: 0,
      failureCount: 0,
      failureSamples: [{ messageId: "old", reason: "legacy" }],
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    })
  );
  const key = seedChunk(jobId, 1, "ABC-001");
  fetchImpl = fetcherRespondsWith();

  await handler({ Records: [sqsRecord("m1", key)] });

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.successesPrefix, `successes/${jobId}/`);
  assert.equal(summary.failuresPrefix, `failures/${jobId}/`);
  assert.ok(summary.successDetailsLocation);
  // legacy failureSamples were migrated, not lost
  assert.equal(summary.failuresDetail.length, 1);
  assert.equal(summary.failuresDetail[0].reason, "legacy");
});
