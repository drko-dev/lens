# OpenLens DevOps Revival — R5 Design Direction

- Date: 2026-10-22
- Base: `7a4d6ab` (end of Release 4)
- Inputs: `R5_00_UI_AUDIT.md` (code audit + isolated screenshots)
- Status: proposal, awaiting owner approval

## 1. Identity in one sentence

**A dense, calm operator console where the environment you are touching is impossible to miss.**

OpenLens classic is a good tool with a generic 2019 skin. R5 does not repaint it as a
marketing dashboard; it gives it a recognisable, coherent look built around the two things a
DevOps operator cares about most: *finding things fast* and *never confusing PROD with DEV*.

## 2. Principles

1. **Environment first.** DEV / STG / PROD (and TEST, LOCAL, CUSTOM) are the primary visual
   signal of the product. One source of truth (`common/cluster/environment-types.ts`), one
   badge component, one set of colour tokens, shown on every surface that targets a cluster.
   PROD is the only environment allowed to "shout" (accent band + red badge); the others stay quiet.
2. **Density is a feature.** Tables stay compact (current ~25px rows). We add rhythm and
   alignment, not whitespace. No card grids replacing tables.
3. **Calm chrome, loud data.** Neutral, low-contrast chrome (sidebar, tab bars, toolbars); colour
   is reserved for state (status, environment, errors). Today chrome and state share the same
   saturated palette.
4. **Actions visible where the eye is.** Primary row/detail actions reachable without opening a
   kebab menu (hover actions + context menu, keyboard reachable). Keep the kebab for the long tail.
5. **Keep the classic skeleton.** Hotbar, hierarchical sidebar, catalog-with-drawer, dock,
   details drawer and their extension points stay. R5 changes their skin, consistency and
   discoverability, not their architecture.
6. **Tokens before pixels.** No new hardcoded hex, no new `style={{…}}` for visual styling. Every
   change lands as tokens + shared components so the next screen is cheaper.
7. **Additive and reversible.** New CSS variables are added; existing public `--camelCase` theme
   variables (extension contract) are never renamed or removed.

## 3. Visual language

### 3.1 Colour

Keep the existing theme mechanism (TS theme injectables → `--<name>` CSS vars via
`apply-lens-theme`). Add a **semantic layer** on top, defined per theme:

| Group | Tokens (new) | Maps from (existing) |
|---|---|---|
| Surfaces | `--surface-0` app bg, `--surface-1` panels, `--surface-2` raised, `--surface-3` hover | `mainBackground`, `contentColor`, `layoutBackground`, `sidebarBackground` |
| Text | `--text-1` primary, `--text-2` secondary, `--text-3` muted | `textColorPrimary/Secondary/Tertiary` |
| Borders | `--border-1` subtle, `--border-2` strong | `borderColor`, `borderFaintColor` |
| Accent | `--accent`, `--accent-soft` | `primary` |
| State | `--ok`, `--warn`, `--err`, `--info` (+ `-soft`) | `colorSuccess/Warning/Error/Info` |
| Environment | `--env-prod`, `--env-stg`, `--env-dev`, `--env-test`, `--env-local`, `--env-custom`, `--env-none` (+ `-soft` for backgrounds) | `environment-types.ts` default colours |

Notes:
- Electron 22 = Chromium 108: no `color-mix()`. `-soft` variants are explicit rgba values per theme.
- A user-chosen cluster colour (`clusterColor` preference) overrides the environment colour for the
  cluster's *icon/accent* only; the **environment badge always uses the environment colour**, so a
  custom colour can never make PROD look like DEV.
- Brand accent: keep a blue accent (classic `#3d90ce` family) to preserve familiarity; slightly
  desaturated for chrome. Red is reserved for PROD and errors.

### 3.2 Typography

- Keep Roboto (bundled). Add Roboto Medium (500) — the current "bold" token is 500 but only
  Light/Regular/Bold are shipped, so the browser synthesises it.
