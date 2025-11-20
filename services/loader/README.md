# PRMS Results Loader Service

This service processes research results coming from the Fetcher/Normalizer, enriches them with external information, and stores them in OpenSearch.

## 🏗️ Architecture

### Processing Flow

1. **Data Reception**: Receives EventBridge events with data from S3 or direct payload
2. **Processor Selection**: Routes to specific processor based on result type
3. **Enrichment**: Adds fixed fields (result_type_id, result_level_id)
4. **External API**: Sends each result individually to the external endpoint
5. **External Enrichment**: Takes `id` and `result_code` from external response
6. **OpenSearch**: Indexes the enriched results
7. **S3**: Maintains backup copy of processed results
8. **Logging**: Records the status of each processed result

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
│   ├── capacity-sharing/     # Capacity Sharing processor
│   ├── innovation-development/ # Innovation Development processor
│   ├── innovation-use/       # Innovation Use processor
│   ├── knowledge-product/    # Knowledge Product processor
│   ├── other-outcome/        # Other Outcome processor
│   ├── other-output/         # Other Output processor
│   └── policy-change/        # Policy Change processor
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

The service supports **7 result types**, each with its own processor and configuration:

### 1. Policy Change (`policy_change`, `pc`)

- **Fixed Fields**: `result_type_id: 1`, `result_level_id: 4`
- **Processor**: `PolicyChangeProcessor`
- **Features**: Policy type validation, implementing organizations, policy stages
- **OpenSearch Index**: `policy_change`

### 2. Other Outcome (`other_outcome`, `oc`)

- **Fixed Fields**: `result_type_id: 2`, `result_level_id: 4`
- **Processor**: `OtherOutcomeProcessor`
- **Features**: General outcome tracking
- **OpenSearch Index**: `other_outcome`

### 3. Capacity Sharing (`capacity_sharing`, `cs`)

- **Fixed Fields**: `result_type_id: 3`, `result_level_id: 4`
- **Processor**: `CapacitySharingProcessor`
- **Features**: Training metrics, delivery methods, gender disaggregation
- **OpenSearch Index**: `capacity_sharing`

### 4. Innovation Use (`innovation_use`, `iu`)

- **Fixed Fields**: `result_type_id: 4`, `result_level_id: 4`
- **Processor**: `InnovationUseProcessor`
- **Features**: Actor tracking, organization tracking, measures
- **OpenSearch Index**: `innovation_use`

### 5. Knowledge Product (`knowledge_product`, `kp`)

- **Fixed Fields**: `result_type_id: 6`, `result_level_id: 4`
- **Processor**: `KnowledgeProductProcessor`
- **Features**: Handle tracking, metadata, peer review status
- **OpenSearch Index**: `knowledge_product`

### 6. Innovation Development (`innovation_development`, `id`)

- **Fixed Fields**: `result_type_id: 7`, `result_level_id: 4`
- **Processor**: `InnovationDevelopmentProcessor`
- **Features**: Innovation typology, readiness level, developers
- **OpenSearch Index**: `innovation_development`

### 7. Other Output (`other_output`, `oo`)

- **Fixed Fields**: `result_type_id: 8`, `result_level_id: 4`
- **Processor**: `OtherOutputProcessor`
- **Features**: General output tracking
- **OpenSearch Index**: `other_output`

## 🎯 Result Type ID Reference

| Result Type            | Alias | Type ID | Level ID | Processor                    |
|------------------------|-------|---------|----------|------------------------------|
| policy_change          | pc    | 1       | 3        | PolicyChangeProcessor        |
| innovation_use         | iu    | 2       | 3        | InnovationUseProcessor       |
| capacity_sharing       | cs    | 3       | 4        | CapacitySharingProcessor     |
| other_outcome          | oc    | 4       | 3        | OtherOutcomeProcessor        |
| knowledge_product      | kp    | 6       | 4        | KnowledgeProductProcessor    |
| innovation_development | id    | 7       | 4        | InnovationDevelopmentProcessor |
| other_output           | oo    | 8       | 4        | OtherOutputProcessor         |

## 🔧 Extensibility

### Adding New Result Types

