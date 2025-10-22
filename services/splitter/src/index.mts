import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

const s3 = new S3Client({});

// Only prefixes (optional)
const RAW_PREFIX =
  (process.env.RAW_PREFIX || "raw/").replace(/^\/+|\/+$/g, "") + "/";
const CHUNKS_PREFIX =
  (process.env.CHUNKS_PREFIX || "chunks/").replace(/^\/+|\/+$/g, "") + "/";

async function streamToString(stream: any): Promise<string> {
  const src = stream instanceof Readable ? stream : Readable.fromWeb(stream);
  const chunks: Buffer[] = [];
  for await (const chunk of src) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}

export const handler = async (event: any): Promise<void> => {
  for (const rec of event?.Records ?? []) {
    const bucket = rec?.s3?.bucket?.name as string;
    const keyEsc = rec?.s3?.object?.key as string;
    if (!bucket || !keyEsc) continue;

    const key = decodeURIComponent(keyEsc.replace(/\+/g, " "));
    if (!key.startsWith(RAW_PREFIX)) continue;

    // 1) Read raw object from the event's bucket
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const jsonText = await streamToString(obj.Body);

    // 2) Flexible parsing
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.error("Invalid JSON:", e);
      throw new Error(`File ${key} is not valid JSON`);
    }

    let items: any[];
    if (Array.isArray(parsed)) items = parsed;
    else if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as any).results)
    )
      items = (parsed as any).results;
    else {
      console.error(
        "Unsupported structure. Keys:",
        Object.keys((parsed as any) || {})
      );
      throw new TypeError(
        "No iterable array found (neither root nor 'results')."
      );
    }

    // 3) jobId from raw/<jobId>.json
    const jobId = (key.split("/")[1] || "job").replace(/\.json$/i, "");

    // 4) Write chunks in the SAME bucket as the event
    let i = 0;
    for (const item of items) {
      i += 1;
      const outKey = `${CHUNKS_PREFIX}${jobId}/part-${String(i).padStart(
        5,
        "0"
      )}.json`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: outKey,
          Body: Buffer.from(JSON.stringify(item)),
          ContentType: "application/json",
        })
      );
    }

    console.log(
      `Splitter OK: ${i} files in ${CHUNKS_PREFIX}${jobId}/ (bucket=${bucket}, source=${key})`
    );
  }
};
