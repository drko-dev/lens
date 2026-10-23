# OpenLens DevOps Revival — R7-02 Certificación y Validación

**Hito:** R7-02 — Validación Pre-Vuelo y Server-Side Dry-Run (`dryRun=All`)
**Rama:** `feat/r7-devops-capabilities`
**Base:** `6514e4dffad63fc4d501a0b4d82a8e687a022594`
**Fecha:** 2026-10-23
**Resultado:** **PASS** — con evidencia de comportamiento (Jest) y gate final de revisión independiente aplicado.
**Nota de vigencia:** la evidencia Playwright de la sección 4 corresponde al árbol anterior al gate final y **no se reutiliza** para el código modificado; ver sección 9.

---

## 1. Matriz de validación

| Disciplina | Alcance | Resultado |
|---|---|---|
| TypeScript | `packages/core` (`npx tsc --noEmit -p packages/core/tsconfig.json`) | **0 errores** |
| TypeScript | `packages/utility-features/json-api` (`npx tsc --noEmit -p tsconfig.json`) | **0 errores** |
| ESLint | `src/common/k8s-api/kube-api.ts`, `kube-api-dry-run.test.ts`, `src/renderer/components/dock/edit-resource` | **0 errores, 0 warnings** |
| ESLint | `packages/utility-features/json-api/src/json-api.ts` + test | **0 errores, 0 warnings** |
| Jest | 10 suites (core): dry-run, validación, mapeo, vista, guardado y regresión | **157/157 PASS** |
| Jest | 1 suite (json-api): redacción en logs | **5/5 PASS** |
| Playwright E2E | Build ARM64 experimental, fixtures sintéticos `127.0.0.1` | **No re-ejecutado en el gate final** (ver 4 y 9) |
| Regresión | Suites existentes de guardado/diff/revert y `kube-api.test.ts` | **PASS sin cambios de expectativas** |

**Total Jest del alcance R7-02: 11 suites / 162 tests.**

---

## 2. Comandos ejecutados

```bash
# TypeScript
npx tsc --noEmit -p packages/core/tsconfig.json
(cd packages/utility-features/json-api && npx tsc --noEmit -p tsconfig.json)

# ESLint
(cd packages/core && PROD=true npx eslint --ext js,ts,tsx --max-warnings=0 \
  src/common/k8s-api/kube-api.ts \
  src/common/k8s-api/kube-api-dry-run.test.ts \
  src/renderer/components/dock/edit-resource)
(cd packages/utility-features/json-api && npx eslint --ext ts --max-warnings=0 src/json-api.ts src/json-api.test.ts)

# Jest (core)
(cd packages/core && npx jest \
  src/common/k8s-api/kube-api-dry-run.test.ts \
  src/common/k8s-api/__tests__/kube-api.test.ts \
  src/renderer/components/dock/edit-resource --verbose)

# Jest (json-api; el paquete exige 100% de cobertura global, por eso se desactiva
# la cobertura para este test focalizado — comportamiento preexistente del paquete)
(cd packages/utility-features/json-api && npx jest --coverage=false src/json-api.test.ts)

# E2E (build experimental ARM64)
node docs/revival/scripts/verify-r7-02-dry-run.cjs
```

Resultado Jest (core):

```text
PASS src/common/k8s-api/kube-api-dry-run.test.ts
PASS src/common/k8s-api/__tests__/kube-api.test.ts
PASS src/renderer/components/dock/edit-resource/edit-resource-model/dry-run.test.tsx
PASS src/renderer/components/dock/edit-resource/edit-resource-model/dry-run-validation.test.ts
PASS src/renderer/components/dock/edit-resource/edit-resource-model/yaml-line-mapping.test.ts
PASS src/renderer/components/dock/edit-resource/edit-resource-model/save.test.tsx
PASS src/renderer/components/dock/edit-resource/edit-resource-model/save.lab-integration.test.tsx
PASS src/renderer/components/dock/edit-resource/edit-resource-model/diff-and-revert.test.tsx
PASS src/renderer/components/dock/edit-resource/edit-resource-model/diff-redaction.test.ts
PASS src/renderer/components/dock/edit-resource/view.test.tsx
Test Suites: 10 passed, 10 total
Tests:       157 passed, 157 total
```

---

## 3. Cobertura de pruebas

### 3.1 Capa KubeApi (`kube-api-dry-run.test.ts`, 8 tests)

- `create`/`update`/`patch` envían `?dryRun=All` solo cuando se solicita.
- Sin `dryRun`: ningún query param (comportamiento previo intacto, misma aridad).
- `metadata.name`/`namespace` siguen fusionándose en el body como en un update real.
- El PATCH conserva el `content-type: application/json-patch+json`.
- Una respuesta dry-run **no** actualiza el cache `resourceVersions` del API.

