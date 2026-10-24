# OpenLens DevOps Revival — R7-08 Validación y Certificación

**Hito:** R7-08 — Advanced Pod Diagnostics (`Attach Debug Container`, Log Ergonomics, ResourceQuota Headroom)
**Fecha:** 2026-10-24
**Worktree Exclusivo:** `/Users/gustavomarcon/Documents/lens/lens-r7-08-pod-diagnostics`
**Rama:** `feat/r7-08-pod-diagnostics`
**Base Commit:** `86d5662c7caa63b2b5de7539a1321aa261ed0fdb`
**Estado:** **NO-GO PARA CERTIFICAR EL CHECKPOINT EN ESTA EJECUCIÓN**. La auditoría previa reportó los gates dirigidos PASS, pero la repetición Jest actual no completó: Jest no pudo resolver un módulo de DI bajo una ruta protegida. No se determinó si falta en el checkout o si la restricción impide resolverlo; no se inspeccionó ni modificó esa ruta ni se tocaron exclusiones. La validación acumulativa y Electron empaquetado siguen pendientes para R7-09.

---

## 1. Resumen de Puertas de Calidad (Quality Gates)

| Control de Calidad | Métrica Evaluada | Resultado | Evidencia / Detalle |
|---|---|---|---|
| **Pruebas Unitarias Directas** | 7 suites / 85 pruebas | **PASS REPORTADO PREVIAMENTE** | Auditoría independiente previa; no se repitió por separado en esta sesión |
| **Regresión Dirigida** | 22 suites / 178 tests / 20 snapshots esperados | **INCOMPLETA EN ESTA EJECUCIÓN — exit 1** | 14 suites / 112 tests fallaron al inicializar DI por un módulo no resuelto bajo ruta protegida; 8 suites / 66 tests pasaron; 5 snapshots ejecutados y pasaron. El origen del módulo no resuelto no se determinó. La auditoría previa reportó 22/178 y 20 snapshots PASS. |
| **Pruebas Visuales Playwright** | 5 escenarios, harness sintético React | **PASS REPORTADO PREVIAMENTE; NO REPETIDO** | Las cinco capturas existentes son del harness sintético, no de Electron empaquetado. |
| **Linter ESLint** | `--max-warnings=0` sobre archivos de ambos paquetes | **PASS** | Repetido por separado en `packages/core` y `packages/kube-object`; ambos exit code 0. |
| **Compilador TypeScript** | `npx tsc --noEmit` | **PARCIAL** | `packages/kube-object`: PASS actual, exit 0. `packages/core`: PASS reportado por auditoría previa, no repetido para evitar que compilación amplia recorra el subtree protegido. |
| **Integridad Git** | `git diff --cached --check` | **PASS** | Repetido sobre todos los archivos staged del checkpoint. |
| **JSON, scripts y evidencias** | JSON parseable; scripts y 5 PNG presentes | **PASS** | Validado en esta sesión. |
| **Aislamiento Concurrente** | Modificación de Roadmap | **PRESERVADO** | `R7_PROVISIONAL_ROADMAP.md` no fue editado. |

---

## 2. Resolución de Correcciones Obligatorias del Checkpoint

### 2.1 `resourceVersion` y Control de Concurrencia
- **Causa original:** La implementación necesitaba conservar una versión de recurso con la operación de PATCH para que cambios concurrentes pudieran detectarse.
- **Solución implementada:** Se incorporó `metadata: { resourceVersion: targetResourceVersion }` en el cuerpo del `application/strategic-merge-patch+json`. El cliente también compara la versión obtenida por GET con la esperada cuando está definida. El campo enviado está destinado a activar el control de concurrencia del API server de Kubernetes; el comportamiento de un servidor real no fue ejecutado ni verificado en este hito.
- **Nuevas pruebas:** `pod-api-ephemeral.test.ts` verifica:
  1. Que `mockRequest.patch` recibe `metadata.resourceVersion: "100"`.
  2. Que un `HTTP 409 Conflict` configurado por el mock tras el GET se propaga al cliente.
> Estas pruebas verifican el payload y el manejo del error con un cliente mockeado; no demuestran una respuesta de un API server real ni una mutación en clúster.

