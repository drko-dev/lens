# OpenLens DevOps Revival — R7-02 Arquitectura: Validación Pre-Vuelo y Server-Side Dry-Run

**Hito:** R7-02 — Validación Pre-Vuelo y Server-Side Dry-Run (`dryRun=All`)
**Rama:** `feat/r7-devops-capabilities`
**Base:** `6514e4dffad63fc4d501a0b4d82a8e687a022594` (R7-01 consolidado)
**Fecha:** 2026-10-23
**Estado:** Arquitectura auditada y documentada ANTES de modificar código (FASE 1 obligatoria del encargo)

---

## 1. Auditoría del flujo de guardado existente (línea base)

### 1.1 Rutas identificadas

| Operación | Ruta de código | Método HTTP | Precondiciones |
|---|---|---|---|
| Cargar recurso | `EditResourceModel.load()` → `requestKubeResource` → `apiKubeGet(selfLink)` | GET | — |
| Guardar ConfigMap/Secret (v1) | `save()` → `replace()` → `requestReplaceKubeResource` → `apiKube.put(selfLink, { data })` | PUT | `prepareForReplace` fija `metadata.resourceVersion` al cargado originalmente → conflicto = 409 |
| Guardar el resto (Deployments, CRDs…) | `save()` → `patchWithPreconditions()` → `requestPatchKubeResource` → `apiKube.patch(selfLink, { data: patch }, { content-type: json-patch })` | PATCH (JSON Patch) | operaciones `test` sobre `/metadata/resourceVersion` (+ `/metadata/uid`) seguidas de `getUserChanges` |
| Diff contra original | `diffMode = "diff-original"` → `MonacoDiffEditor` con `sanitizeYamlForDiff` | — (local) | redacción de Secrets |
| Diff contra clúster | `diffMode = "diff-cluster"` → `fetchClusterVersion()` → GET | GET | redacción de Secrets |
| Conflictos 409 | `isConflictError` (PUT) / `isPatchConflictError` (PATCH 409 o 422 con test fallido) → `reportConflict()` → `conflict` observable → `SaveConflictNotice` | — | `rebaseOnClusterVersion()` como salida explícita |
| Errores de API | `JsonApiErrorParsed` con payload `KubeJsonApiError` (`code`, `reason`, `message`, `details.causes[]`) | — | `apiKube.onError` notifica 403 globalmente |
| Verificación post-guardado | `verifySaved()` → GET + `findUnpersistedChanges` (solo rutas, nunca valores) | GET | `stringData` write-only se verifica como base64 |

Architectura clave (`packages/core/src/renderer/components/dock/edit-resource/`):

- `store.ts` — `EditResourceTabStore`: `{ resource: selfLink, draft, firstDraft }` por pestaña del dock.
- `edit-resource-model/edit-resource-model.injectable.tsx` — modelo MobX: `configuration` (draft + validación local YAML), `diffMode`, `isBusy`, `conflict`, `save()`, `revertToOriginal()`, `reloadFromCluster()`, `rebaseOnClusterVersion()`.
- `edit-resource-model/save-verification.ts` — `usesOptimisticReplace`, `getUserChanges`, `prepareForReplace`, `findUnpersistedChanges`, `describeConflict`.
- `edit-resource-model/diff-redaction.ts` — `sanitizeSecretForDiff` / `sanitizeYamlForDiff`: redacción de `data`, `stringData` y `last-applied-configuration` para vistas diff.
- `view.tsx` — `EditResourceControls` (Kind/Name/Namespace, estado Unsaved/In Sync, conmutador Editor / Diff (Original) / Diff (Live), Revert, Reload) + `InfoPanel` (Save, Save & Close, Cancel) + `SaveConflictNotice`.
- `../editor-panel.tsx` → `../../monaco-editor/monaco-editor.tsx` — Monaco con `id = tabId`; modelo con URI `/monaco-editor/{tabId}`; los view-states (cursor, scroll) se conservan por URI en `monacoViewStates`; los marcadores se aplican con `editor.setModelMarkers(model, owner, markers)`; la validación sintáctica local YAML usa el owner `"yaml-validator"`.

### 1.2 Transporte de query parameters (hallazgo decisivo)

`JsonApi.request()` (`packages/utility-features/json-api/src/json-api.ts`) **ya soporta** `params.query` para `get/post/put/patch/del`: serializa con `querystring.stringify` y lo concatena a la URL. `KubeApi.delete()` ya lo usa. Por lo tanto, `?dryRun=All` se transmite por la arquitectura existente **sin ninguna capa HTTP nueva**.

