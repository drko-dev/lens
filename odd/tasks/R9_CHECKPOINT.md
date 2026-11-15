# NovaKube — R9 Checkpoint

- **Updated**: 2026-11-15T17:06:30-03:00
- **HEAD**: `c6a330f`
- **Branch**: `feature/r9-functional-visual-parity` (from `develop @ f48e9e95`)
- **Active Milestone**: `R9.4 — Corrección de funciones compartidas con comportamiento diferente` (IN_PROGRESS)
- **Testing Policy**: Single coordinator, max 1 heavy runner at a time, Jest `--maxWorkers=2`, sequential isolated E2E.
- **Active Environments**:
  - Mirantis Lens Official: CDP `:9225` (PID `67944`)
  - Synthetic K8s API (`18443`, `18444`): `task-25440`
  - Webpack `@openlens/core` watch: `task-25580`
  - Webpack `dev:main`: `task-25441`
  - Webpack `dev:renderer` (`:9191` HMR): `task-25442`
  - Electron DEV (`:9223`, profile `h7-dev`): `task-25499`
- **Verified**: `R9.3` Pod Drawer NetworkPolicy labels 100% English in Hot Reload `:9223` + `pod-network-policies` Jest `2 suites, 12/12 PASS`.
- **Fixed**: `R9-POD-01` (`pod-network-policies.tsx` + tests), verified `R9-POD-02` (container submenus).
- **Pending**: `R9.4` (WorkspaceTab Context Menu `Close`/`Close All`/`Close Other Tabs`/`Close Tabs to the Right`, Pod Menu `Show Details`/`Share`, TopBar `notifications_none` outside cluster), `R9.5–R9.11`.
- **Active Agents**: Main Orchestrator
- **Tests Executed**: `pod-network-policies.test.tsx` + `pod-network-policies-transitions.test.tsx` (`2/2 suites, 12/12 PASS`, `--maxWorkers=2`)
- **Next Action**: Implement `R9-TAB-01` (WorkspaceTab Context Menu) in `workspace-tabs-store.ts` & `workspace-tab-bar.tsx`.
