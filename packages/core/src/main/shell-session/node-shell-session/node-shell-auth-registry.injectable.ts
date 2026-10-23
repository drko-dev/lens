/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import { NodeShellAuthRegistry } from "./node-shell-auth-registry";
import { ipcMainHandle } from "../../../common/ipc";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import { getClusterEnvironmentConfig, isProductionEnvironment } from "../../../common/cluster/environment-types";
import confirmProductionNodeShellInjectable from "./confirm-production-node-shell.injectable";
import { NodeApi } from "../../../common/k8s-api/endpoints";
import createKubeApiInjectable from "../../../common/k8s-api/create-kube-api.injectable";
import createKubeJsonApiForClusterInjectable from "../../../common/k8s-api/create-kube-json-api-for-cluster.injectable";
import lensProxyPortInjectable from "../../lens-proxy/lens-proxy-port.injectable";
import { isClusterFrameSender } from "../../ipc/is-cluster-frame-sender";
import { createNodeShellAuthorizationHandler } from "./node-shell-authorization-handler";
import { NODE_SHELL_AUTHORIZATION_CHANNEL } from "../../../common/node-shell-channels";

const nodeShellAuthRegistryInjectable = getInjectable({
  id: "node-shell-auth-registry",
  instantiate: (di) => {
    const registry = new NodeShellAuthRegistry();
    const getClusterById = di.inject(getClusterByIdInjectable);
    const createKubeApi = di.inject(createKubeApiInjectable);
    const createKubeJsonApiForCluster = di.inject(createKubeJsonApiForClusterInjectable);
    const lensProxyPort = di.inject(lensProxyPortInjectable);
    const logger = di.inject(loggerInjectionToken);

    const handler = createNodeShellAuthorizationHandler({
      registry,
      getClusterById,
      // Bind the request to the cluster frame it came from: a renderer for cluster A cannot request
      // an authorization for cluster B, and the top-level renderer cannot request one at all.
      isSenderAuthorized: (event, clusterId) => isClusterFrameSender(event, clusterId, lensProxyPort.get()),
      verifyNodeExists: async (cluster, nodeName) => {
        const nodeApi = createKubeApi(NodeApi, {
          request: createKubeJsonApiForCluster(cluster.id),
        });

        return Boolean(await nodeApi.get({ name: nodeName }));
      },
      isProduction: isProductionEnvironment,
      getEnvironmentLabel: (preferences) => getClusterEnvironmentConfig(preferences).label,
      // Resolved lazily: the dialog injectable has side effects and is only needed for PROD.
      confirmProduction: (request) => di.inject(confirmProductionNodeShellInjectable)(request),
      logger,
    });

    try {
      ipcMainHandle(NODE_SHELL_AUTHORIZATION_CHANNEL, handler);
    } catch (error) {
      // IPC handle might already be registered in re-entry or test environments.
      logger.debug(`[NODE-SHELL-AUTH]: authorization handler was not re-registered: ${String(error)}`);
    }

    return registry;
  },
});

export default nodeShellAuthRegistryInjectable;
