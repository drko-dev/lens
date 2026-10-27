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
- T1 — S1 navigation/tree/selection — inline — completed — commit: pending.
- T2 — S2 shared list hierarchy/controls — inline — pending — commit: pending.
- T3 — S3 shared KPI removal — inline — completed — commit: `71faad2`.
- T4 — S4 continuous favorites — inline — pending — commit: pending.
- T5 — S5 clean ARM64 candidate, isolated runtime checks, and visual handoff — inline — pending — commit: N/A (candidate artifact).

Forecast: approximately 300 authored changed lines across the four behavior commits; generated candidate output excluded.

## Log

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
