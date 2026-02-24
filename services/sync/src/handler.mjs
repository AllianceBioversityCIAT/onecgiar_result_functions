/**
 * Lambda handler for scheduled sync cron job
 * Invoked by EventBridge Scheduler with a JSON payload
 */

// Load environment variables from .env file at the very top (before any imports that use process.env)
// This runs synchronously before any other imports to ensure env vars are available
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { existsSync, readFileSync, readdirSync } from "fs";

// Get __dirname - works in both ESM and CJS after esbuild bundling
let __dirname;
try {
  // Try to get __dirname from CommonJS (after esbuild bundling)
  if (typeof __dirname !== "undefined") {
    // Already available in CJS
  } else if (typeof __filename !== "undefined") {
    // __filename available, get dirname
    const { dirname: dirnameFn } = require("path");
    __dirname = dirnameFn(__filename);
  } else {
    // Try ESM way
    const __filename = fileURLToPath(import.meta.url);
    __dirname = dirname(__filename);
  }
} catch (e) {
  // Fallback to process.cwd()
  __dirname = process.cwd();
}

// Debug logging (safe - no secrets)
console.log("[handler] Initializing env loader...");
console.log(`[handler] __dirname: ${__dirname}`);
console.log(`[handler] process.cwd(): ${process.cwd()}`);

// Try multiple possible paths for .env file
// SAM packages CodeUri: services/sync/, so .env should be at root of package
const possiblePaths = [
  resolve(__dirname, "../.env"),        // From dist-cron/ to root (most likely)
  resolve(__dirname, "../../.env"),      // If nested deeper
  join(process.cwd(), ".env"),          // From Lambda task root (/var/task/.env)
  resolve(process.cwd(), ".env"),       // Absolute from cwd
  "/var/task/.env",                      // Direct Lambda path
];

let envLoaded = false;
let loadedPath = null;
const loadedEnvKeys = []; // Track which keys we loaded from .env

// Debug: List directory structure
try {
  console.log(`[handler] Files in __dirname: ${readdirSync(__dirname).slice(0, 5).join(", ")}`);
  if (existsSync(resolve(__dirname, ".."))) {
    console.log(`[handler] Files in parent: ${readdirSync(resolve(__dirname, "..")).slice(0, 5).join(", ")}`);
  }
} catch (e) {
  // Ignore errors in debug
}

for (const envPath of possiblePaths) {
  if (existsSync(envPath)) {
    try {
      console.log(`[handler] Found .env at: ${envPath}`);
      // Load .env manually to avoid dotenv dependency issues
      const envContent = readFileSync(envPath, "utf8");
      const lines = envContent.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith("#")) continue;

        const equalIndex = trimmed.indexOf("=");
        if (equalIndex > 0) {
          // Extract key and value, handling inline comments
          let key = trimmed.substring(0, equalIndex).trim();
          let value = trimmed.substring(equalIndex + 1).trim();
          
          // Remove inline comments (everything after #)
          const commentIndex = value.indexOf("#");
          if (commentIndex > 0) {
            value = value.substring(0, commentIndex).trim();
          }
          
          // Remove quotes if present
          const cleanValue = value.replace(/^["']|["']$/g, "");

          // Only set if not already in process.env (override: false behavior)
          if (!process.env[key]) {
            process.env[key] = cleanValue;
            loadedEnvKeys.push(key);
          } else {
            console.log(`[handler] Skipped ${key} (already in process.env)`);
          }
        }
      }

      envLoaded = true;
      loadedPath = envPath;
      console.log(`[handler] ✅ Loaded .env file from: ${envPath}`);
      console.log(`[handler] ✅ Loaded ${loadedEnvKeys.length} environment variables from .env`);
      
      // Log which keys were loaded from .env (safe - just keys, not values)
      if (loadedEnvKeys.length > 0) {
        console.log(`[handler] Variables loaded from .env: ${loadedEnvKeys.join(", ")}`);
        
        // Verify critical variables are available
        const criticalVars = ["EXTERNAL_API_URL", "OPENSEARCH_ENDPOINT", "OPENSEARCH_USERNAME", "OPENSEARCH_PASSWORD"];
        const missingVars = criticalVars.filter(v => !process.env[v]);
        if (missingVars.length > 0) {
          console.warn(`[handler] ⚠️ Missing critical variables: ${missingVars.join(", ")}`);
        } else {
          console.log(`[handler] ✅ All critical variables are available`);
        }
      }
      break;
    } catch (error) {
      console.warn(`[handler] Failed to load .env from ${envPath}:`, error.message);
    }
  }
}

if (!envLoaded) {
  // Log warning but don't fail - Lambda env vars from SAM template will still work
  console.warn("[handler] ⚠️ .env file not found in any of these paths:");
  possiblePaths.forEach(p => console.warn(`[handler]   - ${p}`));
  console.warn("[handler] Using Lambda environment variables only");
  
  // Check if critical variables are missing
  const criticalVars = ["EXTERNAL_API_URL", "OPENSEARCH_ENDPOINT"];
  const missingVars = criticalVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error(`[handler] ❌ Missing critical variables: ${missingVars.join(", ")}`);
    console.error(`[handler] This will cause runtime errors!`);
  }
}

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
