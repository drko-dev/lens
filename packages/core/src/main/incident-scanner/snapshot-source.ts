/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  FORBIDDEN_RESOURCE_KINDS,
  FORBIDDEN_SUBRESOURCES,
  type AuthorizationDecision,
  type ReadVerb,
  type UserIdentity,
} from "../../common/incident/broker-types";
import type {
  SnapshotAllowedResourceKind,
  SnapshotAllowedVerb,
  SnapshotSource,
  SnapshotSourceEnvelope,
  SnapshotSourceRequest,
  SnapshotUserSubject,
} from "../../common/incident/local-scanner-types";
import type { IncidentBrokerService } from "../incident-broker/incident-broker-service";

export type SnapshotSourceErrorCode =
  | "FORBIDDEN_RESOURCE"
  | "FORBIDDEN_SUBRESOURCE"
  | "FORBIDDEN_VERB"
  | "WATCHERS_FORBIDDEN"
  | "CLUSTER_SCOPE_VIOLATION"
  | "NAMESPACE_SCOPE_VIOLATION"
  | "MISSING_USER_IDENTITY"
  | "RBAC_FORBIDDEN_403"
  | "BROKER_AUTHORIZATION_DENIED"
  | "OPERATION_ABORTED"
  | "SNAPSHOT_VALIDATION_ERROR"
  | "REAL_K8S_CONNECTIVITY_DISABLED";

export class SnapshotSourceSecurityError extends Error {
  public readonly statusCode: number;

  constructor(
    public readonly code: SnapshotSourceErrorCode,
    message: string,
    statusCode = 403,
    public readonly brokerDecision?: AuthorizationDecision,
  ) {
    super(`SecurityError [${code}]: ${message}`);
    this.name = "SnapshotSourceSecurityError";
    this.statusCode = statusCode;
  }
}

export const SNAPSHOT_ALLOWED_RESOURCE_KINDS: ReadonlySet<SnapshotAllowedResourceKind> = new Set([
  "pods",
  "deployments",
  "statefulsets",
  "daemonsets",
  "events",
  "nodes",
]);

const CANONICAL_RESOURCE_KIND_MAP: Readonly<Record<string, SnapshotAllowedResourceKind>> = Object.freeze({
  pod: "pods",
  pods: "pods",
  deployment: "deployments",
  deployments: "deployments",
  statefulset: "statefulsets",
  statefulsets: "statefulsets",
  daemonset: "daemonsets",
  daemonsets: "daemonsets",
  event: "events",
  events: "events",
  node: "nodes",
  nodes: "nodes",
});

export const SNAPSHOT_FORBIDDEN_RESOURCE_KINDS: ReadonlySet<string> = new Set([
  ...FORBIDDEN_RESOURCE_KINDS,
  "secret",
  "secrets",
  "token",
  "tokens",
  "tokenrequest",
  "tokenrequests",
  "serviceaccount",
  "serviceaccounts",
  "selfsubjectrulesreview",
  "selfsubjectrulesreviews",
]);

export const SNAPSHOT_ALLOWED_VERBS: ReadonlySet<SnapshotAllowedVerb> = new Set(["list", "get"]);

export const SNAPSHOT_FORBIDDEN_WRITE_VERBS: ReadonlySet<string> = new Set([
  "create",
  "update",
  "patch",
  "delete",
  "deletecollection",
  "post",
  "put",
  "apply",
  "impersonate",
  "escalate",
  "bind",
]);

export const SNAPSHOT_FORBIDDEN_SUBRESOURCES: ReadonlySet<string> = new Set([
  ...FORBIDDEN_SUBRESOURCES,
  "exec",
  "attach",
  "port-forward",
  "portforward",
  "proxy",
  "token",
  "ephemeralcontainers",
  "scale",
]);

export interface SnapshotRbacCheckParams {
  clusterId: string;
  namespace: string;
  user: SnapshotUserSubject;
  resourceKind: SnapshotAllowedResourceKind;
  verb: SnapshotAllowedVerb;
}

export type SnapshotRbacEvaluator = (
  params: SnapshotRbacCheckParams,
) => Promise<boolean> | boolean;

/**
 * Contract preparing future real Kubernetes snapshot collection via IncidentBrokerService.
 * Enforces double-identity (user + technical ServiceAccount) and scope rules through the existing broker.
 */
