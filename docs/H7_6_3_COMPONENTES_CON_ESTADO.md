# H7.6.3 — Docking de componentes con estado

**Estado:** PARTIAL por diseño — piloto Details PASS; **Logs (H7.6.3B) PASS** (LG01–LG10, regresión 121/121); Terminal, Editor y Kubetail planificados pero no habilitados (sus invariantes todavía no están demostrados). · **Rama:** `feature/global-docking-h7` · **Base:** `a4e4d14` · **Fecha:** 2026-11-03 **Editor Monaco (H7.6.3C) PASS** (ED01–ED12; regresión 134 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED).

Este hito tiene tres partes:

1. **Contratos de propiedad del estado** para Details, Terminal, Editor, Logs y Kubetail.
2. **Piloto de Resource Details** implementado y validado en Electron.
3. **Plan** para Terminal, Editor, Logs y Kubetail.

Terminal, Editor, Logs y Kubetail **siguen fuera** del host, como pide la regla de no habilitarlos antes de demostrar sus invariantes.

## 1. Hecho base del motor

**Mover un panel (arrastre, pestaña o replegado) desmonta y vuelve a montar su subárbol React.** Las pestañas inactivas y los paneles replegados no se renderizan. Por eso, todo estado que deba sobrevivir a un movimiento tiene que vivir fuera del componente React, en un store indexado por una identidad estable.

## 2. Matriz de propietarios de estado

Rutas relativas a `packages/core/src/`. La auditoría la hizo un explorador de solo lectura, y una de sus afirmaciones se verificó por muestreo: `dock/logs/view.tsx` vuelve a cargar los logs en cada montaje.

| | Terminal (Dock) | Editor YAML (Monaco) | Logs (Dock) | Kubetail | Resource Details (piloto) |
|---|---|---|---|---|---|
| **Crea** | PTY en Main (`main/shell-session/shell-session.ts:150-166`); xterm y WebSocket en `TerminalStore.connect` (`dock/terminal/store.ts:34-51`) | Modelo `getModel(uri) ?? createModel` (`monaco-editor/monaco-editor.tsx:97-115`); datos en `EditResourceModel` (keyedSingleton por `tabId`) | Refresher por polling en `LogStore.load` (`dock/logs/store.ts:118,172-175`) | `KubetailStore` arranca streams con `AbortController` (`kubetail-stream-client.injectable.ts:59-76`) | Nada: es una vista |
| **Identidad** | PTY: `${clusterId}:${tabId}` en Main (`shell-session.ts:173`); xterm/conexión por `tabId` | URI `/monaco-editor/${tabId}`; borrador persistido en `EditResourceTabStore` | Mapas por `tabId` (`store.ts:35-41`) | Store singleton por frame; streams por pod/contenedor (`kubetail-store.ts:76-80`) | **Descriptor por leaf**: `resourceBinding` {clusterId, apiVersion, kind, namespace, name, uid} |
| **Desmontaje** | Solo `terminal.detach()`; el xterm pasa a un nodo oculto (`terminal/view.tsx:133-135`) | Guarda el viewState y desecha el *editor*, **no el modelo** (`monaco-editor.tsx:196-204`) | `stopLoadingLogs()` (`logs/view.tsx:79-82`) | El panel registrado preserva los streams (`kubetail-page.tsx:788-790`) | Libera su suscripción (contador de referencias) |
| **Cambio de pestaña** | = desmontaje (sobrevive) | = desmontaje (sobrevive) | Detiene el polling | Sobrevive | Libera y reabre una vez |
| **Movimiento** | Reutiliza el PTY y el scrollback (`store.ts:35`, `view.tsx:80-89`) | Mismo modelo; undo/redo intactos | ⚠️ `reloadLogs()` en cada montaje borra historial, pausa y scroll (`logs/view.tsx:71`, `store.ts:369-385`) | Sobrevive | Misma identidad (DT03) |
| **Replegado** | = desmontaje | = desmontaje | Detiene el polling | ⚠️ Sigue haciendo stream: los hooks `onStreamStop/ResumeRequested` solo están conectados en tests | Libera el watch (DT04) |
| **Cierre** | `closeTab` → `terminalStore.destroy` → Main mata el PTY (`shell-session.ts:306-321`) | `clearData` del borrador; ⚠️ el modelo Monaco nunca se desecha (fuga) | `clearLogs` | Depende del desmontaje de la página | Se quita el leaf y se libera la suscripción |
| **Disconnect** | Main mata el PTY si el clúster está desconectado (`shell-session.ts:312`) | Se destruye el frame; el borrador sobrevive en storage; se pierde undo | Se destruye el frame | Se destruye el frame | 0 watches, 0 proxies (DT08) |
| **Conservar** | xterm, socket, PTY y confirmación PROD | Modelo, viewState y borrador | Historial, pausa y anclaje de scroll | Streams y buffer en el store | Solo el descriptor |
| **Compartir con Kubetail** | No aplica (`terminal` del split-panel es un placeholder) | No hay renderer `resource-editor` | Stores separados | Singleton: un segundo panel no duplica streams, pero comparte la selección | Kubetail sigue con su panel propio (`ResourceDetailsPanelContent`) |

