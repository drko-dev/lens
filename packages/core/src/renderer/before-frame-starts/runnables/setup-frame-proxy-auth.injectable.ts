/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import { clusterSetFrameIdHandler } from "../../../common/ipc/cluster";
import { proxyAuthChannels } from "../../../common/lens-proxy-auth/proxy-auth";
import hostedClusterIdInjectable from "../../cluster-frame-context/hosted-cluster-id.injectable";
import frameProxyAuthInjectable from "../../lens-proxy-auth/frame-proxy-auth.injectable";
import ipcRendererInjectable from "../../utils/channel/ipc-renderer.injectable";
import { beforeFrameStartsFirstInjectionToken } from "../tokens";

const setupFrameProxyAuthInjectable = getInjectable({
  id: "setup-frame-proxy-auth",

  instantiate: (di) => {
    const ipcRenderer = di.inject(ipcRendererInjectable);
    const frameProxyAuth = di.inject(frameProxyAuthInjectable);
    const hostedClusterId = di.inject(hostedClusterIdInjectable);
    const logger = di.inject(loggerInjectionToken);

    return {
      run: async () => {
        ipcRenderer.on(proxyAuthChannels.frameTokenRotated, (event, payload?: { token?: unknown }) => {
          frameProxyAuth.setToken(payload?.token);
        });

        try {
          if (hostedClusterId) {
            // Main only vouches for a cluster frame once it is registered, which must happen before the first API call.
            await ipcRenderer.invoke(clusterSetFrameIdHandler, hostedClusterId);
          }

          frameProxyAuth.setToken(await ipcRenderer.invoke(proxyAuthChannels.getFrameToken));
        } catch {
          logger.error("[PROXY-AUTH]: could not obtain the proxy token for this frame");
        }
      },
    };
  },

  injectionToken: beforeFrameStartsFirstInjectionToken,
});

export default setupFrameProxyAuthInjectable;
