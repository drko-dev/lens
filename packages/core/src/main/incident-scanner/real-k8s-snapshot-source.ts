/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type {
  K8sSnapshot,
  SnapshotAllowedResourceKind,
  SnapshotSource,
  SnapshotSourceEnvelope,
  SnapshotSourceRequest,
} from "../../common/incident/local-scanner-types";
import {
  SnapshotAuthorizationGate,
  SnapshotSourceSecurityError,
  type SnapshotAuthorizationGateOptions,
} from "./snapshot-source";

export interface RealK8sHttpClient {
  get(url: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<any>;
}

export interface RealK8sSnapshotSourceOptions extends SnapshotAuthorizationGateOptions {
  /**
   * Explicit security flag. Real cluster connectivity is strictly blocked unless true.
   */
  isRealK8sAuthorized?: boolean;
  /**
   * The specific clusterId that is authorized for live collection.
   */
  authorizedClusterId?: string;
  /**
   * Loopback proxy URL resolver for the authorized cluster (e.g. https://127.0.0.1:port/api-prefix).
   */
  proxyUrlResolver?: (clusterId: string) => Promise<string> | string;
  /**
   * Pluggable HTTP client for executing GET requests against the local KubeAuthProxy loopback.
   */
  httpClient?: RealK8sHttpClient;
  /**
   * Request timeout in milliseconds (default: 15,000ms).
   */
  timeoutMs?: number;
}

/**
 * H8.8-04b: Real Kubernetes Read-Only Snapshot Source.
 *
 * Connects exclusively through local loopback (KubeAuthProxy / 127.0.0.1) using the user's
 * configured kubeconfig context and RBAC. Strictly read-only, forbids watchers and secrets,
 * enforces cluster isolation, and fails closed when unauthorized.
 */
export class RealK8sSnapshotSource implements SnapshotSource {
  public readonly sourceId = "real-k8s-snapshot-source";
  public readonly isOfflineSynthetic = false;

  private readonly gate: SnapshotAuthorizationGate;
  private isRealK8sAuthorized: boolean;
  private authorizedClusterId?: string;
  private readonly proxyUrlResolver?: (clusterId: string) => Promise<string> | string;
  private readonly httpClient?: RealK8sHttpClient;
  private readonly timeoutMs: number;
  private isDisposed = false;
  private readonly activeAbortControllers = new Set<AbortController>();

  constructor(options: RealK8sSnapshotSourceOptions = {}) {
    this.gate = new SnapshotAuthorizationGate(options);
    this.isRealK8sAuthorized = Boolean(options.isRealK8sAuthorized);
    this.authorizedClusterId = options.authorizedClusterId?.trim();
    this.proxyUrlResolver = options.proxyUrlResolver;
    this.httpClient = options.httpClient;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  public authorizeLiveCluster(clusterId: string): void {
    if (this.isDisposed) {
      throw new SnapshotSourceSecurityError(
        "OPERATION_ABORTED",
        "Cannot authorize live cluster on a disposed RealK8sSnapshotSource.",
        499,
      );
    }
    const normalized = (clusterId || "").trim();
    if (!normalized) {
      throw new SnapshotSourceSecurityError(
        "CLUSTER_SCOPE_VIOLATION",
        "clusterId for live authorization must be a non-empty string.",
        400,
      );
    }
    this.authorizedClusterId = normalized;
    this.isRealK8sAuthorized = true;
  }

  public revokeLiveAuthorization(): void {
    this.isRealK8sAuthorized = false;
    this.authorizedClusterId = undefined;
    this.abortAllInFlight();
  }

  public isAuthorizedForCluster(clusterId: string): boolean {
    if (!this.isRealK8sAuthorized || !this.authorizedClusterId) {
      return false;
    }
    return this.authorizedClusterId === clusterId.trim();
  }

  public dispose(): void {
    this.isDisposed = true;
    this.revokeLiveAuthorization();
  }

  private abortAllInFlight(): void {
    for (const controller of this.activeAbortControllers) {
      try {
        controller.abort();
      } catch {
        // ignore abort errors
      }
    }
    this.activeAbortControllers.clear();
  }

  public async collectSnapshot(request: SnapshotSourceRequest): Promise<SnapshotSourceEnvelope> {
    if (this.isDisposed) {
      throw new SnapshotSourceSecurityError(
        "OPERATION_ABORTED",
        "RealK8sSnapshotSource has been disposed.",
        499,
      );
    }

    // 1. Authorize request through the common SnapshotAuthorizationGate
    const auth = await this.gate.authorizeRequest(request);

    // 2. Strict live cluster authorization gate
    if (!this.isRealK8sAuthorized) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Live Kubernetes cluster collection is not authorized for this session. Explicit operator authorization is required.",
        403,
      );
    }

    if (!this.authorizedClusterId || this.authorizedClusterId !== auth.clusterId) {
      throw new SnapshotSourceSecurityError(
        "CLUSTER_SCOPE_VIOLATION",
        `Live cluster authorization mismatch: authorized for '${this.authorizedClusterId}', but request is scoped to '${auth.clusterId}'. Cross-cluster collection denied.`,
        403,
      );
    }

    // 3. Forbid watchers explicitly
    if (request.requestedVerb === "watch") {
      throw new SnapshotSourceSecurityError(
        "WATCHERS_FORBIDDEN",
        "Streaming watchers are strictly forbidden in SnapshotSource. Snapshots must be point-in-time collections.",
        403,
      );
    }