## 3. Contrato de paneles con estado

Reglas que cumple el piloto y que deberá cumplir cada componente nuevo:

1. **Identidad estable en el leaf, nunca en la ruta.** El leaf conserva `id` y `resourceBinding` en cada operación de docking: `dockPanel`, colapso, restauración, pestañas y navegación. Los tests lo prueban explícitamente.
2. **Un único propietario de la sesión, fuera de React.** El componente es solo una vista. La sesión (PTY, modelo, stream) la posee un store keyed por la identidad y se libera **solo** en el cierre explícito o en Disconnect.
3. **Una sola instancia por identidad.** Abrir de nuevo la misma identidad revela el panel existente (lo restaura o activa su pestaña) y no lo duplica (`openDetailsPanel`).
4. **El `clusterId` viaja en el descriptor y se valida al renderizar.** Un panel ligado a otro clúster no renderiza ni se suscribe. `dockPanel` ya rechaza movimientos entre clústeres.
5. **Mover no ejecuta ninguna acción Kubernetes.** Solo hay suscripciones (lecturas), con contador de referencias.
6. **Modo clásico intacto.** Con el flag apagado no aparece ninguna entrada nueva (DT07).

El motor se extendió solo lo necesario:
- `SplitPanelStore.insertLeaf`, extraído de `addPanel` sin cambiar su comportamiento.
- `PanelContentResolver` recibe el `resourceBinding` del leaf.
- `PanelResourceBinding.clusterId`, un campo opcional nuevo.

No se reescribió `SplitPanelStore` ni `DynamicLayoutRenderer`.

## 4. Piloto: Resource Details

| Pieza | Archivo | Función |
|---|---|---|
| Descriptor | `split-panel-types.ts` (`PanelResourceBinding` + `clusterId`) | Identidad independiente de la ruta |
| Apertura | `global-panel-store.ts` (`openDetailsPanel`) | Un panel por recurso; revela si ya existe |
| Vista | `bound-resource-details.tsx` | Reutiliza `DetailsHeader`, `KubeObjectMenu` y los ítems de detalle registrados. No duplica el inspector |
| Entrada | `dock-details-menu-item.tsx` en `KubeObjectMenu` | "Details (docked)" en el menú ⋮ de cualquier recurso, solo con el host renderizado |

**Decisiones:**

- **Fuera del catálogo:** Details no aparece en el catálogo, porque sin un recurso no tiene identidad. Se abre desde el recurso.
- **Watch compartido:** si el namespace del recurso está cubierto por el filtro de namespaces, la vista se suscribe **sin** namespaces explícitos. Así `KubeWatchApi` comparte el watch con la lista del mismo tipo (`kube-watch-api.ts`, `isNamespaceFilterWatch`). Si no está cubierto, observa solo ese namespace.
  - La primera versión pasaba el namespace explícito y abría un **segundo watch**. Playwright lo detectó (DT01, DT04, DT06), y se corrigió antes del commit.
- **Kubetail sin cambios:** sigue usando su `ResourceDetailsPanelContent`. El host solo usa la vista ligada cuando el leaf tiene un descriptor.

## 5. Plan para los componentes con sesión