### 3.2 Modelo (`dry-run.test.tsx`, 22 tests)

- ConfigMap: `PUT` con `dryRun:"All"` y `resourceVersion` original.
- Deployment: `PATCH` con `dryRun:"All"`, precondiciones `test` preservadas.
- Sin mutación de `draft`/`firstDraft`, sin notificaciones, sin read-back.
- YAML inválido → `malformed-yaml` sin llamar al servidor.
- 422 con causes, 403, 409, admission webhook (mensaje exacto), error de conexión.
- Secret: los valores devueltos por el servidor quedan `<redacted>` en el estado.
- Carreras: respuesta tardía tras edición/reload se descarta; clics repetidos se ignoran.
- Invalidación: editar o cambiar de versión resetea a `not-validated`.
- Guard rails: `resourceVersion` ausente → `unavailable`; validar no guarda; el guardado explícito posterior usa la ruta real sin `dryRun`.

### 3.3 Clasificación/redacción (`dry-run-validation.test.ts`, 22 tests)

- Extracción del payload estructurado; clasificación 400/403/404/409/422/5xx.
- Admission webhook distinguido y con mensaje íntegro.
- Causes con `field` y `message`; mensajes de red sin payload.
- Redacción exacta de `data` y `stringData`; no altera no-Secrets; ignora vacíos/no-strings.

### 3.4 Mapeo (`yaml-line-mapping.test.ts`, 9 tests)

- Mappings anidados, secuencias, claves citadas, escapes, claves numéricas.
- Rechazo de punteros bajo block scalars y flow containers; sin documentos múltiples.

### 3.5 Vista (`view.test.tsx`, 7 tests nuevos)

- Acción visible, estado inicial `Not Validated`, clic invoca `validateDraft`.
- Banner aceptado sin afirmar guardado (cluster, recurso, método, hora, "NOT saved").
- Banner fallido con causes; etiqueta PRODUCTION; reset al editar.

### 3.6 Logs (`json-api.test.ts`, 5 tests)

- Secret redactado en request/response y en errores del servidor.
- JSON Patch contra `/data` y `/stringData` redactado en el cuerpo del request.
- Respuestas de error que no son manifiestos `kind: Secret` no se registran en crudo:
  solo metadatos seguros (método, endpoint, código HTTP, clasificación).
- Manifiestos no-Secret intactos.

---

## 4. Playwright E2E — 18/18 checkpoints (evidencia del árbol previo, no vigente)

> **No reutilizar para el código actual.** Estos resultados se obtuvieron antes de las
> correcciones del gate final (protección de contexto, redacción ampliada y manejo de
> rechazos). El gate final **no re-ejecutó Playwright** porque los cambios afectan
> comportamiento ya cubierto por pruebas unitarias focalizadas y no modifican la
> integración visual del flujo (ver sección 9).

Script: `docs/revival/scripts/verify-r7-02-dry-run.cjs`
Ejecutable: `open-lens/dist-r7-02-stage/mac-arm64/OpenLens DevOps.app`
Entorno: ARM64, Electron 22.3.3, fixtures sintéticos locales; **sin clústeres reales**.

```text
✓ Catalog loaded successfully.
✓ Editor opened with Validate — Server Dry-Run action in Not Validated state.
✓ Server-side dry-run accepted banner shown.
✓ Banner identifies cluster, resource, method and time.
✓ Banner states NOT saved and the draft remains dirty.
✓ Draft content, cursor workflow and undo/redo history preserved.
✓ PUT ?dryRun=All sent with the original resourceVersion.
✓ No real mutation was performed as a consequence of validating.
✓ Editing the draft invalidates the previous validation.
✓ 422 rejection shown with structured field causes.
✓ 403 RBAC rejection classified.
✓ Admission webhook rejection shown with its exact message.
✓ Secret values are redacted from validation results.
✓ Deployment PATCH ?dryRun=All sent with the resourceVersion precondition.
✓ Explicit Save performed the real PATCH (no dryRun) after validation.
✓ Real save persisted; validation itself never persisted.
✓ PROD cluster validation executed with cluster identification.
✓ PROD hazard identification (#EF4444) preserved.

>>> ALL R7-02 PLAYWRIGHT VERIFICATION CHECKS PASSED SUCCESSFULLY! <<<
```

### 4.1 Peticiones observadas en el fixture

