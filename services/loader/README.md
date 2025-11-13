# PRMS Results Loader Service

This service processes research results coming from the Fetcher/Normalizer, enriches them with external information, and stores them in OpenSearch.

## 🏗️ Architecture

### Processing Flow

1. **Data Reception**: Receives EventBridge events with data from S3 or direct payload
2. **Enrichment**: Adds fixed fields (`result_type_id: 6`, `result_level_id: 4`)
3. **External API**: Sends each result individually to the external endpoint
4. **External Enrichment**: Takes `id` and `result_code` from external response
5. **OpenSearch**: Indexes the enriched results
6. **S3**: Maintains backup copy of processed results
7. **Logging**: Records the status of each processed result

### Folder Structure

```
src/
├── types.ts                    # TypeScript interfaces
├── handler.ts                  # Main Lambda handler
├── clients/                    # Clients for external services
│   ├── external-api.ts        # External API client
│   └── opensearch.ts          # REST client for OpenSearch
├── processors/                # Processors by result type
│   ├── factory.ts            # Factory to create processors
│   └── knowledge-product/    # Specific processor for KP
│       └── processor.ts
└── utils/                     # Shared utilities
    ├── logger.ts             # Logging system
    └── s3.ts                 # S3 utilities
```

## 🚀 Configuration

### Environment Variables

```bash
# AWS
AWS_REGION=us-east-1
S3_BUCKET=prms-results-bucket

# OpenSearch
OPENSEARCH_ENDPOINT=https://your-domain.us-east-1.es.amazonaws.com
OPENSEARCH_USERNAME=admin
OPENSEARCH_PASSWORD=your-password

# External API
EXTERNAL_API_URL=https://api.example.com/results

# Processing configuration
BATCH_SIZE=10
```

### Installation

```bash
npm install
npm run build
```

## 📊 Supported Result Types

### Knowledge Products (`knowledge_product`, `kp`)

- **Fixed Fields**: `result_type_id: 6`, `result_level_id: 4`
- **Processor**: `KnowledgeProductProcessor`
- **OpenSearch Index**: `prms-results-management-api`

### Extensibility

To add new result types:

1. **Create Processor**: Implement `ProcessorInterface` in `processors/[type]/processor.ts`
2. **Register in Factory**: Add the type in `ProcessorFactory`
3. **Create Folder**: Follow the `processors/[type]/` structure

Example:

```typescript
// processors/innovation-development/processor.ts
export class InnovationDevelopmentProcessor implements ProcessorInterface {
  async process(result: ResultData): Promise<ProcessingResult> {
    const enrichedResult = {
      ...result,
      result_type_id: 7, // Specific ID for Innovation Development
      result_level_id: 3,
    };
    // ... rest of the logic
  }
}
```

## 🔄 External API

### Sending Format

The service sends each result individually:

```json
{
  "tenant": "star",
  "type": "knowledge_product",
  "op": "create",
  "result_type_id": 6,
  "result_level_id": 4,
  "received_at": "2025-10-14T10:00:00Z",
  "idempotencyKey": "star:knowledge_product:create:12345"
  // ... rest of result data
}
```

### Expected Response Format

```json
{
  "response": {
    "results": [
      {
        "id": 1,
        "result_code": 4500
      }
    ]
  },
  "message": "Results created successfully.",
  "status": 201
}
```

### Enrichment

The `id` and `result_code` fields from the response are added to the result as:

- `result_id`: ID of the result in the external system
- `result_code`: Result code

## 🔍 OpenSearch

### Indexes

All processed results are stored in a single OpenSearch index so they can be queried together:

- Primary index: `prms-results-management-api`
- Alias (for backwards compatibility): `prms-results-management-api`

### Document Structure

```json
{
  "tenant": "star",
  "type": "knowledge_product",
  "result_type_id": 6,
  "result_level_id": 4,
  "result_id": 1,
  "result_code": 4500,
  "indexed_at": "2025-10-14T10:05:00Z",
  "tenant_type": "star_knowledge_product",
  "has_external_id": true
  // ... original result data
}
```

## 📝 Logging

### Log Levels

- **INFO**: General processing information
- **SUCCESS**: Successfully processed results
- **WARN**: Warnings (e.g.: External API failed but continued)
- **ERROR**: Errors that prevent processing

### Log Examples

```
[2025-10-14T10:00:00Z] INFO Handler started
[2025-10-14T10:00:01Z] INFO Processing 5 results
[2025-10-14T10:00:02Z] INFO [abc123] Starting knowledge product processing
[2025-10-14T10:00:03Z] SUCCESS [abc123] Knowledge product processed successfully
[2025-10-14T10:00:05Z] INFO Batch processing completed
```

## 🎯 Handler Response

```json
{
  "ok": true,
  "message": "All results processed successfully",
  "processed": 5,
  "successful": 5,
  "failed": 0,
  "processingTimeMs": 2500,
  "logs": {
    "total": 15,
    "byLevel": {
      "INFO": 8,
      "SUCCESS": 5,
      "WARN": 1,
      "ERROR": 1
    }
  },
  "correlationId": "abc-123-def",
  "timestamp": "2025-10-14T10:00:05Z"
}
```

## 🛠️ Development

### Build

```bash
npm run build
```

### Deploy (using main project scripts)

```bash
# From project root
./scripts/build-zip.sh loader
./scripts/deploy-lambda.sh loader
```

## 🚨 Error Handling

### Resilience Strategies

1. **External API Fails**: Continues without external enrichment
2. **OpenSearch Fails**: Error is logged but doesn't stop processing
3. **Unsupported Type**: Marked as error and continues with others
4. **Batch Processing**: One result failure doesn't affect others

### Monitoring

- All errors are logged with details
- Success/failure metrics by result type
- Processing time per batch
- External service connection status