Ninguno está habilitado en el catálogo.

### Terminal
- **Hoy:** el PTY ya sobrevive al desmontaje. Vive en Main con la clave `${clusterId}:${tabId}`, y la vista solo hace `detach` del xterm.
- **Integración:** el leaf guarda el `tabId` de una pestaña del Dock y el panel renderiza `TerminalWindow` con esa pestaña. No se crea un segundo `TerminalStore`. Cerrar el panel pasa por `dockStore.closeTab`, que libera el PTY exactamente una vez.
- **Bloqueante previo:** `isProdConfirmed` es estado del componente. En un clúster PROD, mover el panel volvería a pedir la confirmación y dejaría el terminal desacoplado. Hay que llevarlo a un store keyed por `tabId`.
- **Prueba de transferencia:** un PTY local controlado (un shell sintético, sin clúster real). Escribir una secuencia, mover el panel N veces y comprobar que es el mismo PID, que el scrollback está intacto y que al cerrar el PID termina una vez.

### Editor YAML
- **Hoy:** el modelo Monaco sobrevive (URI por `tabId`) junto con undo/redo y el borrador persistido.
- **Integración:** el leaf guarda el `tabId` y el editor recibe `id={tabId}`, **nunca** el id del leaf, que es aleatorio y crearía un modelo nuevo.
- **Bloqueante previo:** el modelo nunca se desecha al cerrar (fuga). Hay que agregar `getModel(uri)?.dispose()` en los *clearers* de las pestañas edit y create.
- **Protección del cierre:** reutilizar la confirmación existente del Dock para cambios sin guardar.
- **Kubernetes:** el guardado contra Kubernetes (`requestPatch/ReplaceKubeResource`) queda **solo** en la acción explícita *Save*. Ninguna operación de docking lo invoca.
- **Prueba:** un documento sintético, editado sin guardar. Verificar texto, indicador dirty y undo/redo antes y después de mover, con el contador de escrituras del mock en 0.

### Logs
- **Bloqueante:** `logs/view.tsx:71` vuelve a cargar en cada montaje y borra el historial.
- **Cambio mínimo:** si `areLogsPresent(tabId)`, solo reanudar el polling. Opcional: llevar el anclaje de scroll y el follow al store.
- **Prueba:** un stream sintético numerado en el mock. Verificar continuidad, ausencia de duplicados, follow y liberación.

### Kubetail
- **Regla:** no se integra envolviendo su página. Su store singleton ya es el único dueño de los streams.
- **Bloqueante previo:** conectar `onStreamStopRequested` / `onStreamResumeRequested` en la construcción de producción, para que replegar pause los streams. Hoy siguen activos.
- **Bloqueante de diseño:** dos vistas comparten un mismo `selectedResource`, así que no pueden mostrar objetivos distintos. Se necesita un descriptor por leaf (pod/selector) antes de alojarlo.

## 6. Ventanas desacopladas

No hubo cambios. Details no usa las ventanas H7.5 nuevas: la opción existente "Inspect (detached)" sigue disponible por separado, con sandbox y `contextIsolation` intactos.

## 7. Relación con H7.7 (persistencia)

El descriptor por leaf es serializable (strings), así que H7.7 puede persistir los paneles de Details por clúster sin tocar la ruta.

Las sesiones (PTY, modelo Monaco, streams) **no** se persisten. H7.7 solo debe guardar las identidades: `tabId` y descriptores. Al restaurar, cada panel reabre su sesión con el mecanismo del Dock, o queda con un estado "sesión no disponible" explícito.

## 8. Pruebas

### Unitarias

`details-pilot-h7-6-3.test.tsx` (10 tests):
- Una identidad por recurso.
- Identidad intacta en los 5 movimientos, colapso, restauración y navegación.
- Revelar en lugar de duplicar.
- Reabrir.
- Fuera del catálogo.
- Kubetail sin cambios.
- Watch compartido cuando el namespace está cubierto y propio cuando no.
- Otro clúster: no renderiza ni se suscribe.
- Resolver dentro del host.

**Chequeo de mutación:** al desactivar la lógica de identidad y la vista ligada, fallan 3 tests.

