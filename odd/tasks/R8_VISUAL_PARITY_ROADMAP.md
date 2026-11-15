# NovaKube — R8: Visual Parity 1:1 — Zero Gap Roadmap

- **Repository**: `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`
- **Base Branch**: `develop` (`974cf8de`)
- **Feature Branch**: `feature/r8-zero-gap-visual-parity`
- **Reference App**: Mirantis Lens Official (`CDP :9225`, `1440x900`)
- **Target App**: NovaKube Electron DEV (`CDP :9223` + `packages/core` `--watch` Hot Reload + isolated QA profile `~/Documents/lens/qa-profiles/h7-dev`)

---

## Milestones
- [x] **R8.0 — Baseline Visual Completo**: Verify Git (`974cf8de`), launch NovaKube DEV + Hot Reload + synthetic K8s APIs alongside Mirantis Lens (`9225`), build pixel-overlay/diff harness (`r8_compare.mjs`), capture initial baseline (`Preferences`, `Overview`, `Nodes`), create R8 tracking docs.
- [x] **R8.1 — TopBar y Tabs**: Tab title `<View> - <Cluster>` (`Cluster Overview - h7-synthetic`), colored cluster wheel icon matching active cluster (`#11aa18`), top 2px cluster accent bar (`box-shadow: inset 0 2px 0`), `250x36` tab geometry, layout/split button, `workspace-tabs` Jest `30/30 PASS` + Hot Reload CDP `9223` verified (`r8-1-topbar-novakube.png`).
- [x] **R8.2 — Navigator**: Drill-down presentation (`< <cluster>` header, no `KUBERNETES CLUSTERS` heading or mixed other clusters inside active cluster tree; `<` reveals `KUBERNETES CLUSTERS` + all clusters), `24px` row pitch verified, Navigator Jest `34/34 PASS` + Hot Reload CDP `9223` verified (`r8-2-navigator-novakube.png`).
- [x] **R8.3 — Hotbar y Pines**: 64px rail (`64x851`), `47x48` cells (`56px` pitch, `3px` border, `2px` radius), `37x38` tiles (`rgb(31, 33, 35)`), `< 1 >` Hotbar selector (`64x24` at `y=846`), custom per-cluster colors & drag-drop preserved (`hotbar-menu` Jest `8/8 PASS`).
- [ ] **R8.4 — Overview**: Overview toolbar (`Master Nodes`, metric toggles, `(i)`), chart/donut row height (`~350px` target), Warnings table, no fake historical metrics.
- [ ] **R8.5 — Tablas y Recursos**: Pods, Nodes, Deployments, DaemonSets, StatefulSets, ReplicaSets, Jobs, CronJobs, Services, Ingress, ConfigMaps, Events, Namespaces (headers, row pitch, search `Aa`/`.*`, column menu, `+` FAB).
- [ ] **R8.6 — Drawers**: Width, header, toolbar, formatted dates, Pod IPs, Properties/Labels/Annotations, Metrics, Controlled By, split details preserved.
- [ ] **R8.7 — Preferences**: App, Appearance, Proxy, Kubernetes, Editor, Tables, Terminal, Integrations, External Tools — layout, typography, spacing, controls, zero fixed offsets.
- [ ] **R8.8 — Dock y Terminal**: Dock height, headers, tabs, buttons, xterm area, search, split panes, preserve Kubetail/Logs/PTY/H7 docking & persistence.
- [ ] **R8.9 — Deuda Técnica Visual (`novakube.scss`)**: Audit `!important`, `display: none` patches, hardcoded offsets, fragile selectors; replace safely without breaking validated layouts.
- [ ] **R8.10 — Validación Final & Build ARM64**: Full visual matrix review across `1440x900`, `1280x800`, `960x720`; full H7 E2E revalidation if docking/layout touched; clean build `.app` + `.dmg` from `develop`, `codesign`, standalone verification vs Lens.
