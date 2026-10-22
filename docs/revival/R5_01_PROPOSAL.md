# OpenLens DevOps Revival — R5-01 Proposal

## Environment identity v1 + token foundation

- Date: 2026-10-22
- Base: `7a4d6ab`
- Status: approved 2026-10-22 and implemented. Results: `R5_01_VALIDATION.md`.
  Deviations: environment comes only from the explicit preference (labels no longer used); the catalog
  shows the badge only in the Environment column (no second badge next to the name); no PROD accent band.

## Why this first

The screenshots of the R4 build show the product's most important signal is also its least consistent:

- Catalog: no environment indicator; the PROD cluster avatar is **green** (name-hash colour).
- Terminal on PROD: two chips, `PRD` and `⚠️ PROD`, plus a third text label.
- Status bar: same blue for every environment.
- Four separate environment-badge implementations with three different reds
  (`#EF4444`, `#c62828`, `#eb5757`/`#c0392b`) and inline styles.

Fixing this is visible on every screen, touches no Kubernetes behaviour, and forces the token layer
that every later hito needs.

## Scope

### 1. Token layer (CSS only, additive)

- Static tokens in `:root`: spacing `--sp-1..6`, radius `--radius-sm/md/pill`, type `--fs-xs..2xl`,
  `--shadow-1/2`, `--motion-fast`.
- Per-theme tokens added to both theme injectables: `--env-{prod,stg,dev,test,local,custom,none}`
  and `-soft` variants (explicit rgba; Chromium 108 has no `color-mix`).
- Semantic aliases (`--surface-*`, `--text-*`, `--border-*`, `--accent`, `--ok/warn/err/info`)
  mapped to existing variables. **No existing variable renamed or removed.**

### 2. Single source for environment metadata

- `environment-types.ts` stays the source of truth (label, short label, colour key).
- PROD short label `PRD` → `PROD` (the tab bar already uses `PROD`; the type file disagrees).
- Default colours move to tokens; the TS keeps the token key, so CSS and TS cannot diverge.
- One helper to resolve a cluster's environment (preferences + entity label + spec), replacing the
  three slightly different copies (sidebar, hotbar, tab bar).

### 3. Shared components

- `EnvironmentBadge` (`size: sm|md`, `variant: soft|solid`; PROD always solid). Keeps existing
  `data-testid`s via props.
- `Alert` (`info|warning|danger`) for in-dialog/in-view warnings.

### 4. Apply to surfaces

| Surface | Change |
|---|---|
| Catalog cluster list | `EnvironmentBadge` after name + sortable "Environment" column |
| Cluster avatar (catalog, hotbar, sidebar) | if no user `clusterColor`, background = env colour (keeps name-hash for `none`) |
| Sidebar cluster header | badge component instead of local red pill |
| Hotbar icon | env dot/ring from tokens |
| Workspace tabs (when enabled) | badge + env underline |
| Status bar | `--env-prod` background when the active cluster is PROD; unchanged otherwise |
| Terminal / YAML editor headers | one badge + alias (remove duplicate chip and emoji) |
| Port-forward dialog PROD warning | `Alert danger` instead of inline `#EF4444` box |

### Out of scope for R5-01

Workspace tabs default (R5-02), sidebar regrouping (R5-03), table actions (R5-04), drawer header
(R5-05), detached windows (R5-07), user-configurable environment colours (R5-09).

## Files probably affected

- `packages/core/src/renderer/components/app.scss` (or new `tokens.scss` imported there)
- `packages/core/src/renderer/themes/lens-dark.injectable.ts`, `lens-light.injectable.ts` (+ theme type)
- `packages/core/src/common/cluster/environment-types.ts`
- new `packages/core/src/renderer/components/environment-badge/`, `.../alert/`
- `renderer/components/layout/sidebar-cluster.tsx` (+scss)
- `renderer/components/hotbar/hotbar-entity-icon.tsx` (+module scss)
- `features/workspace-tabs/renderer/workspace-tab-bar.tsx` (+scss)
- `renderer/components/dock/terminal/view.tsx`, `renderer/components/dock/edit-resource/view.tsx`
- `renderer/port-forward/port-forward-dialog.tsx`
- `renderer/components/status-bar/status-bar.tsx` (+module scss)
- catalog cluster column registration (renderer catalog / cluster category)

Exact line ranges to be confirmed at implementation (audit line numbers are approximate).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Tests asserting `PRD` text | grep tests first; update deliberately, list them in the validation report |
| Snapshot churn | update only snapshots of touched components, each diff reviewed |
| Extensions relying on theme vars | additive tokens only; public `--camelCase` vars untouched |
| R4 E2E selectors (`data-testid`) | preserved on the new components |
| Status bar colour hides extension status-bar states (warning/error) | existing warning/error variants keep priority over env colour |
| Custom `clusterColor` making PROD look green | badge always env colour; custom colour only affects avatar |

## Validation (minimum)

1. `tsc` for `packages/core`.
2. Jest: environment-types, sidebar-cluster, hotbar entity icon, workspace tab bar, R4-04 tools
   context (terminal/edit-resource), port-forward dialog, status bar, avatar.
3. One package build, then screenshots with the isolated harness (`scratchpad/r500/e2e/shots.js`):
   catalog, PROD pods + status bar, PROD terminal, port-forward dialog on PROD, DEV pods — dark and light.
4. Opus visual review of before/after screenshots. Report in `docs/revival/R5_01_VALIDATION.md`.

## Execution split (pending approval)

- Sonnet 1: tokens + theme injectables + environment-types + helper (foundation; runs first).
- Sonnet 2 (after 1): `EnvironmentBadge` + `Alert` + sidebar/hotbar/avatar/catalog.
- Sonnet 3 (after 1, parallel to 2, disjoint files): tab bar, terminal/editor headers, port-forward dialog, status bar.
- Sonnet 4: tests + single build + screenshots. Opus: review and integration.

Estimated size: ~15–20 files, small diffs; no new dependencies.
