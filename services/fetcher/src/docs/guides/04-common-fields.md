# Common fields

---

## External reference 🆕

`external_reference`

Your own identifier for this result — the consecutive number, UUID, or internal id your system already uses. PRMS stores it exactly as you send it and hands it back exactly as you sent it, so you never have to keep a PRMS id to know which of your records a response is about.

| **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- |
| **string** | ⚙️ Optional ⚠️ | Your identifier for this result. Max 191 characters. Stored and returned verbatim — no prefix, no transformation. | `"STAR-9f2c-4471"` |

**Where it comes back to you:**

| **Where** | **Field** |
| --- | --- |
| Ingest response — a row that was processed, success or failure | `results[].external_reference` |
| Ingest response — a row rejected before processing (schema, missing `type`/`data`) | `rejected[].external_reference` |
| Decision webhook | `external_reference` (top level) |

> ℹ️ It comes back on **every** row, including the ones that failed. A rejected row is the one you most need to find again — it is the row you have to show your own user. `null` when you sent none.

```json
{
  "type": "knowledge_product",
  "data": {
    "external_reference": "STAR-9f2c-4471",
    "created_date": "2025-10-24T19:36:04Z",
    "...": "resto de campos"
  }
}
```

> ℹ️ **It is optional and will stay optional.** Not every producer has an id of its own, and a bilateral result created inside the PRMS Reporting Tool has no external system behind it — those are stored as `null`, which is the honest answer rather than an invented value.
> ⚠️ **But without it you cannot correlate.** The decision webhook tells you what was decided and why, and carries nothing that points at your row. If you plan to consume webhooks, send it.
> 

> ❗ One value per result, not per request. In a payload with several results, each one carries its own.

---

## Keep editing 🆕

`keep_editing`

Where the result lands in PRMS Reporting once it is created. By default a result arrives in **Pending review** and goes straight to the Science Program. Set this to `true` when the reporting user still has to complete the fields PRMS asks for beyond the minimum data set: the result is created in **Editing**, visible to them, and **they** submit it for review from PRMS.

| **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- |
| **boolean** | ⚙️ Optional | `true` → created as **Editing**, completed and submitted by the reporting user in PRMS. `false` or absent → **Pending review**, today's behaviour. | `true` |

```json
"data": {
  "keep_editing": true,
  "title": "Adoption of climate-resilient seed varieties"
}
```

> ⚠️ **Send it per result, inside `data`.** A flag at the top level of the request is dropped before validation: the ingest handler rebuilds the envelope as `{tenant, op, jobId, results}` and keeps nothing else. Sending the same value on every result of a batch is fine — that is how you get a batch-wide effect.

> ✅
> **Validation rules (schema):**
> 

- Optional on every result type. Absent is treated as `false`.
- Must be a **boolean**. A string, a number or `"true"` in quotes is rejected.

> ⚠️ **New 2026-09.** The field was silently discarded before it was declared: the schemas set `additionalProperties: true`, so `keep_editing` was passed through untouched and then dropped further down by Reporting's whitelist. Sending it produced no error **and no effect**. Two things changed — it is now declared on all seven types, so a non-boolean is rejected here with the row's `external_reference` instead of being forwarded; and Reporting reads it.

---

## Result code 🆕

`result_code`

The PRMS result code of a result you already reported and had **approved in a previous phase**. Send it to carry that result into the current phase with the data in this payload, instead of creating a new result.

- **Type:** string or integer
- **Required:** ⚙️ Optional
- **Description:** Digits only. `"28565"` and `28565` are both accepted. Omit it to create a new result, exactly as before.
- **Example:** `28565`

```json
{
  "type": "capacity_sharing",
  "data": {
    "result_code": 28565,
    "external_reference": "STAR-9f2c-4471",
    "title": "...",
    "...": "the rest of the result, complete, as for a new one"
  }
}
```

> ⚠️ **Send the full result.** Nothing is copied from the previous phase: the new version is built only from this payload. Anything you don't send is not in the new version.

> ℹ️ **The status follows `keep_editing`**, as for a new result: `false` → `Pending Review`, `true` → `Editing`.

---

## Created date 🆕

`created_date`

| **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- |
| **string (ISO date)** | ✅ | **Original creation date of the result (if no date is available, use the current timestamp).** | "2025-10-09T12:00:00Z" |

---

## Created by 🆕

`created_by`

