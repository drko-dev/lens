/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { UserIdentity } from "../../common/incident/broker-types";
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
  type SnapshotBrokerAuthorizationContract,
} from "./snapshot-source";

export interface RealK8sHttpClientOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  redirect?: "error" | "manual";
  followRedirects?: boolean;
  maxRedirects?: number;
}

export interface RealK8sHttpClient {
  get(url: string, options?: RealK8sHttpClientOptions): Promise<any>;
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
  /**
   * Whether cluster-wide namespace scope ('*') is permitted. Defaults to false (fail-closed).
   */
  allowClusterWideNamespaces?: boolean;
  /**
   * Mandatory Broker authorization contract for double-identity evaluation in real clusters.
   */
  brokerContract?: SnapshotBrokerAuthorizationContract;
  /**
   * Mandatory Broker session resolver for double-identity evaluation in real clusters.
   */
  brokerSessionIdResolver?: (clusterId: string, namespace: string, user: UserIdentity) => string | undefined;
}

/**
 * Validated KubeAuthProxy loopback parameters.
 */
export interface ValidatedLoopbackProxy {
  normalizedBaseUrl: string;
  port: number;
}

/**
 * H8.8-04b & R1: Real Kubernetes Read-Only Snapshot Source with Hardened Security.
 *
 * Invariants enforced:
 * - R1-01: Strict structured URL parsing, literal 127.0.0.1 loopback only, HTTPS only, no credentials, no redirects.
 * - R1-02: Strict Kubernetes RFC 1123 DNS label namespace validation, encoded route segments, no traversal.
 * - R1-03: Mandatory authenticated user identity and complete Broker double-identity authorization.
 * - R1-04: Generational authorization tracking and post-await checks rejecting late responses fail-closed.
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
  private readonly allowClusterWideNamespaces: boolean;
  private brokerContract?: SnapshotBrokerAuthorizationContract;
  private brokerSessionIdResolver?: (clusterId: string, namespace: string, user: UserIdentity) => string | undefined;

  private isDisposed = false;
  private authGeneration = 0;
  private readonly activeAbortControllers = new Set<AbortController>();

  constructor(options: RealK8sSnapshotSourceOptions = {}) {
    this.gate = new SnapshotAuthorizationGate(options);
    this.isRealK8sAuthorized = Boolean(options.isRealK8sAuthorized);
    this.authorizedClusterId = options.authorizedClusterId?.trim();
    this.proxyUrlResolver = options.proxyUrlResolver;
    this.httpClient = options.httpClient;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.allowClusterWideNamespaces = Boolean(options.allowClusterWideNamespaces);
    this.brokerContract = options.brokerContract;
    this.brokerSessionIdResolver = options.brokerSessionIdResolver;
  }

  public setBrokerAuthorization(
    brokerContract: SnapshotBrokerAuthorizationContract,
    sessionIdResolver: (clusterId: string, namespace: string, user: UserIdentity) => string | undefined,
  ): void {
    this.brokerContract = brokerContract;
    this.brokerSessionIdResolver = sessionIdResolver;
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
    this.authGeneration++;
    this.authorizedClusterId = normalized;
    this.isRealK8sAuthorized = true;
  }

  public revokeLiveAuthorization(): void {
    this.authGeneration++;
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

  public getAuthGeneration(): number {
    return this.authGeneration;
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

  /**
   * R1-01 & R2-02: Validates that the KubeAuthProxy URL conforms to strict loopback requirements:
   * - Validates the raw, unnormalized path BEFORE WHATWG URL parsing can strip dot-segments or traversals.
   * - Protocol must be exact 'https:'.
   * - Hostname must be literal '127.0.0.1' (rejects external domains containing 127.0.0.1 or localhost).
   * - Port must be a valid integer between 1 and 65535.
   * - Embedded credentials (username/password) are strictly forbidden.
   * - Rejects dot-segments ('.' and '..'), percent-encoded dots (%2e), double percent-encoding (%25),
   *   encoded separators (%2f, %5c), raw backslashes, and control characters.
   * - Ensures the normalized URL preserves the exact authorized original path prefix.
   */
  public static validateAndNormalizeLoopbackProxyUrl(rawUrl: string): ValidatedLoopbackProxy {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "KubeAuthProxy URL must be a non-empty string.",
        403,
      );
    }

    const trimmed = rawUrl.trim();

    // 1. R2-02: Pre-normalization validation of the original raw URL
    // Enforce HTTPS protocol on the raw string before parsing
    if (!trimmed.toLowerCase().startsWith("https://")) {
      const protoMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
      const receivedProto = protoMatch ? `${protoMatch[1]}:` : "unknown";
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        `Security invariant violated: KubeAuthProxy protocol must be 'https:', received '${receivedProto}'.`,
        403,
      );
    }

    // Extract authority, raw pathname, query and hash before new URL() normalizes away dot-segments
    const afterScheme = trimmed.slice("https://".length);
    const authorityEndIndex = afterScheme.search(/[/?#]/);
    const rawAuthority = authorityEndIndex === -1 ? afterScheme : afterScheme.slice(0, authorityEndIndex);
    const rawRest = authorityEndIndex === -1 ? "" : afterScheme.slice(authorityEndIndex);

    // From rawRest, separate rawPathname from query/hash
    const queryOrHashIndex = rawRest.search(/[?#]/);
    const rawPathname = queryOrHashIndex === -1 ? rawRest : rawRest.slice(0, queryOrHashIndex);
    const rawQueryOrHash = queryOrHashIndex === -1 ? "" : rawRest.slice(queryOrHashIndex);

    // Reject embedded credentials in authority early
    if (rawAuthority.includes("@")) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Security invariant violated: Embedded credentials (userinfo) in KubeAuthProxy URL are strictly prohibited.",
        403,
      );
    }

    // Base proxy URL cannot contain query parameters or fragments
    if (rawQueryOrHash) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Security invariant violated: Query parameters or fragment identifiers in KubeAuthProxy base URL are strictly prohibited.",
        403,
      );
    }

    // Inspect raw pathname before WHATWG URL normalizes away dot-segments or traversals
    // R2-02: Forbid control characters
    if (/[\x00-\x1f\x7f]/.test(rawPathname)) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Security invariant violated: Path traversal or control characters in KubeAuthProxy URL are strictly forbidden.",
        403,
      );
    }

    // Forbid double percent-encoding (%25)
    if (/%25/i.test(rawPathname)) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Security invariant violated: Double percent-encoding ('%25') in KubeAuthProxy URL is strictly forbidden.",
        403,
      );
    }

    // Forbid raw backslashes and encoded separators (%2f, %5c) capable of altering path hierarchy
    if (rawPathname.includes("\\") || /%5c/i.test(rawPathname) || /%2f/i.test(rawPathname)) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Security invariant violated: Raw backslashes or encoded path separators ('%2f', '%5c') in KubeAuthProxy URL are strictly forbidden.",
        403,
      );
    }

    // Forbid consecutive slashes
    if (rawPathname.includes("//")) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Security invariant violated: Consecutive slashes ('//') in KubeAuthProxy URL are strictly forbidden.",
        403,
      );
    }

    // Forbid percent-encoded dots (%2e)
    if (/%2e/i.test(rawPathname)) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Security invariant violated: Percent-encoded dot sequences ('%2e') in KubeAuthProxy URL are strictly forbidden.",
        403,
      );
    }

    // Inspect path segments for '.' and '..'
    const rawSegments = rawPathname.split("/");
    for (const seg of rawSegments) {
      if (seg === "." || seg === "..") {
        throw new SnapshotSourceSecurityError(
          "REAL_K8S_CONNECTIVITY_DISABLED",
          "Security invariant violated: Path traversal segments ('.' or '..') in KubeAuthProxy URL are strictly forbidden.",
          403,
        );
      }
    }

    if (rawPathname.includes("..")) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Security invariant violated: Path traversal sequence ('..') in KubeAuthProxy URL is strictly forbidden.",
        403,
      );
    }

    // 2. Structured parsing via URL
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch (err: any) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        `Invalid port or KubeAuthProxy URL: ${err?.message || String(err)}`,
        403,
      );
    }

    // Exact HTTPS protocol
    if (parsed.protocol !== "https:") {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        `Security invariant violated: KubeAuthProxy protocol must be 'https:', received '${parsed.protocol}'.`,
        403,
      );
    }

    // Literal 127.0.0.1 hostname
    if (parsed.hostname !== "127.0.0.1") {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        `Security invariant violated: KubeAuthProxy hostname must be literal '127.0.0.1', received '${parsed.hostname}'. External proxies and unauthorized domains are strictly blocked.`,
        403,
      );
    }

    // Absence of embedded credentials
    if (parsed.username || parsed.password) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Security invariant violated: Embedded credentials (userinfo) in KubeAuthProxy URL are strictly prohibited.",
        403,
      );
    }

    // Valid allowed port (1..65535)
    const portStr = parsed.port || "443";
    const portNum = parseInt(portStr, 10);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535 || String(portNum) !== portStr) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        `Security invariant violated: Invalid port '${parsed.port}' in KubeAuthProxy URL. Must be an integer between 1 and 65535.`,
        403,
      );
    }

    // R2-02: Ensure normalized path preserves exact original path prefix without mutation
    const originalCleanPath = rawPathname === "/" ? "" : rawPathname.replace(/\/+$/, "");
    const normalizedCleanPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");

    if (originalCleanPath !== normalizedCleanPath) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        `Security invariant violated: URL normalization altered the authorized path prefix (original: '${originalCleanPath}', normalized: '${normalizedCleanPath}'). Path traversal or canonicalization discrepancies are strictly forbidden.`,
        403,
      );
    }

    return {
      normalizedBaseUrl: `https://127.0.0.1:${portNum}${normalizedCleanPath}`,
      port: portNum,
    };
  }

  /**
   * R1-02: Validates Kubernetes namespace conforming to RFC 1123 DNS label constraints:
   * - Lowercase alphanumeric characters or '-' only.
   * - Must start and end with an alphanumeric character.
   * - Maximum 63 characters.
   * - Strictly forbids '/', '\', '..', whitespace, and control/encoding sequences.
   */
  public static validateKubernetesNamespace(rawNamespace: string): string {
    const trimmed = (rawNamespace || "").trim();
    if (!trimmed) {
      throw new SnapshotSourceSecurityError(
        "NAMESPACE_SCOPE_VIOLATION",
        "Namespace must be a non-empty string.",
        400,
      );
    }

    if (trimmed.length > 63) {
      throw new SnapshotSourceSecurityError(
        "NAMESPACE_SCOPE_VIOLATION",
        `Namespace '${trimmed}' exceeds maximum allowed length of 63 characters (RFC 1123).`,
        400,
      );
    }

    if (
      trimmed.includes("/") ||
      trimmed.includes("\\") ||
      trimmed.includes("..") ||
      trimmed.includes("%") ||
      /[\x00-\x1f\x7f]/.test(trimmed)
    ) {
      throw new SnapshotSourceSecurityError(
        "NAMESPACE_SCOPE_VIOLATION",
        `Namespace '${trimmed}' contains forbidden path traversal, separator or encoding characters.`,
        400,
      );
    }

    const k8sNamespaceRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
    if (!k8sNamespaceRegex.test(trimmed)) {
      throw new SnapshotSourceSecurityError(
        "NAMESPACE_SCOPE_VIOLATION",
        `Namespace '${trimmed}' is malformed: must conform to Kubernetes RFC 1123 DNS label format (lowercase alphanumeric and '-' only, starting and ending with an alphanumeric character).`,
        400,
      );
    }

    return trimmed;
  }

  public async collectSnapshot(request: SnapshotSourceRequest): Promise<SnapshotSourceEnvelope> {
    if (this.isDisposed) {
      throw new SnapshotSourceSecurityError(
        "OPERATION_ABORTED",
        "RealK8sSnapshotSource has been disposed.",
        499,
      );
    }

    // Fail-closed initial check for live cluster connectivity
    if (!this.isRealK8sAuthorized) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Live Kubernetes cluster collection is not authorized for this session. Explicit operator authorization is required.",
        403,
      );
    }

    // R1-02: Scope check for cluster-wide namespace before any processing
    const requestedNamespace = (request.scope?.namespace || request.targetNamespace || "").trim();
    if (requestedNamespace === "*" && !this.allowClusterWideNamespaces) {
      throw new SnapshotSourceSecurityError(
        "NAMESPACE_SCOPE_VIOLATION",
        "Cluster-wide namespace access ('*') is not authorized for this live snapshot session. A specific validated namespace is required.",
        403,
      );
    }

    // Forbid live or streaming watchers explicitly
    if (request.requestedVerb === "watch") {
      throw new SnapshotSourceSecurityError(
        "WATCHERS_FORBIDDEN",
        "Streaming watchers are strictly forbidden in SnapshotSource. Snapshots must be point-in-time collections.",
        403,
      );
    }

    // R2-01: Collection snapshots strictly require explicit 'list' authorization.
    // Reject 'get' on collection snapshot requests; do not silently convert 'get' to 'list'.
    if (request.requestedVerb === "get") {
      throw new SnapshotSourceSecurityError(
        "FORBIDDEN_VERB",
        "Verb 'get' is not permitted for collection snapshot requests. SnapshotSource collects resource collections and strictly requires explicit 'list' authorization.",
        403,
      );
    }

    if (request.requestedVerb && request.requestedVerb !== "list") {
      throw new SnapshotSourceSecurityError(
        "FORBIDDEN_VERB",
        `Verb '${request.requestedVerb}' is not permitted for collection snapshot requests. SnapshotSource collects resource collections and strictly requires explicit 'list' authorization.`,
        403,
      );
    }

    // Capture authorization generation and cluster ID at start (R1-04)
    const startGeneration = this.authGeneration;
    const startAuthorizedClusterId = this.authorizedClusterId;

    // R1-03: Strict user identity validation for real Kubernetes collection
    if (!request.user) {
      throw new SnapshotSourceSecurityError(
        "MISSING_USER_IDENTITY",
        "RealK8sSnapshotSource requires an authenticated, verified user identity. Missing user subject.",
        403,
      );
    }

    const username = (request.user.username || "").trim();
    if (!username || username === "local-synthetic-operator" || username === "untrusted-renderer" || username === "unauthenticated") {
      throw new SnapshotSourceSecurityError(
        "MISSING_USER_IDENTITY",
        `User '${username}' is not a verified authenticated identity. Real cluster queries strictly forbid synthetic operator fallback or unauthenticated renderer identities.`,
        403,
      );
    }

    if (request.user.isAuthenticated !== true) {
      throw new SnapshotSourceSecurityError(
        "MISSING_USER_IDENTITY",
        `User '${username}' is not verified (isAuthenticated must be true). Real cluster collection requires authenticated operator credentials.`,
        403,
      );
    }

    // Setup cancellation & timeout
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

    // R1-04: Assertion helper invoked before and after every async boundary
    const assertExecutionAuthorized = () => {
      if (
        this.isDisposed ||
        !this.isRealK8sAuthorized ||
        this.authGeneration !== startGeneration ||
        this.authorizedClusterId !== startAuthorizedClusterId ||
        localAbort.signal.aborted
      ) {
        throw new SnapshotSourceSecurityError(
          "OPERATION_ABORTED",
          "Live Kubernetes collection was revoked, superseded, or cancelled during execution.",
          499,
        );
      }
    };

    try {
      assertExecutionAuthorized();

      // 1. Authorize request through the common SnapshotAuthorizationGate
      const auth = await this.gate.authorizeRequest(request);
      assertExecutionAuthorized();

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

      // 4. R1-02: Namespace scope validation & cluster-wide authorization check
      let effectiveNamespace = auth.namespace;
      if (effectiveNamespace === "*" || !effectiveNamespace) {
        if (!this.allowClusterWideNamespaces) {
          throw new SnapshotSourceSecurityError(
            "NAMESPACE_SCOPE_VIOLATION",
            "Cluster-wide namespace access ('*') is not authorized for this live snapshot session. A specific validated namespace is required.",
            403,
          );
        }
      } else {
        effectiveNamespace = RealK8sSnapshotSource.validateKubernetesNamespace(effectiveNamespace);
      }

      // 5. R1-03: Mandatory Broker authorization for real Kubernetes collection
      if (!this.brokerContract || !this.brokerSessionIdResolver) {
        throw new SnapshotSourceSecurityError(
          "BROKER_AUTHORIZATION_DENIED",
          "RealK8sSnapshotSource strictly requires a complete Broker authorization contract and session resolver. Real cluster queries without broker verification are prohibited.",
          403,
        );
      }

      const userIdentity: UserIdentity = {
        username: request.user.username,
        groups: request.user.groups,
      };

      const brokerSessionId = this.brokerSessionIdResolver(
        auth.clusterId,
        effectiveNamespace,
        userIdentity,
      );

      if (!brokerSessionId) {
        throw new SnapshotSourceSecurityError(
          "BROKER_AUTHORIZATION_DENIED",
          `No active broker authorization session found for cluster '${auth.clusterId}', namespace '${effectiveNamespace}', user '${userIdentity.username}'.`,
          403,
        );
      }

      // Verify broker permissions for each resource kind
      // R2-01: Explicitly require 'list' verb authorization for collection snapshot reads
      for (const resourceKind of auth.resources) {
        assertExecutionAuthorized();
        await this.brokerContract.authorizeResourceRead({
          sessionId: brokerSessionId,
          clusterId: auth.clusterId,
          namespace: effectiveNamespace,
          resourceKind,
          verb: "list",
          signal: localAbort.signal,
        });
        assertExecutionAuthorized();
      }

      // 6. R1-01: Resolve and strictly validate KubeAuthProxy loopback URL
      let rawProxyUrl = "https://127.0.0.1:6443";
      if (this.proxyUrlResolver) {
        rawProxyUrl = await this.proxyUrlResolver(auth.clusterId);
      }
      assertExecutionAuthorized();

      const { normalizedBaseUrl } = RealK8sSnapshotSource.validateAndNormalizeLoopbackProxyUrl(rawProxyUrl);

      if (!this.httpClient) {
        throw new SnapshotSourceSecurityError(
          "REAL_K8S_CONNECTIVITY_DISABLED",
          "No HTTP client configured for RealK8sSnapshotSource.",
          503,
        );
      }

      // 7. Collect point-in-time snapshot resources with strict isolation
      const snapshot: K8sSnapshot = {
        pods: [],
        workloads: [],
        events: [],
        nodes: [],
      };

      for (const resourceKind of auth.resources) {
        assertExecutionAuthorized();

        const endpointPath = this.buildResourceEndpointPath(resourceKind, effectiveNamespace);
        const fullUrl = `${normalizedBaseUrl}/${endpointPath.replace(/^\//, "")}`;

        // Verify fullUrl strictly begins with authorized normalized loopback base URL
        if (!fullUrl.startsWith(normalizedBaseUrl)) {
          throw new SnapshotSourceSecurityError(
            "REAL_K8S_CONNECTIVITY_DISABLED",
            `Security invariant violated: Constructed URL '${fullUrl}' deviates from authorized loopback base '${normalizedBaseUrl}'.`,
            403,
          );
        }

        const responseData = await this.httpClient.get(fullUrl, {
          signal: localAbort.signal,
          timeoutMs: this.timeoutMs,
          redirect: "error",
          followRedirects: false,
          maxRedirects: 0,
        });

        // R1-04: Critical post-await assertion to prevent late responses from revoked sessions
        assertExecutionAuthorized();

        const items = Array.isArray(responseData?.items) ? responseData.items : [];

        switch (resourceKind) {
          case "pods":
            snapshot.pods = items.filter((pod: any) => this.filterResourceByScope(pod, effectiveNamespace));
            break;
          case "deployments":
          case "statefulsets":
          case "daemonsets":
            snapshot.workloads = [
              ...(snapshot.workloads || []),
              ...items.filter((d: any) => this.filterResourceByScope(d, effectiveNamespace)),
            ];
            break;
          case "events":
            snapshot.events = items.filter((ev: any) => this.filterResourceByScope(ev, effectiveNamespace));
            break;
          case "nodes":
            // Nodes are cluster-scoped
            snapshot.nodes = items;
            break;
          default:
            break;
        }
      }

      assertExecutionAuthorized();

      return {
        clusterId: auth.clusterId,
        namespace: effectiveNamespace,
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
      if (localAbort.signal.aborted || this.authGeneration !== startGeneration) {
        throw new SnapshotSourceSecurityError(
          "OPERATION_ABORTED",
          "Snapshot collection aborted, revoked, or timed out.",
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
    let nsPrefix = "";

    if (isNamespaced) {
      if (namespace && namespace !== "*") {
        const validatedNs = RealK8sSnapshotSource.validateKubernetesNamespace(namespace);
        nsPrefix = `namespaces/${encodeURIComponent(validatedNs)}/`;
      } else if (namespace === "*") {
        nsPrefix = "";
      }
    }

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
