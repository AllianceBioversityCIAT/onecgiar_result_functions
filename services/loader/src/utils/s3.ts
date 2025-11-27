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

  async saveErrorToS3(
    jobId: string,
    result: any,
    error: any,
    context?: Record<string, any>
  ): Promise<string | null> {
    try {
      if (!jobId || jobId === "unknown-job") {
        console.warn(`[S3Utils] Skipping error save - invalid jobId: ${jobId}`);
        return null;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const resultId = result?.idempotencyKey || result?.result_id || "unknown";
      const errorKey = `errors/${jobId}/${timestamp}-${resultId}.json`;

      // Use my-bulk-pipeline bucket for errors
      const errorBucket =
        (process as any).env.ERROR_BUCKET || "my-bulk-pipeline";

      const errorData = {
        timestamp: new Date().toISOString(),
        jobId,
        resultId: result?.idempotencyKey,
        resultType: result?.type,
        error: {
          message: error?.message || String(error),
          stack: error?.stack,
          name: error?.name,
        },
        result,
        context,
      };

      await this.client.send(
        new PutObjectCommand({
          Bucket: errorBucket,
          Key: errorKey,
          Body: JSON.stringify(errorData, null, 2),
          ContentType: "application/json",
        })
      );

      console.log(
        `[S3Utils] 💾 Error saved to s3://${errorBucket}/${errorKey}`
      );
      return errorKey;
    } catch (saveErr: any) {
      console.error(
        `[S3Utils] ❌ Failed to save error to S3:`,
        saveErr?.message || saveErr
      );
      return null;
    }
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