La batería focalizada (global-docking, split-panel, kube-object-menu y prometheus) da **24 suites y 253 tests en verde**.

### Playwright (bloque DT)

| ID | Escenario | Verifica |
|---|---|---|
| DT01 | Abrir Details desde la fila de un Pod (menú ⋮) | Panel junto a Pods/Deployments; identidad `Pod/h7-synthetic/h7-pod-0@A`; watch de Pods compartido (1) |
| DT02 | Recursos distintos | 2 paneles con identidades distintas; reabrir el mismo Pod no duplica |
| DT03 | 4 lados y pestaña | Indicador y geometría; identidad intacta después de cada movimiento |
| DT04 | Replegar y restaurar | Deployment: el watch compartido baja a 0 solo sin consumidores; al restaurar se reabre exactamente una vez |
| DT05 | Cambio de ruta | Deployments, Services, Nodes y Pods sin cambiar la identidad |
| DT06 | Cerrar y reabrir | Sin banda de restauración; reabre la misma identidad; watch sin duplicar |
| DT07 | Flag apagado | El menú clásico no ofrece "Details (docked)" |
| DT08 | Disconnect con 2 Details | 0 watches, 0 iframes y 0 proxies nuevos hasta t+20 s; 0 escrituras |

**Corridas:**

| Corrida | Resultado |
|---|---|
| DT01–DT08 (1.ª) | 5/3 (watch privado de Details) |
| DT01–DT08 tras la corrección | 7/1 (DT04: expectativa del test) |
| DT04 aislado, reescrito | PASS |
| **Completa `2026-11-03T12-51-05`** | **111 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED** |

- **Corrida completa:** 0 escrituras rechazadas (A 0, B 0); 212 errores de consola, todos de HMR del dev server, 0 propios.
- **Evidencia:** `docs/evidence/h7-6-3/dt01-pod-details.jpg` y `dt03-details-tab.jpg`.
- **Artefactos completos:** `qa-artifacts/h7-playwright/2026-11-03T12-51-05/`.

**Hallazgos:**
- **Watch privado (código):** la primera corrida dio 5/3 por el watch privado y se corrigió.
- **DT04 (test):** el watch de Pods queda en 1 con **todos** los paneles replegados y sin Details. Es un consumidor del frame entero, comprobado con una sonda temporal que se descartó. Por eso DT04 se basa en un Deployment.

## 9. Componentes

| Componente | Estado |
|---|---|
| Resource Details (ligado a un recurso) | ✅ Habilitado, desde el menú del recurso |
| Terminal | ⛔ Excluido: falta mover la confirmación PROD a un store y la prueba con PTY |
| Editor YAML | ⛔ Excluido: falta desechar el modelo al cerrar y la prueba de borrador |
| Logs | ⛔ Excluido: `reloadLogs` en cada montaje borra el historial |
| Kubetail | ⛔ Excluido: pausa al replegar no conectada; selección compartida |

## 10. Recursos

| Momento | Disco libre | Swap usado / total | RAM libre |
|---|---|---|---|
| Inicio | 22,1 GiB | 8,6 / 10 GiB | 38 % |
| Antes de la regresión | 20,8 GiB | 10,1 / 11 GiB | — |
| Cierre | 19,8 GiB | 11,6 / 12 GiB | 53 % |

- **Compilaciones del renderer:** dos, una a la vez, de 17–20 s y 1,3–1,4 GB de RSS. Una dio 43 errores TS por un tipo en el test nuevo, que se corrigió. Ya no existe en la segunda, que volvió a los 42 errores que ya existían.
- **Main:** no se recompiló, porque no cambió.
- **Electron:** una instancia de QA a la vez.
- **Disco al cierre:** 19,8 GiB, por debajo del umbral de 20 GiB para compilar. macOS sumó un swapfile de 1 GiB durante la regresión. La próxima compilación requiere liberar espacio primero; no hay más compilaciones pendientes en este hito.
- **Incidente corregido:** un `rm` con comodín borró dos evidencias versionadas de H7.4 (`settings-production.jpg` y `settings-teal.jpg`). Se restauraron con `git checkout` antes de cualquier commit; ningún commit las elimina.

