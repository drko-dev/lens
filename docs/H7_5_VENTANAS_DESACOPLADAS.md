# H7.5 — Ventanas nativas desacopladas

**Fecha:** 2026-11-03 · **Rama:** `feature/global-docking-h7` · **Base:** `8fc5580` · **Estado:** PASS definitivo (Electron DEV 45.2.0, suite Playwright H7: 64/64 con el arreglo A1 incluido en el bundle de main)

## 1. Decisión de arquitectura (opción A, aprobada)

La auditoría (fase A) mostró dos tipos de ventanas en OpenLens:

| | Ventanas desacopladas existentes (logs, inspector, terminal) | Ventana principal y frames de clúster |
|---|---|---|
| Contenido | `file://…/static/detached-tool.html`, ~100 líneas de JS sin React | React, stores y `KubeApi` |
| Seguridad | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, CSP `default-src 'none'`, navegación bloqueada | `nodeIntegration: true`, `contextIsolation: false` (`create-electron-window.injectable.ts:88-90`) |
| Datos de Kubernetes | Los pide **main** y los envía a la ventana | El renderer mediante `KubeApi` |

Mostrar la vista real de Pods/Deployments en otra ventana exigiría una ventana nueva con Node habilitado y sin `contextIsolation`. **Se eligió la opción A:**
- se extiende el administrador existente con un tipo nuevo, `resource-list`;
- la ventana muestra una tabla de solo lectura, alimentada en vivo por main mediante LIST + WATCH.

No hay un segundo administrador de ventanas ni se relajó la seguridad.

**Evolución futura, no implementada:** ventanas con un frame de clúster completo, que darían la vista entera con acciones. Requieren una revisión de seguridad independiente, porque implican Node en la ventana, una sesión, el registro en `clusterFrames` y la apertura de navegación.

## 2. Arquitectura e IPC

```
frame del clúster (GlobalPanelHost)          main                                          ventana sandbox
──────────────────────────────────────       ───────────────────────────────────────       ─────────────────────────
botón "Open in a separate window"
 └ store.detachPanel(leaf, {namespace})
    └ invoke detached-tool:request-detach ─► DetachedToolSessionManager.handleDetach
       {clusterId, workspaceId:              · emisor = frame registrado de ESE clúster
        "global-docking", tabId:"pods",      · valida la forma (kind Pod|Deployment, namespace)
        toolKind:"resource-list",            · color y entorno leídos en main
        list:{kind:"Pod", namespace}}        · registry: un dueño por sessionKey; si existe,
                                               restaura y enfoca
                                              BrowserWindow sandbox ──────────────────────► getContext() (descriptor inmutable)
                                              runList: LIST → WATCH (kube-auth-proxy)  ◄──── start()
                                                 eventos → filas proyectadas ────────────► tabla (solo textContent)
◄─ detached-tool:redocked ─────────────────── al cerrar (Redock, botón del SO o crash):
   onPanelRedocked → vuelve a montar la vista  abort() del watch + aviso al frame de origen
```

- **Canales:** se reutilizan los existentes: `request-detach`, `frame-request-redock`, `redocked`, `get-context`, `start` y `request-redock`. No se agregaron canales ni API al preload.
- **Contrato tipado** (`common/detached-tools/detached-tool-channels.ts`): `DetachedListSpec` (`kind: "Pod" | "Deployment"` y `namespace?`) y `DetachedListRow` (`name`, `namespace`, `status`, `ready`, `createdAt`).
- **Proyección:** `toListRow` arma las filas en main. La ventana nunca recibe `spec`, `env`, anotaciones ni el objeto completo; un test verifica que una variable `TOKEN` no aparece en lo enviado.
- **Watch:** `openApiStream`, el mismo camino directo al kube-auth-proxy que ya usaban los logs (`openLogStream` ahora lo reutiliza). Al destruir la respuesta se cierra la conexión con el servidor.
- **Reconexión:** si el watch termina o falla, main vuelve a hacer LIST + WATCH cada 2 s hasta que se cierre la sesión.

## 3. Modelo de propiedad y ciclo de vida

