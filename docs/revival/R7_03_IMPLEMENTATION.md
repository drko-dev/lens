# OpenLens DevOps Revival — R7-03 Implementación

**Hito:** R7-03 — Control de Rollouts y Reversión de Cargas de Trabajo
**Rama:** `feat/r7-devops-capabilities`
**Base:** `11d47248774710b319912962ae780724c09031d6` (R7-02 commiteado)
**Fecha:** 2026-10-23
**Estado:** Correcciones del gate de seguridad implementadas; E2E vigente PASS y validación R7 dirigida PASS. Jest y ESLint globales siguen fallidos. Se autorizó únicamente el checkpoint local de R7-03, sin push; esto no equivale a certificación global.

---

## 1. Resumen funcional

R7-03 agrega un flujo completo de operación de rollouts sobre `Deployment`:

- Historial de revisiones construido desde los `ReplicaSet` reales del clúster.
- Diff de solo lectura entre la revisión actual y cualquier revisión histórica.
- Rollback seguro en cinco pasos: historial → diff → **server-side dry-run** → confirmación → ejecución y observación.
- Pausa y reanudación de rollouts mediante `spec.paused`.
- Historial de solo lectura de `ControllerRevision` para `DaemonSet` y `StatefulSet`.

Ninguna operación se ejecuta contra un clúster real en pruebas: la evidencia E2E usa fixtures HTTP sintéticos en `127.0.0.1`.

---

## 2. Arquitectura

### 2.1 Lógica pura (`rollout/`)

| Archivo | Responsabilidad |
|---|---|
| `revisions.ts` | Normaliza `ReplicaSet` en entradas de revisión; filtra por owner UID/namespace, detecta huérfanos, ajenos, duplicados, gaps e historial expirado; ordena descendente; resuelve revisión actual por anotación o inferencia. |
| `template-patch.ts` | Sanitiza el `PodTemplateSpec` (quita metadatos del controlador y `pod-template-hash`), calcula un JSON Patch raíz `/spec/template` con precondiciones `test` de `uid` y `resourceVersion`, fingerprint estable y categorías de cambio. |
| `prepare-rollback.ts` | Relee Deployment y ReplicaSet frescos, valida todas las condiciones de seguridad, arma el plan y aplica el patch en modo dry-run o real. |
| `rollout-progress.ts` | Clasifica el estado (`accepted`, `progressing`, `completed`, `degraded`, `failed`, `timedout`, `unverified`) con timeout de observación de 120 s y polling serial de 2 s. |
| `errors.ts` | Conserva códigos HTTP y paths de validación; no expone mensajes/cause text arbitrarios del API server. |

### 2.2 Flujo de rollback

1. El historial entrega `preferredRevision` al diálogo.
2. `prepareRollback` obtiene Deployment y ReplicaSet **frescos** (nunca usa el store).
3. Bloquea si: Deployment/ReplicaSet fue sustituido, UID/namespace/kind/owner/controller reference no coincide, revisión podada, template fresco ausente, 403, Deployment en borrado/pausado, número de revisión cambiado o precondición fallida. No reutiliza templates históricos capturados antes de revalidar.
4. El diff se muestra antes de cualquier mutación.
5. El dry-run envía `PATCH ...?dryRun=All` con el plan completo y precondiciones.
6. La confirmación exige checkboxes; en PROD exige además tipear el nombre exacto del Deployment.
7. Antes de ejecutar se **relee el estado** y se recalcula el plan. Si el fingerprint cambió, se invalida el dry-run anterior y se obliga a repetirlo.
8. La ejecución envía el mismo patch sin `dryRun`.
9. Se observa el rollout con generación, timers cancelables y consultas sin solapamiento. Tres errores consecutivos o el timeout terminan en estado visible `unverified`/`timedout`; ninguno se presenta como rollback fallido. El mensaje aclara que el API puede haber aceptado la operación aunque ya no pueda verificarse.

### 2.3 Patch generado

- Raíz exclusiva: `/spec/template`.
- Nunca toca `spec.replicas`, `spec.strategy`, `spec.selector`, `status` ni metadatos de nivel superior.
- Precondiciones delante de las operaciones:
  - `/metadata/uid`
  - `/metadata/resourceVersion`
- Los cambios anidados se expresan como operaciones JSON Patch recursivas.
- El fingerprint se calcula sobre el template sanitizado, de modo que campos del controlador no invaliden una comparación.

### 2.4 Observabilidad y concurrencia

- `classifyRollout` detecta `inProgress` antes de confirmar y exige aceptación explícita.
- La preparación, el dry-run, la ejecución y el polling usan generaciones/identidad de operación; una respuesta tardía no puede cambiar un diálogo cerrado, reutilizado, con otra revisión o en otro contexto.
- El polling se cancela con contador de generación al cerrar/desmontar y no permite consultas solapadas.
- Un 409 muestra "Refresh and retry" y evita continuar con estado obsoleto.
- El timeout se informa como resultado, sin afirmar que el rollout falló.

### 2.5 PROD

- Menú: pausa/reanudación en PROD abre confirmación con banner rojo `#EF4444`.
- Diálogo de rollback: advertencia roja, checkbox obligatorio y nombre exacto del Deployment.
- Diff: banner de comparación de solo lectura.
- La identidad del clúster se captura y revalida tras cada `await`; antes del PATCH se vuelven a validar las confirmaciones, la revisión y el plan fresco. Si el PATCH puede haber sido aceptado pero el contexto cambia, la UI exige verificar el clúster original antes de reintentar.
- Pause/Resume en PROD muestra nombre/ID del clúster y namespace/recurso reales antes de confirmar.

### 2.6 DaemonSet / StatefulSet

