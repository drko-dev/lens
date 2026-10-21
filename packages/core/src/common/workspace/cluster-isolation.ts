/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ClusterContext, WorkspaceTab } from "./workspace-types";

/**
 * Generates an immutable, globally unique compound key for a Kubernetes resource
 * incorporating the explicit clusterId, preventing cross-cluster collisions.
 */
export function createScopedResourceKey(
  clusterId: string,
  namespace: string | undefined,
  kind: string,
  name: string,
): string {
  if (!clusterId) throw new Error("createScopedResourceKey: clusterId is required");
  if (!kind) throw new Error("createScopedResourceKey: kind is required");
  if (!name) throw new Error("createScopedResourceKey: name is required");

  const ns = namespace || "_all_";

  return `k8s://${[clusterId, ns, kind.toLowerCase(), name].map(encodeURIComponent).join("/")}`;
}

/** Copies and freezes cluster identity so later caller mutation cannot retarget a tab. */
export function createImmutableClusterContext(context: ClusterContext): ClusterContext {
  if (!context || typeof context.clusterId !== "string" || !context.clusterId || typeof context.name !== "string" ||
    !context.name || typeof context.isProduction !== "boolean" || typeof context.environment !== "string") {
    throw new Error("Invalid cluster context.");
  }

  const accessibleNamespaces = context.accessibleNamespaces
    ? Object.freeze([...context.accessibleNamespaces])
    : undefined;

  return Object.freeze({ ...context, accessibleNamespaces });
}

/**
 * Validates that an action targeted at a cluster matches the tab's immutable clusterId.
 * Never allows fallback to a global or transient "currentCluster".
 */
export function validateTabClusterContext(tab: WorkspaceTab, targetClusterId: string): boolean {
  if (!tab || !tab.clusterId) return false;
  if (!targetClusterId) return false;

  return tab.clusterId === targetClusterId;
}

/**
 * Strictly verifies and authorizes an action. Throws an explicit SecurityError on mismatch.
 */
export function enforceClusterAuthorization(
  tab: WorkspaceTab,
  requestedClusterId: string,
  actionDescription: string,
): void {
  if (!validateTabClusterContext(tab, requestedClusterId)) {
    throw new Error(
      `Cross-Cluster Security Violation: Attempted to execute "${actionDescription}" for target cluster "${requestedClusterId}", but tab "${tab.id}" (${tab.title}) is permanently bound to cluster "${tab.clusterId}". Operation aborted.`,
    );
  }
}

/**
 * Simulates isolated cluster dispatch to verify multi-cluster segregation.
 * Verifies that two clusters with identical namespaces and pod names return completely isolated results.
 */
export interface ScopedKubeQuery {
  clusterId: string;
  namespace: string;
  kind: string;
  name: string;
}

export interface ScopedKubeResult {
  clusterContext: ClusterContext;
  resourceKey: string;
  data: {
    name: string;
    namespace: string;
    clusterId: string;
    isProduction: boolean;
  };
}

export class ClusterIsolationEngine {
  private clusters = new Map<string, ClusterContext>();

  public registerCluster(ctx: ClusterContext): void {
    const immutableContext = createImmutableClusterContext(ctx);

    if (this.clusters.has(immutableContext.clusterId)) {
      throw new Error("Cluster context is already registered and cannot be retargeted.");
    }

    this.clusters.set(immutableContext.clusterId, immutableContext);
  }

  public getCluster(clusterId: string): ClusterContext {
    const ctx = this.clusters.get(clusterId);

    if (!ctx) {
      throw new Error(`Cluster "${clusterId}" not registered in isolation engine.`);
    }

    return ctx;
  }

  public executeScopedQuery(query: ScopedKubeQuery): ScopedKubeResult {
    const ctx = this.getCluster(query.clusterId);
    const key = createScopedResourceKey(query.clusterId, query.namespace, query.kind, query.name);

    return {
      clusterContext: ctx,
      resourceKey: key,
      data: {
        name: query.name,
        namespace: query.namespace,
        clusterId: ctx.clusterId,
        isProduction: ctx.isProduction,
      },
    };
  }
}
