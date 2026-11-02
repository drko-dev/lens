/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import styles from "./kubetail.module.scss";

import React, { createRef } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import { FixedSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import AnsiUp from "ansi_up";
import DOMPurify from "dompurify";

import type { SubscribeStores } from "../../kube-watch-api/kube-watch-api";
import subscribeStoresInjectable from "../../kube-watch-api/subscribe-stores.injectable";
import deploymentStoreInjectable from "../workloads-deployments/store.injectable";
import type { DeploymentStore } from "../workloads-deployments/store";
import statefulSetStoreInjectable from "../workloads-statefulsets/store.injectable";
import type { StatefulSetStore } from "../workloads-statefulsets/store";
import daemonSetStoreInjectable from "../workloads-daemonsets/store.injectable";
import type { DaemonSetStore } from "../workloads-daemonsets/store";
import replicaSetStoreInjectable from "../workloads-replicasets/store.injectable";
import type { ReplicaSetStore } from "../workloads-replicasets/store";
import podStoreInjectable from "../workloads-pods/store.injectable";
import type { PodStore } from "../workloads-pods/store";
import namespaceStoreInjectable from "../namespaces/store.injectable";
import type { NamespaceStore } from "../namespaces/store";
import kubetailStoreInjectable from "./kubetail-store.injectable";
import type { KubetailStore } from "./kubetail-store";
import type { KubetailLogEntry, WorkloadKind } from "./kubetail-types";
import { Icon } from "../icon";
import { reaction } from "mobx";
import kubetailUrlParamsInjectable, { type KubetailUrlParams } from "./url-params/kubetail-url-params.injectable";
import { SplitPanelLayout } from "../split-panel/split-panel-layout";
import { ResourceDetailsPanelContent } from "../split-panel/resource-details-panel-content";
import { registerPanelRenderer } from "../split-panel/panel-content-resolver";
import type { SplitPanelStore } from "../split-panel/split-panel-store";
import splitPanelStoreInjectable from "../split-panel/split-panel-store.injectable";
import type { FloatingPanelsFeatureFlag } from "../../../features/floating-panels/common/floating-panels-feature-flag.injectable";
import floatingPanelsFeatureFlagInjectable from "../../../features/floating-panels/common/floating-panels-feature-flag.injectable";

const ansiUp = new AnsiUp();

export interface KubetailPageProps {
  isNestedInSplit?: boolean;
  preserveStreamsOnUnmount?: boolean;
}

interface Dependencies {
  kubetailStore: KubetailStore;
  subscribeStores: SubscribeStores;
  deploymentStore: DeploymentStore;
  statefulSetStore: StatefulSetStore;
  daemonSetStore: DaemonSetStore;
  replicaSetStore: ReplicaSetStore;
  podStore: PodStore;
  namespaceStore: NamespaceStore;
  urlParams: KubetailUrlParams;
  splitPanelStore?: SplitPanelStore;
  floatingPanelsFeatureFlag?: FloatingPanelsFeatureFlag;
}

@observer
class NonInjectedKubetailPage extends React.Component<Dependencies & KubetailPageProps> {
  private containerRef = createRef<HTMLDivElement>();
  private listRef = createRef<List>();
  private searchInputRef = createRef<HTMLInputElement>();
  private unsubscribeStores?: () => void;
  private disposers: (() => void)[] = [];

  componentDidMount() {
    const {
      subscribeStores,
      deploymentStore,
      statefulSetStore,
      daemonSetStore,
      replicaSetStore,
      podStore,
      namespaceStore,
      kubetailStore,
      urlParams,
      splitPanelStore,
    } = this.props;

    this.unsubscribeStores = subscribeStores([
      deploymentStore,
      statefulSetStore,
      daemonSetStore,
      replicaSetStore,
      podStore,
      namespaceStore,
    ]);

    // Sync initial namespace from cluster context if no param
    kubetailStore.syncWithClusterContext();

    // Default to the first context namespace if active
    if (!kubetailStore.selectedNamespace && namespaceStore.contextNamespaces.length > 0) {
      kubetailStore.setNamespace(namespaceStore.contextNamespaces[0]);
    }

    if (splitPanelStore && kubetailStore.selectedResource) {
      splitPanelStore.setResourceBinding({
        kind: kubetailStore.selectedResource.kind,
        name: kubetailStore.selectedResource.name,
        namespace: kubetailStore.selectedResource.namespace,
      });
    }

    this.disposers.push(
      reaction(
        () => kubetailStore.selectedResource,
        (resource) => {
          if (resource && splitPanelStore) {
            splitPanelStore.setResourceBinding({
              kind: resource.kind,
              name: resource.name,
              namespace: resource.namespace,
            });
          }
        },
        { fireImmediately: true },
      ),
    );

    if (urlParams) {
      this.disposers.push(
        reaction(
          () => ({
            kind: urlParams.kind.get(),
            name: urlParams.name.get(),
            namespace: urlParams.namespace.get(),
            uid: urlParams.uid.get(),
          }),
          ({ kind, name, namespace, uid }) => {
            if (name && kind) {
              kubetailStore.selectWorkloadFromNavigation({
                kind: kind as WorkloadKind,
                name,
                namespace: namespace || kubetailStore.selectedNamespace || "default",
                uid,
              });
            }
          },
          { fireImmediately: true },
        ),
      );
    }
    window.addEventListener("keydown", this.handleKeyDown);
  }

  componentDidUpdate() {
    const { kubetailStore } = this.props;

    if (kubetailStore.autoScroll && !kubetailStore.isPaused) {
      const count = kubetailStore.displayLogs.length;

      if (count > 0) {
        this.listRef.current?.scrollToItem(count - 1, "end");
      }
    }
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown);
    this.unsubscribeStores?.();

    if (!this.props.preserveStreamsOnUnmount) {
      this.props.kubetailStore.stopAllStreams();
    }

    for (const dispose of this.disposers) {
      dispose();
    }
    this.disposers = [];
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    // Only capture shortcuts when Kubetail page/container has focus
    if (!this.containerRef.current || !this.containerRef.current.contains(document.activeElement)) {
      return;
    }

    const activeEl = document.activeElement;
    const isEditing = activeEl && (
      activeEl.tagName === "INPUT" ||
      activeEl.tagName === "TEXTAREA" ||
      activeEl.tagName === "SELECT" ||
      (activeEl as HTMLElement).isContentEditable
    );

    if (isEditing) {
      if (e.key === "Escape") {
        (activeEl as HTMLElement).blur();
      }

      return;
    }

    const { kubetailStore } = this.props;

    // Focus search: '/' or Cmd/Ctrl+F
    if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f")) {
      e.preventDefault();
      this.searchInputRef.current?.focus();
      this.searchInputRef.current?.select();

      return;
    }

    // Pause / Resume: Space or 'p'
    if (e.code === "Space" || e.key.toLowerCase() === "p") {
      e.preventDefault();
      if (kubetailStore.isPaused) {
        kubetailStore.resume();
      } else {
        kubetailStore.pause();
      }

      return;
    }

    // Clear logs: 'c' or Cmd/Ctrl+K
    if (e.key.toLowerCase() === "c" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      kubetailStore.clearLogs();

      return;
    }
  };

  private renderLogRow = ({ index, style, data }: { index: number; style: React.CSSProperties; data: KubetailLogEntry[] }) => {
    const entry = data[index];

    if (!entry) return null;

    const htmlMessage = DOMPurify.sanitize(ansiUp.ansi_to_html(entry.message));

    return (
      <div style={style} className={styles.LogRow} key={entry.id}>
        <span className={styles.Timestamp}>
          {entry.timestampRaw ? entry.timestampRaw.substring(11, 23) : ""}
        </span>
        <span
          className={styles.PodBadge}
          style={{ color: entry.color, borderColor: entry.color }}
          title={entry.podName}
        >
          {entry.podName}
        </span>
        <span className={styles.ContainerBadge} title={entry.containerName}>
          [{entry.containerName}]
        </span>
        <span
          className={styles.Message}
          dangerouslySetInnerHTML={{ __html: htmlMessage }}
        />
      </div>
    );
  };

  render() {
    const isSplitActive = !this.props.isNestedInSplit &&
      Boolean(this.props.floatingPanelsFeatureFlag?.isEnabled) &&
      Boolean(this.props.splitPanelStore);

    if (isSplitActive) {
      const selectedResource = this.props.kubetailStore.selectedResource;
      const leftTitle = selectedResource ? `Kubetail: ${selectedResource.name}` : "Kubetail Multi-Pod Logs";
      const rightTitle = selectedResource ? `Details: ${selectedResource.kind} / ${selectedResource.name}` : "Resource Details";

      return (
        <SplitPanelLayout
          leftTitle={leftTitle}
          rightTitle={rightTitle}
          leftContent={<KubetailPage isNestedInSplit={true} preserveStreamsOnUnmount={true} />}
          rightContent={<ResourceDetailsPanelContent />}
        />
      );
    }

    const { kubetailStore, namespaceStore, splitPanelStore, floatingPanelsFeatureFlag } = this.props;
    const {
      availableWorkloads,
      currentResourcePods,
      availableContainers,
      activePodNames,
      activeContainerNames,
      displayLogs,
      isPaused,
      pendingLogs,
      autoScroll,
      autoFollowNewReplicas,
      searchQuery,
      selectedNamespace,
      selectedKind,
      selectedResource,
      selectedFilterPod,
      selectedFilterContainer,
    } = kubetailStore;

    const namespaces = namespaceStore.items.map(ns => ns.getName());
    const selectedResourceValue = selectedResource
      ? `${selectedResource.kind}/${selectedResource.namespace}/${selectedResource.name}`
      : "";

    return (
      <div className={styles.KubetailPage} ref={this.containerRef} tabIndex={-1}>
        {/* Header with Unified Workload Selectors */}
        <div className={styles.Header}>
          <div className={styles.TopRow}>
            <div className={styles.TitleSection}>
              <h1>
                <Icon material="subject" />
                Kubetail Multi-Pod Logs
              </h1>
              <span className={styles.Badge}>Native MVP</span>
              {selectedResource && (
                <div className={styles.ActiveSelectionInfo}>
                  <span className={styles.SelectionBadge}>
                    {selectedResource.kind} / <strong>{selectedResource.name}</strong> ({selectedResource.namespace})
                  </span>
                  {activePodNames.size > 0 && (
                    <span className={styles.StreamingBadge}>
                      ● {kubetailStore.activeStreams.size} stream{kubetailStore.activeStreams.size === 1 ? "" : "s"} active
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className={styles.Selectors}>
              {/* Namespace Selector */}
              <div className={styles.SelectGroup}>
                <label>Namespace:</label>
                <select
                  data-testid="kubetail-namespace-select"
                  value={selectedNamespace}
                  onChange={(e) => {
                    const ns = e.target.value;

                    kubetailStore.setNamespace(ns);
                    const { urlParams } = this.props;

                    if (urlParams) {
                      if (ns) {
                        urlParams.namespace.set(ns);
                      } else {
                        urlParams.namespace.clear();
                      }
                      urlParams.name.clear();
                      urlParams.kind.clear();
                      urlParams.uid.clear();
                    }
                  }}
                >
                  <option value="">-- All Namespaces --</option>
                  {namespaces.map(ns => (
                    <option key={ns} value={ns}>{ns}</option>
                  ))}
                </select>
              </div>

              {/* Workload Kind Selector */}
              <div className={styles.SelectGroup}>
                <label>Kind:</label>
                <select
                  data-testid="kubetail-kind-select"
                  value={selectedKind}
                  onChange={(e) => kubetailStore.setKind(e.target.value as WorkloadKind | "ALL")}
                >
                  <option value="ALL">All Workloads</option>
                  <option value="Deployment">Deployments</option>
                  <option value="StatefulSet">StatefulSets</option>
                  <option value="DaemonSet">DaemonSets</option>
                  <option value="Pod">Standalone Pods</option>
                </select>
              </div>

              {/* Workload Resource Selector */}
              <div className={styles.SelectGroup}>
                <label>Workload:</label>
                <select
                  data-testid="kubetail-workload-select"
                  value={selectedResourceValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    const { urlParams } = this.props;

                    if (!val) {
                      kubetailStore.setResource(undefined);

                      if (urlParams) {
                        urlParams.kind.clear();
                        urlParams.name.clear();
                        urlParams.namespace.clear();
                        urlParams.uid.clear();
                      }

                      return;
                    }
                    const [kind, ns, name] = val.split("/");

                    kubetailStore.setResource({
                      kind: kind as WorkloadKind,
                      namespace: ns,
                      name,
                    });

                    if (urlParams) {
                      urlParams.kind.set(kind);
                      urlParams.name.set(name);
                      urlParams.namespace.set(ns);
                    }
                  }}
                >
                  <option value="">-- Select Workload --</option>
                  {availableWorkloads.map(w => {
                    const optKey = `${w.kind}/${w.namespace}/${w.name}`;

                    return (
                      <option key={optKey} value={optKey}>
                        {w.label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {kubetailStore.notFoundResource && (
            <div className={styles.WarningBanner}>
              <Icon material="warning" />
              <span>
                Resource <strong>{kubetailStore.notFoundResource.kind} / {kubetailStore.notFoundResource.name}</strong> was not found in namespace <strong>{kubetailStore.notFoundResource.namespace}</strong>. It may have been deleted or renamed.
              </span>
              <button
                type="button"
                className={styles.DismissButton}
                onClick={() => {
                  kubetailStore.notFoundResource = null;
                  const { urlParams } = this.props;

                  if (urlParams) {
                    urlParams.name.clear();
                    urlParams.kind.clear();
                  }
                }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Granular Pods and Containers Section */}
          {selectedResource && (
            <div className={styles.GranularSection}>
              {/* Pods Row */}
              <div className={styles.PodsRow}>
                <span className={styles.PodsLabel}>Pods ({currentResourcePods.length}):</span>
                {currentResourcePods.map(pod => {
                  const podName = pod.getName();
                  const isActive = activePodNames.has(podName);
                  const streamInfo = kubetailStore.activeStreams.get(`${podName}/${pod.getContainers()[0]?.name}`);
                  const color = streamInfo?.color ?? "#4fc3f7";
                  const isError = streamInfo?.status === "ERROR";
                  const isReconnecting = streamInfo?.status === "RECONNECTING";

                  return (
                    <div
                      key={podName}
                      className={`${styles.PodChip} ${isActive ? styles.Active : ""} ${isError ? styles.ChipError : ""}`}
                      style={{ color: isActive ? color : undefined }}
                      onClick={() => kubetailStore.togglePod(podName)}
                      title={
                        streamInfo?.error
                          ? `${podName} [${streamInfo.status}]: ${streamInfo.error}`
                          : `Click to ${isActive ? "hide" : "stream"} logs for ${podName}`
                      }
                    >
                      <span
                        className={styles.PodDot}
                        style={{
                          background: isError ? "#ef4444" : isReconnecting ? "#f59e0b" : color,
                        }}
                      />
                      <span>{podName}</span>
                      {streamInfo && (
                        <span className={styles.LineCount}>
                          ({streamInfo.lineCount})
                          {isError && " ⚠️"}
                          {isReconnecting && " 🔄"}
                        </span>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  className={styles.QuickAction}
                  onClick={() => kubetailStore.selectAllPods()}
                >
                  All
                </button>
                <button
                  type="button"
                  className={styles.QuickAction}
                  onClick={() => kubetailStore.deselectAllPods()}
                >
                  None
                </button>
                <button
                  type="button"
                  className={`${styles.QuickAction} ${autoFollowNewReplicas ? styles.ActionActive : ""}`}
                  onClick={() => kubetailStore.toggleAutoFollowNewReplicas()}
                  title="Auto-stream new replicas when deployment scales up"
                >
                  Follow Replicas: {autoFollowNewReplicas ? "ON" : "OFF"}
                </button>
              </div>

              {/* Containers Row (if workload has containers) */}
              {availableContainers.length > 0 && (
                <div className={styles.ContainersRow}>
                  <span className={styles.PodsLabel}>Containers:</span>
                  {availableContainers.map(containerName => {
                    const isContainerActive = activeContainerNames.size === 0 || activeContainerNames.has(containerName);

                    return (
                      <div
                        key={containerName}
                        className={`${styles.ContainerChip} ${isContainerActive ? styles.Active : ""}`}
                        onClick={() => kubetailStore.toggleContainer(containerName)}
                        title={`Click to ${isContainerActive ? "mute" : "stream"} container ${containerName}`}
                      >
                        [{containerName}]
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className={styles.QuickAction}
                    onClick={() => kubetailStore.selectAllContainers()}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={styles.QuickAction}
                    onClick={() => kubetailStore.deselectAllContainers()}
                  >
                    None
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Toolbar with Visual Filters and Actions */}
        <div className={styles.Toolbar}>
          <div className={styles.LeftControls}>
            <input
              ref={this.searchInputRef}
              type="text"
              className={styles.SearchInput}
              placeholder="Filter logs by regex or text... (press '/' to focus)"
              title="Search filter (press '/' or Cmd/Ctrl+F to focus, Esc to blur)"
              value={searchQuery}
              onChange={(e) => kubetailStore.setSearchQuery(e.target.value)}
            />

            {/* Visual Pod Filter Dropdown */}
            {currentResourcePods.length > 1 && (
              <select
                className={styles.FilterSelect}
                value={selectedFilterPod}
                onChange={(e) => kubetailStore.setFilterPod(e.target.value)}
                title="Visually isolate logs from a single pod"
              >
                <option value="">All Pods</option>
                {currentResourcePods.map(p => (
                  <option key={p.getName()} value={p.getName()}>{p.getName()}</option>
                ))}
              </select>
            )}

            {/* Visual Container Filter Dropdown */}
            {availableContainers.length > 1 && (
              <select
                className={styles.FilterSelect}
                value={selectedFilterContainer}
                onChange={(e) => kubetailStore.setFilterContainer(e.target.value)}
                title="Visually isolate logs from a single container"
              >
                <option value="">All Containers</option>
                {availableContainers.map(c => (
                  <option key={c} value={c}>[{c}]</option>
                ))}
              </select>
            )}
          </div>

          <div className={styles.RightControls}>
            <button
              type="button"
              className={`${styles.ToolButton} ${isPaused ? styles.Warning : ""}`}
              onClick={() => isPaused ? kubetailStore.resume() : kubetailStore.pause()}
              title={isPaused ? "Resume live streaming (Space or p)" : "Pause visual log updates (Space or p)"}
            >
              <Icon material={isPaused ? "play_arrow" : "pause"} />
              {isPaused ? `Resume (${pendingLogs.length} pending)` : "Pause"}
            </button>

            <button
              type="button"
              className={`${styles.ToolButton} ${autoScroll ? styles.Active : ""}`}
              onClick={() => kubetailStore.toggleAutoScroll()}
              title="Toggle automatic scrolling to latest log line"
            >
              <Icon material="vertical_align_bottom" />
              Auto-Scroll: {autoScroll ? "ON" : "OFF"}
            </button>

            <button
              type="button"
              className={styles.ToolButton}
              onClick={() => kubetailStore.clearLogs()}
              title="Clear visible log buffer (c or Cmd/Ctrl+K)"
            >
              <Icon material="delete_sweep" />
              Clear
            </button>

            {/* Export Dropdown */}
            <div className={styles.ExportDropdown}>
              <button
                type="button"
                className={styles.ToolButton}
                onClick={() => kubetailStore.downloadExport("txt", true)}
                title="Download visible logs as plain text (.txt)"
                disabled={displayLogs.length === 0}
              >
                <Icon material="save_alt" />
                Export TXT
              </button>
              <button
                type="button"
                className={styles.ToolButton}
                onClick={() => kubetailStore.downloadExport("jsonl", true)}
                title="Download visible logs as JSON Lines (.jsonl)"
                disabled={displayLogs.length === 0}
              >
                <Icon material="code" />
                Export JSONL
              </button>
            </div>

            {/* Split Panels Toolbar Controls */}
            {floatingPanelsFeatureFlag?.isEnabled && splitPanelStore && !this.props.isNestedInSplit && (
              <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                <button
                  type="button"
                  className={`${styles.ToolButton} ${!splitPanelStore.isClassicMode ? styles.Active : ""}`}
                  onClick={() => splitPanelStore.toggleClassicMode()}
                  title={splitPanelStore.isClassicMode ? "Switch to Split Panels Layout (Kubetail + Details)" : "Switch to Classic Single-Panel View"}
                  data-testid="toggle-split-layout-button"
                >
                  <Icon material="splitscreen" />
                  Split View: {splitPanelStore.isClassicMode ? "OFF" : "ON"}
                </button>
                {!splitPanelStore.isClassicMode && (
                  <>
                    <button
                      type="button"
                      className={styles.ToolButton}
                      onClick={() => splitPanelStore.swapPanels()}
                      title="Swap Left and Right Panels"
                      data-testid="swap-panels-button"
                    >
                      <Icon material="swap_horiz" />
                      Swap
                    </button>
                    <button
                      type="button"
                      className={styles.ToolButton}
                      onClick={() => splitPanelStore.resetLayout()}
                      title="Reset default 58/42 split ratio"
                      data-testid="reset-layout-button"
                    >
                      <Icon material="settings_backup_restore" />
                      Reset
                    </button>
                    <button
                      type="button"
                      className={`${styles.ToolButton} ${!splitPanelStore.isRightClosed ? styles.Active : ""}`}
                      onClick={() => {
                        if (splitPanelStore.isRightClosed) {
                          splitPanelStore.openRightPanel();
                        } else {
                          splitPanelStore.closeRightPanel();
                        }
                      }}
                      title={splitPanelStore.isRightClosed ? "Open Resource Details Panel" : "Hide Resource Details Panel"}
                      data-testid="toggle-details-panel-button"
                    >
                      <Icon material="view_quilt" />
                      Details: {splitPanelStore.isRightClosed ? "OFF" : "ON"}
                    </button>
                  </>
                )}
              </div>
            )}

            <span className={styles.Stats} data-testid="kubetail-stats">
              Streams: {kubetailStore.activeStreams.size} | Lines: {displayLogs.length}
              {kubetailStore.isTruncated && (
                <span title="Log buffer reached maximum limit. Oldest lines were truncated to preserve memory."> (buffer capped)</span>
              )}
            </span>
          </div>
        </div>

        {/* Virtualized Log Canvas */}
        <div className={styles.Canvas}>
          {!selectedResource ? (
            <div className={styles.EmptyState}>
              <Icon material="layers" style={{ fontSize: 48, opacity: 0.3 }} />
              <p>Select a Workload to start streaming multi-pod logs</p>
            </div>
          ) : currentResourcePods.length === 0 ? (
            <div className={styles.EmptyState}>
              <Icon material="warning" style={{ fontSize: 48, opacity: 0.3 }} />
              <p>No active Pods found for {selectedResource.kind} &quot;{selectedResource.name}&quot;</p>
            </div>
          ) : displayLogs.length === 0 ? (
            <div className={styles.EmptyState}>
              <Icon material="hourglass_empty" style={{ fontSize: 48, opacity: 0.3 }} />
              <p>
                {searchQuery || selectedFilterPod || selectedFilterContainer
                  ? `No logs match the current filter criteria`
                  : `Waiting for logs from active pods...`}
              </p>
            </div>
          ) : (
            <AutoSizer>
              {({ height, width }) => (
                <List
                  ref={this.listRef}
                  height={height ?? 500}
                  width={width ?? "100%"}
                  itemCount={displayLogs.length}
                  itemSize={22}
                  itemData={displayLogs}
                >
                  {this.renderLogRow}
                </List>
              )}
            </AutoSizer>
          )}
        </div>
      </div>
    );
  }
}

export const KubetailPage = withInjectables<Dependencies, KubetailPageProps>(NonInjectedKubetailPage, {
  getProps: (di, props) => ({
    ...props,
    kubetailStore: di.inject(kubetailStoreInjectable),
    subscribeStores: di.inject(subscribeStoresInjectable),
    deploymentStore: di.inject(deploymentStoreInjectable),
    statefulSetStore: di.inject(statefulSetStoreInjectable),
    daemonSetStore: di.inject(daemonSetStoreInjectable),
    replicaSetStore: di.inject(replicaSetStoreInjectable),
    podStore: di.inject(podStoreInjectable),
    namespaceStore: di.inject(namespaceStoreInjectable),
    urlParams: di.inject(kubetailUrlParamsInjectable),
    splitPanelStore: di.inject(splitPanelStoreInjectable),
    floatingPanelsFeatureFlag: di.inject(floatingPanelsFeatureFlagInjectable),
  }),
});

registerPanelRenderer("kubetail", () => (
  <KubetailPage isNestedInSplit={true} preserveStreamsOnUnmount={true} />
));
