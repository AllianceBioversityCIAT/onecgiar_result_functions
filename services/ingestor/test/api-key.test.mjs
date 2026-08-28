import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
// built on the fly so the tests exercise the real handler; tmp/ is gitignored
const bundlePath = path.join(here, "tmp", "ingestor.cjs");

const BUCKET = "my-bulk-pipeline";
const CLARISA_URL = "https://clarisa.test";

// Everything the handler touches on the way out.
const puts = [];
const clarisaCalls = [];
let clarisaImpl = async () => {
  throw new Error("CLARISA not configured");
};

let handler;

before(async () => {
  process.env.BUCKET = BUCKET;
  process.env.CLA_VALIDATE_URL = CLARISA_URL;

  globalThis.fetch = async (url, options) => {
    clarisaCalls.push({ url, body: JSON.parse(options.body), options });
    return clarisaImpl(url, options);
  };

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
    puts.push({ command: command.constructor.name, input: command.input });
    return {};
  };

  ({ handler } = require(bundlePath));
});

beforeEach(() => {
  puts.length = 0;
  clarisaCalls.length = 0;
  process.env.CLA_VALIDATE_URL = CLARISA_URL;
});

// --- helpers ---------------------------------------------------------------

function clarisaSays(body, { status = 200, ok = true } = {}) {
  return async () => ({ ok, status, json: async () => body });
}

function clarisaThrows(name) {
  return async () => {
    const err = new Error(name);
    err.name = name;
    throw err;
  };
}

const VALID = clarisaSays({
  valid: true,
  mis: { id: 7, name: "STAR", acronym: "STAR" },
  environment: "TEST",
  scopes: [],
});

function bulkRequest(headers, results) {
  return {
    headers,
    requestContext: { identity: { sourceIp: "203.0.113.7" } },
    body: JSON.stringify({
      tenant: "prms.result-management.api",
      op: "dataset.ingest.requested",
      results: results ?? [
        { type: "innovation_use", data: { external_reference: "ABC-001" } },
      ],
    }),
  };
}

function bodyOf(response) {
  return JSON.parse(response.body);
}

// --- missing key -------------------------------------------------------------

test("missing key: 401, nothing written to S3 and CLARISA is never called", async () => {
  const res = await handler(bulkRequest({ "content-type": "application/json" }));

  assert.equal(res.statusCode, 401);
  assert.equal(bodyOf(res).message, "Missing x-api-key header");
  assert.equal(puts.length, 0);
  assert.equal(clarisaCalls.length, 0);
});

test("blank key: treated as missing", async () => {
  const res = await handler(bulkRequest({ "x-api-key": "   " }));

  assert.equal(res.statusCode, 401);
  assert.equal(puts.length, 0);
  assert.equal(clarisaCalls.length, 0);
});

// --- invalid key -------------------------------------------------------------

test("invalid key: 401 and no job is created", async () => {
  clarisaImpl = clarisaSays({ valid: false });

  const res = await handler(bulkRequest({ "x-api-key": "not-a-real-key" }));

  assert.equal(res.statusCode, 401);
  assert.equal(bodyOf(res).message, "Invalid x-api-key");
  assert.equal(puts.length, 0);
  assert.equal(clarisaCalls.length, 1);
});

test("CLARISA answering 401: still a rejected key, not an outage", async () => {
  clarisaImpl = clarisaSays({}, { ok: false, status: 401 });

  const res = await handler(bulkRequest({ "x-api-key": "expired-key" }));

  assert.equal(res.statusCode, 401);
  assert.equal(puts.length, 0);
});

// --- CLARISA unavailable -----------------------------------------------------

test("CLARISA timeout: 503 with Retry-After and no job", async () => {
  clarisaImpl = clarisaThrows("AbortError");

  const res = await handler(bulkRequest({ "x-api-key": "good-key" }));

  assert.equal(res.statusCode, 503);
  assert.equal(res.headers["retry-after"], "30");
  assert.match(bodyOf(res).message, /Retry later/);
  assert.equal(puts.length, 0);
});

test("network failure reaching CLARISA: 503, no job", async () => {
  clarisaImpl = async () => {
    // what the runtime throws when the host cannot be reached
    throw new TypeError("fetch failed");
  };

  const res = await handler(bulkRequest({ "x-api-key": "good-key" }));

  assert.equal(res.statusCode, 503);
  assert.equal(res.headers["retry-after"], "30");
  assert.equal(puts.length, 0);
});

test("CLARISA 500: 503, never blamed on the caller's key", async () => {
  clarisaImpl = clarisaSays({}, { ok: false, status: 500 });

  const res = await handler(bulkRequest({ "x-api-key": "good-key" }));

  assert.equal(res.statusCode, 503);
  assert.equal(puts.length, 0);
});

test("CLA_VALIDATE_URL not configured: 503, fail closed, CLARISA never called", async () => {
  process.env.CLA_VALIDATE_URL = "";
  clarisaImpl = VALID;

  const res = await handler(bulkRequest({ "x-api-key": "good-key" }));

  assert.equal(res.statusCode, 503);
  assert.equal(puts.length, 0);
  assert.equal(clarisaCalls.length, 0);
});

// --- valid key ---------------------------------------------------------------