| Estado conceptual | Representación real |
|---|---|
| `DOCKED` | Hoja del layout con su vista montada |
| `DETACHING` | `isDetaching` en `CompactLeafPanel`: el botón queda deshabilitado mientras main responde |
| `DETACHED` | `detachedPanels` tiene el `windowId` confirmado por main. La vista queda **desmontada** y se muestra un placeholder con "Show window" y "Redock here" |
| `REDOCKING` | Aviso `redocked` de main, o `redockPanel` → `frame-request-redock` |
| `CLOSED` | `closePanel`. Si el panel estaba desacoplado, primero se cierra su ventana |

**Invariantes verificados:**
- La identidad (`tabId` = tipo del panel, que es único por clúster; `clusterId`; `workspaceId` = `global-docking`) es inmutable en main.
- Desacoplar dos veces devuelve `reused: true` y main enfoca y restaura la misma ventana (P08, P12).
- El panel solo se marca como desacoplado cuando main confirma el `windowId`. Si main falla, el panel sigue acoplado y se muestra el error (P13).
- Nunca hay dos representaciones activas: mientras está desacoplado, la vista de origen está desmontada (P03).

## 4. Seguridad por clúster

- `assertToolActionClusterContext` exige que el `clusterId` del pedido coincida con el frame que lo envía. Desde el clúster B no se puede crear ni reacoplar una ventana del clúster A (P15: «Operation aborted to prevent cross-cluster contamination»).
- El entorno y el color se leen en main y nunca vienen del renderer. Un clúster PROD muestra el banner «PRODUCTION CLUSTER», el badge `PROD` y el título con el prefijo `[PRODUCTION]` (P15).
- El aviso de reacople se envía solo al frame de ese clúster, y el store ignora avisos de otro clúster o de otro tipo (test unitario).
- No hay escrituras: la API sintética registró 0 operaciones rechazadas en las dos API.

## 5. Manejo de errores y políticas

| Caso | Comportamiento |
|---|---|
| Main rechaza la apertura (límite, flag, validación) | El panel sigue acoplado y muestra un `role="alert"` con el motivo. Se puede reintentar (P13) |
| El watch se corta | Estado `reconnecting` en la ventana y nuevo LIST + WATCH |
| Se cierra la pestaña del workspace de origen | El frame sigue vivo (`closeTab` solo oculta la pestaña). La ventana conserva su clúster, y al reacoplarla vuelve al layout del frame (P14) |
| El frame del clúster desaparece (Disconnect o borrado) | Main cierra las ventanas `resource-list` de ese clúster (`observe(clusterFrames)`), cuyos watches se cancelan. No se crea ningún workspace de otro clúster |
| Ventana minimizada | "Show window" vuelve a pedirla a main, que la restaura y la enfoca (P12) |

## 6. Kubernetes: montajes y watches

- Cada ventana es dueña de **un** watch en main. Al cerrarla se ejecuta `abort()` y se destruye el stream (test unitario y P06/P07).
- P03: con los dos paneles desacoplados no hay ninguna vista de lista montada en el frame. Los watches valen la línea base del frame sin vistas (Pods 1, Deployments 0) más uno por ventana.
- P08: 10 ciclos de desacople y reacople.
  - Ventanas: 1 → 1. Procesos Electron: 4 → 4.
  - RSS de main: 218 → 210 MB, sin crecimiento.
  - Deployments abiertos: siempre 1.
  - 0 errores de consola de la aplicación.

**Hallazgo preexistente (fuera de H7.5):** tras «Disconnect», el iframe del clúster y su watch de Pods siguen abiertos al menos 20 s, aun sin ventanas desacopladas. Se midió con una sonda, sin ventanas. P14 exige solamente que se cierre el watch de la ventana (2 → 1).

## 7. Pruebas

**Unitarias:**
- `detached-resource-list.test.ts` (15) y `detached-panels-h7-5.test.tsx` (9), escritos en RED antes de implementar.
- Más 1 caso en `open-detached-tool-window.test.ts` (restaurar una ventana minimizada) y la dependencia nueva en `detached-tool-session-manager.test.ts`.
- 62 suites relacionadas (main, ventanas, dock con logs y terminal, split-panel/Kubetail, global-docking, hotbar, clúster): **588/588**.

**Playwright sobre Electron DEV** (perfil QA aislado, API sintética con 1 Pod y 1 Deployment). Corrida final `2026-11-03T01-31-01`: **64 PASS · 0 FAIL · 0 SKIP · 0 BLOCKED · 0 NOT IMPLEMENTED**.

