# OpenLens DevOps Revival — R5-00 UI Audit

- Date: 2026-10-22
- Base: `7a4d6ab` (end of Release 4, branch `feat/r4-workspace-security`)
- Method: code audit by 5 parallel read-only agents (A sidebar/catalog, B tables/details, C styles/themes, D workspace/dock, E roadmap) plus isolated screenshots of the packaged R4 build (synthetic `127.0.0.1` API, isolated CICD profile, no real clusters).
- Tags: **[visual]** = backed by one of the screenshots listed in section 2 and reviewed by Opus (02-catalog, 04-pods-list, 08-terminal-prod-gate). **[code]** = read from source only, not visually validated. Anything not tagged [visual] is code-only.
- Caveat: several agents read compressed tool output. Line numbers marked `~` are approximate; recheck before quoting in a ticket. Paths are relative to `packages/core/src` (`$`) unless stated.

## 1. Summary

1. The classic skeleton (hotbar, hierarchical sidebar, catalog + drawer, dock, details drawer) is intact and heavily extension-facing; a re-skin through CSS variables is the safest path. [code]
2. Environment identity exists on only three surfaces (sidebar header, hotbar icon, workspace tab) and is absent from catalog, command palette and welcome. [code] The catalog gap is also confirmed in the screenshot. [visual]
3. Environment, alias and production logic is copied per component with divergent rules (`PRD` vs `PROD`, three production-detection sources, at least three production reds). [code]
4. Workspace tabs are OFF by default and have no Preferences toggle, so most users never see them. [code, verified by Opus]
5. The PROD terminal shows duplicated, inconsistent labels (`PRD` and `⚠️ PROD` chips plus "Guarded" text). [visual]
6. Resource tables are solid structurally (typed column injection, virtualization) but have fixed 33 px rows, no density option, no keyboard row access and kebab-only actions. [code]
7. Details drawer is a flat single scroll; the R4 owner and image provenance rows differ only by text. [code]
8. The dock and the two detached windows duplicate terminal and log chrome; the R4-04 headers are mostly inline `style={{}}` with hardcoded colours. [code]
9. Styling debt is measurable: 156 hex and 64 rgb literals in SCSS, 91 inline `style={{}}`, 49 distinct font-size values, 17 distinct border radii. [code, section 6]
10. Of the six R5-scope UI requirements, none is fully implemented; catalog statuses for UI-01 and UI-03 are stale. [code, section 5]

## 2. Evidence

### 2.1 Screenshots

Location (temporary, scratchpad, **not committed**): `/private/tmp/claude-501/-Users-gustavomarcon-Documents-lens/6720db7b-5156-46a6-a762-c040226d85fe/scratchpad/r500/shots/`

Capture set: packaged R4 build, 1440x900 at 2x (2880x1800). The index lists the files below; descriptions are taken from file names. Only the three marked "reviewed" were examined in detail by Opus for this audit.

| File | What it shows | Reviewed |
|---|---|---|
| `01-welcome.png` | Welcome / start screen | no |
| `02-catalog.png` | Catalog cluster list with hotbar | yes |
| `03-prod-cluster-overview.png` | PROD cluster overview (sidebar header, status bar) | no |
| `04-pods-list.png` | Pods resource table | yes |
| `05-pod-drawer.png` | Pod details drawer | no |
| `07-dock-new-tab-menu.png` | Dock "+" new-tab menu | no |
| `08-terminal-prod-gate.png` | Terminal tab on the PROD cluster (production gate) | yes |
| `09-dock-terminal.png` | Dock terminal | no |
| `10-dock-create-resource-yaml.png` | Dock create-resource (YAML) tab | no |
| `12-yaml-edit-tab.png` | YAML edit-resource tab | no |
| `13-port-forward-manager.png` | Port-forward manager page | no |
| `14-preferences.png` | Preferences | no |
| `15-preferences-app-theme.png` | Preferences, application theme | no |
| `16a-theme-menu.png` | Theme selection menu | no |
| `16-preferences-appearance-light.png` | Preferences with light theme applied | no |

Numbers 06 and 11 are absent from the set.

### 2.2 Not captured

- Logs tab (docked or detached).
- Light theme beyond the Preferences screen (no light-theme capture of catalog, tables, drawer, dock or R4 badges).
- Active port-forwards (only the manager page, no running forwards).
- Workspace tab bar (flag off, see section 10).

Consequence: legibility of the R4 reds/ambers on the light theme is unknown. [code]

## 3. Visually validated observations

From the Opus review of `02-catalog`, `04-pods-list` and `08-terminal-prod-gate`:

