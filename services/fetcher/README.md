# PRMS Normalizer Service - v1.2.0

🚀 **PRMS Results Normalization and Validation Service**

This AWS Lambda service validates, normalizes and publishes research results to EventBridge for the CGIAR PRMS (Performance and Results Management System).

## 📋 Features

- ✅ **Robust validation** with JSON Schema and AJV
- 🔄 **Data normalization** of input data
- 📤 **Automatic publishing** to AWS EventBridge
- 📊 **API documentation** with Swagger UI (16 examples)
- 🏗️ **Serverless architecture** optimized for AWS Lambda
- 🎯 **Support for 7 result types** with full validation
- 🔐 **Conditional validation** for complex business rules
- 📦 **S3 offload** for large payloads (>256KB)

## 🌐 Available Endpoints

### Core API

- **`POST /ingest`** - Ingest and process research results
- **`GET /health`** - Service health check

### Documentation

- **`GET /docs`** - Swagger UI interface (recommended)
- **`GET /openapi.json`** - OpenAPI specification in JSON

## 🗂️ Supported Result Types

The service supports **7 result types**, each with specific validation schemas and requirements:

### 1. Policy Change (`policy_change`, `pc`)

Policy changes influenced by research outputs.

**Type ID**: 1 | **Alias**: `pc`

**Specific Fields:**
- `policy_type`: Object with `id` or `name`
  - If `id = 1` (Budget allocation): Requires `status_amount` and `amount`
  - If `id ≠ 1`: No `status_amount` or `amount` required
- `policy_stage`: Object with `id` or `name`
- `implementing_organization`: Array (min 1) with `institutions_id`, `institutions_acronym`, or `institutions_name`

**Example:**
```json
{
  "type": "policy_change",
  "data": {
    "...common_fields...",
    "policy_change": {
      "policy_type": {
        "id": 1,
        "name": "Budget allocation",
        "status_amount": { "id": 1, "name": "Approved" },
        "amount": 5000000
      },
      "policy_stage": { "id": 3, "name": "Implementation" },
      "implementing_organization": [
        {
          "institutions_id": 456,
          "institutions_acronym": "MOA",
          "institutions_name": "Ministry of Agriculture"
        }
      ]
    }
  }
}
```

### 2. Other Outcome (`other_outcome`, `oc`)

General research outcomes that don't fit other specific categories.

**Type ID**: 2 | **Alias**: `oc`

**Specific Fields:** None (uses common fields only)

**Example:**
```json
{
  "type": "other_outcome",
  "data": {
    "...common_fields..."
  }
}
```

### 3. Capacity Sharing (`capacity_sharing`, `cs`)

Training and capacity building activities.

**Type ID**: 3 | **Alias**: `cs`

**Specific Fields:**
- `capacity_sharing`:
  - `number_people_trained`: Object with `women`, `men`, `non_binary`, `unknown`
  - `length_training`: String (e.g., "Short-term", "Long-term")
  - `delivery_method`: String (e.g., "In person", "Online")

**Example:**
```json
{
  "type": "capacity_sharing",
  "data": {
    "...common_fields...",
    "capacity_sharing": {
      "number_people_trained": {
        "women": 150,
        "men": 120,
        "non_binary": 5,
        "unknown": 10
      },
      "length_training": "Short-term",
      "delivery_method": "In person"
    }
  }
}
```

### 4. Innovation Use (`innovation_use`, `iu`)

Tracking the use and adoption of innovations.

**Type ID**: 4 | **Alias**: `iu`

**Specific Fields:**
- `innovation_use`:
  - `current_innovation_use_numbers`:
    - `innov_use_to_be_determined`: Boolean
    - `actors`: Array of actor objects
    - `organization`: Array of organization objects
    - `measures`: Array of measure objects

**Example:**
```json
{
  "type": "innovation_use",
  "data": {
    "...common_fields...",
    "innovation_use": {
      "current_innovation_use_numbers": {
        "innov_use_to_be_determined": false,
        "actors": [
          {
            "actor_type_id": "1",
            "how_many": 150
          }
        ],
        "organization": [
          {
            "institution_types_id": 39,
            "how_many": 5
          }
        ],
        "measures": [
          {
            "unit_of_measure": "# of Innovations",
            "quantity": 3
          }
        ]
      }
    }
  }
}
```

### 5. Knowledge Product (`knowledge_product`, `kp`)

Research outputs such as articles, reports, policy briefs, datasets, etc.

**Type ID**: 6 | **Alias**: `kp`

