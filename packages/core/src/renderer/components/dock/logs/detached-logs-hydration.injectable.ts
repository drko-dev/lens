/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { detachedToolFrameChannels } from "../../../../common/detached-tools/detached-tool-channels";
import type { DetachedTabsResult } from "../../../../common/detached-tools/detached-tool-channels";
import detachedToolWindowsFeatureFlagInjectable from "../../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import ipcRendererInjectable from "../../../utils/channel/ipc-renderer.injectable";
import detachedLogsTabsInjectable from "./detached-logs-tabs.injectable";

export interface DetachedLogsHydration {
  /** true once Main's answer was applied (or there is nothing to ask). */
  readonly done: boolean;
  readonly ready: Promise<void>;
}

/**
 * R4-06A: the detached-tab flags live in this frame's memory and are lost on a frame reload while
 * Main keeps streaming. Main is the source of truth: ask it (once per frame) which tabs of THIS
 * cluster it owns and mark them before any log loading starts.
 */
const detachedLogsHydrationInjectable = getInjectable({
  id: "detached-logs-hydration",

  instantiate: (di): DetachedLogsHydration => {
    const state = { done: false, ready: Promise.resolve() };

    if (!di.inject(detachedToolWindowsFeatureFlagInjectable).isEnabled) {
      return { get done() { return true; }, ready: state.ready };
    }

    const detachedTabs = di.inject(detachedLogsTabsInjectable);
    const hostedCluster = di.inject(hostedClusterInjectable);
    const ipcRenderer = di.inject(ipcRendererInjectable);

    state.ready = Promise.resolve()
      .then(() => ipcRenderer.invoke(detachedToolFrameChannels.listDetached) as Promise<DetachedTabsResult>)
      .then(result => {
        for (const tab of result?.tabs ?? []) {
          if (tab.toolKind === "logs" && typeof tab.tabId === "string" && hostedCluster) detachedTabs.add(tab.tabId);
        }
      })
      .catch(() => undefined) // Main unreachable: fall back to the dock owning the stream, as before.
      .then(() => { state.done = true; });

    return { get done() { return state.done; }, ready: state.ready };
  },
});

export default detachedLogsHydrationInjectable;
