# OpenLens DevOps Revival — R7-08 Revisión de Seguridad

**Hito:** R7-08 — Advanced Pod Diagnostics (`Attach Debug Container`, Log Ergonomics, ResourceQuota Headroom)
**Fecha:** 2026-10-24
**Evaluador:** Arquitecto Senior de Kubernetes, DevOps & Seguridad
**Worktree:** `/Users/gustavomarcon/Documents/lens/lens-r7-08-pod-diagnostics`
**Rama:** `feat/r7-08-pod-diagnostics`
**Base:** `86d5662c7caa63b2b5de7539a1321aa261ed0fdb`
**Estado:** **REVISIÓN LOCAL DEL CHECKPOINT** (controles revisados con pruebas unitarias mockeadas; no equivale a una auditoría exhaustiva ni a una prueba contra un API server real. La validación acumulativa de R7-01 a R7-08 queda para R7-09.)

---

## 1. Modelo de Amenazas y Vectores de Riesgo

El diagnóstico avanzado de Pods involucra una operación de mutación sensible sobre el clúster (`Attach Debug Container`), así como el procesamiento y renderizado de flujos de texto arbitrarios provenientes de cargas de trabajo no confiables (Logs).

Se identificaron y mitigaron 7 vectores de riesgo principales:

1. **Mutación Accidental o Persistente en Cargas de Producción:**
   En Kubernetes, los contenedores efímeros son inmutables una vez inyectados: no se pueden eliminar ni reiniciar sin recrear el Pod. Una inyección involuntaria en producción podría consumir recursos de nodo, abrir canales de red no deseados o interferir con la topología de la aplicación.
2. **Condiciones de Carrera y Sobreescritura Concurrente Post-Lectura:**
   Si dos operadores o controladores intentan modificar el Pod en paralelo, una comparación puramente local antes de enviar la petición es insuficiente. Si el Pod se modifica en etcd tras la lectura, la mutación debe fallar de forma atómica en el API server sin corromper el Pod.
3. **Lanzamiento Prematuro o Erróneo de Terminal sobre Contenedores Fallidos o Pods Recreados:**
   Abrir una terminal inmediatamente tras el `PATCH` asume falsamente que el contenedor arrancó. Si el contenedor falla (`ImagePullBackOff`, `CrashLoopBackOff`, `OOMKilled`), o si el Pod fue eliminado y recreado con el mismo nombre pero diferente UID durante la espera, la terminal quedaría huérfana o conectada a un Pod espurio.
4. **Inyección de Código Malicioso vía Logs (Cross-Site Scripting - XSS):**
   Los logs de las aplicaciones en ejecución pueden contener intencionalmente cadenas maliciosas (`<script>`, `<img src=x onerror=...>`, secuencias de escape no confiables) destinadas a ejecutarse en el contexto de la aplicación Lens (Chromium/Electron).
5. **Denegación de Servicio por Agotamiento de Memoria (DoS de Renderizado):**
   Cargas de trabajo con salida intensiva de logs a alta velocidad pueden saturar el hilo principal de React y agotar la memoria del proceso de renderizado.
6. **Métricas Falsas por Parseo Laxo de Cantidades Kubernetes:**
   Formatos malformados (`1..2`, `2.3.4m`, `1.2.3Gi`, `12pods`, o `1.5` para Pods) procesados con `parseFloat`/`parseInt` devuelven valores numéricos truncados engañosos que simulan una asignación o uso normal.
7. **Contaminación Cruzada entre Clústeres, Identidad Desconocida y Respuestas Asíncronas Tardías:**
   Un operador que alterna entre clústeres o cuya identidad activa no está confirmada podría emitir mutaciones en contextos no previstos o recibir errores de solicitudes obsoletas que corrompan vistas activas.

---

## 2. Mitigaciones Implementadas y Mecanismos de Blindaje

### 2.1 Aislamiento del Subrecurso `pods/ephemeralcontainers` y Control de Concurrencia
- **Sin mutación de la especificación general del Pod:**
  La operación `attachEphemeralContainer` no envía una actualización general del Pod (`PUT /api/v1/.../pods/{name}`). Utiliza estrictamente el subrecurso:
  `PATCH /api/v1/namespaces/{namespace}/pods/{name}/ephemeralcontainers`
  con cabecera `Content-Type: application/strategic-merge-patch+json`.