- Catalog cluster list shows no environment indicator; the PROD cluster ("prod-synthetic") avatar is green (name-hash colour), DEV avatar purple — colour does not convey environment. [visual]
- Version/Distro columns empty for disconnected clusters; Labels column truncated. [visual]
- Hotbar shows ~12 empty placeholder slots dominating the left rail. [visual]
- PROD cluster: sidebar header shows a red "PRODUCTION" badge and thin red left border; the workspace tab bar is not visible (feature flag off by default). [visual]
- Terminal on PROD shows two chips "PRD" and "⚠️ PROD" side by side plus "Production Environment — Guarded" text — duplicated, inconsistent labels; emoji glyph. [visual]
- Status bar is the same blue for every environment. [visual]
- Pods view shows "Export CSV" twice (header and filter bar). [visual]
- Namespace column rendered as underlined links; ReplicaSet/node links blue — busy table. [visual]

## 4. Per-area findings

Shell layout [code]: root frame (`renderer/components/cluster-manager/cluster-manager.tsx`) holds top bar, workspace tab bar (flagged), main route area, hotbar, status bar. Each cluster is an iframe whose layout (`renderer/frames/cluster-frame/cluster-frame-layout-child-component.injectable.tsx:33`) is `MainLayout` with `Sidebar` and `Dock`. Navigation state is therefore split between two JS realms.

### 4.1 Start screen and catalog

- Implementation [code]: `$/renderer/components/welcome/welcome.tsx` (141 lines) + global `welcome.scss`; MUI-style `react-material-ui-carousel` (autoplay 8 s) for banners, logo fallback. Catalog: `$/renderer/components/catalog/catalog.tsx` (class component, ~330 lines) on top of shared `ItemListLayout`; columns via injectables in `catalog/columns/`; details panel in `catalog/entity-details/`; add flow `catalog-add-button.tsx` (floating speed-dial).
- Reusable [code]: `ItemListLayout`, `Badge`, `Icon`, `Avatar`, `HotbarIcon` (reused in the name cell).
- Duplicates [code]: three implementations of "cluster name + icon + colour" (catalog name cell, `sidebar-cluster.tsx`, `workspace-tab-bar.tsx`); pin-to-hotbar logic in the catalog row menu and in the sidebar cluster menu.
- Scattered styles [code]: global SCSS in welcome with hardcoded px and inline carousel vars; `catalog.module.scss` overrides `:global(.TableRow/.TableCell/.HotbarIcon)`.
- Redesign blockers [code]: `WelcomeMenuRegistration`/`WelcomeBannerRegistration`, `category.emit("catalogAddMenu")`, custom views and entity detail items are public extension API.
- Navigation problems [code]: row click runs the entity when no details panel is open, otherwise toggles details (`entity-details/on-catalog-click.injectable.ts`); pin icon only appears on row hover; add actions hidden until the speed-dial is opened; welcome has no recent clusters or environment info. [visual] for: no environment indicator, avatar colour does not convey environment, empty Version/Distro, truncated Labels.
- Keep [code]: left category tabs + table, details drawer, persisted last category, registration-based extensibility.
- Polish only [code]: pin visibility, add-button discoverability, an environment column.

### 4.2 Sidebar, navigation, favorites (hotbar)

- Implementation [code]: `layout/sidebar.tsx` (125 lines), `sidebar-item.tsx`, `sidebar-cluster.tsx` (+ module scss), `sidebar-items.injectable.ts`, `main-layout.tsx` (resizable 150-400 px). Hotbar: `hotbar/hotbar-menu.tsx` (227 lines, drag/drop, 12 fixed cells via `defaultHotbarCells` in `$/features/hotbar/storage/common/types.ts:28`), `hotbar-entity-icon.tsx`, `hotbar-selector.tsx`. Top bar: `layout/top-bar/top-bar.tsx`. Command palette: `command-palette/`.
- Reusable [code]: `sidebarItemsInjectionToken` registry, `Menu`/`MenuItem`, `Tooltip`, `Avatar`.
- Duplicates [code]: alias fallback `clusterAlias || clusterName` repeated in `sidebar-cluster.tsx:126`, `hotbar-entity-icon.tsx:165`, `workspace-tab-bar.tsx:34`.
- Scattered styles [code]: SCSS modules for sidebar/hotbar, mixed global + module for hotbar, `overflow: overlay` and webkit scrollbar rules.
- Redesign blockers [code]: `ClusterPageMenuRegistration` / `clusterPageMenus` feed the sidebar (`extensions/lens-renderer-extension.ts:59`); changing the `SidebarItemRegistration` model risks legacy extensions.
- Navigation problems [code]: R4 entries (Applications & Images, Cost & OpenCost, GitOps under Workloads; MCP Server under Config) are nested two clicks deep; the sidebar header is not a cluster switcher (switching goes through hotbar or catalog); no sidebar search; no breadcrumb component found; palette entries carry no environment context. [visual] for: ~12 empty hotbar slots dominate the left rail.
- Keep [code]: vertical hotbar with drag-reorder and multiple hotbars, hierarchical sidebar, resizable width.
- Polish only [code]: hotbar slot sizing/empty slots (see [visual] above), nested R4 entry placement, emoji in hotbar tooltip.

