import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

export class S3Utils {
  client;
  bucket;

  constructor(bucket) {
    this.client = new S3Client({ region: process.env.AWS_REGION });
    this.bucket = bucket || process.env.S3_BUCKET || "";
  }

  async getJsonFromS3(bucket, key) {
    try {
      const { Body } = await this.client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );

      if (Body && typeof Body.transformToString === "function") {
        return JSON.parse(await Body.transformToString());
      }

      return JSON.parse(await this.streamToStringBody);
    } catch (error) {
      console.error(
        `[S3Utils] Error getting JSON from s3://${bucket}/${key}:`,
        error
      );
      throw error;
    }
  }

  async saveToS3(
    data,
    keyPrefix,
    metadata
  ) {
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
    results,
    stage
  ) {
    const keyPrefix = `processed/${stage}`;
    return this.saveToS3({ results, count: results.length }, keyPrefix, {
      stage,
      processing_timestamp: Date.now(),
    });
  }

  async saveErrorToS3(
    jobId,
    result,
    error,
    context
  ) {
    try {
      if (!jobId || jobId === "unknown-job") {
        console.warn(`[S3Utils] Skipping error save - invalid jobId: ${jobId}`);
        return null;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const shortId = result?.idempotencyKey
        ? result.idempotencyKey.substring(0, 8)
        : result?.result_id
        ? String(result.result_id)
        : Math.random().toString(36).substring(2, 10);
      const errorKey = `errors/${jobId}/${timestamp}-${shortId}.json`;

      // Use my-bulk-pipeline bucket for errors
      const errorBucket =
        process.env.ERROR_BUCKET || "my-bulk-pipeline";

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
    } catch (saveErr) {
      console.error(
        `[S3Utils] ❌ Failed to save error to S3:`,
        saveErr?.message || saveErr
      );
      return null;
    }
  }

  async streamToString(stream) {
    return await new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  }
}