### 2.2 Espera del Estado Real del Contenedor Antes de Abrir Terminal
- **Causa original:** La terminal en el dock se abría de inmediato tras el `200 OK` del PATCH, sin comprobar si el contenedor efímero lograba inicializarse o fallaba (`CrashLoopBackOff` / `OOMKilled`).
- **Solución implementada:** En `attach-debug-container-dialog.tsx`:
  - Se desacopló la mutación del lanzamiento de terminal.
  - Se implementó polling acotado (`waitForContainerRunning`) sobre `podApi.get` con timeout configurable y cancelación limpia.
  - Estados distinguidos:
    - *Mutación aceptada:* Banner informativo de espera activo.
    - *Contenedor pendiente:* Muestra motivo de espera (`ContainerCreating`, `ImagePullBackOff`).
    - *Contenedor ejecutándose:* Abre terminal vía `createPodTerminalTab` y cierra el diálogo.
    - *Contenedor fallido (`state.terminated`):* Bloquea la terminal y muestra banner con código de salida y motivo.
    - *Timeout o desconexión:* Cancela la espera y no abre la terminal.
- **Nuevas pruebas:** `attach-debug-container-dialog.test.tsx` verifica:
  - Transición de pendiente a `Running` abre terminal.
  - Terminación fallida (`exitCode 137: OOMKilled`) no abre terminal y muestra error.
  - Timeout de polling no abre terminal y notifica al usuario.
  - Desconexión del clúster cancela polling y no abre terminal.
  - Cancelación por el operador aborta la espera limpiamente.

### 2.3 Tail: All Explícito y Concurrencia de Logs
- **Causa original:** `tailLines: undefined` se utilizaba tanto para "All" como para el estado heredado sin preferencia, confundiendo la carga progresiva por omisión con la solicitud deliberada de todos los logs. Además, errores de solicitudes obsoletas en `loadMore()` podían corromper el estado de la pestaña tras una recarga.
- **Solución implementada:**
  - Se distinguió explícitamente:
    - `tailLines: 0` (`TAIL_ALL`): Selección deliberada de All; no envía `tailLines` en los parámetros de consulta al API server.
    - `tailLines: undefined`: Comportamiento heredado sin preferencia; mantiene la carga progresiva por defecto (500 líneas).
  - En `store.ts`, tanto en `load()` como en `loadMore()`:
    - En `catch` y `finally`, se comprueba `this.tabRequestIds.get(tabId) === requestId`.
    - Respuestas tardías o errores de red provenientes de solicitudes canceladas por recarga o cambio de filtros se descartan en silencio sin alterar `tabStatus` ni `tabErrors`.
- **Nuevas pruebas:** `log-ergonomics.test.ts` verifica:
  - Selección explícita de All (`tailLines: 0`) omite estrictamente el parámetro `tailLines` en la llamada a Kubernetes.
  - Pestaña heredada (`tailLines: undefined`) conserva `tailLines: 500`.
  - Error tardío de `loadMore` obsoleto tras recarga no corrompe el estado `LIVE` de la pestaña ni inyecta errores visuales.

### 2.4 Parser Estricto de Kubernetes Quantity
- **Causa original:** Expresiones regulares permisivas (`[0-9.]+`) y funciones laxas como `parseFloat` y `parseInt` permitían valores anómalos como `1..2`, `2.3.4m`, `1.2.3Gi`, `12pods` o `1.5` para contadores de Pods, generando métricas aparentemente válidas.
- **Solución implementada:** En `quantity-parser.ts`:
  - Se incorporó `STRICT_NUMBER_REGEX = /^[+]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/`, garantizando a lo sumo un punto decimal y ningún texto espurio.
  - En `parseCpuQuantity`: rechazo estricto de números malformados; cálculo sin redondeos prematuros que distorsionen cantidades válidas de CPU (ej. `1.5m` permanece `1.5`, `0.5m` permanece `0.5`).
  - En `parseCountQuantity`: validación obligatoria de enteros no negativos (`/^[+]?(0|[1-9]\d*)$/`); rechazo categórico de decimales (`1.5`) y sufijos (`12pods`).
  - En `headroom-calculator.ts`: entradas inválidas devuelven `status: "N/A"` con `percentage: undefined`, impidiendo la exhibición de métricas falsas.
- **Nuevas pruebas:** `headroom.test.ts` reproduce y verifica el rechazo exacto de `1..2`, `2.3.4m`, `1.2.3Gi`, `12pods`, `1.5` para Pods, y la precisión en CPU fraccionaria.

