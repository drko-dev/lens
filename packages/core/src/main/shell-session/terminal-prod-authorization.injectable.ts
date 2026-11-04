/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import { ipcMainHandle } from "../../common/ipc";
import getClusterByIdInjectable from "../../features/cluster/storage/common/get-by-id.injectable";
import { getClusterEnvironmentConfig, isProductionEnvironment } from "../../common/cluster/environment-types";
import lensProxyPortInjectable from "../lens-proxy/lens-proxy-port.injectable";
import { isClusterFrameSender } from "../ipc/is-cluster-frame-sender";
import { TERMINAL_AUTHORIZATION_CHANNEL, TERMINAL_RELEASE_CHANNEL } from "../../common/terminal-shell-channels";
import nodeShellAuthRegistryInjectable from "./node-shell-session/node-shell-auth-registry.injectable";
import confirmProductionTerminalInjectable from "./confirm-production-terminal.injectable";
import shellSessionProcessesInjectable from "./processes.injectable";
import { createTerminalProdAuthorization } from "./terminal-prod-authorization-handler";

const terminalProdAuthorizationInjectable = getInjectable({
  id: "main-terminal-prod-authorization",
  instantiate: (di) => {
    const logger = di.inject(loggerInjectionToken);
    const processes = di.inject(shellSessionProcessesInjectable);
    const lensProxyPort = di.inject(lensProxyPortInjectable);

    const authorization = createTerminalProdAuthorization({
      // Same single-use, TTL-bound grant store the node shell uses.
      registry: di.inject(nodeShellAuthRegistryInjectable),
      getClusterById: di.inject(getClusterByIdInjectable),
      isSenderAuthorized: (event, clusterId) => isClusterFrameSender(event, clusterId, lensProxyPort.get()),
      isProduction: isProductionEnvironment,
      getEnvironmentLabel: (preferences) => getClusterEnvironmentConfig(preferences).label,
      confirmProduction: (request) => di.inject(confirmProductionTerminalInjectable)(request),
      hasPty: (terminalId) => processes.has(terminalId),
      logger,
    });

    try {
      ipcMainHandle(TERMINAL_AUTHORIZATION_CHANNEL, authorization.handler);
      ipcMainHandle(TERMINAL_RELEASE_CHANNEL, authorization.releaseHandler);
    } catch (error) {
      // IPC handle might already be registered in re-entry or test environments.
      logger.debug(`[TERMINAL-AUTH]: authorization handler was not re-registered: ${String(error)}`);
    }

    return authorization;
  },
});

export default terminalProdAuthorizationInjectable;
