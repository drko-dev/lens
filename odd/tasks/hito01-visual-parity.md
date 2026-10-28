# Hito 01 — Visual parity correction
Objective: align shared Kubernetes navigation, resource-list hierarchy, compact controls, KPI visibility, and favorites access with the supplied official Lens reference.
Branch: `feat/v6-ui-corrections`. Delivery: four focused commits; test runner: Jest via `npm run test:unit --workspace @openlens/core`.

## Specs

### S1 — Navigation hierarchy and selection
Authorized scope: shared Kubernetes tree navigation, sibling resource tabs that duplicate tree destinations, and selected/hover/focus states.
Acceptance: resources are reachable and switchable through the tree; the top workspace tabs remain available for open cluster views; selected Workloads does not obscure text with a saturated fill; active tree nodes use one discreet indicator.
User requirements (verbatim): “La referencia oficial organiza los recursos principalmente mediante el árbol lateral y usa las pestañas superiores para las vistas abiertas.” “Reorganizar esa navegación para que coincida con Lens oficial, preservando la posibilidad de abrir y cambiar entre recursos.” “Workloads no debe aparecer con un gran relleno celeste.” “Los recursos deben presentarse como elementos del árbol de navegación.”
Checks: shared sidebar and route tests; resource sibling navigation remains functional; `git diff --check`.

### S2 — Resource list structure and compact controls
Authorized scope: shared list header, namespace/search/filter arrangement, and removal of duplicate navigation levels through existing shared layout components.
Acceptance: namespace, search, and useful filters stay compact immediately above the table; no unnecessary control row is added; the same layout applies to Pods, Deployments, Nodes, and equivalent lists.
User requirements (verbatim): “En Lens oficial, namespace, búsqueda y controles están agrupados de manera compacta antes de la tabla.” “Reproducir esa disposición sin agregar nuevas filas de controles innecesarias.” “Tabla ubicada directamente debajo de los controles.”
Checks: focused shared list-layout tests; existing search, namespace, filter, CSV, and table interactions remain available.

### S3 — KPI cards
Authorized scope: the pre-existing WIP removal of the shared `WorkloadInsightsBar` render path in `kube-object-list-layout.tsx`, committed separately from other work.
Acceptance: the four cards “Total Pods.”, “Healthy / Ready.”, “Degraded / Issues.”, and “Namespaces.” do not render over resource lists; compact filters and useful table metrics remain.
User requirements (verbatim): “Eliminar visualmente las cuatro tarjetas superiores de las vistas de recursos donde aparecen:” “No deben ocupar espacio encima de las tablas.” “Preservar filtros compactos y métricas útiles de las tablas.”
Checks: `KubeObjectListLayout` consumers show no insights bar while quick filters, namespace selection, search, CSV export, and table rows remain.

### S4 — Continuous vertical favorites
Authorized scope: favorites/hotbar presentation and the smallest necessary existing storage interactions; no persisted format change unless strictly required.
Acceptance: every favorite across existing hotbars is visible in one vertically scrollable column; order and persistence survive restart; drag reorder and remove remain available; users can reach the 20th and 25th favorite without a page selector or horizontal pagination.
User requirements (verbatim): “La navegación entre favoritos debe ser vertical y continua, sin depender de paginación horizontal.” “No dar por cumplido este requisito porque un SCSS contenga `overflow-y: auto`.” “La interacción debe funcionar realmente.” “Conservar orden y persistencia de los favoritos.”
Checks: storage and hotbar interaction tests cover scrolling-accessible aggregate ordering, reordering, removal, and persisted order.

