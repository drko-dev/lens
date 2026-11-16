# NovaKube — R12 Reverse Engineering Checkpoint

- **Updated**: 2026-11-16T13:33:30-03:00
- **Branch**: `feature/r12-lens-reverse-engineering` (from `develop @ 55089dee`)
- **Status**: `DONE` (Deep Reverse Engineering documentation & roadmap complete; no application binary rebuild required)
- **Target Inspected**: `/Applications/Lens.app` (`2026.11.91422-latest`, Electron `45.2.3`, Chromium `156.0.8078.80`, Node `24.22.2`)
- **REA MCP Server**: `rea-agents@6.5.0` (207 tools; used `inspect_electron_fuses`, `open_binary`, `inspect_plist`, `inspect_signature`, `inspect_artifact`, `analyze_javascript_application`, `list_electron_targets`)
- **Testing & Resource Policy (`AGENTS.md`)**:
  - **NEVER run heavy Jest or E2E suites in parallel** (locks up the user's Mac).
  - Max **1** heavy runner active at a time; Jest strictly `--runInBand` or `--maxWorkers=2`; E2E strictly sequential with isolated `--user-data-dir`.
- **Deliverables Created**:
  - 10 docs in `docs/reverse-engineering/LENS_*.md`
  - 3 planning docs in `odd/tasks/R12_*.md`
