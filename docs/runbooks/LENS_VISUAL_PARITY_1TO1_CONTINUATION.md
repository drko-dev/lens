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
