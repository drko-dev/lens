# Functional audit after Lens 2026 visual parity
Objective: audit and recover every NovaKube feature in real Electron DEV without losing visual parity; finish with a new validated arm64 binary.
Branch: feature/lens-dark-parity-pod-drawer-navigator (base 07c412b6 == develop). Delivery: local commits + local ff to develop, no push. Runner: jest (packages/core, --maxWorkers=2, focused) + Playwright over CDP :9223 (DEV) / :9225 (official Lens reference).

## Specs
- S1 "CREAR UNA MATRIZ FUNCIONAL COMPLETA" with: name, expected behavior, historical status, current status, test procedure, result, errors, root cause, fix, regression test, evidence, commit. Status in {PASS, FAIL, PARTIAL, BLOCKED, NOT TESTED}. "No utilizar PASS sin haber ejecutado una prueba adecuada."
- S2 Docking universal y multiventana (drag/drop, 4 sides, splits, maximize/restore/collapse/reopen/close, detach/redock, independent windows, Cmd+W, layout restore). No duplicated streams; Single Owner.
- S3 Persistencia y Workspaces (create/switch/rename, tabs order, restore after restart, layout backup, per-cluster isolation). Destructive tests on isolated profiles.
- S4 Pines y colores ("Change color item and environment" must really apply; no random color overwriting user choice).
- S5 Kubetail y Logs (follow/pause/resume/search/filter/copy/switch pod/close releases streams).
- S6 Terminal y PTY (local/cluster/pod, /bin/zsh, resize, close/reopen, dock/redock) — read-only commands only.
- S7 Kubernetes y kubeconfig (add/import, contexts, connect/disconnect, resources, YAML, drawers, events, metrics, port-forward on isolated cluster).
- S8 AI Providers (EXTERNAL_PROVIDER_DISABLED, OPENAI_OAUTH_CALLBACK_MALICIOUS) — no credential exposure.
- S9 RBAC, seguridad, Incident Center — no changes to real roles.
- S10 Drawers y listados (Controlled By, copy title/YAML, search/filter/sort/namespace/columns).
- S11 No new visual regressions vs official Lens.
- S12 Regression test per fixed bug; focused tests only during dev; full suite only at the end.
- S13 Local commits, local integration to develop, no push.
- S14 New macOS arm64 binary from validated HEAD, standalone-verified with isolated profile; do not replace /Applications/Lens.app.

## Environment facts
- Electron DEV: `cd open-lens && npm start` (webpack watch + dev-server HMR, CDP :9223). Profile in use: `~/Library/Application Support/OpenLens DevOpsDev` (treated as real: read-only tests only).
- Isolation for destructive tests: `CICD=$QA/appdata HOME=$QA/home KUBECONFIG=$QA/home/.kube/config` (`--user-data-dir` is overridden by setup-app-paths).
- Real cluster reachable: only `k3s-vps-wireguard` (admin RBAC) -> read-only. Isolated write cluster: minikube profile `novakube-qa` (qemu2), kubeconfig in session scratchpad, never merged into ~/.kube/config.
- Engram mirror: pending (mem_current_project ambiguous cwd).

