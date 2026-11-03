# Capacity Sharing

## Overview

`capacity_sharing`

Describes the attributes of **Capacity Sharing / Training**–related results.

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **number_people_trained** | object | ✅ | Disaggregation of participants trained by gender/unknown. At least one sub-field must be provided. | { "women": 12, "men": 20 } |
| **length_training** | string (enum) | ✅ | Duration/type of the training. | "Short-term" |
| **delivery_method** | string (enum) | ✅ | How the training was delivered (online, in person, blended). | "Blended (in-person and virtual)" |

---

## Number people trained

`number_people_trained`

Breakdown of how many people were trained.

> ⚠️
> **At least one field is required**
> 

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **women** | number | ⚙️ Optional (at least one of the four is required) ⚠️ | Number of women trained. | 25 |
| **men** | number | ⚙️ Optional (at least one of the four is required) ⚠️ | Number of men trained. | 18 |
| **non_binary** | number | ⚙️ Optional (at least one of the four is required) ⚠️ | Number of non-binary participants trained. | 2 |
| **unknown** | number | ⚙️ Optional (at least one of the four is required) ⚠️ | Number of participants whose gender is not reported / unknown. | 5 |

> ℹ️
> **Validation rule:**
> 
> **at least one**
> 

---

## Length training

`length_training`

Specifies the duration or type of training.

| **Value** | **Description** |
| --- | --- |
| **“PhD”** | Doctoral-level training. |
| **“Master”** | Master-level training. |
| **“Short-term”** | Short-term training (workshop, short course, etc.). |
| **“Long-term”** | Long-term training not classified as Master/PhD (e.g. multi-month programs). |

> ✅
> **Required**
> 

> ❗ Must be one of: "PhD", "Master", "Short-term", "Long-term".

---

## Delivery method

`delivery_method`

How the training or capacity sharing activity was delivered.

| **Value** | **Description** |
| --- | --- |
| **“Virtual / Online”** | Training delivered fully online. |
| **“In person”** | Training delivered fully face-to-face. |
| **“Blended (in-person and virtual)”** | Training combining online and in-person components. |

> ✅
> **Required**
> 

> ❗ Must be one of: "Virtual / Online", "In person", "Blended (in-person and virtual)".

---

## Data usage example

```text
"capacity_sharing": {
  "number_people_trained": {
    "women": 25,
    "men": 18,
    "non_binary": 2,
    "unknown": 5
  },
  "length_training": "Short-term",
  "delivery_method": "Blended (in-person and virtual)"
}
```

## Full example

<!-- example: cap-sharing.json -->