## 11. H7.6.3B — Logs de Pod en el docking global

**Estado: PASS.** Jest 167/167 (19 suites de `dock/logs` + `global-docking`), Playwright LG01–LG10 y regresión completa **121 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED**, 0 escrituras Kubernetes en A y B.

### 11.1 Auditoría original
Cada montaje de `LogsDockTab` llamaba `reloadLogs()` → `LogStore.reload()` → `clearLogs()`. El cleanup detiene bien el polling, pero mover, agrupar, replegar o cambiar de pestaña desmonta y remonta la vista, así que el historial, la pausa y el scroll se perdían.

### 11.2 Trabajo recuperado de Gemini y correcciones
Gemini dejó 8 archivos modificados y 4 nuevos sin commit. Se **aprovechó** el descriptor `LogsDescriptor`/`openLogsPanel`, la separación `resumeLoading`/`reload`, `canResume`, el rechazo de clúster ajeno en `BoundPodLogs` y el tipo `pod-logs`. Se **corrigió**:

| Defecto | Corrección |
|---|---|
| La sesión se registraba leyendo los datos de la pestaña antes del `await`; `BoundPodLogs` los escribía tarde y la primera sesión nunca quedaba registrada (el primer remount borraba el historial) | Se relee tras el `await`; `useLayoutEffect` para que los datos existan antes del efecto de `LogsDockTab` |
| `canResume` ignoraba `showPrevious`, `tailLines` y `sinceSeconds` | Clave de sesión `[pod, namespace, contenedor, showPrevious, tailLines, sinceSeconds]` |
| `logs-view-model.injectable.ts` usaba `logStoreInjectable` sin importarlo | Import y store inyectado una vez |
| Solo se guardaba un booleano de follow; la lista volvía al tope | Estado de vista `{follow, offset}`: se guarda al desmontar y se restaura al montar |
| `tabId` `log-tab-<pod>-<contenedor>` colisionaba entre namespaces | `docked-logs:<clúster>:<ns>:<uid>:<contenedor>` |
| Nada abría el panel | `Logs (docked)` por contenedor en el menú ⋮ del Pod (solo con el host activo) |
| Sin liberación al cerrar | Gancho opcional `onPanelClosed` en `SplitPanelStore.closePanel` (solo cierre explícito; `onStreamStopRequested` también se dispara al podar o desacoplar) |
| La lista medía 0 px de alto dentro del panel | `className="box grow"` en `LogsDockTab` y `minHeight: 0` (detectado por Playwright) |
| Tests de Gemini pasaban incluso con el defecto | Reescritos; verificados con mutantes |

### 11.3 Arquitectura final
- **Dueño del estado:** `LogStore` (por frame de clúster), indexado por `tabId`: buffer, pausa, clave de sesión y estado de vista. El panel solo guarda la identidad (`resourceBinding` con `clusterId`, uid, contenedor, `tabId`).
- **Mover / agrupar / replegar:** se detiene el timer; buffer, sesión y vista se conservan. Al volver, `resumeLoading` reanuda con `sinceTime` y deduplica con `mergeLogLines` (sin `tail` nuevo). Si la clave de sesión cambió, hace un `reload` limpio.
- **Cerrar:** `clearLogTabData` libera buffer, timer, pausa, vista y datos de la pestaña.
- **Disconnect:** el frame del clúster desaparece; LG10 comprueba 0 watches, 0 frames, sin proxy nuevo y sin peticiones de logs posteriores.
- **Pausa:** se mantiene tras el remount; las líneas nuevas se acumulan en `pendingLogs` hasta Resume.
- **Tope:** 10.000 líneas, con contador de truncado acumulado.

