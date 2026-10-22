/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { ipcMain } from "electron";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";
import { detachedToolFrameChannels } from "../../common/detached-tools/detached-tool-channels";
import detachedToolSessionManagerInjectable from "./detached-tool-session-manager.injectable";

/** R4-06: the single entry point for cluster frames. It always exists and refuses while the feature flag is OFF. */
const setupDetachedToolIpcInjectable = getInjectable({
  id: "setup-detached-tool-ipc",

  instantiate: (di) => ({
    run: () => {
      const manager = di.inject(detachedToolSessionManagerInjectable);

      ipcMain.handle(detachedToolFrameChannels.requestDetach, (event, request: unknown) => manager.handleDetach(event, request));
      ipcMain.handle(detachedToolFrameChannels.requestRedock, (event, request: unknown) => manager.handleFrameRedock(event, request));
      ipcMain.handle(detachedToolFrameChannels.listDetached, (event, request?: unknown) => manager.handleFrameListDetached(event, request));
    },
  }),

  injectionToken: onLoadOfApplicationInjectionToken,
  causesSideEffects: true,
});

export default setupDetachedToolIpcInjectable;
