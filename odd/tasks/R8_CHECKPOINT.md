# R8 Visual Parity Checkpoint

- **Updated**: 2026-11-15T09:33:00-03:00
- **Active Milestone**: `R8.3 — Hotbar y Pines` (DONE) -> `R8.4 — Overview` (NEXT)
- **Branch**: `feature/r8-zero-gap-visual-parity` (from `develop @ 974cf8de`)
- **Running DEV Environment**:
  - Mirantis Lens Official: CDP `:9225`
  - NovaKube Electron DEV: CDP `:9223` (`--use-mock-keychain`, isolated `qa-profiles/h7-dev`)
  - `packages/core` webpack `--watch` Hot Reload + synthetic K8s APIs (`18443`, `18444`)

## Completed
- `R8.0`: Baseline captured (`r8-0-preferences`, `r8-0-overview`, `r8-0-nodes`) with overlay + pixel-diff tooling (`scratch/r8_compare.mjs`).
- `R8.1`: Fixed `<View> - <Cluster>` contextual tab title & cluster wheel/2px top accent color propagation (`sidebar.tsx` -> `workspace-tabs-store.ts` -> `workspace-tab-bar.tsx`); Jest `30/30 PASS`; CDP `9223` verified (`r8-1-topbar-novakube.png`).
- `R8.2`: Aligned Navigator to Lens drill-down mode (`< <cluster>` toggle, hides `KUBERNETES CLUSTERS` & other clusters while expanded; clicking `<` reveals multi-cluster list); Jest `34/34 PASS`; CDP `9223` verified (`r8-2-navigator-novakube.png`).

- `R8.3`: Verified 1:1 Hotbar rail/cell/tile/selector geometry in CDP `9223` + `hotbar-menu` Jest `8/8 PASS`.

## Next Action
1. Execute **R8.4 — Overview**: measure & align Cluster Overview toolbar, chart/donut row height (`~350px` target), Warnings table, and typography/spacing against `r8-0-overview-lens.png`.
