# H7.6.3 — Docking de componentes con estado

**Estado:** PARTIAL por diseño — piloto Details PASS (111/111); Terminal, Editor, Logs y Kubetail planificados pero no habilitados (sus invariantes todavía no están demostrados). · **Rama:** `feature/global-docking-h7` · **Base:** `a4e4d14` · **Fecha:** 2026-11-03

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
