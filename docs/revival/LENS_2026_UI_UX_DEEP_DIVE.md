# Official Lens (`2026.10.121159-latest`) Visual, UI & UX Deep-Dive (vs. OpenLens 6.5.3)

All analysis was conducted strictly in-memory against `/Applications/Lens.app/Contents/Resources/app.asar` (reading the ASAR header and `static/build/lens.js.map` [6,066 sources], `static/build/main.js.map` [1,673 sources], and `static/build/sub-window.js.map` [1,758 sources], all of which embed full TypeScript/TSX `sourcesContent`).

---

## 1. Scoped Packages in `node_modules` (ASAR Header)

### `@lensapp/*` (125 packages)
`@lensapp/animate`, `@lensapp/app-paths`, `@lensapp/app-paths-private`, `@lensapp/application`, `@lensapp/application-layout`, `@lensapp/avatar`, `@lensapp/button`, `@lensapp/certificates`, `@lensapp/checkbox`, `@lensapp/cluster-appearance`, `@lensapp/cluster-common`, `@lensapp/cluster-source`, `@lensapp/composite`, `@lensapp/computed-channel`, `@lensapp/computed-inject-many-settled`, `@lensapp/create-placeholder`, `@lensapp/date-time-picker`, `@lensapp/deep-linking-contracts`, `@lensapp/drop-down-menu`, `@lensapp/drop-down-menu-action`, `@lensapp/dynamic-features-contracts`, `@lensapp/electron`, `@lensapp/electron-application-time-slots`, `@lensapp/electron-main`, `@lensapp/electron-renderer`, `@lensapp/electron-sync-store`, `@lensapp/entity-actions`, `@lensapp/entity-aggregator`, `@lensapp/entity-aggregator-main`, `@lensapp/entity-aggregator-renderer`, `@lensapp/environment-variables`, `@lensapp/environment-variables-contracts`, `@lensapp/error-boundary`, `@lensapp/event-emitter`, `@lensapp/extension-governance`, `@lensapp/extension-preferences-contracts`, `@lensapp/extensions-navigator`, `@lensapp/fetch`, `@lensapp/fs`, `@lensapp/history`, `@lensapp/history-contracts`, `@lensapp/https-proxy-user-preferences`, `@lensapp/injectable-component-mocking`, `@lensapp/installed-extensions`, `@lensapp/installed-public-extensions`, `@lensapp/internal-proxy`, `@lensapp/json-api`, `@lensapp/keyboard-shortcuts`, `@lensapp/kube-api`, `@lensapp/kube-api-specifics`, `@lensapp/kube-cluster-resources`, `@lensapp/kube-display-name`, `@lensapp/kube-display-name-implementation`, `@lensapp/kube-object`, `@lensapp/kube-utilities`, `@lensapp/kubernetes-cluster-context`, `@lensapp/lens-id`, `@lensapp/lens-id-contracts`, `@lensapp/lens-platform-client-common`, `@lensapp/lens-platform-client-contracts`, `@lensapp/lens-platform-client-renderer`, `@lensapp/lens-platform-extension-sdk`, `@lensapp/lens-platform-sdk`, `@lensapp/lens-sync-store`, `@lensapp/lenscloud-stores`, `@lensapp/link`, `@lensapp/loadable-utilities`, `@lensapp/loading-entity`, `@lensapp/local-storage`, `@lensapp/logger`, `@lensapp/logs-export`, `@lensapp/main-view`, `@lensapp/main-view-tab-history`, `@lensapp/markdown`, `@lensapp/messaging`, `@lensapp/migrate-extension-store`, `@lensapp/migrations`, `@lensapp/navigator`, `@lensapp/notifications`, `@lensapp/pac-proxy-agent`, `@lensapp/persisted-state`, `@lensapp/persistent-storage`, `@lensapp/premium-features-contracts`, `@lensapp/presentational-components`, `@lensapp/public-extensions`, `@lensapp/react-application`, `@lensapp/react-testing-library-discovery`, `@lensapp/rendering-test-utils`, `@lensapp/resizing-anchor`, `@lensapp/root-layout`, `@lensapp/routing`, `@lensapp/run-many`, `@lensapp/scrollbar`, `@lensapp/select`, `@lensapp/share-common`, `@lensapp/shell-contracts`, `@lensapp/spinner`, `@lensapp/startable-stoppable`, `@lensapp/sub-window`, `@lensapp/switch`, `@lensapp/system-proxy`, `@lensapp/tabs`, `@lensapp/tanstack-react-virtual`, `@lensapp/telemetry`, `@lensapp/telemetry-contracts`, `@lensapp/telemetry-renderer`, `@lensapp/test-utils-for-production`, `@lensapp/theme`, `@lensapp/timers`, `@lensapp/toolbar`, `@lensapp/tooltip`, `@lensapp/tree`, `@lensapp/ui-components-dumb`, `@lensapp/ui-origin`, `@lensapp/use-inject-as-reactive`, `@lensapp/use-inject-defer-await`, `@lensapp/use-resize-observer`, `@lensapp/use-sync-inject`, `@lensapp/user-onboarding-wizard-contracts`, `@lensapp/user-preferences`, `@lensapp/utilities`, `@lensapp/utility-feature`, `@lensapp/vars`, `@lensapp/welcome`, `@lensapp/welcome-contracts`, `@lensapp/with-auto-dispose`

