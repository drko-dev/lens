# R8 Visual Parity Matrix (Mirantis Lens `:9225` vs NovaKube DEV `:9223`)

Normalized viewport: `1440x900` (additional checks at `1280x800`, `960x720`).
Classifications: `MATCH` | `MINOR` | `MAJOR` | `BLOCKED`

| Screen / Component | Lens Reference | NovaKube Current | Status | Evidence | Notes |
|---|---|---|---|---|---|
| TopBar & Workspace Tabs | Cluster wheel icon, `Cluster Overview - <name>`, 2px cluster top accent, `250x36` tabs, layout split `[|]` | Colored cluster wheel (`#11aa18`), `Cluster Overview - h7-synthetic`, 2px top cluster accent bar, `250x36` tabs, layout split `[|]` (commercial Send Feedback/UPGRADE/avatar omitted) | `MATCH` | `r8-1-topbar-novakube.png` | Verified via Hot Reload CDP `9223` + Jest `30/30 PASS` |
| Navigator | `< <cluster>` drill-down header, no `KUBERNETES CLUSTERS` header inside active cluster, Workloads/Config expanded | `< h7-synthetic` drill-down header (`chevron_left`), clean resource tree (`24px` rows), clicking `<` reveals `KUBERNETES CLUSTERS` + other clusters | `MATCH` | `r8-2-navigator-novakube.png` | Verified drill-up/drill-down in CDP `9223` + Jest `34/34 PASS` |
| Hotbar & Pins | 64px rail, `47x48` cells (`56px` pitch), `37x38` tiles, `< 1 >` footer | 64px rail (`x=0, y=49, w=64, h=851`), `47x48` cells (`56px` pitch), `37x38` tiles (`rgb(31,33,35)`), `< 1 >` selector (`64x24` at `y=846`) | `MATCH` | `r8-2-navigator-novakube.png` | Verified via CDP `9223` + `hotbar-menu` Jest `8/8 PASS` |
| Cluster Overview | Toolbar (`44px`) + chart/donuts (`350px` row) + `Warnings: 1` table + `1h` selector | Toolbar (`44px`) + `350px` chart/donut row (tightened donut/warning spacing) + Warnings/No issues panel (`1h` range selector deferred — no backend) | `MATCH` (layout) / `BLOCKED` (`1h` selector) | `r8-4-overview-novakube.png` | `OVERVIEW_PIE_ROW_HEIGHT: 350`, `27/27 PASS` |
| Nodes Table | 47px head, search `Aa`/`.*` + count, 3px usage bars | `Aa`/`.*` search + `1 item`, 3px usage bars, `+` FAB | `MINOR` | `r8-0-nodes-novakube.png` | Full table sweep in R8.5 |
| Preferences (`App`) | 2-column layout, 25px nav rows, `Colorized Clusters`, toggles | 2-column layout, `Colorized Clusters`, clean alignment (`10.22%` global diff mostly from Navigator + commercial items) | `MINOR` | `r8-0-preferences-lens.png` vs `r8-0-preferences-novakube.png` | Auditing all tabs in R8.7 |
| Dock & Terminal | `36px` tab strip, `Terminal` / `Pod` tabs, expand/collapse | `36px` tab strip, `Terminal` tab, expand/collapse | `MINOR` | `r8-0-overview-novakube.png` | Auditing in R8.8 |
