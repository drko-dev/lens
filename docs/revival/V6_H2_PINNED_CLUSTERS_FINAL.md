# OpenLens DevOps v6 - Milestone 2: compact vertical pinned-clusters bar

Verdict: **PASS** (with the limitations listed below).

- Branch: `feat/v6-lens-ui-h2`, worktree `/Users/gustavomarcon/Documents/lens/lens-v6-h2`
- Starting commit: `8161707` (Milestone 1 HEAD, clean)

## Existing system reused (unchanged model)

The hotbar already was a vertical bar with drag-and-drop reorder (react-beautiful-dnd), an LED for the
connection phase, an environment badge and the appearance dialog (color, icon, environment).
Persisted hotbar format, cluster preferences and DnD reorder are untouched.

## Changes

| File | Change |
| --- | --- |
| `renderer/components/hotbar/hotbar-menu.tsx` | Collapse button (top zone) and 6 px collapsed edge that expands on click and shows the active cluster color |
| `renderer/components/hotbar/hotbar-menu.scss` | Native vertical scroll (`overflow-y:auto`, `overflow-x:hidden`), 56 px layout, short width transition |
| `renderer/components/cluster-manager/cluster-manager.scss` | `--hotbar-width` 75 px -> 56 px |
| `features/user-preferences/common/{preference-descriptors,storage}.injectable.ts` | New preference `hotbarCollapsed` (default `false`, not stored when false) |
| `features/hotbar/storage/common/hotbar.ts` | Pinning beyond the 12 default cells grows the hotbar instead of refusing |
| `features/hotbar/storage/common/storage.injectable.ts` | Load no longer truncates to 12 cells (it would have silently dropped pins 13+ on restart); only surplus trailing empty cells are removed |
| `renderer/components/cluster-settings/cluster-appearance-picker.tsx` | Icon presets added: Production, Development, Staging, Testing, Local, Datacenter, Generic cluster (Material icons already bundled) |
| tests | `storage-technical.test.ts` (+1: 25 pins), `icon-settings.test.tsx.snap` (+7 icons) |

Zones: top = collapse control (Home/Catalog already live in the top bar and as pins, not duplicated); middle = scrollable pins;
bottom = existing hotbar selector. Color (user chosen) and connection LED stay separate elements. No new polling.

## Persistence

- Pins/order: existing `lens-hotbar-store.json`.
- Collapsed state: `preferences.hotbarCollapsed` in `lens-user-store.json`; absent means expanded (compatible with old stores).

## Tests

- `tsc --noEmit` (packages/core): clean.
- ESLint on changed files: clean except 4 pre-existing errors in `cluster-appearance-picker.tsx` (lines not touched).
- Jest: `src/features/hotbar/storage`, `user-store`, `components/hotbar`, `components/cluster-settings`: pass
  (storage-technical 22/22 incl. the new one).
- `hovering-hotbar-menu.test.ts`: 2 snapshot failures **pre-existing** (they fail identically on `8161707`); snapshot not regenerated.

## Isolated smoke (packaged v6 H2 app, 1440x900, plus 1920x1080)

Isolation: temporary HOME, `CICD`, `sandbox-exec` denying writes to the real profile and `~/.kube`; logs show userData under the temp HOME.
Real profile hashes (46 files) before/after: 46/46 identical. R9-RC (PID 97512) untouched, never restarted.

Seed: 22 fictitious clusters + demo, 25 pins, inside the temp profile only.

1. App opens, pins shown: PASS. 2. Width 56 px: PASS. 3. Vertical scroll to pin 25, no horizontal overflow: PASS.
4. Collapse to 6 px and expand on edge click: PASS. 5. Collapsed state persists after restart: PASS.
6. 25 pins and their order survive restart: PASS (after the load fix above). 7. Demo Cluster active highlighted, LED separate from color: PASS.
8. Pin clicks navigate (Home, Catalog, Demo) with no duplicated tab: PASS. 9. Kubernetes sidebar works: PASS.

Screenshots: `/private/tmp/claude-501/-Users-gustavomarcon-Documents-lens/4ccd083d-ebcc-4918-9688-2cd14fa635a3/scratchpad/shots-h2/`
(`01-expanded`, `03-scrolled`, `04-collapsed`, `02-demo-active`, `07-1920`).

## Known limitations

- Seeded fictitious clusters are not catalog entities, so they render as disabled placeholders: switching between two live
  clusters, per-pin appearance and drag reorder were not exercised live (reorder code and storage tests unchanged).
- Collapsed edge uses the active cluster color only when its `spec.icon.background` is set; otherwise a neutral color.
- No real Kubernetes, no soak, no DMG. `hovering-hotbar-menu` snapshots remain stale.