### `@k8slens/*` (39 packages)
`@k8slens/application-contracts`, `@k8slens/ask-ai-contracts`, `@k8slens/badge`, `@k8slens/channel-contracts`, `@k8slens/cluster-contracts`, `@k8slens/composable-responsibilities`, `@k8slens/details-panel-components`, `@k8slens/drop-down-menu-contracts`, `@k8slens/drop-down-menu-items`, `@k8slens/electron-contracts`, `@k8slens/element-component`, `@k8slens/element-components`, `@k8slens/feature-core`, `@k8slens/fp`, `@k8slens/icon`, `@k8slens/injectable`, `@k8slens/injectable-extension-for-mobx`, `@k8slens/injectable-react`, `@k8slens/input-components`, `@k8slens/instant`, `@k8slens/main-view-contracts`, `@k8slens/modal-components`, `@k8slens/modal-contracts`, `@k8slens/navigation-contracts`, `@k8slens/navigator-components`, `@k8slens/navigator-contracts`, `@k8slens/notifications-contracts`, `@k8slens/persistable-contracts`, `@k8slens/platform-specific-injectables`, `@k8slens/preferences-contracts`, `@k8slens/public-utilities`, `@k8slens/stylesheet-contracts`, `@k8slens/subscribable`, `@k8slens/subscribable-react`, `@k8slens/tab-components`, `@k8slens/tab-contracts`, `@k8slens/tabs-components`, `@k8slens/test-utils`, `@k8slens/typescript`, `@k8slens/use-inject`

---

## 2. All Unique `packages/*` Paths in Source Maps (`lens.js.map`, `main.js.map`, `sub-window.js.map`)

### `packages/business-features/*`
- **`_kube/*`**: `cluster-role-add-dialog`, `cluster-role-binding-dialog`, `cron-job-suspension-menu-item`, `cron-job-trigger-menu-item`, `deployment-human-readable-status`, `deployment-list`, `deployment-list-contracts`, `deployment-list-insights`, `endpoint-slice-list`, `helm-release-rollback-dialog`, `helm-repo-add-dialog`, `ingress-class-as-default-menu-item`, `kube-object-delete-menu-item`, `kube-object-edit-menu-item`, `kube-object-restart-menu-item`, `kube-object-scale-menu-item`, `kube-object-show-details-menu-item`, `namespace-add-dialog`, `node-menu`, `pod-evict-menu-item`, `pod-list`, `pod-list-contracts`, `pod-list-filtering`, `pod-menu`, `priority-class-list`, `resource-quota-add-dialog`, `role-add-dialog`, `role-binding-dialog`, `secret-add-dialog`, `service-account-create-dialog`, `service-account-kubeconfig-menu-item`, `workload-pod-logs-menu-item`
- **`_lens-id/*`**: `lens-id-auth`
- **`_migrations/*`**: `dock-tab-cluster-scoping`
- **Top-level (`packages/business-features/<name>`)**:
  `application-layout`, `application-preferences`, `application-preferences-contracts`, `architecture-mismatch-modal`, `aws-eks-utils`, `azure-aks-connector`, `child-application-for-kubernetes-resource`, `cloud-accounts-contracts`, `cloud-notifications`, `cluster` (contains sub-features: `cluster-appearance`, `cluster-connect`, `cluster-hotbar`, `cluster-settings`, `cluster-status-bar`, `cluster-visibility`), `cluster-onboarding-help`, `cluster-overview`, `cluster-scoped-dock-view`, `cluster-scoped-dock-view-contracts`, `cost-premium-feature-group`, `demo-cluster`, `details-panel-contracts`, `dock-tool-actions`, `dock-view`, `dock-view-contracts`, `dynamic-features`, `dynamic-features-contracts`, `dynamic-features-preferences`, `editor-preferences`, `editor-preferences-contracts`, `extension-governance`, `extension-preferences-contracts`, `extensions-navigator`, `gitops-premium-feature-group`, `global-keyboard-shortcuts`, `helm`, `history-navigation`, `hotbar`, `hotbar-contracts`, `initial-navigator-expansion`, `installed-extensions`, `installed-public-extensions`, `integration-connector-common`, `integrations-preferences`, `integrations-preferences-contracts`, `item-list-consumers`, `item-list-consumers-contracts`, `item-list-export`, `item-list-export-consumers`, `item-list-item-count`, `item-list-item-count-consumers`, `item-list-search`, `item-list-search-consumers`, `join-organization`, `kube-applications`, `kube-applications-contracts`, `kube-event-statuses`, `kube-object-details-panel`, `kube-object-details-panel-specifics`, `kube-object-status-icon`, `kube-object-tab-details-history`, `kube-resource-editing` (`edit-resource`, `edit-resource-tools`), `kube-subscription-errors`, `kube-subscription-errors-consumers`, `kubernetes-preferences`, `kubernetes-preferences-contracts`, `kubernetes-resources`, `kubernetes-resources-contracts`, `lens-cli`, `lens-license`, `local-kubeconfigs-connector`, `mcp`, `mcp-contracts`, `metrics`, `monaco-settings-user-preferences`, `namespace-filtering`, `namespace-filtering-consumers`, `namespace-select`, `namespace-select-badge`, `pod-logs`, `pod-metrics`, `port-forward`, `preferences`, `preferences-contracts`, `premium-features`, `premium-features-contracts`, `productivity-premium-feature-group`, `proxy-preferences`, `proxy-preferences-contracts`, `public-extensions`, `release-notes`, `reusable-keyboard-shortcuts`, `scaffolded-extension-exemplar`, `security-center`, `security-center-contracts`, `security-premium-feature-group`, `space-avatar`, `space-settings`, `status-bar`, `status-bar-contracts`, `support`, `survey`, `table-preferences-contracts`, `teamwork-preferences`, `teamwork-preferences-contracts`, `telemetry-preferences`, `telemetry-preferences-contracts`, `terminal-preferences`, `terminal-preferences-contracts`, `top-bar`, `top-bar-contracts`, `upgrade-subscription-button`, `user-onboarding-wizard`, `user-onboarding-wizard-contracts`, `welcome`, `welcome-contracts`, `window-controls`

