/**
 * @typedef {Object} EventDetail
 * @property {{bucket: string, key: string}} [s3]
 * @property {any} [payload]
 * @property {string} [idempotencyKey]
 * @property {string} [correlationId]
 * @property {string} [jobId]
 * @property {number} [ts]
 */

/**
 * @typedef {Object} LambdaEvent
 * @property {string} [source]
 * @property {string} [detail-type]
 * @property {EventDetail} [detail]
 */

/**
 * @typedef {Object} ResultData
 * @property {string} [tenant]
 * @property {string} type
 * @property {string} [op]
 * @property {string} [jobId]
 * @property {string} received_at
 * @property {string} idempotencyKey
 */

/**
 * @typedef {ResultData} ProcessedResult
 * @property {{result_type_id: number, result_level_id: number}} data
 * @property {number} [result_id]
 * @property {number} [result_code]
 */

/**
 * @typedef {Object} ExternalApiResponse
 * @property {any} [response]
 * @property {number} [status]
 * @property {number} [statusCode]
 * @property {string} [message]
 */

/**
 * @typedef {Object} ProcessingResult
 * @property {boolean} success
 * @property {ProcessedResult} [result]
 * @property {string} [error]
 * @property {boolean} [externalSuccess]
 * @property {string} [externalError]
 * @property {ExternalApiResponse} [externalApiResponse]
 * @property {any} [opensearchResponse]
 */

export const Types = {}; // Export for consistency
