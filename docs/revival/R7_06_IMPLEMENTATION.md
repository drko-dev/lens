# OpenLens DevOps Revival — R7-06 Implementación

**Hito:** R7-06 — RBAC Permission Inspector (`auth can-i`)
**Fecha:** 2026-10-24
**Worktree Exclusivo:** `/Users/gustavomarcon/Documents/lens/lens-r7-06-rbac-inspector`
**Rama:** `feat/r7-06-rbac-inspector`
**Estado:** **CERTIFICADO LOCALMENTE — CHECKPOINT APROBADO** (3 Suites / 48 Tests PASS — 0 Errores TypeScript — E2E Real React 11 Checkpoints PASS)

---

## 1. Archivos Nuevos Creados

### 1.1 Evaluador y Tipos (Common/Endpoints)
- `packages/core/src/common/k8s-api/endpoints/rbac-evaluator/types.ts`:
  - Definición de `AccessVerdict`: `ALLOWED_API`, `DENIED_API`, `LOCAL_MATCH`, `INDETERMINATE`, `INSUFFICIENT_DATA`.
  - Definición de `AccessReviewQuery` (con soporte para `clusterId`, `requestId`), `MatchingRuleEvidence`, `AccessReviewResult`, `LocalEvaluationResult`, `RbacStoreStatus`.
- `packages/core/src/common/k8s-api/endpoints/rbac-evaluator/local-evaluator.ts`:
  - Funciones puras `subjectMatches`, `ruleMatches` y `evaluateLocalRbac`.
  - Semántica oficial upstream Kubernetes `rbac.ResourceMatches()`:
    - `resources: ["*"]` incluye todos los recursos y subrecursos.
    - `resources: ["pods/exec"]` coincide específicamente con el subrecurso `pods/exec`.
    - `resources: ["*/exec"]` coincide con el subrecurso `exec` a través de cualquier recurso.
    - Rechazo de patrones no estándar como `pods/*` o `*/*`.
    - `resources: ["pods"]` no coincide con subrecursos.
    - `resourceNames`: autoriza subrecursos `create` dirigidos a una instancia con nombre, autoriza `list`/`watch` con filtro de nombre (`metadata.name`), y rechaza terminantemente `create` de raíz de colección, `list`/`watch` sin nombre y `deletecollection`.
    - Evaluación de salud de stores (`storeStatuses`) y detección de ClusterRoles agregados (`aggregationRule`).
- `packages/core/src/common/k8s-api/endpoints/rbac-evaluator/access-review-client.ts`:
  - Cliente `AccessReviewClient` para invocar endpoints de revisión de autorización de Kubernetes (`SelfSubjectAccessReview` y `SubjectAccessReview`).
  - Pre-flight checks de estado real del clúster (`isDisconnected`, `isAccessible`, `isOnline`), clusterId y campos obligatorios de la consulta.
  - Validación rigurosa de respuestas remotas (manifiestos sin `status.allowed` booleano, malformados o con `evaluationError` devuelven `INDETERMINATE`).
  - Protección de cambio de clúster activo o desconexión en vuelo (descarta respuestas asíncronas tardías si el clúster cambió o se desconectó).
  - Manejo resiliente de error HTTP 403 con derivación a análisis de reglas locales devolviendo siempre `LOCAL_MATCH` con `allowed: false` y badge `COINCIDENCIA LOCAL — NO VERIFICADA`.
- `packages/core/src/common/k8s-api/endpoints/rbac-evaluator/index.ts`:
  - Barrel exports de tipos y clases del evaluador.

### 1.2 Rutas y Navegación
- `packages/core/src/common/front-end-routing/routes/cluster/user-management/rbac-inspector/rbac-inspector-route.injectable.ts`:
  - Registra ruta `/rbac-inspector` con `clusterFrame: true` y `isEnabled: computed(() => true)`.
- `packages/core/src/common/front-end-routing/routes/cluster/user-management/rbac-inspector/navigate-to-rbac-inspector.injectable.ts`:
  - Helper inyectable para navegar admitiendo `query: { identity, namespace, serviceAccount }`.

