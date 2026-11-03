/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import { createGlobalPanelStore } from "./global-panel-store";
import { getDetachedToolIpc } from "../../../renderer/components/split-panel/detached-tool-ipc";
import clearLogTabDataInjectable from "../../../renderer/components/dock/logs/clear-log-tab-data.injectable";

// One store per cluster frame renderer: the panel clusterId never follows the selected cluster.
const globalPanelStoreInjectable = getInjectable({
  id: "global-panel-store",
  instantiate: (di) => {
    const clearLogTabData = di.inject(clearLogTabDataInjectable);

    return createGlobalPanelStore(di.inject(hostedClusterIdInjectable) ?? undefined, {
      ...getDetachedToolIpc(di),
      // H7.6.3B: closing a docked Logs panel frees its session (buffer, timers, tab data); moving does not.
      onPanelClosed: (leaf) => {
        if (leaf.panelKind === "pod-logs" && leaf.resourceBinding?.tabId) {
          clearLogTabData(leaf.resourceBinding.tabId);
        }
      },
    });
  },
});

export default globalPanelStoreInjectable;
