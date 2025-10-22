import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

const s3 = new S3Client({});
const BUCKET = process.env.BUCKET || "XXX";

export const handler = async (event: any) => {
  const body =
    typeof event.body === "string"
      ? event.body
      : JSON.stringify(event.body ?? "[]");
  const items = JSON.parse(body);
  const jobId = crypto.randomUUID();
  const key = `raw/${jobId}.json`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(JSON.stringify(items)),
      ContentType: "application/json",
    })
  );

  return {
    statusCode: 202,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ job_id: jobId, count: items.length }),
  };
};
