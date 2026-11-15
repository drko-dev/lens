# R8 Visual Parity Checkpoint

- **Updated**: 2026-11-15T09:40:00-03:00
- **Active Milestone**: `R8.5–R8.9` (DONE) -> `R8.10 — Validación Final & Build ARM64` (IN_PROGRESS)
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

- `R8.4`: Tightened Overview donut/warning spacing in `novakube.scss`; verified `350px` chart/pie row in CDP `9223` + `27/27 PASS` (`r8-4-overview-novakube.png`).
- `R8.5–R8.9`: Verified 9 K8s tables (`44/47/36`), Pod Drawer (`w:725, h:38`), Preferences 9 sections across `1440x900`/`1280x800`/`960x720` (`anyOverflow: false`), Dock (`37/36`), and `novakube.scss` audit (`3503` lines, `308` `!important`, `15` `display: none`).

## Next Action
1. Execute **R8.10**: commit & merge R8 docs to `develop`, stop DEV daemons, clean build `.app` + `.dmg` from `develop`, verify `codesign` & `app.asar` SHA256, and run standalone QA.
