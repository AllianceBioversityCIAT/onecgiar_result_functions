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
- **Ignored on a resubmission** (`result_code` of a rejected result): a resubmitted result always returns to **Pending review**.
- **Read on a Knowledge Product correction in Editing**: `true` keeps it in **Editing**, `false` or absent sends it to **Pending review**. See **Result code**.

> ⚠️ **New 2026-09.** The field was silently discarded before it was declared: the schemas set `additionalProperties: true`, so `keep_editing` was passed through untouched and then dropped further down by Reporting's whitelist. Sending it produced no error **and no effect**. Two things changed — it is now declared on all seven types, so a non-boolean is rejected here with the row's `external_reference` instead of being forwarded; and Reporting reads it.

---

## Result code 🆕

`result_code`

The PRMS code of a result that **already exists**: the number PRMS returned when you first sent it, and the one users see in the Reporting Tool. Send it to **continue** that result instead of creating a new one: to resubmit it after a **rejection**, or to carry it into the current phase after it was **approved in a previous phase**.

- **Type:** string or integer
- **Required:** ⚙️ Optional
- **Description:** Digits only. `"28565"` and `28565` are both accepted. Omit it to create a new result, exactly as before.
- **Example:** `28565`

**What PRMS does with it depends on the status of that result:**

| **The result with that code…** | **What happens** | **`outcomes[].operation`** |
| --- | --- | --- |
| *(no `result_code` sent)* | A new result is created, as always. | `created` |
| is **Rejected** in the current reporting phase | **Resubmission.** Its data is replaced **on the same record** (same result code) and it returns to **Pending Review**. | `updated` |
| is a **Knowledge Product** in **Rejected** or **Editing** in the current phase 🆕 | **Correction.** Only the fields that do not come from CGSpace are replaced, on the same record. See **Correcting a Knowledge Product** below. | `updated` |
| was **Approved** in a previous phase and has no version in the current one | A new version is created in the current phase, keeping the same code. Same effect as `POST /version`, but with the data in this payload. Not available for Knowledge Products. | `versioned` |
| is in **any other status** in the current phase (Editing, Pending Review, Approved…) | Refused with `409`. Nothing changes. Edit it in the PRMS Reporting Tool instead. | — |

The operation is returned in `results[].externalApiResponse.response.outcomes[]` of the ingest response.

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

> ⚠️ **Send the full result, in both cases.** On a **resubmission**, the payload replaces what PRMS holds: a section you leave out is **cleared, not kept** (evidence, projects, partners, ToC mapping…). The only exception is `lead_contact_person`, which keeps its stored value. On a **version**, nothing is copied from the previous phase: the new version is built only from this payload.

> ⚠️ **Where to get the code:** keep the `result_code` from the ingest response of the first submission (`results[].result.result_code`) or from the decision webhook (`data.result_code`). PRMS never looks a result up by your `external_reference`.

> ℹ️ **Resulting status.** A **resubmitted** result always returns to `Pending Review`: `keep_editing` is ignored. A **version** follows `keep_editing`, as for a new result: `false` → `Pending Review`, `true` → `Editing`.

> ✅
> **Validation rules (PRMS):**
> 

- **Only your own results.** A result reported by another platform is refused (`403`).
- **Knowledge Products can be corrected, not versioned.** A KP in Rejected or Editing in the current phase can be corrected (see below). A KP that exists only in a previous phase cannot be carried forward (`409`): report it again with its own handle.
- **Same type on a resubmission.** `result_type_id` must match the stored result (`409`). A different type means a new result.
- **A resubmission needs** a primary Science Program (`toc_mapping.science_program_id`) allocated to the lead project, and exactly one lead project: a single project, or one flagged `is_lead` (`400`).
- **Retrying a resubmission.** After a timeout or a `5xx`, resend the same request. If it then returns `409` saying the status is *pending review*, your earlier attempt went through: do not resend again.

### Correcting a Knowledge Product 🆕

A Knowledge Product is corrected through the same `POST /ingest`, with `type: "knowledge_product"` and `data.result_code` set to its code. Its metadata belongs to CGSpace, so PRMS only takes from your payload the fields **you** own.

| **Data** | **Source after the correction** |
| --- | --- |
| Lead center, contributing centers, ToC mapping and contributing programs, contributing partners, bilateral projects, lead contact person | **Your payload.** Replaced on the same record. A section you leave out is cleared, as on any resubmission. |
| Title, description, geographic focus, authors, keywords, year, DOI, licence and the rest of the KP metadata | **CGSpace.** Re-read from CGSpace with the stored handle. Values in your payload are **ignored**. |
| Handle and its evidence link | **Kept as stored.** |
| Partners that CGSpace contributed | **Kept**, even if your payload does not send them. |

