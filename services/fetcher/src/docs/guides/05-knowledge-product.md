# Knowledge Product

## Overview

`knowledge_product`

Describes the knowledge product attributes.

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **handle** | string | ✅ | **Handle or DOI identifier.** | "hdl:20.500.12345/abc-2025" |

## Correcting a Knowledge Product 🆕

A Knowledge Product that is **Rejected** or still in **Editing** in the current phase can be corrected: resend it with `data.result_code` set to its code and the **same handle**.

- **Taken from your payload:** lead center, contributing centers, ToC mapping and contributing programs, partners, bilateral projects and lead contact person.
- **Re-read from CGSpace (payload ignored):** title, description, geography and the rest of the KP metadata.
- **Kept as stored:** the handle and its evidence link. The handle cannot change (`409`).
- **Status:** a Rejected KP returns to **Pending Review**. A KP in Editing stays in Editing with `keep_editing: true`, and goes to **Pending Review** otherwise.

Any other status is refused with `409`, and a KP from a previous phase cannot be carried forward. See **Common fields → Result code → Correcting a Knowledge Product** for the full rules and error codes.

## Full example

<!-- example: kp.json -->
