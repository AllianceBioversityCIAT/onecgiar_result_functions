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
import { resolveLastUpdatedWindowUtc } from "./utils/cron-date-window.mjs";
import { runSyncOpenSearchByResultType } from "./utils/sync-opensearch-by-result-type.mjs";

const logger = new Logger("CronHandler");

/**
 * @param {Record<string, unknown>} payload
 */
function shouldOrchestrateAllBilateralTypes(payload) {
  if (payload.orchestrate_bilateral_types === false) return false;
  if (payload.orchestrate_bilateral_types === true) return true;
  return !payload.result_type;
}

/**
 * Removes cron-only fields before calling runSyncJob / API filters.
 * @param {Record<string, unknown>} payload
 */
function stripCronMeta(payload) {
  const {
    job: _job,
    orchestrate_bilateral_types: _orch,
    sync_utc_day: _day,
    ...rest
  } = payload;
  return rest;
}

/**
 * Merges resolved date window and drops empty / no-op filter values.
 * @param {Record<string, unknown>} rest
 * @param {{ last_updated_from: string, last_updated_to: string }} window
 */
function prepareSyncFilters(rest, window) {
  const merged = {
    ...rest,
    last_updated_from: window.last_updated_from,
    last_updated_to: window.last_updated_to,
  };
  if (merged.phase_year === 0 || merged.phase_year === "0") {
    delete merged.phase_year;
  }
  if (merged.portfolio === "" || merged.portfolio === undefined) {
    delete merged.portfolio;
  }
  if (merged.status === "" || merged.status === undefined) {
    delete merged.status;
  }
  const sf = { ...merged };
  for (const k of ["created_from", "created_to", "last_updated_from", "last_updated_to"]) {
    if (sf[k] === "") delete sf[k];
  }
  return sf;
}

/**
 * Lambda handler for EventBridge Scheduler
 * @param {Object} event - EventBridge event payload
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Response object
 */
export const handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = context?.requestId || context?.awsRequestId || `cron-${Date.now()}`;

  // Log raw event structure for debugging (safe - no sensitive data)
  logger.info("=== CRON JOB START ===", requestId, {
    job: "sync-cron",
    eventType: typeof event,
    eventIsString: typeof event === "string",
    eventIsObject: typeof event === "object" && event !== null,
    eventKeys: event && typeof event === "object" ? Object.keys(event).slice(0, 10) : [],
    timestamp: new Date().toISOString(),
    requestId,
  });

  try {
    // Extract payload from EventBridge Rule
    // EventBridge Rules send Input in different formats:
    // 1. Directly as object: event = { job: "...", env: "..." }
    // 2. As string JSON: event = "{\"job\":\"...\",\"env\":\"...\"}"
    // 3. Wrapped in detail: event.detail = { ... }
    let payload = {};

    // Try to parse if it's a string (EventBridge sometimes sends Input as JSON string)
    if (typeof event === "string") {
      try {
        payload = JSON.parse(event);
      } catch (e) {
        logger.warn("Failed to parse event as JSON string, using as-is", requestId);
        payload = {};
      }
    } else if (event && typeof event === "object") {
      // Check if Input is in event.detail (some EventBridge formats)
      if (event.detail) {
        payload = event.detail;
      } else if (event.payload) {
        // EventBridge Scheduler format
        payload = event.payload;
      } else {
        // Input is directly in event object
        payload = event;
      }
    }

    // Extract values with defaults
    const env = payload.env || process.env.ENVIRONMENT || "testing";
    const jobType = payload.job || "sync-cron";

    const window = resolveLastUpdatedWindowUtc(
      typeof payload === "object" && payload !== null
        ? /** @type {Record<string, string | undefined>} */ (payload)
        : {}
    );

    // Log the actual event structure for debugging
    logger.info("Event structure", requestId, {
      eventType: typeof event,
      hasDetail: !!event?.detail,
      hasPayload: !!event?.payload,
      eventKeys: event && typeof event === "object" ? Object.keys(event).slice(0, 10) : [],
    });

    const sanitizedPayload = {
      job: payload.job,
      env: payload.env,
      result_type: payload.result_type,
      orchestrate_bilateral_types: payload.orchestrate_bilateral_types,
      page: payload.page,
      limit: payload.limit,
    };

    logger.info("Processing cron job", requestId, {
      jobType,
      env,
      lastUpdatedWindow: window,
      payload: sanitizedPayload,
    });

    const baseStripped = stripCronMeta(payload);
    const syncFilters = prepareSyncFilters(baseStripped, window);

    let result;

    if (shouldOrchestrateAllBilateralTypes(payload)) {
      logger.info(
        "Orchestrating bilateral sync via GET /sync per result_type (sync-opensearch-by-result-type)",
        requestId,
        {}
      );

      result = await runSyncOpenSearchByResultType({
        payload,
        requestId,
      });
    } else {
      const resultType =
        payload.result_type || process.env.RESULT_TYPE || "knowledge_product";

      result = await runSyncJob({
        env,
        requestId,
        ...syncFilters,
        result_type: resultType,
      });
    }

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
