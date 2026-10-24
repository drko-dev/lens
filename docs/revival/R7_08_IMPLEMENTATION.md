# OpenLens DevOps Revival — R7-08 Implementación

**Hito:** R7-08 — Advanced Pod Diagnostics (`Attach Debug Container`, Log Ergonomics, ResourceQuota Headroom)
**Fecha:** 2026-10-24
**Worktree Exclusivo:** `/Users/gustavomarcon/Documents/lens/lens-r7-08-pod-diagnostics`
**Rama:** `feat/r7-08-pod-diagnostics`
**Base:** `86d5662c7caa63b2b5de7539a1321aa261ed0fdb`
**Estado:** **IMPLEMENTACIÓN DEL CHECKPOINT LOCAL**. La auditoría independiente previa reportó PASS en Jest, TypeScript, ESLint y el harness. En la repetición de esta sesión, Jest terminó con exit code 1 al no resolver un módulo de DI bajo una ruta protegida; no se determinó si falta en este checkout o si la restricción de acceso impide resolverlo. Ver `R7_08_VALIDATION.md`. La validación acumulativa y Electron empaquetado quedan para R7-09.

---

## 1. Inventario de Archivos Modificados y Creados

### 1.1 Pilar A — Ephemeral Debug Containers
- `packages/core/src/common/k8s-api/endpoints/pod.api.ts`:
  - Método `attachEphemeralContainer(params, newContainer, options)` implementado sobre el subrecurso `/api/v1/namespaces/{namespace}/pods/{name}/ephemeralcontainers`.
  - Construcción del payload con preservación estricta de `spec.ephemeralContainers` existentes.
  - Inclusión de `metadata.resourceVersion` para que Kubernetes pueda aplicar control de concurrencia optimista (`HTTP 409 Conflict`); las pruebas mockeadas verifican el payload y la propagación de un conflicto simulado, no el comportamiento de un API server real.
  - **Validación Cooperativa de 9 Precondiciones Antes del PATCH (Hallazgo A):** Comprobación local de precondiciones relevantes al inicio, pre-GET, post-GET y pre-PATCH. Si una condición aplicable falla antes del despacho, el flujo lanza `AbortError` / status 412 o 499; las pruebas mockeadas verifican que `request.patch()` no se invoca en las rutas cubiertas. Esta comprobación no es atómica frente a cambios posteriores al último chequeo.
  - **Cancelación cooperativa (GET → Cancel → PATCH):** Acepta `signal?: AbortSignal` y callback `isCancelled?: () => boolean`. Comprueba cancelación antes del GET, al resolverse y antes de despachar el PATCH; las pruebas mockeadas verifican que cancelar mientras el GET está pendiente evita invocar `request.patch()` en ese caso. Si el PATCH ya fue enviado, `AbortSignal` no revierte la operación ni impide que Kubernetes la complete.
  - Validación previa de nombres duplicados y rechazo pre-mutación con `HTTP 422`.
- `packages/core/src/renderer/components/workloads-pods/debug-container/attach-debug-container-dialog.tsx` y `attach-debug-container-dialog.scss`:
  - Componente de diálogo React con gestión de ciclo de vida MobX (`reaction` en `componentDidMount` y `disposeOnUnmount`).
  - Presets de imágenes de diagnóstico: `nicolaka/netshoot:latest`, `busybox:latest`, `alpine:latest`, `curlimages/curl:latest` y `Custom`.
  - Integración canónica de entornos mediante `getClusterEnvironmentConfig(cluster?.preferences)`, reconociendo etiquetas oficiales: `PRODUCTION`, `STAGING`, `DEVELOPMENT`, `TESTING / QA`, `LOCAL`, `CUSTOM` y `NONE`.
  - Selector de contenedor destino para compartición de espacio de nombres de procesos (`targetContainerName`).
  - Advertencia visual prominente sobre la inmutabilidad y persistencia de contenedores efímeros en Kubernetes.
  - **PROD Guard Reforzado:** Detección de clúster productivo con banner de alto contraste en rojo `#EF4444`, checkbox obligatorio de confirmación y campo de texto para tipear el nombre exacto del Pod (`prodConfirmationInput === pod.getName()`). El botón de envío permanece deshabilitado hasta cumplir ambas condiciones.
  - Reseteo automático de confirmación al cambiar de Pod o de clúster para prevenir reutilizaciones espurias.
  - Re-verificación de salud del clúster (`isClusterConnectionHealthy`) e identidad antes del despacho.
  - **Barrera de Reentrancia y Prevención de Doble Ejecución (Hallazgo C):** Bloqueo reactivo mediante bandera observable `this.isExecuting` al ingresar a `attachAndLaunch()` (`if (this.isExecuting || this.submitting || this.waitingForReady) return;`). Evita superponer llamadas por doble clic o invocaciones consecutivas; el test mockeado verifica una sola llamada de mutación en el escenario probado.
  - **Aislamiento por Generación Monotónica (`currentGeneration`):** Prevención de carreras al reabrir el mismo Pod en el mismo clúster. Cada despacho asigna un `opGeneration` único, y todas las respuestas post-`await` (`attachEphemeralContainer`, `podApi.get`, `cancelableDelay`) descartan en silencio respuestas de operaciones canceladas o de generaciones obsoletas.
  - **Cancelación con PATCH en Tránsito:** Abandono del monitoreo local si el usuario cancela mientras el PATCH está pendiente, evitando terminales o polling posteriores. Cancelar el seguimiento no detiene ni revierte una mutación ya enviada; el estado final debe comprobarse posteriormente.
  - Apertura automática de pestaña de terminal en el dock tras la inyección exitosa verificada vía `createPodTerminalTab`.
