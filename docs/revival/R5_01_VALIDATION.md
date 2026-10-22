# OpenLens DevOps Revival — R5-01 Validation

## Environment identity v1 + token foundation

- Date: 2026-10-22
- Base: `7a4d6ab`
- Build: `releases/R5-01/OpenLens DevOps.app` (ARM64, unsigned),
  `app.asar` sha256 `f94919dc35143e46ea5382c90e91ed5964fe83df5517ca8f7c6e396f9536be21`
- Protected R4 build untouched (`app.asar` `311c95a1…`)
- Verdict: **done** — environment identity is consistent across catalog, shell and tools; checks below pass.

## Architecture decision

Environment classification comes **only** from the explicit preference
`ClusterPreferences.clusterEnvironment` (+ `customEnvironmentName`). Where no `Cluster` object is
available (root frame: catalog, status bar) the resolver falls back to `entity.spec.environment`, which
main projects 1:1 from that preference (`main/cluster/update-entity-spec.injectable.ts`).
Entity labels (`devops.openlens.dev/production|environment`) and cluster names are no longer consulted
anywhere in the touched code (they were in the sidebar and hotbar).
Authorization, connection and PROD confirmation logic are unchanged.

## Changes

### New

| File | Purpose |
|---|---|
| `renderer/components/tokens.scss` | spacing `--sp-1..6`, radius `--radius-sm/md/pill`, type `--fs-xs..2xl`, `--shadow-1/2`, `--motion-fast`, semantic aliases `--surface-*`, `--text-*`, `--border-*`, `--accent(-soft)`, `--ok/warn/err/info` |
| `renderer/components/environment-badge/` | single `EnvironmentBadge` (text label, PROD solid red + warning icon, others soft tint) + test |
| `renderer/components/alert/` | `Alert` info/warning/danger + test |
| `renderer/components/catalog/columns/kubernetes-environment.injectable.tsx` | sortable "Environment" catalog column |

### Modified (21 tracked files)

- `common/cluster/environment-types.ts` (+test): PROD short label `PRD` → `PROD`; `cssVar` per environment; `resolveClusterEnvironment()`.
- `renderer/themes/lens-theme.ts`, `lens-dark.injectable.ts`, `lens-light.injectable.ts`: 14 additive colour keys
  `env{Production,Staging,Development,Testing,Local,Custom,None}` + `…Soft` (→ `--envProduction`, …). No existing key renamed/removed.
- `renderer/components/app.scss`: imports tokens.
- `layout/sidebar-cluster.tsx` (+scss, +test), `hotbar/hotbar-entity-icon.tsx` (+scss), `catalog/columns/render-named-category-column-cell.injectable.tsx`,
  `features/workspace-tabs/renderer/workspace-tab-bar.tsx` (+scss, +test): badge component, env-coloured avatar fallback, label inference removed.
- `status-bar/status-bar.tsx` (+scss): active-cluster badge + name; red bar on PROD (warning/error states keep priority).
- `dock/terminal/view.tsx`, `dock/edit-resource/view.tsx`: one badge per header; gate restyled with `Alert`, logic untouched.
- `port-forward/port-forward-dialog.tsx` (+scss): PROD warning → `Alert danger` (same text, no emoji, same `data-testid`).

### Duplications removed

- 4 environment-badge implementations → 1 component.
- 3 different reds (`#EF4444`, `#c62828`, `#eb5757`/`#c0392b`) and inline env styles → theme tokens.
- Terminal and YAML headers: `PRD` chip + `⚠️ PROD` chip → one badge.
- Three slightly different PROD detections (sidebar, hotbar, tab bar) → `resolveClusterEnvironment`.

## How environments look

| Surface | PROD | STG / DEV / TEST / LOCAL / CUSTOM | none |
|---|---|---|---|
| Catalog | Environment column: solid red `⚠ PROD`; red avatar | tinted `STG`/`DEV`…; env-coloured avatar | empty; name-hash avatar |
| Sidebar header | `⚠ PROD` (md) + red left border | tinted badge | — |
| Hotbar | badge + red ring | badge | — |
| Status bar | whole bar red, `⚠ PROD` + cluster name | solid chip + name on normal bar | unchanged |
| Terminal / YAML header | one `⚠ PROD` badge + alias | one tinted badge | — |
| Port-forward dialog | `Alert danger` warning | — | — |

A user-chosen avatar background (`spec.icon.background`) and `clusterColor` are kept; the PROD badge/ring
never derive from them, so a custom-coloured PROD cluster still shows PROD.

## Verification

| Check | Result |
|---|---|
| `tsc` packages/core | exit 0 |
| ESLint (22 changed/new files, run from packages/core) | exit 0 |
| Jest related suites (36 suites listed in `scratchpad/r501/related-tests.txt` + new tests) | 369/369 pass; after fixes: catalog 123/123, status-bar 17/17 |
| R4 PROD confirmation tests (r4-04 gate, r4-09 port-forward) | pass, unedited |
| Snapshots | none updated |
| Packaged build + isolated screenshots (synthetic 127.0.0.1 API, isolated CICD profile) | dark + light, before/after |

Visual review (Opus, from screenshots):

- Catalog: one badge per row (Environment column), PROD/STG/DEV readable in dark and light.
- PROD: sidebar `PROD`, red avatar, red status bar with readable `PROD` chip; terminal header single badge; confirmation gate and "Connect to Production" present (not clicked).
- YAML edit on PROD: single badge in the context box.
- STG/DEV: tinted sidebar badge, readable solid chip in the status bar.

Defects found during validation and fixed (each required a rebuild — 3 builds in total):
1. Catalog showed two badges per row (name cell + column) → name-cell badge removed.
2. DEV chip unreadable on the blue status bar (soft green on blue) → badges render solid inside the status bar.
3. (pre-build) EnvironmentBadge SCSS referenced undefined variables → rewritten with per-env custom properties.

## Evidence

`docs/revival/evidence/r5-01/` — `before-*` (R4 build) and `after-*` (R5-01 build):
catalog (dark/light), DEV pods, PROD pods (dark/light), PROD terminal gate, PROD YAML edit, STG sidebar.

## Not verified / pending

- Port-forward dialog PROD `Alert`: not captured (synthetic API exposes no ports); covered by unit tests only.
- Hotbar badge/ring: not captured (no clusters pinned in the harness).
- Workspace tabs badge: not captured (feature flag off by default, unchanged — R5-02).
- `docs/revival/evidence` selection is a copy; full captures remain in the temporary scratchpad.
- Global Jest suite not run (policy); 143 pre-existing sidebar snapshot failures from R4 are unchanged in scope.
