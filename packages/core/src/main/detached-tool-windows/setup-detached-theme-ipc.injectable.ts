/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { webContents } from "electron";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";
import { registerDetachedThemeIpc } from "./detached-theme-ipc";
import detachedWindowRegistryInjectable from "./detached-window-registry.injectable";

const setupDetachedThemeIpcInjectable = getInjectable({
  id: "setup-detached-theme-ipc",

  instantiate: (di) => ({
    run: () => {
      registerDetachedThemeIpc({
        registry: di.inject(detachedWindowRegistryInjectable),
        send: (windowId, channel, payload) => {
          const contents = webContents.fromId(windowId);

          if (contents && !contents.isDestroyed()) contents.send(channel, payload);
        },
      });
    },
  }),

  injectionToken: onLoadOfApplicationInjectionToken,
  causesSideEffects: true,
});

export default setupDetachedThemeIpcInjectable;