- Inyectables asociados:
  - `attach-debug-container-dialog-state.injectable.ts`: Estado observable desacoplado.
  - `open-attach-debug-container-dialog.injectable.ts`: Acción para abrir el diálogo pasando el Pod objetivo.
  - `attach-debug-container-dialog-cluster-frame-child-component.injectable.ts`: Inyección en el frame del clúster.
- `packages/core/src/renderer/components/workloads-pods/pod-devops-menu.tsx`:
  - Acción "Attach Debug Container" añadida al menú contextual de DevOps en la vista de Pods.

### 1.2 Pilar B — Ergonomía de Logs y Formateador JSON
- `packages/kube-object/src/specifics/pod.ts`:
  - Incorporación de `sinceSeconds?: number;` en la interfaz `PodLogsQuery`.
- `packages/core/src/renderer/components/dock/logs/tab-store.ts`:
  - Soporte de propiedades por pestaña: `sinceSeconds` (opcional), `tailLines` (opcional), y `logFormat` (`"raw"` | `"json"`).
- `packages/core/src/renderer/components/dock/logs/log-tab-data.validator.ts`:
  - Esquema de validación `superstruct` actualizado con campos opcionales `sinceSeconds`, `tailLines` y `logFormat`.
- `packages/core/src/renderer/components/dock/logs/json-log-formatter.ts`:
  - Parser determinístico de líneas JSON con extracción de niveles (`INFO`, `WARN`, `ERROR`, `DEBUG`), mensajes, timestamps y metadatos.
  - Soporte para líneas JSON con prefijo timestamp RFC 3339 de Kubernetes.
  - Sanitización HTML estricta contra inyección XSS (`escapeHtml`).
  - Fallback limpio a texto plano para líneas no estructuradas.
- `packages/core/src/renderer/components/dock/logs/controls.tsx`:
  - Dropdowns compactos para selección de `Since` (15m, 1h, 4h, 24h, All) y `Tail` (100, 500, 1000, All).
  - Selector de modo de visualización `Raw | JSON`.
- `packages/core/src/renderer/components/dock/logs/list.tsx` y `list.scss`:
  - Renderizado condicional en modo JSON con insignias de color por nivel, marcas de tiempo estilizadas y atributos clave.
  - Preservación íntegra de la experiencia de scroll virtual y búsqueda.
- `packages/core/src/renderer/components/dock/logs/store.ts`:
  - Envío de `sinceSeconds` y `tailLines` en las consultas al API server de Kubernetes.
  - Control de concurrencia: contador secuencial de peticiones por pestaña para descartar respuestas asíncronas tardías cuando el operador modifica filtros rápidamente.

### 1.3 Pilar C — Headroom de ResourceQuota y Observabilidad
- `packages/core/src/renderer/components/config-resource-quotas/headroom/quantity-parser.ts`:
  - Parser puro y determinístico de cantidades Kubernetes:
    - CPU: soporte de millicores (`100m`) y flotantes/enteros (`1.5`, `2`).
    - Memoria: sufijos binarios SI (`Ki`, `Mi`, `Gi`, `Ti`), decimales SI (`k`, `M`, `G`, `T`) y bytes enteros.
    - Contadores enteros de recursos (Pods, PVCs, etc.).