### 1.3 UI y Renderer
- `packages/core/src/renderer/components/user-management/rbac-inspector/access-review-client.injectable.ts`:
  - Inyectable que crea cliente `KubeJsonApi` dedicado para AccessReviews e inyecta observador del estado de conexión del clúster (`hostedClusterInjectable`).
- `packages/core/src/renderer/components/user-management/rbac-inspector/rbac-inspector-sidebar-items.injectable.tsx`:
  - Registra ítem en sidebar bajo `userManagementSidebarItemId` con `orderNumber: 60`.
- `packages/core/src/renderer/components/user-management/rbac-inspector/rbac-inspector-route-component.injectable.ts`:
  - Asocia la ruta al componente `RbacInspector`.
- `packages/core/src/renderer/components/user-management/rbac-inspector/rbac-inspector.tsx`:
  - Componente principal con soporte para:
    - Selector de identidad (Current User, ServiceAccount, User/Group).
    - Constructor de consultas para recursos y URLs no asociadas a recursos.
    - Botón "Check Permission" para verbo individual.
    - Botón "Check All Verbs Matrix" para evaluación paralela de los 8 verbos estándar (`get`, `list`, `watch`, `create`, `update`, `patch`, `delete`, `deletecollection`).
    - Distintivo de advertencia de clúster en producción (`isProductionCluster`).
    - Banner reactivo de advertencia ante desconexión o inaccesibilidad del clúster (`cluster-offline-banner`).
    - Despliegue de evidencia explicativa de Roles y RoleBindings coincidentes con banner de advertencia si los stores de RBAC están incompletos.
    - Badge `COINCIDENCIA LOCAL — NO VERIFICADA` en color ámbar/alerta (nunca `ALLOWED`).
    - Prevención de carreras asíncronas con contador de secuencia `currentRequestId`.
    - Restablecimiento de `loading = false` y habilitación inmediata de botones al editar campos durante una consulta en curso (`invalidateResults()`).
    - Observación reactiva MobX de cambios en los campos y en las propiedades de conexión del clúster (`disconnected`, `accessible`, `online`).
    - Cancelación limpia de consultas al desmontar el componente (`componentWillUnmount`).
    - Pre-poblado seguro desde parámetros de URL sin auto-ejecución automática (requiere acción consciente del operador).
- `packages/core/src/renderer/components/user-management/rbac-inspector/rbac-inspector.scss`:
  - Estilos Midnight Graphite, densidad compacta de 33px y badges de veredicto con alto contraste.
- `packages/core/src/renderer/components/user-management/rbac-inspector/index.ts`:
  - Barrel export del componente.

### 1.4 Test Harness Real React 17
- `docs/revival/scripts/r7-06-harness/build.cjs`:
  - Compilación del componente real React 17 junto a estilos SCSS mediante `esbuild` y `sass` en `< 200 ms`.
- `docs/revival/scripts/r7-06-harness/harness.tsx`:
  - Montaje del componente `NonInjectedRbacInspector` con MobX y contenedor DI.
- `docs/revival/scripts/verify-r7-06-rbac-inspector.cjs`:
  - Suite de integración E2E en Playwright sobre el bundle real, verificando 11 checkpoints y 0 mutaciones a recursos operativos.

---

## 2. Modificaciones en Componentes Existentes

### 2.1 ServiceAccounts Drawer (`details.tsx`)
- Se inyectó `navigateToRbacInspectorInjectable`.
- Se añadió sección "Permissions" con botón de acción:
  `<Button primary onClick={() => navigateToRbacInspector(...)}>Inspect Permissions (auth can-i)</Button>`.
- Permite abrir el Inspector con el ServiceAccount y su namespace preseleccionados.

### 2.2 ServiceAccounts Context Menu (`service-account-menu.tsx`)
- Se inyectó `navigateToRbacInspectorInjectable`.
- Se añadió ítem de menú "Inspect Permissions" con icono de seguridad `security`.

