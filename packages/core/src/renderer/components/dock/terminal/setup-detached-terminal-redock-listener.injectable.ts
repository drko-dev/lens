/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { beforeClusterFrameStartsSecondInjectionToken } from "../../../before-frame-starts/tokens";
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

    return {
      run: () => {
        ipcRenderer.on(detachedTerminalFrameChannels.redocked, (_event, notice: TerminalRedockedNotice) => {
          if (!hostedCluster || notice?.clusterId !== hostedCluster.id || typeof notice.tabId !== "string") {
            return;
          }

          if (notice.reason === "exited") {
            detachedTabs.set(notice.tabId, "ended");

            return;
          }

          detachedTabs.delete(notice.tabId);

          // The PTY is still alive in Main: the dock reconnects and ShellSession resumes it.
          void terminalStore.getTerminalApi(notice.tabId)?.resume();
        });
      },
    };
  },

  injectionToken: beforeClusterFrameStartsSecondInjectionToken,
});

export default setupDetachedTerminalRedockListenerInjectable;
