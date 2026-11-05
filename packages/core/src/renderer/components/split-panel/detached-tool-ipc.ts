/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DiContainerForInjection } from "@ogre-tools/injectable";
import ipcRendererInjectable from "../../utils/channel/ipc-renderer.injectable";
import { detachedToolFrameChannels } from "../../../common/detached-tools/detached-tool-channels";
import type { SplitPanelStoreDependencies } from "./split-panel-store";

/**
 * The cluster frame side of the detached tool windows (invoke + redock notices), shared by the
 * Kubetail store and the global docking store. Empty in tests or outside a frame with IPC.
 */
export function getDetachedToolIpc(di: DiContainerForInjection): Pick<SplitPanelStoreDependencies, "invoke" | "onRedocked"> {
  try {
    const ipc = di.inject(ipcRendererInjectable);

    return {
      invoke: (channel, payload) => ipc.invoke(channel, payload),
      onRedocked: (callback) => {
        const handler = (_event: unknown, notice: unknown) => callback(notice);

        ipc.on(detachedToolFrameChannels.redocked, handler);

        return () => ipc.removeListener(detachedToolFrameChannels.redocked, handler);
      },
    };
  } catch {
    return {};
  }
}
