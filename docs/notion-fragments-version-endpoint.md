# Fragmentos para la página existente — endpoint de versionamiento (P2-3228)

> **Destino:** [PRMS Normalizer — Technical Field Documentation](https://cgiar-prms.notion.site/PRMS-Normalizer-Technical-Field-Documentation-287f271224788055a0d9c2bc23b1a06b)
>
> Dos inserciones: una fila de change log y una sección nueva. El endpoint es `POST /version`, sobre la misma base URL y con la misma key que `/ingest` — ver [[w3-api-environments]] en el vault o la tabla de Service URLs de la página de webhooks.
>
> **Publicar solo cuando esté desplegado.** A diferencia de los fragmentos del 26-ago, que documentan comportamiento ya corregido, este anuncia una capacidad nueva: si se publica antes del deploy, el primer productor que la pruebe recibe un 404.
>
> Related: [`notion-fragments-2026-08-26.md`](./notion-fragments-2026-08-26.md) · [`notion-webhooks-page.md`](./notion-webhooks-page.md)

---

## Fragmento 1 — fila del change log

**Dónde:** la tabla bajo `## 🚨 Breaking changes & new capabilities`, **arriba** de las filas de `2026-08`.

| **Date** | **Change** | **Action required** |
| --- | --- | --- |
| **2026-08** | **New:** `POST /version` — carry an approved result from a previous phase into the current one, keeping its result code. Send only the code; the new version lands in `Draft` for you or the centre to complete. Knowledge Products are excluded. | None to keep ingesting. Use it instead of submitting a new record for a result you already reported and had approved — a new record duplicates the work and loses the link between phases. |

---

## Fragmento 2 — la sección del endpoint

**Dónde:** sección nueva al mismo nivel que la de ingesta. Si la página tiene un índice, agregarla ahí.

## **🔁 Continuing a result in a new phase**

An approved result does not have to be re-reported from scratch each year. `POST /version` carries it into the open reporting phase under the **same result code**, so the link between what you reported in one phase and the next one survives.

Until now the only option was submitting a new record, which duplicates the work and breaks that link.

### Request

```bash
curl -X POST "{BASE_URL}/version" \
  -H "x-api-key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{ "result_code": "28565", "external_reference": "STAR-9f2c-4471" }'
```

| **Field** | **Type** | **Required** | **Description** | **Example** |
| --- | --- | --- | --- | --- |
| `result_code` | string | ✅ | The PRMS result code of the approved result to continue. This is the number you already see in the reporting tool. | `"28565"` |
| `external_reference` | string | ⚙️ Optional | Your own identifier for this request, returned verbatim so you can match the response to your record. Max 191 characters. | `"STAR-9f2c-4471"` |

> ℹ️ **Send only the result code.** It is stable across phases, so PRMS resolves which version to continue, and it derives the target Science Program from the result itself. There is no internal id for you to keep and no programme to look up.

### What happens

The new version is created in the open reporting phase, linked to the original by its result code. **The approved prior-phase record is not modified.**

> ⚠️ **The new version lands in `Draft`.** This operation *continues* a result; it does not report on it. Whoever edits it next — through the API when that becomes available, or in the PRMS reporting tool's bilateral module — is who submits it for review. That submission is what starts the Science Program's approval workflow, and the decision then reaches you through your registered callback exactly as it does for a newly ingested result.

> ❗ **A result is carried forward once.** If a version already exists in the current phase there is nothing left to do, and the call is refused.

### What gets refused

Every refusal names the rule it hit, so the message is the thing to read before retrying.

| Rule | Meaning |
| --- | --- |
| Exists | The result code has to match an active result. |
| Not already in the current phase | A result that only exists in the open phase has nothing to carry forward. |
| Not already carried forward | One version per phase. |
| Reported through this API | Results authored inside the reporting tool follow the tool's own rules for continuing a phase. |
| **Approved** | Only an approved result from a previous phase can be continued. |
| **Not a Knowledge Product** | Their metadata is owned by CGSpace, so a new knowledge product is reported with its own handle instead. This one is not a permission you can be granted. |
| Yours | The platform that reported a result is the one that may continue it. |

---

## Nota para quien publique

Estas dos piezas describen el **endpoint**, no la edición del contenido. Actualizar por API los datos del resultado versionado **todavía no existe**: hoy el camino es versionar por API y completar en el módulo bilateral del reporting tool. Si la página va a mencionar la edición por API, conviene esperar a que exista, o decirlo explícitamente como pendiente — es la clase de brecha que se descubre en una demo.
