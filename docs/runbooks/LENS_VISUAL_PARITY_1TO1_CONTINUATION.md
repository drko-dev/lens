# NovaKube ↔ Mirantis Lens — Runbook de continuación de paridad UI/UX 1:1

**Fecha de revisión:** 12 de noviembre de 2026  
**Objetivo:** continuar y cerrar diferencias visuales y de experiencia observable sobre un proyecto YA AVANZADO, sin reescribirlo ni perder funcionalidades.

## 0. Principio rector

Se busca fidelidad **1:1 en apariencia y experiencia visual**, no identidad de código fuente. Desarrollar componentes propios de NovaKube/OpenLens DevOps a partir de observación, capturas, medición y comportamiento visible de Lens oficial. No copiar código ni redistribuir recursos protegidos; no descompilar el binario ni eludir restricciones de licencia. Conservar todo lo que NovaKube ya hace y su identidad de producto.

**Prohibido arrancar de cero**, reemplazar la arquitectura actual, rehacer controles ya validados o anunciar 100 % de paridad sin evidencia pantalla × estado × resolución.

## 1. Punto de partida real

- Repositorio: `~/Documents/lens/lens-v6-ui-corrections`
- Rama detectada: `feature/lens-dark-parity-pod-drawer-navigator`
- HEAD detectado: `d891c7db`; commits previos: `ee6eb031`, `485ada39`. Verificar al iniciar porque Claude u otro agente puede haber seguido trabajando.
- Referencia instalada: `/Applications/Lens.app`, versión detectada `2026.11.91422-latest`; la evidencia previa describe Lens 2026.10. **No mezclar versiones como si fueran la misma referencia.**
- Evidencia anterior: `docs/evidence/novakube-lens-2026-visual-parity/EVIDENCE.md` y `audit.mjs`
- Prompt maestro anterior: `docs/runbooks/NOVAKUBE_LENS_UIUX_PARITY_MASTER_PROMPT.md`. Tiene metadatos ya desactualizados: tomarlo como antecedente, no como autoridad sobre rama, versión o tema por defecto.
- El árbol contenía archivos auxiliares untracked: **no borrarlos ni agregarlos por defecto**.
- Incidencia del entorno: el Node global 26 mostró un fallo al cargar `libsimdjson.33.dylib`; existe Node `~/.nvm/versions/node/v24.22.2`. Seleccionar una versión funcional de Node compatible con el proyecto antes de atribuir errores al código.

## 2. Cambios validados que hay que preservar

1. **Tablas:** tipografía de celda de 14 px y cabecera de 47 px, según la última comparación con Lens.
2. **Dock:** pestaña `#1F2123`, peso de etiqueta 600, ícono 16 px.
3. **Drawer:** ítems de 28 px.
4. Paridad anterior en estilos Dark, fondos, toolbar, Navigator, terminal y búsqueda, con pruebas y evidencia histórica. Revisar estado actual antes de tocar nada.
5. Mantener hot reload / Electron real, clusters de prueba aislados y controles de seguridad activos.

Estos valores constituyen **línea base local**, no prueba automática de igualdad con la versión nueva 2026.11. Si cambia la referencia, registrar si cada medida continúa vigente antes de modificarla.

## 3. Backlog priorizado — diferencias conocidas

| Prioridad | Pantalla/componente | Diferencia conocida | Acción |
|---|---|---|---|
| P0 | Navigator | Lens usa Home → árbol de clústeres; NovaKube usa selector de clúster y rail de íconos | Proponer/adaptar estructura visual Lens sin eliminar selector, pins, workspaces, docking ni accesos |
| P0 | Barra superior | Lens muestra tabs Release Notes/Pods y controles AI/Upgrade; NovaKube muestra Workspace y tabs de clúster | Igualar geometría, jerarquía y navegación con controles reales propios; no crear botones falsos |
| P1 | Taxonomía | “Daemon Sets” / “Stateful Sets” frente a “DaemonSets” / “StatefulSets” | Cambiar etiquetas de UI donde corresponda, sin cambiar identificadores API o rutas |
| P1 | Overview | No se midió Lens Overview por fallo de navegación en la sesión anterior | Entrar por otra ruta de UI, documentar evidencia del estado y comparar con misma escala |
| P1 | Gráficos | Overview demo de OpenLens indica que no hay Prometheus; faltan datos comparables | Usar fixtures sintéticas locales, explícitamente etiquetadas, solo en modo QA; no falsear clúster real |
| P1 | Settings | Faltan comparaciones completas de categorías, formularios y estados | Recorrer todas las secciones observables y crear matriz |
| P2 | Menús/dock/drawer | Estados focus, hover, disabled, overlay, tooltips, búsqueda, scroll | Hacer barrido exhaustivo con medición y capturas |
| P2 | Resto de recursos | Variantes de tablas, detalles y diálogos en Network, Storage, Config, Helm, Nodes, Workloads | Completar matriz por pantalla y estado |