### 4.3 Colours, icons, badges, environments

- Implementation [code]: model in `common/cluster/environment-types.ts` (`CLUSTER_ENVIRONMENTS`, `getClusterEnvironmentConfig`, `isProductionEnvironment`); preferences `clusterEnvironment`, `customEnvironmentName`, `clusterAlias`, `clusterColor` in `common/cluster-types.ts:108-112`; synced to entity spec by `main/cluster/update-entity-spec.injectable.ts`; edited in `cluster-settings/cluster-appearance-picker.tsx`.
- Consumers [code]: sidebar header (`sidebar-cluster.tsx` + scss), hotbar (`hotbar-entity-icon.tsx` + scss), workspace tab (`workspace-tab-bar.tsx/.scss`), port-forward dialog and list, terminal and edit-resource headers, detached window CSS. None uses the shared `Badge`.
- Duplicates [code]: environment badge implemented 4+ times; production detected via preferences OR label `devops.openlens.dev/production` OR `entity.spec.environment` (sidebar, hotbar) but only preferences/stored flag in the tab bar; `shortLabel` `PRD` in shared config vs `PROD` in `environmentBadge()` (`workspace-tab-bar.tsx:37-47`).
- Scattered styles [code]: production red appears as `#EF4444`, `rgba(239,68,68,..)`, `#c62828`/`rgba(198,40,40,..)`, `#eb5757`, `#c0392b`; `defaultColor` from the model is not wired to CSS.
- Redesign blockers [code]: none for adding tokens; renaming existing theme vars is a breaking change (section 7).
- Navigation problems [code]: environment visible only after selecting a cluster; not in catalog or palette. [visual] confirms: no catalog indicator; status bar identical blue for every environment; PROD sidebar shows red "PRODUCTION" badge and thin red left border.
- Keep [code]: the data model and prod/env concept; `getClusterEnvironmentConfig`.
- Polish only [code]: single `EnvironmentBadge`, one set of env colour tokens, unify short labels.

### 4.4 Workspaces and tabs

- Implementation [code]: `$/features/workspace-tabs/renderer/workspace-tab-bar.tsx` (~295 lines, monolithic) + scss (~270 lines); stores `workspace-tabs-store.ts`, `workspace-persistence-store.ts`, `common/workspace-history.ts`; snapshot model `$/common/workspace/session-snapshot.ts`. Mounted in the root frame; returns null when the flag is off.
- Reusable [code]: persistence/history layers, a11y roles and keyboard model (arrows, Home/End, Alt+Left/Right).
- Duplicates [code]: own `environmentBadge()`, own button idioms (unstyled `+`, `.nav-btn`), unicode glyphs instead of `Icon`.
- Scattered styles [code]: global SCSS; TSX fallback `#3d90ce`; production uses `#c62828`.
- Redesign blockers [code]: tab = one cluster (`readonly clusterId`), not a resource tab; bar lives in the root frame so it cannot touch Dock state without IPC.
- Navigation problems [code]: native `<select>` workspace picker, no rename/delete UI, `createWorkspace()` without a name prompt; tab overflow is silent (hidden scrollbar, no chevrons); Backspace closes a tab. Flag off by default means invisible. [visual] only for "bar not visible with flag off".
- Keep [code]: snapshot/history/persistence, a11y model, fail-closed cluster isolation.
- Polish only [code]: colours, spacing, glyph-to-icon, tab sizing. Structural: overflow strategy, workspace management UI.

### 4.5 Resource tables

