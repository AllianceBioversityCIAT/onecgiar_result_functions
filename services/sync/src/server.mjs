import express from "express";
import swaggerUi from "swagger-ui-express";
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
    app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
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