### 11.4 Resultados
- **Unit:** 14 tests del store, 9 del panel; mutantes 9/9 detectados. Dock clásico: las suites de logs existentes siguen verdes.
- **Compilación:** renderer 42 errores TS, todos históricos (en la primera pasada aparecieron 2 nuevos, mocks de test que no incluían las dependencias nuevas del view-model; corregidos).
- **Playwright LG01–LG10:** abrir; líneas numeradas consecutivas desde la API sintética; arrastre a 4 lados sin `tail` extra; agrupar; 3 idas y vueltas de pestaña sin recarga; replegar (0 peticiones en 25 s) y restaurar recuperando las líneas perdidas; follow sin duplicados y posición de lectura restaurada; cerrar libera el polling y reabrir crea una sesión nueva; contenedores y clústeres sin mezclar; Disconnect sin actividad huérfana.
- **Ajustes de test (no de producto):** P01 espera ahora `2/2` (el Pod sintético tiene un contenedor `sidecar`); LG07 mide el `scrollTop` real y espera el temporizador de auto-scroll de Lens; LG09 activa el clúster B con `connect()`.
- **Regresión completa:** 121 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED; 237 errores de consola (HMR/históricos); la corrida sobrescribe evidencia versionada de hitos anteriores, que se restauró desde Git.

### 11.5 Recursos
Disco 21,7 → 20,0 GiB (4 compilaciones/regresiones secuenciales), swap 10,5 → 9,6/11 GiB, RAM ~50 % libre. Se detuvo el `npm run dev:renderer` obsoleto de este repo (puerto 9191, 26 h). Sin Electron de QA ni puertos 18443/18444 abiertos al terminar.

### 11.6 Limitaciones
- El follow se decide por la posición real de scroll; con líneas llegando exactamente mientras se desmonta, la restauración usa el último estado guardado.
- Logs en ventanas desacopladas y persistencia entre sesiones (H7.7) siguen fuera.
- Terminal, Editor y Kubetail: sin cambios respecto de las secciones anteriores.

## 12. H7.6.3C — Editor Monaco

### Identidad
Cada documento del Editor tiene una identidad estable `docked-edit:<clusterId>:<selfLink>` (`dockedEditorTabId`), guardada en `resourceBinding.tabId`. No es el id aleatorio del panel ni se regenera al remontar. Dos documentos o dos clústeres nunca comparten identidad. Abrir el mismo documento otra vez revela el panel existente.

### Quién guarda qué
| Elemento | Dueño | Clave |
|---|---|---|
| Texto, undo/redo, markers | `ITextModel` de Monaco | URI `/monaco-editor/<tabId>` |
| Borrador y `firstDraft` | `EditResourceTabStore` | `<tabId>` |
| Estado sucio, guardado | `EditResourceModel` (singleton keyed) | `<tabId>` |
| Cursor y scroll | `monacoViewStates` (por `model.uri`) | modelo |

Mover, colapsar o cambiar de pestaña desmonta y remonta la vista, pero los tres dueños sobreviven: no se crea un modelo nuevo ni se recarga el recurso.

### Cierre y liberación
- El cierre iniciado por el usuario pasa por `SplitPanelStore.requestClosePanel`, que espera `confirmPanelClose`. Para un Editor con cambios sin guardar abre el diálogo "Discard Changes / Keep Editing". Cancelar no libera nada.
- Sólo un cierre confirmado dispara `onPanelClosed`, que limpia el borrador y llama `releaseMonacoModels(tabId)`.
- `releaseMonacoModels` no hace `dispose()` mientras un editor (normal o diff) siga mostrando el modelo: lo deja pendiente y lo completa en el desmontaje (`flushMonacoRelease`). También cubre el modelo `-diff-original`.
- Esto además cierra la fuga que ya tenía el Dock clásico: `closeTab` nunca liberaba el modelo.
- Si el `EditResourceModel` quedó vivo de una sesión liberada, `BoundEditor` lo recarga (GET) al reabrir; no se reutiliza estado liberado.
- `InfoPanel` acepta `onClose`: en un panel docked, Cancel y "Save & Close" cierran por el host (con confirmación), no por `dockStore.closeTab`.
- Los dos caminos de cierre del header (`dynamic-layout-renderer`) usan `requestClosePanel`. Uno de ellos llamaba `closePanel` directo y cerraba un Editor sucio sin preguntar; lo detectó ED08.

### Kubernetes
Abrir, editar, mover, colapsar, deshacer, cancelar y descartar sólo hacen GET. La API sintética rechaza y cuenta todo método distinto de GET: `rejected` = 0 en todas las pruebas. No se probó Save.

