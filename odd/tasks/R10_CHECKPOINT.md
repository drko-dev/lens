# NovaKube — R10 Checkpoint

- **Updated**: 2026-11-15T20:46:30-03:00
- **Branch**: `feature/r10-interaction-parity` (from `develop @ 75e6d8b7`)
- **Completed Milestones**:
  - `R10.0` — Baseline + Hot Reload DEV stack (`:9223`, `:9191`, `18443/18444`) + Mirantis Lens (`:9225`)
  - `R10.1` — Ventanas nativas macOS (`trafficLightPosition` `{12,16}`, macOS `Window` menu con `Minimize Cmd+M`, `Zoom`, `Bring All to Front`; `application-menu.test.ts` 3/3 suites, 18/18 PASS; verificado en vivo vs `:9225`)
- **Active Milestone**: `R10.2 — Subventanas y modales` (NEXT)
- **Testing Policy**: Single coordinator, max 1 heavy runner at a time, Jest `--maxWorkers=2`, sequential isolated E2E.
