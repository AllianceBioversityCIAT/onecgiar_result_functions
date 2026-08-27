# Fragmentos: autenticación y ejemplos de los campos nuevos

> **Destino:** [PRMS Normalizer — Technical Field Documentation](https://cgiar-prms.notion.site/PRMS-Normalizer-Technical-Field-Documentation-287f271224788055a0d9c2bc23b1a06b)
>
> Tres inserciones. Dos huecos que detectó Juan David el 2026-08-27: la página **nunca dice que
> hace falta una API key**, y el ejemplo completo **no muestra los campos nuevos**.
>
> ⚠️ **Antes de publicar el Fragmento 1, leer la nota del final sobre el Bulk Ingest.** El texto
> está deliberadamente limitado al Normal Ingest porque el servicio de bulk hoy no valida key.

---

## Fragmento 1 — sección de autenticación (NUEVA)

**Dónde:** inmediatamente **después** de las dos tablas de `🌐 Service URLs` y **antes** de
`🔔 Result Decision Webhooks`. Es el primer sitio donde el lector ya tiene una URL y todavía no
sabe que le van a devolver 401.

```markdown
---

## 🔑 Authentication

Every call to the **Normal Ingest API** requires a CLARISA API key in the `x-api-key` header.
There is no anonymous access and no `Authorization: Bearer` alternative.

| **Endpoint** | **Key required** |
| --- | --- |
| `POST /ingest` | ✅ |
| `POST /webhook` · `GET /webhook` | ✅ |
| `GET /docs` · `GET /openapi.json` · `GET /health` | ❌ Open |

```bash
curl -X POST "<Normal Ingest URL>/ingest" \
  -H "x-api-key: <your-api-key>" \
  -H "Content-Type: application/json" \
  -d @payload.json
```

### 📩 How to get your key

**Keys are issued by the PRMS team — one per tool and per environment.** Do not reuse a key
across tools, and do not share it between environments: your key is what identifies your
platform, so a shared key makes two systems indistinguishable to PRMS.

Request yours before you start testing:

- Open a ticket with **PRMS Tech Support**, or
- Contact the PRMS team directly.

Tell us which tool it is for (STAR, MEL, TIP, …) and which environment you need (TEST or
PRODUCTION).

### 🪪 Your key is your identity

PRMS resolves your platform from the key on every call. Two consequences worth knowing:

- **Webhook registration needs no platform field.** You cannot register a callback destination
  for anybody but yourself, and nobody can register one for you.
- **`external_reference` round-trips per platform.** The identifier you send comes back to you,
  and only to you.

### ❌ Error responses

| **HTTP** | **Body** | **What it means** |
| --- | --- | --- |
| **401** | `{"ok": false, "error": "unauthorized", "message": "Unauthorized", "requestId": "…"}` | No key sent, or CLARISA says the key is not valid. Do not retry — fix the key. |
| **503** | `{"ok": false, "error": "…", "message": "…", "requestId": "…"}` | CLARISA could not be reached to validate your key. **Retryable** — your key may be perfectly fine. |

> The `requestId` in the body is the one to quote when you contact support about a rejected call.
```

---

## Fragmento 2 — el ejemplo completo, con los campos nuevos

**Dónde:** reemplaza el bloque de código completo de `## 📤 Complete Valid Example`.

**Qué cambia respecto al actual:**

1. **`external_reference` agregado** como primer campo de `data`. Hoy no aparece en ningún
   ejemplo de la página, así que un productor que solo copia el ejemplo nunca lo manda — y sin
   él los webhooks no le sirven de nada.
2. **`lead_contact_person` reindentado.** Está en el ejemplo actual pero con la indentación
   corrida, lo que lo hace parecer un pegote y no un campo obligatorio del contrato.
3. **Comentario sobre `name`**, porque es el error más frecuente que estamos viendo: varios
   productores mandan el correo repetido en `name`.

```markdown
## 📤 Complete Valid Example

The two fields added in 2026-08 are shown first: `external_reference` (yours, optional but
needed for webhooks) and `lead_contact_person` (mandatory for every result type).

```json
{
  "tenant": "prms.result-management.api",
  "op": "dataset.ingest.requested",
  "results": [
    {
      "type": "knowledge_product",
      "data": {
        "external_reference": "STAR-9f2c-4471",
        "created_date": "2025-10-24T19:36:04Z",
        "created_by": {
          "name": "Sara Jani",
          "email": "s.jani@cgiar.org"
        },
        "lead_contact_person": {
          "name": "Jane Doe",
          "email": "jane.doe@cgiar.org"
        },
        "lead_center": {
          "institution_id": 1279,
          "acronym": "ICARDA"
        },
        "toc_mapping": {
          "science_program_id": "SP01",
          "aow_compose_code": "SP01-AOW05",
          "result_title": "HLO20.AOW5.IO3 Assess performance",
          "result_indicator_description": "Availability of MELIA Report on AoWs (performance data)",
          "result_indicator_type_name": "Number of knowledge products"
        },
        "contributing_bilateral_projects": [
          {
            "grant_title": "D-200358-Enhancing Food Security and Climate Resilience in Morocco and Tunisia"
          }
        ],
        "knowledge_product": {
          "handle": "https://hdl.handle.net/20.500.1176/70001"
        }
      }
    }
  ]
}
```

| **New field** | **Required** | **Why it is in this example** |
| --- | --- | --- |
| `external_reference` | Optional | Your own id for this result. Returned verbatim in the ingest response **and on every decision webhook** — without it, a callback carries nothing that points at your record. |
| `lead_contact_person` | ✅ **Mandatory** | Rejected at validation if absent, for **every** result type. Send the person's real name in `name`: if the `email` matches CGIAR's directory, PRMS stores and displays the directory's own name instead of what you sent. |
```

---

## Fragmento 3 — nota en el change log

**Dónde:** en la tabla `🚨 Breaking changes & new capabilities`, cambiar la columna
**Action required** de la fila de `lead_contact_person`, que hoy solo describe el rechazo.

**Antes:**

> Producers must add it to every payload, otherwise the request is rejected at validation
> (`(root) must have required property 'lead_contact_person'`).

**Después:**

> Producers must add it to every payload, otherwise the request is rejected at validation
> (`(root) must have required property 'lead_contact_person'`). See the updated
> **Complete Valid Example**. Send the person's real name in `name` — a matched `email` makes
> PRMS store the directory's own name instead.

---

## ⚠️ Nota interna — NO publicar esto

El Fragmento 1 dice **"Normal Ingest API"** a propósito, y no "the API".

Verificado el 2026-08-27: el servicio de **Bulk Ingest es un Lambda aparte (`services/ingestor`)
que no tiene ninguna referencia a API key en su código** — solo `services/fetcher` la valida. Un
`POST` sin key al bulk de TEST devolvió **HTTP 202**.

Así que documentar "se requiere API key" a secas sería falso para la mitad de la superficie que
la propia página publica, y peor: le diría a un lector que el bulk está protegido cuando no lo
está. Hasta que eso se resuelva, la sección de autenticación se limita al Normal Ingest y **no
menciona el bulk en ninguna de sus dos tablas**.

Esto necesita ticket propio antes de invitar a equipos externos a probar el bulk.
