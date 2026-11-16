# R11 Complete Parity Gap Report: Mirantis Lens `2026.11.91422-latest` vs NovaKube (`develop @ ea48aa16`)

Live side-by-side inspection of `Lens.app` (`2026.11.91422-latest`, PID `44555`) against NovaKube (`OpenLens DevOps.app`, `develop @ ea48aa16`, PID `51428`), together with native macOS `osascript` menu inspection and `app.asar` (`static/build/lens.js`) introspection, identified **12 concrete functional, structural, and visual parity gaps (`GAP-01` through `GAP-12`)**. Closing these 12 blocks brings NovaKube to 1:1 visual and behavioral parity with Mirantis Lens while retaining NovaKube's native DevOps capabilities.

## Executive Summary

| Gap ID | Area | Mirantis Lens `2026.11.91422-latest` | NovaKube (`develop @ ea48aa16`) | Impact |
|---|---|---|---|---|
| `GAP-01` | Root Layout & Main View Tabs | Persistent `[Hotbar + Navigator + TabBar + StatusBar]`; `Preferences`, `Welcome`, `Release Notes`, `Extensions` open as tabs | Full-window `SettingLayout`/`TopBarLayout` hides Navigator and cluster tabs | High |
| `GAP-02` | Cluster Navigator Structure & Badges | Root-level `Applications` (`1`), `Flux` (`1.5`), `Argo CD` (`1.6`), `Device Resources [NEW]` (`6.5`), `Security Center` (`12`), `Cost Monitoring [NEW]` (`12.5`); `< ☸ cluster ● >` controls | Nested under `> DevOps` (`Applications & Images`, `GitOps`, `Trivy Center`, `Cost & OpenCost`); missing `NEW` badges, `Admission Policies`, full `Gateway API`, and `DRA` | High |
| `GAP-03` | Root Navigator Tree (Un-drilled) | `Bookmarks`, top-level `Extensions` (`Create new`, `Installed`, `Browse Marketplace`, `Meet the Extensions Community`), `Kubernetes Clusters` (`Local Kubeconfigs`, EKS, AKS, GKE, MKE, Lens Spaces) | No unified root Navigator tree outside cluster view / relies on separate `/catalog` | High |
| `GAP-04` | Workspace TabBar Behavior | Single-click ephemeral preview tabs (italic title via `showEphemeralTabInjectionToken`), double-click to pin, `☸️` icon, conditional cluster border color, `[PREMIUM]` + split button, Dock tab promotion | All tabs open pinned (non-italic), fixed `2px` violet top border, custom Overview icon, no Dock tab promotion | High |
| `GAP-05` | TopBar, AI Split Button & StatusBar | `Send Feedback`, split `[ >_ AI \| v ]` (`aiToolTopBarMenuKind`), bell, circular avatar; bottom `22px` blue `StatusBar` (`statusBarItemInjectionToken`); clean `< 1 >` Hotbar pager | Missing `Send Feedback` and split AI CLI switcher; missing `22px` bottom `StatusBar`; extra `<` button below Hotbar `< 1 >` pager | High |
| `GAP-06` | Preferences Categories & Controls | 10 consolidated tabs: `App`, `Proxy`, `Kubernetes`, `Editor`, `Tables`, `Terminal`, `Integrations`, `Telemetry`, `Experimental` (`lab-experiment-catalog` table), `External Tools` | Standalone legacy tabs (`Prometheus`, `Entity Settings`, `AI Providers`, `OAuth`); missing `Tables` and `External Tools`; static switches in `Experimental` | High |
| `GAP-07` | Live Installable Experiments | Interactive `Theme Tweaker (0.1.0)` and `URL Navigation & Sharing (0.1.0)` installable from `Preferences > Experimental` | Static switches without live installable experiment packages/UI | Medium |
| `GAP-08` | Table Search UX | Search history & starred favorites (`★`), Regex (`.*`), Match Case (`Aa`), bounded by `Preferences > Tables` limits | Basic search input without history, favorites, Regex/Match Case toggles | Medium |
| `GAP-09` | Advanced YAML Editor | Side-by-side Diff view against original resource + one-click Revert | Standard Dock YAML editor without side-by-side diff or one-click revert | Medium |
| `GAP-10` | Terminal Toolbar & AI Access | `Allow AI to access UI` switch + launch/resume in configured External Terminal | Standard cluster terminal toolbar without AI UI access toggle or external terminal launcher | Medium |
| `GAP-11` | macOS Native Menus | `View -> Toggle Hotbar` first item; clean `Window` (`Minimize`, `Zoom`, `Bring All to Front`); `Help` with `Release Notes`, `Export Support Logs`, `Send Feedback`, `Restart in Safe Mode` | `View -> Catalog` first item; extra macOS tiling items in `Window`; `Help` lacks `Release Notes`, `Export Support Logs`, `Send Feedback`, `Restart in Safe Mode` | Medium |
| `GAP-12` | Metrics & Drawer Polish | Auto-detection of `VictoriaMetrics`; clicking a Dock tab auto-closes the Details Panel (Drawer) | Prometheus-only auto-detection; Details Panel remains open when activating Dock tabs | Low |