```json
"dryRunRequests": [
  "PUT /api/v1/namespaces/default/configmaps/app-config?dryRun=All",
  "PUT /api/v1/namespaces/default/configmaps/invalid-config?dryRun=All",
  "PUT /api/v1/namespaces/default/configmaps/forbidden-config?dryRun=All",
  "PUT /api/v1/namespaces/default/configmaps/webhook-config?dryRun=All",
  "PUT /api/v1/namespaces/default/secrets/app-secret?dryRun=All",
  "PATCH /apis/apps/v1/namespaces/default/deployments/web-deploy?dryRun=All",
  "PUT /api/v1/namespaces/default/configmaps/app-config?dryRun=All"
],
"realMutations": [
  "PATCH /apis/apps/v1/namespaces/default/deployments/web-deploy"
]
```

Interpretación:

- Todas las validaciones usaron `?dryRun=All` con el método del flujo original.
- La **única** mutación real fue el `PATCH` sin `dryRun` ejecutado por un clic explícito en Save.
- Posterior a las validaciones y antes del Save, el fixture no recibió ninguna mutación real.

### 4.2 Evidencia visual

| Archivo | Checkpoint |
|---|---|
| `01-catalog-view.png` | Catálogo con clusters DEV y PROD. |
| `02-editor-not-validated.png` | Editor con la acción Validate en `Not Validated`. |
| `03-dry-run-accepted.png` | Banner aceptado con cluster/recurso/hora y "NOT saved". |
| `04-draft-preserved-after-validation.png` | Borrador y edición preservados. |
| `05-edit-resets-validation.png` | Editar invalida el resultado anterior. |
| `06-validation-422-causes.png` | 422 con causes estructuradas. |
| `07-forbidden-403.png` | 403 RBAC. |
| `08-admission-webhook.png` | Rechazo por admission webhook. |
| `09-secret-redacted.png` | Secret redactado en mensajes y causes. |
| `10-deployment-patch-dry-run.png` | PATCH dry-run de Deployment. |
| `11-real-save-after-validation.png` | Save explícito (PATCH real, sin dryRun). |
| `12-prod-dry-run.png` | Validación contra PROD con identificación roja. |

---

## 5. Hashes de la build experimental

| Artefacto | SHA-256 |
|---|---|
| `OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps` | `6f38b34a9eaf6cfa8b55ed0c24f0afeb31bfb32b1c0336c96c98ae0f3612b075` |
| `open-lens/static/build/lens.js` | `4e020040ddd62c7aa6574a7b8a4d63afe9a1773dbd715109ab95d5a25758a6cf` |
| `packages/core/static/build/library/renderer.js` | `775c7c482160c01b25e70e4fbef2c98d124e150a152eb1f105e6c4f7fbaf6c35` |
| `packages/utility-features/json-api/dist/index.js` | `629ff4026aa214fd30bb66e36ad5491cc885feadaba5ebad5fa8397253da9b0f` |

Tamaño de la stage: 638 MB (`open-lens/dist-r7-02-stage`, ignorada por git).

---

## 6. Limitaciones declaradas

1. **Dry-run no es una garantía absoluta:** valida contra el estado actual del API server; el
   recurso, las políticas y el clúster pueden cambiar antes del guardado real (la autoridad sigue
   siendo el 409/422 del guardado efectivo).
2. **Webhooks mutantes externos:** Kubernetes no persiste la solicitud dry-run, pero un admission
   webhook externo podría tener efectos propios. La UI no afirma "cero efectos secundarios".
3. **RBAC:** la validación exige los mismos permisos que el guardado real; un usuario sin `update`
   verá 403 también en dry-run (comportamiento correcto, documentado).
4. **Marcadores de línea:** solo se muestran cuando el mapeo puntero→línea es fiable (YAML en
   bloque). Con flow style, block scalars o YAML exótico se muestra el campo en texto sin marcador.
5. **Modo diff:** los marcadores se limitan al modo Editor; en los modos diff no se añaden.
6. **Cobertura jest del paquete json-api:** su configuración exige 100% global; el test focalizado
   se ejecuta con `--coverage=false` (comportamiento preexistente del paquete, que no tenía tests).
7. **E2E:** usa exclusivamente fixtures sintéticos; no se validó contra un clúster real (por diseño).

---

## 7. Casos no cubiertos (declarados)

- Creación de recursos desde cero (no existe flujo de alta en el editor actual).
- Subrecursos `/scale`, `/status`, `/eviction` (fuera de alcance).
- Dry-run con `dryRun=All` a través de `KubeApi.create` en la UI (cubierto por unit tests, sin flujo UI de creación).
- Recursos con esquemas CRD personalizados y webhooks que requieran autenticación específica
  más allá del kubeconfig del clúster.

---

## 8. Dictamen

R7-02 cumple el criterio de finalización: el operador puede validar un borrador YAML contra
Kubernetes sin persistirlo, interpretar el resultado (éxito, 400/403/404/409/422, admission
webhook, conexión) y continuar editando o guardar mediante una acción separada y explícita.

**R7-02 queda listo para revisión independiente. No se realizó commit ni push.**

