# Functional Audit Recovery Checkpoint

- **Date**: 2026-11-14
- **Branch**: `feature/lens-dark-parity-pod-drawer-navigator`
- **Base Claude HEAD**: `a11711e6be96afe53db5bf512a0a45ea56da3190`
- **Pre-merge `develop`**: `07c412b6f021c0ec9d800da7a85c658bc89661e3`
- **Status**: Functional fixes implemented & focused Jest + H7 E2E subset verified; ready for commit, local `develop` FF, and macOS ARM64 standalone build + QA.

## Fixes Completed & Verified
1. **Catalog 960px Horizontal Clipping**: `catalog.module.scss`, `catalog-filters.module.scss`, `r5-08-catalog-presentation.test.tsx` (`PASS`).
2. **F11 Overview Metrics Chart X-Axis Overlap (960px)**: `bar-chart.tsx`, `bar-chart.test.tsx` (`PASS`).
3. **Workspaces Lifecycle (Create, Rename, Switch, Delete)**: `workspace-persistence-store.ts`, `workspace-tab-bar.tsx`, `novakube.scss`, `workspace-persistence-store.test.ts` (`PASS`).
4. **Global Docking `onDragLeave` (`relatedTarget: null` inside host bounds)**: `global-panel-host.tsx`, `global-panel-host-drag.test.tsx` (`PASS`).
5. **Navigator Multi-Cluster Switching from Cluster Iframe**: `sidebar.tsx` (`NAVIGATE_IN_APP`), verified E2E `D16`, `V10`, `P15`, `DC08`, `TM11` (`PASS`).
6. **macOS Traffic Lights Alignment & Hotbar Catalog Gear Badge**: `create-application-window.injectable.ts` (`trafficLightPosition: { x: 14, y: 18 }`), `create-electron-window.injectable.ts`, `create-lens-window.injectable.ts`, `novakube.scss` (`overflow: visible`, badge `right: -4px; bottom: -4px`).

## H7 E2E Subset & Persistence Honest Notes
- `D16`, `V10`, `P15`, `DC08`, `TM11`, `QA00`: **PASS** after fixes.
- `V09`, `DC07`: **FAIL** in isolated `H7_ONLY` subset due to `H7_ONLY` skipping prerequisite `V08` state / `freshHost` not resetting `V(deployments, pods)` between tests.
- `GV03`, `GV05`, `GV11`: **FAIL** because `dock-qa/profile` already persisted `H(catalog, settings)` in root host, making right-edge drag of `settings` onto `catalog` a layout no-op (`undefined`).
- `PS01–PS16`: Live layouts (`H(deployments, pods)`, `V(pods, deployments)`, `tabs[*pods,deployments]`, `tabs[pods,*deployments]`, Cluster B `V(deployments, pods)`) executed and **persisted to disk** under `appdata/OpenLens DevOps/lens-local-storage/*.json` (`e2678a5b...json`, `94fc3175...json`, `app.json`), while `h7-docking-e2e.mjs` polled `OpenLens DevOpsDev/lens-local-storage` (`QA_STORE_DIR` mismatch under `NODE_ENV=development` without `H7_PACKAGED_APP`).

## Focused Jest Suites (`-w 2`)
- Modified modules (`global-panel-host-drag`, `workspace-tab-bar`, `workspace-persistence-store`, `bar-chart`, `r5-08-catalog-presentation`): **5 suites, 42 tests PASS**.
- Hotbar (`hotbar-entity-icon`, `hotbar-menu`, `hotbar-reviewer-findings`): **3 suites, 10 tests PASS**.
- Navigator row (`navigator-cluster-row`): **1 suite, 2 tests PASS**.
- AI / Incidents / RBAC / Kubetail / Terminal: **16 suites, 142 tests PASS**.
- AI provider security & OAuth (`h8-8-01b`, `h8-8-02`, `h8-3-1`, `h8-8-03`): **4 suites, 95 tests PASS**.