### S5 — Candidate and acceptance boundary
Authorized scope: build one clean ARM64 candidate from the completed commits and provide evidence; keep the stable v6 and rollback artifacts unchanged.
Acceptance: candidate uses the committed UI changes and includes native dependencies; comparison uses the supplied Lens official reference at matching viewport/theme; do not claim approval before user acceptance.
User requirements (verbatim): “Realizar una comparación visual con Lens oficial a igual tamaño de ventana y tema.” “Entregar capturas reales de Pods y otra vista equivalente.” “No afirmar que la aplicación está visualmente aprobada sin la confirmación del usuario.” “Conservar la v6 estable, el candidato actual, la evidencia y los checkpoints.”
Checks: focused tests per commit; one full source build and ARM64 package at task closure; app tested with isolated data paths and write/read guards; visual review remains user-owned.

## Tasks
- T1 — S1 navigation/tree/selection — inline — completed — commit: `e2c51ab`.
- T2 — S2 shared list hierarchy/controls — inline — completed — commit: `9e7b20f`.
- T3 — S3 shared KPI removal — inline — completed — commit: `71faad2`.
- T4 — S4 continuous favorites — inline — completed — commit: `03ff358` (`feat: keep favorites in one vertical list`).
- T5 — S5 clean ARM64 candidate, isolated runtime checks, and visual handoff — inline — pending user visual acceptance — candidate artifact: `open-lens/dist-stage-v6-ui-corrections-20261027/mac-arm64/OpenLens DevOps.app` (provenance: `BUILD-PROVENANCE.md`).
- T6 — S6 fully autonomous QA (isolated test cluster, GUI automation, reviewer-finding reproduction/fixes, captures, QA report) — inline — in progress.

Forecast: approximately 300 authored changed lines across the four behavior commits; generated candidate output excluded.

## Log
L7 (2026-10-28, cierre del Hito 01): el usuario aceptó el QA funcional y el informe comparativo y pidió auditoría final previa al Hito 02 — veredicto: las columnas CPU/Memory de Pods nunca existieron en la línea consolidada (v6 estable idéntica: 10 columnas); es una limitación anterior y no una regresión de Hito 01; el roadmap §4 pide CPU/RAM como columnas, corregible en Hito 02 con dos injectables nuevos (`podListLayoutColumnInjectionToken`). Diferencias Navigator/pestañas documentadas con procedencia de decisiones en `open-lens/qa/2026-10-27/visual-parity/hito01-closure-audit.md` (separación verbatim del usuario vs interpretaciones de desarrollo). Inventario de disco: TMPDIR ~90 MB descartable, ~2.3 GB recuperables con confianza (worktree scratch `hito01-clean-db40bbe` + scratch del día) y opcional con confirmación: `open-lens/dist/hito01-arm64` (644 MB intermedia superseded); minikube qa y checkpoints protegidos. Sin cambios de código.
L6 (2026-10-27, autonomous QA): instrucción obligatoria del usuario: QA 100% autónomo con clúster aislado, sin pruebas manuales, sin delegar trabajo, con capturas y repro/resolución de las 5 observaciones del reviewer antes de cerrar el Hito 01. Ejecutado: escenarios S1–S9 (ver `open-lens/qa/2026-10-27/qa-report.md`), incluida terminal con pty nativo verificado vía SearchAddon y 35 favoritos con reordenamiento persistido. Observaciones del reviewer F1–F5 reproducidas y fijadas con tests (4 nuevos, todos verdes); sin defectos bloqueantes; semántica heredada de Lens v6.x documentada en el reporte.


### L1 — Original request (verbatim)

# OpenLens DevOps — Corrección de rumbo: paridad visual real con Lens oficial

**PRIORIDAD ALTA — NO ES UN RETOQUE COSMÉTICO**

El usuario abrió el candidato del Hito 01 y manifestó que prácticamente no ve diferencias respecto de la versión anterior.

El Hito 01 NO tiene aprobación visual.

El objetivo sigue siendo reproducir la distribución y apariencia de Lens oficial, utilizando las capturas proporcionadas como referencia principal.

## 1. Antes de modificar nada

Leé el roadmap completo:

`docs/OPENLENS_DEVOPS_ROADMAP_VISUAL_2026-10-27.md`

Verificá el estado Git y el candidato que se ejecutó. No modifiques el checkpoint estable de v6.

