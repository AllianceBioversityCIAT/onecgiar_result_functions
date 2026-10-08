# Fragmentos para la página existente — reenvío de resultados rechazados (`data.result_code`) y `keep_editing`

> **Destino:** [PRMS Normalizer — Technical Field Documentation](https://cgiar-prms.notion.site/PRMS-Normalizer-Technical-Field-Documentation-287f271224788055a0d9c2bc23b1a06b)
>
> Dos campos nuevos dentro de `data` que una plataforma productora (STAR, MEL, TIP…) **tiene que conocer para poder enviarlos**, y que hoy no aparecen en la página:
>
> - `result_code` — reenviar un resultado **rechazado** (o continuar uno aprobado de una fase anterior) por el mismo `POST /ingest`. Ya está en producción (PRMS `master`, specs `bilateral/resubmit-rejected-result` + `bilateral/rejected-result-correction` + `bilateral/resubmit-followups`).
> - `keep_editing` — crear el resultado en `Editing` en vez de `Pending Review` (P2-3428). En producción desde 2026-09.
>
> **El Fetcher no necesita cambios de código para ninguno de los dos.** El schema base acepta campos extra (`common_fields.json`, `additionalProperties: true`), el normalizer solo toca `title`, `description` y `contributing_initiatives`, y los procesadores reenvían `data` completo a `POST /api/bilateral/create`. Por eso esto es **solo documentación**.
>
> Fuente de verdad del comportamiento: `onecgiar_pr/onecgiar-pr-server/docs/bilateral-result-summaries.en.md`, secciones "`data.result_code` on `POST /create`" y "Resubmitting a rejected result". Si algo de aquí contradice ese archivo, gana ese archivo.
>
> ⚠️ No pude leer la página publicada (Notion la renderiza con JavaScript), así que los **"Dónde"** asumen la estructura que describen los fragmentos anteriores. Si la página tiene una sección **Request structure** con los campos de `data`, los Fragmentos 2 y 3 van ahí; si los campos viven en el toggle **🧱 Common Fields**, van ahí, justo después de `external_reference`.
>
> Related: [`notion-main-page-fragments.md`](./notion-main-page-fragments.md) · [`notion-fragments-version-endpoint.md`](./notion-fragments-version-endpoint.md) · [`notion-webhooks-page.md`](./notion-webhooks-page.md)

---

## Fragmento 1 — filas del change log

**Dónde:** la tabla bajo `## 🚨 Breaking changes & new capabilities`, **arriba** de las filas existentes (más reciente primero).

| **Date** | **Change** | **Action required** |
| --- | --- | --- |
| **2026-10** | **New:** resubmit a **rejected** result. Send the corrected result through the same `POST /ingest` with `data.result_code` set to the code of the rejected result. PRMS replaces the data **on the same record** (same result code) and puts it back in review. See **[Resubmitting a rejected result](#)**. | None to keep ingesting. To fix a rejected result, resend it with its `result_code` — **do not** submit it again without the code: that creates a second, unrelated result. Send the **complete** result: a section you leave out is cleared, not kept. |
| **2026-09** | **New:** `keep_editing` in `data` (optional boolean). `true` creates the result in **Editing** instead of **Pending Review**, so a centre user completes it in the PRMS Reporting Tool and submits it for review from there. | None. Absent or `false` keeps today's behaviour. |

---

## Fragmento 2 — `result_code` (entrada nueva)

**Dónde:** en **Request structure** / toggle **🧱 Common Fields**, justo después de `external_reference`.

### **🔹 result_code 🆕**

The PRMS code of a result that **already exists** — the number PRMS returned when you first sent it, and the one users see in the Reporting Tool. Send it only when you want to **continue** that result instead of creating a new one. Leave it out for a new result.

| **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- |
| **string** of digits, or **integer** | ⚙️ Optional | Code of an existing PRMS result. Both `"28565"` and `28565` are accepted. | `"28565"` |

**What PRMS does with it** — it depends on the state of that result:

| The result with that code… | What happens | `outcomes[].operation` |
| --- | --- | --- |
| *(no `result_code` sent)* | A new result is created, as always. | `created` |
| is **Rejected** in the current reporting phase | **Resubmission.** Its data is replaced on the same record and it goes back to **Pending Review**. | `updated` |
| was **Approved** in a previous phase and has no version in the current one | A new version is created in the current phase, keeping the same code. (Same effect as `POST /version`, but with the full payload.) | `versioned` |
| is in any other status in the current phase (Editing, Pending Review, Approved…) | Refused with `409`. Nothing changes. | — |

> ⚠️ **Where to get it:** keep the `result_code` from the ingest response of the first submission (`results[].result.result_code`) or from the decision webhook (`data.result_code`). PRMS does not look results up by your `external_reference`.

> ❗ **Only your own results.** A result reported by another platform is refused (`403`). **Knowledge Products** cannot be resubmitted or versioned this way (`409`): their metadata belongs to CGSpace.

---

## Fragmento 3 — `keep_editing` (entrada nueva)

**Dónde:** en el mismo lugar que el Fragmento 2, después de `result_code`.

### **🔹 keep_editing 🆕**

Asks PRMS to create the result in **Editing** instead of sending it straight to review. Use it when your platform only captures part of the result and a centre user finishes it in the PRMS Reporting Tool.

| **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- |
| **boolean** | ⚙️ Optional (default `false`) | `true` → the result is created in **Editing** (`status_id 1`). A centre user completes it in PRMS and selects **Submit for review**. `false` or absent → **Pending Review** (`status_id 5`), as before. | `true` |

> ℹ️ **It goes inside `data`, once per result.** A flag at the top level of the request is not forwarded. A value that is not a boolean is rejected at validation.

> ℹ️ **It is ignored on a resubmission.** A rejected result sent back with its `result_code` always returns to Pending Review.

> ℹ️ The decision webhook still reaches you: when the Science Program decides on the result, you are notified as for any other result you reported.

---

## Fragmento 4 — la sección del reenvío (NUEVA)

**Dónde:** sección nueva al mismo nivel que la de ingesta y la de `POST /version`. Si la página tiene un índice, agregarla ahí. Es el destino del link `#` del Fragmento 1.

## **🔄 Resubmitting a rejected result**

When a Science Program rejects one of your results, you correct it in your platform and send it back. The result keeps its code, its history and its place in the review queue: it is the same result, corrected, not a new one.

### The cycle

1. **Submit** the result with `POST /ingest`. Store the `result_code` from the response (`results[].result.result_code`).
2. **Get the decision.** With a callback registered (`POST /webhook`), PRMS sends you `decision: "REJECT"` with the reviewer's `justification`, the `result_code` and your `external_reference`.
3. **Correct it** in your platform. Your platform decides how the user edits a rejected result. PRMS only needs the corrected payload.
4. **Resend** it with `POST /ingest`, using the same structure plus `data.result_code`.
5. The result is back in **Pending Review**. The next decision reaches you the same way. A result can go through this cycle more than once.

### Request

Same endpoint, same API key, same structure as a new result. The only addition is `result_code` inside `data`:

```json
{
  "tenant": "star",
  "results": [
    {
      "type": "policy_change",
      "data": {
        "result_code": "28565",
        "external_reference": "STAR-9f2c-4471",
        "...": "the complete, corrected result"
      }
    }
  ]
}
```

> ⚠️ **Send the complete result, not only what changed.** A section you send replaces the previous one, and **a section you leave out is cleared**. (Exception: a missing `lead_contact_person` keeps the stored value.)

> ⚠️ **The type cannot change.** If the corrected result is of a different type, it is a new result: send it without `result_code`.

### Response

A resubmitted row comes back like any processed row. Read PRMS's verdict in `results[].externalApiResponse.response.outcomes[]`:

```json
{ "result_code": 28565, "operation": "updated", "status_id": 5, "status": "pending review" }
```

When PRMS refuses it, the row has `success: false` and the reason in `results[].errorDetails.externalApiResponse.message`. The HTTP status of the whole request is then `207`.

### What gets refused

Everything is checked **before** anything is written. A refused resubmission leaves the result exactly as it was.

| PRMS status | When | What to do |
| --- | --- | --- |
| `409` | The result is not **Rejected** (for example, it is still Pending Review or already Approved). | Nothing to resubmit. Only rejected results can be resubmitted. |
| `409` | The payload's type differs from the stored type. | Send it as a new result, without `result_code`. |
| `409` | It is a Knowledge Product. | Not supported. |
| `403` | The result was reported by another platform. | Only the platform that reported a result can resubmit it. |
| `404` | No active result has that code. | Check the code. |
| `400` | No primary Science Program (`toc_mapping.science_program_id`). | Add it. |
| `400` | No lead bilateral project, or more than one flagged `is_lead`. | Send one project, or flag exactly one `is_lead`. |
| `400` | The primary Science Program is not allocated to the lead project. | Choose a Science Program mapped to that project. |
| `400` | `lead_center` does not match a CGIAR center. | Fix the acronym, name or `institution_id`. |
| `409` | `is already being resubmitted` | Another attempt is in progress. Wait and try again. |

### Retrying safely

| What you see | What it means | What to do |
| --- | --- | --- |
| `400` / `403` / `404` / `409` | Refused before any write. | Fix the payload. **Do not resend it unchanged.** |
| `5xx` or a timeout | Failed before finishing. The result is still **Rejected** and can be resubmitted. | **Resend the same request.** |
| `409 … its status is pending review` right after a timeout | Your previous attempt **did** go through. | **Do not resend.** It is done. |
| `503` | Temporary fault. The result stays Rejected. | Resend after a short wait. |

> ℹ️ **History is kept.** Each resubmission is recorded in the result's review history next to the previous rejection, so the Science Program sees the whole conversation (`REJECT`, `RESUBMIT`, `REJECT`, `RESUBMIT`…).

---

## Fragmento 5 — callout en la página de webhooks

**Dónde:** en **[PRMS Result Decision Webhooks](./notion-webhooks-page.md)**, justo después de la descripción del payload (donde se explica `decision`).

> 🔄 **Received a `REJECT`?** Correct the result in your platform and send it back through `POST /ingest` with `data.result_code` set to the `result_code` in this callback. It returns to review on the same record. See **[Resubmitting a rejected result](#)**.

---

## Fragmento 6 — el ejemplo completo

**Dónde:** el bloque **📤 Complete Valid Example**. **No tocar el ejemplo principal**: es de un resultado nuevo, y si se copia con `result_code` produce `404`/`409`. Agregar debajo una nota corta:

> ℹ️ To **resubmit** a rejected result, send this same payload with `"result_code": "<the rejected result's code>"` as an additional field in `data`. See **[Resubmitting a rejected result](#)**.

---

## Nota para quien publique

- **Orden:** primero el Fragmento 4 (la sección nueva) y después los demás, para que los links `#` apunten a algo. Reemplazar `#` por el link al encabezado una vez publicado.
- **`openapi.json` del Fetcher** (`services/fetcher/src/docs/openapi.json`, lo que sirve `/docs`): `keep_editing` ya estaba documentado ahí (y el Fetcher lo valida: un valor no booleano se rechaza). `result_code` se agregó como propiedad opcional de `data` en `ResultData`, junto con la nota de que `keep_editing` se ignora al reenviar.
- El `status` de una fila `updated` es `"pending review"`, con espacio. Las filas `created`/`versioned` traen `"pending-review"`, con guion. Es así en PRMS hoy. Si una plataforma compara por texto, que compare `status_id`.
