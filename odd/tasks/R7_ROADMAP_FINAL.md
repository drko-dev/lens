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
- [x] Align table column widths, row pitch (`36px`), and spacing (`novakube.scss`).
- [x] Functional `+` Create Resource FAB in resource lists (`kube-object-list-layout.tsx` default `createResourceTab`, plus null-error guard in `dock/create-resource/view.tsx`).
- [x] Search options (`Aa`, `.*` regex via `search-mode-toggles.tsx` verified 3/3 PASS) + `All namespaces` filter.
- [x] Column configuration menu (`⋮`) + CSV export + Quick Filters verified.
- [x] Drawers: clean native headers (`Pod: <name>`), human-readable dates (`LocaleDate` via `Intl.DateTimeFormat` with `localeTimezone`), properties (`Pod IPs`), metrics, copy/links/scroll/navigation.
- [x] Focused Jest (`10 suites, 43/43 PASS` + `create-resource`: `1 suite, 2/2 PASS`) + Electron DEV Hot Reload + CDP `9223` visual verification (`r7-3-pods-table.png`, `r7-3-pod-drawer.png`, `r7-3-create-resource-dock.png`).

## R7.4 — Preferences y Configuración
- [x] Complete functional sections: `Tables` (`tables-settings.tsx`: TableDensity + Hidden Columns manager/reset), `Integrations` (`integrations-settings.tsx`: AI Diagnostics, Incident Center, Extension Registry, Incident Retention), `External Tools` (`external-tools-settings.tsx`: kubectl path/download, binaries dir, default shell).
- [x] `Colorized Clusters` toggle in `App` (`colorized-clusters.tsx` + `colorizedClusters` preference descriptor), `Locale & Timezone`, `Start-up`, `Workspace Tabs`.
- [x] Fix fixed `left: 364px !important` & `min-width: 460px` clipping in `novakube.scss` with responsive layout (`clamp(160px, 18vw, 210px)` sidebar + `@media (max-width: 820px)` collapse).
- [x] Preserve existing preferences/data; unify mixed ES/EN navigation strings (`Incidentes` -> `Incidents`, `Documentación` -> `Documentation`).
- [x] Focused Jest (`7 suites` appearance/app/navigation/incidents PASS) + Electron DEV Hot Reload + CDP `9223` visual verification (`r7-4-prefs-fixed.png`, `r7-4-prefs-tables.png`).

## R7.5 — Dock, Terminal y Docking
- [x] Dock geometry parity (`37px` collapsed height verified in CDP `9223`, `36px` Dock tabs + `1px` border).
- [x] Compacted non-production `ToolContextHeader` in `novakube.scss` (`21px` quiet strip) while preserving `terminal-context-header-*`, production hazard guard, and `TerminalDetachButton`.
- [x] Terminal buffer search (`TerminalSearch` with `Aa` / `.*` / `\b` + `Meta+f`), split panels (`workspace-layout-toggle`), and Dock controls verified.
- [x] Validated `/bin/zsh` + live PTY prompt (`r7-5-terminal-pty.png`) and H7/R4-04 Dock & Terminal suites (`9 suites, 39/39 PASS`).
- [x] Universal docking/redocking, detached windows, layout persistence, and stream cleanup preserved intact (no core docking logic altered).

## R7.6 — Funcionalidades Pendientes
- [x] Unified Port Forward Manager (`network-port-forwards/port-forwards.tsx` + route/process suite verified: 47+ tests PASS).
- [x] Helm Diff Preview (`helm-releases/release-details/values-diff/values-diff.tsx` verified: 2 suites, 22/22 PASS).
- [x] RBAC Visualizer (`user-management/rbac-inspector/rbac-inspector.tsx` verified: 20/20 PASS).
- [x] Extension Registry Browser (`extension-registry-browser.tsx` wired into `extensions.tsx`, queries configured npm registry `/-/v1/search` with one-click Install; verified live in CDP `9223` returning 15 results).
- [x] AI Provider profiles Edit/Delete UI (`incident-store.ts` `updateAiProfile`/`deleteAiProfile` + inline Edit/Delete management list in `ai-provider-config-dialog.tsx`; AI dialog suite 9/9 PASS).
- [x] Real OAuth validation & error/recovery tests (`h8-8-03-auth-provider-integration`, `h8-8-06a`, `h8-8-06b` verified; live external OpenAI OAuth login requires user credentials/browser callback at runtime).

## R7.7 — Hardening y Deuda Técnica
- [x] Audited `novakube.scss` (`3503` lines, `308` `!important`) and verified responsive `.SettingLayout` + `@media (max-width: 820px)` without breaking theme isolation.
- [x] Responsive regression audit in CDP `9223` across `960x800` and `1440x900` on `/catalog`, `/preferences`, `/extensions` (`overflowX: false` on all 6 checks).
- [x] Consolidated `lens-2026-novakube-parity.test.ts` assertions to match R7 tab accent, cluster navigation, and responsive Preferences (`27/27 PASS`).

## R7.8 — Validación y Release Final
- [x] Consolidated R7 Jest verification (`36 suites passed, 211/211 tests passed, 11/11 snapshots passed`) + strict TypeScript production build fixes (`d968acef`: `daemonsets.tsx`, `extension-registry-browser.tsx`).
- [x] Clean production build (`@openlens/core@6.5.3` + `open-lens@6.5.3-dev`) from `develop` HEAD (`d968acef`) and macOS ARM64 packaging (`OpenLens DevOps.app` + `OpenLens DevOps-6.5.3-dev-arm64.dmg`).
- [x] Strict signing verification (`codesign --verify --deep --strict`: `valid on disk`, `satisfies its Designated Requirement`) + `app.asar` SHA256 parity (`78748dbbca98dc9427ee20d5a108c8a3ee334799f700ca697223e80856fdb7be`) between `dist/mac-arm64` and mounted `.dmg`.
- [x] Standalone QA from mounted `.dmg` without DEV server (`--user-data-dir=/tmp/novakube-r7-qa`, CDP `9229`): `/welcome`, `/catalog`, `/preferences/app`, `/preferences/tables`, `/preferences/integrations`, `/preferences/external-tools`, `/extensions` all rendered with `overflowX: false` and `pageErrors: []`.