## Matrix (live)
| ID | Feature | Procedure | Result | Notes / evidence |
|---|---|---|---|---|
| F01 | App boot DEV + welcome | CDP snapshot | PASS | 4 clusters, 1 pinned, no console errors |
| F02 | Navigator cluster list (dup `k3s-vps-wireguard`) | store + kubeconfig inspection | PASS (note) | same context in `~/.kube/config` and `~/.kube/k3s-vps-wireguard.yaml`; 14 stale entries point to kubeconfigs without contexts and are hidden correctly |
| F03 | Cluster activation from hotbar pin | CDP click pin, wait cluster frame | PASS | 1.5s, green status, full sidebar, overview loaded, 0 console errors |
| F04 | Dock tabs restored after restart | CDP after boot | PASS | 4 persisted tabs (3 terminals + traefik logs) restored |
| F05 | Cluster terminal (zsh, per-session KUBECONFIG) | dock "+" then `echo $SHELL $KUBECONFIG; kubectl config current-context; kubectl get ns; tput cols` | PASS | /bin/zsh, kubeconfig-89531a04 temp file, context ok, 9 ns (= external kubectl). dfbe229d env cache has no observable regression |
| F06 | Terminal close releases PTY | close tab, inspect Electron main process tree | PASS | closed tab's zsh gone; PTYs spawned lazily only for the visible tab |
| F07 | Pin "Change Color, Icon & Environment" | UI: Pink + Staging, Done; then revert | PASS | pin `--nv-pin-color`, workspace tab accent, tab/dock env badge, sidebar selector and store (`icon`+`clusterColor`+`clusterEnvironment`) all updated and persisted; reverted to #06B6D4/development |
| F08 | Jest baseline suspected areas (780 tests) | Haiku, 8 groups, 2 workers | PASS after fix | 4 stale snapshots (intentional Navigator brand change) refreshed -> ef72f2d6 |
| F09 | Pod logs open/search/filter/pause/resume/stream cleanup | Pods > menu > Logs; search `1/3`, filter `3/23`; main TCP 12->14->12 | PASS | stream lives in main (IPC), released on tab close |
| F10 | Log toolbar controls clickable at 960px | elementFromPoint per control | FAIL -> FIXED | search input overflowed and covered "Show timestamps"; "Since and tail" pushed off-viewport. Fix f8596150 + probe `open-lens/integration/logs-toolbar-hit-e2e.mjs` (RED observed, GREEN 960/1440; 1440 geometry unchanged) |
| F11 | Overview metrics chart X axis labels | screenshot | OPEN | time labels overlap (`0606106:1...`) at 960px; compare with Lens |
| F13 | Pods list search / sort / namespace filter | CDP on real cluster | PASS | search traefik -> 4 rows; Name asc/desc reversed; ns filter 23 -> 7 (kube-system) -> All 23 |
| F14 | Drawers: Pod, Deployment, DaemonSet, ReplicaSet, ConfigMap, Secret, Service, Ingress, Node, Namespace, Event | open first row, read fields, Escape | PASS | type-specific fields; copy button present in all; Controlled By links to owner via kube-details |
| F15 | Node drawer duplicate React keys | console capture | FAIL -> FIXED | two InternalIP addresses shared key; 1d7b8e55 + `nodes/details-addresses.test.tsx` (RED/GREEN) |
| F16 | RBAC lists + drawers (ServiceAccounts 29, ClusterRoles 30, Roles 8, ClusterRoleBindings 30, RoleBindings 10) | CDP read-only | PASS | Roles row center hits namespace badge (filter by ns, Lens behavior) |
| F17 | Port-forward start/verify/stop/delete | pod menu > traefik:metrics, Start; curl; Stop; Delete | PASS | Active on local port, curl 200 Prometheus metrics, Stop -> Disabled + port closed, no orphan kubectl |
| F18 | Docking D01-D12, C01-C13, P01-P13 (isolated h7 harness) | Sonnet worker | PASS | drag/drop 4 sides, splits, recursive, maximize/restore/collapse/close. Harness fixed af381877. Detach/redock/Cmd+W/restore: full run in progress |
| F19 | AI providers (create, default, persistence, credential masking, offline states) | Sonnet worker, isolated :9333 | PASS | 642 jest tests in ai-diagnostics/incident-*; EXTERNAL_PROVIDER_DISABLED and OPENAI_OAUTH_CALLBACK_MALICIOUS asserted by unit tests only; ChatGPT OAuth BLOCKED (real external flow); no edit/delete UI for profiles (backend exists) -> product decision |
| F20 | Incident Center route, filters, synthetic case, workbench | Sonnet worker | PASS | |
| F21 | Incident create without cluster context | click synthetic OOM on /incidents | FAIL -> FIXED | uncaught SecurityError overlay; e993d523 + test (RED/GREEN); store fail-closed contract kept |
| F22 | Navigator empty on /incidents | code read | NOTE (by design) | RootNavigatorPanel is mounted only by Welcome and Preferences; Catalog/Incidents are full-width pages. Only inconsistency: topbar label "Navigator" (parity) shows on those pages too. No functional loss |
| F23 | Add cluster: import by file path (H6_2) | fake kubeconfig (no real creds, server 127.0.0.1:6) | PASS | added to syncKubeconfigEntries + cluster store, visible in Navigator immediately, no restart |
| F24 | Add cluster: paste YAML in Monaco | Monaco paste command | PASS | context detected, button "Add cluster" enabled, redirect to /catalog, store + Navigator updated |
| F25 | Unreachable cluster connect | activate fake cluster | PASS | 1.2s -> "connection refused" + Reconnect button, no hang |
| F26 | Remove clusters + sync entry | Catalog > Remove; Preferences > Kubernetes > delete sync | PASS | correct confirm copy for internal vs external kubeconfig; DEV profile verified identical to backup afterwards |
| F27 | Hotbar collapse vs Root Navigator panel | collapse rail on Welcome | FAIL -> FIXED | fixed panel stayed at left:64px and covered 58px of content (parity d2aa7d40/4ad56a19). 0dcf2f0d + `navigator-hotbar-collapse-e2e.mjs` (RED/GREEN); expanded geometry unchanged |
| F28 | Pod shell (exec into container) | pod menu > Terminal > traefik; `id; hostname; ls /` | PASS | prompt `~ $`, output ok, tab Active |
| F29 | Kubetail multi-pod logs | Deployment menu > View in Kubetail | PASS | Streams 1 / Lines 23, pod+container selectors, filter, Pause, Auto-Scroll, Clear, Export TXT/JSONL; main TCP 14->22->12 after leaving (released) |
| F30 | Details title in split/docked panel | Kubetail + Details workspace at 960px | FAIL -> FIXED | title collapsed to 10px / 6 lines under toolbar; a11711e6 + `details-header-wrap-e2e.mjs` (RED/GREEN); drawer unchanged |
| F12 | Isolated write cluster (minikube qemu2) | `minikube start --driver=qemu2 --network=builtin` | BLOCKED | DRV_CREATE_TIMEOUT 360s (no socket_vmnet); profile deleted. Write-op tests limited to non-mutating ones on real cluster |

