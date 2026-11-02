/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { SplitPanelStore } from "./split-panel-store";
import hostedClusterIdInjectable from "../../cluster-frame-context/hosted-cluster-id.injectable";
import ipcRendererInjectable from "../../utils/channel/ipc-renderer.injectable";
import { detachedToolFrameChannels } from "../../../common/detached-tools/detached-tool-channels";

const splitPanelStoreInjectable = getInjectable({
  id: "split-panel-store",
  instantiate: (di) => {
    let initialClusterId: string | undefined;
    let invoke: ((channel: string, payload: unknown) => Promise<unknown>) | undefined;
    let onRedocked: ((callback: (notice: any) => void) => () => void) | undefined;

    try {
      initialClusterId = di.inject(hostedClusterIdInjectable) ?? undefined;
    } catch {
      // In tests or outside frame context
    }

    try {
      const ipc = di.inject(ipcRendererInjectable);

      invoke = (channel, payload) => ipc.invoke(channel, payload);
      onRedocked = (callback) => {
        const handler = (_event: unknown, notice: unknown) => callback(notice);

        ipc.on(detachedToolFrameChannels.redocked, handler);

        return () => ipc.removeListener(detachedToolFrameChannels.redocked, handler);
      };
    } catch {
      // In tests without electron/ipc
    }

    return new SplitPanelStore({
      initialClusterId,
      invoke,
      onRedocked,
    });
  },
});

export default splitPanelStoreInjectable;
