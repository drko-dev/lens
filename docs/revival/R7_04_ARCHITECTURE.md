# OpenLens DevOps Revival — R7-04 Arquitectura

**Hito:** R7-04 — Almacenamiento Moderno: VolumeSnapshots y Expansión de PVCs
**Fecha:** 2026-10-23
**Base:** `6ea8bb41eb9797939ecc6d9c0da6c902017cb6f4` (R7-03 checkpoint)

---

## 1. Objetivo

Incorporar soporte nativo para el grupo `snapshot.storage.k8s.io/v1` y la expansión de PVCs, reutilizando la infraestructura existente de OpenLens y las protecciones de R7-02/R7-03, sin modificar releases históricos ni iniciar R7-05.

---

## 2. Descubrimiento dinámico

### 2.1 Criterio de visibilidad

Las rutas y sidebar items de R7-04 se habilitan con **`hostedCluster.knownResources`**, no con `resourcesToShow`:

- **API ausente:** la sección no se muestra.
- **API presente + RBAC 403:** la sección se muestra; el componente lista renderiza un estado de acceso restringido cuando el store recibe 403.
- **Clúster desconectado:** no se muestra.

Esto separa la detección del CRD (`knownResources`) de los permisos de listado (`resourcesToShow`).

### 2.2 Implementación

Cada ruta define `isEnabled` como un `IComputedValue<boolean>` que consulta `hostedCluster.knownResources.has("snapshot.storage.k8s.io/volumesnapshots")` (o `volumesnapshotclasses` / `volumesnapshotcontents`). El sidebar item reutiliza `route.isEnabled` para `isVisible`.

No se instala ningún CRD, driver ni controlador.

---

## 3. Modelos (`@openlens/kube-object`)

| Recurso | Scope | Campos principales |
|---|---|---|
| `VolumeSnapshot` | Namespaced | `spec.source.persistentVolumeClaimName`, `spec.volumeSnapshotClassName`, `status.readyToUse`, `status.boundVolumeSnapshotContentName`, `status.restoreSize`, `status.error` |
| `VolumeSnapshotClass` | Cluster | `driver`, `deletionPolicy`, `parameters`, indicador de clase por defecto vía anotación |
| `VolumeSnapshotContent` | Cluster | `spec.volumeSnapshotRef`, `spec.volumeSnapshotClassName`, `spec.driver`, `spec.deletionPolicy`, `status.readyToUse`, `status.restoreSize` (handles sensibles no destacados) |

No se inventa un `spec` donde Kubernetes tenga campos de nivel superior.

---

## 4. APIs y stores (`packages/core`)

### 4.1 APIs

Se crean subclases de `KubeApi` para `VolumeSnapshot`, `VolumeSnapshotClass` y `VolumeSnapshotContent`, con `apiBase` correcto y `objectConstructor` apuntando a los modelos nuevos. Cada una tiene su `.api.injectable.ts` registrado bajo `kubeApiInjectionToken`.

### 4.2 Stores

Se crean `VolumeSnapshotStore`, `VolumeSnapshotClassStore`, `VolumeSnapshotContentStore` extendiendo `KubeObjectStore`. Se registran bajo `kubeObjectStoreInjectionToken` con el contexto adecuado (namespaced vs cluster-scoped).

### 4.3 Índice de endpoints

Se exportan desde `packages/core/src/common/k8s-api/endpoints/index.ts`.

---

## 5. Rutas, navegación y sidebar

### 5.1 Estructura

Bajo `Storage` se agregan tres hijos:

- **VolumeSnapshots** (`/volume-snapshots`) — orderNumber 45
- **VolumeSnapshot Classes** (`/volume-snapshot-classes`) — orderNumber 46
- **VolumeSnapshot Contents** (`/volume-snapshot-contents`) — orderNumber 47

### 5.2 Archivos

- Rutas: `packages/core/src/common/front-end-routing/routes/cluster/storage/{volume-snapshots,volume-snapshot-classes,volume-snapshot-contents}/`
- Navegación: `navigate-to-*.injectable.ts`
- Componentes de ruta: `*-route-component.injectable.ts`
- Sidebar items: `*-sidebar-items.injectable.tsx`

### 5.3 Detalles

Se registran items de detalle en `kube-object-detail-item-injection-token` para que el drawer funcione al hacer clic en una fila.

---

## 6. Vistas de lista y drawer

### 6.1 VolumeSnapshots

Tabla compacta con:

- Nombre, Namespace, PVC origen, SnapshotClass.
- Estado: `Ready` / `Pending` / `Error` / `Unknown`.
- Restore size (si existe).
- Antigüedad.

Drawer con spec, status, error, referencias y condiciones relevantes.

### 6.2 VolumeSnapshotClasses

Tabla: nombre, driver, deletionPolicy, default, age. Drawer: parámetros públicos, policies.

### 6.3 VolumeSnapshotContents

Tabla: nombre, driver, snapshot class, ready, age. Drawer: refs, status, restore size; no exponer handles sensibles innecesariamente.

---

## 7. Acciones sobre PVC

Se agrega un menú contextual `VolumeClaimMenu` registrado vía `kubeObjectMenuItemInjectionToken` para `PersistentVolumeClaim`.

### 7.1 Create VolumeSnapshot

**Flujo (wizard en diálogo):**

