# Fragmentos para la página existente

> **Destino:** [PRMS Normalizer — Technical Field Documentation](https://cgiar-prms.notion.site/PRMS-Normalizer-Technical-Field-Documentation-287f271224788055a0d9c2bc23b1a06b)
>
> Tres inserciones. La página completa de webhooks va aparte, en `notion-webhooks-page.md`.
>
> ⚠️ Reemplaza `(link)` por la URL de la página de webhooks una vez publicada. Publica esa primero.

---

## Fragmento 1 — el change log

**Dónde:** la tabla que hoy se llama `## 🚨 Breaking changes`.

**Antes de pegar, renombra el encabezado.** Nada de esto rompe a un productor existente: el campo nuevo es opcional y los webhooks son opt-in. Dejar el título como está haría que las filas mientan.

```
## 🚨 Breaking changes & new capabilities
```

Las dos filas nuevas van **arriba** de la de `lead_contact_person` (más reciente primero):

| **Date** | **Change** | **Action required** |
| --- | --- | --- |
| **2026-08** | **New:** `external_reference` in `data` — your own identifier for the result (consecutive, UUID, any string). Optional. Stored verbatim and returned verbatim on the decision webhook and in the ingest response. | None to keep ingesting. **Required in practice if you want to use webhooks**: without it a callback carries no field pointing at your record. |
| **2026-08** | **New:** self-service **decision webhooks**. Register an HTTPS callback with `POST /webhook` using your existing API key, and PRMS notifies you when a Science Program approves or rejects one of your results. See **[PRMS Result Decision Webhooks](link)**. | None to keep ingesting. To receive decisions, register a callback **before your results go under review** — decisions taken with no destination registered are not replayed. |
| **2026-08** | `lead_contact_person` (with `email` + `name`) is now **mandatory** in `data` for **all result types**. | Producers must add it to every payload, otherwise the request is rejected at validation (`(root) must have required property 'lead_contact_person'`). |

---

## Fragmento 2 — `external_reference`

**Dónde:** dentro del toggle **🧱 Common Fields (common_fields.json) All Results**, como **primera** entrada — antes de `created_date`.

### **🔹 external_reference 🆕**

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
>
> ⚠️ **But without it you cannot correlate.** The decision webhook tells you what was decided and why, and carries nothing that points at your row. If you plan to consume webhooks, send it.

> ❗ One value per result, not per request. In a payload with several results, each one carries its own.

---

## Fragmento 3 — el puntero a webhooks

**Dónde:** justo después de las dos tablas de **Service URLs** (PRODUCTION y TEST), antes de **Breaking changes**.

Corto a propósito: quien no necesita webhooks sigue de largo.

### **🔔 Result Decision Webhooks**

Submitting a result is one half of the exchange; the other is finding out what the Science Program decided about it. PRMS can POST that decision to an HTTPS endpoint of yours — approved or rejected, with the reviewer's justification and the full enriched result.

Registration is self-service and uses the API key you already have. The endpoints sit on the **Normal Ingest** base URL above.

**→ [PRMS Result Decision Webhooks](link)** — registration payload, callback contract, retries, and error responses.

---

## Fragmento 4 — el ejemplo completo

**Dónde:** el bloque **📤 Complete Valid Example** al final de la página.

Añade `external_reference` como primera línea de `data`, para que el ejemplo que la gente copia ya lo traiga:

```json
      "data": {
        "external_reference": "STAR-9f2c-4471",
        "created_date": "2025-10-24T19:36:04Z",
        "created_by": {
```
