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
- [x] **R8.4 — Overview**: Overview toolbar (`44px`, `Master Nodes`, metric toggles, `(i)`), `350px` chart/donut row (`OVERVIEW_PIE_ROW_HEIGHT: 350`), tightened `.chart-container`/`.node-warning`/`.LegendBadge` spacing in `novakube.scss`, Warnings/No issues panel, `lens-2026-novakube-parity.test.ts` `27/27 PASS` (`1h/24h` range selector deferred — no fake metrics).
- [x] **R8.5 — Tablas y Recursos**: Measured all 9 K8s tables (`Nodes`, `Pods`, `Deployments`, `Daemon Sets`, `Stateful Sets`, `Config Maps`, `Services`, `Namespaces`, `Events`) in CDP `9223`: `44px` toolbar, `47px` header, `36px` row pitch, `overflowX: false`.
- [x] **R8.6 — Drawers**: Measured Pod Drawer in CDP `9223`: `w: 725`, `h: 38` item pitch, human-readable formatted dates (`13d 12h 37m ago (Nov 1, 2026, 9:00:00 PM GMT-3)`), all action controls & split details preserved.
- [x] **R8.7 — Preferences**: Verified all 9 sections (`app`, `appearance`, `proxy`, `kubernetes`, `editor`, `tables`, `terminal`, `integrations`, `external-tools`) across `1440x900`, `1280x800`, `960x720` in CDP `9223` (`anyOverflow: false`).
- [x] **R8.8 — Dock y Terminal**: Verified `dockH: 37px`, `tabH: 36px` in CDP `9223`; Kubetail, Logs, `/bin/zsh` PTY, and H7 186/186 docking/persistence preserved.
- [x] **R8.9 — Deuda Técnica Visual (`novakube.scss`)**: Audited `novakube.scss` (`3503` lines, `308` `!important`, `15` `display: none` rules); preserved structural overrides without blind mass-refactor.
- [x] **R8.10 — Validación Final & Build ARM64**: Stop DEV daemons, clean build from `develop @ 51cbc5dc`, package macOS ARM64 `.app` + `.dmg`, verify `codesign --verify --deep --strict`, verify `app.asar` SHA256 (`61b0aa0e7828b099d1843328a9e1e0d23d5c94d628f573d1ebf52ca7251d8834`) & `.dmg` SHA256 (`e500a2f2d2663f7d9f857c102180e2818591e381a4dcb2453aaf93dd9746f9af`), and run standalone DMG CDP QA without DEV server (`7/7` routes `overflowX: false`, `pageErrors: []`).
