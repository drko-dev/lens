# NovaKube vs Lens 2026 — parity matrix

Measured with CDP (`getComputedStyle` / `getBoundingClientRect`) against
the official Lens 2026 (Dark) and the built NovaKube app. Values are UI
observations only.

| Area | Official | NovaKube | Status | Commit |
|---|---|---|---|---|
| Table head | 14px / 500 / 47px | 14px / 500 / 47px (verified in Electron) | done | 9255b985 |
| Table cell | 14px / 500 | 14px / 500 | done | ee6eb031 |
| Dock tab | #1F2123, label 600, icon 16px | same | done | d891c7db |
| Drawer item | 28px | 28px | done | 485ada39 |
| Sidebar workload labels | Daemon Sets / Stateful Sets / Replica Sets / Cron Jobs | same; routes verified | done | 220c0a57 |
| Overview node-role control | Select, 24px, 12px, #181A1C, radius 3px | same (Master Nodes / Worker Nodes) | done | 3e9f3157 |
| Overview metric toggles | 26x26 icon buttons, active #181A1C + 1px #414348 | same | done | 3e9f3157 |
| Navigator tree rows | 24px pitch, 14px, #AAACAE; active #F1F3F5 on rgba(55,58,62,.5), radius 0 | same (verified in Electron) | done | see git log |
| Top bar | 49px, 1px #2D2F31 bottom rule | same (verified in Electron) | done | see git log |
| Preferences nav rows | 25px, 14px, active #F1F3F5 on flat #373A3E, radius 0 | same (verified) | done | see git log |
| Preferences switch (on) | 44x24, radius 40, #70D65C | same (verified) | done | see git log |
| Preferences content (section title, description, select) | 14px/600/#F1F3F5 uppercase title, 14px description, select 35px/14px #F1F3F5 | same (verified, built app) | done | see git log |
| Preferences container | opens as a workspace tab | full-screen overlay with ESC | pending (structural) | - |
| Preferences sections | App, Proxy, Kubernetes, Editor, Tables, Terminal, Integrations, Telemetry, Experimental, External Tools | App, Appearance, Proxy, Kubernetes, Editor, Terminal | pending: Tables/Integrations/Telemetry/Experimental/External Tools not mapped | - |
| Workspace tab width | fixed 250x36 | content-sized (206/185 x 35) | documented | - |
| Account menu (avatar) | Lens ID / Unregister | no equivalent | documented, not copied | - |
| List filter bar | search/namespace 24px, 12px text | 24px, 12px (verified in Electron) | done | see git log |
| Overview time-range Select (1h) | present | absent (no backend range support) | documented | - |
| Overview donuts / charts / events | need Prometheus data | test cluster has none | not comparable | - |
| Top bar: Send Feedback, UPGRADE, avatar | Mirantis account/commercial | no equivalent | documented, not copied | - |
| Navigator: Applications, Device Resources, Cost Monitoring | PREMIUM/NEW | no equivalent | documented, not copied | - |
| Navigator: Home + Kubernetes Clusters tree | present | cluster selector + icon rail | pending | - |

## Fixed regressions

Two theme tests pinned superseded values (dock active tab background and navigator highlight). The dock one had been failing since d891c7db. Both now assert the measured values; theme suite 54/54.

## Tests

Failing suites at 220c0a57 vs 9255b985 (38 suites): 218 failed / 422 passed
at both revisions, identical per test. The sidebar label change introduced
no regression. The failures pre-date this work.

## Navigation note

The official navigator needs the full pointer sequence
(`pointerdown`, `mousedown`, `pointerup`, `mouseup`, `click`); a bare
`click()` does not navigate.

