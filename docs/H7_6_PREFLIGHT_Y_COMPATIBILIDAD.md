# H7.6 — Preflight: ciclo de vida de Disconnect y compatibilidad del docking global

Estado: **H7.6 Preflight PASS.** La corrección de Disconnect está validada en Electron DEV: DC01–DC08 8/8 y la suite completa 72/72. Fase B auditada; no se migró ninguna vista.

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
| Playwright DC01–DC08 (`open-lens/integration/h7-docking-e2e.mjs`) | 8/8 PASS (corrida focalizada `2026-11-03T06-06-35`) |
| Suite completa (64 + 8) | 72/72 PASS (`2026-11-03T06-28-29`) |

Escenarios D agregados. Todos usan clics reales y miden con contadores de la API sintética. Después de Disconnect se exigen 0 watches y 0 frames del clúster en cada muestra.

| ID | Escenario | Muestras |
|---|---|---|
| DC01 | Flag ON, solo Pods (Deployments cerrado con ×) | 2/5/10/20 s |
| DC02 | Flag ON, solo Deployments | 2/5/10/20 s |
| DC03 | Flag ON, ambos paneles | 2/5/10/20 s |
| DC04 | Ventana desacoplada de Pods: se cierra, y su watch también | 2/5/10 s |
| DC05 | Flag OFF (vista clásica) | 2/5/10 s |
| DC06 | Reconexión: exactamente 1 watch de Pods; un segundo Disconnect vuelve a 0 | 2/5 s |
| DC07 | Dos clústeres: desconectar A no cambia los watches ni el frame de B | 2/5/10 s |
| DC08 | Cambio de pestaña A↔B tras reconectar: sin watches duplicados | — |

Sin el fix, la sonda de §1 muestra el patrón que estos escenarios rechazan (watches y proxy nuevos desde t+2 s). Con el fix compilado pasan 8/8 (§6).

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

## 6. Validación definitiva en Electron (2026-11-03)

### Bundle ejecutado

- Core renderer compilado sobre `e2e620b` (fix `1f36511`), con Node 24.22.2:
  `NODE_ENV=development npx webpack --config webpack/library-bundle.ts --config-name lens-app-renderer`.
  Tardó 17,5 s, con 1,45 GB de pico de RSS. Arrojó los 42 errores de tipos que ya existían, sin errores de módulo. Core main no se recompiló.
- `open-lens` resuelve `@openlens/core` por symlink a `packages/core/static/build/library/renderer.js`. El bundle nuevo contiene el fix, y el `lens.js` que sirve el dev server de :9191, el que carga Electron, también lo contiene: se verificó con `curl` y una búsqueda del texto del fix.
- Electron 45.2.0, perfil QA aislado, API sintética A/B.

### Mediciones después del arreglo

Las mediciones de DC01–DC08 se repitieron en la corrida completa con los mismos valores. En todos los escenarios y en cada muestra (t+0, 2, 5, 10, 20, y t+60 en DC01): **0 watches, 0 frames del clúster, 0 proxies nuevos.**

| Escenario | Antes de Disconnect | Después |
|---|---|---|
| DC01: Pods (ON), hasta t+60 | Pods 1, total 3 | 0 en todas las muestras |
| DC02: Deployments (ON) | Deployments 1, Pods 1 (*) | 0 |
| DC03: ambos (ON) | 4 | 0 |
| DC04: ventana desacoplada | ventana + frame | la ventana se cierra; 0 |
| DC05: flag OFF | vista clásica | 0 |
| DC06: reconexión explícita | — | al reconectar, Pods 1 (total 4); un segundo Disconnect vuelve a 0 |
| DC07: A y B | B con 3 watches | A en 0; B 3→3 y su frame intacto |
| DC08: cambio A↔B | A Pods 1, B 3 | A 1→1, B 3→3 |

(*) Con solo Deployments abierto, el watch de Pods sigue abierto porque la lista de Deployments usa el store de Pods. Es un consumidor legítimo.

### Corridas

| Corrida | Resultado | Nota |
|---|---|---|
| `2026-11-03T06-06-35`, `H7_ONLY='^DC0'` | 8/8 PASS | — |
| `2026-11-03T06-14-08`, completa | 71/72 | Falló P14 por un **error del test**: su aserción de H7.5 codificaba el defecto (exigía que el watch del frame sobreviviera a Disconnect, 2→1). Con el fix el resultado es 2→0. Se ajustó la expectativa a 0. |
| `2026-11-03T06-28-29`, completa | **72/72 PASS**, 0 FAIL/SKIP/BLOCKED | P14 da 2→0; 0 escrituras contra Kubernetes (`rejected` a=0, b=0) |