- Implementation [code]: `item-object-list/list-layout.tsx` (`ItemListLayout`), `content.tsx`, `header.tsx`; `kube-object-list-layout/`; `table/` (class components); `react-table.tsx` as a second stack (9 files). `KubeObjectListLayout` is used by 39 files.
- Reusable [code]: typed column injection (`list-layout` package tokens), virtualization default-on, URL-persisted sort, column visibility store, CSV export.
- Duplicates [code]: two table stacks; status/label filters duck-typed with casts in `list-layout.tsx:266-304`; deprecated `filterItems` still applied; per-view SCSS status colours; pod status colours repeated in `menu-actions.scss`.
- Scattered styles [code]: per-view column widths via class names (`.name`, `.namespace`); hex overrides in `pods.scss`, `menu-actions.scss`, chart palettes (9 occurrences in resource views).
- Redesign blockers [code]: row height drives virtualization (`rowLineHeight` 17 + 2x `rowPadding` 8 = 33 px, `table.tsx:131-134`); props of `ItemListLayoutProps` and `TableCellProps` are used by extensions; base class names must stay; snapshots will churn.
- Navigation problems [code]: actions only in the last-column kebab, no right-click or hover actions; rows not keyboard reachable (no `role`/`tabIndex`/`aria-selected`); filters weakly discoverable ("Filtered" link only); column configuration opt-in (`isConfigurable` default false); no retry on load failure; plain empty state. [visual] for: "Export CSV" duplicated in header and filter bar; underlined namespace links and blue ReplicaSet/node links make the table busy.
- Keep [code]: single list layout, DI column model, virtualization, URL sort, tests.
- Polish only [code]: link colouring, duplicate CSV action, status bricks route through theme vars.

### 4.6 Details / inspector

- Implementation [code]: `kube-object-details/kube-object-details.tsx` (a `Drawer`), items from `kubeObjectDetailItemInjectionToken` (~54 registrations); common header `kube-object-meta/kube-object-meta.tsx`; `drawer/`. `DrawerItem` appears in 120 files.
- Reusable [code]: `DrawerItem`, `KubeObjectMeta`, `Badge`, `StatusBrick`, `KubeObjectStatusIcon`, `resolveOwnerReference` (`common/k8s-api/owner-reference.ts`).
- Duplicates [code]: image parsing in `applications-and-security/applications.tsx` and in `pod-details-container.tsx` (`describeContainerImage`); `DrawerTitle` used in only 6 files (grep, may miss aliases), so titles are composed inline per kind.
- Scattered styles [code]: SCSS per component, no hex in drawer files.
- Redesign blockers [code]: no shared layout contract between per-kind panels; drawer width storage key; snapshots under `drawer`.
- Navigation problems [code]: flat single scroll (no tabs/anchors); one object at a time; title is `Kind: name` without status or namespace; bare error text with no retry; UID/resourceVersion hidden with no UI toggle; "Controlled By" states (`verified`/`stale`/`missing`, `kube-object-meta.tsx:109-152`) differ only by text, and "not loaded" can mean deleted or unsubscribed; image provenance is a long vertical row list per container. No screenshot of the drawer was reviewed.
- Keep [code]: DI detail items, `KubeObjectMeta`, test ids on owner/image rows, the pure owner-resolution function.
- Polish only [code]: status Badge + icon for owner state, section grouping, title content.

### 4.7 YAML editor

- Implementation [code]: `dock/edit-resource/` (`view.tsx` 262 lines, `edit-resource-model.injectable.tsx` 669 lines, `save-verification.ts`, `diff-redaction.ts`), `dock/create-resource/`, `dock/editor-panel.tsx`, `monaco-editor/` wrapper shared by add-cluster, kubeconfig, CRD, ConfigMap, Helm and pod views.
- Reusable [code]: `MonacoEditor` wrapper, theme injectables (`add-new-theme.injectable.ts`, `monaco-themes/`), `EditorPanel`, `InfoPanel`.
- Duplicates [code]: header Badge restyled inline with `#eb5757` (same pattern in terminal `view.tsx`).
- Scattered styles [code]: R4-04 header uses inline `style={{}}` and hex (`edit-resource/view.tsx` ~l.40-60, 132-171); Monaco theme colours are separate hex data, not derived from tokens.
- Redesign blockers [code]: Monaco theme registration is global per frame; layout depends on parent resize (refocus hack in `editor-panel.tsx`); diff editor remount on `fullSize`; keep redaction and save-verify untouched.
- Navigation problems [code]: kind/name/namespace badges look identical (no hierarchy); Save/Cancel/diff/revert crowd the generic `InfoPanel` footer; Monaco in a 100 px minimum dock is very short. Screenshots `10-dock-create-resource-yaml` and `12-yaml-edit-tab` exist but were not reviewed.
- Keep [code]: model, save verification, redaction, `EditorPanel` contract.
- Polish only [code]: header, badges, footer buttons.

