/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { beforeClusterFrameStartsSecondInjectionToken } from "../../../before-frame-starts/tokens";
import { detachedToolFrameChannels } from "../../../../common/detached-tools/detached-tool-channels";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import ipcRendererInjectable from "../../../utils/channel/ipc-renderer.injectable";
import detachedLogsHydrationInjectable from "./detached-logs-hydration.injectable";
import detachedLogsTabsInjectable from "./detached-logs-tabs.injectable";

/**
 * R4-06: Main tells THIS cluster frame that a window gave a Logs tab back.
 * Clearing the flag lets the dock tab resume its own stream.
 */
const setupDetachedLogsRedockListenerInjectable = getInjectable({
  id: "setup-detached-logs-redock-listener",

  instantiate: (di) => ({
    run: () => {
      const ipcRenderer = di.inject(ipcRendererInjectable);
      const detachedTabs = di.inject(detachedLogsTabsInjectable);
      const hostedCluster = di.inject(hostedClusterInjectable);

      // Ask Main which tabs it already owns as early as the frame starts (before any logs view mounts).
      di.inject(detachedLogsHydrationInjectable);

      ipcRenderer.on(detachedToolFrameChannels.redocked, (_event, notice: unknown) => {
        const { clusterId, tabId, toolKind } = (notice ?? {}) as Record<string, unknown>;

        if (toolKind === "logs" && typeof tabId === "string" && clusterId === hostedCluster?.id) {
          detachedTabs.delete(tabId);
        }
      });
    },
  }),

  injectionToken: beforeClusterFrameStartsSecondInjectionToken,
});

export default setupDetachedLogsRedockListenerInjectable;
