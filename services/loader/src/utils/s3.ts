import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { ProcessedResult } from "../types.js";

export class S3Utils {
  private client: S3Client;
  private bucket: string;

  constructor(bucket?: string) {
    this.client = new S3Client({ region: (process as any).env.AWS_REGION });
    this.bucket = bucket || (process as any).env.S3_BUCKET || "";
  }

  async getJsonFromS3(bucket: string, key: string): Promise<any> {
    try {
      const { Body } = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );

      if (Body && typeof (Body as any).transformToString === "function") {
        return JSON.parse(await (Body as any).transformToString());
      }

      return JSON.parse(await this.streamToString(Body as any));
    } catch (error) {
      console.error(
        `[S3Utils] Error getting JSON from s3://${bucket}/${key}:`,
        error
      );
      throw error;
    }
  }

  async saveToS3(
    data: any,
    keyPrefix: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `${keyPrefix}/${timestamp}-${Date.now()}.json`;

    try {
      const body = JSON.stringify({
        ...data,
        meta: {
          ...metadata,
          saved_at: new Date().toISOString(),
          bucket: this.bucket,
          key,
        },
      });

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: "application/json",
        })
      );

      console.log(`[S3Utils] Saved to s3://${this.bucket}/${key}`);
      return key;
    } catch (error) {
      console.error(`[S3Utils] Error saving to S3:`, error);
      throw error;
    }
  }

  async saveProcessedResults(
    results: ProcessedResult[],
    stage: string
  ): Promise<string> {
    const keyPrefix = `processed/${stage}`;
    return this.saveToS3({ results, count: results.length }, keyPrefix, {
      stage,
      processing_timestamp: Date.now(),
    });
  }

  private async streamToString(stream: any): Promise<string> {
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: any) => chunks.push(Buffer.from(chunk)));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  }
}
