/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";
import clusterFramesInjectable from "../../common/cluster-frames.injectable";
import ipcMainInjectionToken from "../../common/ipc/ipc-main-injection-token";
import { proxyAuthChannels } from "../../common/lens-proxy-auth/proxy-auth";
import lensProxyPortInjectable from "../lens-proxy/lens-proxy-port.injectable";
import proxyAuthTokensInjectable from "../lens-proxy/proxy-auth-tokens.injectable";
import { FrameTokenService } from "./frame-token-service";

const setupFrameTokenIpcInjectable = getInjectable({
  id: "setup-frame-token-ipc",

  instantiate: (di) => ({
    run: () => {
      const ipcMain = di.inject(ipcMainInjectionToken);
      const tokens = di.inject(proxyAuthTokensInjectable);
      const clusterFrames = di.inject(clusterFramesInjectable);
      const lensProxyPort = di.inject(lensProxyPortInjectable);
      const service = new FrameTokenService({
        getClusterFrames: () => clusterFrames,
        getPort: () => lensProxyPort.get(),
        getToken: scope => tokens.get(scope),
      });

      ipcMain.handle(proxyAuthChannels.getFrameToken, (event, ...args: unknown[]) => service.handleGetFrameToken(event, ...args));
      tokens.onRotated((scope, token) => service.handleRotated(scope, token));
    },
  }),

  injectionToken: onLoadOfApplicationInjectionToken,
});

export default setupFrameTokenIpcInjectable;
