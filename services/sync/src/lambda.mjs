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
console.log("[lambda] Initializing env loader...");
console.log(`[lambda] __dirname: ${__dirname}`);
console.log(`[lambda] process.cwd(): ${process.cwd()}`);

// Try multiple possible paths for .env file
// SAM packages CodeUri: services/sync/, so .env should be at root of package
const possiblePaths = [
    resolve(__dirname, "../.env"),        // From dist/ to root (most likely)
    resolve(__dirname, "../../.env"),      // If nested deeper
    join(process.cwd(), ".env"),          // From Lambda task root (/var/task/.env)
    resolve(process.cwd(), ".env"),       // Absolute from cwd
    "/var/task/.env",                      // Direct Lambda path
];

let envLoaded = false;
const loadedEnvKeys = []; // Track which keys we loaded from .env

for (const envPath of possiblePaths) {
    if (existsSync(envPath)) {
        try {
            console.log(`[lambda] Found .env at: ${envPath}`);
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
                    }
                }
            }

            envLoaded = true;
            console.log(`[lambda] ✅ Loaded .env file from: ${envPath}`);
            console.log(`[lambda] ✅ Loaded ${loadedEnvKeys.length} environment variables from .env`);

            // Log which keys were loaded from .env (safe - just keys, not values)
            if (loadedEnvKeys.length > 0) {
                console.log(`[lambda] Variables loaded from .env: ${loadedEnvKeys.join(", ")}`);

                // Verify critical variables are available
                const criticalVars = ["EXTERNAL_API_URL", "OPENSEARCH_ENDPOINT", "OPENSEARCH_USERNAME", "OPENSEARCH_PASSWORD"];
                const missingVars = criticalVars.filter(v => !process.env[v]);
                if (missingVars.length > 0) {
                    console.warn(`[lambda] ⚠️ Missing critical variables: ${missingVars.join(", ")}`);
                } else {
                    console.log(`[lambda] ✅ All critical variables are available`);
                }
            }
            break;
        } catch (error) {
            console.warn(`[lambda] Failed to load .env from ${envPath}:`, error.message);
        }
    }
}

if (!envLoaded) {
    // Log warning but don't fail - Lambda env vars from SAM template will still work
    console.warn("[lambda] ⚠️ .env file not found in any of these paths:");
    possiblePaths.forEach(p => console.warn(`[lambda]   - ${p}`));
    console.warn("[lambda] Using Lambda environment variables only");

    // Check if critical variables are missing
    const criticalVars = ["EXTERNAL_API_URL", "OPENSEARCH_ENDPOINT"];
    const missingVars = criticalVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
        console.error(`[lambda] ❌ Missing critical variables: ${missingVars.join(", ")}`);
        console.error(`[lambda] This will cause runtime errors!`);
    }
}

import serverlessExpress from "@vendia/serverless-express";
import { createApp } from "./server.mjs";

const app = createApp();

export const handler = serverlessExpress({ app });