- Type scale tokens: `--fs-xs 11px`, `--fs-sm 12px`, `--fs-md 13px` (body/table), `--fs-lg 15px`,
  `--fs-xl 18px`, `--fs-2xl 22px`. Today there are ~49 distinct font sizes.
- Monospace (`--font-monospace`) for names that operators copy: resource names in detail titles,
  images, ports, IPs, labels.

### 3.3 Spacing, radius, elevation

- Spacing scale on the existing `--unit` (8px): `--sp-1 4px`, `--sp-2 8px`, `--sp-3 12px`,
  `--sp-4 16px`, `--sp-5 24px`, `--sp-6 32px`.
- Radius: `--radius-sm 3px` (inputs, badges), `--radius-md 6px` (panels, dialogs), `--radius-pill`.
  Today ~17 distinct radii.
- Elevation: `--shadow-1` (menus/tooltips), `--shadow-2` (dialogs/drawers). Flat elsewhere.
- Motion: `--motion-fast 120ms`; no decorative animation.

### 3.4 Icons

Keep Material Icons (font) + local SVGs via the existing `Icon` component. Rules: one size scale
(16 / 20 px), outlined style for chrome, filled only for state. No emoji glyphs in UI
(today `⚠️` is used in the PROD port-forward warning).

## 4. Environment treatment (the signature)

| Surface | DEV / STG / TEST / LOCAL / CUSTOM | PROD |
|---|---|---|
| `EnvironmentBadge` (single component) | small soft-tinted pill, env colour text | solid red pill, white text, `PROD` |
| Catalog cluster list | badge next to name + env column (sortable/filterable) | same, solid |
| Hotbar icon | coloured dot (existing) | red ring (existing `productionIndicator`) |
| Workspace tab | thin env-coloured underline + badge | red underline + badge |
| Window chrome when the active cluster is PROD | — | 3px red accent band at the top of the cluster area |
| Tool headers (terminal, logs, editor, port-forward) | badge + cluster alias | badge + alias + red left border |
| Confirm dialogs (PROD gate) | — | shared `Alert` component (danger), no inline styles |

Labels: the canonical short labels come from `environment-types.ts`. Decision: PROD's short label
becomes **`PROD`** (today `PRD` in the type file and `PROD` in the tab bar — they disagree).

## 5. What stays classic on purpose

- Vertical hotbar with drag-reorder and multiple hotbars.
- Hierarchical sidebar with persisted expansion and resize.
- Catalog = category tabs + table + details drawer.
- `KubeObjectListLayout` / `ItemListLayout` tables with virtualization, URL sort, column visibility.
- Bottom dock with terminal/logs/editor tabs; detached windows from R4-06.
- Every extension injection point (sidebar, top bar, status bar, catalog, details items, list columns).

## 6. Explicitly out of scope

- Replacing React, MobX, Monaco, xterm, react-window or the DI container.
- A new "unified navigator" replacing sidebar + iframes (UI-02) — stays an XL, optional item.
- TanStack/column resize grid rewrite (UI-05) — only if a later hito proves the need.
- Commercial services, Lens accounts, cloud-vendor connectors (KC-07..10), telemetry,
  licences (P-08), extension governance (P-09).
- User-authored theme editor (possible later; tokens make it cheap).

## 7. Visual-only vs structural

| Change | Kind |
|---|---|
| Token layer, semantic aliases, env tokens | visual (CSS only) |
| `EnvironmentBadge`, `Alert` shared components; migrating R4 inline styles | visual + small refactor (same DOM `data-testid`s kept) |
| Catalog env column, tab underline, PROD accent band | visual + small feature |
| Workspace tabs on by default + Preferences toggle | behaviour (flag default) |
| Tab overflow menu, hover row actions, context menu, keyboard rows | structural (component behaviour) |
| Detached windows following theme | structural (static HTML + CSP, needs theme payload over IPC) |
| Unified navigator, resource tabs (UI-01 full), grid rewrite | structural XL — not planned |