Investigá por qué los ajustes realizados en los tres archivos SCSS no producen una diferencia apreciable. Comprobá que los estilos se apliquen efectivamente a los elementos correctos en el runtime; revisá clases, especificidad, temas y CSS calculado.

No consideres un diff de SCSS como evidencia visual.

## 2. Rediseño estructural visible

La comparación debe abordar las diferencias concretas que el usuario señaló.

### A. Barra superior y pestañas

En OpenLens DevOps aparecen niveles adicionales de navegación y pestañas de recursos como Overview, Pods, Deployments, DaemonSets y StatefulSets.

La referencia oficial organiza los recursos principalmente mediante el árbol lateral y usa las pestañas superiores para las vistas abiertas.

Reorganizar esa navegación para que coincida con Lens oficial, preservando la posibilidad de abrir y cambiar entre recursos.

No limitarse a reducir alturas o márgenes unos píxeles. Revisar la jerarquía completa.

### B. Sidebar de Kubernetes

Reproducir la disposición del árbol lateral que aparece en la captura oficial.

- Workloads no debe aparecer con un gran relleno celeste.
- La selección debe ser discreta y no dificultar la lectura.
- Los recursos deben presentarse como elementos del árbol de navegación.
- Respetar indentación, separación, jerarquía y contraste de Lens oficial.

Esta corrección debe aplicar en toda la aplicación, no exclusivamente en Pods.

### C. Eliminar tarjetas KPI

Eliminar visualmente las cuatro tarjetas superiores de las vistas de recursos donde aparecen:

- Total Pods.
- Healthy / Ready.
- Degraded / Issues.
- Namespaces.

No deben ocupar espacio encima de las tablas.

Inspeccionar el componente compartido `WorkloadInsightsBar` y el cambio pendiente en `kube-object-list-layout.tsx`.

Ese cambio ya existe sin commit en el worktree principal. No perderlo ni sobrescribirlo: integrarlo de forma controlada, con un commit independiente y verificaciones apropiadas.

Preservar filtros compactos y métricas útiles de las tablas.

### D. Distribución de controles

En Lens oficial, namespace, búsqueda y controles están agrupados de manera compacta antes de la tabla.

Reproducir esa disposición sin agregar nuevas filas de controles innecesarias.

### E. Favoritos

Revisar específicamente el control inferior con número y flechas que el usuario señaló.

La navegación entre favoritos debe ser vertical y continua, sin depender de paginación horizontal.

No dar por cumplido este requisito porque un SCSS contenga `overflow-y: auto`.

La interacción debe funcionar realmente.

## 3. Resultado visual obligatorio

El cambio debe ser claramente observable.

Al abrir Pods, el usuario debe ver:

- Navegación superior equivalente a Lens oficial.
- Árbol lateral compacto y legible.
- Ausencia de las cuatro tarjetas KPI.
- Controles de namespace y búsqueda compactos.
- Tabla ubicada directamente debajo de los controles.
- Mayor área útil para los recursos Kubernetes.
- Sin grandes resaltados celestes.
- Comportamiento coherente al cambiar a Deployments, Nodes y otras vistas equivalentes.

No es suficiente modificar valores de 1 a 3 píxeles.

## 4. Método de implementación

Trabajá con cambios acotados sobre componentes existentes.

No incorporar dependencias innecesarias ni reescribir funcionalidades sin motivo.

Usar commits separados para navegación, estructura, KPI y favoritos, evitando mezclar trabajo.

Proteger la v6 estable y conservar los checkpoints de rollback.

No modificar kubeconfigs, perfiles reales, autenticación ni proxies.

## 5. Validación

Construir un candidato ARM64 ejecutable con todas las dependencias nativas correctamente empaquetadas, incluido `node-pty`.

Evitar repetir el error de `pty.node`.

Probar con perfil aislado, sin acceder a Kubernetes real.

Realizar una comparación visual con Lens oficial a igual tamaño de ventana y tema.

Entregar capturas reales de Pods y otra vista equivalente.