### 2.5 Protección Multiclúster Reforzada
- **Comprobaciones añadidas:**
  - En `attach-debug-container-dialog.tsx`, se valida `isClusterConnectionHealthy(cluster)` (apoyándose en `cluster.available`, `cluster.accessible` y `cluster.disconnected`).
  - Si la identidad activa es desconocida (`!currentClusterId || !this.initialClusterId`), la operación se rechaza inmediatamente antes de tocar la red.
  - Si el clúster o el Pod objetivo cambian antes del despacho o durante el polling de estado, la operación se cancela y no se lanza ninguna terminal.
  - Confirmación reforzada en clústeres PROD totalmente intacta.

### 2.6 Aislamiento de Generación Monotónica Asíncrona (Reapertura del Mismo Pod y PATCH Pendiente)
- **Causa original:** `pollingCancelled` se establecía en `true` al cancelar, pero se reinicializaba a `false` al abrir de nuevo el diálogo. Si el operador cancelaba una operación y reabría de inmediato el mismo Pod en el mismo clúster, un `GET` o un `PATCH` en vuelo de la operación anterior podía resolverse posteriormente; al coincidir el `clusterId` y el `initialPodUid`, el diálogo confundía la respuesta obsoleta con la sesión actual, abriendo terminales o inyectando errores indebidos.
- **Solución implementada:**
  - Implementación de un token de generación monotónico estricto (`currentGeneration`):
    - Se incrementa en cada apertura del diálogo (vía reacción al Pod activo).
    - Se incrementa en cada cancelación o cierre (`close()`).
    - Se incrementa en el desmontaje (`componentWillUnmount`).
    - Se incrementa en cada cambio de Pod seleccionado.
    - Cada despacho de `attachAndLaunch()` incrementa y captura su propia generación monotónica `opGeneration`.
    - Cada bucle de `waitForContainerRunning()` captura y revalida `opGeneration`.
  - Verificación post-`await` obligatoria en cada punto de suspensión asíncrono (`attachEphemeralContainer`, `podApi.get`, `cancelableDelay`):
    - Se valida `this.currentGeneration === opGeneration && !this.pollingCancelled`.
    - Si la generación difiere, la respuesta se descarta en silencio absoluto, sin alterar el estado MobX (`errorMessage`, `waitingForReady`, `submitting`), sin disparar notificaciones y sin abrir terminales.
  - **Cancelación con PATCH pendiente y precisión operativa:**
    - Se examinó el caso en que `attachEphemeralContainer()` ya fue emitido pero la promesa continúa en vuelo: si el operador cancela, el seguimiento local queda inmediatamente invalidado y nunca se inicia polling posterior.
    - Se distingue con precisión de auditoría:
      1. *Operación no enviada:* Abortada pre-despacho por validaciones locales.
      2. *PATCH enviado:* En tránsito en la red o procesándose en el API server.
      3. *PATCH confirmado:* Kubernetes persistió el subrecurso `ephemeralcontainers`.
      4. *Seguimiento cancelado:* El cliente local abandonó el monitoreo sin disparar UI ni terminal.
      5. *Estado final del contenedor desconocido:* La cancelación local no garantiza revertir una mutación ya aceptada por Kubernetes (los contenedores efímeros son inmutables en spec upstream).
- **Nuevas pruebas unitarias (Casos A, B, C):**
  - **Caso A (Cancelar y reabrir mismo Pod):** Pod A inicia attach → GET queda pendiente → Cancelar → Reabrir Pod A → Resolver GET antiguo con Running → 0 terminales abiertas, 0 notificaciones, diálogo nuevo preserva estado interactivo limpio.
  - **Caso B (PATCH pendiente):** Pod A inicia attach → PATCH queda pendiente → Cancelar → Abrir Pod B → Resolver PATCH antiguo → Ningún polling iniciado para A, 0 terminales, diálogo de B intacto.
  - **Caso C (A → B → A):** Operación iniciada en A → Cambiar a B → Volver a A → Resolver respuestas antiguas fuera de orden → Únicamente la generación actual puede alterar la interfaz.

