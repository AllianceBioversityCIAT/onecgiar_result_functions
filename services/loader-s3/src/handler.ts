import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: process.env.AWS_REGION });
const OUT = process.env.S3_BUCKET ?? "xxx";

async function getJson(bucket, key) {
  const { Body } = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  // En SDK v3 reciente existe transformToString; si no, fallback a stream
  if (Body && typeof Body.transformToString === "function") {
    return JSON.parse(await Body.transformToString());
  }
  return JSON.parse(await streamToString(Body));
}

async function streamToString(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(Buffer.from(c)));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

export const handler = async (event) => {
  console.log("EVENT:", JSON.stringify(event));

  const detail = event?.detail ?? {};
  const data = detail?.s3
    ? await getJson(detail.s3.bucket, detail.s3.key)
    : detail?.payload ?? {};

  const idKey = detail?.idempotencyKey ?? `${Date.now()}`;
  const key = `normalized/${idKey}.json`;

  const body = JSON.stringify({
    data,
    meta: {
      correlationId: detail?.correlationId ?? null,
      ts: Date.now(),
      source: event?.source,
      detailType: event?.["detail-type"],
    },
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: OUT,
      Key: key,
      Body: body,
      ContentType: "application/json",
    })
  );

  console.log("WROTE:", { bucket: OUT, key });
  return { ok: true, bucket: OUT, key };
};