No considerar esta tabla exhaustiva. Primero inventariar realmente las rutas y pantallas presentes en ambas versiones y **añadir las diferencias**; no reducir el alcance a Pods.

## 4. Procedimiento de trabajo por lotes pequeños

1. **Preflight:** `git status --short --branch`, `git log -8 --oneline`, versión exacta de Lens, Node funcional, procesos Electron y evidencia existente. Respetar modificaciones concurrentes.
2. **Dos ventanas visibles:** Lens oficial solo como referencia a la izquierda; NovaKube Electron real a la derecha, mismos tamaños lógicos/escala/tema Dark, misma pantalla y contenido equivalente. Mantener HMR cuando sea posible.
3. **Inventario de diferencias:** matriz de pantalla × subcomponente × estado (`default/hover/focus/selected/disabled/error/empty/loading`) × tamaño. Medir tipografías, color RGBA, contraste, caja, padding, íconos, alineación, scroll y acciones.
4. **Corrección incremental:** cambiar SCSS/TSX/React solo en el componente afectado, reutilizar tokens y componentes, no duplicar controles ni introducir CSS global que rompa otros temas.
5. **Validación visible:** comprobar en Electron real a 1440×900, 900×700, 700×700 y 700×500 cuando esos tamaños sean compatibles con los mínimos nativos. Capturar antes/después y superposición o diff de regiones comparables. Enmascarar datos cambiantes.
6. **Pruebas:** ejecutar lint/test/build relacionados, `git diff --check` y TypeScript. Registrar explícitamente fallos preexistentes separados de regresiones nuevas. Probar teclado, navegación, dock/redock, búsqueda, switching de clúster, persistencia y acceso a controles propios.
7. **Commit local:** solo archivos del lote y evidencia pertinente mediante `git add` explícito; mensaje descriptivo; sin push, merge, limpieza destructiva o sustitución de la aplicación estable.
8. **Seguir con el siguiente componente** por impacto visual, sin pedir permiso por cada cambio ordinario. Pedirlo para acciones realmente sensibles/irreversibles.

## 5. Criterios de aceptación

- Cada diferencia tiene: referencia Lens (versión/estado/resolución), medición, código NovaKube modificado, antes/después, prueba funcional, prueba visual y estado `PASS / PENDIENTE / NO COMPARABLE`.
- Todas las rutas/pantallas observables equivalentes, no solo la principal, están inventariadas y examinadas.
- La estructura y textos también se alinean donde corresponda; no limitar el trabajo a colores ni SCSS.
- No desaparecen funciones de NovaKube (workspaces, rail/pines, multiventana, docking, Kubetail, Incident Center, OAuth, RBAC, terminal, IA real, etc.).
- No se pierde semántica de seguridad/producción, ni se prueban operaciones con clústeres reales.
- Una captura similar no basta para dar una interacción por aprobada.
- Informar porcentajes solo si existe denominador auditable y comparable. Nunca declarar fidelidad exacta global con estados sin medir.
- El empaquetado final exige build limpio y QA de la versión instalada fuera de hot reload; no etiquetar como FINAL mientras haya fallas de release.

## 6. Instrucción de inicio lista para Claude Code