No afirmar que la aplicación está visualmente aprobada sin la confirmación del usuario.

## 6. Limpieza

Después del build, inventariar y eliminar exclusivamente artefactos temporales verificados como prescindibles.

Conservar la v6 estable, el candidato actual, la evidencia y los checkpoints.

Informar espacio libre antes y después.

## 7. Criterio de cierre

El hito debe presentar una diferencia visual clara respecto de la v6 anterior y una distribución comparable a Lens oficial.

Entregar la aplicación ejecutable, los commits y las capturas comparativas.

No avanzar a nuevas funcionalidades ni al branding.

**La prioridad es cumplir el diseño solicitado, no acumular commits ni reportes de tests.**

### L2 — Evidence and current branch state
- The active branch is `feat/v6-ui-corrections` at `db40bbe`; the only pre-existing tracked WIP is the KPI removal in `packages/core/src/renderer/components/kube-object-list-layout/kube-object-list-layout.tsx`.
- CodeGraph/source evidence shows `SiblingsInTabLayout` renders the same sidebar child registrations as resource tabs, so the current hierarchy duplicates navigation; the resource routes already have direct sidebar `onClick` handlers.
- Existing in-repo captures show OpenLens states only; the official Lens image itself is not currently discoverable in the repository. No runtime or screenshot comparison has yet been performed in this turn.
- KPI WIP was committed separately as `71faad2`; the focused quick-filter/export checks pass (2/2). The broader list-layout test still fails its rendered markup snapshot on density and resizable-column markup, unrelated to the KPI assertion. Navigation regression tests were observed RED before the shared route/tree fix.
- T1 tests were observed RED before the fix. The shared resource sibling tab strip is now suppressed for built-in sidebar groups, active routes reveal the selected tree node when expansion has not been explicitly stored, and extension-owned sibling tabs remain enabled. The core/extension/visibility/order navigation suites pass 69/69 with updated DOM snapshots.

### L3 — Independent review and candidate verification
- Gentle AI is not installed as a Git pre-commit hook in this worktree; the global RDD mode is enabled, so its native review lifecycle remains governed by that user-owned switch and is not bypassed. An earlier preflight became stale after source changes and will not be reused.
- The current source build, tray icon generation, and ARM64 packaging succeeded offline with Node 20.20.2; candidate: `open-lens/dist-stage-v6-ui-corrections-20261027/mac-arm64/OpenLens DevOps.app`. `app.asar` SHA-256: `066225ae48d329dccc3521e399b1462279a2cddf20651e4329c20425359c09ce`; node-pty ARM64 binaries are present under `app.asar.unpacked`.
- Isolated packaged-app smoke passed: app is packaged, userData stayed under a fresh `/tmp` CICD path, catalog had zero entries, no real kubeconfig reference appeared, and preferences opened. A local demo cluster reached its cluster route, but the resource pane remained loading; this is not a successful Pods runtime check.
- Fresh focused tests observed GREEN in the source worktree and an independent scratch: 3 suites, 11 tests, 1 snapshot. The separate independent full-core run in scratch failed before executing assertions (395 suites failed at JSDOM teardown, 0 tests). No official Lens reference capture was available, so visual parity and user approval remain pending.

### L4 — Receipt-driven review closed (2026-10-27)
- The frozen workspace transaction `review-0b66a452d46a1e01` (target `sha256:ce4b906e…`, tier medium, 365 changed lines) completed after the reviewer's 5-hour limit reset: capture fell due to the provider limit twice before the reset, reoffered after it, captured once, and the native receipt returned `approved` on the first admitted reliability capture; authority burned via exact `review.acknowledge-approved`. No correction opened.
- The initial frozen candidate drifted while the user kept editing; the user confirmed the drift, and the final state was committed as `9e7b20f` (compact list header) and `03ff358` (vertical favorites) before the review capture, so the approved receipt covers the committed four-block state.
- Reviewer findings (all WARNING, informational, explicitly non-blocking, do not reopen this review): duplicate React keys when one entity is pinned to two hotbars; add-item still writes only the now-hidden active hotbar; a single drag rewrites and compacts every hotbar; remove removes the entity from every hotbar; quick filters now render inside the header so they disappear when a customizer suppresses it. Recorded here as later-work candidates, not accepted corrections.
- Cleanup after build: 17 scratch items under `/tmp` (verify copies, build logs, sandbox app-data/HOME/KUBECONFIG dirs, asar proof, unit-test homes) were verified as same-day artifacts of this execution and deleted; free space went 17 GiB → 20 GiB (build phase had started with 20 GiB and ended at 16 GiB). Stable v6 (`20d3d96`), the dist-stage candidate, its evidence, and rollback checkpoints are kept; no release directory was overwritten.

