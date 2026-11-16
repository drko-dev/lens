# NovaKube — R10 Checkpoint

- **Updated**: 2026-11-15T21:00:30-03:00
- **Branch**: `feature/r10-interaction-parity` (from `develop @ 75e6d8b7`, last merge `9fae11ea`)
- **Completed Milestones**:
  - `R10.0` — Baseline + Hot Reload DEV stack (`:9223`, `:9191`, `18443/18444`) + Mirantis Lens (`:9225`)
  - `R10.1` — Ventanas nativas macOS (`c16c6ce7` -> `develop @ 9fae11ea`)
  - `R10.2` — Subventanas y modales (`Command Palette` `Cmd+Shift+P` + `matchedId`, `Menu` `onWindowKeyDown` + `ArrowDown`/`Escape`, `About`, `Preferences Cmd+,`, `ConfirmDialog`, `Detached BrowserWindow`; `kube-object-menu.test.tsx` 18/18 PASS + Hot Reload `:9223`)
- **Active Milestone**: `R10.3 — Docking y paneles` (NEXT)
- **Testing Policy**: Single coordinator, max 1 heavy runner at a time, Jest `--maxWorkers=2`, sequential isolated E2E.
