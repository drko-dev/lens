# OpenLens DevOps Revival — R7-04 Implementación

**Hito:** R7-04 — Almacenamiento Moderno: VolumeSnapshots CSI y Expansión de PVCs
**Rama:** `feat/r7-devops-capabilities`
**Base:** `6ea8bb41eb9797939ecc6d9c0da6c902017cb6f4` (R7-03 commiteado)
**Fecha:** 2026-10-23
**Estado:** Funcionalidad implementada y verificada con tests dirigidos, lint dirigido y E2E vigente PASS (14/14) sobre build experimental ARM64. La suite global de core y el ESLint global siguen fallidos con el inventario de R7-03 (no se ejecutaron de nuevo en R7-04). **Sin commit: pendiente de revisión independiente.**

---

## 1. Resumen funcional

R7-04 agrega soporte de almacenamiento CSI moderno:

- **VolumeSnapshots, VolumeSnapshotClasses y VolumeSnapshotContents** bajo la categoría `Storage` del sidebar, con descubrimiento dinámico: las secciones y rutas solo aparecen si el grupo de API `snapshot.storage.k8s.io/v1` está presente en el descubrimiento del clúster.
- **Detalle de recursos de snapshot** con drawers de solo lectura y fases clasificadas (`Ready`, `Error`, `Pending`, `Unknown`) según `status.readyToUse` / `status.error`.
- **Create VolumeSnapshot** en el menú contextual de PVCs, con nombre validado (DNS subdomain), snapshot class opcional y creación en dos etapas: **server-side dry-run** (`POST ?dryRun=All`) y luego la creación real sin dry-run.
- **Create VolumeSnapshot solo cuando el clúster expone la API**: el ítem del menú usa `shouldShowResourceInjectionToken` (por clúster) para el recurso `snapshot.storage.k8s.io/v1, volumesnapshots`; si el clúster no lo lista (o el discovery está pendiente), la acción no se ofrece, tal como se certifica con el clúster Legacy en E2E.
- **Expand PVC** en PVCs cuyo StorageClass declare `allowVolumeExpansion: true`, con validación de cantidad exacta mediante aritmética BigInt sin pérdidas (ver §2.5), PATCH JSON con precondiciones `uid`/`resourceVersion`, dry-run previo obligatorio y clasificación de fase de expansión (`capacityUpdated` / `pending` / `error`).
- **Guardas PROD** en ambas mutaciones: banner rojo `#EF4444`, checkbox de acknowledgment y tipeo exacto del nombre del PVC, con exactamente **un** dry-run que precede a la mutación real.

Ninguna operación se ejecuta contra un clúster real en pruebas: la evidencia E2E usa fixtures HTTP sintéticos en `127.0.0.1` con tres clústeres simulados (DEV con CSI, PROD con CSI y Legacy sin snapshots).

---

## 2. Arquitectura

### 2.1 Modelos (`packages/kube-object`)

| Archivo | Responsabilidad |
|---|---|
| `specifics/volume-snapshot.ts` | `VolumeSnapshot` con `spec.source` (`persistentVolumeClaimName` / `volumeSnapshotContentName`), `spec.volumeSnapshotClassName`, `status.readyToUse`, `status.restoreSize`, `status.error`. |
| `specifics/volume-snapshot-class.ts` | `VolumeSnapshotClass` con `driver` y `deletionPolicy`. |
| `specifics/volume-snapshot-content.ts` | `VolumeSnapshotContent` al esquema real de CSI: `spec.driver`, `spec.deletionPolicy` (sin default inferido: `"-"` cuando el clúster no lo reporta), `spec.source.{volumeHandle,snapshotHandle}`, `spec.volumeSnapshotRef` a nivel spec, `spec.volumeSnapshotClassName`, `status.*`; los handles no se exponen en la UI. |
| `specifics/persistent-volume-claim.ts` | `PersistentVolumeClaimStatus` ampliado con `capacity` y `conditions` (contract API real, usados por la fase de expansión). |

### 2.2 APIs (`packages/core/common/k8s-api/endpoints`)

- `volume-snapshot.api.ts` / `volume-snapshot-class.api.ts` / `volume-snapshot-content.api.ts`: APIs `snapshot.storage.k8s.io/v1` con endpoints de listado/watch/detalle y POST para snapshots, siguiendo los patrones existentes de `KubeObjectApi`.
- Cada API tiene su `*.api.injectable.ts` correspondiente.
- `index.ts` exporta las tres APIs nuevas.

### 2.3 Rutas y descubrimiento dinámico

- Rutas en `src/common/front-end-routing/routes/cluster/storage/{volume-snapshots,volume-snapshot-classes,volume-snapshot-contents}/` con `*.route.injectable.ts` y `child-route-param-registrations.injectable.ts`.
- **Decisión clave de integración:** las tres rutas son `isEnabled` vía `shouldShowResourceInjectionToken` (basado en `resourcesToShow` sincronizado main→renderer). Una versión intermedia basada en `hostedCluster.knownResources` solo funciona en main y mostraba las secciones siempre visibles; se corrigió hacia la inyección correcta que ya existía para PVCs.
- Items de sidebar bajo el grupo `Storage`, heredando la visibilidad de la ruta.

