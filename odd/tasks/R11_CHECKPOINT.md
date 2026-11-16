# NovaKube — R11 Checkpoint

- **Updated**: 2026-11-16T09:23:30-03:00
- **Branch**: `feature/r11-full-lens-parity` (from `develop @ ea48aa16`, `origin/develop @ a82431be`)
- **Completed Milestones**: `R11.0`, `R11.1`, `R11.2`, `R11.3`, `R11.4`, `R11.5`, `R11.6`, `R11.7`
- **Active Milestone**: `R11.8 — Búsqueda Avanzada` (IN_PROGRESS)
- **Testing & Resource Policy (`AGENTS.md`)**:
  - Single Test Coordinator (main orchestrator only).
  - Max **1** heavy runner at a time; never run heavy Jest/E2E suites in parallel.
  - Focused Jest with `--maxWorkers=2`; E2E sequential with isolated `--user-data-dir`.
  - Electron DEV (`--remote-debugging-port=9223`) + Hot Reload mandatory; Mirantis Lens `2026.11.91422-latest` open in parallel for live comparison.
- **Disk Free**: `17Gi` on `/`.
