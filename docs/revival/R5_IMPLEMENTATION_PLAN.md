# OpenLens DevOps Revival — R5 Implementation Plan

- Date: 2026-10-22
- Base: `7a4d6ab`
- Inputs: `R5_00_UI_AUDIT.md`, `R5_DESIGN_DIRECTION.md`
- Status: approved; R5-01 committed 5e76806; R5-02 (absorbs R5-03 shell polish) committed ccdb956; R5-04 committed 8587912; R5-05 committed 9b842b0; R5-06 committed 025785c; R5-07 committed; R5-07F (detached terminal lifecycle fix) pending, priority.

## Ordering logic

1. Highest visual impact with lowest functional risk first (tokens + environment identity).
2. Each hito is shippable on its own and leaves the app usable.
3. Behaviour changes (flag defaults, row actions, overflow) come after the visual base exists.
4. Structural / XL items (unified navigator, resource tabs, grid rewrite) stay out unless a hito
   proves the need.

## Test policy (unchanged)

Implement → `tsc` + related Jest tests → one brief visual check (isolated profile, synthetic
cluster, `scratchpad/r500/e2e/shots.js` harness) → fix → continue.
Snapshots: update only those of components touched by the hito, reviewing each diff. One package
build per hito, only when the visual check needs it. A green test is not a visual validation.

## Execution model

Opus: decisions, visual review of screenshots, integration. Sonnet subagents: implementation slices
with disjoint file sets, tests, screenshot runs (one build at a time, never concurrent).

---

## R5-01 — Environment identity v1 + token foundation  — DONE, see `R5_01_VALIDATION.md`

- **Objective:** make DEV/STG/PROD unmistakable everywhere and lay the token layer every later hito uses.
- **Screens:** catalog cluster list, hotbar, sidebar cluster header, workspace tabs (when enabled),
  status bar, terminal / YAML editor / port-forward tool headers, PROD port-forward dialog.
- **Reuse:** `common/cluster/environment-types.ts` (single source), theme injectables +
  `apply-lens-theme`, `Avatar` (`background` prop), status-bar module scss (already has state variants).
- **Files (probable):** `renderer/components/app.scss` (or new `tokens.scss`), `renderer/themes/lens-{dark,light}.injectable.ts`,
  `common/cluster/environment-types.ts`, new `renderer/components/environment-badge/`, new `renderer/components/alert/`,
  `layout/sidebar-cluster.tsx(+scss)`, `hotbar/hotbar-entity-icon.tsx(+scss)`, `features/workspace-tabs/renderer/workspace-tab-bar.tsx(+scss)`,
  `dock/terminal/view.tsx`, `dock/edit-resource/view.tsx`, `port-forward/port-forward-dialog.tsx`, `status-bar/status-bar.tsx(+scss)`,
  catalog cluster columns.
- **Visible change:** one badge style; PROD solid red pill `PROD`; env-coloured avatar fallback;
  env column in catalog; status bar red on PROD clusters; no more `PRD`/`PROD` duplicates or emoji.
- **Regression risk:** low–medium. Snapshots of the touched components; R4 `data-testid`s must be kept;
  extension CSS vars untouched (additive only).
- **Validation:** tsc; Jest for environment-types, sidebar-cluster, hotbar icon, workspace tab bar,
  terminal/edit-resource R4-04 tests, port-forward dialog; screenshots DEV vs PROD (catalog, pods, terminal, port-forward).
- **Depends on:** nothing. Details in `R5_01_PROPOSAL.md`.

## R5-02 — Workspace tabs on by default + overflow + shell polish (absorbs R5-03) — DONE, committed ccdb956, see R5_02_VALIDATION.md

- **Objective:** expose the R4 workspace tabs (hidden behind a flag today), make them scale, and calm the shell chrome (hotbar, sidebar).
- **Screens:** root frame top area, Preferences > App, hotbar, sidebar.
- **Reuse:** `WorkspaceTabsFeatureFlag.setEnabled`, `WorkspaceTabBar`, persistence store, `EnvironmentBadge`, `tokens.scss`, hotbar store, sidebar item injection tokens.
- **Files:** `features/workspace-tabs/common/workspace-tabs-feature-flag.injectable.ts`, `workspace-tab-bar.tsx(+scss)`,
  a Preferences > App item (`features/preferences/renderer/preference-items/application/`), `hotbar/*`, `layout/sidebar*`,
  sidebar item injectables of the R4 DevOps features.
- **Visible change:**
  - Tabs ON by default; precedence CLI > env > URL > user preference > default; Preferences toggle "Workspace tabs" (disabled + hint when overridden).
  - Overflow: scroll chevrons (only when overflowing), overflow menu listing all tabs, active tab scrolled into view; keyboard accessible.
  - Hotbar: empty slots collapsed (drop target only while dragging); R4 DevOps entries grouped under one "DevOps" sidebar section; token-based spacing/colours.
  - One env signal per surface (badge + a single PROD accent); no emoji.
