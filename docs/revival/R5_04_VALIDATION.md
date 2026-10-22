# OpenLens DevOps Revival — R5-04 Validation

## Resource tables: density and visible actions

- Date: 2026-10-22
- Base: `ccdb956` (R5-02)
- Build: `scratchpad/r504-build/out/mac-arm64/OpenLens DevOps.app` (ARM64, unsigned),
  `app.asar` sha256 `c7aa7a4a0891643c7426ace485d9e381026df775c611060656977641101188ec`
- Verdict: **done** — tables are denser and clearer, row actions are reachable by mouse, right-click and keyboard;
  Kubernetes operations, RBAC filtering and confirmations unchanged.

## Changes

| Area | File(s) | Change |
|---|---|---|
| Table rows | `table/table-row.tsx` | `TableRowProps` extends `React.HTMLAttributes` (was `DOMAttributes`; additive) so `onContextMenu`, `tabIndex`, `role`, `aria-*` reach the row. Clickable rows get `tabIndex=0`; Enter/Space on the focused row (target = row) call `onClick`; caller `onKeyDown`/`tabIndex` still win. |
| Table look | `table/table-row.scss`, `table.scss`, `table-cell.scss`, `table-head.scss` | Token padding (`--sp-3`), `--fs-sm` cells, header 600 / `--text-2`; hover `--surface-2`; `:focus-visible` 2px `--accent` ring; selected row `--accent-soft` + 2px inset accent bar (replaces the 4px `:before` bar); separator drawn as inset shadow. |
| Context menu | `item-object-list/content.tsx` | Right-click (and Shift+F10 / ContextMenu key on a focused row) on a row that has a menu forwards to the row's own "⋮" trigger → same `KubeObjectMenu` items, same visibility/permission filtering, same confirmations. Rows without a menu keep the native behaviour. |
| Menu trigger | `kube-object-menu/kube-object-menu.tsx`, `item-object-list/item-list-layout.scss` | `aria-label="Actions for <name>"`; "⋮" faint by default, fully visible on row hover / focus-within. |
| Toolbar | `kube-object-list-layout/kube-object-list-layout.tsx` (+scss) | One Export CSV per screen (header button kept; `KubeQuickFilters` no longer receives `showExportCsv`/`onExportCsv`, its props are unchanged). Inline styles → `.export-csv-button` with tokens (fixes the dark button in light theme). Quick-filter row spacing via `.quick-filters-row`. |

Quick inline actions (Logs/Shell/Edit icons per row) were **not** added: they cannot be derived safely from menu-item
metadata without new operation logic. Destructive actions (Delete, Force Delete, Evict) remain only inside the menu with
their existing confirmations.

## Compatibility

- Public props/exports unchanged; new props optional with previous defaults. Existing CSS classes kept
  (`TableRow`, `selected`, `KubeObjectMenu`, `KubeQuickFilters` props). `--tableBgcSelected` no longer used by the selected row
  (still defined by themes).
- Virtualization untouched: row height measured 33 px before and after.
- Extension columns and menu items flow through the same `Table`/`KubeObjectMenu` paths.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit -p packages/core` | 0 errors |
| ESLint changed files | no new errors (`kube-object-list-layout.tsx`/`.test.tsx`, `kube-quick-filters.tsx` keep their pre-existing HEAD errors) |
| Jest: table, item-object-list, kube-object-menu, kube-object-list-layout | 6/6 suites pass; 1 snapshot updated (`kube-object-list-layout.test.tsx.snap`: duplicate button removed, inline style → class — reviewed) |
| Build + isolated screenshots (synthetic API, 10 pods, 4 deployments, PROD cluster) | dark + light, before (R5-02 release) / after |

Visual review (Opus): before shows two Export CSV buttons (one dark in light theme); after shows one, readable in both themes.
Right-click opens the same menu as "⋮" (Terminal, Logs, Port Forward, Edit, Evict, Delete, Force Delete); no item clicked
except Edit (non-destructive: opened an editor dock tab, not saved). Keyboard focus ring visible; Shift+F10 opens the menu.

## Evidence

`docs/revival/evidence/r5-04/`: `b-*` (R5-02 release) and `a-*` (R5-04 build): pods dark/light, deployments, row hover,
selected row, context menu, keyboard focus + menu, single Export CSV (light), non-destructive Edit.

## Pending

- No automated test for right-click → menu in `content.tsx` (needs a heavy DI harness); covered by the packaged-app check.
- Density preference (compact/comfortable) deferred to R5-09.
- Pre-existing ESLint errors in `kube-object-list-layout.tsx` / `kube-quick-filters.tsx` (from R4) not fixed (out of scope).
- Column-visibility menu persistence not re-tested visually (code path untouched).
