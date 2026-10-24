/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { KubeJsonApi } from "../../kube-json-api";
import type {
  AccessReviewQuery,
  AccessReviewResult,
  LocalEvaluationResult,
} from "./types";

export interface AccessReviewClientDependencies {
  readonly getJsonApi: () => KubeJsonApi | undefined;
  readonly getActiveClusterId: () => string | undefined;
  readonly getClusterConnectionStatus?: () => {
    isOnline: boolean;
    isAccessible: boolean;
    isDisconnected: boolean;
  };
}

export interface K8sAccessReviewResponse {
  kind: string;
  apiVersion: string;
  status?: {
    allowed?: boolean;
    denied?: boolean;
    reason?: string;
    evaluationError?: string;
  };
}

export class AccessReviewClient {
  constructor(protected readonly dependencies: AccessReviewClientDependencies) {}

  /**
   * Executes an AccessReview request (via SelfSubjectAccessReview or SubjectAccessReview).
   * Incorporates local evaluation results as matching rule evidence.
   * Hardened against multi-cluster race conditions, unverified local authorizations,
   * and indeterminate/malformed remote responses.
   */
  async reviewAccess(
    query: AccessReviewQuery,
    localResult?: LocalEvaluationResult,
  ): Promise<AccessReviewResult> {
    const timestamp = new Date().toISOString();
    const activeClusterId = this.dependencies.getActiveClusterId();
    const queryClusterId = query.clusterId ?? activeClusterId;

    // Pre-flight check: Active cluster identity and connection
    if (!activeClusterId) {
      return {
        verdict: "INDETERMINATE",
        allowed: false,
        origin: "fallback",
        reason: "No active cluster connected.",
        matchingEvidence: [],
        query,
        timestamp,
        clusterId: undefined,
        requestId: query.requestId,
        warnings: ["No active cluster connection available."],
      };
    }

    if (query.clusterId && query.clusterId !== activeClusterId) {
      return {
        verdict: "INDETERMINATE",
        allowed: false,
        origin: "fallback",
        reason: "Query cluster ID does not match currently active cluster.",
        matchingEvidence: [],
        query,
        timestamp,
        clusterId: activeClusterId,
        requestId: query.requestId,
        warnings: ["Cluster mismatch detected prior to execution."],
      };
    }

    // Pre-flight check: Cluster connection state (disconnected, accessible, online)
    if (this.dependencies.getClusterConnectionStatus) {
      const conn = this.dependencies.getClusterConnectionStatus();

      if (conn.isDisconnected || !conn.isAccessible || !conn.isOnline) {
        if (localResult && localResult.hasMatch) {
          return {
            verdict: "LOCAL_MATCH",
            allowed: false,
            origin: "local-analysis",
            reason: `Cluster connection unavailable (${conn.isDisconnected ? "disconnected" : (!conn.isAccessible ? "not accessible" : "offline")}). Action matched by local RBAC rules (unverified).`,
            matchingEvidence: localResult.evidence,
            query,
            timestamp,
            clusterId: queryClusterId,
            requestId: query.requestId,
            warnings: [
              `Cluster ${conn.isDisconnected ? "desconectado" : (!conn.isAccessible ? "inaccesible" : "fuera de línea")}: evidencia basada exclusivamente en definiciones locales en caché. NO VERIFICADA por el API server.`,
              ...(localResult.warnings || []),
            ],
          };
        }

        return {
          verdict: "INDETERMINATE",
          allowed: false,
          origin: "fallback",
          reason: `Cluster connection unavailable (${conn.isDisconnected ? "disconnected" : (!conn.isAccessible ? "not accessible" : "offline")}).`,
          matchingEvidence: [],
          query,
          timestamp,
          clusterId: queryClusterId,
          requestId: query.requestId,
          warnings: ["Cluster is disconnected, not accessible, or offline."],
        };
      }
    }

    // Pre-flight check: Query parameters validity
    if (query.identityType === "service-account" && !query.serviceAccount?.name) {
      return {
        verdict: "INDETERMINATE",
        allowed: false,
        origin: "fallback",
        reason: "ServiceAccount name is required for access review.",
        matchingEvidence: [],
        query,
        timestamp,
        clusterId: queryClusterId,
        requestId: query.requestId,
        warnings: ["Missing required field: serviceAccount.name"],
      };
    }

    if (query.identityType === "user" && !query.user?.username) {
      return {
        verdict: "INDETERMINATE",
        allowed: false,
        origin: "fallback",
        reason: "Username is required for access review.",
        matchingEvidence: [],
        query,
        timestamp,
        clusterId: queryClusterId,
        requestId: query.requestId,
        warnings: ["Missing required field: user.username"],
      };
    }

    const verb = query.nonResourceAttributes?.verb ?? query.resourceAttributes?.verb;

    if (!verb) {
      return {
        verdict: "INDETERMINATE",
        allowed: false,
        origin: "fallback",
        reason: "Verb is required for access review.",
        matchingEvidence: [],
        query,
        timestamp,
        clusterId: queryClusterId,
        requestId: query.requestId,
        warnings: ["Missing required field: verb"],
      };
    }

    const jsonApi = this.dependencies.getJsonApi();

    if (!jsonApi) {
      // Cluster disconnected / offline
      if (localResult && localResult.hasMatch) {
        return {
          verdict: "LOCAL_MATCH",
          allowed: false, // Critical: LOCAL_MATCH is NOT verified authorization
          origin: "local-analysis",
          reason: "Cluster API client unavailable (offline/disconnected). Action matched by local RBAC rules.",
          matchingEvidence: localResult.evidence,
          query,
          timestamp,
          clusterId: queryClusterId,
          requestId: query.requestId,
          warnings: [
            "Cluster desconectado: evidencia basada exclusivamente en definiciones locales en caché. NO VERIFICADA por el API server.",
            ...(localResult.warnings || []),
          ],
        };
      }

      return {
        verdict: "INSUFFICIENT_DATA",
        allowed: false,
        origin: "fallback",
        reason: "Cluster API client unavailable (disconnected) and no matching local RBAC rules found.",
        matchingEvidence: [],
        query,
        timestamp,
        clusterId: queryClusterId,
        requestId: query.requestId,
        warnings: ["Cluster disconnected"],
      };
    }

    try {
      let endpoint = "";
      let payload: Record<string, any> = {};

      const resourceAttributes = query.resourceAttributes ? {
        namespace: query.resourceAttributes.namespace || undefined,
        verb: query.resourceAttributes.verb,
        group: query.resourceAttributes.group ?? "",
        resource: query.resourceAttributes.resource,
        subresource: query.resourceAttributes.subresource || undefined,
        name: query.resourceAttributes.name || undefined,
      } : undefined;

      const nonResourceAttributes = query.nonResourceAttributes ? {
        path: query.nonResourceAttributes.path,
        verb: query.nonResourceAttributes.verb,
      } : undefined;

      if (query.identityType === "current-user") {
        endpoint = "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews";
        payload = {
          apiVersion: "authorization.k8s.io/v1",
          kind: "SelfSubjectAccessReview",
          spec: {
            resourceAttributes,
            nonResourceAttributes,
          },
        };
      } else if (query.identityType === "service-account") {
        const saNamespace = query.serviceAccount?.namespace || "default";
        const saName = query.serviceAccount?.name || "";
        const saUser = `system:serviceaccount:${saNamespace}:${saName}`;
        const saGroups = [
          "system:serviceaccounts",
          `system:serviceaccounts:${saNamespace}`,
          "system:authenticated",
        ];

        endpoint = "/apis/authorization.k8s.io/v1/subjectaccessreviews";
        payload = {
          apiVersion: "authorization.k8s.io/v1",
          kind: "SubjectAccessReview",
          spec: {
            user: saUser,
            groups: saGroups,
            resourceAttributes,
            nonResourceAttributes,
          },
        };
      } else if (query.identityType === "user") {
        const username = query.user?.username || "";
        const userGroups = query.user?.groups && query.user.groups.length > 0
          ? query.user.groups
          : ["system:authenticated"];

        endpoint = "/apis/authorization.k8s.io/v1/subjectaccessreviews";
        payload = {
          apiVersion: "authorization.k8s.io/v1",
          kind: "SubjectAccessReview",
          spec: {
            user: username,
            groups: userGroups,
            resourceAttributes,
            nonResourceAttributes,
          },
        };
      }

      // Execute POST request to authorization.k8s.io/v1 review endpoint
      const response = await jsonApi.post(endpoint, { data: payload }) as K8sAccessReviewResponse;

      // Cluster switch protection: discard response if active cluster changed during call
      const postActiveClusterId = this.dependencies.getActiveClusterId();

      if (queryClusterId && postActiveClusterId && queryClusterId !== postActiveClusterId) {
        return {
          verdict: "INDETERMINATE",
          allowed: false,
          origin: "fallback",
          reason: "Cluster context changed during review execution.",
          matchingEvidence: [],
          query,
          timestamp,
          clusterId: postActiveClusterId,
          requestId: query.requestId,
          warnings: ["Review cancelled due to active cluster switch."],
        };
      }

      // Discard late response if cluster disconnected while in flight
      if (this.dependencies.getClusterConnectionStatus) {
        const postConn = this.dependencies.getClusterConnectionStatus();

        if (postConn.isDisconnected || !postConn.isAccessible || !postConn.isOnline) {
          return {
            verdict: "INDETERMINATE",
            allowed: false,
            origin: "fallback",
            reason: "Cluster connection was lost during review execution.",
            matchingEvidence: [],
            query,
            timestamp,
            clusterId: queryClusterId,
            requestId: query.requestId,
            warnings: ["Review cancelled: cluster connection was lost in flight."],
          };
        }
      }

      // Malformed response check
      if (!response || typeof response !== "object" || !response.status || typeof response.status !== "object") {
        return {
          verdict: "INDETERMINATE",
          allowed: false,
          origin: "api-server",
          reason: "K8s API server returned malformed AccessReview response (missing status object).",
          matchingEvidence: localResult?.evidence ?? [],
          query,
          timestamp,
          clusterId: queryClusterId,
          requestId: query.requestId,
          warnings: ["Malformed response from authorization endpoint."],
        };
      }

      const status = response.status;

      if (status.evaluationError) {
        return {
          verdict: "INDETERMINATE",
          allowed: false,
          origin: "api-server",
          evaluationError: status.evaluationError,
          reason: `Evaluation error: ${status.evaluationError}`,
          matchingEvidence: localResult?.evidence ?? [],
          query,
          timestamp,
          clusterId: queryClusterId,
          requestId: query.requestId,
        };
      }

      // In Kubernetes authorization, status.allowed must be explicitly boolean
      if (typeof status.allowed !== "boolean") {
        return {
          verdict: "INDETERMINATE",
          allowed: false,
          origin: "api-server",
          reason: "K8s API server response lacks a conclusive 'allowed' boolean field.",
          matchingEvidence: localResult?.evidence ?? [],
          query,
          timestamp,
          clusterId: queryClusterId,
          requestId: query.requestId,
          warnings: ["Inconclusive API response: status.allowed is undefined or non-boolean."],
        };
      }

      if (status.allowed === true) {
        return {
          verdict: "ALLOWED_API",
          allowed: true,
          origin: "api-server",
          reason: status.reason || "Allowed by Kubernetes API server authorization engine.",
          matchingEvidence: localResult?.evidence ?? [],
          query,
          timestamp,
          clusterId: queryClusterId,
          requestId: query.requestId,
        };
      }

      // status.allowed === false
      return {
        verdict: "DENIED_API",
        allowed: false,
        origin: "api-server",
        reason: status.reason || (status.denied ? "Explicitly denied by authorization webhook or policy." : "No rule allows this action in the Kubernetes API server."),
        matchingEvidence: localResult?.evidence ?? [],
        query,
        timestamp,
        clusterId: queryClusterId,
        requestId: query.requestId,
      };

    } catch (error: any) {
      // Cluster switch check on error
      const postActiveClusterId = this.dependencies.getActiveClusterId();

      if (queryClusterId && postActiveClusterId && queryClusterId !== postActiveClusterId) {
        return {
          verdict: "INDETERMINATE",
          allowed: false,
          origin: "fallback",
          reason: "Cluster context changed during review execution.",
          matchingEvidence: [],
          query,
          timestamp,
          clusterId: postActiveClusterId,
          requestId: query.requestId,
        };
      }

      // Check if cluster was disconnected during call failure
      if (this.dependencies.getClusterConnectionStatus) {
        const postConn = this.dependencies.getClusterConnectionStatus();

        if (postConn.isDisconnected || !postConn.isAccessible || !postConn.isOnline) {
          return {
            verdict: "INDETERMINATE",
            allowed: false,
            origin: "fallback",
            reason: "Cluster connection was lost during review execution.",
            matchingEvidence: [],
            query,
            timestamp,
            clusterId: queryClusterId,
            requestId: query.requestId,
            warnings: ["Review cancelled: cluster connection was lost in flight."],
          };
        }
      }

      // Check if error is HTTP 403 Forbidden (operator lacks permission to create SubjectAccessReviews)
      const is403 =
        error?.error?.code === 403 ||
        error?.status === 403 ||
        error?.statusCode === 403 ||
        String(error?.message || error).includes("403") ||
        String(error?.message || error).toLowerCase().includes("forbidden");

      if (is403) {
        if (localResult && localResult.hasMatch) {
          return {
            verdict: "LOCAL_MATCH",
            allowed: false, // Critical: LOCAL_MATCH is NOT verified authorization
            origin: "local-analysis",
            reason: "API server returned HTTP 403 (insufficient permissions to create SubjectAccessReview). Action matched by local RBAC rules.",
            matchingEvidence: localResult.evidence,
            query,
            timestamp,
            clusterId: queryClusterId,
            requestId: query.requestId,
            warnings: [
              "Sin permisos para verificar vía API server (RBAC 403). Evidencia inferida por análisis de reglas locales. NO VERIFICADA por el clúster.",
              ...(localResult.warnings || []),
            ],
          };
        }

        return {
          verdict: "INSUFFICIENT_DATA",
          allowed: false,
          origin: "fallback",
          reason: "Sin permisos para verificar vía API server (RBAC 403) y sin reglas locales coincidentes.",
          matchingEvidence: [],
          query,
          timestamp,
          clusterId: queryClusterId,
          requestId: query.requestId,
          warnings: [
            "Sin permisos para verificar vía API server (RBAC 403). La cuenta actual no puede crear SubjectAccessReviews.",
          ],
        };
      }

      // Any other unexpected error (network error, timeout, disconnect)
      return {
        verdict: "INDETERMINATE",
        allowed: false,
        origin: "fallback",
        reason: `Failed to execute AccessReview: ${error?.message || error}`,
        evaluationError: String(error?.message || error),
        matchingEvidence: localResult?.evidence ?? [],
        query,
        timestamp,
        clusterId: queryClusterId,
        requestId: query.requestId,
        warnings: [String(error?.message || error)],
      };
    }
  }
}
