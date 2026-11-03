# Complete Valid Example

The two fields added in 2026-08 are shown first: `external_reference` (yours, optional but  
needed for webhooks) and `lead_contact_person` (mandatory for every result type).

```json
{
  "tenant": "prms.result-management.api",
  "op": "dataset.ingest.requested",
  "results": [
    {
      "type": "knowledge_product",
      "data": {
        "external_reference": "9d1d9aac-45b5-47cf-99d9-d78b8d6d0997" || "2342" || "STAR-9f2c-4471",
        "keep_editing": false,
        "created_date": "2025-10-24T19:36:04Z",
        "created_by": {
          "name": "Sara Jani",
          "email": "s.jani@cgiar.org"
        },
        "lead_contact_person": {
          "name": "Jane Doe",
          "email": "jane.doe@cgiar.org"
        },
        "lead_center": {
          "institution_id": 1279,
          "acronym": "ICARDA"
        },
        "toc_mapping": {
          "science_program_id": "SP01",
          "aow_compose_code": "SP01-AOW05",
          "result_title": "HLO20.AOW5.IO3 Assess performance",
          "result_indicator_description": "Availability of MELIA Report on AoWs (performance data)",
          "result_indicator_type_name": "Number of knowledge products"
        },
        "contributing_bilateral_projects": [
          {
            "grant_title": "D-200358"
          }
        ],
        "knowledge_product": {
          "handle": "https://hdl.handle.net/20.500.1176/70001"
        }
      }
    }
  ]
}
```