**Specific Fields:**
- `knowledge_product`:
  - `handle`: String (repository handle)
  - `knowledge_product_type`: String
  - `metadataCG`: Object with source, accessibility, peer review info
  - `licence`: String
  - `agrovoc_keywords`: Array of strings

**Example:**
```json
{
  "type": "knowledge_product",
  "data": {
    "...common_fields...",
    "knowledge_product": {
      "handle": "hdl:20.500.12345/abc-2025",
      "knowledge_product_type": "Journal Article",
      "metadataCG": {
        "source": "CGSpace",
        "accessibility": true,
        "is_isi": true,
        "is_peer_reviewed": true,
        "issue_year": 2025
      },
      "licence": "CC-BY 4.0",
      "agrovoc_keywords": ["Wheat", "Climate adaptation"]
    }
  }
}
```

### 6. Innovation Development (`innovation_development`, `id`)

Development of new innovations and technologies.

**Type ID**: 7 | **Alias**: `id`

**Specific Fields:**
- `innovation_development`:
  - `innovation_typology`: Object with `code` or `name`
  - `innovation_developers`: String (semicolon-separated names)
  - `innovation_readiness_level`: Object with `id` or `name`

**Example:**
```json
{
  "type": "innovation_development",
  "data": {
    "...common_fields...",
    "innovation_development": {
      "innovation_typology": {
        "code": 12,
        "name": "Technological innovation"
      },
      "innovation_developers": "John Doe; Marie Curie; Nikola Tesla",
      "innovation_readiness_level": {
        "id": 14,
        "name": "Phase 3 - Available for uptake"
      }
    }
  }
}
```

### 7. Other Output (`other_output`, `oo`)

General research outputs that don't fit other specific categories.

**Type ID**: 8 | **Alias**: `oo`

**Specific Fields:** None (uses common fields only)

**Example:**
```json
{
  "type": "other_output",
  "data": {
    "...common_fields..."
  }
}
```

## 📊 Result Type ID Reference

| # | Result Type            | Alias | Type ID | Schema File                  | Features                          |
|---|------------------------|-------|---------|------------------------------|-----------------------------------|
| 1 | policy_change          | pc    | 1       | policy_change.json           | Conditional validation            |
| 4 | innovation_use         | iu    | 2       | innovation_use.json          | Complex nested validation         |
| 3 | capacity_sharing       | cs    | 3       | capacity_sharing.json        | Gender disaggregation             |
| 2 | other_outcome          | oc    | 4       | other_outcome.json           | Common fields only                |
| 5 | knowledge_product      | kp    | 6       | knowledge_product.json       | Metadata tracking                 |
| 6 | innovation_development | id    | 7       | innovation_development.json  | Readiness level tracking          |
| 7 | other_output           | oo    | 8       | other_output.json            | Common fields only                |


## 📖 Common Fields Structure

All result types share these common required fields:

### User Information
```json
{
  "created_date": "2025-11-19T15:00:00Z",
  "created_by": {
    "email": "creator@cgiar.org",
    "name": "John Creator"
  },
  "submitted_by": {
    "email": "submitter@cgiar.org",
    "name": "Jane Submitter",
    "comment": "Optional submission comment",
    "submitted_date": "2025-11-19T15:05:00Z"
  }
}
```

### Lead Center
```json
{
  "lead_center": {
    "acronym": "CIAT",
    "name": "International Center for Tropical Agriculture",
    "institution_id": 115
  }
}
```

### Basic Information
```json
{
  "title": "Research result title",
  "description": "Detailed description of the research result"
}
```


### TOC Mapping
```json
{
  "toc_mapping": {
    "science_program_id": "SP12",
    "aow_compose_code": "SP12-AOW01",
    "result_title": "Result title",
    "result_indicator_description": "Description of the indicator",
    "result_indicator_type_name": "# Of Knowledge Products"
  }
}
```

### Geographic Focus

The system supports 5 geographic scope levels:

1. **Global** (`scope_code: 1`)
```json
{
  "geo_focus": {
    "scope_code": 1,
    "scope_label": "Global"
  }
}
```

2. **Regional** (`scope_code: 2`) - Requires `regions`
```json
{
  "geo_focus": {
    "scope_code": 2,
    "scope_label": "Regional",
    "regions": [
      { "um49code": 145, "name": "Sub-Saharan Africa" }
    ]
  }
}
```

