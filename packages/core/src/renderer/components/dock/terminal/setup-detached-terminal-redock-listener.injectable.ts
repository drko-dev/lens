/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { beforeClusterFrameStartsSecondInjectionToken } from "../../../before-frame-starts/tokens";
import { detachedToolFrameChannels } from "../../../../common/detached-tools/detached-tool-channels";
import type { DetachedTabsResult } from "../../../../common/detached-tools/detached-tool-channels";
import detachedToolWindowsFeatureFlagInjectable from "../../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import { detachedTerminalFrameChannels } from "../../../../common/terminal/detached-terminal-channels";
import type { TerminalRedockedNotice } from "../../../../common/terminal/detached-terminal-channels";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import ipcRendererInjectable from "../../../utils/channel/ipc-renderer.injectable";
import detachedTerminalTabsInjectable from "./detached-terminal-tabs.injectable";
import terminalStoreInjectable from "./store.injectable";

/** R4-06B: Main tells the originating cluster frame that a terminal window was closed or its shell ended. */
const setupDetachedTerminalRedockListenerInjectable = getInjectable({
  id: "setup-detached-terminal-redock-listener",

  instantiate: (di) => {
    const ipcRenderer = di.inject(ipcRendererInjectable);
    const detachedTabs = di.inject(detachedTerminalTabsInjectable);
    const hostedCluster = di.inject(hostedClusterInjectable);
    const terminalStore = di.inject(terminalStoreInjectable);
    const detachedToolWindowsFeatureFlag = di.inject(detachedToolWindowsFeatureFlagInjectable);

    return {
      run: async () => {
        // R5-07F: tabs redocked while the hydration invoke is pending must not be re-marked.
        const redockedWhilePending = new Set<string>();

        ipcRenderer.on(detachedTerminalFrameChannels.redocked, (_event, notice: TerminalRedockedNotice) => {
          if (!hostedCluster || notice?.clusterId !== hostedCluster.id || typeof notice.tabId !== "string") {
            return;
          }

          if (notice.reason === "exited") {
            redockedWhilePending.add(notice.tabId);
            detachedTabs.set(notice.tabId, "ended");

            return;
          }

          redockedWhilePending.add(notice.tabId);
          detachedTabs.delete(notice.tabId);

          // The PTY is still alive in Main: the dock reconnects and ShellSession resumes it.
          void terminalStore.getTerminalApi(notice.tabId)?.resume();
        });

        // R5-07F: after a cluster-frame reload the renderer-only map is empty; Main (the authority) knows which terminal tabs are detached.
        if (!hostedCluster || !detachedToolWindowsFeatureFlag.isEnabled) {
          return;
        }

        try {
          const { tabs } = (await ipcRenderer.invoke(detachedToolFrameChannels.listDetached)) as DetachedTabsResult;

          for (const { tabId, toolKind } of tabs) {
            if (toolKind === "terminal" && typeof tabId === "string" && !detachedTabs.has(tabId) && !redockedWhilePending.has(tabId)) {
              detachedTabs.set(tabId, "detached");
            }
          }
        } catch {
          // Main unreachable or rejected: keep the previous behaviour.
        }
      },
    };
  },

  injectionToken: beforeClusterFrameStartsSecondInjectionToken,
});

export default setupDetachedTerminalRedockListenerInjectable;