- **Preservación estricta de contenedores previos:**
  El evaluador extrae la lista actual de `spec.ephemeralContainers` y genera una adición pura (*append*). Los contenedores efímeros previos no se alteran ni se pierden.
- **Control de concurrencia del lado del servidor previsto (`metadata.resourceVersion`):**
  El cuerpo del PATCH incluye `metadata: { resourceVersion: targetResourceVersion }`. El cliente compara además la versión obtenida por GET con la versión esperada cuando esta fue proporcionada. El campo enviado permite que Kubernetes aplique su control de concurrencia y rechace una versión obsoleta; en este hito, las pruebas solo verifican el payload y el manejo de un `409` con un cliente mockeado. No se ejercitó un API server Kubernetes real.
- **Cancelación cooperativa (GET → Cancel → PATCH):**
  `attachEphemeralContainer` acepta `signal?: AbortSignal` y `isCancelled?: () => boolean`. El flujo comprueba la cancelación antes del GET, al volver del GET y justo antes de invocar el PATCH. Las pruebas Jest mockeadas verifican que cancelar mientras el GET está pendiente evita invocar `request.patch()` en ese escenario. La señal no se pasa al cliente HTTP: si el PATCH ya se despachó, `AbortSignal` no lo revierte ni garantiza detenerlo; la UI puede dejar de seguirlo, pero Kubernetes todavía puede completar la mutación.
- **Validación de unicidad de nombre (RFC 1123):**
  Se valida localmente que el nombre generado para el contenedor efímero no colisione con contenedores regulares ni efímeros preexistentes, rechazando la acción antes de emitir la petición a la red (`HTTP 422 Unprocessable Entity`).

> [!NOTE]
> La cobertura HTTP 409 usa un cliente mockeado en Jest. El harness Playwright es sintético y no representa un API server Kubernetes. No se declara validación real del API server ni se realizaron mutaciones a clústeres operativos.

### 2.2 Verificación del Estado Real del Contenedor Antes de Abrir Terminal
- **Desacoplamiento estricto:**
  No se invoca `createPodTerminalTab` inmediatamente tras la confirmación del PATCH.
- **Ciclo de espera acotado y cancelable (`waitForContainerRunning`):**
  Se implementó polling acotado sobre el estado real reportado por el API server (`freshPod.status.ephemeralContainerStatuses`), con las siguientes distinciones y defensas:
  1. *Mutación aceptada:* La UI informa al usuario que el parche fue aceptado y que se aguarda la inicialización.
  2. *Contenedor pendiente:* Informa el motivo de espera (`ContainerCreating`, `ImagePullBackOff`).
  3. *Contenedor en ejecución (`state.running`):* Únicamente ante este estado verificado se abre la terminal y se notifica el éxito.
  4. *Contenedor fallido (`state.terminated`):* Se cancela el lanzamiento de terminal y se despliega un mensaje de error con el código de salida y motivo de fallo (ej. `exitCode 137: OOMKilled`).
  5. *Timeout o desconexión:* Tras alcanzar el límite de intentos o perderse la conexión, la espera finaliza sin abrir terminal.
  6. *Protección contra Pod eliminado y recreado:* Después de cada GET se valida que `freshPod.getId() === this.initialPodUid`. Si el UID no coincide, la terminal se bloquea y se emite error por UID mismatch.
  7. *Cancelación sin promesas huérfanas:* La espera se gestiona mediante `cancelableDelay`, que resuelve de inmediato ante desmontaje del componente, clic en Cancelar o cambio del Pod seleccionado en el estado observable.

### 2.3 Enforzamiento del PROD Guard y Protección Multiclúster
- **Identificación Canónica de Entornos:**
  Se consulta la configuración canónica de clústeres mediante `getClusterEnvironmentConfig(cluster?.preferences)`, reconociendo los entornos oficiales: `PRODUCTION`, `STAGING`, `DEVELOPMENT`, `TESTING / QA`, `LOCAL`, `CUSTOM` y `NONE`. La detección de producción delega en la función canónica `isProductionEnvironment(cluster)`.