| Logs dock log lines | Lens: 11.67px "Lucida Console" #fff, row 17.5px | NovaKube: 12.5px JetBrains Mono | done: 11.67px Lucida Console, row 18px (verified live) |
| Logs dock layout (toolbar, info bar, search 300x24) | Lens: single toolbar row + info bar "Displaying logs from…" | NovaKube: upstream layout (pod/namespace/owner chips, bottom control bar) | pending: structural |
| Nodes usage bars | Lens: 3px track rgb(65,68,72), radius 2px, fill rgb(61,144,206) | NovaKube: same (76x3 vs 74x3) | verified equal; fill empty in NovaKube is a data difference (no node metrics), not styling |
| Nodes list toolbar | Lens: Aa/.* search with star/history, "1 item" | NovaKube: Search Nodes + label filter + Add | pending: structural |
| Deployments list | Lens: namespace select + Aa/.* search, rows ~38px CSS | NovaKube: namespace select + search + download/count/label filter/Add, rows ~39px CSS | rows/head/filter equivalent; pending: structural toolbar (same as Nodes) |
| Pod drawer rows (Labels/Annotations/Conditions) | Lens: rows grow with content | NovaKube: rows shrank to 28px in the flex column, text overlapped next rows | done: flex-shrink:0 on .Drawer .DrawerItem (verified live, dev hot reload) |
| Events list | Lens: namespace select + Aa/.* search, Warning messages red | NovaKube: same table/colors; extra Count/Age/Last Seen columns, label filter, Add | table, head and Warning color equivalent; pending: structural toolbar (same as Nodes/Deployments) |
| Helm Charts/Releases table head | Lens: sentence case ("Name", "Description") | NovaKube: UPPERCASE with letter-spacing (only Pods had an override) | done: sentence case on all `.ItemListLayout .Table .TableHead` (verified live) |
| Helm Charts toolbar | Lens: Aa/.* search + "0 items" in the standard list toolbar | NovaKube: standalone full-width search bar band above the table | pending: structural |
| List toolbar overflow (PVC, any list with filter chips) | Lens: toolbar fits one row | NovaKube: fixed 40px nowrap header, status chip / label filter overflowed over the table head | done: header grows and wraps (verified live); official one-row look still pending (structural) |
| Storage tree | Lens: PVC, PV, Storage Classes | NovaKube: same + "DRA Devices" (real K8s resource) | kept: real equivalent of Lens' premium "Device Resources" |
| Kubetail | No Lens equivalent (NovaKube-only feature) | Multi-pod logs + resource details split view | kept as is; no overlaps. Note: mixed ES/EN copy ("Agregar panel", "Guardar") and duplicated title are product-copy decisions, not parity |
| Navigator/Pins geometry (1440x900) | Official: pins column 64px wide, Navigator panel 300x830 at (64,49), tree rows 24px, Home select 240x26 at (76,94), "KUBERNETES CLUSTERS" tree with cluster rows. NovaKube: HotbarMenu 60x831 at (0,49), pin icon 52x64 at (8,91), sidebar 241px wide, rows 24px, single-cluster tree. | Row height equal (24px). Differences: pins column 60 vs 64, panel 241 vs 300, no Home select/search, no multi-cluster tree. Structural TSX work pending; per-cluster dynamic pin colors must be kept. |
| Navigator/Pins widths (done) | Official 64px pins / 300px Navigator (default confirmed by double-click reset). NovaKube code forced 60/308; stored 285 was a user-resized value. | Fixed to 64/300 in novakube.scss and main-layout.tsx (reset target). Measured via CDP: HotbarMenu 64x831, sidebar 300x793. Parity test updated (15/15). Structure (Home select, search, multi-cluster tree) still pending. |
| Navigator "KUBERNETES CLUSTERS" section (partial) | Official lists AKS/EKS/GKE (Premium, not copied), Local Kubeconfigs and every cluster with arrow, status dot and chevron. | NovaKube now renders a "Kubernetes Clusters" heading plus every real catalog cluster (active one expanded, others as rows tinted with their own spec.icon.background; click uses entityRegistry.onRun like the pins). Verified at runtime: iframe receives the catalog (4 clusters), heading=1, other rows=3. Click-to-switch not exercised live to avoid connecting other user clusters. Pending: Home select 240x26, row indent/arrows/status dots for other clusters, "Local Kubeconfigs" grouping. NOTE: core TSX changes need `npm run build` in packages/core (the dev renderer watcher only picks up SCSS). |
| Navigator cluster rows typography/geometry (done) | Official: heading 12px/700 uppercase, letter-spacing normal; rows 24px, 14px/500, color rgb(170,172,174), label text 57px from panel edge. | NovaKube measured after fix: heading 300x24 12px/700 normal spacing; rows 24px pitch, 14px/500, same color; other-cluster label at x=57. Remaining: chevrons/status dots on other clusters, Local Kubeconfigs grouping indent (113/121/129 absolute), Home select 240x26. |
| Pins rail geometry (done) | Official CDP: column 64px; cell 47x48 at x=8; tile 37x38 at x=13 (5px inset); pitch 56px; first cell y=57; no collapse control. | NovaKube after fix (CDP): column 64px; cell 47x48 at (8,57); tile (13,62) 37x38; pitch 56 (57 -> 113). Collapse control relocated to the foot of the rail; environment badge kept (overlaid on tile base with a dark chip, never overriding env-specific colors). Cell background now transparent so only the cluster-colored tile shows; per-cluster color unchanged (spec.icon.background). Pending: selected-pin indicator geometry, hover state, multi-pin visual check. |
| Navigator header selector (partial) | Official: Select 240x26 at x=12 (y=45 below panel top), search icon beside it, "KUBERNETES CLUSTERS" row starting 82px below panel top. | NovaKube measured: selector 240x26 at x=12, y=45; single line with cluster name + inline environment badge + dropdown arrow; search button 28x28 at x=263; heading row starts at y=82. Differences kept: the control selects a cluster (NovaKube/safety), the official shows "Home"; no fake Home entry added. |
| Navigator cluster row internals (done) | Official (relative to panel): arrow 20x20 at x=17, cluster icon 16x16 at x=37, status dot 10x10 at x=268, label at x=57; chevron 12x12 at x=282 (cluster menu, not replicated). | NovaKube CDP after fix: arrow 17 / 20x20, pin 37 / 16x16, status 268 / 10x10, other-cluster label 57. Cluster pin tint remains per-cluster (spec.icon.background). Not replicated: right chevron, Local Kubeconfigs grouping row, AKS/EKS/GKE Premium rows (documented, no fake entries). |