### 2.7 Cancelación Cooperativa GET → Cancel → PATCH
- **Causa original:** `PodApi.attachEphemeralContainer()` ejecutaba un `podApi.get()` previo a construir y despachar el `patch()`. Si el usuario cancelaba la operación o cerraba el modal mientras el `get()` estaba en vuelo en la red, `pod.api.ts` continuaba ciegamente y terminaba enviando el PATCH mutante a Kubernetes.
- **Solución implementada:**
  - `AttachEphemeralContainerOptions` incorpora `signal?: AbortSignal` y callback `isCancelled?: () => boolean`.
  - La comprobación cooperativa se ejecuta en cinco momentos, incluidos los puntos anteriores al despacho y una comprobación posterior para detener la continuación local:
    1. Al inicio del método.
    2. Inmediatamente antes de invocar `get()`.
    3. Inmediatamente al resolverse la promesa del `get()`, antes de estructurar el parche.
    4. Inmediatamente antes de despachar el `patch()`.
    5. Post-despacho del `patch()`.
  - Si `signal.aborted` o `isCancelled()` retorna true antes del despacho, se interrumpe el flujo con `AbortError` (status 499). En los casos Jest mockeados cubiertos, no se invoca `request.patch()` cuando la cancelación se detecta en esa fase. `AbortSignal` no se pasa al cliente HTTP y no puede detener ni revertir un PATCH ya enviado; tras el despacho, la UI solo puede abandonar su seguimiento local.

### 2.8 PROD Guard con Doble Confirmación Operativa y Etiquetas Canónicas
- **Solución implementada:**
  - Integración canónica de `getClusterEnvironmentConfig(cluster?.preferences)`, mostrando etiquetas reales: `PRODUCTION`, `STAGING`, `DEVELOPMENT`, `TESTING / QA`, `LOCAL`, `CUSTOM` y `NONE`.
  - En clústeres clasificados como `PRODUCTION`, el botón de envío se mantiene deshabilitado hasta satisfacer conjuntamente:
    1. Checkbox consciente de confirmación activado (`prodConfirmed`).
    2. Campo de texto con el nombre exacto del Pod tipeado por el operador (`prodConfirmationInput.trim() === pod.getName()`).
  - Reseteo atómico de confirmación e input al cambiar de Pod o clúster.

### 2.9 Validación Cooperativa de 9 Precondiciones Antes del PATCH (Hallazgo Crítico A)
- **Causa original:** Si el contexto de clúster cambiaba, la conexión caía, o el Pod era recreado con distinto UID mientras `podApi.get` estaba en vuelo en la red, `PodApi.attachEphemeralContainer()` podía emitir la mutación `request.patch()` sobre un clúster o Pod equivocado.
- **Solución implementada:**
  - Validación en 5 puntos de control temporales (inicio, pre-GET, post-GET inmediato, pre-PATCH y post-PATCH) de 9 precondiciones cooperativas:
    1. `options.signal.aborted`: Verificación de señal AbortController.
    2. `options.isCancelled()`: Cancelación explícita del diálogo o sesión.
    3. `options.getCurrentGeneration() === options.generation`: Token de generación monótona (invalida operaciones superadas).
    4. `options.getCurrentClusterId() === options.clusterId`: Identidad estricta del clúster activo.
    5. `options.isClusterHealthy()`: Conexión sana y accesible.
    6. `resource.name === options.expectedName && resource.namespace === options.expectedNamespace`: Descriptores iniciales.
    7. `freshPod.getId() === options.expectedPodUid`: Verificación del UID devuelto por Kubernetes tras el GET (detecta Pod eliminado y recreado).
    8. `freshPod.getName() === options.expectedName && freshPod.getNs() === options.expectedNamespace`: Validación sobre objeto fresco.
    9. `options.validateContext(freshPod)`: Validación de entorno productivo (requiere confirmación dual).
  - Si una precondición aplicable falla antes del despacho, el cliente arroja `AbortError` / 412 / 499. Las pruebas mockeadas verifican que las rutas cubiertas no invocan `request.patch()` en ese caso. Estas validaciones locales son cooperativas y no cierran por sí solas la carrera entre el último chequeo y el PATCH; `resourceVersion` aporta un control separado del lado de Kubernetes, cuya ejecución real no se verificó aquí.
- **Nuevas pruebas:** `pod-api-ephemeral.test.ts` (5 nuevos tests) y `attach-debug-container-dialog.test.tsx` (1 nuevo test de integración cooperativa).

