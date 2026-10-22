/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";
import { detachedTerminalFrameChannels, detachedTerminalWindowChannels } from "../../../common/terminal/detached-terminal-channels";
import ipcMainInjectable from "../../utils/channel/ipc-main/ipc-main.injectable";
import detachedTerminalManagerInjectable from "./detached-terminal-manager.injectable";

/** R4-06B: fixed channel allowlist. Always registered; Main refuses while the feature flag is OFF. */
const setupDetachedTerminalIpcInjectable = getInjectable({
  id: "setup-detached-terminal-ipc",

  instantiate: (di) => ({
    run: () => {
      const ipcMain = di.inject(ipcMainInjectable);
      const manager = di.inject(detachedTerminalManagerInjectable);

      ipcMain.handle(detachedTerminalFrameChannels.requestDetach, (event, request: unknown) => manager.handleDetach(event, request));
      ipcMain.handle(detachedTerminalFrameChannels.requestRedock, (event, request: unknown) => manager.handleFrameRedock(event, request));
      ipcMain.handle(detachedTerminalWindowChannels.getContext, event => manager.handleWindowGetContext(event));
      ipcMain.handle(detachedTerminalWindowChannels.start, (event, payload?: unknown) => manager.handleWindowStart(event, payload));
      ipcMain.handle(detachedTerminalWindowChannels.input, (event, data: unknown) => manager.handleWindowInput(event, data));
      ipcMain.handle(detachedTerminalWindowChannels.resize, (event, size: unknown) => manager.handleWindowResize(event, size));
      ipcMain.handle(detachedTerminalWindowChannels.redock, (event, payload?: unknown) => manager.handleWindowRedock(event, payload));
    },
  }),

  injectionToken: onLoadOfApplicationInjectionToken,
});

export default setupDetachedTerminalIpcInjectable;