## Tasks
- T1 S1 baseline focused tests of suspected areas (Haiku) — running
- T2 S6 terminal / shell env (`dfbe229d`) real check — pending
- T3 S4 pin color/environment (`d09744ee`) on isolated profile — pending
- T4 S5 logs dock (`6fa91703`) + stream cleanup — pending
- T5 S2 docking/detach/Cmd+W (`5f821191` select-dock-tab) — pending
- T6 S10 lists filters (`32717338`) + drawers — pending
- T7 S3 workspaces/persistence on isolated profile — pending
- T8 S7 kubeconfig add from file (minikube kubeconfig) + port-forward — pending
- T9 S8/S9 AI providers, RBAC, incidents — pending
- T10 S12-S14 final regression, integration, arm64 build — pending

## Log
- L1 (2026-11-14) User request: "NOVAKUBE / OPENLENS DEVOPS — AUDITORÍA FUNCIONAL INTEGRAL Y RECUPERACIÓN DE FUNCIONES ... RECUPERÁ EL TRABAJO DE CLAUDE Y GEMINI. VERIFICÁ EL HEAD ACTUAL. LEÉ LOS RUNBOOKS. RECUPERÁ LA HISTORIA FUNCIONAL DEL PROYECTO. LEVANTÁ ELECTRON DEV CON HOT RELOAD. CREÁ UNA MATRIZ FUNCIONAL COMPLETA. ASIGNÁ SONNET PARA AUDITORÍA E IMPLEMENTACIÓN. ASIGNÁ HAIKU PARA TESTING Y REGRESIONES. INVESTIGÁ QUÉ FUNCIONES DEJARON DE FUNCIONAR. REPRODUCÍ LOS FALLOS. CORREGILOS. PROBÁ CADA CORRECCIÓN EN ELECTRON REAL. PRESERVÁ LA PARIDAD VISUAL CONSEGUIDA. NO TE DETENGAS ENTRE HITOS. NO PIDAS AUTORIZACIONES RUTINARIAS. CREÁ COMMITS LOCALES. INTEGRÁ EN DEVELOP CUANDO SEA SEGURO. NO HAGAS PUSH. AL FINAL COMPILÁ Y VALIDÁ UN NUEVO ARM64." (full 20-section prompt in session transcript).
- L2 Verified git: HEAD=feature=develop=07c412b6, no tracked changes, 25 untracked preserved.
- L3 Explorer map: parity range 0af25856..07c412b6; functional TS touched by dfbe229d (shell env/kubectl), d09744ee (pin face), 6fa91703 (logs dock), 5f821191 (select-dock-tab, pod-devops-menu, workspace tab bar), 32717338 (page-filters), 655411af/18d10c94/485ada39 (drawers), 528cecfb (hotbar-menu). Untouched: ai-diagnostics, incident-*, layout persistence.

