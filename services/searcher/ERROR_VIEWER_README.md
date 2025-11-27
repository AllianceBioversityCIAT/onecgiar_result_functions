# Error Viewer Feature

## Overview
Nueva funcionalidad para visualizar y analizar errores del pipeline almacenados en S3.

## Archivos creados

### 1. API Route: `/api/errors`
**Archivo**: `app/api/errors/route.ts`

**Funcionalidad**:
- Lista todos los archivos JSON en `s3://my-bulk-pipeline/errors/`
- Obtiene el contenido de un archivo específico de error
- Soporta paginación y ordenamiento por fecha

**Endpoints**:
```
GET /api/errors           → Lista todos los errores
GET /api/errors?key=...   → Obtiene detalle de un error específico
```

### 2. Página de Errores: `/errors`
**Archivo**: `app/errors/page.tsx`

**Características**:
- Vista de tabla con todos los errores
- Filtro por Job ID
- Estadísticas en tiempo real (total, filtrados, último error)
- Click en fila para ver detalles

### 3. Modal de Detalles: `ErrorModal`
**Archivo**: `app/components/ErrorModal.tsx`

**Muestra**:
- ✅ Información del job (timestamp, jobId, messageId, originalKey)
- ✅ Errores de validación de PRMS (parsed automáticamente)
- ✅ Stack trace completo
- ✅ Preview del payload (tenant, operation, title)
- ✅ JSON completo expandible

### 4. Navegación actualizada
**Archivo**: `app/components/PageHeader.tsx`

- Tabs para navegar entre "Results" y "Errors"
- Indicador visual de página activa

## Estructura del Error JSON

```json
{
  "timestamp": "2025-11-26T20:24:02.010Z",
  "jobId": "6b9eb77d-2478-474e-b471-d83ffb3f72d8",
  "messageId": "df650637-4c64-4934-97ac-9b3998cd7df8",
  "originalKey": "chunks/6b9eb77d-2478-474e-b471-d83ffb3f72d8/part-00002.json",
  "error": {
    "message": "PRMS responded 422: {...}",
    "stack": "...",
    "name": "Error"
  },
  "payload": {
    "tenant": "prms.result-management.api",
    "op": "dataset.ingest.requested",
    "results": [...]
  }
}
```

## Variables de Entorno

Agregar en `.env.local`:

```bash
# AWS Configuration
AWS_REGION=us-east-1
S3_BUCKET=my-bulk-pipeline
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
```

## Dependencias Instaladas

```bash
pnpm install @aws-sdk/client-s3
```

## UI/UX

### Vista de Tabla
- Job ID en formato monospace
- Timestamp formateado
- Tamaño del archivo legible (B, KB, MB)
- Hover effects
- Click en fila para abrir modal

### Modal de Detalles
- Header con Job ID destacado
- Sección de resumen con grid de 2x2
- Errores de validación destacados en rojo
- Stack trace en tema oscuro
- Payload preview con campos clave
- JSON completo expandible
- Botón de cierre

### Diseño Responsivo
- Mobile-first
- Grid adaptativos
- Scroll interno en modal
- Max height controlado

## Testing

1. **Lista de errores**:
   ```bash
   curl http://localhost:3000/api/errors
   ```

2. **Detalle de error**:
   ```bash
   curl http://localhost:3000/api/errors?key=errors/job-id.json
   ```

3. **UI**: Visitar `http://localhost:3000/errors`

## Build

```bash
pnpm run build
# ✓ Compiled successfully
# Route: /errors (static)
# Route: /api/errors (dynamic)
```