- `packages/core/src/renderer/components/config-resource-quotas/headroom/headroom-calculator.ts`:
  - Cálculo de porcentaje `(used / hard) * 100` y headroom restante.
  - Clasificación en umbrales: `normal` (< 80%), `warning` (80% a 90%), `critical` (>= 90%).
  - **Distinción Estricta entre Cero Explícito y Ausencia de Datos (Hallazgo B):**
    - Cero explícito (`"0"`, `"0m"`, `"0Ki"`) con límite válido calcula `0%` y estado `normal`.
    - Objeto sin `status`, `status.used` ausente o clave no reportada evalúa a `status: "na"`, `percentage: undefined` y `usedFormatted: "N/A"`, impidiendo reportes falsos de disponibilidad.
  - Manejo robusto de límites cero o faltantes retornando `status: "na"` sin división por cero.
  - Mantenimiento de porcentaje real sin recorte artificial a 100% ante sobreasignación (ej. `120%`).
- `packages/core/src/renderer/components/config-resource-quotas/headroom/resource-quota-headroom.tsx` y `.scss`:
  - Barra visual de headroom con porcentaje, métrica humana y código de color según umbral.
- `packages/core/src/renderer/components/config-resource-quotas/headroom/cluster-overview-resource-quota-block.tsx` e inyectable:
  - Componente para la vista general del clúster agrupando cuotas por namespace y destacando recursos en riesgo.
- `packages/core/src/renderer/components/namespaces/namespace-details.tsx`:
  - Integración de sección "Quota Headroom" en el Drawer lateral de detalles de namespace.

---

## 2. Cobertura de Pruebas y Aseguramiento de Calidad

### 2.1 Pruebas Unitarias (Jest)
Ejecución reportada por auditoría previa: `npm run test:unit`
Resultado previo: **7 Suites / 85 Tests PASS**. No se repitió por separado en esta sesión.

1. `headroom.test.ts` (18 tests):
   - Parsing de CPU en millicores (`100m`, `1.5`, `2000m`, nano, micro).
   - Parsing de memoria binaria y decimal (`Ki`, `Mi`, `Gi`, `k`, `M`, `G`, bytes).
   - Contadores enteros estrictos.
   - Rechazo riguroso de números malformados, puntos múltiples y texto residual (`1..2`, `2.3.4m`, `1.2.3Gi`, `12pods`, `1.5` para Pods).
   - Preservación de precisión para millicores fraccionarios sin distorsión (`1.5m`, `0.5m`).
   - Formateo a cadenas legibles para el operador.
   - Clasificación en umbrales: `<80%` (normal), `80-90%` (warning), `>=90%` (critical).
   - Sin truncamiento a 100% en condiciones de sobreuso (ej. `120%`).
   - Retorno seguro de `status: "N/A"` para límites ausentes, cero o inválidos.
   - **Hallazgo B:** Distinción estricta entre cero explícito (`"0"`, `"0m"`, `"0Ki"`) que computa 0% normal, y datos desconocidos/faltantes (sin status, sin status.used, o claves omitidas) que computan `N/A`.
   - **Hallazgo B:** Procesamiento independiente de múltiples cuotas en el mismo namespace sin colisión ni contaminación de estado.
2. `cluster-overview-resource-quota-block.test.tsx` (3 tests):
   - Suscripción limpia a `resourceQuotaStore` al montar y desuscripción al desmontar.
   - Estado vacío cuando no existen ResourceQuotas en el clúster.
   - Agrupación estricta por Namespace sin agregaciones cruzadas inválidas.
3. `json-log-formatter.test.ts` (6 tests):
   - Sanitización HTML contra ataques XSS en mensajes y atributos.
   - Extracción de campos canónicos y variantes (`severity`, `msg`, `ts`, `caller`).
   - Soporte de prefijo RFC 3339 de Kubernetes.
   - Fallback limpio a texto plano sin fallos de parsing.
   - Verificación de asignación de colores de insignias de nivel.
