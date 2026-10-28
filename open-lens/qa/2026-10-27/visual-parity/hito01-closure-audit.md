# Hito 01 — Cierre: auditoría final (2026-10-28)

Alcance: verificación sin cambios de código de (1) las columnas CPU/Memory en Pods, (2) las diferencias estructurales Navigator/pestañas vs árbol lateral con procedencia de decisiones, y (3) el inventario de disco con propuesta de limpieza segura. No se reconstruye ni inicia Hito 02.

## 1. Columnas CPU/Memory en Pods — limitación anterior, no regresión

**Veredicto: limitación heredada upstream (pre-existente). No es regresión de Hito 01 ni regresión de la v6 estable.**

Evidencia:

- La carpeta `packages/core/src/renderer/components/workloads-pods/columns/` del candidato (feat/v6-ui-corrections @ `372cec8`) contiene solo 10 injectables: name, namespace, status-icon, status, containers, restarts, owners, node, qos, age. `git grep pods-cpu/pods-memory` sobre el commit base `db40bbe`, la rama completa y el repo base `/Users/gustavomarcon/Documents/lens/lens` (HEAD `22fbe98`) devuelve **cero coincidencias**: esas columnas nunca existieron en esta línea de código.
- El HEAD del repo base (v6 consolidada R1–R3) tiene el mismo set de 10 columnas — comparación byte a byte del directorio, idéntica. Por lo tanto la v6 estable tampoco las mostraba.
- Los commits de Hito 01 no tocaron columnas: `71faad2` (fix: remove workload insights cards) alteró solo `kube-object-list-layout.tsx` (+ reverencia de test) y `9e7b20f` (feat: compact Kubernetes list header) alteró `item-object-list/header.tsx`, `list-layout.tsx` y estilos/tests del header. La captura del lado fork (`evidence/s7-pods-qa-ns.png`, 22m) muestra las 5 filas con `Running` en verde, lo que además confirma que ya entonces no había columnas CPU/Memory.
- El consumo real de fila no cambió con Hito 01: la fila de Pods ya era `no-KPI` antes del Hito; lo que aprobó el usuario fue quitar las 4 tarjetas `Total Pods / Healthy-Ready / Degraded-Issues / Namespaces` de encima de las tablas.

Lectura del roadmap (conflicto documentado):

- `docs/OPENLENS_DEVOPS_ROADMAP_VISUAL_2026-10-27.md` §4 (verbatim): "Quitar la barra compartida WorkloadInsightsBar … **Mantener filtros útiles en formato compacto, CPU/RAM, estados, columnas, orden, resize, export y búsqueda**" — con "Tabla visible inmediatamente bajo controles compactos en Pods, Deployments y otras listas".
- Aceptación S3 (feature doc, verbatim requisito del usuario): "**Preservar filtros compactos y métricas útiles de las tablas**".
- Lens 2026 oficial sí muestra CPU y Memory en la tabla de Pods (evidencia `p02-official-pods-qa.png`).

Clasificación del desvío: el roadmap exige columnas CPU/RAM y el código heredado nunca las tuvo, por lo que "preservar" no encontró nada que preservar: la exclusión se hereda de la línea upstream consolidada, donde la hoja de columnas de Pods nunca incluyó métricas. Hito 01 compiló y empaquetó tal cual, y el QA funcional (s7) registró las columnas NAME…STATUS sin plantearlas como desvío explícito. Es un **desvío de roadmap heredado también por la v6 estable**, invisible comparando contra el código propio y visible solo comparando contra el producto oficial 2026.

### Propuesta mínima de corrección (sin ejecutar, para Hito 02)

- Agregar 2 injectables `pods-cpu-column.injectable.tsx` / `pods-memory-column.injectable.tsx` (kind Pod, prioridades ≥60, token `podListLayoutColumnInjectionToken` — mismo patrón que `pods-qos-column.injectable.tsx`) reutilizando la plomería de métricas que ya existe en el workspace (`workloads-pods/metrics.injectable.ts`, `container-metrics.injectable.ts`).
- Valor: uso de CPU/memoria desde metrics-server si está disponible (estados "N/A" u oculto con toggle, como hace upstream en cluster-pie-charts/cluster-metric-switchers) — el costo es alto porque un toggle visible sin datos; propuesta mínima: N/A mensajizado según disponibilidad de métricas.
- Mismo reuso del patrón para Deployments en un segundo paso (roadmap menciona "Deployments y otras listas").
- Tests: snapshot/suite de list-layout con las nuevas columnas + doble de sortable-header; no tocar el header ni QuickFilters (S3 queda intacto).
- Ámbito de riesgo: es un cambio de producto en la tabla de metrics en feature flag (no rompe export/S3; distribución de ancho similar a upstream). Si el usuario solo quiere visible, mostrar `N/A` cuando falten métricas del kube API.

