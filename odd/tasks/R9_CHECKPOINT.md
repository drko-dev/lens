# NovaKube — R9 Checkpoint

- **Updated**: 2026-11-15T17:02:00-03:00
- **HEAD**: `f48e9e95`
- **Branch**: `feature/r9-functional-visual-parity` (from `develop @ f48e9e95`)
- **Active Milestone**: `R9.3 — Corrección de regresiones existentes` (IN_PROGRESS)
- **Testing Policy**: Single coordinator, max 1 heavy runner at a time, Jest `--maxWorkers=2`, sequential isolated E2E.
- **Active Environments**:
  - Mirantis Lens Official: CDP `:9225` (PID `67944`)
  - Synthetic K8s API (`18443`, `18444`): `task-25440`
  - Webpack `dev:main`: `task-25441`
  - Webpack `dev:renderer` (`:9191` HMR): `task-25442`
  - Electron DEV (`:9223`, profile `h7-dev`): `task-25499`
- **Verified**: `R9.0–R9.2` completed; `R9_FEATURE_PARITY_MATRIX.md` & `R9_MISSING_FEATURES_ROADMAP.md` created from live CDP `:9225` vs `:9223` + Agente B codebase inventory.
- **Fixed**: —
- **Pending**: `R9.3` (Spanish Pod Drawer labels + empty Pod Menu items), `R9.4` (Tab Context Menu, Pod `Show Details`/`Share`, TopBar Notifications), `R9.5–R9.11`.
- **Active Agents**: Main Orchestrator
- **Tests Executed**: None yet in R9
- **Next Action**: Locate and fix `Aislamiento Ingress` / empty Pod Menu items (`R9.3`) with Hot Reload verification.