- **Risk:** medium. Changes default behaviour; R4-01..04 tests assume flag semantics; sidebar snapshots (143 stale) only reconciled where output changed. Restoring tabs at startup must stay lazy (no cluster connect / terminals / port-forwards).
- **Validation:** tsc; workspace-tabs, hotbar and sidebar tests; screenshots with 8+ tabs; restart persistence check. See `R5_02_VALIDATION.md`.
- **Depends on:** R5-01 (badge/tokens).

## R5-03 — Shell polish: hotbar, top bar, sidebar grouping, status bar

- **Status:** merged into R5-02 (hotbar empty slots, DevOps sidebar grouping, token-based spacing).
- **Moves later if not done in R5-02:** top bar polish (`layout/top-bar*`), sidebar header cluster-switcher shortcut,
  status bar polish, full reconciliation of the 143 stale sidebar snapshots. Whatever is left is recorded in `R5_02_VALIDATION.md` and re-opened as R5-03 (reduced).

## R5-04 — Resource tables: density and visible actions — DONE, committed 8587912, see `R5_04_VALIDATION.md`

- **Objective:** faster operations from lists.
- **Screens:** all `KubeObjectListLayout` lists.
- **Reuse:** `ItemListLayout`, `Table`, `KubeObjectMenu`, column-visibility store.
- **Files:** `item-object-list/*`, `table/*`, `kube-object-menu/*`, pods list header.
- **Visible change:** hover row actions (logs/shell/edit/delete) + right-click menu reusing `KubeObjectMenu`;
  keyboard focusable rows; quieter link styling; single "Export CSV"; optional compact/comfortable density (fixed-height virtualization kept).
- **Risk:** medium-high (shared by ~40 lists and extensions). Keep props/class names; additive, default-safe.
- **Validation:** tsc; table/list tests; screenshots pods/deployments.
- **Depends on:** R5-01.

## R5-05 — Details drawer header and provenance states — DONE, committed 9b842b0, see `R5_05_VALIDATION.md`

- **Objective:** clear identity and state at the top of every detail view.
- **Reuse:** `Drawer`, `DrawerTitle`, `KubeObjectMeta`, R4-07 `resolveOwnerReference`.
- **Visible change:** header with kind icon, monospace name, status, env badge, primary actions;
  Controlled-By verified/stale/missing with icon + colour; collapsible image provenance.
- **Risk:** low–medium; ~54 detail panels unaffected (header only).
- **Depends on:** R5-01.

## R5-06 — Dock and tool headers — DONE, committed, see `R5_06_VALIDATION.md`

- **Objective:** one `ToolContextHeader` (cluster, namespace, env badge, actions) for terminal, logs, editor;
  tab overflow; visible shortcut hints.
- **Reuse:** dock store, R4-04 tool context.
- **Risk:** medium — PTY handover and Monaco layout depend on dock resize; do not touch handover order.
- **Depends on:** R5-01.

## R5-07 — Detached windows follow theme — DONE, committed, see `R5_07_VALIDATION.md`

- **Objective:** detached logs/terminal (static HTML under `open-lens/static/`) use the active theme tokens.
- **Kind:** structural (theme payload over existing IPC, CSP unchanged, no React added).
- **Risk:** medium — CSP/sandbox and PTY handover; reuse R4-06 E2E.
- **Depends on:** R5-01, R5-06.

## R5-07F — Detached terminal lifecycle fix — PENDING (priority, not started)

- **Problem:** navigating from a cluster to Preferences or Catalog and back can make the dock lose the detached state and spawn a second
  shell while the first stays alive in its detached window. Reproduced on R5-06 too; independent of R5-07 theme sync (pre-existing R4-06B handover).
- **Expected:** one PTY session keeps a single identity; navigating between views never creates another shell; the detached window keeps its
  session; redock recovers the original PTY; PROD protections unchanged.
- **Kind:** behavioural (dock placeholder/handover state must survive cluster-frame remount).
- **Risk:** high — PTY session lifecycle; reuse R4-06 E2E + PID checks across navigation.
- **Depends on:** R5-07. Requires explicit authorization before starting.

## R5-08 — Catalog and welcome

- **Objective:** catalog as the operator's home: group/filter by environment, visible pin, clearer add flow,
  simplified welcome (no carousel dependency).
- **Risk:** low–medium (catalog extension points kept).
- **Depends on:** R5-01.

## R5-09 — Preferences > Appearance and snapshot reconciliation

- **Objective:** density preference, environment colour overrides (persisted, with PROD contrast guard),
  and intentional update of remaining stale snapshots after review.
- **Depends on:** R5-01..R5-08.

## Not planned (documented decisions)

- UI-02 unified navigator replacing sidebar + iframes (XL).
- UI-01 full resource tabs with preview/pin (XL) — cluster tabs from R4 are the scope.
- UI-05 TanStack grid / column resize rewrite — revisit only with a concrete need after R5-04.
- UI-12a multiple docks, UI-14b panel memory beyond drawer width — candidates after R5-06.
- Everything listed as discarded in the audit (commercial, cloud connectors, telemetry, licences).
