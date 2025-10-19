# PRMS Normalizer Service - MVP v1.0

🚀 **PRMS Results Normalization and Validation Service**

This AWS Lambda service validates, normalizes and publishes research results to EventBridge for the CGIAR PRMS (Performance and Results Management System).

## 📋 Features

- ✅ **Robust validation** with JSON Schema and AJV
- 🔄 **Data normalization** of input data
- 📤 **Automatic publishing** to AWS EventBridge
- 📊 **API documentation** with Swagger UI
- 🏗️ **Serverless architecture** optimized for AWS Lambda
- 🎯 **Initial support** for Knowledge Products

## 🌐 Available Endpoints

### Core API

- **`POST /ingest`** - Ingest and process research results
- **`GET /health`** - Service health check

### Documentation

- **`GET /docs`** - Swagger UI interface (recommended)
- **`GET /openapi.json`** - OpenAPI specification in JSON

## 🗂️ Supported Result Types

### Knowledge Products

Knowledge products such as research articles, reports, policy briefs, etc.

**Required fields:**

- User information (`submitted_by`)
- Lead center (`lead_center`)
- Title and description
- TOC mapping (`toc_mapping`)
- Geographic focus (`geo_focus`)
- Contributing centers and partners
- Supporting evidence
- Contributing bilateral projects
- Knowledge product specific metadata

## 📖 Data Structure

### Ingestion Request

```json
{
  "tenant": "MEL",
  "op": "create|update|delete",
  "results": [
    {
      "type": "knowledge_product",
      "data": {
        // Campos comunes
        "submitted_by": {
          "email": "user@example.org",
          "name": "John Doe",
          "comment": "Optional comment",
          "submitted_date": "2025-10-09T15:30:00Z"
        },
        "lead_center": { "acronym": "CIAT" },
        "title": "Research title",
        "description": "Research description",
        "toc_mapping": [
          {
            "science_program_id": "SP12",
            "aow_compose_code": "SP12-AOW01",
            "result_title": "Result title",
            "result_indicator_description": "Indicator description",
            "result_indicator_type_name": "# Of Knowledge Products"
          }
        ],
        "geo_focus": {
          "scope_code": 2,
          "scope_label": "Regional",
          "regions": [{ "um49code": 145, "name": "Sub-Saharan Africa" }]
        },
        "contributing_center": [
          {
            "institution_id": 1279,
            "name": "ICARDA",
            "acronym": "ICARDA",
            "code": "CENTER-07"
          }
        ],
        "contributing_partners": [
          {
            "institution_id": 1,
            "acronym": "WUR",
            "name": "Wageningen University"
          }
        ],
        "evidence": [
          {
            "link": "https://example.org/paper-123",
            "description": "Peer-reviewed article"
          }
        ],
        "contributing_bilateral_projects": [
          {
            "grant_title": "Seed Innovation Window"
          }
        ],

        // Campos específicos de Knowledge Product
        "knowledge_product": {
          "handle": "hdl:20.500.12345/abc-2025",
          "knowledge_product_type": "Journal Article",
          "metadataCG": {
            "source": "CGSpace",
            "accessibility": true
          },
          "licence": "CC-BY 4.0",
          "keywords": ["seed adoption", "drylands"],
          "agrovoc_keywords": ["Wheat", "Climate adaptation"]
        }
      }
    }
  ]
}
```

### Successful Response (202)

```json
{
  "ok": true,
  "status": "accepted",
  "acceptedCount": 1,
  "rejectedCount": 0,
  "failedCount": 0,
  "eventIds": ["12345678-1234-1234-1234-123456789abc"],
  "rejected": [],
  "failed": [],
  "requestId": "abc123"
}
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │────│  Lambda Handler  │────│   EventBridge   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   S3 (offload)   │
                       └──────────────────┘
```

### Components

- **API Gateway**: HTTP/REST entry point
- **Lambda Handler**: Serverless processing
- **AJV Validator**: JSON schema validation
- **EventBridge**: Event publishing
- **S3**: Storage for large payloads (>256KB)

## 🚀 Deployment

### Prerequisites

- Node.js 20+
- AWS CLI configured
- AWS Lambda, EventBridge and S3 permissions

### Build

```bash
npm install
npm run build  # Genera dist/lambda.cjs
npm run zip    # Crea normalizer.zip
```

### AWS Lambda Configuration

1. **Runtime**: Node.js 20.x
2. **Handler**: `lambda.handler`
3. **Memory**: 512 MB (recommended)
4. **Timeout**: 30 seconds
5. **Environment Variables**:
   - `EVENT_BUS`: EventBridge bus name (default: `prms-ingestion-bus`)
   - `DEFAULT_OP`: Default operation (default: `create`)

### API Gateway Configuration

Create endpoints with **Lambda Proxy Integration**:

- `POST /ingest` → Lambda Function
- `ANY /` → Lambda Function (for docs and health)

## 🧪 Testing

### Health Check

```bash
curl https://your-api-url/health
```

### Data Ingestion

```bash
curl -X POST https://your-api-url/ingest \
  -H "Content-Type: application/json" \
  -d @sample-data.json
```

### API Documentation

Visit: `https://your-api-url/docs`

## 🔧 Validation Configuration

### Field Flexibility

The system allows flexibility in several required fields:

- **`geo_focus`**: Requires `scope_code` OR `scope_label`
- **`contributing_center`**: Requires at least one of: `institution_id`, `name`, `acronym`, `code`
- **`contributing_partners`**: Requires at least one of: `institution_id`, `acronym`, `name`

### Custom Validations

- **`maxWords`**: Custom validation for maximum word count
- **Email format**: Email format validation
- **URI format**: Valid link validation

## 📊 Monitoring

### CloudWatch Logs

- Detailed validation errors
- Performance metrics
- Request traceability

### Key Metrics

- Validation success rate
- Processing time
- Data volume processed
- EventBridge errors

## 🗺️ Roadmap

### v1.1 (Next)

- [ ] Support for more result types
- [ ] Authentication and authorization
- [ ] Rate limiting
- [ ] More detailed metrics

### v1.2 (Future)

- [ ] Improved batch processing
- [ ] Retry logic for EventBridge
- [ ] Notification webhooks
- [ ] Monitoring dashboard

## 🤝 Contributing

### Local Development

```bash
git clone <repository>
cd fetcher
npm install
npm run build
```

### Project Structure

```
src/
├── lambda.mjs          # Entry point
├── server.mjs          # Express server
├── normalizer.mjs      # Data normalization
├── utils.js           # Utilities (S3, EventBridge)
├── validator/
│   ├── ajv.js         # AJV configuration
│   ├── registry.js    # Validator registry
│   └── schemas/       # JSON schemas
└── docs/
    └── openapi.json   # API documentation
```

## 📋 Changelog

### v1.0.0 (2025-10-09)

- ✅ Initial Knowledge Products validation
- ✅ EventBridge integration
- ✅ Swagger documentation
- ✅ S3 offload support
- ✅ Flexible data structure

## 📞 Support

To report issues or request features:

- 📧 Email: prms-support@cgiar.org
- 🐛 Issues: GitHub Issues
- 📖 Docs: `/docs` endpoint

---

**Desarrollado con ❤️ para CGIAR - Alliance of Bioversity International and CIAT**
