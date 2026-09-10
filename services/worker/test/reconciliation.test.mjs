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
// both sides patch the same S3Client. Objects carry an ETag and honour
// IfMatch/IfNoneMatch, which is what makes the concurrency tests meaningful.
const store = new Map();
let version = 0;
let fetchImpl = async () => {
  throw new Error("fetch not configured");
};
// Hook fired right after a summary is read, used to force a real interleaving.
let afterSummaryRead = null;
// Counts rejected conditional writes: proof the race actually happened.
let preconditionFailures = 0;

let handler;

function preconditionFailed() {
  preconditionFailures += 1;
  const err = new Error("At least one of the pre-conditions you specified did not hold");
  err.name = "PreconditionFailed";
  err.$metadata = { httpStatusCode: 412 };
  return err;
}

// Releases only once every party has arrived; a no-op afterwards, so the retry
// that follows a lost race is not blocked again.
function oneShotBarrier(parties) {
  let arrived = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  let done = false;
  return async () => {
    if (done) return;
    arrived += 1;
    if (arrived >= parties) {
      done = true;
      release();
      return;
    }
    await gate;
  };
}

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
    // every call yields, so concurrent invocations really interleave
    await new Promise((r) => setImmediate(r));

    if (name === "PutObjectCommand") {
      const id = `${input.Bucket}/${input.Key}`;
      const current = store.get(id);
      if (input.IfNoneMatch === "*" && current) throw preconditionFailed();
      if (input.IfMatch && current?.etag !== input.IfMatch) {
        throw preconditionFailed();
      }
      const body = Buffer.isBuffer(input.Body)
        ? input.Body.toString("utf8")
        : String(input.Body);
      store.set(id, { body, etag: `"v${++version}"` });
      return {};
    }

    if (name === "GetObjectCommand") {
      const id = `${input.Bucket}/${input.Key}`;
      const current = store.get(id);
      if (!current) {
        const err = new Error("NoSuchKey");
        err.name = "NoSuchKey";
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      const result = {
        Body: Readable.from([Buffer.from(current.body)]),
        ETag: current.etag,
      };
      if (input.Key.endsWith("summary.json") && afterSummaryRead) {
        await afterSummaryRead();
      }
      return result;
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
  afterSummaryRead = null;
  preconditionFailures = 0;
});

// --- helpers ---------------------------------------------------------------

function putObject(key, value) {
  store.set(`${BUCKET}/${key}`, {
    body: typeof value === "string" ? value : JSON.stringify(value),
    etag: `"v${++version}"`,
  });
}

function seedJob(jobId, total) {
  // Mirrors what the splitter writes before the worker sees any chunk.
  putObject(`summaries/${jobId}/summary.json`, {
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
  });
}

function seedChunk(jobId, part, externalReference) {
  const key = `chunks/${jobId}/part-${String(part).padStart(5, "0")}.json`;
  putObject(key, {
    apiKey: "test-key",
    result: {
      type: "innovation_use",
      data: {
        external_reference: externalReference,
        title: `result ${part}`,
      },
    },
  });
  return key;
}