### 2.4 Vistas

- `storage-volume-snapshots/`, `storage-volume-snapshot-classes/`, `storage-volume-snapshot-contents/`: listas (`*.tsx` + `.scss` siguiendo Midnight Graphite / densidad compacta), stores, drawers de detalle y detail items registrables (`volume-snapshot{,-class,-content}-detail-item.injectable.ts`).
- Las fases se resuelven con helpers puros (`classifySnapshotPhase`).

### 2.5 Menú PVC y mutaciones

- `storage-volume-claims/volume-claim-menu.tsx` (+ `injectable`): registra `Create VolumeSnapshot` y `Expand PVC` en `kubeObjectMenuItemInjectionToken`. `Create VolumeSnapshot` solo se muestra si el clúster lista `volumesnapshots` (por clúster, vía `shouldShowResourceInjectionToken`). `Expand PVC` queda deshabilitado (con tooltip con motivo) hasta confirmar —por clúster y con caché por `(clusterId, storageClassName)` en `pvc-expansion-capability.injectable.ts`— que el StorageClass permite expansión; distingue `denied`, `unknown` (pendiente de confirmación), `forbidden` (RBAC 403) y `unreachable` (sin conectividad); un PVC está habilitado solo con `status.phase === "Bound"` estricto (fase ausente, `Pending`, `Lost` u otro estado desconocido queda deshabilitado).
- `storage-volume-claims/create-snapshot/`:
  - `create-snapshot.ts` (helpers puros testables): `validateSnapshotName`, `buildVolumeSnapshotManifest` (source PVC mismo namespace, snapshot class omitida si no se provee), `classifySnapshotPhase` (estado presente → `Pending`/`Ready`/`Error`; sin estado → `Unknown`; nunca se infiere readiness).
  - Diálogo en dos pasos: formulario → dry-run (`POST ?dryRun=All`) → confirmación → POST real sin dry-run.
  - **Invalidación de dry-run:** cualquier cambio posterior al dry-run aprobado (nombre o `volumeSnapshotClass`) resets el estado y borra la huella de la operación aprobada (`approvedFingerprint`), así que no se puede ejecutar una petición distinta a la validada por el servidor.
  - **Revalidación antes del POST real:** se vuelve a leer el PVC del clúster y se compara el UID; desalineación → aborto con error y sin mutar; la huella del manifiesto aprobado recibe otra verificación exacta antes de crear.
- `storage-volume-claims/expand-pvc/`:
  - `expand-pvc.ts` (helpers puros testables): `parseQuantity` (`bigint` exacto sin `parseFloat`: unidades binarias Ki–Ei, decimales k–E, notación exponente, rechazo de fracciones no exactas y del techo int64 de Kubernetes), `validatePvcExpansion` (estrictamente mayor, StorageClass requerido y con `allowVolumeExpansion`), `buildPvcExpansionPatch` (JSON Patch con precondiciones `test` sobre `/metadata/uid` y `/metadata/resourceVersion` y reemplazo de `/spec/resources/requests/storage`; falla de forma segura si la metadata es incompleta o la cantidad inválida y preserva la representación cruda que el operador ingresó), `classifyPvcExpansionPhase` (compara `capacity` actual vs `conditions[type=Resizing|FileSystemResizePending]`; `PATCH aceptado` nunca se presenta como capacidad ampliada y un `ControllerResizeFailed` se reporta como error).
  - Diálogo en dos pasos: cantidad nueva → dry-run (`PATCH ?dryRun=All`) → confirmación → PATCH real sin dry-run.
  - **Invalidación de dry-run:** cambiar el tamaño después de aprobar el dry-run resets estado y borra la huella aprobada; el botón de continuar se deshabilita hasta un nuevo dry-run.
  - **Revalidación antes del PATCH real:** el parche se construye con el `resourceVersion` de una relectura fresca (operación real con `test`-precondiciones) y el StorageClass se vuelve a validar (si dejó de permitir expansión → aborto sin mutar); entre el GET del StorageClass y el PATCH se re-verifican generación, clúster, solicitud y contexto PROD; la huella aprobada (`operation:"expand-pvc"` + UID + `resourceVersion` del PVC observado en el dry-run + tamaño exacto + StorageClass) se re-verifica antes del PATCH: si el `resourceVersion` cambió (el PVC se tocó por cualquier vía), la aprobación se invalida, se regresa al formulario y se exige un nuevo dry-run — nunca se envía un PATCH con una versión nueva bajo una autorización anterior. El parser rechaza además cantidades de más de 64 caracteres o con `|exponente| > 32` sin excepciones.
