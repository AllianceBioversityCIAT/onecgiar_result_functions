# Innovation Use

## Overview

`innovation_use`

Captures how the innovation is currently being used, by **actors**, **organizations**, and optional **measures**.

**Innovation Use minimum data set**

An Innovation Use result is accepted only when it includes:

- At least one identified entry in `contributing_bilateral_projects[]`; every entry must include `grant_title`.
- At least one actor in `current_innovation_use_numbers.actors`, unless `innov_use_to_be_determined` is `true`.
- `measures` is optional. If current use is known and a non-empty list is sent, at least one row must include both a non-blank `unit_of_measure` and a numeric `quantity`. When `innov_use_to_be_determined` is `true`, measures are ignored.
- Bilateral project budgets are optional. If supplied, use a positive `usd_budget` when known or `is_determined: true` when unknown; omitting the amount or sending zero is treated by Reporting as yet to be determined.
- `organization` is optional and is not an MDS requirement.
`innovation_use_level` is optional and is not part of the minimum data set.

---

## Innovation use level 🆕

`innovation_use_level`

The stage of use being claimed. Optional. When supplied, it may be identified by level or name; omitting it does not block Innovation Use creation or submission.

| id | name | level | definition |
| --- | --- | --- | --- |
| 1 | No use | 0 | Innovation is not used. |
| 2 | Project lead organization | 1 | Innovation is used by organization(s) leading the innovation development. |
| 3 | Partners | 2 | Innovation is used by some partners involved in initial innovation development. |
| 4 | Partners | 3 | Innovation is commonly used by partners involved in initial innovation development. |
| 5 | Connected next-user | 4 | Innovation is used by some organizations connected to partners involved in the initial innovation development. |
| 6 | Connected next-user | 5 | Innovation is commonly used by organizations connected to partners involved in the initial innovation development. |
| 7 | Unconnected next-user | 6 | Innovation is used by organizations not connected to partners involved in the initial innovation development. |
| 8 | Unconnected next-user | 7 | Innovation is commonly used by organizations not connected to partners involved in the initial innovation development. |
| 9 | End-user / Beneficiaries | 8 | Innovation is used by some end-users or beneficiaries who were not involved in the initial innovation development. |
| 10 | End-user / Beneficiaries | 9 | Innovation is commonly used by end-users or beneficiaries who were not involved in the initial innovation development. |

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **level** | integer or string | ⚙️ Optional (if **name** is provided) | Coded level, from the table above. **Preferred over the name.** | 2 |
| **name** | string | ⚙️ Optional (if **level** is provided) | Descriptive label of the level, matched against the table above. | "Scaling" |

```json
"innovation_use": {
  "innovation_use_level": { "level": 2 },
  "current_innovation_use_numbers": { }
}
```

---

## Current innovation use numbers

`current_innovation_use_numbers`

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **innov_use_to_be_determined** | boolean | ✅ | Whether current use figures are still to be determined. When `true`, actors are not required and measures are ignored by the MDS. | false |
| **actors** | array[object] | ✅ Required unless **innov_use_to_be_determined** is `true` ⚠️ | Actor groups using the innovation, with optional sex/age disaggregation. Must hold at least one. | [{ "actor_type_id": 1, "how_many": 120 }] |
| **organization** | array[object] | ⚙️ Optional | Organizations/institutions using the innovation. | [{ "institution_types_id": 10, "how_many": 3 }] |
| **measures** | array[object] | ⚙️ Optional | Optional quantitative measure rows. When current use is known, a non-empty list must contain at least one row with both unit and numeric quantity. Ignored when use is marked TBD. | [{ "unit_of_measure": "Hectares", "quantity": 2500 }] |

✅ **Validation rules (schema):**

- `innov_use_to_be_determined` is required.
- `actors` must contain at least one entry unless `innov_use_to_be_determined` is `true`.
- `measures` may be omitted or empty. When use is known, a non-empty list must contain at least one complete measure; other incomplete rows alongside that complete row are tolerated. When use is TBD, measures are not validated by the MDS.
- `organization` is optional and does not satisfy or replace any MDS requirement.
- `innovation_use_level` is optional; see its subsection.

> ⚠️ **Changed 2026-09.** Two things read differently before:
> - The rule was an **or**: any one of `actors`, `organization` or `measures` satisfied it. Now `actors` and `measures` are demanded separately, and `organization` satisfies neither.
> - The **Required** column had the condition backwards on all three rows — it said they were needed when `innov_use_to_be_determined` was `true`, which is exactly when actors are not.

---

## Actors

`actors`

Represents groups of actors using the innovation.