### L5 — New user instruction: 100% autonomous QA (2026-10-27, verbatim key fragments)

> # INSTRUCCIÓN OBLIGATORIA — QA 100 % AUTÓNOMO
>
> Codex, a partir de este momento sos responsable de ejecutar TODAS las pruebas de OpenLens DevOps de principio a fin.
>
> **El usuario NO realizará más pruebas manuales.**
>
> …
>
> 1. Preparar y administrar un clúster Kubernetes de pruebas completamente aislado, sin utilizar credenciales ni clústeres reales.
> 2. Compilar y ejecutar OpenLens DevOps en macOS ARM64.
> 3. Automatizar la interfaz gráfica mediante Playwright, Electron/CDP o las herramientas de control de escritorio disponibles.
> 4. Conectar la aplicación al Kubernetes de pruebas y verificar que los recursos se carguen correctamente.
> 5. Probar navegación, Pods, Deployments, Nodes, tablas, namespace, búsqueda, filtros, exportación y terminal integrada.
> 6. Probar la barra de favoritos con al menos 25 elementos, incluyendo scroll, reordenamiento y persistencia.
> 7. Reproducir las cinco observaciones pendientes del reviewer y resolver los defectos confirmados mediante cambios acotados y revisados.
> 8. Obtener capturas REALES de la aplicación ejecutándose y comparar la interfaz con Lens oficial cuando exista una referencia accesible.
> 9. Verificar que no existan errores fatales, regresiones ni problemas de empaquetado.
> 10. Limpiar los recursos temporales utilizados durante las pruebas sin afectar datos del usuario ni releases estables.
>
> **PROHIBIDO delegar las pruebas al usuario.**
>
> Si existe una limitación técnica o de permisos que realmente impida continuar, documentá el bloqueo con evidencia y explicá qué capacidad falta. Nunca reemplaces una prueba no ejecutada por un resultado supuesto.
>
> Para cada escenario, informá PASS, FAIL o BLOCKED, acompañado de evidencia verificable.
>
> Guardá capturas, logs, resultados y un reporte final de QA en el repositorio, sin incluir secretos ni datos personales.
>
> No declares aprobado el Hito 01 mientras existan fallos críticos o pruebas esenciales bloqueadas.
>
> **Tu entrega no es una aplicación para que el usuario pruebe: es una aplicación que VOS ya probaste, acompañada de la evidencia de funcionamiento y de las limitaciones que correspondan.**
>
> No avanzar al siguiente hito hasta completar esta validación.

### S6 — Autonomous QA requirements

- QA runs entirely by the agent: isolated test cluster (`minikube --driver=qemu` with isolated `MINIKUBE_HOME`/`KUBECONFIG` under the sanctioned scratch area), GUI automation via repo-installed Playwright `_electron`.
- Every scenario reports PASS, FAIL or BLOCKED with verifiable evidence stored under `open-lens/qa/` (screenshots, logs, DOM dumps). Never substitute an unexecuted test with an assumed result.
- Reproduce the five reviewer findings; fix only confirmed defects with scoped changes that go through the focused-test policy and the native review lifecycle.
- Stable v6, release directories, real kubeconfigs, and user data stay untouched; QA scratch lives outside the worktree.
