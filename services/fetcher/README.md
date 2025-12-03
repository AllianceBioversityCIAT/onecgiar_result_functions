# PRMS Fetcher Service - v2.0.0

🚀 **PRMS Results Ingestion, Validation, and Processing Service**

This service validates, normalizes, processes and stores research results for the CGIAR PRMS (Performance and Results Management System).

## 🎯 What's New in v2.0

**Major architectural change:** Unified synchronous processing pipeline!

- ✅ **Eliminated EventBridge** - Direct synchronous processing
- ✅ **Unified Service** - Validation + External API + OpenSearch in one call
- ✅ **Immediate Feedback** - Complete response with processing results
- ✅ **Simplified Architecture** - One service instead of two
- ✅ **Better Observability** - Detailed logs in response

**Before (v1.x):**
```
POST /ingest → Validate → EventBridge → 202 Accepted
                               ↓ (async)
                          Loader Lambda
```

**Now (v2.0):**
```
POST /ingest → Validate → Process → External API → OpenSearch → 200 OK
```

---

For complete documentation, including:
- Result types and schemas
- Request/response examples
- OpenSearch integration
- Deployment guide
- Migration guide from v1.x

Please see the old README.md or visit `/docs` endpoint for interactive API documentation.

---

**Version**: 2.0.0  
**Last Updated**: 2024-12-03  
**Node Version**: 20+  
**Developed with ❤️ for CGIAR**
