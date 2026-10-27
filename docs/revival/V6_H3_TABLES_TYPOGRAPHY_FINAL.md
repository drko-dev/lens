# OpenLens DevOps v6 - Milestone 3: table typography and density

Verdict: **PASS** (with the limitations listed below).

- Branch: `feat/v6-lens-ui-h3`, worktree `/Users/gustavomarcon/Documents/lens/lens-v6-h3`
- Starting commit: `6608548` (Milestone 2 HEAD, clean)

## Approach

All table views share `renderer/components/table` and already had a `tableDensity` preference with a selector in
Settings > Appearance. The preference is extended from two to three modes; no new store, component or dependency.

## Changes

| File | Change |
| --- | --- |
| `features/user-preferences/common/preference-descriptors.injectable.ts` | `tableDensity` accepts `compact` / `lens` / `comfortable`; unknown or missing -> `lens`; `lens` is not stored |
| `features/user-preferences/common/table-density.injectable.ts` | Type and default `lens` |
| `renderer/components/table/table.tsx` | Density type/default and per-density row padding / line height (virtual list heights) |
| `renderer/components/table/table.scss` | Row variables per density |
| `renderer/components/table/table-head.scss` | Header font 11px -> 12px (`--fs-sm`) |
| `features/preferences/.../table-density/table-density.tsx` | Three options: Compact (29px), Lens (35px), Spacious (43px) |
| tests | `table-density.test.tsx` (+1 default), `user-store.test.ts`, `appearance-preferences.test.tsx` (new default/label) |

## Densities

| Mode | Stored value | Row height |
| --- | --- | --- |
| Compact | `compact` | 29 px (padding 6, line-height 17) |
| Lens (default) | none (`lens`) | 35 px (padding 8, line-height 19) |
| Spacious | `comfortable` | 43 px (padding 12, line-height 19) |

Cell text stays 12 px (`--fs-sm`), headers 12 px, same Open Sans stack; no global font change, no new fonts.

## Persistence and compatibility

Same `lens-user-store.json` key `preferences.tableDensity`. An existing `comfortable` stays Spacious.
Previously `compact` was the implicit default and was never written, so installs without a stored value now start in Lens
(as requested); users who had explicitly picked the old Compact will see Lens until they choose Compact again.

## Preserved

Search, label filter, namespace filter, sorting, column resize/reorder/visibility, row selection, status colors and badges,
sticky headers, CSV export button: no logic touched (only CSS variables, one font size and density mapping).
Favorites bar (M2) and sidebar are unaffected by the density change.

## Tests

- `tsc --noEmit` (packages/core): clean. ESLint on `components/table`, `user-preferences/common`, appearance preferences: clean.
- Jest `components/table`, appearance preferences, `user-store`: 49/49 pass (resizer, reordering, column filter, row, density).

## Isolated smoke (packaged v6 H3, Demo Cluster, 1440x900 and 1920x1080)

Isolation: temporary HOME, `CICD`, `sandbox-exec` denying writes to the real profile and `~/.kube`; data confirmed under the temp HOME.
Real profile hashes (46 files) before/after: 46/46 identical. R9-RC (PID 97512) untouched.

- Pods (`demo-apps`): Lens 35 px, Compact 29 px, Spacious 43 px, switched live without restart: PASS.
- Deployments at Lens density, header/cell alignment, Running badge color: PASS.
- Sorting by NAME (arrow indicator, order flips) and search "api" (filters to one row): PASS.
- Selector shows exactly three options, Lens preselected with no stored key: PASS.
- Compact persisted across an isolated-app restart: PASS. Choosing Lens removes the stored key: PASS.
- 1920x1080 Pods check: PASS. Favorites bar and Kubernetes sidebar intact: PASS.

Screenshots: `/private/tmp/claude-501/-Users-gustavomarcon-Documents-lens/4ccd083d-ebcc-4918-9688-2cd14fa635a3/scratchpad/shots-h3/`
(`01-pods-lens`, `02-pods-compact`, `03-pods-spacious`, `04-deployments-lens`, `05-sorted`, `06-search`, `07-pods-lens-1920`, `00c-prefs`, `08-restart-prefs`).

## Known limitations

- **Nodes view crashes in the Demo Cluster** (`Cannot read properties of undefined (reading 'taints')`): the demo Node fixture
  (`main/demo-cluster/demo-cluster-data.ts`) has no `spec`. Pre-existing and unrelated to density; not changed here (Demo Cluster is out of scope).
  Nodes, Services, StatefulSets, DaemonSets, Jobs, ConfigMaps and PV/PVC were not viewed live; they use the same shared Table.
- CSV export, column resizing and column reordering were not exercised live (code untouched; resizer/reorder unit tests pass).
- No comparison against official Lens was available, so no claim of visual equivalence is made.
- No real Kubernetes, no soak, no DMG.
