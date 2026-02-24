export const swaggerDocument = {
    openapi: "3.0.0",
    info: {
        title: "Sync Service API",
        version: "1.0.0",
        description: "API for synchronizing results from the bilateral external API to OpenSearch",
    },
    servers: [
        {
            url: "/",
            description: "Current Server",
        },
    ],
    paths: {
        "/sync": {
            get: {
                summary: "Synchronize results to OpenSearch",
                description: "Fetches results from the external bilateral API and indexes them into OpenSearch dynamically based on the requested `result_type`.",
                tags: ["Sync"],
                parameters: [
                    {
                        name: "result_type",
                        in: "query",
                        required: true,
                        schema: {
                            type: "string",
                            enum: [
                                "Policy change",
                                "Innovation use",
                                "Other outcome",
                                "Capacity sharing for development",
                                "Knowledge product",
                                "Innovation development",
                                "Other output",
                                "Impact contribution",
                                "Innovation Package"
                            ]
                        },
                        description: "Result type name (MANDATORY for OpenSearch index mapping)",
                        example: "Knowledge product"
                    },
                    {
                        name: "page",
                        in: "query",
                        required: false,
                        schema: { type: "integer" },
                        description: "If omitted, the service fetches all pages from the external API and syncs every result. If provided, only that page is fetched and synced (e.g. for UI pagination)."
                    },
                    {
                        name: "limit",
                        in: "query",
                        required: false,
                        schema: { type: "integer", default: 100 },
                        description: "Page size for the external API. When fetching all pages, used as the size of each request (max 500). When using a single page, this is the number of items for that page."
                    },
                    {
                        name: "source",
                        in: "query",
                        required: false,
                        schema: { type: "string", enum: ["Result", "API"] },
                        description: "Result (W1/W2) or API (W3/Bilateral)"
                    },
                    {
                        name: "portfolio",
                        in: "query",
                        required: false,
                        schema: { type: "string" },
                        description: "Portfolio acronym (e.g. P22, P25)",
                        example: "P22"
                    },
                    {
                        name: "phase_year",
                        in: "query",
                        required: false,
                        schema: { type: "integer" },
                        description: "Phase year (version.phase_year)",
                        example: 2025
                    },
                    {
                        name: "status_id",
                        in: "query",
                        required: false,
                        schema: { type: "integer" },
                        description: "Result status ID (1–7)"
                    },
                    {
                        name: "status",
                        in: "query",
                        required: false,
                        schema: {
                            type: "string",
                            enum: [
                                "Editing",
                                "Quality Assessed",
                                "Submitted",
                                "Discontinued",
                                "Pending Review",
                                "Approved",
                                "Rejected"
                            ]
                        },
                        description: "Result status name",
                        example: "Pending Review"
                    },
                    {
                        name: "last_updated_from",
                        in: "query",
                        required: false,
                        schema: { type: "string", format: "date" },
                        example: "2026-01-01"
                    },
                    {
                        name: "last_updated_to",
                        in: "query",
                        required: false,
                        schema: { type: "string", format: "date" },
                        example: "2026-01-02"
                    },
                    {
                        name: "created_from",
                        in: "query",
                        required: false,
                        schema: { type: "string", format: "date" },
                        example: "2026-01-01"
                    },
                    {
                        name: "created_to",
                        in: "query",
                        required: false,
                        schema: { type: "string", format: "date" },
                        example: "2026-01-02"
                    },
                    {
                        name: "center",
                        in: "query",
                        required: false,
                        schema: { type: "string" },
                        description: "Leading center id (code) or acronym"
                    },
                    {
                        name: "initiative_lead_code",
                        in: "query",
                        required: false,
                        schema: { type: "string" },
                        description: "Initiative official_code: results where this initiative is the lead (role 1)"
                    },
                    {
                        name: "search",
                        in: "query",
                        required: false,
                        schema: { type: "string" },
                        description: "Search in result title"
                    }
                ],
                responses: {
                    "200": {
                        description: "Sync process completed successfully",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        message: { type: "string" },
                                        stats: {
                                            type: "object",
                                            properties: {
                                                fetched: { type: "integer" },
                                                successfullyIndexed: { type: "integer" },
                                                failedToIndex: { type: "integer" }
                                            }
                                        },
                                        meta: { type: "object" },
                                        results: { type: "array" }
                                    }
                                }
                            }
                        }
                    },
                    "400": {
                        description: "Bad Request - Missing mandatory parameters"
                    },
                    "500": {
                        description: "Internal Server Error"
                    }
                }
            }
        }
    }
};
