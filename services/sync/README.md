# PRMS Sync Service - Cron Job

This service provides a scheduled Lambda function that synchronizes results from an external API to OpenSearch on a configurable schedule using AWS EventBridge.

## Architecture

- **Lambda Function**: `testing-sync-cron` - Executes the sync job
- **EventBridge Rule**: Triggers the Lambda on a schedule (default: every 15 minutes)
- **Dead Letter Queue (DLQ)**: Captures failed invocations for debugging
- **CloudWatch Logs**: Structured logging with 30-day retention

## Local Development

### Prerequisites

- Node.js 20+
- npm
- AWS CLI configured (for testing against AWS resources)
- Environment variables set (see below)

### Setup

1. Install dependencies:
```bash
cd services/sync
npm install
```

2. Create a `.env` file (or load from AWS Secrets Manager):
```bash
# Required environment variables
EXTERNAL_API_URL=https://your-api-url.com
OPENSEARCH_ENDPOINT=https://your-opensearch-endpoint.com
OPENSEARCH_USERNAME=your-username
OPENSEARCH_PASSWORD=your-password
ENVIRONMENT=testing
```

3. Build the cron handler:
```bash
npm run build:cron
```

### Running Locally

#### Option 1: Direct Node execution (for testing)

Create a test script `test-cron.mjs`:
```javascript
import { handler } from './dist-cron/handler.cjs';

const event = {
  job: "sync-cron",
  env: "testing",
  result_type: "knowledge_product"
};

const context = {
  requestId: `test-${Date.now()}`,
  awsRequestId: `test-${Date.now()}`
};

handler(event, context)
  .then(result => {
    console.log("Success:", JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error("Error:", error);
    process.exit(1);
  });
```

Run it:
```bash
node test-cron.mjs
```

#### Option 2: Using SAM Local

1. Install SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

2. Invoke locally:
```bash
sam local invoke SyncCronFunction \
  --event events/test-event.json \
  --env-vars env.json
```

Create `events/test-event.json`:
```json
{
  "job": "sync-cron",
  "env": "testing",
  "result_type": "knowledge_product"
}
```

Create `env.json`:
```json
{
  "SyncCronFunction": {
    "EXTERNAL_API_URL": "https://your-api-url.com",
    "OPENSEARCH_ENDPOINT": "https://your-opensearch-endpoint.com",
    "OPENSEARCH_USERNAME": "your-username",
    "OPENSEARCH_PASSWORD": "your-password",
    "ENVIRONMENT": "testing"
  }
}
```

## Schedule Configuration

The cron job is triggered by AWS EventBridge using a schedule expression. The schedule can be configured via the `ScheduleExpression` parameter in the SAM template.

### Schedule Expression Examples

#### Rate Expressions
- `rate(15 minutes)` - Every 15 minutes (default for testing)
- `rate(1 hour)` - Every hour
- `rate(1 day)` - Once per day
- `rate(2 days)` - Every 2 days

#### Cron Expressions (UTC)
- `cron(0 2 * * ? *)` - Daily at 2:00 AM UTC
- `cron(0 */6 * * ? *)` - Every 6 hours
- `cron(0 0 ? * MON *)` - Every Monday at midnight UTC
- `cron(0 0 1 * ? *)` - First day of every month at midnight UTC

### Updating the Schedule

#### Via SAM CLI:
```bash
sam deploy \
  --stack-name prms-result-functions-testing-sync-cron \
  --parameter-overrides ScheduleExpression="cron(0 2 * * ? *)" \
  --no-confirm-changeset
```

#### Via AWS Console:
1. Navigate to EventBridge → Rules
2. Find the rule: `prms-result-functions-testing-sync-cron-SyncCronFunctionSchedule-*`
3. Edit the schedule expression

## Deployment

### Manual Deployment via SAM CLI

1. Build:
```bash
sam build --template template.yaml
```

2. Deploy:
```bash
sam deploy \
  --stack-name prms-result-functions-testing-sync-cron \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --parameter-overrides \
    Environment=testing \
    ScheduleExpression="rate(15 minutes)" \
    ResultType=knowledge_product
```

### Via Jenkins Pipeline

The Jenkins pipeline automatically:
1. Clones the repository
2. Installs dependencies
3. Builds the cron handler
4. Runs SAM build
5. Deploys the stack immediately (no changeset)

Trigger the pipeline by pushing to the configured branch or manually via Jenkins UI.

## Monitoring

### CloudWatch Logs

View logs:
```bash
aws logs tail /aws/lambda/testing-sync-cron --follow --region us-east-1
```

### Dead Letter Queue

Check for failed invocations:
```bash
aws sqs receive-message \
  --queue-url $(aws cloudformation describe-stacks \
    --stack-name prms-result-functions-testing-sync-cron \
    --query 'Stacks[0].Outputs[?OutputKey==`SyncCronDLQUrl`].OutputValue' \
    --output text) \
  --region us-east-1
```

### Lambda Metrics

Monitor in CloudWatch:
- Invocations
- Duration
- Errors
- Throttles
- Concurrent executions (should be ≤ 1 due to reserved concurrency)

## Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `Environment` | `testing` | Deployment environment |
| `ScheduleExpression` | `rate(15 minutes)` | EventBridge schedule |
| `ResultType` | `knowledge_product` | Result type to sync |

## Job Payload

The Lambda receives the following payload from EventBridge:

```json
{
  "job": "sync-cron",
  "env": "testing",
  "result_type": "knowledge_product"
}
```

Additional filters can be added to the payload in the SAM template's `Events.Schedule.Input` section.

## Troubleshooting

### Job fails immediately
- Check CloudWatch Logs for error details
- Verify environment variables are set correctly
- Ensure IAM role has necessary permissions

### No results synced
- Verify `result_type` parameter matches available types
- Check external API connectivity
- Review OpenSearch endpoint configuration

### Overlapping executions
- Reserved concurrency is set to 1 to prevent overlaps
- If you need parallel execution, implement DynamoDB locking in the job code

### DLQ messages
- Failed invocations are sent to the DLQ
- Investigate the error in CloudWatch Logs
- Retry failed messages if needed

## Security

- **IAM role follows principle of least privilege**: Only permissions required for CloudWatch Logs, Secrets Manager (scoped to specific secret path), and SQS DLQ
- **Secrets stored in AWS Secrets Manager**: No hardcoded credentials in code or configuration
- **Environment variables injected at deployment time**: Loaded from Secrets Manager or SAM parameters
- **Safe logging**: Event payloads are sanitized to prevent logging sensitive data
- **DLQ messages may contain sensitive data**: Handle with care, ensure proper access controls
- **No credentials in repository**: `.env` files are gitignored, only `.env.example` with placeholders is committed

## Support

For issues or questions, contact the PRMS DevOps team or create an issue in the repository.