    // 4. Setup cancellation & timeout
    const localAbort = new AbortController();
    this.activeAbortControllers.add(localAbort);

    const onExternalAbort = () => localAbort.abort();
    if (request.signal) {
      if (request.signal.aborted) {
        this.activeAbortControllers.delete(localAbort);
        throw new SnapshotSourceSecurityError(
          "OPERATION_ABORTED",
          "Snapshot collection was aborted before network execution.",
          499,
        );
      }
      request.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    const timeoutTimer = setTimeout(() => {
      localAbort.abort();
    }, this.timeoutMs);

    try {
      // 5. Resolve local proxy URL (must resolve to 127.0.0.1 loopback)
      let proxyBaseUrl = "https://127.0.0.1:6443";
      if (this.proxyUrlResolver) {
        proxyBaseUrl = await this.proxyUrlResolver(auth.clusterId);
      }

      if (!proxyBaseUrl.includes("127.0.0.1") && !proxyBaseUrl.includes("localhost")) {
        throw new SnapshotSourceSecurityError(
          "REAL_K8S_CONNECTIVITY_DISABLED",
          `Security invariant violated: KubeAuthProxy URL '${proxyBaseUrl}' does not point to local loopback (127.0.0.1). Outgoing requests blocked.`,
          403,
        );
      }

      // 6. Collect point-in-time snapshot resources
      const snapshot: K8sSnapshot = {
        pods: [],
        workloads: [],
        events: [],
        nodes: [],
      };

      if (!this.httpClient) {
        throw new SnapshotSourceSecurityError(
          "REAL_K8S_CONNECTIVITY_DISABLED",
          "No HTTP client configured for RealK8sSnapshotSource.",
          503,
        );
      }

      for (const resourceKind of auth.resources) {
        if (localAbort.signal.aborted) {
          throw new SnapshotSourceSecurityError(
            "OPERATION_ABORTED",
            "Snapshot collection aborted during live resource fetch.",
            499,
          );
        }

        const endpointPath = this.buildResourceEndpointPath(resourceKind, auth.namespace);
        const fullUrl = `${proxyBaseUrl.replace(/\/$/, "")}/${endpointPath.replace(/^\//, "")}`;

        const responseData = await this.httpClient.get(fullUrl, {
          signal: localAbort.signal,
          timeoutMs: this.timeoutMs,
        });

        const items = Array.isArray(responseData?.items) ? responseData.items : [];

        switch (resourceKind) {
          case "pods":
            snapshot.pods = items.filter((pod: any) => this.filterResourceByScope(pod, auth.namespace));
            break;
          case "deployments":
          case "statefulsets":
          case "daemonsets":
            snapshot.workloads = [
              ...(snapshot.workloads || []),
              ...items.filter((d: any) => this.filterResourceByScope(d, auth.namespace)),
            ];
            break;
          case "events":
            snapshot.events = items.filter((ev: any) => this.filterResourceByScope(ev, auth.namespace));
            break;
          case "nodes":
            // Nodes are cluster-scoped
            snapshot.nodes = items;
            break;
          default:
            break;
        }
      }

      return {
        clusterId: auth.clusterId,
        namespace: auth.namespace,
        user: auth.user,
        sourceType: "real_k8s_snapshot_source",
        isSyntheticSimulation: false,
        collectedAt: new Date().toISOString(),
        scenarioId: "live_k8s",
        snapshot,
      };
    } catch (err: any) {
      if (err instanceof SnapshotSourceSecurityError) {
        throw err;
      }
      if (localAbort.signal.aborted) {
        throw new SnapshotSourceSecurityError(
          "OPERATION_ABORTED",
          "Snapshot collection aborted or timed out.",
          499,
        );
      }
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        `Failed to collect real Kubernetes snapshot: ${err?.message || String(err)}`,
        500,
      );
    } finally {
      clearTimeout(timeoutTimer);
      if (request.signal) {
        request.signal.removeEventListener("abort", onExternalAbort);
      }
      this.activeAbortControllers.delete(localAbort);
    }
  }

  private filterResourceByScope(resource: any, targetNamespace: string): boolean {
    if (!resource || typeof resource !== "object") return false;
    const ns = resource.metadata?.namespace;
    if (targetNamespace === "*" || !targetNamespace) return true;
    return ns === targetNamespace;
  }

  private buildResourceEndpointPath(kind: SnapshotAllowedResourceKind, namespace: string): string {
    const isNamespaced = kind !== "nodes";
    const nsPrefix = isNamespaced && namespace && namespace !== "*" ? `namespaces/${namespace}/` : "";

    switch (kind) {
      case "pods":
        return `api/v1/${nsPrefix}pods`;
      case "deployments":
        return `apis/apps/v1/${nsPrefix}deployments`;
      case "statefulsets":
        return `apis/apps/v1/${nsPrefix}statefulsets`;
      case "daemonsets":
        return `apis/apps/v1/${nsPrefix}daemonsets`;
      case "events":
        return `api/v1/${nsPrefix}events`;
      case "nodes":
        return "api/v1/nodes";
      default:
        throw new SnapshotSourceSecurityError(
          "FORBIDDEN_RESOURCE",
          `Unsupported resource kind for live collection: '${kind}'.`,
          403,
        );
    }
  }
}