### 4.8 Logs and terminal

- Implementation [code]: terminal `dock/terminal/{view.tsx (292), terminal.ts (305)}` with R4-04 context header and production gate; PTY handover in `main/detached-tool-windows/terminal/`; logs `dock/logs/{view,controls,list,...}` (about 30 small injectable wrappers for state); detached windows `open-lens/static/detached-tool.*` and `detached-terminal.*` (plain HTML/CSS/JS, sandboxed).
- Reusable [code]: xterm in both docked and detached windows, `VirtualList` for log rows, Main-side bridge/manager separation, production gating.
- Duplicates [code]: docked vs detached terminal (no theme sync, font preference, search or copy handling in the detached one; hardcoded `#181a1b`); docked logs vs detached `<pre>` tail (500 lines, no search/follow/theme); near-identical first lines in the two detached CSS files.
- Scattered styles [code]: terminal header and gate almost entirely inline with `#eb5757`, `#3d90ce`, `#fff` and `var(--border)` (the theme defines `--borderColor`; `--border` may be undefined, unconfirmed); emoji "⚠️" as icon; detached CSS uses `#c0392b`, `#ff7b72`, `#23272a`.
- Redesign blockers [code]: PTY handover order (hold, close consumer, listen; suspend/resume symmetry; 256 KiB pending buffer; redock on crash); detached windows enforce CSP `default-src 'none'; script-src 'self'; style-src 'self'` and a preload contract, so no inline styles or React bundle without relaxing it; many `data-testid`s relied on by R4 tests. Detached logs use workspace id `"default"` (`detach-logs-controls.tsx` l.~22-23), not the active workspace.
- Navigation problems [code]: log toolbar is one dense row. [visual] for the terminal: duplicated `PRD` + `⚠️ PROD` chips plus "Production Environment — Guarded" text. Logs tab not captured.
- Keep [code]: bridge/manager, production gating, test ids, redock flow.
- Polish only [code]: header into SCSS module with tokens, one badge variant, icons instead of emoji. Structural: shared terminal chrome/config between dock and detached window.

### 4.9 Dock and detached windows

- Implementation [code]: `dock/dock/dock.tsx` (218 lines), `dock-tabs.tsx`, `dock-tab.tsx`, `dock/store.ts` (383), `dock-storage.injectable.ts`; detached window opener `main/detached-tool-windows/open-detached-tool-window.injectable.ts` (960x640, sandbox, devTools false).
- Reusable [code]: shared `Tabs`/`Tab`, `ResizingAnchor`, `TabKind` switch, dock store/tab model.
- Duplicates [code]: workspace bar and Dock tab strips are separate implementations of overflow and tab chrome.
- Scattered styles [code]: global `.Dock` SCSS plus CSS modules for tabs; one hardcoded scrollbar `rgba(106,115,125,.2)`.
- Redesign blockers [code]: Dock is per cluster iframe; `fullSize` covers the iframe only (`position: fixed; z-index: 100`), not the root bar; storage key `dock` (`{height:300, tabs:[terminal], isOpen:false}`) is app-state, not tied to workspaces; Monaco relies on dock resize events; feature flags `OPENLENS_DETACHED_TOOLS` and the workspace-tabs flag require both layouts to keep working.
- Navigation problems [code]: shortcuts (Shift+Esc, Ctrl/Cmd+W, Ctrl+./,) only work with focus inside the Dock and are not shown in tooltips; the "+" menu offers only "Terminal session" and "Create resource"; no tab reorder or context menu; tab overflow has no menu, hover-only 3 px scrollbar; tabs carry no environment marking. Screenshots `07`, `09` exist but were not reviewed.
- Keep [code]: store/tab model, resize anchor, shortcuts (extend them).
- Polish only [code]: tab visuals, toolbar density, scrollbar visibility.

### 4.10 Preferences, themes, customisation