Information about the user who created the result.

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **email** | string (email) | ✅ | **User’s email address.** | "j.doe@cgiar.org" |
| **name** | string | ✅ | **Full name of the user.** | "John Doe" |

---

## Submitted by

`submitted_by`

Information about the user submitting the result.

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **email** | string (email) | ✅ | **User’s email address.** | "j.doe@cgiar.org" |
| **name** | string | ✅ | **Full name of the user.** | "John Doe" |
| **submitted_date** | string (ISO date) | ✅ | **Submission timestamp.** | "2025-10-09T12:00:00Z" |
| **comment** | string | ❌ | **Optional comment or note.** | "Initial batch upload from STAR" |

---

## Lead center

`lead_center`

| id | acronym | name |
| --- | --- | --- |
| 5 | IRRI | International Rice Research Institute |
| 45 | IITA | International Institute of Tropical Agriculture |
| 46 | CIAT (Alliance) | Alliance of Bioversity and CIAT - Regional Hub |
| 49 | Bioversity (Alliance) | Alliance of Bioversity and CIAT - Headquarter (Bioversity International) |
| 50 | CIMMYT | International Maize and Wheat Improvement Center / Centro Internacional de Mejoramiento de Maíz y Trigo |
| 52 | AfricaRice | Africa Rice Center |
| 66 | ILRI | International Livestock Research Institute |
| 67 | CIP | International Potato Center / Centro Internacional de la Papa |
| 88 | ICRAF | World Agroforestry Centre |
| 89 | IFPRI | International Food Policy Research Institute |
| 99 | WorldFish | WorldFish |
| 115 | CIFOR | Center for International Forestry Research |
| 172 | IWMI | International Water Management Institute |
| 11605 | SO | CGIAR System Organization |
| 1273 | ICRISAT | International Crops Research Institute for the Semi-Arid Tropics |
| 1279 | ICARDA | International Center for Agricultural Research in the Dry Areas |

⚠️ At least one option

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **name** | string | ⚙️ Optional ⚠️ | **Name of the main center responsible for the result.** | “Alliance of Bioversity and CIAT - Regional Hub (International Center for Tropical Agriculture / Centro Internacional de Agricultura Tropical)” |
| **acronym** | string | ⚙️ Optional ⚠️ | **Acronym of the main center responsible for the result.** | “CIAT (Alliance)” |
| **institution_id** | number | ⚙️ Optional ⚠️ | **Code of the main center responsible for the result.** | 46 |

---

## Lead contact person 🚨 BREAKING — now MANDATORY

`lead_contact_person`

> ⚠️ **Change (2026-08):** `lead_contact_person` is now a **required** field for **all result types** (P2-3227 — MDS transversal). Payloads that omit it will be **rejected** at validation with `(root) must have required property 'lead_contact_person'`. Producers must start sending it.

Lead contact person for the result (MDS field, mandatory). The server matches/creates the AD/PRMS user record by email; if no match is found, it falls back to storing the name only.

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **email** | string (email) | ✅ | **Email address of the lead contact person.** | "[jane.doe@cgiar.org](mailto:jane.doe@cgiar.org)" |
| **name** | string | ✅ | **Full name of the lead contact person.** | "Jane Doe" |

> ❗ No additional properties other than `email` and `name` are allowed.

---

## Title and description

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **title** | string | ✅ | **Short title (max 30 words).** | "Improved seed varieties adoption in drylands" |
| **description** | string | ✅ | **Detailed description (max 150 words).** | "Summarizes adoption barriers and enabling factors across regions to inform policy and practice." |

---

## ToC mapping

`toc_mapping`

Associates the result with elements of the Theory of Change (ToC).

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **science_program_id** | string | ✅ | **ID of the Science Program (SP01–SP13).** | "SP12" |
| **aow_compose_code** | string | ❌ | **Composite code of the Area of Work (AoW).** | "SP12-AOW01" |
| **result_title** | string | ❌ | **Title of the associated ToC result.** | "Adoption of improved seed varieties" |
| **result_indicator_description** | string | ❌ | **Indicator description.** | "Share of farmers adopting improved seeds" |
| **result_indicator_type_name** | string | ❌ | **Indicator type name.** | "# Of Knowledge Products" |
| **target_contribution** | integer | ❌ | **Contribution of this result to the matched indicator's target. Non-negative whole number. Stored only when the ToC match resolves an indicator that has a target. If omitted, 1 is stored. If sent but no indicator with a target is matched, the value is ignored and the result is still created.** | 12 |

---

## Contributing programs

`contributing_programs`