---

## Detailed Gap Breakdown

### `GAP-01` — Unified Root Layout & Main View Tabs
* **Reference Architecture**: `@lensapp/root-layout` and `@lensapp/main-view` (`mainViewItemInjectionToken`).
* **Mirantis Lens Behavior**:
  * The shell frame `[Hotbar (44px)] + [Navigator Sidebar (248px)] + [Main View Workspace TabBar] + [Bottom StatusBar (22px)]` remains mounted permanently.
  * Utility views open as first-class tabs in the `Workspace TabBar` rather than replacing the shell:
    * `preferences-registered-tab-type` (`SettingsIcon`)
    * `welcome-registered-tab-type` (`HomeIcon`)
    * `cluster-settings-main-view-item`
    * `release-notes-registered-tab-type` (`FeedIcon`)
    * `terminal-for-main-view-tab-registered-tab-type` (`TerminalIcon`)
    * `ask-ai-processes-tab`
  * No full-screen `SettingLayout` takeover or full-screen `ESC` overlay is used to exit Preferences or Cluster Settings.
* **NovaKube Current Behavior**: Navigating to `/preferences`, `/welcome`, `/catalog`, `/extensions`, or `/cluster/:id/settings` replaces the entire viewport with `SettingLayout`/`TopBarLayout`, hiding the Navigator and active cluster tabs.

### `GAP-02` — Cluster Navigator Sidebar Order, Resources, Badges & Controls
* **Mirantis Lens Cluster Order (`orderNumber` table in `static/build/lens.js`)**:

| `orderNumber` | Mirantis Lens Group | NovaKube Status |
|---|---|---|
| `0` | `Overview` | Present at top |
| `1` | `Applications` (`applicationsTableKind`) | Hidden under `> DevOps -> Applications & Images` |
| `1.5` | `Flux` (`flux-table-kinds`) | Nested under `> DevOps -> GitOps` |
| `1.6` | `Argo CD` (`argo-table-kinds`) | Nested under `> DevOps -> GitOps` |
| `2` | `Nodes` | Present |
| `3` | `Workloads` (`Overview`, `Pods`, `Deployments`, `Daemon Sets`, `Stateful Sets`, `Replica Sets`, `Replication Controllers`, `Jobs`, `Cron Jobs`) | Present |
| `4` | `Config` — includes **Admission Policies** (`Mutating Admission Policies`, `Mutating Admission Policy Bindings`, `Validating Admission Policies`, `Validating Admission Policy Bindings`) | Missing all 4 `admissionregistration.k8s.io` Admission Policy views |
| `5` | `Network` — full **Gateway API** (`Gateway Classes`, `Gateways`, `HTTP Routes`, `gRPC Routes`, `TCP Routes`, `TLS Routes`, `UDP Routes`, `Reference Grants`, `Backend TLS Policies`, `Listener Sets`) | Only `Gateways` present; remaining Gateway API routes/policies missing (`Kubetail` and `Incidents` placed loosely after `Storage`) |
| `6` | `Storage` (`Persistent Volume Claims`, `Persistent Volumes`, `Storage Classes`) | Present |
| `6.5` | **`Device Resources` `[NEW]`** (`Resource Claims`, `Resource Claim Templates`, `Device Classes`, `Resource Slices` under `resource.k8s.io`) | Completely missing |
| `7` | `Namespaces` | Present |
| `8` | `Events` | Present |
| `9` | `Helm` (`Charts`, `Releases`) | Present |
| `10` | `Access Control` | Present |
| `11` | `Custom Resources` | Present |
| `12` | `Security Center` (`Overview`, `Roles`, `Resources`, `Images`) | Nested under `> DevOps -> Trivy Center` |
| `12.5` | **`Cost Monitoring` `[NEW]`** | Nested under `> DevOps -> Cost & OpenCost` without `NEW` badge |

