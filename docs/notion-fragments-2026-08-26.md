# Fragmentos para la página existente — cambios del 2026-08-26

> **Destino:** [PRMS Normalizer — Technical Field Documentation](https://cgiar-prms.notion.site/PRMS-Normalizer-Technical-Field-Documentation-287f271224788055a0d9c2bc23b1a06b)
>
> Cinco inserciones, todas en la misma página. Salieron de probar el test pack de Nicoleta contra el ambiente de TEST el 26-ago; cada una corresponde a un defecto verificado, no a una mejora especulativa.
>
> **Orden sugerido:** Fragmento 1 (change log) al final, cuando los demás ya estén publicados — así los enlaces internos no quedan colgando.
>
> **Todas las ubicaciones están confirmadas** contra el contenido publicado de la página.
>
> Los Fragmentos 2 y 3 son **reemplazos completos** de su entrada, no bloques a añadir: lo que está publicado tiene errores que hay que corregir en el mismo pegado. Cada uno explica cuáles.

---

## Fragmento 1 — filas del change log

**Dónde:** la tabla bajo `## 🚨 Breaking changes & new capabilities`.

**Tabla completa**, lista para reemplazar la actual. Las cinco primeras filas son nuevas; las tres últimas son las que ya estaban, sin cambios.

| **Date** | **Change** | **Action required** |
| --- | --- | --- |
| **2026-08** | **Breaking:** `evidence[].link` must carry an `http(s)` scheme, and links hosted on file storage platforms (SharePoint, OneDrive, Google Drive, Dropbox) are rejected. | **Yes.** Stop sending storage links and bare file names — both used to be accepted. See **Evidence links** below. |
| **2026-08** | `innovation_use` actors: `actor_type_name` is now resolved against the actor type catalogue. An unresolvable name or id is rejected. | **Yes, if you send names.** An actor identified by name alone was previously **dropped without any error**. See **Innovation use — actors** below. |
| **2026-08** | `innovation_use` actors: `women_youth` / `men_youth` are validated against their sex total and rejected when greater. | **Yes.** Check the figures before submitting. Youth is a subset of each sex, not a separate group. |
| **2026-08** | Conditional validation corrected across `common_fields`, `knowledge_product` and `innovation_use`. Several conditions used to fire when a field was **absent**, demanding fields that were never actually required. | **None.** Payloads that were wrongly rejected now pass. Nothing that was accepted before is rejected now. |
| **2026-08** | `external_reference` is returned on **every** row of the ingest response, including rows that failed and rows rejected before processing. The previously documented path now exists. | **None.** See the updated table in **external_reference**. |
| **2026-08** | **New:** `external_reference` in `data` — your own identifier for the result (consecutive, UUID, any string). Optional. Stored verbatim and returned verbatim on the decision webhook and in the ingest response. | None to keep ingesting. **Required in practice if you want to use webhooks**: without it a callback carries no field pointing at your record. |
| **2026-08** | **New:** self-service **decision webhooks**. Register an HTTPS callback with `POST /webhook` using your existing API key, and PRMS notifies you when a Science Program approves or rejects one of your results. See **[PRMS Result Decision Webhooks](link)**. | None to keep ingesting. To receive decisions, register a callback **before your results go under review** — decisions taken with no destination registered are not replayed. |
| **2026-08** | `lead_contact_person` (with `email` + `name`) is now **mandatory** in `data` for all result types. | Producers must add it to every payload, otherwise the request is rejected at validation (`(root) must have required property 'lead_contact_person'`). |

---

## Fragmento 2 — reglas del link de evidencia

**Dónde:** reemplaza la entrada **`### 🔹 evidence`** completa (toggle **🧱 Common Fields** — `evidence` vive en `common_fields.json`).

**Reemplazo completo, no un bloque a añadir.** La fila `link` de la tabla que está publicada dice `string (URI)` con un ejemplo genérico, y eso contradice las reglas de abajo: ahí está el cambio, además del bloque nuevo.

### **🔹 evidence**

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| link | string (`http(s)` URL) | ✅ | **Publicly accessible link to the supporting evidence** (paper, report, dataset, etc.). Must include the scheme. File storage platforms are not accepted — see the rules below. | `"https://cgspace.cgiar.org/handle/10568/181939"` |
| description | string | ❌ | **Brief description of the evidence.** | `"Peer-reviewed article summarizing multi-country trials."` |

PRMS stores the link and **never copies the document**. Everything about what is accepted follows from that: whoever opens the link later — a reviewer, the CGIAR Results Dashboard — gets exactly what you sent, or nothing.

| Rule | Detail |
| --- | --- |
| **Scheme required** ⚠️ *2026-08* | The link must start with `http://` or `https://`. A bare file name is rejected. |
| **No file storage platforms** ⚠️ *2026-08* | SharePoint, OneDrive, Google Drive and Dropbox links are rejected, whatever the tenant. |
| **Publicly reachable** | A link nobody outside your organisation can open is of no use as evidence, even when it is technically accepted. |

✅ `https://cgspace.cgiar.org/handle/10568/181939`
✅ `https://doi.org/10.1234/abcd.2025.01`
❌ `result-28808-Document-202607042143-8310.pdf` — no scheme
❌ `https://cgiar.sharepoint.com/sites/…` — file storage platform

> ⚠️ **Both rules were already in force in the PRMS reporting tool** and stated on screen there; this API simply did not apply them. Until 2026-08 the same link was refused in the form and accepted here.

> ℹ️ **Confidential evidence has no route through this API.** The API accepts links only. Evidence that cannot be public is reported through the PRMS reporting tool with **Upload file** and answering **No** to the public question: the file is then stored in the PRMS repository, kept off the Results Dashboard, and reachable only by CGIAR staff holding the repository link.

**Where the rejection appears:** these two rules are applied by PRMS, not by this service's pre-checks. A bad link comes back as a failed row in `results[]` (HTTP 207), not in `rejected[]` (HTTP 422). Validate on your side if you want to catch it before submitting.

---

## Fragmento 3 — Innovation use, actores

**Dónde:** reemplaza la entrada **`### 🔹 actors`** completa, dentro de `innovation_use.current_innovation_use_numbers`.

**Reemplazo completo, no un bloque a añadir.** Dos cosas de lo publicado están mal, aparte de lo nuevo:

1. **La descripción de `sex_and_age_disaggregation` está invertida.** Dice "Indicates whether sex/age disaggregation is being used", y es al revés: el campo del formulario se llama *"Sex and age disaggregation does not apply"*, así que `true` significa que NO aplica — de ahí que la propia regla del schema exija `how_many` cuando es `true`. Leído como está publicado, un productor lo manda invertido y pierde toda la desagregación, youth incluido.
2. **La tabla de campos está rota.** Los tipos union se escribieron `string | integer`, y ese `|` sin escapar parte las celdas: varias filas quedan con 6 celdas contra 5 del header (se ve en `result_actors_id`, donde el `❌` cayó en la columna de Required). Acá van como "string or integer".

También quité el bullet `- **result_actors_id**` que quedó suelto arriba de la tabla del catálogo.

### **🔹 actors**

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
>
> **Validation rules (schema):**

- At least **one** must be provided: `actor_type_id` **or** `actor_type_name`.
- If `sex_and_age_disaggregation` **is present and** = `true` → `how_many` is **required**.
- If `actor_type_id` **is present and** is `"5"` or `5` → `other_actor_type` is **required**.
- `women_youth` ≤ `women`, and `men_youth` ≤ `men`. ⚠️ *new 2026-08*

> ⚠️ **Changed 2026-08.** Three things behaved differently before, all now fixed:
>
> - An actor sent with `actor_type_name` and no `actor_type_id` was **silently dropped** — stored with no type, and the request still returned `200` with "All results processed successfully". If you send names, verify the actors you expect came back.
> - Youth was never checked against its sex total: `women: 10, women_youth: 999` was stored as sent, and the derived non-youth clamped to 0.
> - The last two conditional rules fired when the field was **absent**, not just when it held the triggering value. Omitting `sex_and_age_disaggregation` demanded `how_many`, and identifying an actor by name demanded `other_actor_type`. Both now require the field to be present.

---

## Fragmento 4 — `external_reference`, tabla actualizada

**Dónde:** reemplaza la tabla **"Where it comes back to you"** dentro de la entrada `external_reference` (toggle **🧱 Common Fields**). El resto de esa entrada queda igual.

| **Where** | **Field** |
| --- | --- |
| Ingest response — a row that was processed, success or failure | `results[].external_reference` |
| Ingest response — a row rejected before processing (schema, missing `type`/`data`) | `rejected[].external_reference` |
| Decision webhook | `external_reference` (top level) |

> ℹ️ It comes back on **every** row, including the ones that failed. A rejected row is the one you most need to find again — it is the row you have to show your own user. `null` when you sent none.

> ⚠️ Previously the documented path `results[].external_reference` did not exist (the value came back only nested), and a failed row carried no reference at all.

---

## Fragmento 5 — nota sobre validación condicional

**Dónde:** como callout al inicio de la sección de validación / errores, si la página tiene una. Si no, se puede omitir: la fila del change log (Fragmento 1) ya cubre lo esencial.

> ℹ️ **Corrected 2026-08 — conditional validation.** Several conditional rules used to be evaluated as satisfied when the field they keyed on was **absent** from the payload, so they demanded fields that were not actually required. Known cases, all fixed:
>
> - Omitting `sex_and_age_disaggregation` on an actor demanded `how_many`.
> - Identifying an actor by `actor_type_name` demanded `other_actor_type` — the field meant for actor type 5, "Other".
> - Sending `geo_focus` with `scope_label` but no `scope_code` demanded `regions`, two `countries` and `subnational_areas` **at the same time**, which no payload can satisfy.
>
> No rule was relaxed: what was correctly rejected before is still rejected. If you had worked around any of these by sending a filler value, you can stop.