## 2. Navigator/pestañas 2026 vs árbol lateral del fork — procedencia de decisiones

Origen de la comparación: `open-lens/qa/2026-10-27/visual-parity/parity-report.md` (evidencia p01–p04 side of  Fork side: `evidence/s7-*`, `s8-*`).

### Decisiones explícitas del usuario (verbatim, feature doc `odd/tasks/hito01-visual-parity.md`)

| # | Requisito del usuario (verbatim) | Consecuencia implementada |
| --- | --- | --- |
| U1 | "La referencia oficial organiza los recursos principalmente mediante el árbol lateral y usa las pestañas superiores para las vistas abiertas." "Reorganizar esa navegación para que coincida con Lens oficial, preservando la posibilidad de abrir y cambiar entre recursos." | Recursos en árbol lateral; pestañas de recursos duplicados suprimidas (`e2c51ab`). |
| U2 | "Workloads no debe aparecer con un gran relleno celeste." "La selección debe ser discreta…" | Selección sutil tipo Lens (`dc5f686`, `db40bbe`). |
| U3 | "Los recursos deben presentarse como elementos del árbol de navegación." La corrección "debe aplicar en toda la aplicación". | Rutas core a través de sidebar compartida; extensible a todas las listas. |
| U4 | "En Lens oficial, namespace, búsqueda y controles están agrupados de manera compacta antes de la tabla." "Tabla ubicada directamente debajo de los controles." | Header compacto (ns + búsqueda + quickfilters arriba de la tabla) (`9e7b20f`). |
| U5 | "Eliminar visualmente las cuatro tarjetas superiores… No deben ocupar espacio encima de las tablas." "Preservar filtros compactos y métricas útiles de las tablas." | `WorkloadInsightsBar` dejado de renderizar (`71faad2`). **La mitad "métricas útiles" quedó pendiente origina el auditoría §1.** |
| U6 | "La navegación entre favoritos debe ser vertical y continua, sin depender de paginación horizontal." … "No dar por cumplido este requisito porque un SCSS contenga overflow-y: auto." "La interacción debe funcionar realmente." | Hotbar vertical scrolls real (`03ff358`; QA S9/S10 con scroll real y reorden persistido). |
| U7 | "Realizar una comparación visual con Lens oficial a igual tamaño de ventana y tema." "Entregar capturas reales de Pods y otra vista equivalente." "No afirmar que la aplicación está visualmente aprobada sin la confirmación del usuario." "Conservar la v6 estable, el candidato actual, la evidencia y los checkpoints." | Parity report con capturas reales de ambas apps; T5 queda **pendiente de aceptación visual del usuario**. |

### Interpretaciones introducidas durante el desarrollo (no verbatim del usuario)

| # | Interpretación | Dónde y de quién |
| --- | --- | --- |
| I1 | "$(los recursos) como elementos del árbol" = ocultar la strip de pestañas hermanas **solo en grupos built-in**, dejando vivas las pestañas de extensiones y el top-tab para vistas abiertas. El usuario pidió reorganizar; la regla de grupos/extensiones es nuestra. | S1 (`e2c51ab`), L2. |
| I2 | "Árbol lateral" se replica como **sidebar in-cluster** (Cluster/Nodes/Workloads/Config/…) navegando rutas de sidebar; Lens 2026 real usa un **Navigator (catalog tree) dockado + pestañas tipo browser** para vistas abiertas. Mismo resultado visual, semántica distinta documentada en el parity-report. | S1/S2 + parity-report (diferencia estructural, no defecto). |
| I3 | "Métricas útiles de las tablas" = la mitad verbatim que quedó en "qué quitar" (tarjetas) y en **definir qué son las métricas útiles** (hoy: QoS, Age, estado). El roadmap posterior pide CPU/RAM como columnas → originó la auditoría §1; propuesto para Hito 02. | S3 + roadmap §4. |
| I4 | Favoritos verticales = reescritura del hotbar en columna vertical con reorden dnd y scroll real; sin paginador. | S4 (`03ff358`). |
| I5 | El "criterio de cierre" del usuario ("distribución comparable a Lens oficial") se aceptó como **diferencia estructural documentada por área** y no clon pixel a pixel: el producto 2026 tiene Navigator del catalog dentro de cada vista, banner trial, footer de contexto y Release Notes tab; nuestro árbol es autocontenido. | parity-report. |
| I6 | QA 100% autónomo: definido por el usuario (L5); las implementaciones orbitadas (minikube qemu aislado, Playwright, SearchAddon para terminal, pruebas de reviewers F1–F5) son nuestras. | L5/S6, qa-report. |