Los errores de consola de las corridas son ruido del entorno DEV: los websockets de HMR de `webpack-dev-server` (`[webpack-dev-server] Event`, `wss://…/ws`). Ninguno sale del flujo de Disconnect.

### Cambios en la suite (sin alterar el comportamiento de los escenarios)

- Los nuevos escenarios se renombraron D01–D08 → **DC01–DC08**, porque D01–D16 ya existían en el docking de H7.2.
- El muestreo ahora es t+0/2/5/10/20, con t+60 en DC01, y sigue los PIDs de `lens-k8s-proxy`. Desde t+2 se exige que no aparezca ningún proxy nuevo.
- `H7_ONLY=<regex>` permite corridas focalizadas. Sin la variable, la suite completa no cambia.
- DC07/DC08 abren el clúster B desde el catálogo si no lo abrió un escenario anterior.

### Recursos

| Momento | Disco libre | Swap (usado / total) | RAM libre |
|---|---|---|---|
| Inicio | 17 GiB (contenedor 18,4 GB) | 9,6 / 11,2 GiB | 42 % |
| Tras la limpieza | 22 GiB (contenedor 23,8 GB) | 9,6 / 11,2 GiB | 39 % |
| Después del build | 22 GiB | 9,9 / 11,2 GiB | 39 % |
| Cierre | 20 GiB | 12,1 / 13,3 GiB | 51 % |

Limpieza aplicada:
- Se borraron 17 índices de `codebase-memory-mcp` de carpetas que ya no existen (~1,16 GiB), y no había ninguno abierto. No liberaron espacio porque el snapshot local de Time Machine retenía sus bloques.
- Se borró ese snapshot (`com.apple.TimeMachine.2026-11-02-203539.local`) **con autorización explícita del usuario**: liberó 5,1 GB. Los respaldos del disco externo no se tocaron.
- `uv cache prune` se colgó esperando un lock y se detuvo.
- No se tocaron `node_modules`, perfiles reales, kubeconfigs, RC3, `open-lens/dist`, Docker, Chrome ni las cachés en uso (`~/.npm/_npx` de los servidores MCP y la caché webpack del dev server).

Durante las corridas macOS agregó dos swapfiles de 1 GiB cada uno. Es el principal riesgo de recursos para las próximas etapas.

### Procesos al cerrar

- No queda ningún Electron de QA, mocks ni listeners en 18443/18444.
- Se cerró un `lens-k8s-proxy` huérfano del binario del repo (ppid 1, iniciado el 2/11 a las 11:56 en una sesión QA anterior). Solo escuchaba en un puerto local, sin conexiones hacia afuera.
- El único `lens-k8s-proxy` que queda pertenece al Lens instalado del usuario.
- El dev server de :9191, que ya existía, sigue corriendo.

### Riesgos pendientes

- **Recuperación de vistas con el clúster conectado:** la protege solo el test unitario; no hay un escenario e2e que provoque esa pérdida de vista.
- **Disconnect desde otros puntos** (hotbar, catálogo) usa el mismo `disconnect()` y la misma reaction, pero se validó solo desde el menú del sidebar.
- **Disco y swap:** el margen quedó justo en 20 GiB al cierre.

## 7. Plan incremental de implementación (H7.6 por etapas)

| Etapa | Contenido | Criterio de salida |
|---|---|---|
| 6.0 | Build del renderer + DC01–DC08 + suite completa | **Hecho**: 72/72 PASS |
| 6.1 | Workloads restantes (StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs): `PanelKind`, catálogo, resolver, `allowedKinds` y gate de rutas | Por kind: montar, mover, replegar y desacoplar sin watch duplicado (contadores) |
| 6.2 | Events + red/config/storage + Nodes | Ídem; Nodes con un solo polling activo por instancia visible |
| 6.3 | Details desacoplado de la URL (prop `selfLink`) y del store de Kubetail | Dos details distintos sin interferir; aislamiento por `clusterId` |
| 6.4 | Decisión de propiedad de sesiones (logs y terminal) y luego su incorporación | Ningún PTY ni stream duplicado; cerrar el panel libera la sesión una sola vez |
| 6.5 | Editor con `id` estable y propiedad del borrador | Remount sin pérdida de borrador |

La persistencia de layouts queda para H7.7. Las vistas raíz requieren un hito propio.
