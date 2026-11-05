# H7.3 — Controles compactos, replegado y movimiento por teclado

**Fecha:** 2026-11-02 · **Rama:** `feature/global-docking-h7` · **Base:** `cd1b1da` · **Estado:** PASS (Electron DEV 45.2.0, suite Playwright H7: 36/36)

## 1. Arquitectura

### Cómo calcula el renderer tamaños, orientaciones y pestañas (antes de H7.3)

- `DynamicLayoutRenderer` recorre el árbol `SplitLayoutNode`:
  - Un `branch` se pinta como fila (`horizontal`) o columna (`vertical`). Sus dos hijos reciben `flex-basis` = `ratio` y `1 − ratio`.
  - Un `group` pinta una barra de pestañas y solo monta la pestaña activa.
  - Una `leaf` pinta un `PanelContainer`, que contiene el encabezado arrastrable y el cuerpo.
- El host global (`GlobalPanelHost`) usa ese mismo renderer y un `SplitPanelStore` propio por clúster, en memoria (H7.1).

### Representación del replegado

- El estado replegado es un `Set` observable de ids de hoja (`collapsedLeafIds`) en `SplitPanelStore`.
  - **No** forma parte de `SplitLayoutNode` ni de `serializeLayout()`. El layout persistido de Kubetail (`openlens:split-layout`) no cambia de forma; un test lo verifica.
  - Es estado de vista en memoria, porque la persistencia global corresponde a H7.7.
- API del store:
  - `collapsePanel(id)` devuelve `false` si el id no existe.
  - `restorePanel(id)` reactiva la pestaña si el panel estaba dentro de un grupo.
  - Consultas: `isLeafCollapsed`, `isSubtreeCollapsed` y `collapsedLeaves`.
  - `closePanel` olvida el estado replegado del panel cerrado.
- Renderizado:
  - Una hoja replegada devuelve `null`, así que su contenido se desmonta y libera la suscripción Kubernetes.
  - Un grupo oculta las pestañas replegadas. Si todas lo están, no renderiza nada.
  - En una rama, si un hijo queda completamente replegado se oculta el divisor y el hermano recibe el 100 %. **El hermano conserva su posición en el árbol de React**, por lo que no se remonta ni reinicia sus watches.
  - El `ratio` de la rama no se toca: al restaurar vuelve la distribución anterior (S01: 509 → 509 px).
- El host muestra una banda de recuperación (`global-panel-collapsed-bar`, 26 px) con una ficha por panel replegado.
  - Si todo está replegado, muestra un mensaje y la banda; el layout sigue siendo válido.

### Invariantes comprobados

| Invariante | Evidencia |
|---|---|
| Identidad estable y `clusterId` | Test unitario (id, kind y `clusterId` iguales tras replegar) |
| El panel replegado sigue en el layout | `allActiveLeaves` lo incluye; el catálogo no ofrece duplicarlo (`singleInstance`) |
| Redistribución del espacio | C05: Pods ocupa 1152/1152 px |
| Mecanismo visible de recuperación | C05 y C08: ficha visible en la banda |
| Layout válido con todo replegado | C08: `(all collapsed)` con 2 fichas; restaurar vuelve a `H(pods, deployments)` |
| Sin watchers huérfanos | C05: Deployments open = 0; C06: open = 1 y started +1 (sin duplicado); W01–W05 PASS |

## 2. Encabezados compactos (solo docking global)

- `CompactPanelControlsContext` vale `true` únicamente dentro de `GlobalPanelHost`. Kubetail sigue con su encabezado de 38 px y sus acciones originales.
- Encabezado de **28 px** (`panelHeaderCompact`). Controles:
  - `+` (catálogo);
  - mover (menú de teclado);
  - `−` (replegar);
  - `×` (cerrar).
- Maximizar no se muestra, y desacoplar queda para H7.5.
- Los controles siempre ocupan su lugar y solo cambia `opacity`, con `:hover` y `:focus-within`. Por eso:
  - no desplazan el contenido ni cambian la altura (C13: 28/28/28 px, cuerpo en y = 28 en reposo, hover y foco);
  - siguen siendo alcanzables con Tab.
- Nombres accesibles: `Collapse Pods Overview panel`, `Close Pods Overview panel`, `Move Pods Overview panel` y `Add panel`.
- Tema: solo variables existentes del tema grafito (`--surface-raised`, `--border-default`, `--text-secondary`, `--graphite-accent`). No se modificó ningún color global.

## 3. Movimiento por teclado

- `PanelMoveMenu` es un botón con `aria-haspopup="menu"` que abre un `role="menu"`.
- Ofrece, para cada panel visible: `Left of X`, `Right of X`, `Above X`, `Below X` y `Group with X`.
- Teclas:
  - ↑/↓/Home/End navegan;
  - Enter o Espacio ejecutan;
  - Escape o Tab cancelan y devuelven el foco al botón.
- Tras mover, el foco vuelve al botón de mover del panel movido.
- Cada opción llama a `store.dockPanel(...)`, la misma operación que el drag-and-drop. Las opciones que `dockLeafInTree` rechaza (por ejemplo, un no-op como `Left of Deployments` cuando Pods ya está a la izquierda) no se ofrecen. **No hay un segundo algoritmo de docking.**

## 4. Cambios