3. **Multi-National** (`scope_code: 3`) - Requires `countries` (≥2)
```json
{
  "geo_focus": {
    "scope_code": 3,
    "scope_label": "Multi-national",
    "countries": [
      { "iso_alpha_3": "KEN", "name": "Kenya" },
      { "iso_alpha_3": "UGA", "name": "Uganda" }
    ]
  }
}
```

4. **National** (`scope_code: 4`) - Requires `countries` (≥1)
```json
{
  "geo_focus": {
    "scope_code": 4,
    "scope_label": "National",
    "countries": [
      { "iso_alpha_3": "KEN", "name": "Kenya" }
    ]
  }
}
```

5. **Sub-national** (`scope_code: 5`) - Requires `countries` + `subnational_areas`
```json
{
  "geo_focus": {
    "scope_code": 5,
    "scope_label": "Sub-national",
    "countries": [
      { "iso_alpha_3": "KEN", "name": "Kenya" }
    ],
    "subnational_areas": [
      { "id": 1, "name": "Nairobi County" }
    ]
  }
}
```

### Contributing Centers & Partners
```json
{
  "contributing_center": [
    {
      "institution_id": 1279,
      "acronym": "ICARDA",
      "name": "International Center for Agricultural Research in Dry Areas"
    }
  ],
  "contributing_partners": [
    {
      "institution_id": 1,
      "acronym": "WUR",
      "name": "Wageningen University"
    }
  ]
}
```

### Evidence & Projects
```json
{
  "evidence": [
    {
      "link": "https://example.org/paper-123",
      "description": "Peer-reviewed article supporting the result"
    }
  ],
  "contributing_bilateral_projects": [
    {
      "grant_title": "Seed Innovation Window"
    }
  ]
}
```

## 📖 Data Structure

### Complete Ingestion Request Example

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
        "toc_mapping": {
          "science_program_id": "SP12",
          "aow_compose_code": "SP12-AOW01",
          "result_title": "Result title",
          "result_indicator_description": "Indicator description",
          "result_indicator_type_name": "# Of Knowledge Products"
        },
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
   - `S3_BUCKET`: S3 bucket for large payloads (optional)

### API Gateway Configuration

Create endpoints with **Lambda Proxy Integration**:

- `POST /ingest` → Lambda Function
- `ANY /` → Lambda Function (for docs and health)

## 🧪 Testing

### Health Check

```bash
curl https://your-api-url/health
```

### Data Ingestion - Knowledge Product

```bash
curl -X POST https://your-api-url/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "MEL",
    "op": "create",
    "results": [
      {
        "type": "knowledge_product",
        "data": {
          "created_date": "2025-11-19T15:00:00Z",
          "created_by": {
            "email": "creator@cgiar.org",
            "name": "Creator Name"
          },
          "submitted_by": {
            "email": "submitter@cgiar.org",
            "name": "Submitter Name",
            "submitted_date": "2025-11-19T15:05:00Z"
          },
          "lead_center": { "acronym": "CIAT" },
          "title": "Test Result",
          "description": "Test description",
          "toc_mapping": {
            "science_program_id": "SP01",
            "aow_compose_code": "SP01-AOW01",
            "result_title": "Test",
            "result_indicator_description": "Test",
            "result_indicator_type_name": "# Of Knowledge Products"
          },
          "geo_focus": {
            "scope_code": 1,
            "scope_label": "Global"
          },
          "contributing_center": [],
          "contributing_partners": [],
          "evidence": [{
            "link": "https://example.org/test",
            "description": "Test evidence"
          }],
          "contributing_bilateral_projects": [],
          "knowledge_product": {
            "handle": "hdl:20.500.12345/test",
            "knowledge_product_type": "Journal Article",
            "metadataCG": {
              "source": "CGSpace",
              "accessibility": true,
              "is_isi": false,
              "is_peer_reviewed": true,
              "issue_year": 2025
            },
            "licence": "CC-BY 4.0",
            "agrovoc_keywords": ["Test"]
          }
        }
      }
    ]
  }'
```

### Data Ingestion - Policy Change

```bash
curl -X POST https://your-api-url/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "tenant": "MEL",
    "results": [
      {
        "type": "policy_change",
        "data": {
          "...common_fields...",
          "policy_change": {
            "policy_type": {
              "id": 1,
              "name": "Budget allocation",
              "status_amount": { "id": 1, "name": "Approved" },
              "amount": 5000000
            },
            "policy_stage": { "id": 3 },
            "implementing_organization": [
              { "institutions_acronym": "MOA" }
            ]
          }
        }
      }
    ]
  }'
```