### `packages/features/*`
`admission-policies`, `ai-tool-driving`, `ai-tool-publishing`, `ai-tools`, `ai-tools-contracts`, `argo`, `base-stylesheets`, `cost-monitoring`, `dra`, `experimental-features`, `extension-development`, `flux`, `gateway-api`, `main-view-tab-history`, `prism`, `stylesheet-contracts`, `sub-window`, `terminal-for-main-view-tab`, `terminal-in-general`, `window-messaging`

### `packages/technical-features/*`
- **`_kube/*`**: `application-instance`, `cluster-role`, `cluster-role-binding`, `config-map`, `cron-job`, `custom-resource-definition`, `daemon-set`, `deployment`, `endpoint-slices`, `endpoints`, `helm`, `horizontal-pod-autoscaler`, `ingress`, `ingress-class`, `job`, `job-store`, `kube-api`, `kube-api-specifics`, `kube-display-name`, `kube-object`, `kube-object-list-layout`, `kube-object-store`, `kube-object-store-subscriber`, `kube-resource`, `kube-resource-menu-contracts`, `kube-resource-view`, `kube-utilities`, `kubectl`, `kubernetes-contracts`, `lease`, `limit-range`, `mutating-webhook-configuration`, `namespace`, `network-policy`, `node`, `persistent-volume`, `persistent-volume-claim`, `pod`, `pod-disruption-budget`, `priority-class`, `replica-set`, `replication-controller`, `resource-quota`, `role`, `role-binding`, `runtime-class`, `secret`, `service`, `service-account`, `stateful-set`, `storage-class`, `validating-webhook-configuration`
- **`_lens/*`**: `lens-cloud-status`, `lens-id`, `lens-id-auth`, `lens-id-contracts`, `lens-id-main`, `lens-platform-client`, `lens-platform-client-contracts`, `lens-platform-config`, `lens-platform-extension-sdk`, `lens-sync-store`, `lens-token-refresher`, `lenscloud-stores`, `pac-proxy-agent`, `system-proxy`
- **`_low-level/*`**: `_utilities`, `application`, `composable-responsibilities`, `composite`, `computed-inject-many-settled`, `computed-interval`, `computed-interval-contracts`, `electron`, `electron-contracts`, `electron-window`, `element-components`, `event-emitter`, `exec`, `feature-core`, `fetch`, `fs`, `json-api`, `lens-protocol-router`, `logs-export`, `messaging`, `react-application`, `run-many`, `run-many-of-slow-runnables`, `run-many-performance-logging`, `startable-stoppable`, `subscribable`, `timers`, `ttlcache`, `utility-feature`, `with-auto-dispose`
- **`_ui-components/*`**:
  - `dumb`, `insights-bar`, `item-list-table`, `modal-primitives`, `pod-status`, `presentational-components`, `tanstack-react-virtual`
  - `individual/*` (69 sub-packages): `animate`, `avatar`, `badge`, `button`, `cel-expression`, `chart`, `chart-plugins`, `checkbox`, `code`, `column-filter`, `composed-section-blocks`, `confirm-dialog`, `dashboard-table`, `date-time-picker`, `declared-tables`, `details-panel-components`, `dialog`, `drawer`, `drop-down-menu`, `drop-down-menu-action`, `drop-down-menu-contracts`, `drop-down-menu-items`, `editable-list`, `editor`, `error-boundary`, `expandable`, `feature-status`, `gutter`, `hierarchy`, `horizontal-line`, `icon`, `info-panel`, `input`, `input-components`, `input-validators`, `item-object-lists`, `layout-sub-title`, `line-progress`, `link`, `list-layout`, `locale-date`, `map`, `markdown`, `menu`, `modal`, `modal-components`, `modal-contracts`, `modal-stack`, `monaco-editor`, `navigator`, `navigator-components`, `notice`, `notifications`, `notifications-contracts`, `option-list`, `path-picker`, `radio`, `reactive-duration`, `resizing-anchor`, `root-layout`, `scrollbar`, `search-input-toolbar`, `select`, `setting-layout`, `slider`, `spinner`, `status-brick`, `stepper`, `switch`, `tab-components`, `table`, `table-components`, `table-contracts`, `table-legacy`, `tabs`, `tabs-components`, `toolbar`, `toolbar-menu-items`, `tooltip`, `tree`, `user-avatar`
