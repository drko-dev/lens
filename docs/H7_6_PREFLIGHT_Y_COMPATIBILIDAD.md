# H7.6 — Preflight: ciclo de vida de Disconnect y compatibilidad del docking global

Estado: **Fase A corregida y validada con test unitario; la validación en Electron está bloqueada por espacio en disco.** Fase B auditada; no se migró ninguna vista.

Rama `feature/global-docking-h7`. Base `c685098`. Commit de la corrección: `1f36511`.

## 1. Diagnóstico de Disconnect

### Respuestas a la investigación

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| Qué evento ejecuta Disconnect | El menú del clúster (`common/catalog-entities/kubernetes-cluster.ts`, ítem "Disconnect") llama a `this.disconnect()`, que envía `deactivateClusterChannel`, y además emite `NAVIGATE_IN_APP "/catalog"`. | `features/cluster/activation/renderer/request-deactivation.injectable.ts` |
| Quién libera la conexión | Main: `requestClusterDeactivation` ejecuta `connection.disconnect()` y `clusterFrames.delete(clusterId)`. `disconnect()` mata el proceso `lens-k8s-proxy` (`kubeAuthProxyServer.stop()`), rota el token del proxy y detiene los port-forwards. | `features/cluster/activation/main/request-deactivation.injectable.ts`, `main/cluster/cluster-connection.injectable.ts:197` |
| Quién destruye el cluster frame | El renderer raíz: `ClusterFrameHandler` reacciona a `cluster.disconnected`, borra la vista, navega el iframe a `about:blank` y lo quita del DOM; si no llega `load`, lo quita a los 1,5 s. | `renderer/components/cluster-manager/cluster-frame-handler.ts:~95-150` |
| Quién libera stores y suscripciones | Al descargarse el iframe muere su JavaScript y, con él, los watches. Del lado de main, matar `lens-k8s-proxy` cierra todos los sockets hacia la API. | Sonda: a t+0 quedan 0 watches y el PID del proxy anterior desaparece |
| ¿Hay un período de gracia intencional? | No. El único temporizador es el fallback de 1,5 s para retirar el iframe. | `cluster-frame-handler.ts` |
| ¿El watch de Pods tiene consumidores reales después de Disconnect? | No es el mismo watch. Lo que se observa es una **reconexión automática**: un `lens-k8s-proxy` nuevo y watches nuevos de un iframe nuevo y oculto. | Log de main: `disconnected` → `activate` ×2 → `reconnect` → `Authentication proxy started` |
| ¿La conexión termina más tarde? | No. Sigue abierta a los 60 s, con la ruta en `/catalog`. | Tabla de mediciones |
| ¿Pasa también con el flag OFF? | Sí, con idéntico patrón. El problema es anterior a H7. | Tabla de mediciones |

### Mediciones (antes de la corrección)

Las mediciones se tomaron con una sonda Playwright sobre Electron DEV, el perfil QA y la API sintética A. Cada valor indica los watches abiertos según la API y los sockets establecidos hacia `:18443`.

| Muestra | Flag ON: watches (Pods) | Flag ON: sockets | Flag OFF: watches (Pods) | Flag OFF: ruta |
|---|---|---|---|---|
| antes | 4 (1) | 4, PID proxy 72480 | 3 (1) | `/cluster/…` |
| t+0 s | 0 (0) | 1, **PID nuevo 72546** | 0 (0) | `/catalog` |
| t+2 s | 4 (1) | 6 | 4 (1) | `/catalog` |
| t+5 s | 4 (1) | 6 | 4 (1) | `/catalog` |
| t+10 s | 4 (1) | 4 | 4 (1) | `/catalog` |
| t+20 s | 4 (1) | 4 | 4 (1) | `/catalog` |
| t+60 s | 4 (1) | 6 | 4 (1) | `/catalog` |

A los 60 s seguía en el DOM un iframe del clúster.

### Causa raíz

La reaction de activación de `ClusterView` (`renderer/components/cluster-manager/cluster-view.tsx`, `bindEvents`) observa `hasView` desde `dc48e1f`, un commit anterior a RC3.