### Using Type Aliases

All result types support short aliases:

```bash
# Using 'kp' instead of 'knowledge_product'
curl -X POST https://your-api-url/ingest \
  -H "Content-Type: application/json" \
  -d '{ "results": [{ "type": "kp", "data": {...} }] }'

# Using 'pc' instead of 'policy_change'
curl -X POST https://your-api-url/ingest \
  -H "Content-Type: application/json" \
  -d '{ "results": [{ "type": "pc", "data": {...} }] }'
```

### API Documentation

Visit: `https://your-api-url/docs`

Browse 16 complete examples covering all 7 result types.

## 🔧 Validation Configuration

### Field Flexibility

The system allows flexibility in several required fields:

#### Geographic Focus
- **Global (1)**: No additional fields required
- **Regional (2)**: Requires `regions` array
- **Multi-National (3)**: Requires `countries` array (≥2 countries)
- **National (4)**: Requires `countries` array (≥1 country)
- **Sub-national (5)**: Requires `countries` + `subnational_areas`

#### Contributing Centers
Requires **at least one** of:
- `institution_id` (integer)
- `name` (string)
- `acronym` (string)
- `code` (string)

#### Contributing Partners
Requires **at least one** of:
- `institution_id` (integer)
- `acronym` (string)
- `name` (string)

#### Lead Center
Accepts either:
- Object with `acronym`, `name`, or `institution_id`
- String value (acronym)

### Conditional Validation

#### Policy Change
Special business rules for `policy_type`:

**If `policy_type.id = 1` (Budget allocation):**
- ✅ **Required**: `status_amount` (object with id or name)
- ✅ **Required**: `amount` (integer, budget amount)

**If `policy_type.id ≠ 1`:**
- ❌ **Rejected**: `status_amount` must not be present
- ❌ **Rejected**: `amount` must not be present

Example validation error:
```json
{
  "ok": false,
  "errors": [
    {
      "path": "/results/0/data/policy_change",
      "message": "must NOT have additional properties: status_amount, amount (only allowed when policy_type.id = 1)"
    }
  ]
}
```

### Custom Validations

- **`maxWords`**: Validates maximum word count in text fields
- **Email format**: RFC 5322 email validation
- **URI format**: Valid HTTP/HTTPS link validation
- **Date format**: ISO 8601 date-time validation
- **ISO Alpha-3**: Valid ISO 3166-1 alpha-3 country codes

## 📊 Monitoring

### CloudWatch Logs

The service logs detailed information for:
- Validation errors with field paths
- Performance metrics
- Request traceability
- EventBridge publishing status
- S3 offload operations

### Log Examples

```
[INFO] Received POST /ingest - 2 results
[INFO] Validating result 0 - type: knowledge_product
[SUCCESS] Result 0 validated successfully
[INFO] Validating result 1 - type: policy_change
[ERROR] Result 1 validation failed: /policy_change/policy_type must have required property 'id' or 'name'
[INFO] Publishing 1 valid results to EventBridge
[SUCCESS] Published event to EventBridge: event-id-123
```

### Key Metrics

Track these CloudWatch metrics:

- **Validation Success Rate**: % of results passing validation
- **Processing Time**: Average time per request
- **Data Volume**: Number of results processed
- **EventBridge Errors**: Failed event publications
- **S3 Offload Rate**: % of payloads offloaded to S3
- **Type Distribution**: Breakdown by result type

### Recommended Alarms

1. **High Validation Failure Rate**: > 20% failures
2. **Long Processing Time**: > 3 seconds average
3. **EventBridge Errors**: Any failures
4. **Lambda Errors**: Any function errors
5. **Memory Usage**: > 80% of allocated memory

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
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Loader Service  │
                        └──────────────────┘