**Resulting status:**

| **KP status** | **`keep_editing`** | **After the correction** |
| --- | --- | --- |
| Rejected | any (ignored) | Pending Review |
| Editing | `true` | Stays in Editing |
| Editing | `false` or absent | Pending Review |
| Any other (Pending Review, Approved…) | — | Refused with `409`. Nothing changes. |

```json
{
  "type": "knowledge_product",
  "data": {
    "result_code": 28565,
    "external_reference": "STAR-KP-186314",
    "knowledge_product": { "handle": "https://hdl.handle.net/10568/186314" },
    "lead_center": { "institution_id": 46, "acronym": "CIAT (Alliance)" },
    "contributing_partners": [{ "institution_id": 6983 }],
    "toc_mapping": { "science_program_id": "SP03", "...": "..." },
    "contributing_bilateral_projects": [{ "grant_title": "C-A486", "is_lead": true }],
    "...": "the rest of the fields you own, complete"
  }
}
```

> ℹ️ `geo_focus` is not required on a correction: the geography comes from CGSpace. A new `title` in the payload does not trigger the duplicate-title check, because it is ignored.

> ✅
> **Validation rules (PRMS), all checked before anything is written:**
> 

| **Code** | **When** |
| --- | --- |
| `400` | `knowledge_product.handle` is missing (refused by this API's validator, in `rejected[]`). |
| `403` | The KP was reported by another platform. |
| `409` | The handle differs from the stored one. `https://hdl.handle.net/10568/X`, `https://cgspace.cgiar.org/handle/10568/X` and `10568/X` count as the same handle. |
| `409` | The KP is not in Rejected or Editing: *"Result {code} cannot be corrected: its status is {status}."* |
| `409` | The KP exists only in a previous phase, or its status changed while the correction was being processed. |
| `422` | CGSpace's reporting-cycle rule refuses the handle. The CGSpace message is passed through unchanged. |
| `502` | CGSpace could not be read. Nothing was changed: retry later. |

> ⚠️ A refusal changes nothing: the stored KP stays exactly as it was. Review history keeps every earlier rejection and its justification, and each correction adds a *Resubmitted* entry.

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

- **CLARISA bilateral Projects (current phase):** [https://api.clarisa.cgiar.org/api/projects?phase=2026](https://api.clarisa.cgiar.org/api/projects?phase=2026)

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **grant_title** | string | ✅ | **Registry code of the bilateral / NPP project** — the `external_code` field of the CLARISA projects catalogue, sent on its own. Do **not** send the full project title, and do not send code and title concatenated: the catalogue holds legacy rows under a past reporting phase whose name fields carry that concatenated form, and matching one of those binds the result to a project that no PRMS screen can show. A `grant_title` that resolves to no project of the current reporting phase is **rejected with 400** — before 2026-09-21 it was skipped silently and the result was created without the project or its investment. | D-200358 |
| **is_lead** | boolean | ⚙️ Optional | **Flag to identify an Bilateral Project Lead** | false |
| usd_budget | number | ⚙️ Optional | **Optional**. If the contribution amount is known, send a positive USD value. Zero is treated as not supplied by Reporting. Do not combine a positive amount with `is_determined: true`. | 15000 |
| is_determined | boolean | ⚙️ Optional | **Optional**. Send `true` when the amount is unknown. The budget may also be omitted; the project itself still needs `grant_title`. | false |

These budget fields are stored for Innovation Development and Innovation Use, but are optional for both and never gate submission. For Innovation Use, an omitted or zero amount is stored by Reporting as yet to be determined. `grant_title` remains required for every bilateral project entry, and at least one project entry is required.

### Finding the project code

| Need | Request |
| --- | --- |
| Every project you can report against now | `GET https://api.clarisa.cgiar.org/api/projects?phase=2026` |
| Check one code before sending it | `GET https://api.clarisa.cgiar.org/api/projects?phase=2026&code=D-200358` (an empty array means PRMS will reject it) |

- **Use the current phase only.** In the current phase every project has an `external_code` and each code appears once. The unfiltered list also returns past-phase rows. Some of those have no code or repeat the same project, and PRMS does not accept them.
- **Codes are not carried across phases.** A project reported in a past phase may have a different code now, or no row at all. Look up the code again in the current phase instead of reusing the old one.
- **Missing or duplicated projects:** the catalogue is synced from the **W3 Registry**. PRMS and CLARISA do not edit it. If a project is missing, duplicated or has the wrong code, ask the project owner to correct it in the W3 Registry. The change shows up in CLARISA after the next sync.
