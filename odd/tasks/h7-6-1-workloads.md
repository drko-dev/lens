# H7.6.1 — Workloads in the global docking host

Objective: host StatefulSets, DaemonSets, ReplicaSets, Jobs and CronJobs in GlobalPanelHost like Pods/Deployments.
Branch: `feature/global-docking-h7` (base `55bd034`). Delivery: single commit `feat(h7): extend global docking to workload views`, no push/merge.
Runners: jest (packages/core), Playwright Electron (`open-lens/integration/h7-docking-e2e.mjs`, `H7_ONLY`).

## Specs

- S1 Catalog: "El catálogo global debe ofrecer ahora exactamente estos siete tipos de workloads: Pods. Deployments. StatefulSets. DaemonSets. ReplicaSets. Jobs. CronJobs." "No habilitar todavía Events, Secrets, Terminal, Editor, Details ni Kubetail dentro del host." Single instance per kind kept.
- S2 Routes: "No agregar cinco condiciones dispersas por la aplicación. Centralizar la información necesaria para identificar las rutas compatibles" / "Evitar que una ruta admitida desmonte todo GlobalPanelHost." / "Mantener la navegación clásica cuando el flag está apagado." / "Mantener la navegación clásica para rutas no admitidas." Tests: "navegar entre los siete workloads admitidos conserva el host".
- S3 Reuse: "No duplicar los componentes originales de Lens." Existing list components rendered unchanged.
- S4 Detach: "No habilitar automáticamente el botón de desacople para los cinco tipos nuevos." Use `detachedListKinds` (explicit declaration).
- S5 Docking behaviors reused (drag, tabs, reorder, resize, collapse, restore, close, keyboard, cluster identity); "No crear una versión especial de docking para cada workload."
- S6 Synthetic API extended with valid lists of the five kinds; watches/Disconnect/no writes verified.
- S7 Playwright WL01–WL15 (table in L1), real mouse/keyboard, no SKIP; then full regression (target 87 real PASS).
- S8 Unit tests: registration, catalog of seven, route resolution, host preserved across routes, unknown kinds rejected, clusterId isolation, docking compatibility.
- S9 Visual design unchanged. S10 Doc `docs/H7_6_1_WORKLOADS_GLOBAL_DOCKING.md`. S11 Resources: build only above safe disk; one build/Electron at a time.

## Tasks

- T1 S1,S3,S4,S8 register 5 kinds (types, catalog, resolver, policy) + unit tests — inline — done (RED: module missing; GREEN jest 175/175)
- T2 S2,S8 centralized route→kind map, gate, route panel resolution + tests — inline — done (same run)
- T3 S6 synthetic API lists for 5 kinds — inline — done (smoke: 7 paths 200 with 1 item)
- T4 S11 renderer build — inline — done (17 s, 1.5 GB RSS, 42 pre-existing TS errors, bundle contains change)
- T5 S5,S7 Playwright WL01–WL15 + full regression — inline — done (full run 2026-11-03T10-27-41: 87/0/0/0)
- T6 S10 doc + commit — inline — done (d103dd5)

## Log

- L1 (2026-11-03) User request: prompt "OpenLens DevOps — H7.6.1: Workloads en el docking global" (full text in session; WL01–WL15 table: Abrir StatefulSets/DaemonSets/ReplicaSets/Jobs/CronJobs, Abrir los siete tipos desde el catálogo, Navegar entre workloads sin desmontar el host, Arrastrar un workload nuevo hacia otro, Agrupar workloads como pestañas, Cambiar y reordenar pestañas, Replegar y restaurar una vista nueva, Cerrar y reabrir desde el catálogo, Identidad de color, entorno y clúster, Desacople no disponible para tipos todavía no soportados, Disconnect y ausencia de watches huérfanos).
- L2 Start: disk 22 GiB free, swap 9.6/11.2 GiB, HEAD 55bd034 clean. Architecture confirmed: PanelKind + PANEL_CATALOG + PanelContentResolver + globalPanelPolicy.allowedKinds + should-use-global-panel-host gate; detach declared by `detachedListKinds`.
- L3 Side effect found and fixed: Kubetail's catalog modal had no filter, so the 5 new catalog items would have appeared there. Added `policyOnly` to the catalog item; a store without policy (Kubetail) refuses them; Kubetail modal now passes `isKindAllowed`. Pinned by unit test.
- L4 Existing tests updated because they encoded the old 2-kind catalog: H2 `PANEL_CATALOG.length` 7→12; Playwright D13 now expects the 5 new kinds offered.
- L5 Route resolution: navigating to a hosted route brings its panel into view (add once / restore if collapsed / leave detached), via a reaction in the host; host never remounts across hosted routes.
- L6 WL run 1: 8/7 — Jobs/CronJobs empty: JobApi/CronJobApi use checkPreferredVersion → GET /apis/batch returned 404 in the mock. Mock now serves APIGroup for apps/batch. Run 2: 14/1 (WL09 dropped on an inactive tab, test bug). WL09 alone PASS.
- L7 Full regression 87 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED; 0 rejected writes; console 162 all HMR. Historical evidence restored with git checkout; session artifact settings-pink.jpg removed. Commit d103dd5. No push/merge. H7.6.2 not started.