* **Header & Row Controls**:
  * Cluster header row displays `< ☸️ <cluster-name> ● >` with explicit `drill-out-in-navigator` (`<`) on the left and `drill-down-in-navigator` (`>`) on the right of the green status dot.
  * Left vertical accent line (`#7e3f8f`) spans only child items under the drilled cluster.
  * Header search button `🔍` triggers `Kubernetes Cluster: Search` (`Cmd+P`) with `Recently Selected` and `Others` sections.

### `GAP-03` — Root Navigator Tree (Outside Cluster Drill-Down)
* **Mirantis Lens Behavior**: Drilling out of a cluster (`<`) reveals the root Navigator hierarchy in place inside the sidebar:
  * **Bookmarks / Favorites** (`A folder of bookmarks, at the top of the navigator`)
  * **`Extensions`** (`orderNumber: 1`): `Create new`, `Installed` (with inline `Check for updates` button/badge), `Browse Marketplace`, and `Meet the Extensions Community` (`orderNumber: 6`)
  * **`Kubernetes Clusters`**: `Local Kubeconfigs` (grouped by kubeconfig file), `AWS EKS`, `Azure AKS`, `Google GKE`, `Mirantis MKE`, and `Lens Spaces`
* **NovaKube Current Behavior**: Relies on standalone `/catalog` and `/extensions` full-screen pages instead of a unified root Navigator tree.

### `GAP-04` — Workspace TabBar Behavior & Styling
* **Ephemeral Preview Tabs**: Single-clicking a resource in the Navigator opens/reuses a single ephemeral tab with an *italic* title (`showEphemeralTabInjectionToken`); double-clicking or explicitly pinning promotes it to a permanent normal-weight tab. NovaKube opens every click as a pinned tab.
* **Tab Icons & Top Border**: Lens uses the Kubernetes cluster icon (`☸️`) on cluster resource tabs and applies `getCurrentTabBorderColor` conditionally when `cluster-color-difference` is enabled across multiple clusters. NovaKube draws a fixed `2px` violet top border and a target icon on `Cluster Overview`.
* **Right-Side Controls & Promotion**: Lens shows right-aligned status/split controls (`[PREMIUM]` / `view_sidebar` `◫`) and supports promoting Dock tabs (`Terminal`, `Logs`, `Editor`) into Main View tabs (`move-tab`).

### `GAP-05` — TopBar Right Controls, Bottom StatusBar & Hotbar Pager
* **TopBar Right Cluster**:
  * `Send Feedback` button/action opening the `Send Feedback` modal (`What you write here goes straight to the developers of Lens.`).
  * Split AI button `[ >_ AI | v ]` (`aiToolTopBarMenuKind`): primary click opens the selected AI coding CLI inside a Lens terminal tab (or external terminal per config); dropdown chevron lists detected CLIs on `PATH` (`Claude Code`, `GitHub Copilot CLI`, `Gemini CLI`, `Codex CLI`, custom command) with install/configure actions and quick link to `Preferences -> External Tools`.
  * Notification bell `🔔` + circular user/profile avatar.
* **Bottom StatusBar (`22px`, `#2b6cb0` / `#3072b4`)**: Full-width bar via `statusBarItemInjectionToken` displaying left status/license text, cluster name/connection indicator, active Ask AI background `Processes`, log export control, and `Support` on the right. Currently `0px` (absent) in NovaKube.
* **Hotbar Pager Artifact**: NovaKube renders a duplicate `<` chevron immediately underneath the `< 1 >` Hotbar pagination control at bottom-left (`see /tmp/live-user-novakube.png`).