- **Barrera de tres niveles con doble confirmación operativa en Producción:**
  1. *Advertencia Visual Destacada:* Borde y banner en rojo `#EF4444` indicando el riesgo operativo de inyectar un contenedor permanente.
  2. *Bloqueo de Interfaz:* El botón de envío se encuentra deshabilitado por defecto.
  3. *Doble Confirmación Operativa Obligatoria:*
     - Marcar una casilla de verificación consciente donde el operador declara entender la persistencia de la mutación.
     - Tipear el nombre exacto del Pod objetivo en el campo de texto de confirmación (`prodConfirmationInput === pod.getName()`).
     - Al cambiar de Pod o de clúster, la confirmación y el texto se resetean inmediatamente a blanco.
- **Protección de identidad y consistencia multiclúster:**
  - Se comprueba `isClusterConnectionHealthy(cluster)` validando `available`, `accessible` y `disconnected`.
  - Si la identidad activa es desconocida (`!currentClusterId || !this.initialClusterId`), la operación se rechaza categóricamente.
  - Si el clúster o el Pod objetivo cambian antes del despacho, durante el GET o antes de abrir la terminal, la operación se cancela de forma atómica.

### 2.4 Sanitización Estricta contra XSS y Ergonomía de Logs
- **Escape HTML determinístico:**
  El módulo `json-log-formatter.ts` aplica `escapeHtml()` sobre todos los datos analizados (claves JSON, valores escalares, mensajes principales, nombres de logger y texto crudo en fallback), neutralizando vectores como `<script>` y `<img src=x onerror=...>`.
- **Diferenciación estricta de Tail: All vs Heredado:**
  - Opción "All" explícita: configurada con `tailLines: 0` (`TAIL_ALL`); omite el parámetro `tailLines` en la llamada HTTP a Kubernetes.
  - Comportamiento heredado sin preferencia: configurado con `tailLines: undefined`; conserva la carga progresiva por defecto (500 líneas).
- **Control de concurrencia y descarte de respuestas tardías:**
  En `store.ts`, tanto `load()` como `loadMore()` verifican `this.tabRequestIds.get(tabId) === requestId` en `try`, `catch` y `finally`. Errores o respuestas provenientes de solicitudes canceladas por recargas o cambios de filtros se descartan en silencio sin alterar el estado `LIVE` de la pestaña.

### 2.5 Aritmética Segura y Parser Estricto de Cantidades
- **Rechazo riguroso de entradas malformadas:**
  `STRICT_NUMBER_REGEX = /^[+]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/` rechaza patrones con múltiples puntos decimales (`1..2`, `2.3.4m`, `1.2.3Gi`) y cadenas con texto adicional (`12pods`).
- **Validación de enteros en contadores:**
  Los contadores de objetos (`pods`, `pvc`, `services`) rechazan valores fraccionarios (`1.5`).
- **Preservación de precisión en CPU:**
  Las cantidades fraccionarias válidas (ej. `1.5m`, `0.5m`) no sufren redondeos prematuros a enteros.
- **Fail-safe en Headroom:**
  Cualquier cantidad inválida o malformada produce obligatoriamente `status: "N/A"` con `percentage: undefined`, garantizando que nunca se exhiba una métrica falsamente válida.

### 2.6 Aislamiento de Concurrencia por Token de Generación Monotónico (Reapertura del Mismo Pod y PATCH Pendiente)
- **Problema de reapertura del mismo Pod:**
  Al cancelar una operación, `pollingCancelled` se marcaba como `true`, pero al abrir de nuevo el diálogo para el mismo Pod, se reinicializaba en `false`. Si un `GET` o un `PATCH` de la operación anterior continuaba en vuelo, al resolverse encontraba que el `clusterId` y el `initialPodUid` coincidían exactamente con la nueva sesión, produciendo aperturas de terminal espurias o notificaciones indebidas.
- **Solución por Generación Monotónica:**
  Se implementó un contador entero monotónico `currentGeneration` que avanza estrictamente en:
  1. Apertura del diálogo (reacción reactiva de MobX al Pod).
  2. Cierre o cancelación manual (`close()`).
  3. Desmontaje del componente (`componentWillUnmount`).
  4. Cambio de Pod objetivo en el estado observable.
  5. Cada invocación individual de `attachAndLaunch()` (generando un `opGeneration` único).
- **Validación Post-Await en Cada Paso Asíncrono:**
  Tras CADA `await` (`attachEphemeralContainer`, `podApi.get`, `cancelableDelay`), se valida `this.currentGeneration === opGeneration && !this.pollingCancelled`. Si la condición no se cumple, la respuesta se descarta en silencio absoluto, sin alterar el estado del diálogo ni disparar efectos secundarios.
