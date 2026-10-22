# OpenLens DevOps Revival — R5-02 Validation Report

## Workspace tabs by default, overflow and shell polish

- Branch: `feat/r4-workspace-security`, base `5e76806`.
- Status: **done, uncommitted**.
- Build: `scratchpad/r502-build/out/mac-arm64/OpenLens DevOps.app`, asar sha256 `e5818f3a63ccc869fe7bcaedaf011589b529a4b2288ca35767d29fbbac4de3cc`.
- Evidence: `docs/revival/evidence/r5-02/` (`final-*` = final build, `r1-*` = first build, still representative).

## 1. What changed

- **Workspace tabs:** default ON. Precedence: CLI (`--enable/--disable-workspace-tabs`, forwarded by Main via env `OPENLENS_WORKSPACE_TABS_CLI`) > env `OPENLENS_WORKSPACE_TABS` > URL query > persisted localStorage `openlens:workspace-tabs` > default ON. Preferences > App toggle, disabled with a hint when overridden. Classic mode = flag OFF, identical shell (cluster-manager reads the flag reactively). Overflow chevrons plus a "Show all tabs" menu; active tab scrolled into view. Restore: tabs come back inactive, 0 API requests per restored cluster (12/12; before about 24-25 each).
- **Hotbar:** empty slots collapsed (one dashed drop target), tokens, env badge text-only, PROD ring kept.
- **Sidebar:** "DevOps" group (Applications & Images, GitOps [hidden without Argo/Flux access, by design], Cost & OpenCost, MCP Server); tokens; hover/active states.

## 2. Files changed

- Flag/prefs/tabs (A): `features/workspace-tabs/common/workspace-tabs-feature-flag.injectable.ts`, `features/workspace-tabs/renderer/workspace-tab-bar.tsx` + `.scss`, new `features/preferences/renderer/preference-items/application/workspace-tabs/{workspace-tabs-preference.tsx,workspace-tabs-preference-block.injectable.ts}`, tests.
- Main/cluster-manager: `main/start-main-application/runnables/setup-proxy-env.injectable.ts` (+test), `renderer/components/cluster-manager/cluster-manager.tsx`.
- Hotbar (B): `renderer/components/hotbar/{hotbar-menu.tsx,hotbar-menu.scss,hotbar-entity-icon.tsx,hotbar-entity-icon.module.scss}`.
- Sidebar (B): `renderer/components/layout/{sidebar-cluster.tsx,sidebar-cluster.module.scss,sidebar-items.module.scss}`; new `renderer/components/devops/devops-sidebar-items.injectable.tsx`; `parentId` changed in the applications, gitops, costs and mcp sidebar-items injectables (orders 10/20/30/40, routes unchanged).
- Snapshots: see section 4.

## 3. Acceptance checklist

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Precedence CLI > env > URL > pref > default; default ON | done | unit tests; `final-1-first-launch.png`, `final-8-flag-classic.png` |
| 2 | Read-only `overrideSource` for the toggle | done | flag tests (A report) |
| 3 | Preferences toggle with description; disabled + hint when overridden | done | `final-5-prefs-workspace-tabs.png`, `final-8b-flag-prefs.png` |
| 4 | Overflow: scroll, chevrons only when overflowing, menu with env badge + name | done | `final-2-overflow-menu.png` |
| 5 | Active tab scrolled into view; buttons with aria-labels | done | `final-2-overflow-menu.png`; overflow test |
| 6 | Order, focus, history, persistence semantics unchanged | done | `final-7-restored.png` (12 tabs, same order); workspace-tabs suites pass |
| 7 | Lazy restore, no connect/terminal/port-forward/stream | done | 0 API requests per restored cluster (12/12); `final-7-restored.png` |
| 8 | Env context via `EnvironmentBadge`; PROD accent not duplicated | done | `final-3-prod-active.png`, `r1-3-prod-active.png` |
| 9 | Hotbar empty slots collapsed; order/DnD/shortcuts intact | done | `final-4-devops-expanded-hotbar.png`, `final-4b-hotbar-pinned.png` (visual only; DnD not re-driven in the build) |
| 10 | DevOps group, same routes, built-ins unchanged | done | `final-4-devops-expanded-hotbar.png`, `r1-4-devops-expanded.png` |
| 11 | Tokens; connectivity indicators and PROD badges visible | done | `final-4b-hotbar-pinned.png` (PROD badge fully visible), `r1-9-light-prod.png` |
| 12 | Tests: precedence, overridden toggle, overflow logic | done | A report |
| 13 | tsc clean; targeted suites green; snapshot counts listed | partial | section 4: 5 legacy-drift suites left |
| 14 | Screenshots 8+ tabs, overflow, hotbar, DevOps, Prefs; restart check | done | all `final-*` / `r1-*` files |

## 4. Checks

- `tsc --noEmit -p packages/core`: 0 errors. ESLint clean on touched files.
- Jest targeted: workspace-tabs + preferences (A: 10 suites / 80 tests, later 8 suites / 67), cluster-manager + workspace-tabs + hotbar (9 suites / 71), workspace-tabs + hotbar + layout (10 suites / 82), reconciled devops suites (10 suites / 60).
- Snapshots updated, only for the new DevOps item: B 23 in 5 suites (order/visibility-of-sidebar-items, sidebar-and-tab-navigation core/extensions, cluster-frame) + C 28 in 10 suites. Left (legacy drift): pods, edit-namespace x2, delete-cluster-dialog, refresh-accessibility-technical.
- Builds: 2 (one defect round).

## 5. Defects found and fixed (round 1)

- CLI flag ignored in the packaged app (renderer argv lacks it): now forwarded by Main via env.
- Blank band after runtime toggle OFF: cluster-manager reads the flag reactively.
- "—" placeholder for env `none` in tabs/overflow menu: removed.
- Hotbar PROD badge clipped ("PRC"): badge text-only, `max-width: 100%`.

## 6. Pending / deferred

- A restored session shows Home, not the last active cluster view (by design: no auto-connect).
- Legacy "Export CSV" dark button in light theme (pre-existing, R5-04).
- 5 legacy-drift snapshot suites left unreconciled.
- Tab history arrows next to the top-bar back/forward: possible duplication, review in R5-06.
- Top bar polish, sidebar header cluster-switcher shortcut, status bar polish (former R5-03): deferred to a reduced R5-03.