| Archivo | Cambio |
|---|---|
| `split-panel/split-panel-store.ts` | `collapsedLeafIds` y la API de replegado; `closePanel` limpia el estado |
| `split-panel/panel-container.tsx` | Props `compact` y `onCollapse`, `data-testid=panel-header-*`, botón `panel-collapse-button-*` |
| `split-panel/dynamic-layout-renderer.tsx` | `CompactPanelControlsContext`, hoja compacta, ocultar replegados en grupo y rama |
| `split-panel/panel-move-menu.tsx` | Nuevo menú accesible de movimiento |
| `split-panel/split-panel.module.scss` | `.panelHeaderCompact`; foco visible en `.moveMenuItem` |
| `global-docking/renderer/global-panel-host.tsx` y `.module.scss` | Contexto compacto, banda de recuperación y estado "todo replegado" |
| `global-docking/renderer/__tests__/collapse-and-keyboard-h7-3.test.tsx` | 9 tests nuevos |
| `open-lens/integration/h7-docking-e2e.mjs`, `h7/harness.mjs` | C01–C13 y S01 pasos 7–8; `describeLayout` ignora los hijos replegados |

## 5. Pruebas

**Unitarias:**
- 9 tests nuevos: RED 9/9 antes de implementar, GREEN 9/9 después.
- Suites `split-panel` + `global-docking`: 15 suites, **135/135**.

**Playwright sobre Electron DEV** (perfil QA aislado, API sintética, una instancia). Corrida final `2026-11-02T21-44-30`: **36 PASS · 0 FAIL · 0 SKIP · 0 BLOCKED · 0 NOT IMPLEMENTED**.

| ID | Prueba | Entrada | Resultado |
|---|---|---|---|
| C01 | Puntero fuera del encabezado | mouse | PASS: opacidad 0/0 |
| C02 | Hover en el encabezado | mouse | PASS: Pods 1, Deployments 0 |
| C03 | Salir del encabezado | mouse | PASS: 0 |
| C04 | Foco con Tab | teclado | PASS: foco en `+` de Pods, opacidad 1, nombres accesibles |
| C05 | Replegar (−) | click | PASS: `pods` ocupa 1152/1152 px, ficha visible, watch de Deployments 0 |
| C06 | Restaurar | click | PASS: `H(pods, deployments)` 576/576 px, watch 1, started +1 |
| C07 | Replegar dentro de grupo | mouse + click | PASS: `tabs[deployments,*pods]` → `tabs[*deployments]` → restaurado `tabs[deployments,*pods]` |
| C08 | Replegar el último panel | click | PASS: `(all collapsed)`, 2 fichas, watch 0, restauración completa |
| C09 | Cerrar (×) | click | PASS: `pods`, watch 0; el último panel no ofrece × |
| C10 | Reabrir desde el catálogo | click | PASS: Deployments vuelve, watch 1 |
| C11 | Mover con teclado | Tab, Enter, flechas, Escape | PASS: Escape no cambia nada y el foco vuelve; ↓+Enter da `V(pods, deployments)`; End+Enter da `tabs[deployments,*pods]` |
| C12 | Arrastrar después de restaurar | click + mouse | PASS: `V(deployments, pods)` |
| C13 | Altura del encabezado | mouse + teclado | PASS: 28/28/28 px, cuerpo fijo, fondo `rgb(32, 34, 37)` |

**Regresiones:**
- D01–D16: 16/16.
- K01 (Kubetail): PASS, 665 → 812 → 658 px.
- W01–W05: 5/5. W05: Pods open = 1 en 36 muestras; total 4 → 4.
- S01: PASS. Los pasos 7–8 ya se ejecutan: replegar Pods da `deployments`, y restaurar da `V(pods, deployments)` con la altura conservada en 509 px. 0 errores de consola nuevos.

En la primera corrida C04 falló por un error del test: esperaba el nombre "Pods", pero el título real es "Pods Overview". Se corrigió la expectativa y se repitió la suite completa.

## 6. Evidencia

- **En Git** (`docs/evidence/h7-qa/`): `c02-hover-controls`, `c04-keyboard-focus`, `c05-collapsed`, `c08-all-collapsed`, `c11-keyboard-menu` y `results.json`.
- **Solo local** (`~/Documents/lens/qa-artifacts/h7-playwright/2026-11-02T21-44-30/`, 6,7 MB): `report.html`, capturas y `video/h7-qa-run.mp4` (3,0 MB). No hubo trazas de fallo.
- Consola: 60 errores, todos del websocket HMR de `webpack-dev-server`. API sintética: 0 escrituras rechazadas.

## 7. Recursos

- Un build de `lens-app-renderer`: 17 s y 1,19 GB de pico, con los mismos 42 errores de tipos preexistentes.
- Dos corridas de la suite, de unos 5 min cada una y con una sola instancia de Electron.
- Disco: 26–28 GiB libres. Swap: ~6,9 GiB de 8 GiB.
- Sin DMG, ZIP ni paquetes. Al terminar no quedan Electron ni mocks. El dev server `:9191` preexistente se reutilizó.

## 8. Limitaciones

- El estado replegado no persiste: se pierde al recargar el frame, igual que todo el layout global hasta H7.7.
- Los paneles replegados no se arrastran desde la banda; se restauran con un click.
- El menú de movimiento solo ofrece paneles visibles como destino.
- En modo compacto no se muestra Maximizar; desacoplar corresponde a H7.5.
- `panel-container.tsx` y `dynamic-layout-renderer.tsx` conservan errores de lint preexistentes que no se tocaron.