4. `log-ergonomics.test.ts` (8 tests):
   - Traducción de `tailLines` (100, 500, 1000) a parámetros de consulta.
   - Omisión estricta de `tailLines` cuando se selecciona explícitamente "All" (`tailLines: 0`).
   - Preservación de carga progresiva por defecto con `tailLines: undefined` (heredado).
   - Traducción de `sinceSeconds` (15m=900, 1h=3600, etc.) a query params.
   - Descarte de respuestas asíncronas lentas o fuera de orden.
   - Descarte de errores o respuestas tardías de `loadMore` obsoleto tras recargas.
   - Aislamiento estricto de parámetros entre pestañas del dock.
5. `pod-devops-menu.test.tsx` (5 tests):
   - Apertura de terminal dedicada en dock.
   - Apertura de logs específicos del contenedor.
   - Apertura de port forward.
   - Despliegue de acciones individuales por contenedor en pods multi-contenedor.
   - Apertura del diálogo de "Attach Debug Container".
6. `pod-api-ephemeral.test.ts` (13 tests):
   - Emisión de PATCH a `/ephemeralcontainers` preservando contenedores existentes.
   - Payload con `metadata.resourceVersion` y propagación de un HTTP 409 simulado; no se probó contra un API server real.
   - Detección de concurrencia optimista y rechazo con `HTTP 409 Conflict`.
   - Rechazo de nombres duplicados con `HTTP 422` antes de mutar.
   - Manejo de Pod inexistente con `HTTP 404`.
   - Cancelación cooperativa antes del GET o durante el GET pendiente: en los escenarios Jest mockeados no se invoca `request.patch()`.
   - **Hallazgo A:** Pruebas mockeadas de aborto antes del despacho ante cambio de contexto de clúster, desconexión, UID distinto, generación superada A -> B -> A y fallo de `validateContext`; el mock no observa una llamada `request.patch()` en esos escenarios.
7. `attach-debug-container-dialog.test.tsx` (32 tests):
   - Cero renderizado o mutación si el estado del diálogo es undefined.
   - Renderizado de detalles, presets y banner de inmutabilidad en entorno DEV.
   - PROD Guard: banner rojo `#EF4444`, checkbox y tipeo exacto del nombre del Pod antes de habilitar el envío.
   - Espera activa del estado `Running` antes de abrir terminal dock.
   - Rechazo de terminal si el contenedor falla (`terminated` con `exitCode 137: OOMKilled`).
   - Notificación de timeout sin apertura de terminal.
   - Descarte de respuesta tardía de GET ante cambio de clúster activo en vuelo (0 terminales).
   - Descarte de respuesta tardía si el Pod fue eliminado y recreado con distinto UID (UID mismatch).
   - Cancelación limpia de polling sin promesas colgantes.
   - Cancelación limpia al cambiar de Pod seleccionado en el diálogo.
   - Rechazo cuando la identidad del clúster es desconocida.
   - Cancelación por condición de carrera ante cambio de clúster activo en vuelo.
   - Manejo de error `HTTP 403 Forbidden` sin crash de UI.
   - Cierre limpio al hacer clic en Cancelar sin llamadas al API.
   - Caso A: descarte de respuesta tardía de GET al reabrir el mismo Pod (0 terminales, estado limpio).
   - Caso B: abandono de seguimiento al cancelar con PATCH pendiente; el test verifica que no se inicia polling ni se abre terminal para el Pod anterior.
   - Caso C: carrera A -> B -> A resuelta por generación monotónica.
   - Validación de los 7 entornos canónicos (`PRODUCTION`, `STAGING`, `DEVELOPMENT`, `TESTING / QA`, `LOCAL`, `CUSTOM`, `NONE`).
   - Validación de todos los presets de depuración (`busybox`, `alpine`, `netshoot`, `curl`).
   - Cancelación cooperativa: propagación de `AbortSignal` y predicado `isCancelled` hacia `attachEphemeralContainer`.
   - **Hallazgo C:** Prevención de doble ejecución por doble clic rápido: el test mockeado observa una llamada de mutación en el escenario probado.
   - **Hallazgo C:** PATCH pendiente seguido de segunda invocación no cancela ni invalida la primera operación legítima.
   - **Hallazgo C:** Reintento exitoso tras error HTTP 409 Conflict sin bloqueo del diálogo.
   - **Hallazgo C:** Reintento exitoso tras error de red transitorio sin bloqueo del diálogo.
   - **Hallazgo C:** Apertura legítima habilitada tras cancelar diálogo anterior.
   - **Hallazgo A:** Validación de las 9 precondiciones cooperativas en los escenarios cubiertos por pruebas mockeadas.