Array of science programs contributing to the result (alternative to single `toc_mapping`).

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **science_program_id** | string | ✅ | **ID of the Science Program (SP01–SP13).** | "SP02" |
| **aow_compose_code** | string | ❌ | **Composite code of the Area of Work (AoW).** | "SP02-AOW03" |
| **result_title** | string | ❌ | **Title of the associated ToC result.** | "Nutrition outcomes improved" |
| **result_indicator_description** | string | ❌ | **Indicator description.** | "Households reached with nutrition interventions" |
| **result_indicator_type_name** | string | ❌ | **Indicator type name.** | "Outcome" |

---

## Geo focus

`geo_focus`

Defines the geographical scope of the result.

- **CLARISA Geo Scope:** [https://api.clarisa.cgiar.org/api/geographic-scopes](https://api.clarisa.cgiar.org/api/geographic-scopes)
- **CLARISA Regions:** [https://api.clarisa.cgiar.org/api/regions/un-regions](https://api.clarisa.cgiar.org/api/regions/un-regions)
- **CLARISA Countries:** [https://api.clarisa.cgiar.org/api/countries](https://api.clarisa.cgiar.org/api/countries)
- **CLARISA Sub-National Scopes:** [https://api.clarisa.cgiar.org/api/subnational-scope](https://api.clarisa.cgiar.org/api/subnational-scope)
⚠️ At least one option

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **scope_code** | number | ⚙️ Optional (If **scope_label** is defined) ⚠️ | **Geographical scope (1=Global, 2=Regional, 3=Multi-national, 4=National, 5=Sub-national, 50=To be determined).** | 2 |
| **scope_label** | string | ⚙️ Optional (If **scope_code** is defined) ⚠️ | **Descriptive label for the scope.** | "Regional" |
| **regions** | array | Conditional (scope_code=2) | **List of regions covered.** | [ { "um49code": 145, "name": "Sub-Saharan Africa" } ] |
| **countries** | array | Conditional (scope_code=3–5) | **List of countries involved.** | [ { "id": 170, "name": "Colombia", "iso_alpha_3": "COL", "iso_alpha_2": "CO" } ] |
| **subnational_areas** | array | Conditional (scope_code=5) | **List of first-level administrative areas.** | [ { "id": 1, "name": "Nairobi County" } ] |

**Important note:**

- `scope_code = 3` (Multi-national): Requires a minimum of **2 countries** in the `countries` array.
- `scope_code = 4` (National): Requires a minimum of **1 country** in the `countries` array.
- `scope_code = 5` (Sub-national): Requires a minimum of **1 country** and **1 sub-national area**.

---

## Contributing center

`contributing_center`

- **CLARISA Institutions:** [https://api.clarisa.cgiar.org/api/institutions](https://api.clarisa.cgiar.org/api/institutions)

| id | acronym | name |
| --- | --- | --- |
| 5 | IRRI | International Rice Research Institute |
| 45 | IITA | International Institute of Tropical Agriculture |
| 46 | CIAT (Alliance) | Alliance of Bioversity and CIAT - Regional Hub (International Center for Tropical Agriculture / Centro Internacional de Agricultura Tropical) |
| 49 | Bioversity (Alliance) | Alliance of Bioversity and CIAT - Headquarter (Bioversity International) |
| 50 | CIMMYT | International Maize and Wheat Improvement Center / Centro Internacional de Mejoramiento de Maíz y Trigo |
| 52 | AfricaRice | Africa Rice Center |
| 66 | ILRI | International Livestock Research Institute |
| 67 | CIP | International Potato Center / Centro Internacional de la Papa |
| 88 | ICRAF | World Agroforestry Centre |
| 89 | IFPRI | International Food Policy Research Institute |
| 99 | WorldFish | WorldFish |
| 115 | CIFOR | Center for International Forestry Research |
| 172 | IWMI | International Water Management Institute |
| 221 | SMO | CGIAR System Organization |
| 1273 | ICRISAT | International Crops Research Institute for the Semi-Arid Tropics |
| 1279 | ICARDA | International Center for Agricultural Research in the Dry Areas |

⚠️ If send the array: At least one option

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **institution_id** | number | Optional | **Numeric identifier of the center.** | 1279 |
| **acronym** | string | Optional | **Center acronym.** | "ICARDA" |
| **name** | string | Optional | **Full name of the center.** | "International Center for Agricultural Research in the Dry Areas" |

---

## Contributing partners

`contributing_partners`

⚠️ If send the array: At least one option

- **CLARISA Institutions:** [https://api.clarisa.cgiar.org/api/institutions](https://api.clarisa.cgiar.org/api/institutions)

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **institution_id** | number | Optional | **Partner institution ID.** | 7 |
| **acronym** | string | Optional | **Institution acronym.** | "NARO" |
| **name** | string | Optional | **Full name of the partner institution.** | “National Agricultural Research Organization” |
| **usd_budget** | number | Optional | **Budget in USD contributed by this partner institution.** Stored for **Innovation Development** and **Innovation Use**; ignored for other result types. Optional — not part of the MDS. Must not be sent together with `is_determined: true`. | 75000 |
| **is_determined** | boolean | Optional | Send `true` when this partner's contribution amount is **not yet determined**. Stores the amount as "yet to be determined" and nulls any value sent in `usd_budget`. | false |

---

## Evidence

`evidence`

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| link | string (`http(s)` URL) | ✅ | **Publicly accessible link to the supporting evidence** (paper, report, dataset, etc.). Must include the scheme. File storage platforms are not accepted — see the rules below. | `"https://cgspace.cgiar.org/handle/10568/181939"` |
| description | string | ❌ | **Brief description of the evidence.** | `"Peer-reviewed article summarizing multi-country trials."` |

PRMS stores the link and **never copies the document**. Everything about what is accepted follows from that: whoever opens the link later — a reviewer, the CGIAR Results Dashboard — gets exactly what you sent, or nothing.

| Rule | Detail |
| --- | --- |
| **Scheme required** ⚠️ 2026-08 | The link must start with `http://` or `https://`. A bare file name is rejected. |
| **No file storage platforms** ⚠️ 2026-08 | SharePoint, OneDrive, Google Drive and Dropbox links are rejected, whatever the tenant. |
| **Publicly reachable** | A link nobody outside your organisation can open is of no use as evidence, even when it is technically accepted. |

✅ `https://cgspace.cgiar.org/handle/10568/181939`  
✅ `https://doi.org/10.1234/abcd.2025.01`  
❌ `result-28808-Document-202607042143-8310.pdf` — no scheme  
❌ `https://cgiar.sharepoint.com/sites/…` — file storage platform

> ⚠️ **Both rules were already in force in the PRMS reporting tool** and stated on screen there; this API simply did not apply them. Until 2026-08 the same link was refused in the form and accepted here.

> ℹ️ **Confidential evidence has no route through this API.** The API accepts links only. Evidence that cannot be public is reported through the PRMS reporting tool with **Upload file** and answering **No** to the public question: the file is then stored in the PRMS repository, kept off the Results Dashboard, and reachable only by CGIAR staff holding the repository link.

**Where the rejection appears:** these two rules are applied by PRMS, not by this service's pre-checks. A bad link comes back as a failed row in `results[]` (HTTP 207), not in `rejected[]` (HTTP 422). Validate on your side if you want to catch it before submitting.

---

## Contributing bilateral projects

`contributing_bilateral_projects`

- **CLARISA bilateral Projects:** [https://api.clarisa.cgiar.org/api/projects](https://api.clarisa.cgiar.org/api/projects)

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **grant_title** | string | ✅ | **Registry code of the bilateral / NPP project** — the `code` field of the CLARISA projects catalogue, sent on its own. Do **not** send the full project title, and do not send code and title concatenated: the catalogue holds legacy rows under a past reporting phase whose name fields carry that concatenated form, and matching one of those binds the result to a project that no PRMS screen can show. A `grant_title` that resolves to no project of the current reporting phase is **rejected with 400** — before 2026-09-21 it was skipped silently and the result was created without the project or its investment. | D-200358 |
| **is_lead** | boolean | ⚙️ Optional | **Flag to identify an Bilateral Project Lead** | false |
| usd_budget | number | ⚙️ Optional | **Optional**. If the contribution amount is known, send a positive USD value. Zero is treated as not supplied by Reporting. Do not combine a positive amount with `is_determined: true`. | 15000 |
| is_determined | boolean | ⚙️ Optional | **Optional**. Send `true` when the amount is unknown. The budget may also be omitted; the project itself still needs `grant_title`. | false |

These budget fields are stored for Innovation Development and Innovation Use, but are optional for both and never gate submission. For Innovation Use, an omitted or zero amount is stored by Reporting as yet to be determined. `grant_title` remains required for every bilateral project entry, and at least one project entry is required.