### 2.10 Distinción Estricta entre Cero Explícito y Datos Faltantes en Headroom (Hallazgo Crítico B)
- **Causa original:** En `headroom-calculator.ts`, una asignación `usedRaw ?? "0"` convertía la ausencia de métricas en un falso 0% de uso con estado `normal`. Si Kubernetes omitía `status.used` o una clave no existía, el operador veía erróneamente un clúster con 100% de headroom disponible.
- **Solución implementada:**
  - Si `usedRaw` es estrictamente `"0"`, `"0m"` o `"0Ki"` con un límite hard válido, se computa `percentage: 0`, `status: "normal"` y `usedFormatted: "0..."`.
  - Si el objeto `ResourceQuota` carece de `status`, o `status.used` es nulo/indefinido, o la clave está ausente en `status.used`, se retorna de forma segura `status: "na"`, `percentage: undefined` y `usedFormatted: "N/A"`.
- **Nuevas pruebas:** `headroom.test.ts` añade 4 tests dedicados que verifican el cómputo de 0% frente a `N/A`, objetos sin `status`, claves parciales, y múltiples cuotas independientes por namespace.

### 2.11 Barrera de Reentrancia y Prevención de Doble Ejecución (Hallazgo C)
- **Causa original:** `attachAndLaunch()` no poseía un bloqueo síncrono al entrar. Un doble clic rápido disparaba una segunda ejecución que abortaba la primera e incrementaba `currentGeneration`, cancelando la mutación en curso y dejando el diálogo en un estado confuso.
- **Solución implementada:**
  - Candado reactivo `this.isExecuting`:
    - Al ingresar a `attachAndLaunch()`, comprueba `if (this.isExecuting || this.submitting || this.waitingForReady) return;`.
    - La segunda invocación retorna de inmediato sin abortar la señal en curso, sin alterar `currentGeneration` y sin emitir dobles peticiones de red.
    - Se libera atómicamente en bloques `finally`, `close()`, `componentWillUnmount()` y al cambiar de Pod.
- **Nuevas pruebas:** `attach-debug-container-dialog.test.tsx` añade 5 tests mockeados: el caso de doble clic observa una llamada de mutación; los demás cubren PATCH pendiente + segundo clic, reintento tras 409, reintento tras fallo de red y reapertura limpia.

---

## 3. Desglose de Pruebas Unitarias de R7-08 (7 Suites / 85 Tests PASS)

1. `headroom.test.ts` (18 tests PASS):
   - CPU millicores (`1`, `2.5`, `500m`, `1000000n`, `1000u`).
   - Memoria binaria y decimal (`Ki`, `KiB`, `Mi`, `Gi`, `Ti`, `k`, `M`, `G`, bytes).
   - Contadores enteros estrictos.
   - Rechazo de `1..2`, `2.3.4m`, `1.2.3Gi`, `12pods`, `1.5` (Pods).
   - Preservación de precisión para millicores fraccionarios (`1.5m`, `0.5m`).
   - Formateo inverso de cantidades.
   - Brackets `<80%` (normal), `80-90%` (warning), `>=90%` (critical).
   - Porcentaje sin recortar en sobreasignación (120%).
   - Retorno seguro de `status: "N/A"` para límites cero, ausentes o inválidos.
   - **Hallazgo B:** Distinción estricta entre cero explícito (`"0"`, `"0m"`, `"0Ki"`) con límite válido que calcula 0% `normal`, y datos faltantes o desconocidos (sin status, sin status.used o claves ausentes) que computan `N/A`.
   - **Hallazgo B:** Procesamiento independiente de múltiples cuotas en el mismo namespace sin colisiones.
   - Evaluación semántica de objetos `ResourceQuota` reales y determinación de severidad máxima.
2. `cluster-overview-resource-quota-block.test.tsx` (3 tests PASS):
   - Suscripción limpia a `resourceQuotaStore` al montar y desuscripción al desmontar.
   - Estado vacío cuando no existen ResourceQuotas en el clúster.
   - Agrupación estricta por Namespace sin agregaciones cruzadas inválidas.
3. `json-log-formatter.test.ts` (6 tests PASS):
   - Sanitización HTML contra XSS (`<script>`, `<img src=x onerror=...>`).
   - Extracción de campos canónicos y variantes (`severity`, `msg`, `ts`, `caller`).
   - Soporte de prefijo timestamp RFC 3339 de Kubernetes.
   - Fallback limpio a texto plano.
   - Colorimetría de insignias según severidad.
