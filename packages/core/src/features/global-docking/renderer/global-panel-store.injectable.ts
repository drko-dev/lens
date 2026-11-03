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
import confirmInjectable from "../../../renderer/components/confirm-dialog/confirm.injectable";

// One store per cluster frame renderer: the panel clusterId never follows the selected cluster.
const globalPanelStoreInjectable = getInjectable({
  id: "global-panel-store",
  instantiate: (di) => {
    const clearLogTabData = di.inject(clearLogTabDataInjectable);
    const clearEditResourceTabData = di.inject(clearEditResourceTabDataInjectable);
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
      },
      confirmPanelClose: async (leaf) => {
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
