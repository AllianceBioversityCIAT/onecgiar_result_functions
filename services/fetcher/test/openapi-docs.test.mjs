import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  EXAMPLE_FILES,
  buildSpec,
  readExample,
  serialize,
} from "../src/docs/build-openapi.mjs";
import { prepareResults } from "../src/ingest/batch.mjs";

const SPEC_TEXT = readFileSync(
  new URL("../src/docs/openapi.json", import.meta.url),
  "utf8",
);
const SPEC = JSON.parse(SPEC_TEXT);

// The examples are published as payloads to copy. Six of the seven were rejected for months after
// `lead_contact_person` became mandatory, and nothing noticed — so each one now has to pass the
// same pre-checks /ingest applies.
function rejectionsOf(payload) {
  const { rejected } = prepareResults(payload.results, {
    tenant: "docs",
    opDefault: "create",
    nowIso: new Date().toISOString(),
    requestId: "docs",
  });
  return rejected;
}

// Log noise from the validator is irrelevant here; keep the test output readable.
function quietly(fn) {
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try {
    return fn();
  } finally {
    Object.assign(console, { log, warn, error });
  }
}

describe("openapi.json", () => {
  it("is up to date with src/docs/guides and src/schema — run `npm run docs:build` if this fails", () => {
    assert.equal(SPEC_TEXT, serialize(buildSpec(SPEC)));
  });

  for (const file of Object.keys(EXAMPLE_FILES)) {
    it(`src/schema/${file} passes validation`, () => {
      assert.deepEqual(quietly(() => rejectionsOf(readExample(file))), []);
    });
  }

  const examples =
    SPEC.paths["/ingest"].post.requestBody.content["application/json"].examples;
  for (const [key, { value }] of Object.entries(examples)) {
    // `invalidExample` is meant to fail; the batch example is only `$ref`s to the others.
    if (key === "invalidExample" || value.results.some((r) => r.$ref)) continue;
    it(`POST /ingest example "${key}" passes validation`, () => {
      assert.deepEqual(quietly(() => rejectionsOf(value)), []);
    });
  }
});
