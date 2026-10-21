/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getClusterEnvironmentConfig, isProductionEnvironment } from "../cluster/environment-types";
import type { Cluster } from "../cluster/cluster";

export interface ToolResourceContext {
  apiVersion?: string;
  kind: string;
  name: string;
  namespace?: string;
  uid?: string;
  selfLink?: string;
}

export interface ToolContext {
  workspaceId: string;
  clusterId: string;
  tabId: string;
  clusterName: string;
  clusterAlias?: string;
  clusterColor?: string;
  environment: string;
  shortLabel: string;
  isProduction: boolean;
  resource?: ToolResourceContext;
  podUid?: string;
  containerName?: string;
}

export class ClusterContextMismatchError extends Error {
  constructor(expectedClusterId: string, actualClusterId: string, actionName: string) {
    super(
      `[TOOL-CONTEXT-SECURITY]: Cluster context mismatch! Action "${actionName}" was bound to cluster "${expectedClusterId}", but execution attempted against cluster "${actualClusterId}". Operation aborted to prevent cross-cluster contamination.`,
    );
    this.name = "ClusterContextMismatchError";
  }
}

/**
 * Validates that an action bound to a specific cluster ID is executed strictly against that cluster.
 * Throws a ClusterContextMismatchError fail-closed if identities do not match.
 */
export function assertToolActionClusterContext(
  expectedClusterId: string | undefined,
  actualClusterId: string | undefined,
  actionName: string,
): void {
  if (
    !expectedClusterId ||
    !actualClusterId ||
    expectedClusterId === "unknown" ||
    actualClusterId === "unknown" ||
    expectedClusterId !== actualClusterId
  ) {
    throw new ClusterContextMismatchError(
      expectedClusterId || "unknown",
      actualClusterId || "unknown",
      actionName,
    );
  }
}

/**
 * Extracts normalized tool context metadata from a hosted Cluster entity.
 */
export function createToolContextFromCluster(
  cluster: Cluster | undefined,
  tabId: string,
  workspaceId = "default",
  resource?: ToolResourceContext,
  extra?: { podUid?: string; containerName?: string },
): ToolContext {
  if (!cluster) {
    return {
      workspaceId,
      clusterId: "unknown",
      tabId,
      clusterName: "Unknown Cluster",
      environment: "none",
      shortLabel: "",
      isProduction: false,
      resource,
      podUid: extra?.podUid,
      containerName: extra?.containerName,
    };
  }

  const envConfig = getClusterEnvironmentConfig(cluster.preferences);
  const isProd = isProductionEnvironment(cluster.preferences);
  const clusterName = typeof cluster.name === "string" ? cluster.name : (cluster.name as any)?.get?.() || cluster.id;
  const title = cluster.preferences?.clusterAlias || clusterName;

  return {
    workspaceId,
    clusterId: cluster.id,
    tabId,
    clusterName: title,
    clusterAlias: cluster.preferences?.clusterAlias,
    clusterColor: cluster.preferences?.clusterColor || envConfig.defaultColor,
    environment: envConfig.id,
    shortLabel: envConfig.shortLabel || envConfig.id.toUpperCase(),
    isProduction: isProd,
    resource,
    podUid: extra?.podUid,
    containerName: extra?.containerName,
  };
}
