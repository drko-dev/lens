/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IpcMainInvokeEvent } from "electron";
import type { Logger } from "@openlens/logger";
import { reaction } from "mobx";
import type { Cluster } from "../../common/cluster/cluster";
import type { ClusterPreferences } from "../../common/cluster-types";
import type { NodeShellAuthRegistry } from "./node-shell-session/node-shell-auth-registry";
import { TERMINAL_SHELL_OPEN_OPERATION } from "../../common/terminal-shell-channels";

export interface ProductionTerminalRequest {
  clusterId: string;
  clusterName: string;
  environmentLabel: string;
  tabId: string;
}

export interface TerminalAuthorizationResponse {
  granted: boolean;
  reason?: "invalid-request" | "unauthorized-sender" | "cluster-not-found" | "confirmation-denied" | "context-changed";
}

export interface TerminalProdAuthorizationDependencies {
  registry: NodeShellAuthRegistry;
  getClusterById: (clusterId: string) => Cluster | undefined;
  isSenderAuthorized: (event: IpcMainInvokeEvent, clusterId: string) => boolean;
  isProduction: (preferences?: ClusterPreferences | null) => boolean;
  getEnvironmentLabel: (preferences?: ClusterPreferences | null) => string;
  confirmProduction: (request: ProductionTerminalRequest) => Promise<boolean>;
  /** True when a PTY already exists for `clusterId:tabId` (re-attaching is not a new session). */
  hasPty: (terminalId: string) => boolean;
  logger: Logger;
}

const MAX_ID_LENGTH = 255;

const isValidId = (value: unknown): value is string => (
  typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH
);

/**
 * H7.6.3E: Main-side PROD gate for local and pod terminals (node shells have their own grant).
 *
 * The renderer can only ask. Main re-derives "production" from the cluster itself, shows a native
 * confirmation, and keeps the grant bound to `${clusterId}:${tabId}`. `authorizeSpawn` consumes it:
 * single use, not valid for another tab or cluster, dropped when the cluster connection state changes.
 */
export const createTerminalProdAuthorization = (dependencies: TerminalProdAuthorizationDependencies) => {
  const { registry, getClusterById, isSenderAuthorized, isProduction, getEnvironmentLabel, confirmProduction, hasPty, logger } = dependencies;
  const grants = new Map<string, { grantId: string; dispose: () => void }>();
  const pendingConfirmations = new Map<string, Promise<boolean>>();

  const revoke = (terminalId: string) => {
    grants.get(terminalId)?.dispose();
    grants.delete(terminalId);
  };

  const handler = async (event: IpcMainInvokeEvent, request?: { clusterId?: unknown; tabId?: unknown }, ...extra: unknown[]): Promise<TerminalAuthorizationResponse> => {
    if (extra.length > 0 || !request || typeof request !== "object" || !isValidId(request.clusterId) || !isValidId(request.tabId)) {
      return { granted: false, reason: "invalid-request" };
    }

    const { clusterId, tabId } = request;
    let senderAuthorized = false;

    try {
      senderAuthorized = isSenderAuthorized(event, clusterId);
    } catch (error) {
      logger.error(`[TERMINAL-AUTH]: sender validation failed: ${String(error)}`);
    }

    if (!senderAuthorized) {
      logger.warn(`[TERMINAL-AUTH]: rejected request from an untrusted sender for cluster "${clusterId}"`);

      return { granted: false, reason: "unauthorized-sender" };
    }

    const cluster = getClusterById(clusterId);

    if (!cluster) {
      return { granted: false, reason: "cluster-not-found" };
    }

    const terminalId = `${clusterId}:${tabId}`;

    if (!isProduction(cluster.preferences) || hasPty(terminalId)) {
      return { granted: true };
    }

    // Concurrent requests for the same terminal share one native dialog.
    let confirmation = pendingConfirmations.get(terminalId);

    if (!confirmation) {
      confirmation = confirmProduction({
        clusterId,
        clusterName: cluster.name.get(),
        environmentLabel: getEnvironmentLabel(cluster.preferences),
        tabId,
      }).finally(() => pendingConfirmations.delete(terminalId));
      pendingConfirmations.set(terminalId, confirmation);
    }

    const confirmed = await confirmation;

    if (!confirmed) {
      logger.info(`[TERMINAL-AUTH]: production confirmation denied for ${terminalId}`);

      return { granted: false, reason: "confirmation-denied" };
    }

    if (!getClusterById(clusterId) || !isProduction(getClusterById(clusterId)?.preferences)) {
      return { granted: false, reason: "context-changed" };
    }

    revoke(terminalId);

    const grant = registry.issue({
      clusterId,
      nodeName: terminalId,
      operation: TERMINAL_SHELL_OPEN_OPERATION,
      productionConfirmed: true,
    });
    // Any connection state change (e.g. Disconnect) invalidates a grant that was not used yet.
    const dispose = reaction(() => cluster.disconnected.get(), () => revoke(terminalId));

    grants.set(terminalId, { grantId: grant.grantId, dispose });
    logger.info(`[TERMINAL-AUTH]: issued single-use grant for ${terminalId}`);

    return { granted: true };
  };

  /**
   * Renderer -> Main: the tab was closed, so a grant that was never consumed must die with it.
   * Only a trusted frame of that cluster can release; it never touches a running PTY.
   */
  const releaseHandler = async (event: IpcMainInvokeEvent, request?: { clusterId?: unknown; tabId?: unknown }, ...extra: unknown[]): Promise<{ released: boolean }> => {
    if (extra.length > 0 || !request || typeof request !== "object" || !isValidId(request.clusterId) || !isValidId(request.tabId)) {
      return { released: false };
    }

    let senderAuthorized = false;

    try {
      senderAuthorized = isSenderAuthorized(event, request.clusterId);
    } catch (error) {
      logger.error(`[TERMINAL-AUTH]: sender validation failed: ${String(error)}`);
    }

    if (!senderAuthorized) {
      return { released: false };
    }

    const terminalId = `${request.clusterId}:${request.tabId}`;
    const had = grants.has(terminalId);

    revoke(terminalId);

    if (had) {
      logger.info(`[TERMINAL-AUTH]: released unused grant for closed tab ${terminalId}`);
    }

    return { released: had };
  };

  /** Called by local/pod sessions right before a NEW PTY would be spawned. */
  const authorizeSpawn = (cluster: Cluster, terminalId: string): boolean => {
    if (!isProduction(cluster.preferences)) {
      return true;
    }

    const entry = grants.get(terminalId);

    if (!entry) {
      return false;
    }

    revoke(terminalId);

    return registry.consume({
      grantId: entry.grantId,
      clusterId: cluster.id,
      nodeName: terminalId,
      operation: TERMINAL_SHELL_OPEN_OPERATION,
      requireProductionConfirmation: true,
    });
  };

  return { handler, releaseHandler, authorizeSpawn, revoke };
};
