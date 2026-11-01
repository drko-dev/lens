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
import replicaSetStoreInjectable from "../workloads-replicasets/store.injectable";
import type { ReplicaSetStore } from "../workloads-replicasets/store";
import podStoreInjectable from "../workloads-pods/store.injectable";
import type { PodStore } from "../workloads-pods/store";
import namespaceStoreInjectable from "../namespaces/store.injectable";
import type { NamespaceStore } from "../namespaces/store";
import kubetailStoreInjectable from "./kubetail-store.injectable";
import type { KubetailStore } from "./kubetail-store";
import type { KubetailLogEntry } from "./kubetail-types";
import { Icon } from "../icon";

const ansiUp = new AnsiUp();

interface Dependencies {
  kubetailStore: KubetailStore;
  subscribeStores: SubscribeStores;
  deploymentStore: DeploymentStore;
  replicaSetStore: ReplicaSetStore;
  podStore: PodStore;
  namespaceStore: NamespaceStore;
}

@observer
class NonInjectedKubetailPage extends React.Component<Dependencies> {
  private listRef = createRef<List>();
  private unsubscribeStores?: () => void;

  componentDidMount() {
    const { subscribeStores, deploymentStore, replicaSetStore, podStore, namespaceStore, kubetailStore } = this.props;

    this.unsubscribeStores = subscribeStores([deploymentStore, replicaSetStore, podStore, namespaceStore]);

    // If a namespace is already selected globally, default to it
    if (!kubetailStore.selectedNamespace && namespaceStore.contextNamespaces.length > 0) {
      kubetailStore.setNamespace(namespaceStore.contextNamespaces[0]);
    }
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
    this.unsubscribeStores?.();
    this.props.kubetailStore.destroy();
  }

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
    const { kubetailStore, namespaceStore } = this.props;
    const {
      availableDeployments,
      currentDeploymentPods,
      activePodNames,
      displayLogs,
      isPaused,
      pendingLogs,
      autoScroll,
      searchQuery,
      selectedNamespace,
      selectedDeploymentName,
    } = kubetailStore;

    const namespaces = namespaceStore.items.map(ns => ns.getName());

    return (
      <div className={styles.KubetailPage}>
        {/* Header with Selectors */}
        <div className={styles.Header}>
          <div className={styles.TopRow}>
            <div className={styles.TitleSection}>
              <h1>
                <Icon material="subject" />
                Kubetail Multi-Pod Logs
              </h1>
              <span className={styles.Badge}>Native PoC</span>
            </div>

            <div className={styles.Selectors}>
              <div className={styles.SelectGroup}>
                <label>Namespace:</label>
                <select
                  value={selectedNamespace}
                  onChange={(e) => kubetailStore.setNamespace(e.target.value)}
                >
                  <option value="">-- All Namespaces --</option>
                  {namespaces.map(ns => (
                    <option key={ns} value={ns}>{ns}</option>
                  ))}
                </select>
              </div>

              <div className={styles.SelectGroup}>
                <label>Deployment:</label>
                <select
                  value={selectedDeploymentName}
                  onChange={(e) => kubetailStore.setDeployment(e.target.value)}
                >
                  <option value="">-- Select Deployment --</option>
                  {availableDeployments.map(d => (
                    <option key={d.getName()} value={d.getName()}>
                      {d.getName()} ({d.getReplicas()} replicas)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Pod Chips / Checkboxes */}
          {selectedDeploymentName && currentDeploymentPods.length > 0 && (
            <div className={styles.PodsRow}>
              <span className={styles.PodsLabel}>Pods ({currentDeploymentPods.length}):</span>
              {currentDeploymentPods.map(pod => {
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
                    <span className={styles.PodDot} style={{ background: isError ? "#ef4444" : isReconnecting ? "#f59e0b" : color }} />
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
                Select All
              </button>
              <button
                type="button"
                className={styles.QuickAction}
                onClick={() => kubetailStore.deselectAllPods()}
              >
                Deselect All
              </button>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className={styles.Toolbar}>
          <div className={styles.LeftControls}>
            <input
              type="text"
              className={styles.SearchInput}
              placeholder="Filter logs by regex or text..."
              value={searchQuery}
              onChange={(e) => kubetailStore.setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.RightControls}>
            <button
              type="button"
              className={`${styles.ToolButton} ${isPaused ? styles.Warning : ""}`}
              onClick={() => isPaused ? kubetailStore.resume() : kubetailStore.pause()}
              title={isPaused ? "Resume live streaming" : "Pause visual log updates"}
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
              title="Clear visible log buffer"
            >
              <Icon material="delete_sweep" />
              Clear
            </button>

            <span className={styles.Stats}>
              Lines: {displayLogs.length}
              {kubetailStore.isTruncated && (
                <span title="Log buffer reached maximum limit. Oldest lines were truncated to preserve memory."> (buffer capped)</span>
              )}
            </span>
          </div>
        </div>

        {/* Virtualized Log Canvas */}
        <div className={styles.Canvas}>
          {!selectedDeploymentName ? (
            <div className={styles.EmptyState}>
              <Icon material="layers" style={{ fontSize: 48, opacity: 0.3 }} />
              <p>Select a Deployment to start streaming multi-pod logs</p>
            </div>
          ) : currentDeploymentPods.length === 0 ? (
            <div className={styles.EmptyState}>
              <Icon material="warning" style={{ fontSize: 48, opacity: 0.3 }} />
              <p>No active Pods found for deployment &quot;{selectedDeploymentName}&quot;</p>
            </div>
          ) : displayLogs.length === 0 ? (
            <div className={styles.EmptyState}>
              <Icon material="hourglass_empty" style={{ fontSize: 48, opacity: 0.3 }} />
              <p>Waiting for logs from active pods...</p>
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

export const KubetailPage = withInjectables<Dependencies>(NonInjectedKubetailPage, {
  getProps: (di) => ({
    kubetailStore: di.inject(kubetailStoreInjectable),
    subscribeStores: di.inject(subscribeStoresInjectable),
    deploymentStore: di.inject(deploymentStoreInjectable),
    replicaSetStore: di.inject(replicaSetStoreInjectable),
    podStore: di.inject(podStoreInjectable),
    namespaceStore: di.inject(namespaceStoreInjectable),
  }),
});
