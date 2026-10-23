/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IpcMainInvokeEvent } from "electron";
import type { Logger } from "@openlens/logger";
import type { Cluster } from "../../../common/cluster/cluster";
import type { ClusterPreferences } from "../../../common/cluster-types";
import type { ProductionNodeShellRequest } from "./confirm-production-node-shell.injectable";
import type { NodeShellAuthRegistry } from "./node-shell-auth-registry";
import { NODE_SHELL_OPEN_OPERATION } from "../../../common/node-shell-channels";

export type NodeShellAuthorizationDenialReason =
  | "invalid-request"
  | "unauthorized-sender"
  | "cluster-not-found"
  | "node-shell-disabled"
  | "node-not-found"
  | "confirmation-denied"
  | "context-changed"
  | "internal-error";

export interface NodeShellAuthorizationRequest {
  clusterId?: unknown;
  nodeName?: unknown;
}

export interface NodeShellAuthorizationResponse {
  granted: boolean;
  /** Main-process issued terminal tab id. Present only when `granted` is true. */
  tabId?: string;
  reason?: NodeShellAuthorizationDenialReason;
}

export interface NodeShellAuthorizationHandlerDependencies {
  registry: NodeShellAuthRegistry;
  getClusterById: (clusterId: string) => Cluster | undefined;
  isSenderAuthorized: (event: IpcMainInvokeEvent, clusterId: string) => boolean;
  verifyNodeExists: (cluster: Cluster, nodeName: string) => Promise<boolean>;
  isProduction: (preferences?: ClusterPreferences | null) => boolean;
  getEnvironmentLabel: (preferences?: ClusterPreferences | null) => string;
  confirmProduction: (request: ProductionNodeShellRequest) => Promise<boolean>;
  logger: Logger;
}

const NODE_NAME_PATTERN = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
const MAX_KUBERNETES_NAME_LENGTH = 253;
const MAX_CLUSTER_ID_LENGTH = 255;

const isValidClusterId = (value: unknown): value is string => (
  typeof value === "string"
  && value.length > 0
  && value.length <= MAX_CLUSTER_ID_LENGTH
);

const isValidNodeName = (value: unknown): value is string => (
  typeof value === "string"
  && value.length > 0
  && value.length <= MAX_KUBERNETES_NAME_LENGTH
  && NODE_NAME_PATTERN.test(value)
);

/**
 * Builds the main-process handler for Node Shell authorization requests.
 *
 * Trust model:
 * 1. The request must come from the cluster frame of the same cluster it names.
 * 2. The renderer can only *ask*; the main process owns the approval and the opaque identifier.
 * 3. Renderer-supplied identifiers (`tabId`/`grantId`) are rejected outright.
 * 4. Production approval is a native main-process dialog, revalidated against cluster state.
 * 5. The grant is registered before the response is returned, so the renderer cannot race the
 *    session against an unregistered authorization.
 */
export const createNodeShellAuthorizationHandler = (dependencies: NodeShellAuthorizationHandlerDependencies) => {
  const {
    registry,
    getClusterById,
    isSenderAuthorized,
    verifyNodeExists,
    isProduction,
    getEnvironmentLabel,
    confirmProduction,
    logger,
  } = dependencies;

  const deny = (reason: NodeShellAuthorizationDenialReason): NodeShellAuthorizationResponse => ({ granted: false, reason });

  const isClusterUsable = async (clusterId: string): Promise<Cluster | undefined> => {
    const cluster = getClusterById(clusterId);

    if (!cluster || !cluster.preferences?.nodeShellEnabled) {
      return undefined;
    }

    return cluster;
  };

  return async (
    event: IpcMainInvokeEvent,
    request?: NodeShellAuthorizationRequest,
    ...forbiddenExtraArguments: unknown[]
  ): Promise<NodeShellAuthorizationResponse> => {
    if (forbiddenExtraArguments.length > 0) {
      logger.warn("[NODE-SHELL-AUTH]: rejected request with renderer-supplied identifier arguments");

      return deny("invalid-request");
    }

    if (!request || typeof request !== "object") {
      logger.warn("[NODE-SHELL-AUTH]: rejected malformed authorization request");

      return deny("invalid-request");
    }

    if ("tabId" in request || "grantId" in request) {
      logger.warn("[NODE-SHELL-AUTH]: rejected renderer-supplied authorization identifier");

      return deny("invalid-request");
    }

    const { clusterId, nodeName } = request;

    if (!isValidClusterId(clusterId) || !isValidNodeName(nodeName)) {
      logger.warn("[NODE-SHELL-AUTH]: rejected invalid cluster/node arguments");

      return deny("invalid-request");
    }

    let senderAuthorized = false;

    try {
      senderAuthorized = isSenderAuthorized(event, clusterId);
    } catch (error) {
      logger.error(`[NODE-SHELL-AUTH]: sender validation failed: ${String(error)}`);
    }

    if (!senderAuthorized) {
      logger.warn(`[NODE-SHELL-AUTH]: rejected authorization request from an untrusted sender for cluster "${clusterId}"`);

      return deny("unauthorized-sender");
    }

    const cluster = await isClusterUsable(clusterId);

    if (!cluster) {
      logger.warn(`[NODE-SHELL-AUTH]: cluster "${clusterId}" not found or node shell disabled`);

      return deny("cluster-not-found");
    }

    try {
      if (!(await verifyNodeExists(cluster, nodeName))) {
        logger.warn(`[NODE-SHELL-AUTH]: target node "${nodeName}" does not exist in cluster "${cluster.name.get()}"`);

        return deny("node-not-found");
      }
    } catch (error) {
      logger.error(`[NODE-SHELL-AUTH]: failed to verify node "${nodeName}": ${String(error)}`);

      return deny("node-not-found");
    }

    const production = isProduction(cluster.preferences);
    let productionConfirmed = false;

    if (production) {
      productionConfirmed = await confirmProduction({
        clusterId,
        clusterName: cluster.name.get(),
        environmentLabel: getEnvironmentLabel(cluster.preferences),
        nodeName,
      });

      if (!productionConfirmed) {
        logger.info(`[NODE-SHELL-AUTH]: production confirmation denied for node "${nodeName}"`);

        return deny("confirmation-denied");
      }

      // Post-confirmation revalidation: the dialog may have stayed open while cluster state changed.
      const revalidatedCluster = await isClusterUsable(clusterId);

      if (!revalidatedCluster || !productionConfirmed) {
        logger.info(`[NODE-SHELL-AUTH]: cluster context invalidated while confirming node "${nodeName}"`);

        return deny("context-changed");
      }

      try {
        if (!(await verifyNodeExists(revalidatedCluster, nodeName))) {
          logger.info(`[NODE-SHELL-AUTH]: target node "${nodeName}" disappeared while confirming`);

          return deny("context-changed");
        }
      } catch (error) {
        logger.error(`[NODE-SHELL-AUTH]: post-confirmation node verification failed: ${String(error)}`);

        return deny("context-changed");
      }
    }

    const grant = registry.issue({
      clusterId,
      nodeName,
      operation: NODE_SHELL_OPEN_OPERATION,
      productionConfirmed,
    });

    logger.info(`[NODE-SHELL-AUTH]: issued single-use grant for node "${nodeName}" in cluster "${clusterId}"`);

    return { granted: true, tabId: grant.grantId };
  };
};