Diferencia estructural restante con Lens 2026 que NO es decisión del usuario ni defecto: barra trial "GO PREMIUM" + footer `qa (v1.34.0)` + pestaña "Release Notes" solo oficial; hotbar de favoritos reescrito solo fork. Cambios no aprobados por el usuario que quedaron cortos: columnas CPU/Memory (§1) y export CSV/quickfilters que solo tiene el fork (mejora, no defecto).

## 3. Inventario de disco y limpieza segura

Estado: ~12 GiB libres. Total TN cuantificado el 2026-10-28.

### Qué ocupa (verificado con `du`)

| Área | Tamaño | Clasificación |
| --- | --- | --- |
| /Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections | 3 033 MB | Repo activo: node_modules 1 243, dist-stage (candidato Hito 01) 645, **`open-lens/dist/hito01-arm64` 644 (build intermedia superseded)**, binaries 134, estáticos, QA 11 |
| /Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections-worktrees | 2 138 MB | 1 worktree scratch `hito01-clean-db40bbe` (base pre-mitó 1, ya en git history; su node_modules 1.5–2 GB es scratch verification dejado de usar) |
| /var/tmp/om | 2 242 MB | minikube QA + kubeconfigs aislados (se necesita para Hito 02) |
| lens-v6-final | 1 570 MB | v6 estable — **PROTEGIDO** |
| releases/v6 + releases/R9-RC | 1 471 MB | Releases oficiales — **PROTEGIDO** |
| lens-r7-09-consolidation / lens / lens-r4 / _backups / lens-r6-visual-final | ~1.9 GB | checkpoints históricos — **PROTEGIDOS** |
| TMPDIR/opencode (qa/gui, verificación paralela, parity con originales no redactados) | ~3 000 MB | scratch activo del agent; las capturas oficiales no redactadas deben quedarse fuera del repo y pueden purgarse cuando el usuario confirme el cierre |
| TMPDIR scatter (geocam_*, lens-r8/r9, openlens-*, kubeconfig singletons, scoped_dir*, juju-mk*) | < 100 MB | tiles de ejecuciones hoy: descartables una vez verificados |
| playwright-artifacts-* | < 10 MB | descartables (mismas ejecuciones de hoy) |

### Propuesta de limpieza segura (sin borrar checkpoints, evidencia ni trabajo ajeno)

A. **Ejecutable con confianza inmediata (~2.3 GB, sin pérdida de trabajo ni evidencia):**
   1. `git worktree remove lens-v6-ui-corrections-worktrees/hito01-clean-db40bbe --force` (commit `db40bbe` está en historia; el worktree era scratch de independencia, se re-clone de historia si hace falta).
   2. El mínimo dev-scratch de TMPDIR del día que se verifica propio: `lens-r8-*`, `lens-r9-*`, `openlens-qa-*`/`openlens-h3*`/`openlens-r*`/`openlens-demo*` + singleton `kubeconfig-*`/`scoped_dir*`/`juju-mk*`/`playwright_artifacts*`/`h3d-*` que se usaron durante esta sesión (~< 60 MB).
   3. NO tocar: `geocam_*` (workflow ajeno), Exit code dist-stage cand, dist/hito01-arm64 (checkpoint), qa evidence, releases, v6-final, _backups, checkpoints r4/r7, /var/tmp/om, agena.

B. **Opcional con confirmación explícita (para liberar hasta ~2.9 GB adicionales):**
   - `open-lens/dist/hito01-arm64` (644 MB): build intermedia superseded por el candidato con provenance (`dist-stage-…-20261027`, SHA `066225ae48…`); es checkpoint del pipeline previo — solo borrar con OK del usuario (o archivar a disco externo, o generable con `npm run build:app` si volviera a hacer falta).
   - `node_modules` del repo activo (1 243 MB) solo si se acepta el costo: regenerable con `npm install`, pero sirve el día a día; no recomendado con 12 GiB.

C. **NO liberar a corto plazo:** /var/tmp/om (minikube qa) — Hito 02 lo necesita (2.2 GiB). Saber redundancia alternativa: resetear con `minikube delete` + `minikube start` libera 2.2 GiB pero obliga a recrear el cluster de QA en Hito 02 (despliegues, namespace y kubeconfig aislado) — no recomendado.

Antes/después informados como pide L1 §6: después de A quedarían ~14.3 GiB; después de A+B hasta ~17.2 GiB.