- **Top-level (`packages/technical-features/<name>`)**:
  `app-paths`, `application-menu`, `auto-focusable`, `aws`, `azure`, `certificates`, `clear-state`, `cli`, `cluster-kubeconfig`, `cluster-kubectl`, `cluster-shell-env`, `cluster-source`, `deep-linking-contracts`, `deleting-cluster`, `dock-tool-actions`, `electron-sync-store`, `entity-actions`, `entity-aggregator`, `environment-variables`, `environment-variables-contracts`, `helm`, `history`, `history-contracts`, `host-shell-spawn`, `instant`, `internal-proxy`, `item-list`, `jwt`, `keyboard-shortcuts`, `kube-cluster-resources`, `lens-cli`, `lens-license-agnostic`, `local-storage`, `logger`, `machine-id`, `main-view`, `main-view-contracts`, `main-view-kludge`, `mcp-dock-tools`, `mcp-kubernetes-tools`, `mcp-navigation-tools`, `mcp-prometheus-tools`, `mcp-server`, `metrics-provider`, `metrics-server`, `migrate-extension-store`, `migrations`, `modal-queue`, `monaco-settings`, `navigation`, `navigation-contracts`, `navigator-contracts`, `network`, `persisted-state`, `persistent-storage`, `prometheus`, `registry`, `renderer-uncaught-error-logging`, `resource-stack`, `routing`, `selecting-namespaces`, `shell`, `shell-contracts`, `some-menu-items-kludge`, `stores`, `survey`, `tab-contracts`, `table-header-icons`, `table-state`, `telemetry`, `time-utilities`, `user-preferences`, `vars`

### `packages/unknown-features/*`
`_legacy/core`, `_legacy/legacy-api-manager`, `builtin-entities`, `cloud-sync-reporter`, `cluster`, `command-palette`, `event-store`, `kube-object-menu`, `kube-object-menu-contracts`, `kubeconfig-sync-manager`, `lens-metrics`, `license`, `links`, `metrics`, `node-store`, `ports`, `service-store`, `share`, `terminal`, `theme`, `tray-menu`, `user-preferences`

---

## 3. Deep-Dive: 7 Visual / UI / UX Feature Areas

### Area 1: Multi-Window / `sub-window` & `window-messaging`
- **Key Modules**:
  - `src/sub-window/index.ts` (compiled to `static/build/sub-window.js` & `static/build/sub-window.html`)
  - `packages/features/sub-window/contracts/*` (`@k8slens/sub-window-contracts`)
  - `packages/features/sub-window/common/*`, `packages/features/sub-window/main/*`, `packages/features/sub-window/renderer/*`
  - `packages/features/window-messaging/contracts/*`, `common/*`, `main/*`, `renderer/*`
- **How It Works & What Can Be Detached**:
  - **Window Creation & Routing**: Any feature or extension can declare a typed sub-window kind using `getSubWindowKind<Params>()(specifier)` and register a React view via `getSubWindowKindInjectableBunch({ kind, Component, configuration })`. Opening a sub-window calls `openSubWindowInjectionToken`, which sends an IPC request (`openSubWindowChannel`) to the main process. The main process spawns a dedicated Electron `BrowserWindow` (`createLensWindowInjectable` with `windowFrameUtilitiesAreShown: true`, `persistWindowState: true`, `restoresFullScreen: false`) pointed at `https://<internal-proxy>/build/sub-window.html?kind=<kindId>&id=<encodedParams>`.
  - **Renderer Composition Root (`src/sub-window/index.ts`)**: Initializes its own DI container, blocks application-window-only chrome via `blockInjectablesOfOtherWindows(di, "sub-window")` (specifically excluding `status-bar`, `top-bar`, `main-view`, `hotbar`, `navigator`, `ai-tools`), and registers `themeFeature`, `baseStylesheetsFeature`, `elementComponentsFeature`, `installedExtensionsFeature`, `notificationsFeature`, `commandPaletteFeature`, `keyboardShortcutsFeature`, `dropDownMenuFeature`, `modalFeature`, `tableFeature`, and full Kubernetes cluster data features (`clusterSource`, `clusterState`, `clusterAppearance`, `kubeClusterResources`, `kubeResource`, `prometheus`).
  - **Scoped Persistence**: `windowStorageKeySegmentsInjectable` prefixes all persisted states in a sub-window with `["sub-window", kind, id]`, so table column widths, sorting, and hidden columns inside a sub-window are persisted independently per sub-window instance.
  - **Lifecycle & OS Window Menu**:
    - `keepSubWindowsAcrossRestartsInjectable`: Persists open sub-windows (`rememberedSubWindowsBunch`) with a 1000ms grace period on application quit/close so all open sub-windows automatically reopen in their saved screen bounds on next launch.
    - `closeSubWindowsWithTheApplicationWindowInjectable`: Closing the main application window closes all sub-windows.
    - `subWindowsInWindowMenuInjectable` & `closeAllSubWindowsMenuItemInjectable`: Dynamically populates the native macOS/OS `Window` menu with every open sub-window title (clicking focuses it) plus a `"Close All Sub-Windows"` item (`orderNumber: 910`).
  - **Cross-Window Messaging (`window-messaging`)**: Main process relays point-to-point/broadcast messages (`relayMessageChannel`), request/response with correlation IDs (`relayRequestChannel`), and reactive cross-window MobX observations (`observeChannel`, `unobserveChannel`, `publishValueChannel`, `openWindowsChannel`).