- Implementation [code]: themes are TS injectables `renderer/themes/lens-dark.injectable.ts` and `lens-light.injectable.ts` (~105 colour names in `LensColorName`), applied by `apply-lens-theme.injectable.ts` as `--<name>` CSS vars on `documentElement` and `body.theme-light`; selection via `colorTheme` preference ("system" or theme id); UI at `features/preferences/renderer/preference-items/application/theme/theme.tsx`; terminal theme in `.../terminal/terminal-theme/terminal-theme.tsx`; cluster appearance in `cluster-settings/cluster-appearance-picker.tsx`.
- Reusable [code]: the single colour pipe (TS colours to CSS vars), reactive `activeThemeInjectable`, Monaco/xterm follow the active theme.
- Duplicates [code]: Monaco theme colours are separate hex data.
- Scattered styles [code]: `cluster-appearance-picker` (13 hex in TSX, 18 hex and 19 rgb in SCSS), `markdown-viewer.scss` (40 hex).
- Redesign blockers [code]: renaming or removing any of the ~105 colour vars or the 8 static vars breaks extensions; `Renderer.Theme.getActiveTheme()` and `LensTheme` are public.
- Navigation problems [code]: only `lens-dark` and `lens-light`; no custom theme UI; extensions cannot register themes; environment colours are not user-configurable. Electron 22 (Chromium 108) has no `color-mix`, so tinted states need precomputed theme entries. [visual] only for Preferences screens (`14`, `15`, `16a`, `16-...-light`), which were captured but not reviewed.
- Keep [code]: theme pipe, system-theme sync (`nativeTheme.shouldUseDarkColors`, visual smoke still pending per catalog).
- Polish only [code]: additive semantic token layer (surfaces, text, state, environment), spacing/radius/type scales, Roboto Medium face (500 is used but only Light/Regular/Bold are bundled).

## 5. Requirements status

Catalog statuses are stale: `FEATURE_CATALOG_FULL.md` is a 2026-10-19 snapshot and `ROADMAP_PROVISIONAL.md:5` says it keeps the historical plan. Real executed state is in the R1-R4 implementation checklists, and the R4 checklist itself is stale for R4-06/07/08 versus `R4_06..R4_09_VALIDATION.md`. Roadmap stage 7 (`ROADMAP_PROVISIONAL.md:52`) lists UI-01-03, UI-05, UI-12, UI-14b and says to do them "only if migration/risk is worth it". All rows below are [code]; none was visually validated.

| Req | Catalog status | Real state | Evidence | Class |
|---|---|---|---|---|
| UI-01 tabs | N (01a/b/c) | Cluster-level tabs exist behind a flag: reorder and close, no menus. No preview/pin on double click. A tab is a cluster, not a resource tab, so 01a "resource tabs" is not met. | `workspace-tab-bar.tsx:189` (`role="tablist"`), `:237` (`reorderTabs`); `cluster-manager.tsx:76`; `common/types.ts:11,16`; R4-02 still PARCIAL (p95 tab switch 461 ms at 10 tabs) | Partial (stale N) |
| UI-02 unified navigator | N | No tree or unified navigator; sidebar and iframes remain. | no `unified`/`cluster-tree` matches in `cluster-manager` or `sidebar.tsx` | Not implemented |
| UI-03 detach windows | N | Logs, inspector and terminal detach to isolated BrowserWindows (verified in packaged app per `R4_06_VALIDATION.md`: terminal 8/8, logs and inspector 13/13). No generic "any view" detach; window bounds persistence not found in code (03b). | `main/detached-tool-windows/*`, `r4-06-detached-logs.test.tsx` | Partial (stale N) |
| UI-05 tables | N / P | `react-window`, no TanStack, no column resize/reorder/autofit; the inherited "P" for 05b was not found in code. | `virtual-list/virtual-list.tsx`, `packages/core/package.json`; no matches for `columnOrder`/`resizab`/`dblclick` in `table` or `item-object-list` | Not implemented |
| UI-12 dock/history | N / P | 12a: single shared dock, no `clusterId` in `DockStore`. 12b: history only for workspace tabs (flag), Alt+Arrow. | `dock/dock/store.ts:107`; `workspace-history.ts:24,51` | 12a not implemented; 12b partial |
| UI-14b detail panels | P | Inherited panels; only drawer width persisted; no "+N" labels, no persisted accordions. | `drawer/drawer.tsx:106`, `drawer-storage.injectable.ts:11` | Not implemented (stays inherited) |

Related: UI-14a has code (`main/electron-app/features/get-electron-theme.injectable.ts:12-14`) with visual smoke pending; UI-04b exists for tabs only.

## 6. Metrics

All [code]. Source: audit C, counts taken with grep from `packages/core/src`; they are regex-based and approximate. Caveats: hex regex counts matches, not distinct colours; `colors.scss` (Material palette, 283 lines, 256 `rgb()` literals) is excluded where stated; quoted-hex counts exclude `renderer/themes/` and `monaco-themes`; tests are excluded in audit B's counts.