> Continuá el trabajo EXISTENTE de paridad UI/UX NovaKube ↔ Mirantis Lens. Leé íntegro `docs/runbooks/LENS_VISUAL_PARITY_1TO1_CONTINUATION.md`, `docs/runbooks/NOVAKUBE_LENS_UIUX_PARITY_MASTER_PROMPT.md` y la evidencia. **No reinicies ni reestructures el proyecto desde cero.** Medí la rama, el HEAD, la referencia instalada y la línea base de hoy. Conservá los cambios ya verificados (tablas 14/47 px, Dock #1F2123/peso 600/ícono 16 px, Drawer 28 px). Abrí ambas apps lado a lado y continuá por los pendientes de Navigator, barra superior, etiquetas, Overview y Settings, haciendo cambios incrementales en React/TSX/SCSS con hot reload, capturas comparables y pruebas funcionales reales. Guardá cada lote estable en un commit local, sin push ni merge. Quiero fidelidad 1:1 de la apariencia y experiencia observable, usando código propio y sin eliminar ninguna función de NovaKube. Documentá las diferencias todavía no verificadas y seguí trabajando, no te detengas tras una auditoría.

## Autonomous plan and progress (2026-11-13)

Cycle per item: measure official (CDP :9225) -> measure NovaKube (CDP :9223) -> fix
TSX/SCSS -> verify in Electron -> focused test -> matrix row -> local commit.
Core TSX changes need `npm run build` in packages/core; SCSS hot-reloads.
Never run the full Jest suite after small changes (known baseline: 70 failing
suites, 338 failed / 659 passed, identical at 9255b985).

Done: pins column 64px + cell/tile/pitch, Navigator 300px, clusters section,
selector 240x26, cluster row internals, top bar arrows, tab size/states/close.
Pending: Home screen, Preferences sections, list toolbars (Aa/.* search,
star/history), Logs dock + Kubetail, context menus, dialogs, empty/error states,
selected-pin indicator (needs official capture).

### Progress checkpoint (2026-11-13, later)
- Done (local commits, no push): Welcome columns (72bf3b80), Preferences heading typography (dbccc94f), list toolbar/rows (50d274c7, 8a4ba751), dock/kubetail audit (e5fb1b6d), Preferences as workspace tab (9f45d1aa).
- Gotchas: after `npm run build` in packages/core, reload the main frame with CDP `Page.reload` (`scratchpad/pr.js`); `location.reload()` via Runtime.evaluate did not reload the page. Always check `performance.timeOrigin` age to confirm.
- Next: audit Catalog, Overview, Nodes, Pods list + drawer, context menus, dialogs, empty/error states; selected pin state; Lens "Aa/.*" search toggles; Navigator beside Preferences (needs main-frame Navigator).

### Checkpoint (2026-11-13, evening)
- Local commits since 6e1bf849: Welcome columns, Preferences heading + workspace tab, list toolbar/rows, Nodes header alignment, Overview issues headings, single-scroll Navigator, matrix/runbook updates (latest 79d73dc2 + docs). Parity test: 18/18. No push/merge.
- Resume at: Pods list toolbar/columns (see PARITY_MATRIX "Pods list" — needs a decision on relocating NovaKube-only filters), then pod drawer, context menus, dialogs, empty/error states, selected pin state, Aa/.* search toggles, Overview flat layout.
- Tooling notes: use `scratchpad/pr.js` (Page.reload) after core build; tool output is compressed — redirect to files / headroom_retrieve; click helpers `click.js port cssx cssy` (css = displayed*0.72).

## Checkpoint (2026-11-13, night) — Pods toolbar, columns, search modes

Commits: `20d8fff2` (quick filters into `more_vert` popover, single-row toolbar),
`0b1b37a7` (Lens column distribution, Name remainder with 96px floor),
`bf4a34c9` (43px row-menu column), `90d5743c` (functional Aa / .* search modes).

- Quick filters: `KubeQuickFilters` renders `compact` under NovaKube
  (`quick-filters-menu-trigger`, badge `quick-filters-active-count`, Escape /
  outside click closes). Same PageFiltersStore; Clear filters stays inside.
- Column distribution only applies to cells without persisted inline widths
  (`:not([style*="width"])`); user-resized widths (Name 189 in the dev profile)
  win and other columns shrink to readable floors.
- Search modes: `PageFiltersStore.searchMatchCase/searchUseRegex` +
  `createSearchMatcher`; `SearchModeToggles` is passed as `iconLeft` in
  `item-object-list/header.tsx` for every list. Default matching is unchanged.
- Tooling: cdp5.js now passes `awaitPromise:true`; the dev app CDP origin port
  changes after reload (harmless). Escape via esc.js targets the main frame, not
  the cluster iframe — close iframe popovers with a mousedown dispatch.

Next, in order: Preferences beside Navigator (structural: Navigator lives in
the cluster iframe), Overview flat layout (empty metric states, no Prometheus),
pin hover/focus, pod drawer, context menus, dialogs, empty/error states,
Logs/Kubetail, remaining resource screens.

### Checkpoint addendum — metrics and Overview

- `27dae5c1` fixes Helm Prometheus auto-detection (recommended `app.kubernetes.io/*`
  labels). Main-process change: rebuild core, then `touch open-lens/static/build/main.js`
  so nodemon restarts Electron. After restart the window comes back at 960x1050;
  restore with `window.resizeTo(1440, 900)` via cdp5 (`rs.js`), then click the
  cluster tab to reconnect.
- `511bf8bd` flat Overview grid (toolbar / barcharts|piechars / issues / quota).
  Residual: chart row 402px vs 350px, no range selector (not faked).

## Checkpoint (2026-11-13, late night) — drawer, labels, menus

Commits since `d04c0378`: `0a460707` (drawer title "Pod: <name>", 37px rows,
194px labels), `25649bde` (plain drawer toolbar), `69680af6` (collapsible
Labels/Annotations "N Labels" + unfold toggle, opt-in `collapsible` prop on
`DrawerItemLabels`), `07f70ef0` (flat #17191A menus, 29px item pitch).

Gotchas:
- Page.reload (pr.js) can bring the dev window back at 960x1050; always run
  `rs.js` (window.resizeTo 1440x900) before screenshots.
- Material icon ligature text is part of `textContent` (e.g. "subjectLogs").
- Base `menu.scss` frames each `.MenuItem` with `border: 3px solid var(--bgc)`.
- Legacy drawer-title block (search `[class*="DetailsHeader"]`) is all
  `!important`; edit it in place instead of adding a second block.

Next, in order: dialogs (delete confirm, kubeconfig add), empty / error
states, drawer "Metrics"/"Properties" headings + metrics toolbar, Preferences
beside the Navigator, pin hover/focus, Logs/Kubetail dock body, remaining
resource screens (Deployments, Config, Network, Helm, Events, Namespaces,
Access Control, CRDs), full Jest checkpoint (≤2 workers) vs baseline.

### Jest checkpoint (2026-11-13, late night)

Full run (2 workers, `--testPathIgnorePatterns mcp-security-hardening`):
70 failed suites (baseline 70), 340 failed tests -> 337 after refreshing the
Welcome navigation snapshots (`ba8efb2d`); baseline 338. The only regressions
vs the earlier partial `base.json` were those Welcome snapshots. Many baseline
failures print DOM that now contains `search-mode` / `quick-filters-menu`
markup; that is incidental, not the failure cause.

## Checkpoint (2026-11-14, early) — dialogs, lists, logs, warning column

Commits after `7264b0a1`: `87a23298` (Confirm header + 440px dialog),
`e315fce7` (44px toolbar / 46px header on every list), `f51bbdb7`/`207fa787`
(plain underlined table links, list left edge 3px, TabLayout <main> margin 0),
`65f635cb` (borderless chips), `ba8efb2d` (welcome snapshots), `0008156a`,
`2ccc038d` (docs), `32717338` (generic ⚠ column after Name), `6fa91703`
(Logs dock single-toolbar restructure, delegated + visually verified).

Jest: full run 70 failed suites / 337 failed tests (baseline 338); logs dirs
79/81 (2 baseline download-logs snapshot failures).

Safety notes: official Lens dialogs live in an iframe — Escape via esc.js does
not close them; click Cancel at its measured coordinate (never near Remove).

Next: drawer "Metrics"/"Properties" headings + metrics toolbar; Deployments
"Status" column (Lens) vs "Conditions"; Helm, Network, Access Control, CRDs
screens; root-frame Navigator for Home/Preferences (structural blocker);
re-run full Jest after the next large change.

## Checkpoint (2026-11-14) — drawer sections, Helm, Services, Access Control

Commits after `9d64484b`: `4701a8fd` (⚠ header glyph), `954fdaaf` (drawer
"Metrics"/"Properties" sections + icon metric toggles, delegated), `ebe5682c`
(HelmChart appVersion data bug, RED->GREEN), `49510ce0` (Helm charts toolbar +
16px icons), `69a6d33c` (Helm releases toolbar order), `78d6e5d6` (chips keep
natural width; table chips are CSS-module `badge-module__badge`, not `.Badge`),
`d5926af9` (Service Accounts record).

Navigation tooling: NovaKube sidebar items by id via
`[data-testid="sidebar-item-link-for-<id>"]` (goid.js, ids.js). Official Lens
navigator lives in the main frame but is virtualized: click group labels by
exact text (orel.js pattern) to collapse/expand until the target renders.

Next: remaining Network subscreens (Ingresses, Endpoints, Network Policies),
Storage (PVC done earlier, PV, Storage Classes), CRDs, Nodes drawer, Deployment
drawer, Preferences sections re-check, root-frame Navigator (structural).
Re-run full Jest (≤2 workers) after the next TSX change.

### Jest checkpoint 2 (after table density 36px + DOM-measured tables)

Full run (2 workers, mcp-security-hardening ignored): 69 failed suites (baseline
70), 337 failed / 5014 passed of 5360; 0 tests newly failing vs the previous
full run. Official Lens tables/toolbars/tabs/navigator/preferences are in the
main frame DOM — prefer DOM measurement (otb.js, ocell5.js, onav.js, otab3.js,
opref.js) over screenshot estimates (screenshots overestimated widths ~1.2x).

Note (2026-11-14): SCSS hot reload adds the new rules but the compiled core
library CSS still carries the previous version of novakube.scss; when a rule
seems ignored, rebuild core (`npm run build`) + pr.js before re-measuring.
`develop` is fast-forwarded to this branch at user request (local only, no push):
`git fetch . feature/lens-dark-parity-pod-drawer-navigator:develop`.

Checkpoint (2026-11-14, pins + navigator title): `528cecfb` renders Lens' twelve
hotbar slots (empty = 37x38 grey80 tile, 56px pitch) — probe with
scratchpad `hbn.js` / `hbl3.js` (Lens cells are found by geometry: x=8, 47x48).
Next commit moves the "Navigator" title into the tab-strip row (82x36 grey80
tab at x=64) and packs the workspace controls into the remaining 218px so the
first cluster tab starts at x=364 like Lens (365). `develop` fast-forwarded to
`528cecfb` at user request.

### Checkpoint (2026-11-14, final): Navigator header, resource lists, non-pod drawers, final sweep

- Commits on `feature/lens-dark-parity-pod-drawer-navigator`:
  - `4ad56a19`: Removed duplicate `"Navigator"` heading in `RootNavigatorPanel` and aligned `45px` `#1F2123` selector bar (`[76, 94]`, `240x26`).
  - `5bd9c937`: Aligned column widths across 12 remaining resource lists (`Roles`, `ServiceAccounts`, `RoleBindings`, `ClusterRoleBindings`, `RuntimeClasses`, `Mutating/ValidatingWebhookConfigurations`, `DaemonSets`, `ReplicationControllers`, `EndpointSlices`, `IngressClasses`, `CrdList`) + `list-column-measurements.txt`.
  - `42bd4f0c`: Aligned non-pod resource drawers (`defaultDrawerWidth = 725`, `#1F2123` surface, `#181A1C` `44px` header, `18px/600` `43px` section headings, `194px` CSS Grid label column, zero `.Table` horizontal overflow, transparent `.ResourceMetrics`) + `drawer-measurements.txt` measured live across 14 resource types (`Stateful Sets` and `Releases` empty in test cluster).
  - Final parity/resilience commit: guarded `clipboard?.writeText` in `drawer.tsx` (`copyTitle` fallback to `navigator.clipboard?.writeText` prevents cluster iframe crash on title copy), fixed `.LogList .VirtualList .list .LogRow` specificity in `novakube.scss` (`11.6667px "Lucida Console"`, `18px` row), added parity test assertions, saved clean `1440x900` evidence PNGs in `docs/evidence/novakube-lens-2026-visual-parity/screenshots/`, and updated `PARITY_MATRIX.md`.
- Final Jest checkpoint (`--maxWorkers=2` across the 5 parity/layout/tab/drawer suites): `5 suites, 53 passed, 3 snapshots passed`.
- Final live CDP verification (`:9223` vs `:9225` at `1440x900`): `Preferences` (`theme-novakube`), `Pins` (`12` cells `y=57..673`, `64px` rail, `KVW DEV` cyan pin preserved), `ClusterOverview` (`"toolbar toolbar" "barcharts piechars" "issues issues" "quota quota"`), `Pods` / `Deployments` / `RoleBindings` drawers (`725px` width, `44px` header, `194px` label col, zero crash on copy/close), `Logs` dock (`18px` / `11.6667px "Lucida Console"`), `.Menu` (`rgb(23, 25, 26)`), `ConfirmDialog` (`440px` / `44px`, Cancel `23 === 23`), and `Kubetail` (`mounted: true`, `h: 679`).

## Checkpoint (2026-11-14 — Final Independent Audit, Hotbar Pins 1:1, & Standalone ARM64 Binary Verification)

- **Hotbar & Navigator Cluster Pins 1:1 (`packages/core`)**:
  - Updated `packages/core/src/renderer/components/hotbar/hotbar-entity-icon.tsx`, `hotbar-entity-icon.module.scss`, `packages/core/src/renderer/components/layout/navigator-cluster-row.tsx`, and `packages/core/src/renderer/components/novakube.scss` (`$nv-kube-cluster-mask`, `47x48` `.HotbarCell` slots with `56px` vertical pitch at `x=8`, `3px` `#F1F3F5`/`#2D2F31`/`transparent` borders, `37x38` `#1F2123` tile, `32x31` heptagon-wheel icon preserving per-cluster `rgb(6, 182, 212)` color, `37x16` `rgba(31, 33, 35, 0.85)` bottom code band `"KVW"`, and `16x16` Navigator wheel aligned at `x=35` with deterministic dark `randomColor` fallbacks). Rebuilt `@openlens/core@6.5.3`.
- **Visual & Functional Independent Audit (`1440x900@2`, `:9225` vs `:9223`)**:
  - Generated `14` paired `official-*`, `novakube-*`, `side-by-side-*`, `overlay-*`, and `diff-*` captures in `docs/evidence/novakube-lens-2026-visual-parity/audit-final/`.
  - `pins-rail` reached `94.05%` T24 / `96.41%` T40 (`meanChannelDelta: 4.04`), `preferences` `90.18%` T24, `welcome` `90.17%` T24; live K8s screens ranged `63.37%–70.56%` T24 due to dynamic telemetry/timestamps/sort order. Honest caveat: Official uses thin 7-spoke steering-wheel cutouts vs NovaKube `kube.svg` gear cutouts inside the outer heptagon.
  - Critical functional flows (`audit-final/functional-flows-report.json`): `01..07` and `09..13` passed; `08_logs_dock` passed on run 1 (`opened: true`, `11.6667px "Lucida Console"`) and stayed minimized on run-2 re-click (`opened: false`).
- **Jest Regression & Baseline Check**:
  - Focused hotbar/parity run: `5/5` suites (`39/39` tests, `1/1` snapshot) passed.
  - Focused 60-suite regression (`jest-focused.json`): `59` passed, `1` pre-existing failure (`packages/core/src/features/hotbar/hovering-hotbar-menu.test.ts`), `373/375` tests passed (`2` pre-existing failures). Compared against `jest-full2.json` (`533` suites: `464` passed, `69` failed; `5360` tests: `5014` passed, `337` failed) -> **`0` new suite or test failures** (`audit-final/jest-regression-comparison.json`).
- **Standalone ARM64 Build Verification**:
  - Built `open-lens` production bundle and packaged `open-lens/dist/mac-arm64/OpenLens DevOps.app` (`Mach-O 64-bit executable arm64`, `codesign --verify --deep --strict` passed).
  - Verified standalone execution outside dev server via Playwright (`CICD=/tmp/novakube-arm64-qa/appdata`, `preferences.shell = "/bin/sh"` to avoid non-TTY `/bin/zsh -l -i` shell-sync hang): loaded `https://lens.app:62387/welcome` (`isDevServerPort62836: false`), `body.theme-novakube`, `12` `.HotbarCell` slots (`47x48` at `x=8, y=57`), Slot 0 `KVW` cyan wheel (`rgb(6, 182, 212)`), Navigator cluster wheel icons, and Workspaces bar (`audit-final/novakube-arm64-binary-verified.png`; stayed on `/welcome` during that Playwright probe with `clusterFrameInfo.frameFound: false`).

## Checkpoint — Residual Parity Closure & Standalone ARM64 Live Cluster E2E (2026-11-14)

- **1. Hotbar Pin 7-Spoke Wheel & Navigator Cluster Colors**:
  - Rebuilt `$nv-kube-cluster-mask` in `packages/core/src/renderer/components/novakube.scss` using an original 7-spoke helm wheel cutout inside the rounded heptagon while preserving `KVW` / `DEV` badges and per-cluster colors.
  - Fixed Navigator cluster color fallback across `navigator-cluster-row.tsx`, `sidebar.tsx`, and `root-navigator-panel.tsx` so configured cluster accents (e.g. `#06B6D4` / `rgb(6, 182, 212)`) are never replaced with an unrelated `randomColor`, while unconfigured clusters use deterministic dark `randomColor` fallbacks.
  - Verified: `navigator-cluster-row.test.tsx` (`2/2` passed); live DEV `:9223` vs Official `:9225` `pins-rail` `94%` T24 / `96.38%` T40 (`meanChannelDelta: 4.1`), Navigator pin `rgb(6, 182, 212)`.
- **2. Preferences Workspace Tab Active State**:
  - Fixed `packages/core/src/features/workspace-tabs/renderer/workspace-tab-bar.tsx` so only the `Preferences` tab renders `.active` when `/preferences` is open (`activeCount: 1`: `"settings Preferences"` `active: true`, `"DEV k3s-vps-wireguard"` `active: false`), Navigator remains visible, and ESC / tab close returns cleanly to `/cluster/89531a042d143e4ea5893afd3b7d6365`.
  - Verified: `workspace-tab-bar.test.tsx` (`15/15` passed); live DEV `:9223` vs Official `:9225` `preferences` `90.29%` T24 / `92.15%` T40 (`meanChannelDelta: 10.51`).
- **3. Logs & Dock (`Flow 08`)**:
  - Fixed primary-click Logs opening for multi-container Pods (`pod-devops-menu.tsx`) and minimized Dock restoration on re-selection (`create-logs-tab.injectable.ts`, `select-dock-tab.injectable.ts`).
  - Verified: Jest `pod-devops-menu.test.tsx` (`5/5`), `dock-store.test.ts` (`6/6`), `r5-06-dock-tabs.test.tsx` (`3/3`), `r4-06-detached-logs.test.tsx`, and `log-store-remount-h7-6-3.test.ts` (`14/14`) passed; live DEV `:9223` `flow08` passed (`opened: true`, `hasLogRow: true`, `searchLogs: true`, `openH: 280`, `minH: 37`, `restoredByMenu: true`, `noDuplicateTabOnReselect: true`, `restoredByDockTab: true`, Pod switch to `svclb-traefik-6d30415a-6zr97`, `closedCleanly: true`, `reopened: true`, `reopenedHasLogRow: true`, `liveBadge: true`).
- **4. Standalone ARM64 Binary Live Cluster E2E (Outside Dev Server)**:
  - Rebuilt `@openlens/core@6.5.3` and packaged `open-lens/dist/mac-arm64/OpenLens DevOps.app` (`Mach-O 64-bit executable arm64`, `codesign --verify --deep --strict` passed).
  - Executed isolated Playwright verification with dev server stopped (`LISTEN_9191=0`) using an ephemeral `/tmp/novakube-arm64-qa` copy (`--use-mock-keychain`, temporary `preferences.shell = "/bin/sh"`, leaving user configs and `/Applications/Lens.app` untouched):
    - `/welcome` loaded on `https://lens.app:49732/welcome` (`isDevServerPort: false`), `body.theme-novakube`, `12` hotbar cells, Slot 0 `KVW` cyan `rgb(6, 182, 212)` 7-spoke pin (`novakube-arm64-binary-verified.png`).
    - Activated live cluster `k3s-vps-wireguard`, mounted `${clusterId}.lens.app` iframe, rendered `299px` Navigator with `activePinBg: rgb(6, 182, 212)` and preserved neighbor pins (`kubernetes-admin@kubernetes` `rgb(224, 131, 8)`, `saas` `rgb(81, 1, 142)`).
    - `Pods` list: `23` live rows (`novakube-arm64-binary-pods.png`).
    - `Pod` Drawer: opened `Pod backend-56c6598965-474d5` at `725px` width (`novakube-arm64-binary-drawer.png`).
    - `Logs` Dock: streamed `3` live rows (`logsOpenH: 337`), minimized to `logsMinH: 37`, restored by re-selecting Logs to `logsRestoredH: 337` (`novakube-arm64-binary-logs.png`).
    - `Terminal` Dock: opened `DEV Terminal (2)` with rendered `xterm` (`xtermH: 256`, `sh-3.2$`) (`novakube-arm64-binary-terminal.png`).
- **Documented Exclusions & Constraints**:
  - Mirantis Cloud / commercial features (Lens ID auth, Teamwork/Spaces, Prism AI, Preferences commercial/telemetry sections) remain unstubbed and out of scope.
  - Pre-existing repository Jest baseline failures (`69` suites / `337` tests in `jest-full2.json`) remain separate from the focused residual parity suites (all passing).

## Checkpoint — Final 1:1 Visual, Drawer, Navigator & Terminal Parity Verification (2026-11-14)

- **Code & UI Changes Completed (`feature/lens-dark-parity-pod-drawer-navigator`)**:
  - `packages/core/src/renderer/components/novakube.scss` + `packages/core/src/renderer/themes/__tests__/lens-2026-novakube-parity.test.ts`:
    - Cleaned `.workspace-header-controls` (`218px` `#181A1C` strip), collapsed `.workspace-nav-controls` to `0x0`, and kept `.workspace-indicator` / `[data-testid="workspace-create"]` hidden until hover/focus.
    - Adjusted Navigator tree X-indents (`iconX: 2`, `pinX: 22`, `labelX: 41`; L1 `iconX: 30`, `expandX: 11`; L2 `labelX: 39`).
    - Tuned `.Pods .TableCell` widths (`name 172px`, `memory 78px`, `containers 86px`, `restarts 74px`, `owners 104px`, `status 84px`) so values/statuses render without clipping.
  - `packages/core/src/renderer/components/layout/sidebar.tsx` & `navigator-cluster-row.tsx`:
    - Rendered active cluster first (expanded) and all remaining clusters below its tree via `allClusters.filter(entity => entity.getId() !== activeEntity?.getId()).map(renderOtherCluster)`.
    - Included `entity.metadata.source` in cluster tooltip (`"k3s-vps-wireguard (local)"`).
  - `packages/core/src/renderer/components/kube-object-meta/kube-object-meta.tsx` & `r4-07-kube-object-meta.test.tsx`:
    - Lazy-loaded unloaded owner stores via `React.useEffect` so `Controlled By` displays `verified` state with navigable links (verified live on `traefik` Pod -> `ReplicaSet` drawer, plus `Deployments`, `ConfigMaps`, `Services`, `Nodes` drawers at `725px` width).
  - `packages/core/src/renderer/components/drawer/drawer.tsx`:
    - Guarded `navigator.clipboard?.writeText?.(itemName)` with `Promise.resolve(...).catch(...)` and textarea `document.execCommand("copy")` fallback so clicking `content_copy` cannot trigger an unhandled `NotAllowedError` React error overlay.
  - `packages/core/src/features/shell-sync/main/compute-shell-environment.injectable.ts` & `packages/core/src/main/kubectl/kubectl.ts`:
    - Cached computed UNIX shell environment per shell for `60_000ms` with background refresh and cached `Kubectl.bundledFallbackUrls` plus `ensureDir(this.dirname, 0o755)` in `writeInitScripts()`, removing repeated `kubectl` 404 loops and spawning `/bin/zsh` terminal in `599ms`.
- **Verification**:
  - Focused Jest (`-w 2`, post-final-edit): `11` suites (`135` tests, `1` snapshot) PASS.
  - Live `1440x900` (`2880x1800` Retina) side-by-side & 3x diff composites saved in `docs/screenshots/lens-2026-audit/`: `compare-01-pods.png` (`20.6%`), `compare-02-pod-drawer.png` (`22.3%`), `compare-03-overview.png` (`13.4%`), `compare-04-preferences.png` (`9.0%`), plus `05-home-novakube.png`.
  - Flow 08 Logs Dock (`280px` -> minimize `37px` -> re-open -> `280px`), Preferences workspace tab + `Escape`, and Drawer `content_copy` (`hasErrorOverlay: false`) all verified live in Electron DEV.
  - **Standalone ARM64 (Normal `/bin/zsh`, Live Cluster, `2026-11-14`)**: Rebuilt and verified `open-lens/dist/mac-arm64/OpenLens DevOps.app` (`Mach-O 64-bit executable arm64`, `codesign --verify --deep --strict` valid on disk) with isolated `--user-data-dir` (normal `/bin/zsh`, no `/bin/sh` override) outside DEV (`PORT_9191=0`, `https://lens.app:65074/welcome`): live `k3s-vps-wireguard` (`23` Pods, active-cluster-first Navigator ordering + remaining clusters below tree), `725px` Pod Drawer (`verified` owner, `content_copy` `hasErrorOverlay: false`), Flow 08 Logs Dock (`348 -> 37 -> 348`), and `/bin/zsh` Terminal (`743ms`, `xtermH: 238`, `ARM64_ZSH_OK` / `/bin/zsh`, single `[SHELL-SYNC]` + cached `kubectl` fallback). Screenshot: `docs/screenshots/lens-2026-audit/06-standalone-arm64-verified.png`.
