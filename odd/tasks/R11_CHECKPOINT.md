# NovaKube — R11 Checkpoint

- **Updated**: 2026-11-16T11:43:30-03:00
- **Branch**: `feature/r11-full-lens-parity` merged to `develop` (`origin/develop` synced)
- **Code HEAD**: `ed27e227` (unchanged in R11.13; docs-only closure)
- **Completed Milestones**: `R11.0` through `R11.12` + `R11.13` (Environment Recovery & Standalone DMG Closure)
- **Active Milestone**: `DONE`
- **Standalone DMG Smoke Test (`OpenLens DevOps-6.5.3-dev-arm64.dmg`, `NODE_ENV=production`, `SHELL=/bin/zsh`)**:
  - `codesign --verify --deep --strict`: PASS on mounted `OpenLens DevOps.app`
  - `SHA-256` DMG: `a60bf2a7e38939bfbd47277d51752f9434430d2806d1c87e7b6a0dfdcf52b03c`
  - Verified live via NVM Node `v22.22.0` + CDP `:9229`: Welcome, Catalog, RootNavigatorPanel, Workspaces, Preferences (`Cmd+,` keeping Navigator), cluster activation (`h7-synthetic`), Pods table, Drawer (`drawerOpened: true` -> closes on Dock `drawerClosedAfterDock: true`), Logs (`logsContentLen: 854`), Kubetail (`kubetailRendered: true`), Terminal real (`hasXterm: true`, `terminalSwitch: true`, `terminalExtBtn: true`, `ptyExecutedRealCommand: true` with `NOVAKUBE_DMG_PTY_OK`), persistence across full restart (`h7-synthetic` + `Welcome` + `Default Workspace` + Navigator), `pageErrors: []`, `consoleErrors: []`.
  - Cleanup confirmed: `/tmp/novakube-dmg-mount` unmounted, all `/tmp/novakube-*` removed, `17Gi` free on `/`.
- **Testing & Resource Policy (`AGENTS.md`)**:
  - Single Test Coordinator (main orchestrator only).
  - Max **1** heavy runner at a time; never run heavy Jest/E2E suites in parallel.
  - Focused Jest with `--maxWorkers=2`; E2E sequential with isolated `--user-data-dir`.
  - Electron DEV (`--remote-debugging-port=9223`) + Hot Reload mandatory; Mirantis Lens `2026.11.91422-latest` open in parallel for live comparison.
- **Disk Free**: `17Gi` on `/`.