| ID | Escenario | Resultado |
|---|---|---|
| P01 | Desacoplar Pods | Ventana `file://…/detached-tool.html` con sandbox, `contextIsolation` y sin Node. Estado `live`, fila `h7-pod-0 Running 1/1`, aviso de solo lectura y un único control (Redock) |
| P02 | Desacoplar Deployments | Ventana independiente: `h7-deploy 1/1` |
| P03 | Sin segunda vista activa | 0 vistas de lista en el frame, 2 placeholders; watches = línea base + 1 por ventana |
| P04 | `clusterId` de la ventana | Descriptor: clúster A, `resource-list`, `pods`, namespace `h7-synthetic` |
| P05 | Color y entorno | Acento de 2 px Teal; sin PROD |
| P06 | Reacople explícito | La ventana se cierra y la vista vuelve: `H(pods, deployments)`; watches 2 → 1 |
| P07 | Cerrar la ventana (camino del SO) | Reacople automático; Deployments open 1 |
| P08 | 10 ciclos | Sin duplicados ni crecimiento (§6) |
| P09 | Dos ventanas | Un evento de Deployment solo cambia esa ventana; un evento de Pod solo cambia la otra |
| P10 | Cerrar una de las dos | Pods se reacopla; Deployments sigue `live` y muestra 3/3 |
| P11 | Redimensionar y mover | 700 y 1300 px: la tabla sigue el ancho. Movida a la pantalla 3 de las 2 que informa Electron |
| P12 | Minimizar y restaurar | Minimizada; tras "Show window" no está minimizada, está visible y enfocada |
| P13 | Fallo de apertura simulado | Error visible y panel acoplado; el reintento funciona |
| P14 | Cerrar el workspace de origen | Pestaña cerrada: la ventana sigue con su clúster y reacopla. Disconnect: main cierra la ventana y su watch |
| P15 | Clúster diferente | Ventana PROD de B correcta; detach y reacople cruzados desde B rechazados |
| P16 | Flag OFF | Sin host ni botones de desacople; UI clásica |

**Corridas previas** (se documentan, no se ocultan):
- **Primera corrida (61/64):**
  - P12 encontró un **defecto real**: `detachPanel` cortaba antes del IPC cuando el panel ya estaba desacoplado, así que "Show window" no llegaba a main. Se corrigió con un test RED → GREEN.
  - P03 partía de una suposición equivocada sobre la línea base de watches. Ahora la mide.
  - P14 reabría desde el catálogo, que tiene un `h7-synthetic` duplicado. Ahora usa el pin del hotbar.
- **Segunda corrida (62/64):**
  - P12 seguía fallando porque el bundle de main se había compilado antes de agregar `restore()`. Se recompiló.
  - P14 se ajustó a la medición del hallazgo preexistente de §6.

**Monitores:** Electron informa dos pantallas (`2: 1858x1050 @62,30` y `3: 1920x1050 @1920,30`). P11 movió la ventana a la pantalla 3 usando `setBounds` y verificó `screen.getDisplayMatching`. No hubo una persona mirando la segunda pantalla: la verificación es la que reportan las API de Electron.

**Uso de `electronApp.evaluate`:**
- Solo para leer el estado nativo (bounds, minimizado, foco, `webPreferences`, pantallas).
- Para acciones del sistema operativo que Playwright no puede simular: cerrar, minimizar y `setBounds`.
- Para preparar el fallo controlado de P13, reemplazando temporalmente el handler.

Los botones de la aplicación (desacoplar, Redock, Show window, cerrar pestaña, Disconnect) se accionaron con clics reales.

**Verificación independiente de seguridad** (revisor de solo lectura sobre el diff, antes del commit):
- Los 6 puntos dieron PASS, sin bloqueantes: rutas y verbos no controlables desde el renderer, proyección sin secretos, descriptor no falsificable, ciclo de vida de los watches, sin regresiones en logs/inspector/terminal, y `restore()`.
- Dejó dos advertencias, corregidas en este mismo commit:
  - **A1:** el bucle de reconexión acumulaba listeners de `abort` en la señal de la sesión. Con LIST permitido y WATCH denegado sumaba uno cada 2 s. Test RED (21 listeners tras 20 reconexiones) → GREEN (≤ 1); main queda en 128/128.
  - **A2:** la ventana vuelve a validar `accent` (`#rrggbb`) antes de tocar el CSS, como defensa en profundidad.
