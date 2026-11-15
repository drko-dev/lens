# R8 Visual Parity Matrix (Mirantis Lens `:9225` vs NovaKube DEV `:9223`)

Normalized viewport: `1440x900` (additional checks at `1280x800`, `960x720`).
Classifications: `MATCH` | `MINOR` | `MAJOR` | `BLOCKED`

| Screen / Component | Lens Reference | NovaKube Current | Status | Evidence | Notes |
|---|---|---|---|---|---|
| TopBar & Workspace Tabs | Cluster wheel icon, `Cluster Overview - <name>`, 2px cluster top accent, `250x36` tabs, layout split `[|]` | Colored cluster wheel (`#11aa18`), `Cluster Overview - h7-synthetic`, 2px top cluster accent bar, `250x36` tabs, layout split `[|]` (commercial Send Feedback/UPGRADE/avatar omitted) | `MATCH` | `r8-1-topbar-novakube.png` | Verified via Hot Reload CDP `9223` + Jest `30/30 PASS` |
| Navigator | `< <cluster>` drill-down header, no `KUBERNETES CLUSTERS` header inside active cluster, Workloads/Config expanded | `KUBERNETES CLUSTERS` heading shown above active cluster + other cluster at bottom | `MAJOR` | `r8-0-overview-lens.png` vs `r8-0-overview-novakube.png` | Fixing in R8.2 |
| Hotbar & Pins | 64px rail, active pin border, 12 slots (`#1f2123`), `< 1 >` footer | 64px rail, active pin blue/gear, 12 slots, `< 1 >` + collapse `<` | `MINOR` | `r8-0-overview-lens.png` vs `r8-0-overview-novakube.png` | Auditing in R8.3 |
| Cluster Overview | Toolbar + chart/donuts (`~350px` row) + `Warnings: 1` table | Toolbar + 2 Prometheus-missing cards + `No issues found` | `MINOR` | `r8-0-overview-lens.png` vs `r8-0-overview-novakube.png` | Auditing in R8.4 (with real/mock metrics check) |
| Nodes Table | 47px head, search `Aa`/`.*` + count, 3px usage bars | `Aa`/`.*` search + `1 item`, 3px usage bars, `+` FAB | `MINOR` | `r8-0-nodes-novakube.png` | Full table sweep in R8.5 |
| Preferences (`App`) | 2-column layout, 25px nav rows, `Colorized Clusters`, toggles | 2-column layout, `Colorized Clusters`, clean alignment (`10.22%` global diff mostly from Navigator + commercial items) | `MINOR` | `r8-0-preferences-lens.png` vs `r8-0-preferences-novakube.png` | Auditing all tabs in R8.7 |
| Dock & Terminal | `36px` tab strip, `Terminal` / `Pod` tabs, expand/collapse | `36px` tab strip, `Terminal` tab, expand/collapse | `MINOR` | `r8-0-overview-novakube.png` | Auditing in R8.8 |