export interface SnapshotBrokerAuthorizationContract {
  authorizeResourceRead(params: {
    sessionId: string;
    clusterId: string;
    namespace: string;
    resourceKind: SnapshotAllowedResourceKind;
    verb: SnapshotAllowedVerb;
    signal?: AbortSignal;
  }): Promise<void>;
}

export class BrokerSnapshotAuthorizationAdapter implements SnapshotBrokerAuthorizationContract {
  constructor(private readonly brokerService: IncidentBrokerService) {}

  public async authorizeResourceRead(params: {
    sessionId: string;
    clusterId: string;
    namespace: string;
    resourceKind: SnapshotAllowedResourceKind;
    verb: SnapshotAllowedVerb;
    signal?: AbortSignal;
  }): Promise<void> {
    const toolName = params.resourceKind === "events" ? "get_events" : "list_resources";

    try {
      await this.brokerService.executeDiagnosticOperation(
        params.sessionId,
        {
          targetClusterId: params.clusterId,
          namespace: params.namespace,
          toolName,
          resourceKind: params.resourceKind,
          verb: params.verb as ReadVerb,
        },
        async (_agent, abortSignal) => {
          if (abortSignal.aborted) {
            throw new SnapshotSourceSecurityError(
              "OPERATION_ABORTED",
              "Broker authorization aborted before completion.",
              499,
            );
          }
          return true;
        },
        params.signal,
      );
    } catch (err: any) {
      if (err instanceof SnapshotSourceSecurityError) {
        throw err;
      }
      throw new SnapshotSourceSecurityError(
        "BROKER_AUTHORIZATION_DENIED",
        err?.message || "Broker denied snapshot resource read authorization.",
        403,
        err?.decision,
      );
    }
  }
}

export interface SnapshotAuthorizationGateOptions {
  rbacEvaluator?: SnapshotRbacEvaluator;
  brokerContract?: SnapshotBrokerAuthorizationContract;
  brokerSessionIdResolver?: (clusterId: string, namespace: string, user: UserIdentity) => string | undefined;
}

/**
 * Enforces strict pre-collection authorization invariants for any SnapshotSource:
 * - Scope isolation (clusterId, namespace, user identity)
 * - Positive allowlist of read-only verbs (list, get) and resource kinds (pods, deployments, events)
 * - Explicit prohibition of Secrets, token creation, exec, attach, port-forward, proxy, watchers, and writes
 * - Simulated 403 Forbidden RBAC enforcement and optional Broker contract evaluation
 */
export class SnapshotAuthorizationGate {
  constructor(private readonly options: SnapshotAuthorizationGateOptions = {}) {}

  public static normalizeAllowedResourceKind(rawKind: string): SnapshotAllowedResourceKind {
    const normalized = (rawKind || "").trim().toLowerCase();
    if (!normalized) {
      throw new SnapshotSourceSecurityError(
        "FORBIDDEN_RESOURCE",
        "Resource kind must be a non-empty string.",
        403,
      );
    }

    if (normalized.includes("/")) {
      const [baseKind, subresource] = normalized.split("/", 2);
      if (SNAPSHOT_FORBIDDEN_SUBRESOURCES.has(subresource)) {
        throw new SnapshotSourceSecurityError(
          "FORBIDDEN_SUBRESOURCE",
          `Subresource '${subresource}' in '${rawKind}' is strictly forbidden in SnapshotSource (exec, attach, port-forward, proxy, and token creation are prohibited).`,
          403,
        );
      }
      if (SNAPSHOT_FORBIDDEN_RESOURCE_KINDS.has(baseKind)) {
        throw new SnapshotSourceSecurityError(
          "FORBIDDEN_RESOURCE",
          `Resource kind '${baseKind}' is strictly forbidden in SnapshotSource.`,
          403,
        );
      }
      throw new SnapshotSourceSecurityError(
        "FORBIDDEN_SUBRESOURCE",
        `Subresource path '${rawKind}' is not permitted in SnapshotSource.`,
        403,
      );
    }

    if (SNAPSHOT_FORBIDDEN_RESOURCE_KINDS.has(normalized)) {
      throw new SnapshotSourceSecurityError(
        "FORBIDDEN_RESOURCE",
        `Resource kind '${rawKind}' is strictly forbidden from SnapshotSource reads (Secrets, ServiceAccounts, and token resources are prohibited).`,
        403,
      );
    }

    const mapped = CANONICAL_RESOURCE_KIND_MAP[normalized];
    if (!mapped || !SNAPSHOT_ALLOWED_RESOURCE_KINDS.has(mapped)) {
      throw new SnapshotSourceSecurityError(
        "FORBIDDEN_RESOURCE",
        `Resource kind '${rawKind}' is not in the positive allowlist for SnapshotSource.`,
        403,
      );
    }

    return mapped;
  }