### Area 2: New Navigation & Layout (`RootLayout`, `MainView`, `Navigator`, `TopBar`, `StatusBar`, `Hotbar`, `TabContracts`)
- **Key Modules**:
  - `packages/technical-features/_ui-components/individual/root-layout/src/root-layout.injectable.tsx`
  - `packages/business-features/application-layout/src/*`
  - `packages/technical-features/main-view/src/*` & `packages/technical-features/main-view-contracts/src/*`
  - `packages/technical-features/tab-contracts/src/*` (`@k8slens/tab-contracts`)
  - `packages/technical-features/_ui-components/individual/navigator/src/*` & `packages/technical-features/_ui-components/individual/tree/src/*`
  - `packages/business-features/top-bar/src/*`, `packages/business-features/status-bar/src/*`, `packages/business-features/hotbar/src/*`
  - `packages/business-features/history-navigation/src/*`, `packages/features/main-view-tab-history/src/*`, `packages/business-features/kube-object-tab-details-history/src/*`
- **How It Works**:
  - **5-Slot Root Frame (`RootLayout`)**: Replaces OpenLens's old cluster-iframe + catalog layout with a single unified workspace:
    - `top`: `TopBar` (`Back`/`Forward` history buttons, Command Palette trigger, Window Controls, Space Avatar / Upgrade / AI tools).
    - `left`: `TogglableHotbar` (hidden or shown via `View -> Toggle Hotbar`, `hotbarFeatureFlagInjectable = true`, supports drag-and-drop slots and multi-page switching).
    - `center`: `MainView` (split horizontally via `ResizingAnchor` into `MainViewLeft` [Navigator sidebar] and `MainViewRight` [Multi-tab workspace + `ClusterScopedDock`]).
    - `bottom`: `StatusBar` (`statusBarItemInjectionToken` items aligned `left` or `right`).
  - **Focusable Layout Areas (`ApplicationLayout`)**: Tracks which pane currently has focus (`"navigator"`, `"main-view"`, or `"dock"` via `getApplicationLayoutAreaBunch`). Active tab top borders in `MainViewTabs` and `Dock` only light up with the accent/cluster color when that specific layout area is focused.
  - **Multi-Tab Workspace & VS Code-Style Ephemeral Preview Tabs (`MainViewTabs`)**:
    - Built with `@hello-pangea/dnd` (`DragDropContext` / `Droppable` direction `"horizontal"` / `Draggable`) for drag-and-drop tab reordering (`reorderTabsByIndexInjectable`).
    - **Ephemeral (Preview) Tabs** (`createEphemeralTabInjectable`, `data-is-ephemeral-test`): Single-clicking an item in the Navigator opens (or replaces) a single preview tab whose title is rendered in **italics** (`$font={{ size: "xs", italic: isEphemeral, bold: "600" }}`). Double-clicking the Navigator node or double-clicking the tab header (`$onDoubleClick={setAsNotEphemeral}`) pins it as a permanent tab.
    - Middle-click (`event.button === 1`) closes a tab; right-click opens `mainViewTabMenuKind` (`Close`, `Close All`, `Close other tabs`, `Close tabs to the right`).
    - **Unified Tab Contracts (`@k8slens/tab-contracts`)**: Provides a uniform API (`getTabKind`, `presentTabInjectionToken`, `hasTabInjectionToken`, `hasTabReactiveInjectionToken`, `closeTabsInjectionToken`) across both `mainViewTabHostKind` and `dockTabHostKind`.
  - **Virtualized Navigator Sidebar (`@lensapp/navigator` + `@lensapp/tree`)**:
    - Replaces the old static cluster sidebar + catalog with a single virtualized hierarchical tree (`rowHeight: 24`, `indentStep`, powered by `@lensapp/tree` and `@lensapp/tanstack-react-virtual`) where multiple clusters, folders, workloads, and extensions live in one unified tree.
    - **Top `NavigatorMenuTabs`**: Switches between top-level sidebar views (e.g., `Navigator` vs. `Extensions`).
    - **Drill-Down / Drill-Out (`navigator-drilldown-menu`)**: Users can drill into any branch entity (e.g. a specific cluster or folder) via `drillDownInNavigatorInjectable` so that subtree becomes the root (`baseEntityPath`), and drill back out via `DrillOutButton` or the `ToolbarSelect` dropdown (`id="navigator-drilldown-menu"`).
    - **Inline Creation & Renaming**: Supports inline node input (`navigator-menu-node-input.injectable.tsx`) for creating child entities (`Cmd/Ctrl+N` / `triggerCreateChildInjectable`) or renaming folders/entities inline.
    - **Full Keyboard Navigation**: `ArrowUp`, `ArrowDown`, `Shift+ArrowDown`, `ArrowRight` (expand), `ArrowLeft` (collapse), `Enter` (single-click / ephemeral tab), `Shift+Enter` (double-click / permanent tab), `Cmd/Ctrl+Enter` (opens context menu at the node's bounding box).
  - **Back/Forward Navigation History**: Tracks tab switches (`main-view-tab-history`), resource tab changes, and even opening/closing of the `KubeObjectDetailsPanel` drawer (`kube-object-tab-details-history`).

### Area 3: Cluster Appearance (`@lensapp/cluster-appearance`)
- **Key Modules**:
  - `packages/business-features/cluster/cluster-appearance/src/*`
  - `packages/unknown-features/cluster/cluster-common/src/cluster-appearance.injectable.ts` & `hashed-colour-from-string.injectable.ts`
  - `packages/business-features/cluster/cluster-hotbar/src/cluster-appearance-customization/*`
  - `packages/business-features/cluster/cluster-settings/src/main-view-item/pick-cluster-icon-color.injectable.ts`
- **How It Works**:
  - Each cluster has a reactive `ClusterAppearance` (`{ type: "background", background: string }` or `{ type: "image", image: string }`) read from `cluster.preferences.icon` (`icon://background;color=#...` or image data URI).
  - **Deterministic Default Color**: If no custom color/image is set, `hashedColourFromStringInjectable` computes a deterministic dark-luminosity hex color from the `clusterId` using `randomColor({ seed: value, luminosity: "dark" })`.
  - **Automatic Dominant Color Extraction from Custom Icons**: When a user uploads a custom cluster avatar image (`type: "image"`), `clusterAppearanceColourInjectable` runs `extractColors(image)` (from `extract-colors`) and uses the dominant extracted hex color as the cluster's accent color!
  - **Native Color Picker & Customization Menu**: `pickClusterIconColorInjectable` dynamically creates a native `<input type="color">` element to let users pick a hex color directly from the Hotbar context menu (`Appearance -> Upload Icon / Pick Icon Color / Reset Icon`), Navigator cluster context menu, or Cluster Settings.
  - **Visual Propagation Across the UI** (toggled by user preference `enableClusterColorDifferenceInjectable`):
    1. **Navigator Cluster Badge**: Renders `KubernetesTillerCrestIcon` on a colored badge (`backgroundColor: appearance.background`) or custom `Avatar`.
    2. **Navigator Tree Indent Guide Lines**: `between-icons/line-color.injectable.ts` (`entityLineColorRegistrationInjectionToken`) colors the vertical tree hierarchy line beneath an expanded cluster with its cluster color.
    3. **MainView Active Tab Top Border**: `MainViewTabs` colors the top border (`borderTopColor`) of the active tab with its cluster's color.
    4. **Cluster-Scoped Dock**: `ClusterScopedDock` provides `dockTabIconColor` and colors the active dock tab top border and icon with the cluster's color.

### Area 4: Tables & Virtualization (`@tanstack/react-table` + `@tanstack/react-virtual`)
- **Key Modules**:
  - `packages/technical-features/_ui-components/individual/table/src/*` (`@lensapp/table`, built on `@tanstack/react-table` + `react-dnd`)
  - `packages/technical-features/_ui-components/tanstack-react-virtual/src/*` (`@lensapp/tanstack-react-virtual`)
  - `packages/technical-features/_ui-components/item-list-table/src/*` (`getKubeStoreItemListBunch`)
  - `packages/technical-features/table-state/src/get-persisted-table-state.injectable.ts`
  - `packages/technical-features/table-header-icons/src/*` & `packages/technical-features/_ui-components/individual/column-filter/src/*`
  - `packages/business-features/_kube/pod-list-filtering/src/*`
  - `packages/business-features/_kube/deployment-list-insights/src/*` & `packages/technical-features/_ui-components/insights-bar/src/*`
  - `packages/business-features/item-list-search/src/*`, `packages/business-features/item-list-export/src/*`, `packages/business-features/item-list-item-count/src/*`
- **How It Works**:
  - **Modern Virtualized Table Engine**: Replaces OpenLens 6.5's legacy `react-virtualized` tables (now isolated in `table-legacy`) with `@tanstack/react-table` + `@tanstack/react-virtual` (`useVirtualizer` with `overscan: 5`, `rowHeight: 36`).
  - **Drag-and-Drop Column Reordering**: `TableRowHead` uses `react-dnd` (`DndProvider backend={HTML5Backend}`, `useDrag`/`useDrop` with `type: "column"`) to let users drag column headers to reorder columns (`table.setColumnOrder`).
  - **Interactive Column Resizing & Double-Click Auto-Fit**:
    - `ColumnResizer` supports live drag resizing (`columnResizeMode: "onChange"`) backed by `useAutoColumnSizing`.
    - **Double-Click Column Separator (`onColumnSeparatorDoubleClickInjectable`)**: Measures all rendered cells (`[data-column-id="${column.id}"]`) and the header in the DOM, and toggles the column width between `expandedWidth` (`Math.max(contentMaxWidth, headerWidth)`) and `collapsedWidth` (`headerWidth`).
  - **Column Visibility Menu**: Right-clicking the table header or clicking the column visibility trigger opens a dropdown menu (`tableColumnVisibilityMenuKind`) to toggle individual columns on/off (`hiddenColumnIds`).
  - **Per-Cluster & Per-Sub-Window State Persistence**: `getPersistedTableStateInjectable` and `getKubeStoreItemListBunch` persist three separate states per table, scoped by `clusterId` and `subWindowStorageKeySegments`:
    - `table-state` (column widths `columnSizing` + column order `columnOrder`)
    - `sort-by-state` (`columnId` + `direction`)
    - `hidden-column-ids`
  - **In-Header Column Value Filtering (`table-header-icons` + `column-filter`)**:
    - `columnHeaderIconInjectionToken` injects interactive filter icons directly inside specific column headers.
    - Clicking a column filter icon opens a `FilterByValue` floating popover (`@floating-ui/react`) with a search input, multi-select value checkboxes, and `Reset` / `Apply` buttons.
    - Used in `pod-list-filtering` for **Name**, **Node**, **Owners**, **QoS**, and **Status** columns.
  - **List Toolbar Enhancements & Deployment Insights (`MunichBar`)**:
    - `item-list-search`: Search input with inline **Match Case** (`StrictCaseToggle`) and **Regular Expression** (`RegExpEnabledToggle`) buttons inside the input suffix.
    - `item-list-export`: Toolbar button to **Export list to CSV** (`ExportListToCsvToolbarItem`).
    - `item-list-item-count`: Displays `"X of Y items"` count in the toolbar.
    - `deployment-list-insights`: Renders an expandable `MunichBar` (`insights-bar`) above the Deployments table with visual summary cards (`MunichSegment` / `MunichMetric` / `BarChart`) for **Availability**, **Status**, **Warnings**, **Namespaces**, and **Count**.

### Area 5: Details Panel & Resource Editing (`@k8slens/details-panel-components`, `edit-resource-tools`, Monaco)
- **Key Modules**:
  - `packages/technical-features/_ui-components/individual/details-panel-components/src/*` (`@k8slens/details-panel-components`)
  - `packages/business-features/details-panel-contracts/src/*` (`@k8slens/details-panel-contracts`)
  - `packages/business-features/kube-object-details-panel/src/*` & `packages/business-features/kube-object-details-panel-specifics/src/*`
  - `packages/technical-features/_kube/kube-display-name/kube-display-name-implementation/src/*`
  - `packages/business-features/kube-resource-editing/edit-resource/src/*` & `edit-resource-tools/src/*`
  - `packages/technical-features/_ui-components/individual/monaco-editor/src/*` & `packages/business-features/monaco-settings-user-preferences/src/*`
- **How It Works**:
  - **Composable Details Panel Architecture**:
    - `@k8slens/details-panel-contracts` introduces `buildDetailsPanelSectionBunch`, allowing features and extensions to contribute ordered sections (`orderNumber`) to any resource kind's details drawer.
    - `@k8slens/details-panel-components` provides standardized UI building blocks: `DrawerItem`, `DrawerItemLabels` (automatically collapses label lists > 5 items behind an expandable `+N` badge), `ExpandableDrawerItem` (persists open/closed state per drawer via `drawerPersistenceIdContext`), `ConditionBadge`, `DrawerSubTitle`, and `NoItemsDetailItem`.
    - `KubeObjectDetailsPanel` is scoped per main-view tab (`persistenceId={tabId}`), integrates with Back/Forward navigation (`kube-object-tab-details-history`), and automatically closes when a dock tab is activated (`closePanelOnDockTabActivation`).
  - **Dynamic CRD Display Names (`kube-display-name-implementation`)**: Resolves human-readable singular/plural display names (`kindToDisplayNameInjectable`, `resourceToDisplayNameInjectable`) dynamically from cluster `CustomResourceDefinition` objects in addition to built-in Kubernetes resources.
  - **Resource Editing with Side-by-Side Diff & Revert (`edit-resource` + `edit-resource-tools`)**:
    - Automatically deletes `metadata.managedFields` when loading a resource into the editor so YAML is clean, and stores both `firstDraft` (original YAML) and `draft` (current YAML).
    - **Advanced Editor (`editor2`) Toolbar Actions (`edit-resource-tools`)**:
      - **Diff Mode Toggle (`DiffModeToolbarAction` / `toggleEditResourceDiffModeInjectable`)**: Switches the resource editor between standard `MonacoEditor` (`EditorPanel`) and `MonacoDiffEditor` (`DiffEditorPanel`), showing a live side-by-side diff of `original={firstDraft}` vs `modified={value}` before saving/applying.
      - **Revert Button (`RevertToolbarAction` / `revertEditResourceInjectable`)**: Enabled whenever `draft !== firstDraft`, allowing one-click revert to `firstDraft`.
  - **Monaco Editor Enhancements (`@lensapp/monaco-editor`)**:
    - Preserves cursor position, selections, and scroll position (`ICodeEditorViewState`) per `uri` across tab switches.
    - Built-in debounced (250ms) `yaml` (`yaml.parseAll`) and `json` (`json.parse`) syntax validation (`monacoValidators`) that sets Monaco model markers (`editor.setModelMarkers`) and reports errors via `onError`.
    - Reactive user preferences (`monaco-settings-user-preferences`) for `tabSize`, `fontSize`, `fontFamily`, `minimap.enabled`, `minimap.side`, and `lineNumbers`.

### Area 6: Theme & Styling (`@k8slens/element-components`, `@lensapp/theme`)
- **Key Modules**:
  - `packages/technical-features/_low-level/element-components/src/*` (`@k8slens/element-components`)
  - `packages/unknown-features/theme/src/*` (`@lensapp/theme`)
  - `packages/features/base-stylesheets/src/*`
- **How It Works**:
  - **`@k8slens/element-components` Design System**:
    - Replaces ad-hoc SCSS/className usage across new features with typed JSX primitives (`Div`, `Span`, `Button`, `Input`, `Form`, `Label`, `Img`, `Ul`, `Li`, `Table`, `Tr`, `Td`, `Th`, `Svg`, `Pre`, `Code`, `H1`–`H3`, `Paragraph`) enhanced by composable `$`-prefixed plugins:
      - Layout & Spacing: `$flex`, `$grid`, `$padding`, `$margin`, `$size`, `$width`, `$height` (using a 4px base unit and t-shirt tokens `zero`, `xxxs` [2px], `xxs` [4px], `xs` [8px], `s` [12px], `m` [16px], `l` [20px], `xl` [24px], `xxl` [32px] .. `11xl` [640px]).
      - Visuals: `$color`, `$backgroundColor`, `$border`, `$font`, `$TextOverflow`.
      - Interactive/Behavioral: `$tooltip`, `$dropDownMenu`, `$focusable`, `$draggable`, `$droppable`, `$anchor`, `$popover`, `$floating`, `$interactive`, `$disabled`, `$visibility`.
  - **Theme Engine (`@lensapp/theme`)**:
    - Ships `lens-dark` (Monaco theme `clouds-midnight`, deep charcoal `#181A1C` / `#1F2123` surfaces) and `lens-light` (Monaco theme `vs`, `#ededed` / `#f8f8f8` surfaces).
    - **System Theme Sync (`"Sync with computer"`)**: Controlled by `matchSystemTheme` in user preferences (`toggle-theme-preference-item.injectable.tsx`). Syncs with the OS dark/light mode in real time via Electron's `nativeTheme` over `initialSystemThemeTypeChannel` and `systemThemeTypeUpdateChannel`.
    - **Terminal Theme Sync**: Separate preference allowing xterm terminals to either follow the active Lens theme (`"Match Lens theme"`) or use a fixed theme.

### Area 7: Dock, Logs & Terminal (`cluster-scoped-dock-view`, `pod-logs`, `terminal-in-general`, `terminal-for-main-view-tab`)
- **Key Modules**:
  - `packages/business-features/dock-view/src/*`, `packages/business-features/dock-view-contracts/src/*`
  - `packages/business-features/cluster-scoped-dock-view/src/*`, `packages/business-features/_migrations/dock-tab-cluster-scoping/src/*`
  - `packages/business-features/pod-logs/src/*`
  - `packages/features/terminal-in-general/terminal-contracts/*`, `renderer/*`, `main/*`, `common/*`
  - `packages/features/terminal-for-main-view-tab/src/*`
- **How It Works**:
  - **Cluster-Scoped Dock (`ClusterScopedDock` + `@k8slens/dock-view-contracts`)**:
    - Unlike OpenLens 6.5's single global dock state, docks are now scoped per cluster (`clusterScopedDockIdInjectionToken`, migrated via `dock-tab-cluster-scoping`) and rendered inside `MainView` with cluster appearance color coding (`dockTabIconColor`).
    - Features and extensions register typed dock tab kinds via `getDockTabKind` and `getDockTabKindInjectableBunch` (`@k8slens/dock-view-contracts`), which integrate with `@k8slens/tab-contracts` (`presentTabInjectionToken.for(dockTabHostKind)`).
    - Supports drag-and-drop tab reordering (`reorderTabsByIndexInjectionToken`), vertical resize via `ResizingAnchor`, and a customizable `+` (`New tab`) dropdown menu (`clusterScopedDockActionsMenuKind`).
  - **Terminals in Both MainView Tabs and Dock (`terminal-in-general` + `terminal-for-main-view-tab`)**:
    - **`Terminal2` (`packages/features/terminal-in-general/renderer/src/terminal2.injectable.tsx`)**: New self-contained terminal component backed by `xterm` (`createXTerminalInjectable`), `xterm-addon-fit`, and `xterm-addon-search` (`SearchAddon`), spawned via a main-process PTY (`openTerminalSessionChannel`, `sendTerminalInputChannel`, `resizeTerminalChannel`).
    - **Terminals as Full Main-View Tabs (`terminal-for-main-view-tab`)**: Terminals are no longer restricted to the bottom dock! `showTerminalForMainViewTabInjectable` opens a terminal directly as a full tab in `MainViewTabs` (`tabType: "terminal-for-main-view-tab"`), complete with navigation history integration (`terminalForMainViewTabInHistoryInjectable`), persisted tab state across restarts (`persistedTabArgsInjectable`), tab reuse keys (`reuseKey`), custom tab icons per terminal kind (`terminalTabIconInjectionToken`), and extensible terminal toolbars (`terminalToolbarItemInjectionToken` / `everyTerminalToolbarItemInjectionToken`).
    - **Built-in Terminal Search Bar**: `Terminal2` includes an embedded search bar (`terminal2SearchInputFocusableId`, triggered via keyboard shortcut `getShortcutForFocusingFocusableItemBunch`) using `xterm-addon-search`.
  - **Virtualized Pod Logs Viewer (`packages/business-features/pod-logs`)**:
    - **Virtualized Rendering**: `LogsView` uses `VirtualizedLogContent` (`packages/business-features/pod-logs/src/components/virtualized-log-content/content.injectable.tsx`) to virtualize log lines, with smart bottom-sticking (`isViewStuckToBottomInjectable`) and a floating `JumpToPresentButton`.
    - **Modular `LogsToolbar` (`logsToolbarItemsInjectable`)**:
      - `LogResourceSelector`: Multi-pod / workload / container selector right in the log tab toolbar (supports viewing combined logs across all pods of a Deployment via `deploymentOwnedPodsResolverInjectable`).
      - `JumpToControlledBy`: Toolbar button/menu (`jump-to-controlled-by`) to jump directly from a pod log tab to its owning controller (Deployment, DaemonSet, StatefulSet, ReplicaSet, Job).
      - `DateTimePicker`: Filter logs starting from a specific date/time (`date-time-picker.injectable.tsx`).
      - Inline toggle buttons: `ToggleTimestamps`, `TogglePrevious` (previous terminated container logs), `ToggleWrapLines` (persisted word wrap), and `ToggleResourceNames` (prefix lines with pod/container name when viewing multi-pod workload logs).
      - `LogSearch`: Search bar with keyboard shortcut (`log-search-focus-shortcut.injectable.ts`), match navigation, and `DownloadLogs` dropdown (`Download visible logs` / `Download all logs`).
