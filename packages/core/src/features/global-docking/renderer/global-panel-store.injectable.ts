/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import { createGlobalPanelStore } from "./global-panel-store";
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

    return createGlobalPanelStore(di.inject(hostedClusterIdInjectable) ?? undefined, {
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
  },
});

export default globalPanelStoreInjectable;
