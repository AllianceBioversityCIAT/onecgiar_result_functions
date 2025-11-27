import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.S3_BUCKET || "my-bulk-pipeline";
const ERROR_PREFIX = "errors/";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    // If key is provided, get specific error file
    if (key) {
      const command = new GetObjectCommand({
        Bucket: BUCKET,
        Key: key,
      });

      const response = await s3Client.send(command);
      const body = await response.Body?.transformToString();
      
      if (!body) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      const data = JSON.parse(body);
      return NextResponse.json(data);
    }

    // Otherwise, list all error files
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: ERROR_PREFIX,
      MaxKeys: 1000,
    });

    const response = await s3Client.send(command);
    
    const errors = (response.Contents || [])
      .filter((obj) => obj.Key && obj.Key.endsWith(".json"))
      .map((obj) => ({
        key: obj.Key,
        lastModified: obj.LastModified?.toISOString(),
        size: obj.Size,
      }))
      .sort((a, b) => {
        if (!a.lastModified || !b.lastModified) return 0;
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      });

    return NextResponse.json({ errors, count: errors.length });
  } catch (error) {
    console.error("S3 error list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch errors", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