1. Disconnect hace que `ClusterFrameHandler` borre la vista.
2. `hasView` cambia.
3. La reaction se dispara antes de que la navegación a `/catalog` desmonte `ClusterView`.
4. La reaction ejecuta `initView` y `requestClusterActivation`.
5. Main reconecta el clúster y el iframe nuevo abre sus watches.

Esto no es una retención de recursos: los recursos se recrean. El efecto para el usuario es el mismo: un clúster "desconectado" sigue conectado.

### Corrección (`1f36511`)

El propietario real de la reconexión es `ClusterView`. En la reaction, si el clúster es el mismo, la vista existía y desapareció, y el clúster está `disconnected`, no se vuelve a activar.

- No se cierra ninguna conexión compartida ni se agregan temporizadores.
- La intención de `dc48e1f` se conserva: si la vista desaparece con el clúster conectado, se recrea.
- Las ventanas desacopladas no cambian; main sigue cerrándolas al quitar el frame.

## 2. Tests y resultados

| Prueba | Resultado |
|---|---|
| `cluster-view-restoration.test.tsx`, "does not reconnect a cluster whose view was torn down by Disconnect" | RED antes del fix (2 activaciones, se esperaba 1) → GREEN |
| `cluster-view-restoration.test.tsx`, "still re-creates the view of a connected cluster when it disappears" (guarda de `dc48e1f`) | GREEN antes y después |
| Suites `cluster-manager` (2 suites) | 11/11 PASS |
| `tsc` | 42 errores, los mismos 42 que ya había; ninguno en los archivos tocados |
| ESLint (archivos tocados) | Limpio |
| Playwright D01–D08 (`open-lens/integration/h7-docking-e2e.mjs`) | **Escritas, no ejecutadas** (ver §6) |
| Suite completa (64 + 8) | **No ejecutada** (ver §6) |

Escenarios D agregados. Todos usan clics reales y miden con contadores de la API sintética. Después de Disconnect se exigen 0 watches y 0 frames del clúster en cada muestra.

| ID | Escenario | Muestras |
|---|---|---|
| D01 | Flag ON, solo Pods (Deployments cerrado con ×) | 2/5/10/20 s |
| D02 | Flag ON, solo Deployments | 2/5/10/20 s |
| D03 | Flag ON, ambos paneles | 2/5/10/20 s |
| D04 | Ventana desacoplada de Pods: se cierra, y su watch también | 2/5/10 s |
| D05 | Flag OFF (vista clásica) | 2/5/10 s |
| D06 | Reconexión: exactamente 1 watch de Pods; un segundo Disconnect vuelve a 0 | 2/5 s |
| D07 | Dos clústeres: desconectar A no cambia los watches ni el frame de B | 2/5/10 s |
| D08 | Cambio de pestaña A↔B tras reconectar: sin watches duplicados | — |

Con el bundle actual, sin el fix compilado, D01–D07 deberían fallar en la primera muestra. Eso sirve como RED end-to-end.

## 3. Matriz de compatibilidad (Fase B)

Rutas relativas a `packages/core/src/`.