- PROD: ambas mutaciones exigen banner rojo, acknowledgment (clic forzado sobre el texto porque el checkbox nativo está oculto por estilos) y tipeo exacto del nombre del PVC antes de habilitar la ejecución.

### 2.6 Guardas defensivas

- `renderer/components/events/store.ts`: `getEventsByObject` ignora eventos sin `involvedObject` en vez de crashear (contra-provocado por fixtures sintéticos malformados; la guarda es segura para datos reales).

---

## 3. Archivos

### Modificados (4)

- `packages/kube-object/src/specifics/index.ts` — exporta los tres modelos de snapshot.
- `packages/kube-object/src/specifics/persistent-volume-claim.ts` — `capacity` y `conditions` en status.
- `packages/core/src/common/k8s-api/endpoints/index.ts` — exporta las APIs de snapshot.
- `packages/core/src/renderer/components/events/store.ts` — guarda en `getEventsByObject`.

### Nuevos — modelos y APIs (9)

- `packages/kube-object/src/specifics/volume-snapshot.ts`
- `packages/kube-object/src/specifics/volume-snapshot-class.ts`
- `packages/kube-object/src/specifics/volume-snapshot-content.ts`
- `packages/core/src/common/k8s-api/endpoints/volume-snapshot{,-class,-content}.api.ts` + `.injectable.ts`

### Nuevos — rutas, sidebar y vistas

- `packages/core/src/common/front-end-routing/routes/cluster/storage/volume-snapshots/` (route + injection ids + param registrations)
- `packages/core/src/common/front-end-routing/routes/cluster/storage/volume-snapshot-classes/`
- `packages/core/src/common/front-end-routing/routes/cluster/storage/volume-snapshot-contents/`
- `packages/core/src/renderer/components/storage-volume-snapshots/` (lista, store, drawer, scss)
- `packages/core/src/renderer/components/storage-volume-snapshot-classes/`
- `packages/core/src/renderer/components/storage-volume-snapshot-contents/`
- `packages/core/src/renderer/components/kube-object-details/kube-object-detail-items/implementations/volume-snapshot{,-class,-content}-detail-item.injectable.ts`

### Nuevos — menú PVC y diálogos

- `packages/core/src/renderer/components/storage-volume-claims/volume-claim-menu.tsx` + injectable + `volume-claim-menu.test.tsx`
- `packages/core/src/renderer/components/storage-volume-claims/create-snapshot/` (helpers + test, diálogo, state/open injectables)
- `packages/core/src/renderer/components/storage-volume-claims/expand-pvc/` (helpers + test, diálogo, state/open injectables)

### Nuevos — verificación

- `docs/revival/scripts/verify-r7-04-storage.cjs`
- `docs/revival/R7_04_ARCHITECTURE.md`
- `docs/revival/R7_04_IMPLEMENTATION.md` (este documento)
- `docs/revival/R7_04_SECURITY_REVIEW.md`
- `docs/revival/R7_04_VALIDATION.md`
- `docs/revival/R7_04_VERIFICATION.json`
- `docs/revival/evidence/r7-04/` (13 capturas + reporte JSON)
- `docs/revival/logs/R7_04_FINAL_*.log`, `R7_04_REGRESSION_JEST_20261023.log`
- `docs/revival/R7_PROVISIONAL_ROADMAP.md` — estado R7-04

---

## 4. Decisiones y límites

- **Sin snapshot-controller local.** No se instala ningún CRD/driver CSI; el descubrimiento depende exclusivamente del API discovery del clúster. Si el grupo `snapshot.storage.k8s.io/v1` no existe, sidebar, rutas y acciones se ocultan (verificado E2E en el clúster Legacy).
- **No hay restore/delete de snapshots en este hito.** El alcance es visibilidad + creación de snapshots + expansión de PVCs. Restore de PVC desde snapshot queda para un hito posterior.
- **La expansión nunca reduce:** `validatePvcExpansion` rechaza tamaños iguales o menores y `parseQuantity` rechaza unidades inválidas en vez de interpretarlas.
- **Todas las mutaciones pasan por dry-run primero**, reutilizando la infraestructura `dryRun=All` certificada en R7-02; el PATCH real lleva precondiciones UID/resourceVersion (409 ante estado obsoleto).
- **PROD guard** reutiliza el patrón del hito R7-03: confirmación ligada a clúster real y doble verificación.

## 5. Limitaciones conocidas

- El 409 por `resourceVersion` exige repetir el flujo con estado fresco; no hay reintento automático.
- Si el backend CSI tarda en reflejar la capacidad nueva, la fase se muestra `pending` hasta que `status.capacity` o `conditions` cambien.
- No se cubren VolumeSnapshots dinámicos cross-namespace ni VolumeGroups; fuera de alcance.
- La certificación global de `packages/core` no está aprobada: se mantiene el inventario de R7-03 (`R7_03_VALIDATION.md`, §4); en R7-04 no se ejecutó la suite completa ni se etiquetó ningún fallo global como preexistente. Ver también `R7_04_SECURITY_REVIEW.md`.