- **Cancelación con PATCH Pendiente y Precisión Operativa:**
  Si el operador cancela mientras `attachEphemeralContainer()` está en tránsito en la red:
  - El cliente Lens aborta de inmediato el seguimiento local.
  - No se inicia polling posterior sobre el Pod ni se intenta abrir terminal alguna.
  - Si el PATCH antiguo se resuelve con éxito o con error, se descarta silenciosamente y no altera el diálogo actual (incluso si se abrió un Pod B o se reabrió el Pod A).
  - **Honestidad operativa de auditoría:** Se distingue claramente que la cancelación en el cliente no puede garantizar revertir una mutación que Kubernetes ya haya aceptado y persistido en etcd. El estado final del contenedor en el clúster queda sujeto al ciclo de vida estándar de Kubernetes, mientras el cliente mantiene estricta consistencia interna y seguridad.

### 2.7 Validación Cooperativa Integral de 9 Precondiciones Antes del PATCH (Hallazgo Crítico A)
Para prevenir cualquier mutación indebida sobre el clúster ante condiciones inconsistentes o carreras de red, `PodApi.attachEphemeralContainer()` y el diálogo evalúan cooperativamente 9 precondiciones en 5 puntos de control temporales (inicio, pre-GET, post-GET inmediato, pre-PATCH y post-PATCH):
1. **Verificación de `signal.aborted`:** Cancela si la señal AbortController fue activada.
2. **Predicado `isCancelled()`:** Cancela si el diálogo fue cerrado o la sesión cancelada.
3. **Generación monótona `getCurrentGeneration() === generation`:** Cancela si una sesión posterior superó la operación actual.
4. **Contexto de clúster `getCurrentClusterId() === clusterId`:** Cancela si el clúster activo cambió mientras se consultaba el API.
5. **Salud de conexión `isClusterHealthy()`:** Cancela si el clúster se desconectó durante la operación.
6. **Descriptores del Pod `expectedName` y `expectedNamespace`:** Verifica concordancia entre descriptor y objetivo.
7. **Coincidencia de UID post-GET `freshPod.getId() === expectedPodUid`:** Previene mutaciones si el Pod fue eliminado y recreado con el mismo nombre durante el vuelo.
8. **Nombre y Namespace del Pod retornado:** Comprueba consistencia en el objeto obtenido de Kubernetes.
9. **Validación contextual `validateContext(freshPod)`:** Comprueba que no se aplique un PATCH sobre un clúster de producción sin confirmación explícita (checkbox + tipeo exacto del nombre).

Si una precondición aplicable falla antes del despacho, el método arroja un error (`AbortError` con código 412 o 499). Las pruebas mockeadas verifican que las rutas cubiertas no invocan `request.patch()` en ese caso. Estas comprobaciones son locales y cooperativas; no cierran por sí solas la ventana entre la última comprobación y el despacho. El `resourceVersion` enviado sirve como control de concurrencia de Kubernetes, pero su aplicación real no se probó aquí.

### 2.8 Distinción Estricta entre Cero Explícito y Datos Desconocidos/Faltantes en Headroom (Hallazgo Crítico B)
Para eliminar el riesgo de falsos reportes de headroom que induzcan a los operadores a saturar clústeres:
- **Cero explícito reportado por Kubernetes (`usedRaw === "0"`):** Cuando Kubernetes reporta explícitamente `0`, `0m` o `0Ki` y existe un límite hard mayor a cero, se calcula fidedignamente `percentage: 0`, `status: "normal"` y `usedFormatted: "0..."`.
- **Datos ausentes o incompletos:** Si el objeto `ResourceQuota` no posee `status`, o `status.used` es nulo/indefinido, o la métrica particular no está presente en el mapa `status.used`:
  - Se retorna rigurosamente `status: "na"`, `percentage: undefined` y `usedFormatted: "N/A"`.
  - Se elimina el fallback permisivo que interpretaba la ausencia de métricas como `0%` de uso.

### 2.9 Barrera de Reentrancia y Prevención de Doble Ejecución (Hallazgo C)
En `AttachDebugContainerDialog`, la bandera observable `this.isExecuting` actúa como candado reentrante en `attachAndLaunch()`:
- Al recibir una solicitud, comprueba `if (this.isExecuting || this.submitting || this.waitingForReady) return;`.
- Si el operador hace doble clic rápido o se producen despachos simultáneos, la segunda llamada es rechazada de forma inmediata sin alterar `currentGeneration` ni abortar el `AbortController` de la operación legítima ya iniciada.
- El candado se libera con total robustez en bloques `finally`, `close()`, `componentWillUnmount()` o al cambiar de Pod.