### 2.2 Regresión Ampliada (Jest)
Ejecución: `npx jest src/renderer/components/workloads-pods src/renderer/components/dock/logs src/common/k8s-api/endpoints/__tests__/pod-api-ephemeral.test.ts src/renderer/components/config-resource-quotas/headroom/__tests__/`
Resultado reportado por auditoría previa: **22 Suites / 178 Tests PASS — 20 Snapshots PASS**. La repetición de esta sesión terminó con 14 suites y 112 tests fallidos al inicializar DI, 8 suites y 66 tests pasados y 5 snapshots ejecutados/pasados; no se pudo determinar el origen del módulo no resuelto sin inspeccionar la ruta protegida. Ver `R7_08_VALIDATION.md`.

### 2.3 Verificación Visual Playwright en Harness React Sintético
Ejecución reportada por auditoría previa: `node docs/revival/scripts/verify-r7-08-pod-diagnostics.cjs`
Resultado previo: **5 escenarios visuales PASS en harness sintético**. No se repitió en esta sesión y no es Electron empaquetado.
> [!NOTE]
> **Alcance y Transparencia del Harness:** Playwright corre sobre un harness sintético en React 17 compilado con `esbuild` y `sass` que reutiliza directamente componentes y utilidades puras del codebase (`quantity-parser`, `headroom-calculator`, `json-log-formatter`, mocks de KubeObject y shims de DOM/Node). Verifica layouts, tokens CSS, estados de advertencia e interacciones seleccionadas dentro del harness. No sustituye la prueba en runtime de Electron ni un clúster Kubernetes vivo (validación acumulativa reservada para R7-09).

Evidencias capturadas en `docs/revival/evidence/r7-08/`:
- `01-debug-container-dev.png`: Diálogo en clúster de desarrollo con preset netshoot seleccionado y banner de inmutabilidad.
- `02-debug-container-prod.png`: Diálogo en clúster productivo con PROD Guard activo, borde/banner `#EF4444`, checkbox y campo de tipeo de confirmación.
- `03-log-ergonomics-controls.png`: Controles de logs con selector Since (1h), Tail (100) y estado de pausa activo.
- `04-json-structured-logs.png`: Visor de logs en modo JSON con insignias de color (INFO, DEBUG, WARN, ERROR) y fallback a texto plano.
- `05-resourcequota-headroom.png`: Desglose de cuotas de recursos con clasificación semántica (`critical` 95%, `warning` 80%, `normal` 50%, `critical` 120% y `N/A`).

### 2.3 Gates Estáticos de Calidad
- **ESLint:** Repetido en archivos afectados de `packages/core` y `packages/kube-object` con `--max-warnings=0` → **PASS**, exit code 0 en ambos paquetes.
- **TypeScript:** `packages/kube-object` se repitió con `npx tsc --noEmit` → PASS, exit code 0. Auditoría independiente previa reportó PASS en `packages/core`; el core no se repitió porque el compile amplio podría recorrer rutas protegidas.
- **Git Diff:** `git diff --cached --check` sobre todos los archivos staged del checkpoint → **PASS**.

---

## 3. Texto Propuesto para el Roadmap (`R7_PROVISIONAL_ROADMAP.md`)

> **NOTA IMPORTANTE DE COORDINACIÓN CONCURRENTE:**
> En cumplimiento estricto del aislamiento entre agentes concurrentes (R7-07 Helm y R7-08 Pod Diagnostics), el archivo `docs/revival/R7_PROVISIONAL_ROADMAP.md` **NO** ha sido modificado en este worktree. El siguiente fragmento se provee como texto validado listo para ser incorporado en el paso de consolidación e integración final de R7:

```markdown
### R7-08 — Advanced Pod Diagnostics (Attach Debug Container, Log Ergonomics, ResourceQuota Headroom)
- **Estado:** CHECKPOINT DE IMPLEMENTACIÓN LOCAL; auditoría previa reportó PASS dirigido, pero la última repetición local quedó bloqueada en la inicialización de DI. Validación acumulativa y Electron empaquetado pendientes en R7-09.
- **Pilar A (Ephemeral Debug Containers):**
  - Implementación sobre el subrecurso oficial `pods/ephemeralcontainers` vía `PATCH application/strategic-merge-patch+json`.
  - Preservación estricta de contenedores efímeros existentes en `spec.ephemeralContainers`.
  - Control de concurrencia optimista (`metadata.resourceVersion`) con detección de `HTTP 409 Conflict`.
  - Comprobación local cooperativa de 9 precondiciones antes del PATCH. Las pruebas mockeadas verifican que no se invoque `request.patch()` en los escenarios cubiertos donde una precondición falla antes del despacho; no es un control atómico ante carreras posteriores al último chequeo.
  - Cancelación cooperativa (GET → Cancel → PATCH) con `AbortSignal` e `isCancelled`: puede impedir el despacho si se detecta antes del envío; una petición ya enviada no se puede revertir mediante `AbortSignal`.
  - Barrera de reentrancia observable `isExecuting` contra dobles clics rápidos e invocaciones simultáneas.
  - Nomenclatura única RFC 1123 (`debugger-<hash>-<timestamp>`).
  - Presets de depuración: `nicolaka/netshoot:latest`, `busybox:latest`, `alpine:latest`, `curlimages/curl:latest` y `Custom`.
  - Soporte de etiquetas canónicas de entorno: `PRODUCTION`, `STAGING`, `DEVELOPMENT`, `TESTING / QA`, `LOCAL`, `CUSTOM` y `NONE`.
  - Compartición de namespace de procesos mediante `targetContainerName`.
  - Banner visual de advertencia por inmutabilidad/persistencia del contenedor efímero.
  - PROD Guard con doble confirmación operativa: banner rojo `#EF4444`, checkbox consciente de confirmación y campo de texto para tipear el nombre exacto del Pod.
  - Aislamiento de generación monotónica (`currentGeneration`) previniendo colisiones de respuestas tardías al reabrir el mismo Pod o ante cancelación con PATCH en vuelo.
  - Apertura automática de pestaña de terminal en el dock mediante `createPodTerminalTab` tras confirmar estado `Running`.
- **Pilar B (Ergonomía de Logs):**
  - Selector temporal `sinceSeconds`: 15m (900s), 1h (3600s), 4h (14400s), 24h (86400s), All.
  - Selector de límite de líneas `tailLines`: 100, 500, 1000, All.
  - Selector de visualización `Raw | JSON`.
  - Formateador puro de logs JSON (`json-log-formatter.ts`) con insignias por nivel (`INFO`, `WARN`, `ERROR`, `DEBUG`), timestamps normalizados, extracción de atributos y sanitización HTML contra XSS.
  - Fallback transparente a texto plano para líneas no estructuradas.
  - Aislamiento estricto de parámetros por pestaña en `TabStore` de MobX.
  - Descarte de respuestas asíncronas tardías mediante contador monótono `activeRequestId`.
- **Pilar C (ResourceQuota Headroom y Observabilidad):**
  - Parser puro y determinístico de cantidades (`quantity-parser.ts`) con soporte de CPU (millicores, enteros, flotantes), Memoria (binario y decimal SI) y contadores enteros de recursos.
  - Calculador de headroom (`headroom-calculator.ts`) con clasificación semántica: `<80%` (normal), `80-90%` (warning), `>=90%` (critical).
  - Distinción estricta entre cero explícito (0% normal) y ausencia/desconocimiento de datos (`N/A`).
  - Manejo seguro de casos de borde: límites ausentes o cero evalúan a `N/A` sin división por cero; sobreasignación no recortada a 100% (ej. `120%`).
  - Integración en Drawer lateral de `NamespaceDetails` y bloque extensible en `ClusterOverview` (agrupado estrictamente por Namespace).
- **Aseguramiento de Calidad:**
  - Jest: auditoría previa reportó 7 suites / 85 tests PASS y 22 suites / 178 tests con 20 snapshots PASS; repetición local actual registrada en `R7_08_VALIDATION.md`.
  - Playwright Visual: auditoría previa reportó 5 escenarios en harness React sintético con componentes parcialmente reutilizados; no equivale a Electron empaquetado. Evidencias PNG en `docs/revival/evidence/r7-08/`.
  - ESLint: 0 errores / 0 warnings (`--max-warnings=0`).
  - TypeScript: 0 errores en compilación global de `packages/core` y `packages/kube-object`.
  - Git diff: 0 advertencias de formato o conflictos.
```
