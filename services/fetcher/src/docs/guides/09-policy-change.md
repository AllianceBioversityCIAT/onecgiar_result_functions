# Policy Change

## Overview

`policy_change`

Describes the attributes of a **Policy Change** result.

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **policy_type** | object | ✅ | Type of policy change and (for some cases) the amount and status. | { "id": 1, "name": "Budget or investment", "status_amount": { "id": 2, "name": "Increased" }, "amount": 500000 } |
| **policy_stage** | object | ✅ | Stage of the policy in the policy cycle. | { "id": 3, "name": "Implemented" } |
| **implementing_organization** | array[object] | ✅ (min 1) | List of organizations/institutions implementing the policy change. | [ { "institutions_id": 1279 }, { "institutions_acronym": "ICARDA" } ] |

> ✅
> **Validation:**
> 

> policy_change is an object required in the payload when type = "policy_change".

---

## Policy type

`policy_type`

Defines the **type of policy change** and, when applicable, the **amount** and its **status**.

- **CLARISA Policy Types:** [https://api.clarisa.cgiar.org/api/policy-types](https://api.clarisa.cgiar.org/api/policy-types)

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **id** | integer | ⚙️ Optional (if **name** is provided) ⚠️ | Identifier of the policy type. | 1 |
| **name** | string | ⚙️ Optional (if **id** is provided) ⚠️ | Descriptive name of the policy type. | "Budget or investment" |
| **status_amount** | object | Conditional | Required **only if** id = 1. Describes the status of the budget/investment amount. | { "id": 2, "name": "Increased" } |
| **amount** | integer | Conditional | Required **only if** id = 1. Numeric amount associated with the policy change (e.g., budget allocation). | 500000 |

> **⚠️ Important validation rules (according to the schema):**

- At least one of these conditions must be met:
  - policy_type.id is present, **or**
  - policy_type.name is present.
- If policy_type.id = 1 ⇒ **status_amount and amount are mandatory**.
- If policy_type.id ≠ 1 ⇒ **status_amount and amount fields are NOT allowed** (they must not be included in the payload).

---

## Status amount

`status_amount`

Status of the amount associated with the policy change (only applies to policy_type.id = 1).

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **id** | integer | ⚙️ Optional (if **name** is provided) ⚠️ | Identifier of the amount status. | 2 |
| **name** | string | ⚙️ Optional (if **id** is provided) ⚠️ | Descriptive label of the amount status. | "Increased" |

> **🔎 As with other objects: you must provide**
> **id**
> 
> **name**
> 

---

## Policy stage

`policy_stage`

Defines the **stage of the policy** in the policy cycle.

- **CLARISA Policy Stages:** [https://api.clarisa.cgiar.org/api/policy-stages](https://api.clarisa.cgiar.org/api/policy-stages)

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **id** | integer | ⚙️ Optional (if **name** is provided) ⚠️ | Identifier of the policy stage. | 3 |
| **name** | string | ⚙️ Optional (if **id** is provided) ⚠️ | Descriptive label of the policy stage. | "Implemented" |

> ✅ At least one of the two: id or name.

---

## Implementing organization

`implementing_organization`

Organizations/institutions that are **implementing** the policy change.

**Array:**

- Type: array[object]
- **Required:** ✅
- **minItems:** 1 (al menos una organización)
- **CLARISA Institutions:** [https://api.clarisa.cgiar.org/api/institutions](https://api.clarisa.cgiar.org/api/institutions)

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **institutions_id** | integer | ⚙️ Optional ⚠️ | Numeric identifier of the institution (CLARISA ID). | 1279 |
| **institutions_acronym** | string | ⚙️ Optional ⚠️ | Acronym of the institution. | "ICARDA" |
| **institutions_name** | string | ⚙️ Optional ⚠️ | Full name of the institution. | "International Center for Agricultural Research in the Dry Areas" |

> **⚠️ Validation rules per item:**

- Each organization must have **at least one** of these fields:
  - institutions_id
  - institutions_acronym
  - institutions_name
- No additional properties other than these three are allowed.

---

## Data usage example

```json
"policy_change": {
  "policy_type": {
    "id": 1,
    "name": "Budget or investment",
    "status_amount": {
      "id": 2,
      "name": "Increased"
    },
    "amount": 500000
  },
  "policy_stage": {
    "id": 3,
    "name": "Implemented"
  },
  "implementing_organization": [
    {
      "institutions_id": 1279,
      "institutions_acronym": "ICARDA",
      "institutions_name": "International Center for Agricultural Research in the Dry Areas"
    },
    {
      "institutions_acronym": "MoA-Uganda"
    }
  ]
}
```

## Full example

<!-- example: policy.json -->