| # | Familia | Ámbito | ¿Se puede montar en `GlobalPanelHost`? | Varias instancias | Propiedad de recursos | ¿Ventana nativa? | Estado que se pierde al desmontar | Riesgo |
|---|---|---|---|---|---|---|---|---|
| 1 | Listas de recursos: StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs, ConfigMaps, Secrets, Services, Ingresses, PVCs | Clúster | Sí, con el mismo patrón que Pods | Store singleton, watch con conteo de referencias; búsqueda, selección y columnas compartidas (URL y `tableId`) | `KubeWatchApi` (conteo de referencias) + `disposeOnUnmount` | No (ya existen las listas desacopladas de solo lectura) | Scroll | Bajo |
| 1b | Helm, CRDs | Clúster | Requiere pasar parámetros de ruta como props | Atado a la ruta | Igual que 1 | No | Contexto de ruta | Medio |
| 2 | Events | Clúster | Ya existe el caso en el resolver (`compact`); falta en `allowedKinds` | Igual que 1 | Igual que 1 | No | Scroll | Bajo |
| 2b | Nodes | Clúster | Sí | Cada instancia abre su propio polling de métricas (30 s) | Intervalo con start/stop al montar y desmontar | No | Métricas (se vuelven a pedir) | Bajo–medio |
| 3 | Details / inspector | Clúster | Parcial: existe `ResourceDetailsPanelContent`, pero inyecta el store de Kubetail y lee `?kube-details` | Una selección por frame (URL) | `currentKubeObjectInDetails` (URL) | Sí, para varios inspectores | Nada (URL) | Medio |
| 4a | Terminal | Clúster | Todavía no (placeholder) | Una sesión por tabId en el `TerminalStore` singleton | `TerminalStore.connect/destroy`; se destruye al cerrar la pestaña del dock | Ya es desacoplable | Se recolocan los nodos DOM de xterm y la sesión se mantiene | Alto |
| 4b | Editor | Clúster | Todavía no (`resource-editor` está deshabilitado) | `keyedSingleton` por pestaña | Modelo Monaco por URI; el view state se guarda al desmontar | No | Borrador y cursor, si el `id` no es estable | Medio–alto |
| 5a | Logs de pod | Clúster | Posible, pero acoplado al tabId del dock | Polling por tabId en el `log-store` singleton | Recarga al montar y `stopLoadingLogs` al desmontar | Ya es desacoplable | Se reinicia el polling (el buffer se conserva) | Medio–alto |
| 5b | Kubetail | Clúster | Tiene layout y store de docking propios | `kubetail-store` singleton + parámetros de URL | `stopAllStreams()` al desmontar, salvo que se preserven | Ya tiene su propio workspace desacoplado | Los streams | Alto |
| 6 | Preferencias, bienvenida y otras vistas raíz | Frame raíz | No: el host vive en el frame del clúster | n/a | Stores del frame raíz | Solo mediante un host raíz | n/a | Fuera de alcance |
| 7 | Catálogo y `globalPages` de extensiones | Frame raíz | No | n/a | `catalog-entity-registry` | n/a | n/a | Fuera de alcance |
| 7b | `clusterPages` de extensiones | Clúster | Quizás, como componentes opacos | Depende de la extensión | Los gestiona la extensión | No | Desconocido | Alto |

Hechos que habilitan la expansión:

- **Remontar no duplica watches.** `KubeWatchApi.subscribeStores` cuenta referencias por store (`renderer/kube-watch-api/kube-watch-api.ts:~97-110`). Mover un panel produce dec/inc; solo hay un refetch si el contador toca 0.
- **Agregar una lista requiere cuatro cambios y ningún componente nuevo:**
  - un `PanelKind` (`split-panel-types.ts`);
  - un ítem de catálogo (`panel-catalog.ts`);
  - un `case` en el resolver (`panel-content-resolver.tsx`);
  - el kind en `globalPanelPolicy.allowedKinds` (`global-panel-store.ts:16`).
- **Además, hay que agregar la ruta a `should-use-global-panel-host.injectable.ts`.** Hoy solo están Pods y Deployments; sin ese cambio, el host desaparece al navegar a la ruta nueva.

## 4. Orden recomendado de incorporación

1. **StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs.** Usan exactamente el patrón de Pods y comparten el watch con conteo de referencias.
2. **Events.** El caso en el resolver ya existe.
3. **ConfigMaps, Secrets, Services, Ingresses, PVCs y Nodes.** Mismo patrón; Nodes suma el polling de métricas.
4. **Details.** Primero hay que desacoplarlo de `?kube-details` y del store de Kubetail.
5. **Logs, luego Terminal.** Antes hay que decidir quién es dueño de la sesión.
6. **Editor.** Antes hay que definir quién es dueño del modelo Monaco y del borrador.
7. **Kubetail.** Conviene mantenerlo separado: ya tiene docking y desacople propios.
8. **Vistas raíz, catálogo y `globalPages`.** Necesitan un host en el frame raíz, que sería otro hito.

## 5. Riesgos de terminal, editor y vistas globales