- **Validación definitiva** (2026-11-03, build de `lens-app-main` autorizado por el usuario con 19,6 GiB libres):
  1. Se comprobó que A1 y A2, con su test, ya estaban en `b9fcfed`. No hizo falta un commit correctivo.
  2. Test de listeners: PASS (20 reintentos fallidos de watch, a lo sumo 1 listener).
  3. Build incremental solo de main: 19 s, 1,40 GB de pico, los mismos 42 errores de tipos. Se verificó que el bundle contiene el arreglo. El renderer no se recompiló: A2 está en el JS estático.
  4. Primera corrida (`2026-11-03T02-01-56`): **abortada en V07** (38/64 registrados, 36 PASS). La ventana principal quedó cerrada para Playwright («Target page, context or browser has been closed»).
     - El log de la app no muestra crash, recarga ni actividad de ventanas desacopladas antes de V07. El «Quitting application» aparece después, con el cierre del harness.
     - V07 (diálogo del hotbar) no usa el código de main modificado. No se encontró una causa determinística: se registra como inestabilidad del entorno.
  5. Corrida de confirmación (`2026-11-03T03-28-14`) sobre `b9fcfed` sin cambios locales: **64 PASS · 0 FAIL · 0 SKIP · 0 BLOCKED**.
     - P01–P16 16/16 y los 48 anteriores, incluido V07.
     - Cierre de ventanas y watches: P06 2 → 1, P07 Deployments open 1, P14 Disconnect cierra la ventana y su watch.
     - P08: 10 ciclos sin acumulación (procesos 4 → 4, RSS de main 215 → 207 MB, 0 errores de la app).
     - 0 escrituras contra Kubernetes.

## 8. Evidencia

- **En Git** (`docs/evidence/h7-5/`, 600 KB): `p01-pods-window`, `p01-main-placeholder`, `p02-deployments-window`, `p05-window-teal-accent`, `p09-two-windows-pods`, `p13-open-failure` y `p15-prod-window-cluster-b`.
- Se actualizaron las capturas de H7.2–H7.4, porque los encabezados muestran ahora el control de desacople.
- **Solo local:** corrida definitiva `~/Documents/lens/qa-artifacts/h7-playwright/2026-11-03T03-28-14/`. La anterior, del commit, está en `2026-11-03T01-31-01/` (12 MB): `report.html`, `results.json` y `video/h7-qa-run.mp4` (5,5 MB, no versionado).

## 9. Recursos

- **Builds:** `lens-app-main` ×2 (≈20 s, 1,44 GB de pico) y `lens-app-renderer` ×2 (≈20 s, 1,49 GB de pico). Siempre con los mismos 42 errores de tipos preexistentes.
- **Electron:** tres corridas completas y dos sondas cortas, siempre con una sola instancia.
- **Disco:** 26 → 19,6 GiB libres. La caída se debe al swap del sistema (8,1 de 9,2 GiB); los artefactos de la sesión ocupan unos 250 MB. Al bajar de 20 GiB se detuvieron los builds: la última corrida de validación no compiló nada.
- **RAM:** 49 % libre al cerrar.
- Sin DMG, ZIP ni paquetes. No quedan Electron ni mocks; el dev server `:9191` preexistente se reutilizó. Los stores del perfil QA quedaron restaurados (preferencias `{}`).

## 10. Limitaciones

- La ventana es **de solo lectura**: editar recursos, abrir detalles, ver logs o eliminar requiere reacoplar el panel. La ventana lo indica explícitamente.
- Columnas fijas (Name, Namespace, Status, Ready, Created). No hay orden, filtros ni métricas. Máximo 2000 filas.
- Namespace: si hay exactamente uno seleccionado se usa ese; con varios o con "todos", la ventana lista todos los namespaces.
- El color de la ventana se fija al abrirla. Para que tome un cambio de color posterior hay que reacoplar y volver a desacoplar.
- Si el frame de origen se recarga mientras hay una ventana abierta, el layout nuevo (en memoria, hasta H7.7) no sabe que existe. Al cerrarla, el aviso se ignora.
- Hace falta `OPENLENS_DETACHED_TOOLS=1` o `--enable-detached-tools`, el mismo flag que los logs y el inspector desacoplados.
