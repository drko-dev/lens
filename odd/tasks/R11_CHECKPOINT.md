# NovaKube — R11 Checkpoint

- **Updated**: 2026-11-16T08:34:00-03:00
- **Branch**: `feature/r11-full-lens-parity` (from `develop @ ea48aa16`, `origin/develop @ ea48aa16`)
- **Completed Milestones**: `R11.0`, `R11.1`
- **Active Milestone**: `R11.2 — Navigator del Clúster` (IN_PROGRESS)
- **Testing & Resource Policy (`AGENTS.md`)**:
  - Single Test Coordinator (main orchestrator only).
  - Max **1** heavy runner at a time; never run heavy Jest/E2E suites in parallel.
  - Focused Jest with `--maxWorkers=2`; E2E sequential with isolated `--user-data-dir`.
  - Electron DEV (`--remote-debugging-port=9223`) + Hot Reload mandatory; Mirantis Lens `2026.11.91422-latest` open in parallel for live comparison.
- **Disk Free**: `17Gi` on `/`.