---

## 3. Resumen de la Auditoría de Seguridad

> Los estados **APROBADO** de esta tabla reflejan la cobertura reportada por la auditoría previa; la repetición dirigida de esta sesión no completó por el error de resolución documentado en `R7_08_VALIDATION.md`.

| Control de Seguridad | Estado reportado previamente | Verificación |
|---|---|---|
| Payload de concurrencia (`metadata.resourceVersion`) | **CUBIERTO CON MOCK** | `pod-api-ephemeral.test.ts` verifica el payload y la propagación de 409 simulado; API server real no ejecutado |
| Cancelación cooperativa GET → Cancel → PATCH (`AbortSignal` + `isCancelled`) | **CUBIERTO CON MOCK** | `pod-api-ephemeral.test.ts` verifica que una cancelación antes del despacho evita invocar `request.patch()`; un PATCH ya enviado no es reversible por AbortSignal |
| Espera de estado `Running` antes de abrir terminal | **APROBADO** | Validado en `attach-debug-container-dialog.test.tsx` (casos éxito, fallido y timeout) |
| Token de generación monotónica para reapertura del mismo Pod | **APROBADO** | Validado en `attach-debug-container-dialog.test.tsx` (Casos A y C: 0 terminales) |
| Cancelación con PATCH pendiente y abandono de seguimiento | **APROBADO** | Validado en `attach-debug-container-dialog.test.tsx` (Caso B: 0 polling, 0 terminales) |
| Rechazo de apertura de terminal ante contenedor terminado | **APROBADO** | Validado en `attach-debug-container-dialog.test.tsx` (`exitCode 137`) |
| Rechazo de Pod recreado con UID diferente | **APROBADO** | Validado en `attach-debug-container-dialog.test.tsx` (UID mismatch) |
| Cancelación sin promesas colgadas | **APROBADO** | Validado en `attach-debug-container-dialog.test.tsx` (`cancelableDelay`) |
| Protección contra identidad desconocida / cambio de clúster | **APROBADO** | Validado en `attach-debug-container-dialog.test.tsx` |
| Bloqueo PROD Guard (checkbox + tipeo exacto del Pod) | **APROBADO** | Validado en `attach-debug-container-dialog.test.tsx` y Playwright Suite 2 |
| Etiquetas canónicas de entorno (`PRODUCTION`, `STAGING`, etc.) | **APROBADO** | Validado en `attach-debug-container-dialog.test.tsx` |
| Sanitización XSS en logs JSON | **APROBADO** | Validado en `json-log-formatter.test.ts` |
| Diferenciación estricta de Tail: All vs Heredado | **APROBADO** | Validado en `log-ergonomics.test.ts` |
| Descarte de errores/respuestas de solicitudes obsoletas | **APROBADO** | Validado en `log-ergonomics.test.ts` |
| Parser estricto contra cantidades malformadas (`1..2`, `1.5`) | **APROBADO** | Validado en `headroom.test.ts` |
| División por cero en cuotas de recursos | **APROBADO** | Validado en `headroom.test.ts` |
| Validación cooperativa de 9 precondiciones antes del PATCH (Hallazgo A) | **CUBIERTO CON MOCK** | `pod-api-ephemeral.test.ts` y `attach-debug-container-dialog.test.tsx` comprueban rutas seleccionadas sin despacho cuando una precondición local falla; no es una garantía atómica del API server |
| Distinción estricta entre 0% explícito y datos ausentes N/A (Hallazgo B) | **APROBADO** | Validado en `headroom.test.ts` (0% solo con "0" explícito, ausentes/vacíos a N/A) |
| Barrera de reentrancia contra dobles clics y carreras (Hallazgo C) | **APROBADO** | Validado en `attach-debug-container-dialog.test.tsx` (exactamente 1 mutación despachada) |

**Conclusión:** Las pruebas dirigidas cubren los controles enumerados en esta revisión dentro de sus límites de mocks y componentes. La validación acumulativa, la ejecución en Electron empaquetado y cualquier prueba contra un clúster descartable corresponden a R7-09. Esta revisión no afirma ausencia total de vulnerabilidades ni certificación de Release 7.
