# Fragmentos para la página existente — minimum data set de Innovation Use (P2-3428)

> **Destino:** [PRMS Normalizer — Technical Field Documentation](https://cgiar-prms.notion.site/PRMS-Normalizer-Technical-Field-Documentation-287f271224788055a0d9c2bc23b1a06b)
>
> Cinco inserciones. El Fetcher ahora aplica el mismo minimum data set que el servidor bilateral: un Innovation Use incompleto se rechaza acá, antes de llegar a Reporting, en vez de fallar más adelante.
>
> **Publicar *antes* del deploy, no después.** Al revés que el fragmento de `POST /version`: eso anunciaba una capacidad nueva y publicarlo temprano daba 404. Esto **rechaza payloads que hoy se aceptan**, así que publicarlo tarde significa que el primer productor se entera por un 422. Dale margen — idealmente un ciclo de reporte.
>
> ⚠️ **La tabla de niveles del Fragmento 2 está sin llenar.** No tengo el catálogo de CLARISA a mano y no lo inventé; hay que pegar los valores reales antes de publicar, igual que se hizo con los centros. Todo lo demás está verificado contra el código.
>
> Related: [`notion-fragments-2026-08-26.md`](./notion-fragments-2026-08-26.md) · [`notion-fragments-version-endpoint.md`](./notion-fragments-version-endpoint.md)

---

## Fragmento 1 — el change log

**Dónde:** la tabla bajo `## 🚨 Breaking changes & new capabilities`.

**Tabla completa**, lista para reemplazar la actual. Las cuatro primeras filas son nuevas; el resto son las que ya estaban, sin cambios.

| **Date** | **Change** | **Action required** |
| --- | --- | --- |
| **2026-09** | **Breaking:** `innovation_use` now has a **minimum data set**, checked before the result is forwarded. It requires `innovation_use.innovation_use_level`, at least one complete entry in `measures`, and `actors` unless `innov_use_to_be_determined` is `true`. | **Yes.** A payload missing any of these used to be accepted and is now rejected with a `422`. See **Innovation use — minimum data set** below. |
| **2026-09** | **Breaking:** on an `innovation_use`, every entry in `contributing_bilateral_projects` must state its investment — **exactly one** of a positive `usd_budget` or `is_determined: true`. Zero is not an amount, and sending both is refused. | **Yes.** Grants used to be accepted with `grant_title` alone. Unchanged for every other result type: budget stays optional there. |
| **2026-09** | **Breaking (response):** a batch in which **any** row was rejected now answers `207` with `ok: false`. It used to answer `200` with `ok: true` whenever the rows that *did* get through succeeded, so a half-dropped batch read as a full success. | **Yes, if you branch on `ok` or on the status code.** Nothing changed in the body: the dropped rows were always in `rejected[]`. A batch where everything succeeds is still `200` / `ok: true`, and a fully invalid batch is still `422`. |
| **2026-09** | **Fixed:** `measures[].quantity` rejected whole numbers. `quantity: 2` failed as *"must match exactly one schema in oneOf"*; only decimals and strings got through. | **None.** Payloads that were wrongly rejected now pass. |
| **2026-08** | **New:** `POST /version` — carry an approved result from a previous phase into the current one, keeping its result code. Send only the code; the new version lands in `Draft` for you or the centre to complete. Knowledge Products are excluded. | None to keep ingesting. Use it instead of submitting a new record for a result you already reported and had approved — a new record duplicates the work and loses the link between phases. |
| **2026-08** | **Breaking:** `evidence[].link` must carry an `http(s)` scheme, and links hosted on file storage platforms (SharePoint, OneDrive, Google Drive, Dropbox) are rejected. | **Yes.** Stop sending storage links and bare file names — both used to be accepted. See **Evidence links** below. |
| **2026-08** | `innovation_use` actors: `actor_type_name` is now resolved against the actor type catalogue. An unresolvable name or id is rejected. | **Yes, if you send names.** An actor identified by name alone was previously **dropped without any error**. See **Innovation use — actors** below. |
| **2026-08** | `innovation_use` actors: `women_youth` / `men_youth` are validated against their sex total and rejected when greater. | **Yes.** Check the figures before submitting. Youth is a subset of each sex, not a separate group. |
| **2026-08** | Conditional validation corrected across `common_fields`, `knowledge_product` and `innovation_use`. Several conditions used to fire when a field was **absent**, demanding fields that were never actually required. | **None.** Payloads that were wrongly rejected now pass. Nothing that was accepted before is rejected now. |
| **2026-08** | `external_reference` is returned on **every** row of the ingest response, including rows that failed and rows rejected before processing. The previously documented path now exists. | **None.** See the updated table in **external_reference**. |
| **2026-08** | **New:** `external_reference` in `data` — your own identifier for the result (consecutive, UUID, any string). Optional. Stored verbatim and returned verbatim on the decision webhook and in the ingest response. | None to keep ingesting. **Required in practice if you want to use webhooks**: without it a callback carries no field pointing at your record. |
| **2026-08** | **New:** self-service **decision webhooks**. Register an HTTPS callback with `POST /webhook` using your existing API key, and PRMS notifies you when a Science Program approves or rejects one of your results. See **[PRMS Result Decision Webhooks](link)**. | None to keep ingesting. To receive decisions, register a callback **before your results go under review** — decisions taken with no destination registered are not replayed. |
| **2026-08** | `lead_contact_person` (with `email` + `name`) is now **mandatory** in `data` for all result types. | Producers must add it to every payload, otherwise the request is rejected at validation (`(root) must have required property 'lead_contact_person'`). |

---

## Fragmento 2 — `innovation_use_level` (entrada nueva)

**Dónde:** dentro del toggle de `innovation_use`, como **primera** entrada — antes de `current_innovation_use_numbers`. Es un campo nuevo y hermano de ese bloque, no va dentro de él.

> ⚠️ **Antes de pegar:** la tabla de niveles de abajo está vacía. Llenala con el catálogo real de CLARISA — sin eso, un productor no tiene de dónde sacar ni el código ni el nombre, y la entrada no sirve.

### **🔹 innovation_use_level 🆕**

The stage of use being claimed. Required on **every** innovation use, including one whose numbers are yet to be determined — what stage the innovation has reached is known long before how many actors are using it.

| innovation_use_level | name |
| --- | --- |
| *(pendiente: catálogo CLARISA)* |  |

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

> ✅
>
> **Validation rules (schema):**

- The object itself is **required**.
- At least **one** must be provided: `level` **or** `name`. Sending both is fine.
- No other property is accepted inside it — anything else is dropped.

> ⚠️ **New 2026-09.** This field did not exist before and nothing demanded it. A payload without it is now rejected: `/innovation_use/innovation_use_level is required: provide the innovation use level or its name`.

---

## Fragmento 3 — `measures` (reemplazo completo)

**Dónde:** reemplaza la entrada **`### 🔹 measures`** completa, dentro de `innovation_use.current_innovation_use_numbers`. Si la página no la tiene, agregala después de `organization`.

### **🔹 measures**

What the innovation use is counted in. **At least one entry must carry both halves** — a unit and a quantity. A measure with only one of the two counts for nothing.

Required even when `innov_use_to_be_determined` is `true`: *what* is being counted is known long before *how many*.

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

> ✅
>
> **Validation rules (schema):**

- The array must hold **at least one complete measure**: a non-blank `unit_of_measure` **and** a numeric `quantity`.
- `quantity: 0` is **valid** — "we measured, and the answer is none". Blank or absent is not.
- Extra incomplete entries alongside a complete one are tolerated, but they are not what satisfies the rule.

> ⚠️ **New 2026-09.** `measures` was optional and unchecked. Two changes:
>
> - The array is now **required**, with at least one complete entry. `/innovation_use/current_innovation_use_numbers/measures is required: provide at least one measure with a 'unit_of_measure' and a numeric 'quantity'`.
> - **Fixed:** a whole-number quantity used to be rejected. `quantity: 2` failed with `must match exactly one schema in oneOf`, while `1500.5` and `"2"` passed. If you had worked around this by sending quantities as strings, you can stop.

---

## Fragmento 4 — `contributing_bilateral_projects` (reemplazo completo)

**Dónde:** reemplaza la entrada **`### 🔹 contributing_bilateral_projects`** completa, dentro del toggle **🧱 Common Fields (common_fields.json) All Results**.

**Reemplazo completo, no un bloque a añadir.** `usd_budget` e `is_determined` ya se aceptaban y no estaban documentados en ningún lado, así que la regla nueva era imposible de cumplir leyendo la página.

### **🔹 contributing_bilateral_projects**

The bilateral grants that funded the work behind this result. At least one is required, for every result type.

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| **grant_title** | string | ✅ | Title of the bilateral grant or project. | "Seed Adoption Initiative" |
| **is_lead** | boolean | ❌ | Whether this grant is the lead project for the result. | true |
| **usd_budget** | number | Conditional ⚠️ | Budget in USD this grant contributed. **Required on `innovation_use`** unless `is_determined` is `true`. Must be greater than 0. | 250000 |
| **is_determined** | boolean | Conditional ⚠️ | `true` when the contributed amount is **yet to be determined**. **Required on `innovation_use`** unless `usd_budget` is sent. | true |

```json
"contributing_bilateral_projects": [
  { "grant_title": "Seed Adoption Initiative", "usd_budget": 250000 },
  { "grant_title": "Innovation Monitoring Fund", "is_determined": true }
]
```

> ✅
>
> **Validation rules (schema):**

- `grant_title` is **required** on every entry, for every result type.
- **On `innovation_use` only:** every entry must state its investment — **exactly one** of a positive `usd_budget` or `is_determined: true`.
- `usd_budget: 0` does **not** satisfy it. A grant that contributed nothing is not a contributing grant.
- Sending a positive `usd_budget` **and** `is_determined: true` on the same grant is **refused**: they are two contradictory claims, and PRMS does not pick one for you.
- For every other result type both fields stay **optional** and unchecked.

> ⚠️ **New 2026-09 — `innovation_use` only.** A grant sent with `grant_title` alone used to be accepted. It is now rejected, naming the entry by position:
>
> - Neither field: `/contributing_bilateral_projects/0 must provide a positive 'usd_budget', or 'is_determined': true when the amount is yet to be determined`
> - Both fields: `/contributing_bilateral_projects/0 must provide either a positive 'usd_budget' or 'is_determined': true, not both`
>
> This mirrors what the PRMS bilateral module already enforces when a result is completed there — the Fetcher now says it up front instead of letting the result stall later.

---

## Fragmento 5 — cómo se lee la respuesta de `/ingest`

**Dónde:** en la sección de respuestas / errores de `/ingest`, reemplazando lo que describa los códigos. Si la página no tiene esa sección, va como callout al final de la sección de ingesta.

### **What the response status means**

Two things can go wrong with a batch, and they are reported separately:

- **Rejected** — the row failed validation here. It was never offloaded, never forwarded to Reporting, never indexed. It comes back in `rejected[]` with its `index`, its `external_reference` and its errors.
- **Failed** — the row passed validation and Reporting refused it. It comes back in `results[]` with `success: false`.

| **Status** | **`ok`** | **Meaning** |
| --- | --- | --- |
| `200` | `true` | Every row was accepted and processed. `rejected[]` is empty and nothing failed. |
| `207` | `false` | Some part of the batch did not make it — rejected rows, failed rows, or both. Read `rejected[]` **and** `results[]`. |
| `422` | `false` | Every row was rejected. Nothing was forwarded. |

Every row in `results[]` and `rejected[]` carries `external_reference` (null when you sent none), so a dropped row can always be matched back to your record.

> ⚠️ **Changed 2026-09.** A batch with rejected rows used to answer `200` with `ok: true` as long as the rows that *did* get through succeeded — so a batch half of which was dropped read as a full success, and a producer trusting `ok` never looked in `rejected[]`. Both are now `207` / `ok: false`.
>
> **Nothing moved in the body.** The dropped rows were always in `rejected[]`, and `rejectedCount` was always there. If you already read `rejected[]` on every response, nothing changes for you. If you branch on `ok` or on the status code, this is the one to check.
>
> The `message` field names both sides, e.g. `"Processed with 1 rejected before processing and 3 failed during processing"`.
