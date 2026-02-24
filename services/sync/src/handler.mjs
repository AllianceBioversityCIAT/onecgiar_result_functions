/**
 * Lambda handler for scheduled sync cron job
 * Invoked by EventBridge Scheduler with a JSON payload
 */
import { runSyncJob } from "./job.mjs";
import { Logger } from "./utils/logger.mjs";

const logger = new Logger("CronHandler");

/**
 * Lambda handler for EventBridge Scheduler
 * @param {Object} event - EventBridge event payload
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object
 */
export const handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = context?.requestId || context?.awsRequestId || `cron-${Date.now()}`;
  
  // Log start marker (sanitize event to avoid logging sensitive data)
  const sanitizedEvent = {
    job: event?.job || event?.payload?.job,
    env: event?.env || event?.payload?.env,
    result_type: event?.result_type || event?.payload?.result_type,
    // Only log non-sensitive fields
  };
  
  logger.info("=== CRON JOB START ===", requestId, {
    job: "sync-cron",
    event: sanitizedEvent,
    timestamp: new Date().toISOString(),
    requestId,
  });

  try {
    // Extract payload from EventBridge Scheduler
    // EventBridge Scheduler sends the payload in event.payload or event
    const payload = event?.payload || event || {};
    const env = payload.env || process.env.ENVIRONMENT || "testing";
    const jobType = payload.job || "sync-cron";

    // Log only non-sensitive payload fields
    const sanitizedPayload = {
      job: payload.job,
      env: payload.env,
      result_type: payload.result_type,
      page: payload.page,
      limit: payload.limit,
      // Exclude any potential sensitive fields
    };
    
    logger.info("Processing cron job", requestId, {
      jobType,
      env,
      payload: sanitizedPayload,
    });

    // Run the sync job
    const result = await runSyncJob({
      env,
      requestId,
      ...payload,
    });

    const duration = Date.now() - startTime;

    // Log end marker
    logger.info("=== CRON JOB SUCCESS ===", requestId, {
      job: jobType,
      duration: `${duration}ms`,
      result,
      timestamp: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        job: jobType,
        env,
        requestId,
        duration: `${duration}ms`,
        result,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Log error marker
    logger.error("=== CRON JOB FAILED ===", requestId, {
      job: "sync-cron",
      duration: `${duration}ms`,
      error: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    });

    // Throw error so EventBridge marks invocation as failed
    // This will trigger the DLQ if configured
    throw new Error(`Sync cron job failed: ${errorMessage}`);
  }
};
