# Innovation Development

## Overview

`innovation_development`

Describe los atributos específicos del resultado de **Innovation Development**.

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **innovation_typology** | object | ✅ | Typology of the innovation (by code or descriptive name). | { "code": 12, "name": "Technological innovation" } |
| **innovation_developers** | string | ❌ | Semicolon-separated list of main developers or organizations. | "John Doe; Marie Curie; CGIAR Breeding Team" |
| **innovation_readiness_level** | object | ✅ | Readiness level of the innovation, using PRMS readiness scale (id or name). | { "id": 14, "name": "Phase 3 - Available for uptake" } |

---

## Innovation typology

`innovation_typology`

- **CLARISA Type of Innovations:** [https://api.clarisa.cgiar.org/api/innovation-types](https://api.clarisa.cgiar.org/api/innovation-types)

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **code** | number | ⚙️ Optional (if **name** is provided) ⚠️ | Numeric code representing the innovation typology. | 12 |
| **name** | string | ⚙️ Optional (if **code** is provided) ⚠️ | Descriptive name of the innovation typology. | "Technological innovation" |

> ⚠️
> **At least one is required:**
> 
> **code**
> 
> **name**
> 

---

## Innovation readiness level

`innovation_readiness_level`

- **CLARISA Innovation Readiness Levels:** [https://api.clarisa.cgiar.org/api/innovation-readiness-levels](https://api.clarisa.cgiar.org/api/innovation-readiness-levels)

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **id** | number | ⚙️ Optional (if **name** is provided) ⚠️ | Identifier of the innovation readiness level in PRMS. | 14 |
| **name** | string | ⚙️ Optional (if **id** is provided) ⚠️ | Descriptive label of the readiness level. | "Phase 3 - Available for uptake" |

> ⚠️
> **At least one is required:**
> 
> **id**
> 
> **name**
> 

---

## Data usage example

```json
"innovation_development": {
  "innovation_typology": {
    "code": 12,
    "name": "Technological innovation"
  },
  "innovation_developers": "John Doe; Marie Curie; CGIAR Breeding Team",
  "innovation_readiness_level": {
    "id": 14,
    "name": "Phase 3 - Available for uptake"
  }
}
```

## Full example

<!-- example: inno_dev.json -->