| Metric | Value |
|---|---|
| `.scss` files (incl. `features/`) | 263 (61 are `*.module.scss`) |
| `.tsx` files | 648 |
| Hardcoded hex in `.scss` (excl. `colors.scss`) | 156 |
| `rgb()/rgba()` in `.scss` (excl. `colors.scss`) | 64 across 19 files |
| Quoted hex in `.ts/.tsx` (excl. themes, monaco-themes) | 136 |
| `style={{ }}` in `.tsx` | 91 (95 counting `style={var}`), across 46 files |
| `var(--...)` usage in `.scss` | 899 |
| `font-size` declarations | 156, 49 distinct values (16 distinct px); 21 use a font token |
| `border-radius` declarations | 121, 17 distinct values; 19 use `$radius`/`var(--border-radius)` |
| `padding`/`margin` declarations | 627, 26 distinct px values; 240 use unit/padding tokens |
| `.theme-light` refs in `.scss` | 9 |
| Theme colour names | ~105 (`LensColorName`), ~131 hex strings in `lens-dark.injectable.ts` |

Command set (run from `packages/core/src`) is in audit C section 2; for example `grep -rEo '#[0-9a-fA-F]{3,8}\b' --include=*.scss . | grep -v components/colors.scss | wc -l`. In resource views only, audit B found 9 hex occurrences; its inline-style count was lost to truncation. Highest hex offenders: `markdown-viewer.scss` (40), `cluster-pie-charts.tsx` (16), `cluster-appearance-picker.module.scss` (18 + 19 rgb), `applications.scss` (16).

## 7. Extension-compatibility constraints

All [code].

- **Public CSS variables:** every key of `LensColorName` as `--<key>` (about 105) plus `--unit`, `--padding`, `--margin`, `--border-radius`, `--font-main`, `--font-monospace`, `--font-terminal`, `--font-size*`, `--font-weight*`, `--main-layout-header`, and `--sidebar-width`. Extension docs (`docs/extensions/capabilities/styling.md`) tell authors to use them. Renaming or removing any is breaking; additions are safe. `body.theme-light` is treated as public.
- **`Renderer.Component` exports** (`extensions/renderer-api/components.ts`, `export *`): layouts (Main/Setting/Page/Wizard/Tab, SubTitle), Button, Checkbox, Radio, Select, Slider, Switch, Input, SearchInput, Icon, Tooltip, Tabs, Table, Badge, Drawer, Dialog, LineProgress, Menu, Spinner, Stepper, Wizard, charts, `KubeObjectDetails/ListLayout/Menu/Meta`, StatusBrick, Notifications. Prop names, legacy global class names (`.Badge`, `.Button`, `.TableRow`, `.TableCell`, `.HotbarIcon`, `.Icon`, `.CatalogAddButton`, `.ItemListLayout`) and DOM structure must stay compatible.
- **Registration surfaces** (`extensions/lens-renderer-extension.ts:55-76`): `globalPages`, `clusterPages`, `clusterPageMenus`, `clusterFrameComponents`, `kubeObjectStatusTexts`, `appPreferences(+Tabs)`, `entitySettings`, `statusBarItems`, `kubeObjectDetailItems`, `welcomeMenus`, `welcomeBanners`, `topBarItems`; catalog `category.emit("catalogAddMenu")`, entity `onContextMenuOpen/onRun/onSettingsOpen`, catalog custom views and detail items.
- **Injection tokens that must keep their shape:** `sidebarItemsInjectionToken`, `kubeObjectDetailItemInjectionToken`, `podListLayoutColumnInjectionToken`, the general kube column token (`list-layout/src/general-kube-column-token.ts`), `kubeObjectMenuItemInjectionToken`, status icon providers, `lensThemeDeclarationInjectionToken`. `Renderer.Theme.getActiveTheme()` and the `LensTheme` shape are public.
- **List/table props:** `ItemListLayoutProps`/`KubeObjectListLayoutProps` (`renderTableHeader`, `renderTableContents`, `renderItemMenu`, `customizeTableRowProps`, `sortingCallbacks`, `searchFilters`, `tableProps`) and `TableCellProps` (`sortBy`, `showWithColumn`, `id`, `className`). Prefer additive, default-off props (for example a `density` prop).
- **Row-height contract:** `rowLineHeight`/`rowPadding`/`customRowHeights` drive virtualization.
- **Test ids to keep stable (R4):** `workspace-selector`, `workspace-create`, `workspace-nav-forward`, `terminal-context-header-*`, `terminal-prod-gate-*`, `terminal-prod-confirm-btn-*`, `terminal-redock-btn`, `detached-*`, `env-badge-*`, `edit-resource-prod-hazard-*`, `owner-ref-<key>`, `port-forward-prod-warning`.
- **Persistent state keys:** `itemListLayoutStorage`, column visibility store, sort/order URL params, `drawer-storage`, dock storage key `dock`, localStorage `openlens:workspace-tabs`. Renaming silently resets user preferences.
- **Other:** `react-table.tsx` (9 files) is a separate stack; detached windows run under CSP and sandbox; the shell-level rule from the roadmap is a feature flag plus classic-shell fallback.