| actor_type_id | name |
| --- | --- |
| 1 | Farmers/ (agro)pastoralist/ herders/ fishers |
| 2 | Researchers |
| 3 | Extension agents |
| 4 | Policy actors (public or private) |
| 5 | Other |

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **result_actors_id** | string or integer | ❌ | Internal identifier for the actor record (if available). | 105 |
| **actor_type_id** | string or integer | ⚙️ Optional (if **actor_type_name** is provided) | Coded type of actor, from the table above. **Preferred over the name.** | 5 |
| **actor_type_name** | string | ⚙️ Optional (if **actor_type_id** is provided) ⚠️ | Descriptive label of the actor type, matched against the table above. Case-insensitive and tolerant of spacing around the slashes. An unresolvable name is rejected. | "Researchers" |
| **other_actor_type** | string or null | Conditional | Required when `actor_type_id` = 5. Describes the specific actor type when "Other" is selected. | "Youth farmer groups" |
| **sex_and_age_disaggregation** | boolean or null | ❌ | ⚠️ **Reads as "does not apply".** `false` (or omitted) → report `women` / `men` with their youth. `true` → the disaggregation is **not** available for this group, so report `how_many` only. | false |
| **how_many** | string, integer or null | Conditional | Total number of actors in this group. Required when `sex_and_age_disaggregation` = `true`. | 120 |
| **women** | string, integer or null | ❌ | Number of women in this actor group. | 60 |
| **women_youth** | string, integer or null | ❌ | Number of women in this group who are youth. **Counted within `women`**, so it can never exceed it. | 25 |
| **men** | string, integer or null | ❌ | Number of men in this actor group. | 40 |
| **men_youth** | string, integer or null | ❌ | Number of men in this group who are youth. **Counted within `men`**, so it can never exceed it. | 15 |
| **previousWomen** | string, integer or null | ❌ | Historical value of women in previous reporting (if applicable). | 50 |

**How youth is reported**

Youth is a subset of each sex, not a separate group:

```json
{
  "actor_type_id": 1,
  "sex_and_age_disaggregation": false,
  "women": 400, "women_youth": 100,
  "men": 450,   "men_youth": 50
}
```

PRMS derives non-youth as the difference and does not store it. **There is no total-youth field** — a youth figure that is not split by sex has nowhere to go.

> ✅
> **Validation rules (schema):**
> 

- At least **one** must be provided: `actor_type_id` **or** `actor_type_name`.
- If `sex_and_age_disaggregation` **is present and** = `true` → `how_many` is **required**.
- If `actor_type_id` **is present and** is `"5"` or `5` → `other_actor_type` is **required**.
- `women_youth` ≤ `women`, and `men_youth` ≤ `men`. ⚠️ new 2026-08

> ⚠️ **Changed 2026-08.** Three things behaved differently before, all now fixed:
> - An actor sent with `actor_type_name` and no `actor_type_id` was **silently dropped** — stored with no type, and the request still returned `200` with "All results processed successfully". If you send names, verify the actors you expect came back.
> - Youth was never checked against its sex total: `women: 10, women_youth: 999` was stored as sent, and the derived non-youth clamped to 0.
> - The last two conditional rules fired when the field was **absent**, not just when it held the triggering value. Omitting `sex_and_age_disaggregation` demanded `how_many`, and identifying an actor by name demanded `other_actor_type`. Both now require the field to be present.

---

## Measures

`measures`

What the innovation use is counted in. **At least one entry must carry both halves** — a unit and a quantity. A measure with only one of the two counts for nothing.

Measures are optional. When `innov_use_to_be_determined` is `true`, they are ignored by the MDS. Otherwise, if a non-empty measure list is supplied, at least one entry must have both a non-blank unit and numeric quantity. A quantity of `0` is valid.

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **unit_of_measure** | string | ✅ | Unit the quantity is expressed in. Must not be blank or whitespace. | "# of Innovations" |
| **quantity** | string or number | ✅ | How much of that unit. | 2 |

```json
"measures": [
  { "unit_of_measure": "# of Innovations", "quantity": 2 },
  { "unit_of_measure": "Hectares", "quantity": 1500.5 }
]
```

✅ **Validation rules (schema):**

- The `measures` property may be omitted or be an empty array.
- For known current use, a non-empty array must contain at least one complete row: a non-blank `unit_of_measure` and numeric `quantity`.
- `quantity: 0` is valid.
- Extra incomplete entries alongside a complete one are tolerated.
- When `innov_use_to_be_determined` is `true`, measures are ignored by the MDS.

> ⚠️ **Updated 2026-09-24.** `measures` may be omitted or sent as an empty array. When current use is known and a non-empty array is supplied, at least one row must include both a non-blank `unit_of_measure` and a numeric `quantity`. Whole-number quantities such as `2` are valid. When `innov_use_to_be_determined` is `true`, measures are ignored  by the MDS.

---

## Data usage example

```json
"innovation_use": {
  "innovation_use_level": { "level": 2, "name": "Scaling" },
  "current_innovation_use_numbers": {
    "innov_use_to_be_determined": false,
    "actors": [
      {
        "actor_type_id": 1,
        "sex_and_age_disaggregation": false,
        "how_many": 120,
        "women": 60,
        "women_youth": 25,
        "men": 40,
        "men_youth": 15
      },
      {
        "actor_type_id": 5,
        "other_actor_type": "Local agribusinesses",
        "sex_and_age_disaggregation": true,
        "how_many": 10
      }
    ],
    "measures": [
      { "unit_of_measure": "Hectares", "quantity": 2500 },
      { "unit_of_measure": "Households", "quantity": 800 }
    ]
  }
}
```

## Full example

<!-- example: inno_use.json -->