- **Terminal.**
  - El PTY y el websocket pertenecen a `TerminalStore` por tabId (`renderer/components/dock/terminal/store.ts`) y se destruyen solo con `clearTerminalTabData` al cerrar la pestaña del dock.
  - Un panel del host que referencie un tabId cuya pestaña se cerró se queda sin sesión.
  - `connect` es idempotente, así que no duplica sesiones, pero dos vistas con el mismo tabId se disputarían el único DOM de xterm.
  - La confirmación PROD es por instancia de componente; podría volver a pedirse tras un remount (no verificado en detalle).
  - Decisión necesaria: tabIds propios del host, o transferencia de propiedad reutilizando `detachedTerminalTabs`. Nunca abrir un segundo PTY.
- **Editor.**
  - Sin un `id` estable, `MonacoEditor` crea un modelo nuevo en cada remount y se pierden el borrador y el view state.
  - Dos paneles de la misma pestaña comparten el borrador, pero duplicarían la UI de guardado y de conflicto.
  - No está verificado que los modelos se liberen al cerrar la pestaña.
- **Details.** Hoy sigue el `?kube-details` del frame, así que no puede mostrar objetos distintos en paneles distintos.
- **Vistas globales.** Viven en el frame raíz, con otro contenedor DI y otras rutas. El host del frame de clúster no puede alojarlas sin romper el aislamiento por `clusterId`. Requieren un host raíz propio, sin compartir estado con los hosts de clúster.
- **Estado compartido por URL.** Búsqueda, selección y details son parámetros de URL compartidos. Dos listas visibles comparten el texto de búsqueda y la fila resaltada. Es aceptable para tipos distintos; para dos copias del mismo tipo lo impide `singleInstance: true`.

## 6. Bloqueo y recursos

- **Disco:** 19 GiB libres al inicio y 17 GiB después de la sonda. macOS agregó un swapfile de 2 GiB (swap total 9,2 → 11,2 GiB; usados 9,97).
- **Por qué no hay build:** `open-lens` consume la librería compilada de core; el bundle servido por el dev server sigue sin el fix. Validar en Electron exige un build del renderer de core, y la regla es tener más de 20 GiB libres antes de compilar.
  - La limpieza segura llega como mucho a ~1,5 GiB (cachés de webpack/babel), y no alcanza para pasar de 20 GiB.
  - `open-lens/dist` (774 MB) puede contener un empaquetado del usuario, así que no se tocó.
- **Pendiente:** build del renderer de core → D01–D08 → suite completa (64 + 8), en ese orden, cuando haya más de 20 GiB libres.
- **Procesos:** no queda ningún Electron de QA ni mocks. Los puertos 18443/18444 están libres. El perfil QA está restaurado: la sonda guarda y repone los stores y apaga el flag.
- **Limpieza de la sesión:** se borraron los dos directorios temporales de la sonda (< 1 MB). No se tocaron archivos del usuario, perfiles reales ni kubeconfigs.

## 7. Plan incremental de implementación (H7.6 por etapas)

| Etapa | Contenido | Criterio de salida |
|---|---|---|
| 6.0 | Build del renderer + D01–D08 + suite completa | 72/72 PASS; Disconnect con 0 watches a los 2/5/10/20 s |
| 6.1 | Workloads restantes (StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs): `PanelKind`, catálogo, resolver, `allowedKinds` y gate de rutas | Por kind: montar, mover, replegar y desacoplar sin watch duplicado (contadores) |
| 6.2 | Events + red/config/storage + Nodes | Ídem; Nodes con un solo polling activo por instancia visible |
| 6.3 | Details desacoplado de la URL (prop `selfLink`) y del store de Kubetail | Dos details distintos sin interferir; aislamiento por `clusterId` |
| 6.4 | Decisión de propiedad de sesiones (logs y terminal) y luego su incorporación | Ningún PTY ni stream duplicado; cerrar el panel libera la sesión una sola vez |
| 6.5 | Editor con `id` estable y propiedad del borrador | Remount sin pérdida de borrador |

La persistencia de layouts queda para H7.7. Las vistas raíz requieren un hito propio.