```

### Components

- **API Gateway**: HTTP/REST entry point with Lambda proxy integration
- **Lambda Handler**: Serverless processing with Express.js
- **AJV Validator**: JSON schema validation with custom rules
- **EventBridge**: Event publishing with auto-retry
- **S3**: Storage for large payloads (>256KB)
- **Loader Service**: Downstream processor (processes events from EventBridge)

### Data Flow

1. **Request**: Client sends POST to `/ingest`
2. **Validation**: Each result validated against its schema
3. **Normalization**: Data normalized (dates, lead_center, etc.)
4. **Size Check**: If payload > 256KB, offload to S3
5. **Publishing**: Publish to EventBridge (direct payload or S3 reference)
6. **Response**: Return acceptance status to client
7. **Async Processing**: Loader service picks up events for further processing

## 🔐 Security

### IAM Permissions Required

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "events:PutEvents"
      ],
      "Resource": "arn:aws:events:*:*:event-bus/prms-ingestion-bus"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
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

### Best Practices

- **API Gateway**: Enable request throttling and API keys
- **Lambda**: Set resource-based policies to restrict invocation
- **EventBridge**: Use resource policies to control event sources
- **S3**: Enable versioning and lifecycle policies
- **Secrets**: Store sensitive data in AWS Secrets Manager

## 🗺️ Roadmap

### ✅ v1.0.0 (2025-10-09)

- ✅ Initial Knowledge Products validation
- ✅ EventBridge integration
- ✅ Swagger documentation
- ✅ S3 offload support
- ✅ Flexible data structure

### ✅ v1.2.0 (2025-11-19) - Current

**New Result Types:**
- ✅ Policy Change with conditional validation
- ✅ Other Outcome (simple schema)
- ✅ Capacity Sharing with gender disaggregation
- ✅ Innovation Use with complex nested validation
- ✅ Innovation Development with readiness levels
- ✅ Other Output (simple schema)

**Schema Improvements:**
- ✅ Updated `innovation_readiness_level` to accept object {id|name}
- ✅ Conditional validation for policy_change budget allocation
- ✅ 16 comprehensive examples in OpenAPI

**Documentation:**
- ✅ Complete API documentation with examples
- ✅ Migration guides for breaking changes
- ✅ Comprehensive testing suites

### 🔮 v1.3 (Future)

- [ ] Authentication and authorization (API Keys, OAuth)
- [ ] Rate limiting per tenant
- [ ] Webhook notifications for validation results
- [ ] Bulk validation endpoint
- [ ] Schema versioning support

### 🔮 v2.0 (Future)

- [ ] GraphQL API support
- [ ] Real-time validation WebSocket
- [ ] Advanced analytics dashboard
- [ ] Multi-region deployment
- [ ] Enhanced retry logic with dead-letter queues

## 🤝 Contributing

### Local Development

```bash
git clone <repository>
cd services/fetcher
npm install
npm run build
npm run dev  # Start local server on port 3000
```

### Running Tests

```bash
# Validate specific result type
node test_new_types.mjs

# Test innovation development schema
node test_innovation_dev_schema.mjs

# Validate with sample data
node test_validator.mjs
```

### Project Structure

```
services/fetcher/
├── src/
│   ├── lambda.mjs              # Lambda entry point
│   ├── server.mjs              # Express server configuration
│   ├── normalizer.mjs          # Data normalization logic
│   ├── utils.js                # Utilities (S3, EventBridge)
│   ├── validator/
│   │   ├── ajv.js              # AJV configuration
│   │   ├── registry.js         # Validator registry (7 types)
│   │   └── schemas/            # JSON schemas
│   │       ├── common_fields.json
│   │       ├── capacity_sharing.json
│   │       ├── innovation_development.json
│   │       ├── innovation_use.json
│   │       ├── knowledge_product.json
│   │       ├── other_outcome.json
│   │       ├── other_output.json
│   │       └── policy_change.json
│   └── docs/
│       └── openapi.json        # API documentation (v1.2.0)
├── test_new_types.mjs          # Tests for new types
├── test_innovation_dev_schema.mjs  # Innovation dev tests
├── test_policy_change.json     # Sample test data
└── README.md                   # This file
```

### Adding New Result Types

To add a new result type:

1. **Create Schema**: Add JSON schema in `src/validator/schemas/`
2. **Register Validator**: Update `src/validator/registry.js`
3. **Add Examples**: Update `src/docs/openapi.json`
4. **Write Tests**: Create test file in root
5. **Update Docs**: Add documentation to this README

Example schema structure:

```json
{
  "$id": "https://prms/schemas/new_type.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "New Type Result",
  "description": "Schema for new type results",
  "allOf": [
    { "$ref": "https://prms/schemas/common_fields.json" },
    {
      "type": "object",
      "properties": {
        "new_type": {
          "type": "object",
          "properties": {
            "specific_field": { "type": "string" }
          },
          "required": ["specific_field"]
        }
      },
      "required": ["new_type"]
    }
  ]
}
```

## 📋 Changelog

### v1.2.0 (2025-11-19)

**Added:**
- ✅ Policy Change result type with conditional validation
- ✅ Other Outcome result type
- ✅ Innovation Use result type (loader support added)
- ✅ 3 new comprehensive OpenAPI examples
- ✅ Complete test suites for all new types

**Changed:**
- ⚠️ **BREAKING**: `innovation_readiness_level` now requires object format {id|name}
- ✅ Updated OpenAPI version to 1.2.0
- ✅ Enhanced documentation with 16 total examples

**Fixed:**
- ✅ Improved error messages for conditional validation
- ✅ Better handling of lead_center variations

### v1.0.0 (2025-10-09)

**Initial Release:**
- ✅ Knowledge Products validation
- ✅ Capacity Sharing support
- ✅ Innovation Development support
- ✅ Other Output support
- ✅ EventBridge integration
- ✅ Swagger documentation
- ✅ S3 offload support

## 🧪 Testing Guide

### Validation Testing

Test each result type with the provided test files:

```bash
# Test all new types
node test_new_types.mjs
# Expected output: 4/4 tests passing

