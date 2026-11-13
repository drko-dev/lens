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