## 8. Discarded features (must not be reintroduced)

Sources: `ROADMAP_PROVISIONAL.md:21,55`, `CATALOG_SCOPE.md`, `FEATURE_CATALOG_FULL.md`, `R4_RELEASE_PLAN.md` section 1.

- Licences, subscriptions, commercial functions, proprietary cloud accounts or sync (ROADMAP:21). Kubeconfig and exec auth remain.
- Native AWS EKS, Azure AKS, GKE and Mirantis MKE connectors (KC-07..KC-10); live cloud pricing APIs (DEV-03c).
- Telemetry, commercial accounts and licence modules (P-08, "fixed decision"); extension governance by corporate JWT (P-09).
- Copying proprietary Lens 2026 code (ROADMAP:22); use `LENS_2026_UI_UX_DEEP_DIVE.md` as a functional reference only.
- Commercial collaboration features (`CATALOG_SCOPE.md`).
- No automatic production access; no auto-install of CRDs or operators.
- Postponed, not discarded: mutating MCP tools (DEV-05e, never auto-execute), external AI CLI launchers (DEV-06), integrated AI (DEV-07).
- "Lens ID" accounts: no explicit string found in the files read; covered implicitly by the proprietary account/sync exclusion.

## 9. Known UI debt

- **Stale snapshots (143 failing tests):** global jest run shows 3142 tests, 143 failed (26 suites), 0 new versus R4-08 (`R4_09_VALIDATION.md`). 140 are in `src/features/*` (25 files) plus 3 in `cluster-frame.test.tsx`; they predate the R3 "applications" sidebar item (`R4_08_VALIDATION.md:70`). Of 20 snapshot files audited, 15 differ only by sidebar items, 4 include real new UI (edit-resource cluster badge, log cluster/pod-uid badges, CSV export + quick filters, new Helm dock-tab content), 1 unverified; none updated, each needs owner review. Expect heavy snapshot churn from any markup change.
- **S11 `illegal access`:** inherited, 0/10 in `R4_09_VALIDATION.md:88-89`; reproduced on a pre-R4 binary with workspace tabs OFF (`R4_03_VALIDATION.md:95-107`); comes from the Electron 22 V8 snapshot; "accepted limitation" (`R4_08_VALIDATION.md:83,96`). Not an R5 regression; do not chase it inside UI work.
- **Unverified line numbers:** audits A, B, D and parts of C worked from compressed output. Line numbers marked `~` or taken from those audits must be rechecked before use in tickets.
- **Not visually validated:** UI-04a (cluster colour/icon) and UI-14a (macOS theme sync) per catalog; workspace tab bar quality beyond Playwright captures with synthetic fixtures. ROADMAP rule (line 33): a milestone not testable visually stays PENDIENTE DE VALIDACION.
- **Open R4 items touching UI:** R4-02 PARCIAL (deep-link back/forward not certified, watcher lifecycle unmeasured, p95 tab switch 461 ms at 10 tabs); R4-06 spontaneous redock "mitigated; trigger inferred, not reproduced"; R4-07 alerts not implemented and RBAC-denied shown as `missing`; renderers still run with Node integration (do not flip globally).
- **Test environment:** host Node 26.7.0 versus declared <=20 in `packages/core/package.json`; R4 triage used Node 20.20.2.

## 10. Verified by Opus

- **Workspace tabs feature flag defaults OFF:** `packages/core/src/features/workspace-tabs/common/workspace-tabs-feature-flag.injectable.ts`. Enabled only via `--enable-workspace-tabs`, `OPENLENS_WORKSPACE_TABS=true`, `?enable-workspace-tabs`, or localStorage `"openlens:workspace-tabs"`. There is no Preferences toggle, and `setEnabled` has no UI caller.
- **Environment model:** `environment-types.ts` defines `shortLabel` "PRD" with `defaultColor` `#EF4444` for production. Other colours: STG `#F59E0B`, DEV `#10B981`, TEST `#8B5CF6`, LOCAL `#06B6D4`, CUSTOM `#3B82F6`, none `#64748B`.
- **Protected R4 build untouched:** asar hash unchanged (`311c95a1…`) after the screenshot run.
