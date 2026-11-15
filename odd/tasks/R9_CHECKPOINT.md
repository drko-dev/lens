# NovaKube — R9 Checkpoint

- **Updated**: 2026-11-15T17:21:45-03:00
- **HEAD**: `bb930f48`
- **Branch**: `feature/r9-functional-visual-parity` (from `develop @ f48e9e95`)
- **Active Milestone**: `R9.9–R9.10 — Hardening & Validación E2E integral` (IN_PROGRESS)
- **Testing Policy**: Single coordinator, max 1 heavy runner at a time, Jest `--maxWorkers=2`, sequential isolated E2E.
- **Active Environments**:
  - Mirantis Lens Official: CDP `:9225` (PID `67944`)
  - Synthetic K8s API (`18443`, `18444`): `task-25440` (stopping before `h7-docking-e2e.mjs`)
  - Webpack `@openlens/core` watch: `task-25580`
  - Webpack `dev:main`: `task-25441`
  - Webpack `dev:renderer` (`:9191` HMR): `task-25688`
  - Electron DEV (`:9223`, profile `h7-dev`): `task-25499` (stopping before `h7-docking-e2e.mjs`)
- **Verified**: `R9.5–R9.8` — `Preferences -> Experimental` (`experimental-settings.test.tsx` 1/1 PASS + CDP `:9223`), `config-validating-admission-policies` verified in codebase.
- **Fixed**: `R9-PREF-01` (`Preferences -> Experimental` with Universal Global Docking toggle), `R9-NAV-03` verified.
- **Pending**: `R9.9–R9.10` (run full `h7-docking-e2e.mjs` serially as final regression check), `R9.11` (merge to `develop`, clean ARM64 `.app` + `.dmg`, codesign, SHA256, standalone QA).
- **Active Agents**: Main Orchestrator
- **Tests Executed**: `experimental-settings.test.tsx` (1/1 PASS), `workspace-tabs` (33/33 PASS), `kube-object-menu` (18/18 PASS), `pod-network-policies` (12/12 PASS)
- **Next Action**: Commit `R9.5–R9.8`, stop `task-25440` & `task-25499`, and run full `h7-docking-e2e.mjs` serially.