## Tests (full-suite re-check at 39ed677b)

Full run of 527 suites: 70 failing, 338 failed / 4985 passed tests; one suite
(src/main/mcp/__tests__/mcp-security-hardening.test.ts) hung and was killed.
The 70 failing suites were re-run at HEAD and at 9255b985 (separate worktree,
2 workers): identical suite set and identical totals (338 failed / 659 passed /
9 skipped). No regression from the Navigator/pins work. The earlier "38 suites,
218 failed / 422 passed" figure is not reproducible in this environment with the
same scope; the 70-suite set is the current pre-existing baseline.
| Top bar history arrows (done) | Official 1440x900: bar 1440x49; back button 20x20 at (80,14), forward at (108,14); color rgb(170,172,174); forward 0.5 opacity only when disabled. | NovaKube CDP: bar 1440x49; arrows 20x20 at (80,14) and (108,14); same color. Right-side items (Send Feedback, AI, notifications, Upgrade, account avatar) are Premium/account features, documented and not replicated. |
| Content tab strip (partial) | Official (1440x900): strip y=49, 36px tall; "Navigator" tab 82x36 at x=64; content tabs 250x36 fixed, 14px/500, active bg rgb(31,33,35), inactive rgb(24,26,28). | NovaKube CDP: strip y=49 36px; workspace tab item 250x36, 14px, active bg rgb(31,33,35). Kept: workspace selector/new-workspace controls and environment badge on tabs (NovaKube features). Pending: inactive tab bg, close button geometry, "Navigator" header tab strip equivalence. |
| Pin hover / selection (documented) | Official CDP, real mouse over first pin: tile bg rgb(31,33,35) unchanged, no shadow, cursor auto, no outline. No pinned+active pin exists in the official instance, so the selected-pin indicator cannot be measured (would require pinning in the official app, which is not modified). | NovaKube: no background change on hover (same), cursor pointer (functional), ring/LED for the active cluster kept as NovaKube-specific identity. Needs a user-provided capture of an official selected pin to go further. |
| Tab states + close button (done) | Official: inactive bg rgb(24,26,28)/text rgb(170,172,174)/1px rgb(45,47,49) rule; active bg rgb(31,33,35)/text rgb(241,243,245)/transparent rule; padding 8; close 16x16 at (225,11). | NovaKube CDP matches for active; inactive verified on a cloned element (no app state change): identical values. Close button 16x16 at (225,11), color rgb(170,172,174). |

| Home / Welcome | Two-column layout ("Start" 16px / "Useful Guides"), 592px block, column pitch 282px, link-style actions 14px rgb(61,144,206), 31px gap tagline→columns | Measured via CDP: container 592x335, columns 282 + 310, links 21px line-height. Official brand logo not copied; official block offset (x=607) not reproduced, block is centered. Evidence: `novakube-welcome-columns.png` | PARTIAL (geometry measured; logo/offset documented) |

| Preferences / App page | Section heading 22px/600 rgb(241,243,245) (was 16/500), switch label 14px | Measured via CDP on both apps. Documented gaps: official opens Preferences as a workspace tab (NovaKube keeps its overlay with ESC), official sections Tables/Integrations/Telemetry/Experimental/External Tools and Lens CLI/Update channel rows are not present (no fake features added). Evidence: `official-preferences.png`, `novakube-preferences-heading.png` | PARTIAL |