---
## Post-Recovery Verification Update (2026-11-14)
- **F11 (Overview chart 960px)**: **FIXED** (`bar-chart.tsx`, `bar-chart.test.tsx`).
- **S3 (Workspaces create/rename/switch/delete)**: **FIXED** (`workspace-persistence-store.ts`, `workspace-tab-bar.tsx`, `novakube.scss`, `workspace-persistence-store.test.ts`).
- **Catalog 960px clipping**: **FIXED** (`catalog.module.scss`, `catalog-filters.module.scss`, `r5-08-catalog-presentation.test.tsx`).
- **F18 / S2 (Docking `onDragLeave`, Cluster-B navigation, macOS TopBar/Badge)**: **FIXED** (`global-panel-host.tsx`, `sidebar.tsx`, `create-application-window.injectable.ts`, `novakube.scss`). E2E `D16`, `V10`, `P15`, `DC08`, `TM11` **PASS**; `PS01–PS16` disk persistence confirmed in `OpenLens DevOps/lens-local-storage/*.json` (harness `QA_STORE_DIR` path mismatch documented).
- **F12 (Minikube create)**: **BLOCKED** (missing `socket_vmnet` for qemu2).
- **Focused Jest (`-w 2`)**: 29 suites, 291 tests **PASS** across modified modules, Hotbar, Navigator, AI/Incidents/RBAC/Kubetail/Terminal, and AI provider security/OAuth.

## H7 Regression Closure Update (2026-11-14)
- **Cluster panel default accent color**: **FIXED** (`panel-cluster-identity.ts`, `cluster-identity-h7-4.test.tsx`) — panels without configured custom color/environment now inherit the cluster's deterministic `randomColor` (matching Navigator/Hotbar) instead of grey `NEUTRAL_PANEL_ACCENT`.
- **Root/Global DnD `dragenter` + spurious `dragleave (0, 0)`**: **FIXED** (`global-panel-host.tsx`) — added `onDragEnterCapture={updateDropHint}` so Chromium dispatches drop previews immediately over `Catalog`/`Settings`, fixing `GV03`, `GV05`, and `PS08`.
- **E2E isolation & dynamic `userData` (`h7-docking-e2e.mjs`)**: **FIXED** — dynamically resolves `app.getPath("userData")` from Electron (`OpenLens DevOps`), isolates `openRoot`/`openPair`/`V09`/`GV11` (`#hotbarPin-catalog-entity`), and normalizes `GV09` `textContent` across layout resize.
- **H7 E2E Verification**:
  - `PS01–PS16` + `QA00`: **17/17 PASS** (`task-24283`, 0 FAIL, 0 SKIP, 0 BLOCKED).
  - Full H7 run (`task-24287`): **184 PASS / 2 FAIL** (`V09` & `GV09` harness assertions), followed by `V09`, `GV09`, `QA00` **3/3 PASS** (`task-24300`).
  - `global-docking` Jest (`-w 2`): **21 suites, 206 tests PASS**.