### Pruebas
- Unit: `release-monaco-models.test.ts` (5), `editor-h7-6-3c.test.ts` (10). Mutante del veto detectado. Suites vecinas: 55 suites / 484 tests PASS.
- Playwright (mouse y teclado reales): ED01–ED12 PASS. Regresión completa: **134 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED**.
- Hallazgos de producto corregidos con Playwright: el editor no tenía altura dentro del panel (`EditResource` sin `flex:1`) y el cierre del header saltaba el veto.

### Limitaciones
- Monaco no está expuesto en `window`, así que E2E no cuenta modelos vivos. La liberación se prueba por caja negra (reabrir: no vuelve ni texto ni undo) y en unit con un registro de modelos.
- En paneles angostos o bajos la barra de herramientas del editor ocupa mucho alto y deja poca área de edición (comportamiento del editor original, no se rediseñó).
- Save no se ejercitó contra la API sintética.
- No hay detach nativo del Editor.

## 13. H7.6.3D — Terminal y sesiones PTY

### Arquitectura
- No hay un segundo gestor de PTY. El PTY sigue siendo propiedad de Main (`shellSessionProcesses`, clave `<clusterId>:<tabId>`) y la vista/websocket/xterm siguen en el `TerminalStore` del renderer (por frame).
- `BoundTerminal` reutiliza el `TerminalWindow` original con una pestaña sintética. Una sesión se identifica por `resourceBinding.tabId = docked-terminal:<clusterId>:<uuid>`, creado **solo** por la acción explícita "Terminal" del catálogo (nunca por navegación; `terminal` no es un `GlobalPanelKind` de ruta).
- Mover, colapsar o cambiar de pestaña desmonta/monta la vista sobre la misma entrada del `TerminalStore` (mismo websocket, mismo xterm, mismo PTY). `Terminal.detach/attachTo` ya movía el único elemento xterm.
- Un panel con `clusterId` distinto al del host muestra "belongs to another cluster" y no adopta la sesión.

### PROD
- `TerminalProdAuthorization` (store fuera de React) guarda autorizaciones por `(clusterId, tabId)`. `TerminalWindow` ya no tiene `isProdConfirmed` de instancia: un remount no vuelve a preguntar y otra pestaña/clúster nunca hereda la autorización (el Dock clásico sí compartía el flag entre pestañas: corregido).
- Defensa en profundidad: `TerminalStore.connect` rechaza (sin crear API ni PTY) una sesión de clúster PROD sin autorización (`isConnectAllowed`). Cerrar la sesión revoca la autorización (`clearTerminalTabData`).
- Arrastrar, colapsar o escribir no autoriza (TM11).

### Ciclo de vida
- Cierre explícito: `confirmPanelClose` pregunta solo si hay un shell vivo; `onPanelClosed` destruye la sesión una sola vez y revoca la autorización. Un cierre vetado no toca la sesión. Salida limpia del shell (`exit`) cierra el panel sin preguntar (igual que el Dock clásico).
- Disconnect: el PTY queda liberado (TM12 verifica el pid y los hijos de Main). 
- Resize: `Terminal.fit` ignora hosts de tamaño 0 o el pool, para que un panel colapsado no empuje 2×1 al PTY; `BoundTerminal` refitea con `ResizeObserver`.

### Verificación
- Unit: 4 archivos nuevos + gate existente (PROD gate r4-04, r5-07f) en verde; build del renderer en la línea base (42 errores TS preexistentes, ninguno nuevo).
- Playwright (Electron DEV, perfil QA aislado, shell real, clúster sintético): TM01–TM12 PASS; regresión completa **146 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED**. Continuidad medida por pid/ppid del PTY, ticker numerado sin duplicados, buffer real de xterm y entrada tecleada.
- Los escenarios D13/WL06/RN07 cuentan solo vistas: la tarjeta "Terminal" (ahora disponible) se excluye del helper de catálogo.

### Limitaciones
- La autorización PROD es del propietario de la vista (renderer) + puerta en `TerminalStore.connect`; Main no valida PROD para shells locales/pod (solo el node shell tiene grant en Main). Queda como deuda para H7.7.
- Sin detach nativo de la Terminal en H7.6.3D. Sin persistencia del layout entre reinicios.
