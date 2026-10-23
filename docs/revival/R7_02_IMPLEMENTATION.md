# OpenLens DevOps Revival — R7-02 Implementación

**Hito:** R7-02 — Validación Pre-Vuelo y Server-Side Dry-Run (`dryRun=All`)
**Rama:** `feat/r7-devops-capabilities`
**Base:** `6514e4dffad63fc4d501a0b4d82a8e687a022594` (R7-01 consolidado)
**Fecha:** 2026-10-23
**Estado:** Implementado y verificado — **sin commit** (pendiente de revisión independiente)

---

## 1. Resumen funcional

El editor YAML de recursos existente (`EditResourceModel` + Monaco) incorpora la acción
**Validate — Server Dry-Run**. La validación envía el borrador al API server de Kubernetes con
`?dryRun=All`, reutilizando **exactamente** la misma ruta de guardado:

- ConfigMaps y Secrets (v1) → `PUT ...?dryRun=All` con `metadata.resourceVersion` fijado al cargado originalmente.
- Resto de recursos → `PATCH ...?dryRun=All` (JSON Patch) con las operaciones `test` de `resourceVersion` (y `uid`) delante de los cambios del usuario.

La validación no persiste nada, no toca stores, no modifica el borrador ni su base y no dispara
ningún guardado. El resultado se muestra de forma estructurada y el borrador continúa editable.

---

## 2. Cambios por capa

### 2.1 Capa Kubernetes API (`packages/core/src/common/k8s-api/kube-api.ts`)

```ts
export interface KubeApiDryRunOptions {
  dryRun?: "All";
}
```

- `create(desc, partialData?, opts?)`, `update(desc, data, opts?)` y `patch(desc, data, strategy?, opts?)`.
- `opts.dryRun === "All"` se traduce a `{ query: { dryRun: "All" } }`, transporte que
  `JsonApi.request()` ya soportaba (mismo mecanismo que usa `KubeApi.delete`).
- Sin `opts`, la llamada es **idéntica** a la anterior (misma aridad, mismos parámetros).

### 2.2 Requests del editor (`request-replace-kube-resource.injectable.ts`, `request-patch-kube-resource.injectable.ts`)

- Firma extendida con `opts?: KubeApiDryRunOptions`; el query se añade solo cuando `dryRun === "All"`.
- El resultado fallido incorpora `errorPayload` opcional (payload `Status` estructurado del servidor),
  aditivo respecto de `error`/`isConflict` existentes.
- `save()` sigue invocando estos injectables **sin** tercer argumento: cero cambio de comportamiento.

### 2.3 Modelo (`edit-resource-model.injectable.tsx`)

- `draftValidation: observable.box<DryRunValidationState>` con estados
  `not-validated | validating | passed | failed | unavailable`.
- `draftRevision: observable.box<number>` como contador de invalidación, incrementado en:
  `configuration.onChange`, `load`, `reloadFromCluster`, `revertToOriginal`,
  `rebaseOnClusterVersion` y `verifySaved`.
- `validateDraft()`:
  1. Valida YAML localmente (`validateKubernetesResourceYaml`). Si es inválido → `failed / malformed-yaml` sin llamar al servidor.
  2. Deriva el `selfLink` con `getEditSelfLinkFor(firstVersion)` (incluye la corrección de la etiqueta legada).
  3. Bifurca igual que `save()`: `usesOptimisticReplace` → `replace(..., { dryRun: "All" })`; si no → `patchWithPreconditions(..., { dryRun: "All" })`.
  4. Captura `draftRevision` antes del request; si cambió al volver, descarta la respuesta tardía en silencio.
  5. Éxito → `passed` con mensaje `Server-side dry-run accepted by Kubernetes`, clúster, recurso, método y hora.
  6. Error → clasificación estructurada + redacción de Secret + causes.
- Ignora clics repetidos mientras `status === "validating"`.
- No escribe `draft`, `firstDraft`, `remoteClusterResource`, stores ni notificaciones.

### 2.4 Clasificación y redacción (`dry-run-validation.ts`)