# Test innovation development schema
node test_innovation_dev_schema.mjs
# Expected output: 6/6 tests passing

# Test policy change validation
node test_validator.mjs
# Tests conditional validation rules
```

### Manual Testing with cURL

Test the complete flow:

```bash
# 1. Check service health
curl https://your-api/health

# 2. View API documentation
open https://your-api/docs

# 3. Test knowledge product
curl -X POST https://your-api/ingest \
  -H "Content-Type: application/json" \
  -d @test_policy_change.json

# 4. Test policy change with budget
curl -X POST https://your-api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "results": [{
      "type": "pc",
      "data": {
        "...common_fields...",
        "policy_change": {
          "policy_type": { "id": 1, "amount": 1000000 },
          "policy_stage": { "id": 1 },
          "implementing_organization": [{ "institutions_acronym": "MOA" }]
        }
      }
    }]
  }'
```

### Expected Responses

**Success (202 Accepted):**
```json
{
  "ok": true,
  "status": "accepted",
  "acceptedCount": 1,
  "rejectedCount": 0,
  "eventIds": ["event-id-123"]
}
```

**Validation Error (400 Bad Request):**
```json
{
  "ok": false,
  "status": "rejected",
  "acceptedCount": 0,
  "rejectedCount": 1,
  "rejected": [{
    "index": 0,
    "errors": [
      {
        "path": "/results/0/data/title",
        "message": "must be string"
      }
    ]
  }]
}
```

## 📞 Support

### Documentation

- **API Docs**: Visit `/docs` endpoint
- **OpenAPI Spec**: Download from `/openapi.json`
- **Examples**: 16 complete examples in Swagger UI

### Getting Help

To report issues or request features:

- 📧 Email: prms-support@cgiar.org
- 🐛 Issues: GitHub Issues
- 📖 Docs: Internal confluence pages

### Common Issues

**Q: I'm getting "must be object" error for innovation_readiness_level**  
A: This field now requires object format: `{ "id": 14 }` instead of just `14`

**Q: My policy_change validation fails with "must NOT have additional properties"**  
A: If `policy_type.id ≠ 1`, don't include `status_amount` or `amount`

**Q: What's the difference between other_output and other_outcome?**  
A: Both use only common fields. Use `other_output` for outputs (deliverables) and `other_outcome` for outcomes (impacts/results)

**Q: Can I send multiple result types in one request?**  
A: Yes! The `results` array can contain different types mixed together

## 🎯 Best Practices

### Result Submission

1. **Validate locally first**: Use the test files to validate your data structure
2. **Use type aliases**: Shorter and easier (`kp` vs `knowledge_product`)
3. **Batch requests**: Send multiple results in one request when possible
4. **Include all evidence**: More evidence links improve traceability
5. **Use proper dates**: Always use ISO 8601 format

### Error Handling

1. **Check rejected array**: Contains detailed validation errors
2. **Log correlation IDs**: Track requests across services
3. **Retry failed requests**: Implement exponential backoff
4. **Monitor CloudWatch**: Set up alarms for high error rates

### Performance

1. **Batch size**: Optimal 10-50 results per request
2. **Payload size**: Keep under 256KB to avoid S3 offload
3. **Timeout**: Allow 30 seconds for large batches
4. **Rate limiting**: Respect any rate limits (future feature)

---

**Version**: 1.2.0  
**Last Updated**: 2025-11-19  
**Node Version**: 20+  
**Desarrollado con ❤️ para CGIAR - Alliance of Bioversity International and CIAT**