function sqsRecord(messageId, key) {
  return {
    messageId,
    body: JSON.stringify({
      Records: [{ s3: { bucket: { name: BUCKET }, object: { key } } }],
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
  const entry = store.get(`${BUCKET}/${key}`);
  return entry === undefined ? undefined : JSON.parse(entry.body);
}

function keysUnder(prefix) {
  return [...store.keys()]
    .filter((k) => k.startsWith(`${BUCKET}/${prefix}`))
    .map((k) => k.slice(BUCKET.length + 1))
    .sort();
}

// --- reconciliation detail --------------------------------------------------

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

test("legacy summary without the new fields: filled in without breaking", async () => {
  const jobId = "job-legacy";
  // summary written before this feature existed
  putObject(`summaries/${jobId}/summary.json`, {
    jobId,
    status: "running",
    total: 1,
    processed: 0,
    successCount: 0,
    failureCount: 0,
    failureSamples: [{ messageId: "old", reason: "legacy" }],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  });
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

// --- idempotency under redelivery -------------------------------------------

test("redelivery of a success: the detail and the counters stay at one", async () => {
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

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.failureCount, 0);
  assert.equal(summary.processed, 1);
  assert.equal(summary.status, "succeeded");

  const details = readJson(`summaries/${jobId}/success-details.json`);
  assert.equal(details.count, 1);
  assert.equal(details.results[0].external_reference, "ABC-001");
});

test("redelivery of a failure: the detail and the counters stay at one", async () => {
  const jobId = "job-redelivery-failure";
  seedJob(jobId, 1);
  const key = seedChunk(jobId, 1, "ABC-099");
  fetchImpl = fetcherRespondsWith({ failFor: ["ABC-099"] });

  await handler({ Records: [sqsRecord("m1", key)] });
  await handler({ Records: [sqsRecord("m1-redelivered", key)] });

  assert.deepEqual(keysUnder(`failures/${jobId}/`), [
    `failures/${jobId}/part-00001.json`,
  ]);

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.processed, 1);
  // the sample is not duplicated either
  assert.equal(summary.failuresDetail.length, 1);

  const failures = readJson(`summaries/${jobId}/failure-details.json`);
  assert.equal(failures.count, 1);
  assert.equal(failures.results[0].external_reference, "ABC-099");
});

test("mixed redelivery: a chunk that failed and later succeeded counts once, as success", async () => {
  const jobId = "job-recovered";
  seedJob(jobId, 1);
  const key = seedChunk(jobId, 1, "ABC-001");

  fetchImpl = fetcherRespondsWith({ failFor: ["ABC-001"] });
  await handler({ Records: [sqsRecord("m1", key)] });

  fetchImpl = fetcherRespondsWith();
  await handler({ Records: [sqsRecord("m1-redelivered", key)] });

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.failureCount, 0);
  assert.equal(summary.processed, 1);
  assert.equal(summary.status, "succeeded");

  // the stale failure object is not counted, and is kept out of the file too
  const failures = readJson(`summaries/${jobId}/failure-details.json`);
  assert.equal(failures.count, 0);
});

// --- concurrency ------------------------------------------------------------

test("two concurrent failures: reproduces the TEST job and no longer loses the update", async () => {
  // jobId a7cbf97b-... in TEST: both chunks failed, both failure objects were
  // written, and the summary still read processed=1 / failureCount=1 / running.
  const jobId = "job-concurrent-failures";
  seedJob(jobId, 2);
  const k1 = seedChunk(jobId, 1, "ABC-001");
  const k2 = seedChunk(jobId, 2, "ABC-002");
  fetchImpl = fetcherRespondsWith({ failFor: ["ABC-001", "ABC-002"] });

  // both invocations read the summary before either writes it
  afterSummaryRead = oneShotBarrier(2);

  await Promise.all([
    handler({ Records: [sqsRecord("mA", k1)] }),
    handler({ Records: [sqsRecord("mB", k2)] }),
  ]);

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.processed, 2);
  assert.equal(summary.successCount, 0);
  assert.equal(summary.failureCount, 2);
  assert.notEqual(summary.status, "running");
  assert.equal(summary.status, "partial_failed");

  const failures = readJson(`summaries/${jobId}/failure-details.json`);
  assert.equal(failures.count, 2);

  // the two writers really collided: without the conditional write one update
  // would have been silently lost, which is exactly the TEST symptom
  assert.ok(
    preconditionFailures >= 1,
    `expected at least one rejected conditional write, got ${preconditionFailures}`
  );
});

test("two concurrent successes: counters and status survive the race", async () => {
  const jobId = "job-concurrent-successes";
  seedJob(jobId, 2);
  const k1 = seedChunk(jobId, 1, "ABC-001");
  const k2 = seedChunk(jobId, 2, "ABC-002");
  fetchImpl = fetcherRespondsWith();

  afterSummaryRead = oneShotBarrier(2);

  await Promise.all([
    handler({ Records: [sqsRecord("mA", k1)] }),
    handler({ Records: [sqsRecord("mB", k2)] }),
  ]);

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.processed, 2);
  assert.equal(summary.successCount, 2);
  assert.equal(summary.failureCount, 0);
  assert.equal(summary.status, "succeeded");

  const successes = readJson(`summaries/${jobId}/success-details.json`);
  assert.equal(successes.count, 2);
});

test("concurrent partial_failed: one success and one failure race to close the job", async () => {
  const jobId = "job-concurrent-partial";
  seedJob(jobId, 2);
  const k1 = seedChunk(jobId, 1, "ABC-001");
  const k2 = seedChunk(jobId, 2, "ABC-002");
  fetchImpl = fetcherRespondsWith({ failFor: ["ABC-002"] });

  afterSummaryRead = oneShotBarrier(2);

  await Promise.all([
    handler({ Records: [sqsRecord("mA", k1)] }),
    handler({ Records: [sqsRecord("mB", k2)] }),
  ]);

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.processed, 2);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.status, "partial_failed");

  assert.equal(readJson(`summaries/${jobId}/success-details.json`).count, 1);
  assert.equal(readJson(`summaries/${jobId}/failure-details.json`).count, 1);
});

test("many chunks concurrently: processed equals success plus failure and never exceeds total", async () => {
  const jobId = "job-concurrent-many";
  const total = 12;
  seedJob(jobId, total);

  const keys = [];
  for (let i = 1; i <= total; i++) {
    keys.push(seedChunk(jobId, i, `ABC-${String(i).padStart(3, "0")}`));
  }
  // every third chunk fails
  const failing = keys
    .map((_, i) => `ABC-${String(i + 1).padStart(3, "0")}`)
    .filter((_, i) => (i + 1) % 3 === 0);
  fetchImpl = fetcherRespondsWith({ failFor: failing });

  // six invocations of two messages each, all racing on the same summary
  afterSummaryRead = oneShotBarrier(6);
  const invocations = [];
  for (let i = 0; i < total; i += 2) {
    invocations.push(
      handler({
        Records: [
          sqsRecord(`m${i + 1}`, keys[i]),
          sqsRecord(`m${i + 2}`, keys[i + 1]),
        ],
      })
    );
  }
  await Promise.all(invocations);

  const summary = readJson(`summaries/${jobId}/summary.json`);
  assert.equal(summary.processed, summary.successCount + summary.failureCount);
  assert.ok(summary.processed <= summary.total);
  assert.equal(summary.processed, total);
  assert.equal(summary.successCount, total - failing.length);
  assert.equal(summary.failureCount, failing.length);
  assert.notEqual(summary.status, "running");
  assert.equal(summary.status, "partial_failed");

  assert.equal(
    readJson(`summaries/${jobId}/success-details.json`).count,
    total - failing.length
  );
  assert.equal(
    readJson(`summaries/${jobId}/failure-details.json`).count,
    failing.length
  );
});