`ControllerRevisionHistory` lista únicamente las revisiones de namespace correcto y con `ownerReferences[].uid`, `kind` y `controller: true` coincidentes. `revision` y `data` se leen desde la raíz del objeto `apps/v1`; `data` es payload `RawExtension` propiedad del controlador y no se interpreta como una estructura universal. Si no coincide con un formato reconocido, la UI muestra `Not available`, no una imagen inferida. No ofrece acciones de escritura.

Las revisiones actuales de DaemonSet y StatefulSet se serializan como strategic-merge patches del objeto de trabajo, normalmente con `spec.template` y marcadores `$patch`; el contenido puede diferir por controlador/versión. La extracción de imágenes solo reconoce una plantilla de Pod identificable.

---

## 3. Archivos

### Modificados (12)

- `.gitignore` — ignora `open-lens/dist-r7-03-stage`.
- `packages/core/src/common/k8s-api/endpoints/deployment.api.ts` — `setPaused()` con JSON Patch condicional por UID y `resourceVersion`.
- `packages/core/src/common/k8s-api/endpoints/index.ts` — exporta la API de ControllerRevision.
- `packages/core/src/renderer/components/workloads-deployments/deployment-details.tsx` — historial, `Paused`, `Revision History Limit`.
- `packages/core/src/renderer/components/workloads-deployments/deployment-menu.tsx` — Rollback, Pause/Resume y guardas PROD.
- `packages/core/src/renderer/components/workloads-deployments/deployment-replicasets.tsx` — tabla de historial completa.
- `packages/core/src/renderer/components/workloads-deployments/deployment-replicasets.scss` — estilos de tabla, estados y advertencias.
- `packages/core/src/renderer/components/workloads-daemonsets/daemonset-details.tsx` — historial read-only.
- `packages/core/src/renderer/components/workloads-statefulsets/statefulset-details.tsx` — historial read-only.
- `packages/kube-object/src/specifics/deployment.ts` — `paused`, `revisionHistoryLimit`.
- `packages/kube-object/src/specifics/index.ts` — exporta `ControllerRevision`.
- `docs/revival/R7_PROVISIONAL_ROADMAP.md` — estado R7-03.

### Nuevos — modelo y API

- `packages/kube-object/src/specifics/controller-revision.ts`
- `packages/core/src/common/k8s-api/endpoints/controller-revision.api.ts`
- `packages/core/src/common/k8s-api/endpoints/controller-revision.api.injectable.ts`

### Nuevos — lógica y UI (`workloads-deployments/rollout/`)

- `revisions.ts` + `revisions.test.ts`
- `template-patch.ts` + `template-patch.test.ts`
- `prepare-rollback.ts` + `prepare-rollback.test.ts`
- `rollout-progress.ts` + `rollout-progress.test.ts`
- `errors.ts` + `errors.test.ts`
- `state.injectable.ts`, `open.injectable.ts`
- `dialog.tsx` + `dialog.test.tsx`
- `diff-state.injectable.ts`, `diff-open.injectable.ts`
- `diff-dialog.tsx` + `diff-dialog.test.tsx`
- `controller-revisions.tsx` + `.scss` + `controller-revisions.test.tsx`
- `rollout-rollback-dialog-cluster-frame-child-component.injectable.ts`
- `revision-diff-dialog-cluster-frame-child-component.injectable.ts`
- `rollout-dialog.scss`

### Nuevos — pruebas de integración de UI

- `deployment-replicasets.test.tsx`
- `deployment-menu.test.tsx`

### Nuevos — verificación

- `docs/revival/scripts/verify-r7-03-rollouts.cjs`
- `docs/revival/scripts/verify-r7-03-r7-02-regression.cjs`
- `docs/revival/R7_03_VALIDATION.md`
- `docs/revival/R7_03_VERIFICATION.json`
- `docs/revival/R7_03_SECURITY_REVIEW.md`
- `docs/revival/evidence/r7-03/` (11 capturas + JSON/log)
- `docs/revival/evidence/r7-03/r7-02-regression/` (12 capturas + JSON)

---

## 4. Decisiones y límites

- **No se usa `kubectl rollout undo`.** El rollback se implementa como patch JSON con precondiciones, reutilizando la ruta de dry-run de R7-02.
- **El rollback restaura solo `spec.template`.** No revierte réplicas, estrategia, selector ni otros campos del spec. El diálogo lo declara explícitamente.
- **El historial depende de `ReplicaSet` vivos.** Si el controlador podó revisiones, se muestra una advertencia y no se permite rollback a revisiones ausentes.
- **Duplicados de revisión** se marcan como inválidos para rollback.
- **Pausa** vuelve a leer el Deployment, verifica UID/namespace/nombre, y usa JSON Patch con tests de UID y `resourceVersion`; una respuesta no verificada no cambia el estado local. Un 409 informa concurrencia.
- **PROD** se determina por `preferences.clusterEnvironment === "production"`.
- **ControllerRevision** es read-only en este hito; no se implementa rollback de DS/STS.

---

## 5. Limitaciones conocidas

- La precondición `resourceVersion` puede producir 409 si el Deployment cambia entre la relectura y el patch; el flujo exige reintentar con estado fresco.
- El polling de observación es de 2 s y puede mostrar un estado intermedio si el rollout tarda más de 120 s.
- El diff usa `MonacoDiffEditor` de solo lectura; no edita el template.
- La certificación global de `packages/core` no está aprobada: sus suites fallidas y los 298 errores/14 warnings del lint global se documentan en `R7_03_VALIDATION.md`; los fallos sin comparación dirigida no se etiquetan como preexistentes. La preferencia de densidad nació en R5, y Release 6 (R6-04) la generalizó a las superficies de listados implicadas en los snapshots comparados; no se atribuye a R7-01. Ver también `R7_03_SECURITY_REVIEW.md`.