`KubeApi.create/update/patch` (`packages/core/src/common/k8s-api/kube-api.ts`) hoy NO exponen query params: extensión aditiva y puramente opcional.

### 1.3 Regla de oro

**No se crea una segunda implementación paralela del editor.** La validación reutiliza exactamente los mismos builders del guardado (`prepareForReplace`, precondiciones JSON Patch + `getUserChanges`, `getEditSelfLinkFor`) con un único parámetro adicional `dryRun: "All"`.

---

## 2. Diseño por capas

### Capa 1 — `KubeApi` (common)

```ts
export interface KubeApiDryRunOptions {
  dryRun?: "All"; // único valor admitido por Kubernetes
}
```

- `create(desc, partialData?, opts?)`, `update(desc, data, opts?)` y `patch(desc, data, strategy?, opts?)` aceptan `opts.dryRun === "All"` y lo transmiten como `{ query: { dryRun: "All" } }`.
- Sin `opts` (o con valor distinto) el comportamiento es byte-idéntico al actual: cero cambio en operaciones existentes.
- La respuesta simulada se parsea igual que una real (`parseResponse`), pero **el contrato documentado es que el caller no debe almacenarla en stores ni tratarla como persistida**. `parseResponse` solo actualiza `resourceVersions` en respuestas de lista — un objeto individual de dry-run no toca ningún cache.

### Capa 2 — requests del editor (renderer)

`request-replace-kube-resource.injectable.ts` y `request-patch-kube-resource.injectable.ts`:

- Firma extendida: `(selfLink, payload, opts?: { dryRun?: "All" })`.
- El resultado fallido incorpora `errorPayload?: KubeJsonApiError` (payload estructurado del servidor) además de `error`/`isConflict` existentes. Aditivo: los consumidores actuales no cambian.

### Capa 3 — modelo (`EditResourceModel.validateDraft`)

Reutiliza la bifurcación de `save()`:

- `usesOptimisticReplace(currentVersion)` → PUT `?dryRun=All` con `prepareForReplace(currentVersion, originalResourceVersion)` (resourceVersion original preservado).
- Si no → PATCH `?dryRun=All` con `[...precondiciones resourceVersion/uid, ...getUserChanges]`.
- selfLink derivado con `getEditSelfLinkFor(firstVersion)` (incluye la corrección de la etiqueta legada `k8slens-edit-resource-version`).

Estado nuevo (MobX):

```ts
draftValidation: observable.box<DryRunValidationState>  // "not-validated" | "validating" | "passed" | "failed" | "unavailable"
draftRevision: observable.box<number>                    // contador de invalidación
```

- `draftRevision` se incrementa en TODO punto que muta el contenido editable o su base: `configuration.onChange`, `load()`, `reloadFromCluster()`, `revertToOriginal()`, `rebaseOnClusterVersion()`, `verifySaved()`. Cada incremento resetea `draftValidation` a `not-validated` — cubre edición posterior, cambio de recurso (reload/rebase) y, por contexto de frame, cambio de clúster (el modelo es keyed-singleton por tabId dentro del frame del clúster; al cambiar de clúster el frame se destruye y recrea).
- **Carrera de respuesta tardía:** `validateDraft()` captura la revisión al iniciar; si la respuesta llega con revisión distinta, se descarta en silencio (el estado ya fue reseteado por la edición).
- **Sin efectos colaterales:** no toca `draft`, `firstDraft`, `remoteClusterResource`, stores ni notifications de éxito. La validación jamás dispara un PUT/POST/PATCH real: la única mutación posible del request es `?dryRun=All`.

### Capa 4 — clasificación y redacción (`dry-run-validation.ts`)

Clasificación del resultado (estructura, no strings sueltos):

| `errorKind` | Origen |
|---|---|
| `malformed-yaml` | validación local previa (`validateKubernetesResourceYaml`) — no se llama al servidor |
| `bad-request` | HTTP 400 |
| `forbidden` | HTTP 403 (RBAC) |
| `not-found` | HTTP 404 (API o recurso inexistente) |
| `conflict` | HTTP 409 (resourceVersion / precondition) |
| `invalid` | HTTP 422 (esquema, campo inmutable, política) — con `details.causes[]` |
| `admission-denied` | 400/422 con mensaje de admission webhook (el mensaje exacto del webhook se conserva, redactado) |
| `connection` | timeout / abort / error de red |
| `unknown` | resto |

Redacción de Secrets (crítica):