`classifyDryRunFailure(error, fallback)` distingue:
`malformed-yaml`, `bad-request` (400), `forbidden` (403), `not-found` (404), `conflict` (409),
`invalid` (422, con `details.causes[]` → `{ field, message }`), `admission-denied`
(400/422 con `admission webhook` en el mensaje), `connection` (timeout/abort/red) y `unknown`.

`redactSecretText` / `redactSecretCauses` reemplazan por `<redacted>` cada valor **exacto** del
borrador (`data` base64 y `stringData` plano) que aparezca en mensajes o causes del servidor.
Solo se muestran `message` y `causes`; nunca la respuesta completa del servidor para Secrets.

### 2.5 Presentación (`view.tsx`)

- Botón **Validate — Server Dry-Run** en `EditResourceControls`, junto a Editor/Diff/Revert/Reload y a Save/Save & Close.
- Badge de estado: `Not Validated`, `Validating…`, `Validation Passed`, `Validation Failed`, `Validation Unavailable`.
- `DraftValidationNotice`:
  - Aceptado: banda verde con `Server-side dry-run accepted by Kubernetes`, `Cluster`, `Resource`, `Checked`, `Request`, y la frase explícita **"The resource was NOT saved"**.
  - Fallido: banda roja (`#EF4444`) con clasificación legible, mensaje redactado y causes; en PROD indica "(validated against a PRODUCTION cluster)".
  - No disponible: banda ámbar.
- Marcadores Monaco (owner `server-dry-run`) solo en modo Editor y solo para causes con correspondencia fiable.

### 2.6 Mapeo puntero→línea (`yaml-line-mapping.ts`)

Escáner conservador de YAML en bloque que construye un mapa JSON-pointer → línea. Renuncia
(`undefined`, sin marcador) ante flow containers, block scalars, anclas/alias, tags o multi-documento.
Nunca inventa ubicaciones. Casos cubiertos por tests: mappings anidados, secuencias, claves citadas,
escapes `~1`/`~0`, claves numéricas, rechazo de flow/block scalars.

### 2.7 Protección en logs (`packages/utility-features/json-api/src/json-api.ts`)

`writeLog` redacta antes de `logger.debug`:
- cuerpos de request, respuestas y errores cuyo manifiesto sea `kind: "Secret"` (data/stringData → `<redacted>`);
- y, cuando la URL apunta a `/secrets/`, los valores exactos enviados dentro de mensajes de error del servidor.

Protege retroactivamente el guardado real de Secrets además del dry-run. El paquete se reconstruyó (`dist/`).

---

## 3. Archivos

### Modificados (8)
- `.gitignore` — ignora `open-lens/dist-r7-02-stage`.
- `packages/core/src/common/k8s-api/kube-api.ts`
- `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable.tsx`
- `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/request-patch-kube-resource.injectable.ts`
- `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/request-replace-kube-resource.injectable.ts`
- `packages/core/src/renderer/components/dock/edit-resource/view.tsx`
- `packages/core/src/renderer/components/dock/edit-resource/view.test.tsx`
- `packages/utility-features/json-api/src/json-api.ts`
- `docs/revival/R7_PROVISIONAL_ROADMAP.md`

### Nuevos
- `packages/core/src/common/k8s-api/kube-api-dry-run.test.ts`
- `.../edit-resource-model/dry-run-validation.ts` + `.test.ts`
- `.../edit-resource-model/dry-run-markers.ts`
- `.../edit-resource-model/yaml-line-mapping.ts` + `.test.ts`
- `.../edit-resource-model/dry-run.test.tsx`
- `packages/utility-features/json-api/src/json-api.test.ts`
- `docs/revival/R7_02_ARCHITECTURE.md`, `R7_02_IMPLEMENTATION.md`, `R7_02_VALIDATION.md`, `R7_02_VERIFICATION.json`
- `docs/revival/scripts/verify-r7-02-dry-run.cjs`
- `docs/revival/evidence/r7-02/` (12 capturas)

---

## 4. Decisiones de diseño

