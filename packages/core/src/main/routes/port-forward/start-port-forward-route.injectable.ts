/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getRouteInjectable } from "../../router/router.injectable";
import { apiPrefix } from "../../../common/vars";
import { PortForward } from "./functionality/port-forward";
import createPortForwardInjectable from "./functionality/create-port-forward.injectable";
import type { ClusterLensApiRequest } from "../../router/route";
import { clusterRoute } from "../../router/route";
import { loggerInjectionToken } from "@openlens/logger";
import kubeconfigManagerInjectable from "../../kubeconfig-manager/kubeconfig-manager.injectable";
import * as tcpPortUsed from "tcp-port-used";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import { getClusterEnvironmentConfig } from "../../../common/cluster/environment-types";
import confirmProductionPortForwardInjectable from "./confirm-production-port-forward.injectable";

const startPortForwardRouteInjectable = getRouteInjectable({
  id: "start-current-port-forward-route",

  instantiate: (di) => {
    const createPortForward = di.inject(createPortForwardInjectable);
    const logger = di.inject(loggerInjectionToken);
    const getClusterById = di.inject(getClusterByIdInjectable);
    const confirmProductionPortForward = di.inject(confirmProductionPortForwardInjectable);

    // One in-flight start per forward identity: identical concurrent requests share the result instead of racing for the port
    const inFlightStarts = new Map<string, Promise<unknown>>();

    const path = `${apiPrefix}/pods/port-forward/{namespace}/{resourceType}/{resourceName}` as const;

    return clusterRoute({
      method: "post",
      path,
    })(async (request) => {
      const { params, query, cluster } = request;
      const key = JSON.stringify([cluster.id, params.namespace, params.resourceType, params.resourceName, query.get("port"), query.get("forwardPort")]);
      const existing = inFlightStarts.get(key);

      if (existing) {
        logger.info(`[PORT-FORWARD-ROUTE]: joining in-flight start for ${params.namespace}/${params.resourceType}/${params.resourceName}`);

        return existing as ReturnType<typeof startForward>;
      }

      const pending = startForward(request);

      inFlightStarts.set(key, pending);

      try {
        return await pending;
      } finally {
        inFlightStarts.delete(key);
      }
    });

    async function startForward({ params, query, cluster }: ClusterLensApiRequest<typeof path>) {
      const { namespace, resourceType, resourceName } = params;
      const port = Number(query.get("port"));
      const forwardPort = Number(query.get("forwardPort"));

      if (!cluster.id || cluster.id === "unknown" || getClusterById(cluster.id) !== cluster) {
        logger.error("[PORT-FORWARD-SECURITY]: rejecting port-forward for unresolved cluster identity");

        return { error: { message: "Cluster identity could not be verified", code: "CLUSTER_IDENTITY" }};
      }

      if (!Number.isInteger(port) || port <= 0 || port > 65535 || !Number.isInteger(forwardPort) || forwardPort < 0 || forwardPort > 65535) {
        return { error: { message: "Invalid port", code: "INVALID_PORT" }};
      }

      const forwardArgs = {
        clusterId: cluster.id,
        kind: resourceType,
        name: resourceName,
        namespace,
        port,
        forwardPort,
      };

      const proxyKubeconfigManager = di.inject(kubeconfigManagerInjectable, cluster);

      try {
        let portForward = PortForward.getPortforward(forwardArgs);

        if (!portForward) {
          logger.info(
            `Creating a new port-forward ${namespace}/${resourceType}/${resourceName}:${port}`,
          );

          const thePort = forwardPort;
          const environment = getClusterEnvironmentConfig(cluster.preferences);

          if (environment.isProduction) {
            const confirmed = await confirmProductionPortForward({
              ...forwardArgs,
              forwardPort: thePort,
              clusterName: cluster.name.get(),
              environmentLabel: environment.label,
            });

            // Revalidate after the (possibly long) wait: same cluster, still registered, still the operation that was confirmed
            const stillSameCluster = getClusterById(forwardArgs.clusterId) === cluster;
            const stillSameEnvironment = getClusterEnvironmentConfig(cluster.preferences).id === environment.id;

            if (!confirmed || !stillSameCluster || !stillSameEnvironment) {
              logger.warn(`[PORT-FORWARD-SECURITY]: PROD port-forward not confirmed for cluster ${forwardArgs.clusterId}`);

              return { error: { message: "Production port-forward was not confirmed", code: "PROD_DECLINED" }};
            }

            const startedMeanwhile = PortForward.getPortforward(forwardArgs);

            if (startedMeanwhile) {
              return { response: { port: startedMeanwhile.forwardPort }};
            }
          }

          if (thePort > 0) {
            // Diagnostic only: the authoritative signal is kubectl failing to bind (PORT_IN_USE below)
            const inUse = await tcpPortUsed.check(thePort, "127.0.0.1");

            if (inUse) {
              logger.warn(`[PORT-FORWARD-ROUTE]: port ${thePort} is already in use by another process on 127.0.0.1`);

              return {
                error: {
                  message: `Port ${thePort} is already in use by another process`,
                  code: "PORT_IN_USE",
                },
              };
            }
          }

          const proxyKubeconfigPath = await proxyKubeconfigManager.ensurePath();

          portForward = createPortForward(proxyKubeconfigPath, {
            ...forwardArgs,
            forwardPort: thePort,
          });

          const started = await portForward.start();

          if (!started) {
            logger.error("[PORT-FORWARD-ROUTE]: failed to start a port-forward", {
              namespace,
              port,
              resourceType,
              resourceName,
            });

            return {
              error: {
                message: portForward.lastErrorCode === "PORT_IN_USE"
                  ? `Port ${thePort} is already in use by another process`
                  : portForward.lastError || `Failed to forward port ${port} to ${
                    thePort ? forwardPort : "random port"
                  }`,
                code: portForward.lastErrorCode ?? "START_FAILED",
              },
            };
          }
        }

        return { response: { port: portForward.forwardPort }};
      } catch (error) {
        logger.error(
          `[PORT-FORWARD-ROUTE]: failed to open a port-forward: ${error}`,
          { namespace, port, resourceType, resourceName },
        );

        return {
          error: {
            message: `Failed to forward port ${port}`,
          },
        };
      }
    }
  },
});

export default startPortForwardRouteInjectable;