---

## 9. Gate final de revisión independiente (R7-02)

**Alcance:** correcciones obligatorias 1–5 del gate final. Sin commit, sin push, sin clústeres reales.

### 9.1 Correcciones aplicadas

| # | Corrección | Implementación | Pruebas |
|---|---|---|---|
| 1 | Protección del contexto Kubernetes | `validateDraft()` ejecuta `assertToolActionClusterContext()` antes del request; captura una identidad inmutable (cluster, selfLink, resourceVersion, uid) y descarta la respuesta si el clúster, el recurso o el borrador cambiaron. Contexto incorrecto → `failed / context-mismatch`, sin llamada al API server. | 2 negativas en `dry-run.test.tsx` |
| 2 | Redacción de Secret ampliada | `dry-run-validation.ts` redacta valores de la versión previa y actual, `message`, `reason`, `causes[].message` y `causes[].field`. `json-api.ts` cubre manifiestos, merges y JSON Patch contra `/data` y `/stringData`; las respuestas de error no-`Secret` se registran solo como metadatos seguros (método, endpoint depurado, código HTTP, clasificación). | 7 en `dry-run-validation.test.ts`, 1 en `dry-run.test.tsx`, 2 en `json-api.test.ts` |
| 3 | Errores inesperados | `validateDraft()` envuelve toda la operación; un rechazo o excepción deja `failed / unknown` con mensaje genérico, sin filtrar el error crudo, sin dejar `validating`, sin alterar borrador/base y sin guardar. | 2 en `dry-run.test.tsx` (promesa rechazada + fallo antes del request) |
| 4 | Limpieza documental | Espacio final eliminado de `R7_PROVISIONAL_ROADMAP.md` (`git diff --check` limpio). Limitaciones de dry-run mantenidas y ampliadas en la sección 6. | `git diff --check` |
| 5 | Validación final | Tests, TypeScript, ESLint y `git diff --check` re-ejecutados sobre el árbol corregido. | este documento |

### 9.2 Comandos y resultados del gate final

```bash
git diff --check                                              # sin salida
npx tsc --noEmit -p packages/core/tsconfig.json               # 0 errores
(cd packages/utility-features/json-api && npx tsc --noEmit -p tsconfig.json)  # 0 errores
(cd packages/core && PROD=true npx eslint --ext js,ts,tsx --max-warnings=0 \
  src/common/k8s-api/kube-api.ts src/common/k8s-api/kube-api-dry-run.test.ts \
  src/renderer/components/dock/edit-resource)                 # 0 errores, 0 warnings
(cd packages/utility-features/json-api && npx eslint --ext ts --max-warnings=0 \
  src/json-api.ts src/json-api.test.ts)                       # 0 errores, 0 warnings
(cd packages/core && npx jest src/common/k8s-api/kube-api-dry-run.test.ts \
  src/common/k8s-api/__tests__/kube-api.test.ts \
  src/renderer/components/dock/edit-resource)                 # 10 suites / 157 tests PASS
(cd packages/utility-features/json-api && npx jest --coverage=false src/json-api.test.ts)  # 5 tests PASS
```

### 9.3 Playwright: decisión de no re-ejecución

No se repitió Playwright. Los cambios del gate final son de lógica interna
(contexto, redacción, manejo de rechazos) y están cubiertos por pruebas unitarias
focalizadas que ejercitan exactamente esas rutas, incluida la renderización del aviso
visible. La integración visual y el cableado del flujo dry-run no cambiaron. La evidencia
de la sección 4 pertenece al árbol anterior y queda marcada como **no vigente** para este
código; no se reutiliza como prueba del estado actual.

### 9.4 Limitaciones (actualizadas)

1. Una validación correcta **no garantiza** que el guardado posterior funcione: el clúster,
   las políticas o los webhooks pueden cambiar entre la validación y el guardado real.
   La autoridad final sigue siendo el 409/422 del guardado efectivo.
2. Kubernetes no persiste la solicitud dry-run, pero un admission webhook externo podría
   tener efectos propios; la UI no afirma "cero efectos secundarios".
3. RBAC: dry-run exige los mismos permisos que el guardado real.
4. Marcadores de línea solo con mapeo puntero→línea fiable; en diff no se muestran.
5. Los logs de respuestas no-`Secret` de un endpoint Secret se limitan a metadatos seguros:
   se prioriza no filtrar valores sobre la riqueza del log.
6. E2E con fixtures sintéticos; no se usó un clúster real (por diseño).

### 9.5 Dictamen del gate final

Las cinco correcciones obligatorias están implementadas y probadas. No se realizó commit,
push ni se inició R7-03. **R7-02 queda detenido a la espera de autorización explícita para
el commit.**