1. **Sin implementación paralela del editor:** la validación reutiliza `prepareForReplace`,
   `getUserChanges`, las precondiciones `test` y `getEditSelfLinkFor`. No hay un segundo editor
   ni una segunda ruta de guardado.
2. **Query params por la arquitectura existente:** `JsonApi` ya soportaba `query`; no se añadió
   una capa HTTP nueva.
3. **Contador de revisión en vez de comparar strings:** robusto ante ediciones, reloads y rebases,
   y descarta respuestas tardías sin condiciones de carrera.
4. **`unavailable` reservado para imposibilidad de intentar** (selfLink desconocido, resourceVersion
   original ausente); los rechazos del servidor son `failed`; malformed YAML es `failed` local
   sin contacto con el servidor.
5. **Marcadores solo con correspondencia fiable:** es preferible no marcar a marcar mal.
6. **Aridad preservada en el guardado real:** `save()` no pasa un tercer argumento; los tests de
   regresión existentes siguen afirmando las mismas llamadas.

---

## 5. Fuera de alcance (explícito)

- Subrecursos (`/scale`, `/status`, `/eviction`): no se tocaron.
- Creación de recursos desde cero: no existe ese flujo en este editor y no se añadió.
- R7-03 (rollouts/rollback): no iniciado.
- Sin telemetría, sin IA, sin servicios cloud/comerciales.

---

## 6. Correcciones del gate final de revisión

Aplicadas sin commit ni push, sobre el mismo árbol de R7-02.

### 6.1 Contexto Kubernetes

- `validateDraft()` aplica `assertToolActionClusterContext(this.clusterId, hostedCluster?.id, ...)`
  **antes** de emitir el request. Si el contexto no coincide, el estado pasa a
  `failed / context-mismatch` y el API server no recibe ninguna llamada.
- Se captura una identidad inmutable antes del request: `clusterId`, `selfLink`,
  `resourceVersion` y `uid` de la base cargada.
- Al volver la respuesta se verifica esa identidad: si el clúster cambió, la respuesta se
  descarta (`not-validated`), y si el borrador/recurso cambió, el contador `draftRevision`
  ya invalidó el resultado.
- Nuevo `DryRunErrorKind: "context-mismatch"` con etiqueta propia en la vista.

### 6.2 Redacción de Secret

- `dry-run-validation.ts` acepta una o varias versiones del Secret (base + borrador) y
  redacta valores previos y actuales, ordenados de mayor a menor longitud para no dejar
  fragmentos.
- Se redactan `message`, `reason`, `causes[].message` y `causes[].field` mediante
  `redactDryRunFailure()`.
- `json-api.ts`:
  - colecta valores de manifiestos `Secret` y de operaciones JSON Patch con `path`
    bajo `/data` o `/stringData` (`value` y `oldValue`);
  - redacta estructuralmente todo mapa `data`/`stringData` en cuerpos y respuestas Secret;
  - para respuestas de error de un endpoint Secret que no son un manifiesto `Secret`
    (por ejemplo `kind: Status`), no registra el payload: solo
    `requestMethod`, `endpoint` sin query, `statusCode` y `classification`;
  - un cuerpo no parseable en un request Secret tampoco se registra en crudo.
- Cobertura de pruebas: estado visible, DOM del aviso y llamadas al logger.

### 6.3 Errores inesperados

- Toda la operación de `validateDraft()` está envuelta en `try/catch`.
- Un rechazo del request o una excepción previa produce `failed / unknown` con un mensaje
  genérico (sin el error crudo), `validatedAt` y contexto de cluster; nunca deja
  `validating`, no toca borrador/base y no dispara guardado.
- Se respeta la invalidación por `draftRevision` y la verificación de identidad.

### 6.4 Documentación y validación

- `R7_PROVISIONAL_ROADMAP.md`: eliminado el espacio final detectado por `git diff --check`.
- `R7_02_VALIDATION.md` sección 9 y `R7_02_VERIFICATION.json` (`finalGate`) documentan el
  gate, los comandos, los resultados y la decisión de no re-ejecutar Playwright.
- Se mantiene documentado que una validación correcta no garantiza el guardado posterior.