4. `log-ergonomics.test.ts` (8 tests PASS):
   - Traducción de `tailLines` (100, 500, 1000).
   - Ausencia estricta de `tailLines` con `tailLines: 0` (All explícito).
   - Carga progresiva por defecto con `tailLines: undefined` (heredado).
   - Traducción de `sinceSeconds` (900, 3600).
   - No competencia entre `sinceSeconds` y `sinceTime` en polling continuo.
   - Descarte de respuesta tardía ante cambio de filtro.
   - Descarte de error tardío de `loadMore` obsoleto tras recarga.
   - Aislamiento estricto de parámetros entre pestañas del dock.
5. `pod-devops-menu.test.tsx` (5 tests PASS):
   - Apertura de terminal dedicada en dock.
   - Apertura de logs específicos del contenedor.
   - Lanzamiento de diálogo de port forward.
   - Acciones individuales por contenedor en pods multi-contenedor.
   - Apertura del diálogo "Attach Debug Container".
6. `pod-api-ephemeral.test.ts` (13 tests PASS):
   - Envío de PATCH a `/ephemeralcontainers` preservando contenedores existentes.
   - Presencia de `metadata.resourceVersion` en el payload y propagación de un 409 configurado por el mock; no se ejecutó un API server real.
   - Detección de versión local en conflicto (409 Conflict).
   - Rechazo de nombres duplicados con HTTP 422 antes de mutar.
   - Manejo de Pod inexistente con HTTP 404.
   - Cancelación cooperativa antes del GET y durante el GET pendiente: el cliente mockeado confirma que no se invoca `request.patch()` en esas rutas.
   - **Hallazgo A:** Pruebas mockeadas de aborto antes del despacho ante cambio de contexto, desconexión, UID distinto, generación superada A -> B -> A y fallo de `validateContext`.
   - **Hallazgo A:** Aborto cooperativo antes de PATCH cuando `validateContext` falla (transición PROD sin confirmar).
7. `attach-debug-container-dialog.test.tsx` (32 tests PASS):
   - Cero renderizado o mutación si el estado es undefined.
   - Renderizado de datos del pod, presets y advertencia de inmutabilidad en DEV.
   - Enforzamiento del PROD Guard con checkbox obligatorio y tipeo exacto del nombre del Pod.
   - Espera activa del estado `Running` del contenedor antes de abrir terminal.
   - Rechazo de apertura de terminal si el contenedor termina en fallo (`OOMKilled`).
   - Timeout de polling con notificación al usuario sin abrir terminal.
   - Descarte de respuesta tardía de GET si el clúster activo cambió mientras el GET estaba pendiente (cero terminales abiertas).
   - Descarte de respuesta tardía de GET si el Pod objetivo fue eliminado y recreado con mismo nombre pero distinto UID.
   - Cancelación limpia de polling durante el intervalo de espera sin promesas colgadas.
   - Cancelación limpia de polling si el Pod seleccionado cambia en el estado del diálogo.
   - Rechazo cuando la identidad del clúster es desconocida.
   - Cancelación ante cambio de clúster activo en vuelo.
   - Manejo de error HTTP 403 Forbidden sin crash.
   - Cierre limpio al hacer clic en Cancelar sin emisión de peticiones.
   - **Caso A:** Descarte de respuesta tardía de GET al cancelar y reabrir el mismo Pod (0 terminales, estado nuevo preservado).
   - **Caso B:** Cancelación con PATCH pendiente y cambio a Pod B (0 polling hacia A, 0 terminales, diálogo B limpio).
   - **Caso C:** Carrera A → B → A con respuestas desordenadas; aislamiento estricto por token de generación monotónico.
   - Comprobación exhaustiva de los 7 entornos canónicos (`PRODUCTION`, `STAGING`, `DEVELOPMENT`, `TESTING / QA`, `LOCAL`, `CUSTOM`, `NONE`).
   - Presets completos incluyendo `busybox`, `alpine`, `netshoot` y `curl`.
   - Propagación de `AbortSignal` y predicado `isCancelled` hacia `attachEphemeralContainer`.
   - **Hallazgo C:** Prevención de doble ejecución por doble clic rápido: exactamente 1 mutación despachada sin carreras.
   - **Hallazgo C:** PATCH pendiente seguido de segunda invocación no cancela ni invalida la primera operación legítima.
   - **Hallazgo C:** Reintento exitoso tras error HTTP 409 Conflict sin bloqueo del diálogo.
   - **Hallazgo C:** Reintento exitoso tras error de red transitorio sin bloqueo del diálogo.
   - **Hallazgo C:** Apertura legítima habilitada tras cancelar diálogo anterior.
   - **Hallazgo A:** Validación integral de las 9 precondiciones cooperativas en vuelo.