### `GAP-06` — Preferences Information Architecture & Missing Pages
* **Mirantis Lens 10-Item Sidebar (`App` to `External Tools`)**:
  1. `App` (`Theme`, `Cluster Color Difference`, `Start-up`, `Install Lens CLI`, `Update Channel`, `Timezone`, `Show Demo Cluster`, `In-App Surveys`)
  2. `Proxy` (`Lens Internal Proxy`, `Allow Untrusted Certificates`)
  3. `Kubernetes` (`kubectl` binary download/mirror/directory/path, `Synced Items`, local `CLI helm driver` without blocking on network repo fetches)
  4. `Editor` (`Minimap`, `Line Numbers`, `Tab Size`, `Font Size`, `Font Family`)
  5. **`Tables`** *(missing in NovaKube)*: `Row Line Height` (`14`–`26` px), `Search History Limit`, `Search Favorites Limit`
  6. `Terminal` (`Shell Path`, `Shell Args`, `Terminal Copy & Paste`, `Terminal Theme` / `Match Lens Theme`, `Font Size`, `Font Family`)
  7. **`Integrations`**: Consolidated sections (`Kubernetes Environments` + `AI & Intelligence Integrations`) unifying Prometheus, OAuth, MCP Server, AI Providers, and Cloud Connectors (which are scattered as top-level tabs in NovaKube)
  8. `Telemetry`
  9. **`Experimental`** (`lab-experiment-catalog`): Interactive installable table (`Name | Version | Status | Action`) instead of static toggles
  10. **`External Tools`** *(missing in NovaKube)*: AI tool selector, `Allow AI to access UI` default toggle, `Open AI tools in an external terminal` toggle, and `External terminal command` input with `{command}`, `{directory}`, and `{title}` placeholders

### `GAP-07` — Live Installable Experiments (`Experimental` Catalog)
* **`Theme Tweaker` (`0.1.0`)**: Live color token editor for Lens themes, preset switcher, and custom theme persistence.
* **`URL Navigation & Sharing` (`0.1.0`)**: Browser-style location bar showing current resource route, typing navigation, and direct shareable links.
* NovaKube must wire `[Install]` / `[Uninstall]` state transitions and live feature mounting inside `Preferences > Experimental`.

### `GAP-08` — Table Search History, Favorites (`★`), Regex (`.*`) & Match Case (`Aa`)
* Lens persists recent searches and starred favorites globally across resource lists and clusters (`search-history-and-favorites`), offers instant autocomplete suggestions on focus/type, toggles Regex (`.*`) and Match Case (`Aa`), and honors limits configured in `Preferences > Tables`.

### `GAP-09` — Advanced YAML Editor (Side-by-Side Diff + Revert)
* Dock YAML editor in Lens provides a side-by-side Diff view comparing buffer edits against the initial/live resource manifest plus a single-click Revert button (`AdvancedEditorReleaseNoteBody`).

### `GAP-10` — Terminal Toolbar (`Allow AI to access UI` + `Open in External Terminal`)
* Terminal tab toolbar includes an `Allow AI to access UI` toggle switch (syncing with `Preferences > External Tools` default and generating/managing skill access context) and a button to re-open/resume the session in the configured external terminal application.

### `GAP-11` — macOS Native Menu Bar Alignment (`osascript` Verified)
Observed live differences via `osascript` between `Lens` and `OpenLens DevOps`:
* **`View` menu**:
  * Lens: `Toggle Hotbar`, `Command Palette…`, separator, `Back`, `Forward`, `Reload`, separator, `Actual Size`, `Zoom In`, `Zoom Out`, separator, `Toggle Full Screen`
  * NovaKube: starts with `Catalog` instead of `Toggle Hotbar` (`R10-MISS-04`) and shows `Toggle Developer Tools` under `View`
* **`Window` menu**:
  * Lens: `Minimize`, `Zoom`, separator, `Bring All to Front`
  * NovaKube: Electron/macOS auto-injected items (`Minimize All`, `Zoom All`, `Fill`, `Center`, `Move & Resize`, `Full Screen Tile`, `Arrange in Front`, `Remove Window from Set`, app name)
* **`Help` menu**:
  * Lens: `Welcome`, `Documentation`, `Release Notes`, `Premium Features`, separator, `Support`, `Export Support Logs`, `Send Feedback`, `Restart in Safe Mode`, separator, `License`
  * NovaKube: only `Welcome`, `Documentation`, `Lens Documentation (External)`, `Support`

### `GAP-12` — VictoriaMetrics Auto-Detection & Dock/Drawer Coordination
* **VictoriaMetrics Support**: Automatically detect `VictoriaMetrics` endpoints (`vmsingle`, `vmselect`, `victoria-metrics`) alongside Prometheus with zero manual configuration (`release-note-victoria-metrics`).
* **Drawer Coordination**: Clicking/activating any Dock tab automatically closes an open Details Panel Drawer (`Details Panel and Dock Tabs`), matching click-elsewhere behavior.