---

## 3. Pruebas Unitarias Implementadas

1. `src/common/k8s-api/endpoints/rbac-evaluator/__tests__/local-evaluator.test.ts`:
   - 18 pruebas unitarias cubriendo:
     - Coincidencia de identidades (ServiceAccounts, Grupos, Usuarios).
     - Comodines de verbos y apiGroups.
     - Cobertura de comodín `*` para recursos y subrecursos.
     - Coincidencia exacta de subrecurso `pods/exec`.
     - Coincidencia de subrecurso universal `*/exec`.
     - Pruebas negativas: rechazo de patrones no estándar `pods/*` y `*/*`.
     - Aislamiento de subrecursos: `pods` no autoriza `pods/exec`.
     - Restricción estricta de `resourceNames` (admisión de subresource `create` nombrado, admisión de `list`/`watch` nombrado con selector de campo `metadata.name`, rechazo de raíz de colección `create`, rechazo de `list`/`watch` sin nombre y rechazo de `deletecollection`).
     - Scoping de RoleBindings (aislamiento estricto de namespaces).
     - Scoping de ClusterRole vinculado mediante RoleBinding (limitado exclusivamente al namespace del binding).
     - Permisos cluster-wide y nonResourceURLs vía ClusterRoleBindings.
     - Evaluación de estado de stores RBAC con advertencias de almacén incompleto y ClusterRoles agregados.
2. `src/common/k8s-api/endpoints/rbac-evaluator/__tests__/access-review-client.test.ts`:
   - 18 pruebas unitarias cubriendo:
     - Pre-flight checks: clúster no conectado, discordancia de clusterId, parámetros faltantes (verbo, nombre de SA).
     - Validación real de estado del clúster (`disconnected`, `accessible`, `online`) en pre-flight y post-flight.
     - Llamadas a `SelfSubjectAccessReview` con veredicto `ALLOWED_API`, `DENIED_API` y denegación explícita por webhook (`status.denied`).
     - Respuestas remotas indeterminadas: error de evaluación, `status.allowed` ausente o no booleano, respuesta malformada sin status.
     - Construcción canónica de identidad de ServiceAccount.
     - Manejo de HTTP 403 con fallback a `LOCAL_MATCH` con `allowed: false` y badge `COINCIDENCIA LOCAL — NO VERIFICADA`.
     - Manejo de HTTP 403 con `INSUFFICIENT_DATA` ante ausencia de regla coincidente.
     - Errores de red y timeouts derivando a `INDETERMINATE`.
     - Protección ante cambio asíncrono de clúster activo en vuelo.
3. `src/renderer/components/user-management/rbac-inspector/__tests__/rbac-inspector.test.tsx`:
   - 12 pruebas unitarias cubriendo:
     - Renderizado de controles y encabezado.
     - Badge de clúster en PRODUCCIÓN.
     - Banner de advertencia de stores RBAC fallidos o no cargados.
     - Selección de ServiceAccount y renderizado de campos.
     - Ejecución de verificación individual y renderizado de badge.
     - Renderizado de badge `COINCIDENCIA LOCAL — NO VERIFICADA` ante `LOCAL_MATCH` (nunca `ALLOWED`).
     - Ejecución de matriz de 8 verbos estándar y renderizado de tabla.
     - Pre-población desde parámetros de URL sin auto-ejecución automática (requiere acción del operador).
     - Invalidación dinámica inmediata de resultados al modificar inputs.
     - Prevención de carreras asíncronas descartando respuestas fuera de orden con `requestId`.
     - Restablecimiento de `loading = false` y habilitación inmediata de botones al editar un campo mientras existe una consulta en curso, ignorando respuestas tardías.
     - Despliegue de banner de desconexión e invalidación reactiva de resultados ante pérdida de conectividad del clúster.

**Total pruebas unitarias Jest: 3 suites / 48 tests PASS / 0 FAIL**.
