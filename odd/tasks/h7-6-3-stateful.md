# H7.6.3 — Stateful components in global docking

Objective: state-ownership contracts for Details/Logs/Terminal/Editor/Kubetail; implement and validate Resource Details as pilot; enable session components only once invariants are proven.
Branch: `feature/global-docking-h7` (base `a4e4d14`). Delivery: separate commits (architecture/functionality/QA), no push/merge. Runners: jest (packages/core), Playwright Electron (`h7-docking-e2e.mjs`, `H7_ONLY`).

## Specs

- S1 Audit per component (Terminal, Editor, Logs, Details, Kubetail): the 10 questions of the prompt §3 (creator, identity, unmount, tab switch, drag, collapse, close, disconnect, keep/release, sharing with Kubetail).
- S2 Contract: "Un único propietario por sesión. Un único panel activo por identidad cuando corresponda. Ningún PTY duplicado. Ningún borrador perdido. Ningún watch o stream huérfano. Ningún cambio accidental de clusterId. Ninguna acción Kubernetes causada únicamente por mover un panel. Modo clásico intacto con el feature flag desactivado." "No reescribir todo `SplitPanelStore` ni `DynamicLayoutRenderer`."
- S3 Details pilot: descriptor with "`clusterId` / tipo de recurso / namespace cuando corresponda / nombre o identificador estable"; "No depender exclusivamente de la ruta activa"; reuse inspector, "No duplicar la implementación de Resource Details". Checks: open from a resource, beside Pods/Deployments, route change keeps resource, four sides, tabs, collapse/restore, close/reopen, distinct identities, namespace + clusterId.
- S4 "No habilitar Terminal ni Editor en el catálogo hasta demostrar sus invariantes de estado." Kubetail stays out of the global catalog. No detached-window changes; never weaken sandbox/contextIsolation.
- S5 Playwright Details block (open real detail, dock beside, tabs, collapse/restore, route change, close/reopen, resource+namespace+clusterId, no duplicated watches); session tests only for components actually enabled; full 103 regression after each functional increment.
- S6 Doc `docs/H7_6_3_COMPONENTES_CON_ESTADO.md` (matrix, lifecycles, decisions, risks, pilot result, tests, resources, enabled/excluded, plan, relation with H7.7).
- S7 Resources: >20 GiB for builds, one build/Electron at a time, synthetic Kubernetes only, no writes.

## Tasks

- T1 S1 audit (explorer, read-only, Opus) — delegated (mapping trigger: >5 sequential lookups across 5 subsystems) — done (L4)
- T2 S2,S3 Details pilot — inline — done (aea0915)
- T3 S5 Playwright Details block + full regression — inline — done (1d368ee; full 111/0/0/0 2026-11-03T12-51-05)
- T4 S4,S6 doc with contracts/plan — inline — done (1d368ee)

## Log

- L1 (2026-11-03) User request: prompt "OpenLens DevOps — H7.6.3: Docking de componentes con estado" (full text in session).
- L2 Start: HEAD a4e4d14 clean; disk 22.1 GiB; swap 8.6/10 GiB; RAM 38% free.
- L3 Details today: `ResourceDetailsPanelContent` (Kubetail) resolves from the Kubetail store-wide `resourceBinding` (Deployment/StatefulSet/DaemonSet/Pod only) with fallback to the URL (`current-kube-object-in-details`). `SplitLayoutLeaf.resourceBinding` already exists per leaf but is unused. Precedent for opening from a resource: `DetachInspectorMenuItem` in `KubeObjectMenu`.
- L4 Audit (explorer, Opus; parent spot check confirmed logs/view.tsx reloadLogs on mount): Terminal PTY keyed in Main by `${clusterId}:${tabId}`, view unmount only detaches xterm → survives remount with same tabId (risk: isProdConfirmed is component state). Monaco model keyed by URI `/monaco-editor/${tabId}`, not disposed on unmount → draft+undo survive; leaks after close. Dock logs: every mount calls reloadLogs → clears history/pause/scroll (move loses logs). Kubetail: per-frame singleton store owns streams keyed by pod/container; collapse hooks onStreamStop/Resume not wired in production. Details (Kubetail): reads Kubetail store-wide binding + URL fallback.
- L5 Details pilot implemented inline: per-leaf `resourceBinding` (+clusterId) descriptor, `openDetailsPanel` (one panel per resource; reveal if collapsed/inactive tab), `SplitPanelStore.insertLeaf` (extracted from addPanel), `BoundResourceDetails` (reuses DetailsHeader, KubeObjectMenu, kube-object-detail items; subscribeStores ref-counted), `DockDetailsMenuItem` in KubeObjectMenu (only while host rendered). Details stays out of the catalog. jest 252/252; mutation check: disabling identity/bound-view logic fails 3 tests.
- L6 Playwright DT run 1: 5/3 — Details opened a private watch (explicit namespaces bypass KubeWatchApi sharing). Fixed: subscribe without namespaces when the filter covers the resource. DT04 then failed on a test premise: pods keeps a frame-wide watch even with all panels collapsed (temporary probe, discarded); DT04 rebased on a Deployment. Full regression 111/0/0/0. Incident: wildcard rm deleted two tracked H7.4 evidence files; restored via git checkout before any commit (verified no commit deletes evidence). Final disk 19.8 GiB (below 20 for builds).