  public static validateVerb(rawVerb?: string): SnapshotAllowedVerb {
    const normalized = (rawVerb ?? "list").trim().toLowerCase();

    if (normalized === "watch") {
      throw new SnapshotSourceSecurityError(
        "WATCHERS_FORBIDDEN",
        "Real or streaming Kubernetes watchers ('watch') are strictly forbidden in SnapshotSource.",
        403,
      );
    }

    if (SNAPSHOT_FORBIDDEN_WRITE_VERBS.has(normalized)) {
      throw new SnapshotSourceSecurityError(
        "FORBIDDEN_VERB",
        `Write or mutation verb '${rawVerb}' is strictly forbidden in read-only SnapshotSource.`,
        403,
      );
    }

    if (!SNAPSHOT_ALLOWED_VERBS.has(normalized as SnapshotAllowedVerb)) {
      throw new SnapshotSourceSecurityError(
        "FORBIDDEN_VERB",
        `Verb '${rawVerb}' is not permitted in SnapshotSource (allowed: list, get).`,
        403,
      );
    }

    return normalized as SnapshotAllowedVerb;
  }

  public static validateSubresource(rawSubresource?: string): void {
    if (rawSubresource === undefined || rawSubresource === null || rawSubresource === "") {
      return;
    }

    const normalized = String(rawSubresource).trim().toLowerCase();
    if (SNAPSHOT_FORBIDDEN_SUBRESOURCES.has(normalized)) {
      throw new SnapshotSourceSecurityError(
        "FORBIDDEN_SUBRESOURCE",
        `Subresource '${rawSubresource}' is strictly forbidden in SnapshotSource (exec, attach, port-forward, proxy, and token operations are prohibited).`,
        403,
      );
    }

    throw new SnapshotSourceSecurityError(
      "FORBIDDEN_SUBRESOURCE",
      `Subresource '${rawSubresource}' is not permitted during snapshot collection.`,
      403,
    );
  }

