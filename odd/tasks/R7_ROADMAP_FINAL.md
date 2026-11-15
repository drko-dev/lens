# NovaKube — Roadmap R7 Definitivo (Paridad Visual y Funcional 1:1 con Mirantis Lens)

- **Repository**: `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`
- **Base Branch**: `develop` (`1275408a`)
- **Feature Branch**: `feature/r7-lens-parity`
- **Reference App**: Mirantis Lens `2026.11.91422-latest` (`/Applications/Lens.app`, CDP `9225`)
- **DEV App**: OpenLens DevOps (`open-lens` Electron DEV, CDP `9223` + `packages/core` `--watch` Hot Reload)
- **Non-Negotiables**:
  - Preserve all H1–H9 & H7 features (Universal Docking, Multi-Window, Workspaces, Kubetail, Logs, Terminal `/bin/zsh` + PTY, RBAC, AI Providers, Incident Center, Kubeconfig, per-cluster colors, layout persistence).
  - Keep Midnight Graphite theme; do NOT restore the deliberately removed blue bottom Status Bar.
  - No proprietary Lens code or fake commercial controls (`UPGRADE`, `PREMIUM`, `Send Feedback`, Lens Spaces).
  - Mandatory cycle: `EDIT -> HOT RELOAD -> COMPARE -> FIX -> E2E -> COMMIT -> PUSH -> MERGE TO DEVELOP -> PUSH DEVELOP`.

---

## R7.0 — Preparación y Baseline
- [x] Verify Git status, branches, remotes (`origin/develop` @ `0003d663` vs local `develop` @ `1275408a`), and running processes.
- [x] Create `feature/r7-lens-parity` branch from `develop`.
- [x] Start Electron DEV (`open-lens` `npm start`, CDP `9223`) + `packages/core` webpack `--watch`.
- [x] Inspect Mirantis Lens (`9225`) and NovaKube DEV (`9223`) side-by-side and capture initial baseline measurements.
- [x] Create `odd/tasks/R7_ROADMAP_FINAL.md` and `odd/tasks/R7_CHECKPOINT.md`.
- [x] Reconcile `origin/develop` safely (`merge -s ours` without force push), commit & push R7.0 baseline (`bc59aede`).

## R7.1 — TopBar, Tabs, Navigator y Hotbar
- [x] Cluster helm icon in cluster workspace tabs (replacing plain dot) + `viewTitle` support (`<View> - <Cluster>`).
- [x] Top 2px cluster color accent bar on active tab (`inset 0 2px 0 var(--tab-accent)`) + right-side layout/split access button (`workspace-layout-toggle`).
- [x] Functional TopBar right controls (`novakube-top-bar-actions.injectable.tsx`: AI Diagnostics quick access + Notifications/Incidents bell).
- [x] Hotbar selector (`< 1 >`, `HotbarSelector`) mounted at bottom of 64px rail above collapse chevron.
- [x] Navigator slim overlay scrollbar (`scrollbar-width: thin`) preserving Workspaces & multi-cluster navigation.
- [x] Focused Jest (`hotbar-menu`, `top-bar`, `navigator-cluster-row`: 3 suites, 16/16 PASS) + Electron DEV Hot Reload + CDP `9223` visual verification (`r7-1-novakube-cluster.png`).

## R7.2 — Recursos Kubernetes y Overview
- [x] Admission Policies (`config-validating-admission-policies` verified & tested: 2/2 PASS; visible under Config).
- [x] Full resource names (`Config Maps`, `Horizontal Pod Autoscalers`, `Mutating Webhook Configurations`, `Validating Webhook Configurations`).
- [x] Overview: donut padding tightened (`novakube.scss`), `(i)` info icon added (`cluster-metric-switchers.tsx`), sentence-case `Warnings` headers.
- [x] DaemonSets columns: `Desired`, `Current`, `Ready`, `Up-to-date`, `Available` (`daemonsets.tsx`), verified live in DEV 9223.
- [ ] Applications / ResourceClaims (DRA) / VolumeAttributesClass / Prometheus 1h-24h range selector (deferred/documented: requires dedicated K8s CRD/Prometheus range query backend).

## R7.3 — Tablas, Búsqueda y Drawers
- [ ] Align table column widths, row pitch (`36px`), and spacing.
- [ ] Functional `+` Create Resource FAB in resource lists.
- [ ] Search options (`Aa`, `.*` regex) + saved searches / history dropdown.
- [ ] Column configuration menu (`⋮`).
- [ ] Drawers: clean native headers (no CSS hiding real controls), human-readable dates (`Created`), properties (`Pod IPs`), metrics + time-range selector where supported, copy/links/scroll/navigation.
- [ ] E2E + visual comparison + commit/push/merge.

## R7.4 — Preferences y Configuración
- [ ] Complete functional sections: `Tables`, `Integrations`, `External Tools`.
- [ ] `Colorized Clusters` toggle in `App`, `Locale` & `Timezone`, CLI where applicable.
- [ ] Fix fixed `left: 364px !important` offset and responsive behavior.
- [ ] Preserve existing preferences/data; unify language/terminology (remove mixed ES strings like `Documentación` / `Incidentes` if English UI, or respect i18n).
- [ ] E2E + visual comparison + commit/push/merge.

## R7.5 — Dock, Terminal y Docking
- [ ] Dock geometry parity (`37px` collapsed, controls alignment).
- [ ] Remove wasted subheader height in Terminal tab.
- [ ] Terminal buffer search + split panes + equivalent terminal controls.
- [ ] Validate `/bin/zsh` and PTY lifecycle.
- [ ] Revalidate universal docking/redocking, detached windows, layout persistence, stream cleanup, and full H7 E2E if shared docking components are modified.
- [ ] E2E + visual comparison + commit/push/merge.

## R7.6 — Funcionalidades Pendientes
- [ ] Unified Port Forward Manager.
- [ ] Helm Diff Preview (upgrade/rollback).
- [ ] RBAC Visualizer.
- [ ] Extension Registry Browser.
- [ ] AI Provider profiles Edit/Delete UI.
- [ ] Real OAuth validation & error/recovery tests (document external service requirements where applicable).
- [ ] E2E + commit/push/merge.

## R7.7 — Hardening y Deuda Técnica
- [ ] Reduce unnecessary global overrides in `novakube.scss` (3,354 lines -> structural component styles).
- [ ] Remove `!important` and fixed pixel offsets where safe structural alternatives exist.
- [ ] Responsive regression audit (`960px` & `1440px`), accessibility, memory leaks & duplicate listeners.
- [ ] Consolidate regression tests + commit/push/merge.

## R7.8 — Validación y Release Final
- [ ] Full functional audit + full visual comparison across all screens.
- [ ] Isolated profile E2E + revalidate full H7 (186 scenarios baseline).
- [ ] Verify Workspaces, AI, Logs, Terminal, Kubetail, RBAC, Docking.
- [ ] Clean obsolete builds safely; build from clean `develop` checkout (`macOS ARM64 .app` + `.dmg`), sign, verify `codesign`, test standalone without DEV server, verify `app.asar` matches `develop` HEAD, deliver paths/SHA/hashes/results.
