# NovaKube — R9 Checkpoint

- **Updated**: 2026-11-15T20:20:00-03:00
- **HEAD**: `bf70a7b8` (`feature/r9-functional-visual-parity`, from `develop @ f48e9e95`)
- **Active Milestone**: `R9.11 — Merge, release ARM64 y DMG final` (IN_PROGRESS)
- **Testing Policy**: Single coordinator, max 1 heavy runner at a time, Jest `--maxWorkers=2`, sequential isolated E2E.
- **Verified**:
  - `R9.3` (`11ecd88d`): `pod-network-policies.test.tsx` + `pod-network-policies-transitions.test.tsx` (`2/2 suites, 12/12 PASS`).
  - `R9.4` (`bb930f48`): `workspace-tabs-store.test.ts` + `workspace-tab-bar.test.tsx` (`2/2 suites, 33/33 PASS`), `kube-object-menu.test.tsx` (`1/1 suite, 18/18 PASS`).
  - `R9.5–R9.8` (`2d35616b`): `experimental-settings.test.tsx` (`1/1 suite, 1/1 PASS`), CDP `:9223` vs `:9225`.
  - `R9.9–R9.10` (`bf70a7b8`): Full `open-lens/integration/h7-docking-e2e.mjs` (`186 PASS, 0 FAIL, 0 SKIP, 0 BLOCKED`, including `D16`, `V09`, `V10`, `P15`, `DC07`, `LG09`, `ED01–ED12`, `TM01–TM12`, `KB01–KB12`, `GV01–GV12`, `PS01–PS16`, `QA00`).
- **Next Action**: Commit docs, push `feature/r9-functional-visual-parity`, merge to `develop`, push `origin/develop`, run clean ARM64 `.app` + `.dmg` build, codesign & standalone CDP verification.