To add a new result type:

1. **Create Processor**: Implement `ProcessorInterface` in `processors/[type]/processor.ts`
2. **Register in Factory**: Add the type in `ProcessorFactory.getProcessor()`
3. **Update getSupportedTypes()**: Add type and alias to the list
4. **Create Folder**: Follow the `processors/[type]/` structure

Example:

```typescript
// processors/new-type/processor.ts
import {
  ResultData,
  ProcessedResult,
  ProcessingResult,
  ProcessorInterface,
} from "../../types.js";
import { ExternalApiClient } from "../../clients/external-api.js";
import { OpenSearchClient } from "../../clients/opensearch.js";
import { Logger } from "../../utils/logger.js";

export class NewTypeProcessor implements ProcessorInterface {
  private externalApiClient: ExternalApiClient;
  private openSearchClient: OpenSearchClient;
  private logger: Logger;

  constructor(logger: Logger) {
    this.externalApiClient = new ExternalApiClient();
    this.openSearchClient = new OpenSearchClient();
    this.logger = logger;
  }

  async process(result: ResultData): Promise<ProcessingResult> {
    const resultId = result.idempotencyKey;

    try {
      this.logger.info("Starting new type processing", resultId);

      // Normalize lead_center
      const normalizedLeadCenter = (() => {
        const lc = (result as any).lead_center;
        if (!lc) return undefined;
        if (typeof lc === "string") return lc;
        if (typeof lc === "object") {
          return (
            lc.acronym ||
            lc.name ||
            (lc.institution_id ? `INST-${lc.institution_id}` : undefined)
          );
        }
        return undefined;
      })();

      const resultForEnrichment = {
        ...result,
        lead_center: normalizedLeadCenter,
      } as ResultData;

      // Add fixed fields
      const enrichedResult = this.enrichWithFixedFields(resultForEnrichment);

      // Call external API
      this.logger.info("Sending to external API", resultId);
      const {
        enriched: externallyEnrichedResult,
        apiResponse: externalApiResponse,
        success: externalSuccess = true,
        error: externalError,
      } = await this.externalApiClient.enrichResult(enrichedResult);

      if (!externalSuccess) {
        const message = externalError || "External API failed";
        this.logger.error(message, resultId);
        return { success: false, error: message };
      }

      // Index in OpenSearch
      await this.openSearchClient.ensureIndex(result.type);
      this.logger.info("Indexing in OpenSearch", resultId);
      
      const indexDoc = {
        ...externallyEnrichedResult,
        external_api_raw: externalApiResponse ?? null,
        input_raw: result,
      };

      const opensearchResponse = await this.openSearchClient.indexResult(
        indexDoc
      );

      this.logger.success("Processed successfully", resultId);

      return {
        success: true,
        result: externallyEnrichedResult,
        externalApiResponse,
        opensearchResponse,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error("Processing failed", resultId, error);

      return { success: false, error: errorMessage };
    }
  }

  private enrichWithFixedFields(result: ResultData): ProcessedResult {
    const enriched = { ...result };
    enriched.data = {
      ...(enriched.data || {}),
      result_type_id: 9, // Assign next available ID
      result_level_id: 4,
    };
    return enriched as ProcessedResult;
  }

  async processBatch(
    results: ResultData[],
    concurrency = 5
  ): Promise<ProcessingResult[]> {
    // ... batch processing logic
  }
}

// Then update factory.ts:
import { NewTypeProcessor } from "./new-type/processor.js";

// In getProcessor():
case "newtype":
case "nt":
  return new NewTypeProcessor(this.logger);

// In getSupportedTypes():
return [
  // ... existing types
  "new_type",
  "nt",
];
```

## 🔄 External API

### Sending Format

The service sends each result individually:

```json
{
  "tenant": "MEL",
  "type": "knowledge_product",
  "op": "create",
  "result_type_id": 6,
  "result_level_id": 4,
  "received_at": "2025-11-19T10:00:00Z",
  "idempotencyKey": "MEL:knowledge_product:create:12345"
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

Each result type is stored in its own OpenSearch index for better organization:

- `policy_change`
- `other_outcome`
- `capacity_sharing`
- `innovation_use`
- `knowledge_product`
- `innovation_development`
- `other_output`

### Document Structure

```json
{
  "tenant": "MEL",
  "type": "knowledge_product",
  "result_type_id": 6,
  "result_level_id": 4,
  "result_id": 1,
  "result_code": 4500,
  "indexed_at": "2025-11-19T10:05:00Z",
  "tenant_type": "MEL_knowledge_product",
  "has_external_id": true,
  "external_api_raw": { /* raw API response */ },
  "input_raw": { /* original input */ }
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
[2025-11-19T10:00:00Z] INFO Handler started
[2025-11-19T10:00:01Z] INFO Processing 5 results of type: knowledge_product
[2025-11-19T10:00:02Z] INFO [abc123] Starting knowledge product processing
[2025-11-19T10:00:03Z] SUCCESS [abc123] Knowledge product processed successfully
[2025-11-19T10:00:05Z] INFO Batch processing completed
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
  "timestamp": "2025-11-19T10:00:05Z"
}
```

## 🛠️ Development

### Build

```bash
npm run build
```

This will:
1. Compile TypeScript to JavaScript
2. Bundle with esbuild
3. Generate `dist/handler.js` (1.7mb)

### Local Testing

```bash
# Test with sample data
node test-local.mjs

# Test OpenSearch connection
node test-opensearch.mjs
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

## 🧪 Testing

### Unit Tests

Run processor tests:

```bash
cd services/loader
npm run build
node test-processors.mjs
```

### Integration Tests

Test with EventBridge events:

```json
{
  "source": "prms.fetcher",
  "detail-type": "create",
  "detail": {
    "tenant": "MEL",
    "type": "knowledge_product",
    "s3": {
      "bucket": "prms-results-bucket",
      "key": "results/2025/11/19/batch-123.json"
    },
    "correlationId": "abc-123-def",
    "result_index": 0
  }
}
```

## 📊 Performance

### Batch Processing

- Default batch size: 10 results
- Configurable via `BATCH_SIZE` environment variable
- Concurrent processing within batches
- Prevents memory issues with large datasets

### Optimization Tips

1. **Adjust Batch Size**: Increase for faster processing, decrease for memory constraints
2. **Lambda Memory**: Recommended 512 MB minimum
3. **Lambda Timeout**: Set to 30 seconds minimum
4. **Concurrent Execution**: Monitor and adjust based on downstream API limits

## 🔐 Security

### IAM Permissions Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::prms-results-bucket/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

### Secrets Management

Store sensitive data in AWS Secrets Manager or Parameter Store:

```bash
OPENSEARCH_PASSWORD=/prms/loader/opensearch_password
EXTERNAL_API_KEY=/prms/loader/api_key
```

## 📈 Metrics

### CloudWatch Metrics

- `ProcessedResults`: Total results processed
- `SuccessfulResults`: Successfully processed
- `FailedResults`: Failed processing
- `ProcessingTimeMs`: Average processing time
- `ExternalAPICallDuration`: External API response time
- `OpenSearchIndexDuration`: OpenSearch indexing time

### Alarms

Recommended CloudWatch Alarms:

1. **High Error Rate**: Failed results > 10%
2. **Long Processing Time**: Average > 5 seconds
3. **External API Failures**: API errors > 20%
4. **OpenSearch Connection Errors**: Connection failures > 5

## 🔄 Recent Updates

### Version 1.2.0 (2025-11-19)

**New Features:**
- ✅ Added Policy Change processor (type_id: 1)
- ✅ Added Other Outcome processor (type_id: 2)
- ✅ Added Innovation Use processor (type_id: 4)

**Improvements:**
- Updated factory to support 7 result types
- Enhanced error handling for unsupported types
- Improved logging with result type context

**Documentation:**
- Complete processor implementation guide
- Result type ID reference table
- Extended examples for all types

See `CHANGELOG_NEW_TYPES.md` for detailed changes.

---

**Version**: 1.2.0  
**Last Updated**: 2025-11-19  
**Node Version**: 20+  
**TypeScript Version**: 5.0+
