import express from "express";
import { Logger } from "./utils/logger.mjs";
import { SyncController } from "./controllers/sync.mjs";
import { swaggerDocument } from "./docs/swagger.mjs";

const logger = new Logger("Server");

export function createApp() {
    const app = express();

    // Middleware
    app.use(express.json());

    // Adding logging middleware
    app.use((req, res, next) => {
        logger.info(`[Incoming Request] ${req.method} ${req.url}`);
        next();
    });

    const syncController = new SyncController();

    // Routes
    app.get("/openapi.json", (_req, res) => res.json(swaggerDocument));

    const swaggerHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sync Service API</title>
      <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui.css" />
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-bundle.js"></script>
      <script>
        SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIBundle.presets.standalone
          ]
        });
      </script>
    </body>
    </html>`;

    app.get("/docs", (_req, res) => res.send(swaggerHtml));
    app.get("/sync", (req, res) => syncController.syncResults(req, res));
    app.get("/api/sync", (req, res) => syncController.syncResults(req, res));

    // Health check endpoint
    app.get("/health", (req, res) => {
        res.status(200).json({ status: "ok", service: "@prms/sync" });
    });

    // Global Error Handler
    app.use((err, req, res, next) => {
        logger.error("Unhandled Error:", err);
        res.status(500).json({
            error: "Internal Server Error",
            message: err.message || "Something went wrong",
        });
    });

    return app;
}