test("valid key: 202, raw object written and the key kept in the envelope", async () => {
  clarisaImpl = VALID;

  const res = await handler(bulkRequest({ "x-api-key": "good-key" }));

  assert.equal(res.statusCode, 202);
  const body = bodyOf(res);
  assert.ok(body.job_id);
  assert.equal(body.count, 1);

  assert.equal(puts.length, 1);
  assert.equal(puts[0].command, "PutObjectCommand");
  assert.equal(puts[0].input.Key, `raw/${body.job_id}.json`);

  // the pipeline contract is unchanged: envelope preserved, key travelling with it
  const raw = JSON.parse(puts[0].input.Body.toString());
  assert.equal(raw.apiKey, "good-key");
  assert.equal(raw.tenant, "prms.result-management.api");
  assert.equal(raw.op, "dataset.ingest.requested");
  assert.equal(raw.results.length, 1);
  assert.equal(raw.results[0].data.external_reference, "ABC-001");
});

test("one validation per request, not one per result", async () => {
  clarisaImpl = VALID;
  const results = Array.from({ length: 25 }, (_, i) => ({
    type: "innovation_use",
    data: { external_reference: `ABC-${i}` },
  }));

  const res = await handler(bulkRequest({ "x-api-key": "good-key" }, results));

  assert.equal(res.statusCode, 202);
  assert.equal(bodyOf(res).count, 25);
  assert.equal(clarisaCalls.length, 1);
});

// --- what CLARISA receives ---------------------------------------------------

test("the request identifies this hop and carries the caller's ip", async () => {
  clarisaImpl = VALID;

  await handler(bulkRequest({ "x-api-key": "good-key" }));

  const call = clarisaCalls[0];
  assert.equal(call.url, `${CLARISA_URL}/api/auth/validate-api-key`);
  assert.equal(call.body.api_key, "good-key");
  assert.equal(call.body.microservice_name, "PRMS Bulk Ingest Service");
  assert.equal(call.body.endpoint_accessed, "/bulk/ingest");
  assert.equal(call.body.ip_address, "203.0.113.7");
});

test("repeated header: only the first value is validated", async () => {
  clarisaImpl = VALID;

  await handler(bulkRequest({ "X-Api-Key": "key1,key2" }));
  assert.equal(clarisaCalls[0].body.api_key, "key1");

  clarisaCalls.length = 0;
  await handler(bulkRequest({ "x-api-key": ["key1", "key2"] }));
  assert.equal(clarisaCalls[0].body.api_key, "key1");
});

test("x-forwarded-for wins over the request context for the client ip", async () => {
  clarisaImpl = VALID;

  await handler({
    headers: { "x-api-key": "good-key", "x-forwarded-for": "198.51.100.4, 10.0.0.1" },
    requestContext: { identity: { sourceIp: "10.0.0.1" } },
    body: JSON.stringify({ results: [{ type: "innovation_use", data: {} }] }),
  });

  assert.equal(clarisaCalls[0].body.ip_address, "198.51.100.4");
});

// --- observability -----------------------------------------------------------

function captureConsole(run) {
  const lines = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const level of ["log", "warn", "error"]) {
    console[level] = (...args) => lines.push(`${level}: ${args.join(" ")}`);
  }
  return run().finally(() => Object.assign(console, original)).then(() => lines);
}

test("a valid key logs the decision, the platform and the elapsed time", async () => {
  clarisaImpl = VALID;

  const lines = await captureConsole(() =>
    handler({
      ...bulkRequest({ "x-api-key": "star-secret-key-9f2c" }),
      requestContext: {
        identity: { sourceIp: "203.0.113.7" },
        requestId: "req-42",
      },
    })
  );

  const line = lines.find((l) => l.includes("[clarisa-auth]"));
  assert.ok(line, `no [clarisa-auth] line in:\n${lines.join("\n")}`);
  assert.match(line, /outcome=valid/);
  assert.match(line, /mis=STAR\(7\)/);
  assert.match(line, /environment=TEST/);
  assert.match(line, /host=clarisa\.test/);
  assert.match(line, /requestId=req-42/);
  assert.match(line, /ms=\d+/);
});

test("the api key is never written to the logs in full", async () => {
  clarisaImpl = clarisaSays({ valid: false });

  const lines = await captureConsole(() =>
    handler(bulkRequest({ "x-api-key": "star-secret-key-9f2c" }))
  );

  const all = lines.join("\n");
  assert.ok(!all.includes("star-secret-key-9f2c"), `key leaked in:\n${all}`);
  assert.match(all, /outcome=invalid/);
  assert.match(all, /key=\*\*\*\*9f2c/);
});

test("an unavailable CLARISA logs the reason", async () => {
  clarisaImpl = clarisaThrows("AbortError");

  const lines = await captureConsole(() =>
    handler(bulkRequest({ "x-api-key": "good-key" }))
  );

  const line = lines.find((l) => l.includes("outcome=unavailable"));
  assert.ok(line, `no outcome line in:\n${lines.join("\n")}`);
  assert.match(line, /reason=timeout/);
  assert.ok(line.startsWith("error:"), "an outage should be logged at error level");
});

test("a missing header is logged too, without calling CLARISA", async () => {
  const lines = await captureConsole(() =>
    handler(bulkRequest({ "content-type": "application/json" }))
  );

  assert.ok(lines.some((l) => l.includes("outcome=missing_header")));
  assert.equal(clarisaCalls.length, 0);
});

// --- body validation still runs after auth -----------------------------------

test("auth is checked before the body: a bad key on a malformed body is 401, not 400", async () => {
  clarisaImpl = clarisaSays({ valid: false });

  const res = await handler({
    headers: { "x-api-key": "bad" },
    body: JSON.stringify({ nope: true }),
  });

  assert.equal(res.statusCode, 401);
  assert.equal(puts.length, 0);
});

test("valid key with a malformed body is still 400", async () => {
  clarisaImpl = VALID;

  const res = await handler({
    headers: { "x-api-key": "good-key" },
    body: JSON.stringify({ nope: true }),
  });

  assert.equal(res.statusCode, 400);
  assert.equal(puts.length, 0);
});