  public async authorizeRequest(request: SnapshotSourceRequest): Promise<{
    clusterId: string;
    namespace: string;
    user: SnapshotUserSubject;
    resources: SnapshotAllowedResourceKind[];
    verb: SnapshotAllowedVerb;
  }> {
    if (request.signal?.aborted) {
      throw new SnapshotSourceSecurityError(
        "OPERATION_ABORTED",
        "Snapshot collection was aborted before authorization.",
        499,
      );
    }

    const scopeClusterId = request.scope?.clusterId?.trim();
    if (!scopeClusterId) {
      throw new SnapshotSourceSecurityError(
        "CLUSTER_SCOPE_VIOLATION",
        "SnapshotSource requires a non-empty scope.clusterId.",
        403,
      );
    }

    if (request.targetClusterId !== undefined) {
      const targetCluster = request.targetClusterId.trim();
      if (!targetCluster || targetCluster !== scopeClusterId) {
        throw new SnapshotSourceSecurityError(
          "CLUSTER_SCOPE_VIOLATION",
          `Cross-cluster snapshot request denied: requested '${request.targetClusterId}' while scoped to '${scopeClusterId}'.`,
          403,
        );
      }
    }

    const scopeNamespace = request.scope?.namespace?.trim();
    const effectiveNamespace = scopeNamespace && scopeNamespace !== "*" ? scopeNamespace : (request.targetNamespace?.trim() || "default");

    if (scopeNamespace && scopeNamespace !== "*") {
      if (request.targetNamespace !== undefined && request.targetNamespace.trim() !== scopeNamespace) {
        throw new SnapshotSourceSecurityError(
          "NAMESPACE_SCOPE_VIOLATION",
          `Cross-namespace snapshot request denied: requested '${request.targetNamespace}' while locked to namespace '${scopeNamespace}'.`,
          403,
        );
      }
    }

    const user: SnapshotUserSubject = request.user ?? {
      username: "local-synthetic-operator",
      groups: ["system:authenticated"],
    };

    if (typeof user.username !== "string" || !user.username.trim()) {
      throw new SnapshotSourceSecurityError(
        "MISSING_USER_IDENTITY",
        "SnapshotSource requires a valid non-empty user.username.",
        403,
      );
    }

    const normalizedUser: SnapshotUserSubject = {
      username: user.username.trim(),
      groups: Array.isArray(user.groups) ? [...user.groups] : undefined,
    };

    const verb = SnapshotAuthorizationGate.validateVerb(request.requestedVerb);
    SnapshotAuthorizationGate.validateSubresource(request.requestedSubresource);

    const rawResources = request.requestedResources && request.requestedResources.length > 0
      ? request.requestedResources
      : ["pods", "deployments", "events"];

    const normalizedResources: SnapshotAllowedResourceKind[] = [];
    for (const rawKind of rawResources) {
      const allowedKind = SnapshotAuthorizationGate.normalizeAllowedResourceKind(rawKind);
      if (!normalizedResources.includes(allowedKind)) {
        normalizedResources.push(allowedKind);
      }
    }

    for (const resourceKind of normalizedResources) {
      if (request.signal?.aborted) {
        throw new SnapshotSourceSecurityError(
          "OPERATION_ABORTED",
          "Snapshot collection was aborted during RBAC authorization.",
          499,
        );
      }

      if (this.options.rbacEvaluator) {
        const isAllowed = await this.options.rbacEvaluator({
          clusterId: scopeClusterId,
          namespace: effectiveNamespace,
          user: normalizedUser,
          resourceKind,
          verb,
        });

        if (!isAllowed) {
          throw new SnapshotSourceSecurityError(
            "RBAC_FORBIDDEN_403",
            `403 Forbidden: User '${normalizedUser.username}' is not authorized to '${verb}' resource '${resourceKind}' in namespace '${effectiveNamespace}' on cluster '${scopeClusterId}'.`,
            403,
          );
        }
      }

      if (this.options.brokerContract || this.options.brokerSessionIdResolver) {
        if (!this.options.brokerContract || !this.options.brokerSessionIdResolver) {
          throw new SnapshotSourceSecurityError(
            "BROKER_AUTHORIZATION_DENIED",
            "Incomplete broker configuration: both brokerContract and brokerSessionIdResolver are required when broker authorization is configured.",
            403,
          );
        }

        const sessionId = this.options.brokerSessionIdResolver(
          scopeClusterId,
          effectiveNamespace,
          normalizedUser,
        );
        if (!sessionId) {
          throw new SnapshotSourceSecurityError(
            "BROKER_AUTHORIZATION_DENIED",
            `No active broker session found for cluster '${scopeClusterId}', namespace '${effectiveNamespace}', user '${normalizedUser.username}'.`,
            403,
          );
        }
        await this.options.brokerContract.authorizeResourceRead({
          sessionId,
          clusterId: scopeClusterId,
          namespace: effectiveNamespace,
          resourceKind,
          verb,
          signal: request.signal,
        });
      }
    }

    return {
      clusterId: scopeClusterId,
      namespace: effectiveNamespace,
      user: normalizedUser,
      resources: normalizedResources,
      verb,
    };
  }
}

/**
 * Fail-closed placeholder for real Kubernetes cluster snapshot collection (H8.8-04a).
 * Ensures no real kubeconfig, ServiceAccount token, or live cluster connection can be activated in H8.8-04a.
 */
export class DisabledRealK8sSnapshotSource implements SnapshotSource {
  public readonly sourceId = "disabled-real-k8s-snapshot-source";
  public readonly isOfflineSynthetic = false;

  public async collectSnapshot(_request: SnapshotSourceRequest): Promise<SnapshotSourceEnvelope> {
    throw new SnapshotSourceSecurityError(
      "REAL_K8S_CONNECTIVITY_DISABLED",
      "Real Kubernetes cluster connectivity is disabled in H8.8-04a. Use FakeK8sSnapshotSource in offline mode.",
      403,
    );
  }
}
