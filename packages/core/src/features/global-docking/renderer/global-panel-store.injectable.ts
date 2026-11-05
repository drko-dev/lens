/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import { reaction } from "mobx";
import { createGlobalPanelStore, globalPanelKinds, isKubetailHidden } from "./global-panel-store";
import { attachGlobalLayoutPersistence } from "./global-layout-persistence";
import { isGlobalDockingEnabled } from "./global-docking-feature-flag";
import layoutPersistenceStorageInjectable from "./layout-persistence-storage.injectable";
import restoredSessionGateInjectable from "./restored-session-gate.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import kubetailStoreInjectable from "../../../renderer/components/kubetail/kubetail-store.injectable";
import { getDetachedToolIpc } from "../../../renderer/components/split-panel/detached-tool-ipc";
import clearLogTabDataInjectable from "../../../renderer/components/dock/logs/clear-log-tab-data.injectable";
import clearEditResourceTabDataInjectable from "../../../renderer/components/dock/edit-resource/clear-edit-resource-tab-data.injectable";
import editResourceModelInjectable from "../../../renderer/components/dock/edit-resource/edit-resource-model/edit-resource-model.injectable";
import clearTerminalTabDataInjectable from "../../../renderer/components/dock/terminal/clear-terminal-tab-data.injectable";
import terminalStoreInjectable from "../../../renderer/components/dock/terminal/store.injectable";
import confirmInjectable from "../../../renderer/components/confirm-dialog/confirm.injectable";

// One store per cluster frame renderer: the panel clusterId never follows the selected cluster.
const globalPanelStoreInjectable = getInjectable({
  id: "global-panel-store",
  instantiate: (di) => {
    const clearLogTabData = di.inject(clearLogTabDataInjectable);
    const clearEditResourceTabData = di.inject(clearEditResourceTabDataInjectable);
    const clearTerminalTabData = di.inject(clearTerminalTabDataInjectable);
    const terminalStore = di.inject(terminalStoreInjectable);
    const confirm = di.inject(confirmInjectable);
    const kubetailStore = di.inject(kubetailStoreInjectable);

    const store = createGlobalPanelStore(di.inject(hostedClusterIdInjectable) ?? undefined, {
      ...getDetachedToolIpc(di),
      // H7.6.3B: closing a docked Logs panel frees its session (buffer, timers, tab data); moving does not.
      onPanelClosed: (leaf) => {
        if (leaf.panelKind === "pod-logs" && leaf.resourceBinding?.tabId) {
          clearLogTabData(leaf.resourceBinding.tabId);
        }

        // H7.6.3C: only an explicit, confirmed close frees the edit session (draft, Monaco models).
        if (leaf.panelKind === "resource-editor" && leaf.resourceBinding?.tabId) {
          clearEditResourceTabData(leaf.resourceBinding.tabId);
        }

        // H7.6.3E: closing the Kubetail panel releases what it streamed (the store belongs to the frame).
        if (leaf.panelKind === "kubetail") {
          kubetailStore.stopAllStreams();
          kubetailStore.clearLogs();
        }

        // H7.6.3D: only an explicit close ends the PTY session and revokes its PROD authorization.
        if (leaf.panelKind === "terminal" && leaf.resourceBinding?.tabId) {
          clearTerminalTabData(leaf.resourceBinding.tabId);
        }
      },
      confirmPanelClose: async (leaf) => {
        if (leaf.panelKind === "terminal" && leaf.resourceBinding?.tabId) {
          const tabId = leaf.resourceBinding.tabId;

          // A live shell asks before being terminated; an exited, dropped or never-started one closes silently.
          if (!terminalStore.isConnected(tabId) || terminalStore.isCleanExit(tabId) || terminalStore.isDisconnected(tabId)) {
            return true;
          }

          return confirm({
            message: "Close this terminal? The running shell will be terminated.",
            labelOk: "Close Terminal",
            labelCancel: "Keep Open",
          });
        }

        if (leaf.panelKind !== "resource-editor" || !leaf.resourceBinding?.tabId) {
          return true;
        }

        const model = await di.inject(editResourceModelInjectable, leaf.resourceBinding.tabId);

        if (!model.hasUnsavedChanges) {
          return true;
        }

        return confirm({
          message: "This editor has unsaved changes. Discard them and close?",
          labelOk: "Discard Changes",
          labelCancel: "Keep Editing",
        });
      },
    });

    // H7.6.3E: a hidden Kubetail (collapsed or an inactive tab) pauses: lines buffer (bounded) while history,
    // follow state and selection stay in the store. Showing it again resumes without a second stream.
    let pausedByHost = false;

    reaction(() => isKubetailHidden(store), (hidden) => {
      if (hidden && !kubetailStore.isPaused) {
        kubetailStore.pause();
        pausedByHost = true;
      } else if (!hidden && pausedByHost) {
        kubetailStore.resume();
        pausedByHost = false;
      }
    });

    // H7.7: restore the saved VISUAL layout of this cluster (inert for session panels) and keep saving it.
  // Only when the feature is on in this frame; flag OFF never reads or writes the saved layout.
  const hostedClusterId = di.inject(hostedClusterIdInjectable);

  if (hostedClusterId && isGlobalDockingEnabled(typeof window === "undefined" ? undefined : window.localStorage)) {
    attachGlobalLayoutPersistence({
      store,
      scope: "cluster",
      clusterId: hostedClusterId,
      allowedKinds: [...globalPanelKinds, "resource-details", "pod-logs", "resource-editor", "terminal", "kubetail"],
      singleInstance: true,
      storage: di.inject(layoutPersistenceStorageInjectable),
      gate: di.inject(restoredSessionGateInjectable),
      logger: di.inject(loggerInjectionToken),
    });
  }

  return store;
  },
});

export default globalPanelStoreInjectable;