- `redactSecretText(kind, text, draft)`: si `kind === "Secret"`, reemplaza en mensajes y causes cada valor exacto presente en `data`/`stringData` del draft por `<redacted>`. Nunca se muestra la respuesta completa del servidor para Secrets: solo `message` + `causes` redactados.
- Nunca se muestran tokens/claves/contraseños en notificaciones ni capturas; los tests usan credenciales ficticias exclusivamente.
- `json-api` `writeLog` se endurece: antes de `logger.debug`, si el cuerpo/payload parseado es un manifiesto `kind: "Secret"`, sus `data`/`stringData` se redactan. Protege retroactivamente también el flujo de guardado real.

### Capa 5 — presentación (`view.tsx`)

- **Acción:** botón `Validate — Server Dry-Run` dentro de `EditResourceControls`, junto a los controles de edición existentes (Revert/Reload y Save del InfoPanel), con `flexWrap` existente para mantener la interfaz compacta.
- **Badge de estado** junto a Unsaved/In Sync: `Not Validated` (gris) / `Validating…` / `Validation Passed` (verde) / `Validation Failed` (rojo) / `Validation Unavailable` (naranja).
- **Banner `DraftValidationNotice`** (posicionado como `SaveConflictNotice`):
  - Éxito: `Server-side dry-run accepted by Kubernetes` + clúster + recurso (Kind/name) + hora + nota explícita de que NO fue guardado.
  - Fallo: clasificación + mensaje redactado + causes (campo + mensaje).
  - PROD: el banner muestra el clúster contra el que se valida y mantiene la identificación roja `#EF4444` del `ToolContextHeader`; la validación aprobada nunca se interpreta como autorización para guardar.
- **Marcadores Monaco:** owner `"server-dry-run"` sobre el modelo `createMonacoUri(tabId)`, solo en modo `normal` (en modo diff el original no es editable y el modified de Secret ya está redactado). Se limpian al editar o al cambiar de estado. La correspondencia JSON-pointer → línea la calcula `yaml-line-mapping.ts`, un escáner conservador de estilo bloque que **renuncia (sin marcador) ante flow style (`{}`/`[]`), block scalars (`|`/`>`), anclas/alias o multi-documento**: no se inventan ubicaciones.

### Capa 6 — seguridad y limitaciones (declaradas, no implícitas)

- Server-side dry-run no reemplaza validaciones locales, revisión humana ni protecciones PROD.
- No garantiza que un guardado posterior tenga éxito: el estado del clúster, las políticas y el recurso pueden cambiar después de validar (la respuesta 409 en el guardado real sigue siendo la autoridad).
- Kubernetes no persiste la solicitud dry-run, pero webhooks mutantes externos pueden tener efectos propios: no se presenta como garantía de cero efectos secundarios.
- La validación usa las mismas precondiciones de concurrencia que el guardado (resourceVersion original), por lo que un 409 en validación señala un borrador desactualizado.
- Guardado real tras validar: solo mediante la acción explícita Save/Save & Close existente, con todas sus confirmaciones intactas.

---

## 3. Archivos previstos

| Archivo | Cambio |
|---|---|
| `packages/core/src/common/k8s-api/kube-api.ts` | `KubeApiDryRunOptions` + `opts` en create/update/patch |
| `packages/core/src/common/k8s-api/kube-api-dry-run.test.ts` | nuevo |
| `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/request-replace-kube-resource.injectable.ts` | `opts` + `errorPayload` |
| `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/request-patch-kube-resource.injectable.ts` | `opts` + `errorPayload` |
| `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/dry-run-validation.ts` | nuevo: tipos, clasificación, redacción |
| `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/dry-run-validation.test.ts` | nuevo |
| `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/yaml-line-mapping.ts` | nuevo: mapeo conservador puntero→línea |
| `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/yaml-line-mapping.test.ts` | nuevo |
| `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable.tsx` | `validateDraft`, `draftValidation`, `draftRevision` |
| `packages/core/src/renderer/components/dock/edit-resource/edit-resource-model/dry-run.test.tsx` | nuevo |
| `packages/core/src/renderer/components/dock/edit-resource/view.tsx` | botón, badge, banner, marcadores |
| `packages/utility-features/json-api/src/json-api.ts` (+ dist rebuild) | redacción de Secret en `writeLog` |
| `docs/revival/scripts/verify-r7-02-dry-run.cjs` | nuevo: E2E Playwright con fixtures sintéticos |
| `docs/revival/evidence/r7-02/` | capturas |

**Fuera de alcance:** subrecursos (`/scale`, `/status`, `/eviction`), creación de recursos desde cero (no existe ese flujo en este editor), stores/optimistic-updates, R7-03.
