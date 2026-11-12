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