1. Abrir desde menú o drawer del PVC.
2. Reconsultar PVC; validar UID, namespace, existencia.
3. Listar `VolumeSnapshotClassStore` para seleccionar clase.
4. Input de nombre DNS válido.
5. Resumen: PVC origen, namespace, clase, nombre de snapshot.
6. Advertencia de consumo/costos.
7. Dry-run con `volumeSnapshotApi.create(..., { dryRun: "All" })`.
8. Confirmación reforzada en PROD (checkbox + nombre exacto del PVC).
9. POST real; observar estado hasta Ready/Error/timeout.

No se afirma utilidad hasta que `status.readyToUse === true`.

### 7.2 Expand PVC

**Flujo (wizard en diálogo):**

1. Abrir desde menú o drawer del PVC.
2. Reconsultar PVC y su StorageClass.
3. Validar `storageClass.allowVolumeExpansion === true`.
4. Input de nuevo tamaño con parser de cantidades Kubernetes (`unitsToBytes`).
5. Rechazar valores inválidos, iguales o menores.
6. Dry-run con `pvcApi.patch(..., patch, "json", { dryRun: "All" })`.
7. Confirmación reforzada en PROD.
8. PATCH real con precondiciones UID/resourceVersion.
9. Re-fetch y clasificar: solicitado / aceptado / pendiente / capacidad actualizada / error.

Se preservan `accessModes`, `storageClassName`, `volumeMode`, etc.; solo se muta `spec.resources.requests.storage`.

---

## 8. Seguridad y concurrencia

- `assertToolActionClusterContext` antes de cada mutación.
- Snapshot de `clusterId`/`clusterName` al abrir el diálogo.
- Invalidación de diálogo si el clúster cambia.
- Re-fetch del recurso y verificación de UID/resourceVersion antes de mutar.
- Flag `isSubmitting` para evitar doble clic.
- Dry-run no actualiza stores ni caché.
- PROD: banner rojo, checkbox de ack y confirmación por nombre exacto.
- No se registran secretos, tokens ni handles CSI en logs.

---

## 9. Helpers puros (testables)

- `parseQuantity(value): number` — wrapper tipado sobre `unitsToBytes`.
- `validateExpansion({ currentSize, requestedSize, storageClass }): ExpansionValidationResult`
- `buildPvcExpansionPatch(pvc, newSize): JsonPatch`
- `buildVolumeSnapshotManifest(pvc, name, className?): VolumeSnapshotData`
- `classifySnapshotStatus(snapshot): SnapshotPhase`
- `classifyPvcExpansionStatus(pvc): ExpansionPhase`

---

## 10. Tests

### 10.1 Unitarios

- Modelos: parseo de estados y campos.
- Helpers: cantidades, validaciones, patches, manifests.
- Clasificación de estados.

### 10.2 Integración / componentes

- Render de listas con fixtures.
- Drawer de detalles.
- Diálogo de expansión: validaciones, dry-run, error, PROD.
- Diálogo de snapshot: selección de clase, nombre DNS, dry-run, observación.
- Menú de PVC: visibilidad de acciones.
- Descubrimiento dinámico: CRD presente/ausente/403.

### 10.3 Regresión

- PVC/PV/StorageClass existentes.
- R7-02 dry-run.
- R7-03 rollout/contexto.

---

## 11. E2E y build

- Fixtures sintéticos para CSI presente/ausente, snapshot Ready/Pending/Error, PVC expandible/no expandible, 409, PROD, RBAC 403.
- Script Playwright: `docs/revival/scripts/verify-r7-04-storage.cjs`.
- Build ARM64 experimental solo si quedan > 6 GiB tras pasar tests dirigidos.
- No certificar E2E si no se puede empaquetar.

---

## 12. Documentos de salida

- `docs/revival/R7_04_ARCHITECTURE.md` (este archivo)
- `docs/revival/R7_04_IMPLEMENTATION.md`
- `docs/revival/R7_04_SECURITY_REVIEW.md`
- `docs/revival/R7_04_VALIDATION.md`
- `docs/revival/R7_04_VERIFICATION.json`
- `docs/revival/evidence/r7-04/`
- `docs/revival/R7_PROVISIONAL_ROADMAP.md` actualizado

---

## 13. Archivos afectados previstos

Nuevos:

- `packages/kube-object/src/specifics/volume-snapshot*.ts`
- `packages/core/src/common/k8s-api/endpoints/volume-snapshot*.ts`
- `packages/core/src/renderer/components/storage-volume-{snapshots,snapshot-classes,snapshot-contents}/`**
- `packages/core/src/common/front-end-routing/routes/cluster/storage/volume-snapshot*/`**
- `packages/core/src/renderer/components/kube-object-details/kube-object-detail-items/implementations/volume-snapshot*-detail-item.injectable.ts`
- `packages/core/src/renderer/components/storage-volume-claims/volume-claim-menu.tsx`
- `packages/core/src/renderer/components/storage-volume-claims/expand-pvc/*`
- `packages/core/src/renderer/components/storage-volume-claims/create-snapshot/*`

Modificados:

- `packages/kube-object/src/specifics/index.ts`
- `packages/core/src/common/k8s-api/endpoints/index.ts`

---

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| CRD ausente | `knownResources` oculta rutas automáticamente |
| RBAC 403 | El componente lista muestra acceso restringido |
| Snapshot no queda Ready | Observación con timeout; no afirmar éxito por POST |
| Expansión no soportada | Validar `allowVolumeExpansion`; no prometer resize de filesystem |
| Concurrencia | Precondiciones UID/resourceVersion; re-fetch previo |
| PROD | Confirmación reforzada con identidad completa |

---

## 15. Alcance excluido

- Borrado de snapshots.
- Restauración de volúmenes desde snapshots.
- Instalación de CRDs, drivers o controladores CSI.
- Integraciones cloud/comerciales.