---

## 4. Regresión Dirigida y Ampliada (Pods + Logs + Headroom + Ephemeral)

- **Resultado previo reportado por auditoría independiente:** **22 suites / 178 tests PASS — 20 snapshots PASS**. Ese resultado se conserva como antecedente, no como repetición de esta sesión.
- **Comando repetido en esta sesión:** `../../node_modules/.bin/jest --runInBand --ci --json --outputFile=/tmp/r7-08-jest-directed-20261024T170129Z.json src/renderer/components/workloads-pods src/renderer/components/dock/logs src/common/k8s-api/endpoints/__tests__/pod-api-ephemeral.test.ts src/renderer/components/config-resource-quotas/headroom/__tests__/`
- **Resultado actual:** exit code **1**; 14 suites / 112 tests fallaron durante inicialización de DI, 8 suites / 66 tests pasaron y los 5 snapshots ejecutados pasaron. Jest reportó que no pudo resolver un módulo de DI ubicado bajo el subtree protegido; no se inspeccionó, modificó ni excluyó esa ruta. Por eso no se verificaron los 20 snapshots completos.
- **Clasificación:** fallo de resolución de dependencia con origen no determinado. No hay evidencia suficiente para clasificarlo como regresión funcional ni como defecto de infraestructura. No se cambió el test harness ni se silenciaron suites. El antecedente de PASS requiere una repetición autorizada para cerrar esta discrepancia.
- **Cobertura:** Menús DevOps, inyección efímera, terminal de Pods, ejecución de comandos, políticas de red asociadas, volúmenes, variables de entorno, tolerancias, imágenes de contenedor, visor de logs con búsqueda, filtros ergonómicos y cuotas de recursos.

---

## 5. Verificación Visual Playwright en Harness React Sintético

- **Comando:** `node docs/revival/scripts/verify-r7-08-pod-diagnostics.cjs`
- **Resultado reportado previamente:** **5 escenarios PASS**; no repetidos en esta sesión.
- **Alcance y Honestidad de Cobertura:**
  - El script ejecuta Chromium vía Playwright sobre un servidor HTTP local que monta `docs/revival/scripts/r7-08-harness/harness.tsx`.
  - Dicho harness utiliza **React 17 real** y compila mediante `esbuild` y `sass`, reutilizando componentes puros del código fuente como `ResourceQuotaHeadroom` y `parseJsonLogLine`.
  - **Aclaración de auditoría:** El harness reproduce visualmente los flujos del diálogo y los controles de logs mediante componentes sintéticos de prueba; **NO** monta los componentes originales completos `AttachDebugContainerDialog`, `LogControls` ni `LogList` (los cuales requieren el árbol completo de DI de Inversify/Ogre-Tools y el runtime de Electron).
  - Por consiguiente, estas pruebas verifican selectores DOM, estilos e interacciones del harness sintético; **no certifican Electron empaquetado ni un API server Kubernetes real** (validación acumulativa reservada formalmente para R7-09).
  - Las pruebas de Jest cubren componentes originales y árboles `renderFor(di)` con dependencias mockeadas; no son ejecución de Electron empaquetado.
  - Las cinco pruebas visuales y sus capturas corresponden exclusivamente a este harness sintético, no a Electron empaquetado.
  - La certificación acumulativa de R7-01 a R7-08 y la ejecución empaquetada quedan pendientes para R7-09.
- **Evidencias fotográficas en `docs/revival/evidence/r7-08/`:**
  - `01-debug-container-dev.png`: DEV cluster con netshoot y banner de inmutabilidad.
  - `02-debug-container-prod.png`: PROD cluster con PROD Guard, borde rojo `#EF4444` y confirmación consciente.
  - `03-log-ergonomics-controls.png`: Controles Since (1h), Tail (100) y stream PAUSED.
  - `04-json-structured-logs.png`: Logs JSON estructurados con insignias y fallback plano.
  - `05-resourcequota-headroom.png`: Desglose de cuotas con clasificación de umbrales y manejo de límites cero.
