/**
 * Writes the guides in `./guides` and the payloads in `../schema` into `openapi.json`, which is
 * what `/docs` renders.
 *
 * The guides mirror the Notion pages integrators already read (PRMS Normalizer — Technical Field
 * Documentation, and PRMS Result Decision Webhooks), one file per sidebar section. They all go
 * into `info.description` because that is the only place Scalar builds sidebar entries from
 * headings: each `#` is a section, each `##` an entry under it. A tag description would render,
 * but never reach the sidebar.
 *
 * `src/schema/*.json` are the "full example per indicator" payloads attached to the Notion page.
 * They are written into the guide wherever it says `<!-- example: kp.json -->`, and become the
 * per-type examples of `POST /ingest`, so the page and the request builder show the same payload.
 * `test/openapi-docs.test.mjs` checks each one still passes validation.
 *
 * Baked in rather than read at runtime because the Lambda bundle only carries what esbuild imports.
 * Run `npm run docs:build` after editing a guide or an example; the test fails until you do.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SPEC = fileURLToPath(new URL("./openapi.json", import.meta.url));
const GUIDES = new URL("./guides/", import.meta.url);
const EXAMPLES = new URL("../schema/", import.meta.url);

// The result type each example file holds, in the order the request builder lists them.
export const EXAMPLE_FILES = {
  "kp.json": "Knowledge Product",
  "inno_dev.json": "Innovation Development",
  "cap-sharing.json": "Capacity Sharing",
  "inno_use.json": "Innovation Use",
  "policy.json": "Policy Change",
  "other_output.json": "Other Output",
  "other_outcome.json": "Other Outcome",
};

export const readExample = (file) =>
  JSON.parse(readFileSync(new URL(file, EXAMPLES), "utf8"));

// Endpoints are still grouped by tag; the prose lives in the sections above them.
const TAGS = [
  { name: "Ingestion", description: "Validate and submit results. See **Request structure** and the result type sections above." },
  { name: "Webhooks", description: "Register where PRMS calls you back. See **Result decision webhooks** above." },
  { name: "Versioning", description: "Carry an approved result into the open phase. See **Versioning** above." },
  { name: "Results", description: "Read results indexed in OpenSearch." },
  { name: "Health", description: "Service liveness." },
];

const TAG_BY_PATH = {
  "/ingest": "Ingestion",
  "/webhook": "Webhooks",
  "/webhook/inbox": "Webhooks",
  "/version": "Versioning",
  "/result": "Results",
  "/result/{code}": "Results",
  "/health": "Health",
};

function guides() {
  return readdirSync(GUIDES)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) =>
      readFileSync(new URL(f, GUIDES), "utf8")
        .trim()
        .replace(/<!-- example: (\S+) -->/g, (_, file) => {
          if (!(file in EXAMPLE_FILES)) throw new Error(`${f}: unknown example ${file}`);
          return "```json\n" + JSON.stringify(readExample(file), null, 2) + "\n```";
        }),
    )
    .join("\n\n");
}

const exampleKey = (file) => `full_${file.replace(/\.json$/, "").replace(/-/g, "_")}`;

export function buildSpec(spec) {
  const out = structuredClone(spec);
  out.info.description = guides();
  out.tags = TAGS;

  for (const [path, ops] of Object.entries(out.paths)) {
    const tag = TAG_BY_PATH[path];
    if (!tag) throw new Error(`No docs tag for ${path} — add it to TAG_BY_PATH.`);
    for (const op of Object.values(ops)) op.tags = [tag];
  }

  // Full examples first, so the request builder opens on one; hand-written variants follow.
  const content = out.paths["/ingest"].post.requestBody.content["application/json"];
  const variants = Object.fromEntries(
    Object.entries(content.examples ?? {}).filter(([k]) => !k.startsWith("full_")),
  );
  content.examples = {
    ...Object.fromEntries(
      Object.entries(EXAMPLE_FILES).map(([file, label]) => [
        exampleKey(file),
        { summary: `${label} — full example`, value: readExample(file) },
      ]),
    ),
    ...variants,
  };
  return out;
}

// Same layout the file already had: two-space indent, non-ASCII escaped.
export function serialize(spec) {
  return (
    JSON.stringify(spec, null, 2).replace(
      /[\u007f-￿]/g,
      (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
    ) + "\n"
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const spec = JSON.parse(readFileSync(SPEC, "utf8"));
  writeFileSync(SPEC, serialize(buildSpec(spec)));
  console.log("openapi.json updated from guides/ and schema/");
}
