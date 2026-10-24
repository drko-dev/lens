/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { AccessReviewClient } from "../access-review-client";
import type { AccessReviewQuery, LocalEvaluationResult } from "../types";

describe("AccessReviewClient", () => {
  let mockPost: jest.Mock;
  let activeClusterId: string | undefined;
  let client: AccessReviewClient;

  beforeEach(() => {
    mockPost = jest.fn();
    activeClusterId = "cluster-test-123";

    client = new AccessReviewClient({
      getJsonApi: () => ({
        post: mockPost,
      } as any),
      getActiveClusterId: () => activeClusterId,
    });
  });

  describe("Pre-flight checks and Multi-cluster hardening", () => {
    it("returns INDETERMINATE when no active cluster is connected", async () => {
      activeClusterId = undefined;
      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: { verb: "get", resource: "pods" },
      };

      const result = await client.reviewAccess(query);

      expect(result.verdict).toBe("INDETERMINATE");
      expect(result.allowed).toBe(false);
      expect(result.warnings?.[0]).toContain("No active cluster");
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("returns INDETERMINATE when query clusterId mismatches active cluster", async () => {
      const query: AccessReviewQuery = {
        identityType: "current-user",
        clusterId: "different-cluster-id",
        resourceAttributes: { verb: "get", resource: "pods" },
      };

      const result = await client.reviewAccess(query);

      expect(result.verdict).toBe("INDETERMINATE");
      expect(result.allowed).toBe(false);
      expect(result.warnings?.[0]).toContain("Cluster mismatch");
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("returns INDETERMINATE when required query fields are missing (verb or SA name)", async () => {
      const missingVerbQuery: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: { verb: "", resource: "pods" },
      };

      const res1 = await client.reviewAccess(missingVerbQuery);

      expect(res1.verdict).toBe("INDETERMINATE");
      expect(res1.warnings?.[0]).toContain("Missing required field: verb");

      const missingSaQuery: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "", namespace: "default" },
        resourceAttributes: { verb: "get", resource: "pods" },
      };

      const res2 = await client.reviewAccess(missingSaQuery);

      expect(res2.verdict).toBe("INDETERMINATE");
      expect(res2.warnings?.[0]).toContain("Missing required field: serviceAccount.name");
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("returns LOCAL_MATCH with allowed: false when disconnected but local rules match", async () => {
      client = new AccessReviewClient({
        getJsonApi: () => undefined, // Disconnected
        getActiveClusterId: () => "cluster-offline-1",
      });

      const localResult: LocalEvaluationResult = {
        hasMatch: true,
        isPartial: false,
        evidence: [
          {
            bindingName: "cached-binding",
            bindingKind: "RoleBinding",
            roleRefKind: "Role",
            roleRefName: "cached-role",
            matchedRule: { verbs: ["get"], resources: ["pods"] },
            scopeDescription: "cached",
          },
        ],
      };

      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: { verb: "get", resource: "pods" },
      };

      const result = await client.reviewAccess(query, localResult);

      expect(result.verdict).toBe("LOCAL_MATCH");
      expect(result.allowed).toBe(false); // Critical: unverified local evidence is NOT allowed
      expect(result.origin).toBe("local-analysis");
      expect(result.matchingEvidence.length).toBe(1);
      expect(result.warnings?.[0]).toContain("NO VERIFICADA");
    });
  });

  describe("SelfSubjectAccessReview (current user)", () => {
    it("calls /apis/authorization.k8s.io/v1/selfsubjectaccessreviews and returns ALLOWED_API when status.allowed is true", async () => {
      mockPost.mockResolvedValueOnce({
        kind: "SelfSubjectAccessReview",
        apiVersion: "authorization.k8s.io/v1",
        status: {
          allowed: true,
          reason: "RBAC cluster-admin rule allowed",
        },
      });

      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: {
          verb: "get",
          group: "",
          resource: "secrets",
          namespace: "default",
        },
      };

      const result = await client.reviewAccess(query);

      expect(mockPost).toHaveBeenCalledWith(
        "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews",
        {
          data: {
            apiVersion: "authorization.k8s.io/v1",
            kind: "SelfSubjectAccessReview",
            spec: {
              resourceAttributes: {
                namespace: "default",
                verb: "get",
                group: "",
                resource: "secrets",
                subresource: undefined,
                name: undefined,
              },
              nonResourceAttributes: undefined,
            },
          },
        },
      );

      expect(result.verdict).toBe("ALLOWED_API");
      expect(result.allowed).toBe(true);
      expect(result.origin).toBe("api-server");
      expect(result.reason).toContain("RBAC cluster-admin");
    });

    it("returns DENIED_API when status.allowed is false", async () => {
      mockPost.mockResolvedValueOnce({
        kind: "SelfSubjectAccessReview",
        apiVersion: "authorization.k8s.io/v1",
        status: {
          allowed: false,
          denied: false,
          reason: "User cannot get secrets in default",
        },
      });

      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: {
          verb: "get",
          group: "",
          resource: "secrets",
          namespace: "default",
        },
      };

      const result = await client.reviewAccess(query);

      expect(result.verdict).toBe("DENIED_API");
      expect(result.allowed).toBe(false);
      expect(result.origin).toBe("api-server");
    });

    it("returns DENIED_API with explicit webhook denial when status.denied is true", async () => {
      mockPost.mockResolvedValueOnce({
        kind: "SelfSubjectAccessReview",
        apiVersion: "authorization.k8s.io/v1",
        status: {
          allowed: false,
          denied: true,
          reason: "Denied by admission webhook policy",
        },
      });

      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: { verb: "delete", group: "", resource: "namespaces" },
      };

      const result = await client.reviewAccess(query);

      expect(result.verdict).toBe("DENIED_API");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Denied by admission webhook");
    });

    it("returns INDETERMINATE when status has evaluationError", async () => {
      mockPost.mockResolvedValueOnce({
        kind: "SelfSubjectAccessReview",
        apiVersion: "authorization.k8s.io/v1",
        status: {
          allowed: false,
          evaluationError: "webhook timeout",
        },
      });

      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: { verb: "list", group: "", resource: "pods" },
      };

      const result = await client.reviewAccess(query);

      expect(result.verdict).toBe("INDETERMINATE");
      expect(result.evaluationError).toBe("webhook timeout");
    });

    it("returns INDETERMINATE when status.allowed is absent or non-boolean", async () => {
      mockPost.mockResolvedValueOnce({
        kind: "SelfSubjectAccessReview",
        apiVersion: "authorization.k8s.io/v1",
        status: {
          reason: "Unknown condition",
          // allowed is absent
        },
      });

      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: { verb: "get", resource: "pods" },
      };

      const result = await client.reviewAccess(query);

      expect(result.verdict).toBe("INDETERMINATE");
      expect(result.allowed).toBe(false);
      expect(result.warnings?.[0]).toContain("Inconclusive API response");
    });

    it("returns INDETERMINATE when response is malformed or missing status", async () => {
      mockPost.mockResolvedValueOnce({
        kind: "SelfSubjectAccessReview",
        apiVersion: "authorization.k8s.io/v1",
        // status is completely absent
      });

      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: { verb: "get", resource: "pods" },
      };

      const result = await client.reviewAccess(query);

      expect(result.verdict).toBe("INDETERMINATE");
      expect(result.allowed).toBe(false);
      expect(result.warnings?.[0]).toContain("Malformed response");
    });
  });

  describe("SubjectAccessReview (ServiceAccount and User)", () => {
    it("formats ServiceAccount username as system:serviceaccount:<ns>:<name> with canonical groups", async () => {
      mockPost.mockResolvedValueOnce({
        kind: "SubjectAccessReview",
        apiVersion: "authorization.k8s.io/v1",
        status: { allowed: true },
      });

      const query: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "my-app", namespace: "backend" },
        resourceAttributes: { verb: "create", group: "apps", resource: "deployments", namespace: "backend" },
      };

      await client.reviewAccess(query);

      expect(mockPost).toHaveBeenCalledWith(
        "/apis/authorization.k8s.io/v1/subjectaccessreviews",
        {
          data: {
            apiVersion: "authorization.k8s.io/v1",
            kind: "SubjectAccessReview",
            spec: {
              user: "system:serviceaccount:backend:my-app",
              groups: [
                "system:serviceaccounts",
                "system:serviceaccounts:backend",
                "system:authenticated",
              ],
              resourceAttributes: {
                namespace: "backend",
                verb: "create",
                group: "apps",
                resource: "deployments",
                subresource: undefined,
                name: undefined,
              },
              nonResourceAttributes: undefined,
            },
          },
        },
      );
    });

    it("handles HTTP 403 gracefully with LOCAL_MATCH fallback and allowed: false", async () => {
      mockPost.mockRejectedValueOnce({
        error: { code: 403, message: "User cannot create SubjectAccessReview" },
      });

      const query: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "my-app", namespace: "backend" },
        resourceAttributes: { verb: "get", group: "", resource: "pods", namespace: "backend" },
      };

      const localResult: LocalEvaluationResult = {
        hasMatch: true,
        isPartial: false,
        evidence: [
          {
            bindingName: "backend-pod-reader",
            bindingKind: "RoleBinding",
            bindingNamespace: "backend",
            roleRefKind: "Role",
            roleRefName: "pod-reader",
            matchedRule: { verbs: ["get"], resources: ["pods"] },
            scopeDescription: "Namespace 'backend'",
          },
        ],
      };

      const result = await client.reviewAccess(query, localResult);

      expect(result.verdict).toBe("LOCAL_MATCH");
      expect(result.allowed).toBe(false); // Crucial: NOT allowed without API verification
      expect(result.origin).toBe("local-analysis");
      expect(result.matchingEvidence.length).toBe(1);
      expect(result.warnings?.[0]).toContain("NO VERIFICADA");
    });

    it("handles HTTP 403 gracefully with INSUFFICIENT_DATA when local rules do not match", async () => {
      mockPost.mockRejectedValueOnce({
        status: 403,
        message: "Forbidden",
      });

      const query: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "unknown-sa", namespace: "backend" },
        resourceAttributes: { verb: "delete", group: "", resource: "secrets", namespace: "backend" },
      };

      const localResult: LocalEvaluationResult = {
        hasMatch: false,
        isPartial: true,
        evidence: [],
      };

      const result = await client.reviewAccess(query, localResult);

      expect(result.verdict).toBe("INSUFFICIENT_DATA");
      expect(result.allowed).toBe(false);
      expect(result.origin).toBe("fallback");
      expect(result.warnings?.[0]).toContain("RBAC 403");
    });

    it("handles network error / timeout returning INDETERMINATE", async () => {
      mockPost.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:6443"));

      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: { verb: "get", resource: "pods" },
      };

      const result = await client.reviewAccess(query);

      expect(result.verdict).toBe("INDETERMINATE");
      expect(result.allowed).toBe(false);
      expect(result.warnings?.[0]).toContain("ECONNREFUSED");
    });
  });

  describe("Active Cluster Switch Protection", () => {
    it("discards late asynchronous response if active cluster changed in-flight", async () => {
      mockPost.mockImplementation(async () => {
        // Simulate cluster switch while request is pending
        activeClusterId = "new-cluster-456";

        return {
          kind: "SelfSubjectAccessReview",
          apiVersion: "authorization.k8s.io/v1",
          status: { allowed: true },
        };
      });

      const query: AccessReviewQuery = {
        identityType: "current-user",
        clusterId: "cluster-test-123",
        resourceAttributes: { verb: "get", group: "", resource: "pods" },
      };

      const result = await client.reviewAccess(query);

      expect(result.verdict).toBe("INDETERMINATE");
      expect(result.origin).toBe("fallback");
      expect(result.warnings?.[0]).toContain("cluster switch");
    });
  });

  describe("Real Cluster Connection Validation (disconnected, online, accessible)", () => {
    it("pre-flight: returns INDETERMINATE when connection status reports disconnected", async () => {
      const connClient = new AccessReviewClient({
        getJsonApi: () => ({ post: mockPost } as any),
        getActiveClusterId: () => "cluster-conn-1",
        getClusterConnectionStatus: () => ({
          isDisconnected: true,
          isAccessible: false,
          isOnline: false,
        }),
      });

      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: { verb: "get", resource: "pods" },
      };

      const result = await connClient.reviewAccess(query);

      expect(result.verdict).toBe("INDETERMINATE");
      expect(result.allowed).toBe(false);
      expect(result.warnings?.[0]).toContain("disconnected");
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("pre-flight: returns LOCAL_MATCH (unverified, allowed: false) when disconnected but local rules match", async () => {
      const connClient = new AccessReviewClient({
        getJsonApi: () => ({ post: mockPost } as any),
        getActiveClusterId: () => "cluster-conn-1",
        getClusterConnectionStatus: () => ({
          isDisconnected: true,
          isAccessible: false,
          isOnline: false,
        }),
      });

      const query: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "test-sa", namespace: "default" },
        resourceAttributes: { verb: "get", resource: "pods", namespace: "default" },
      };

      const localResult: LocalEvaluationResult = {
        hasMatch: true,
        isPartial: false,
        evidence: [
          {
            bindingName: "rb-1",
            bindingKind: "RoleBinding",
            roleRefKind: "Role",
            roleRefName: "pod-reader",
            matchedRule: { verbs: ["get"], resources: ["pods"] },
            scopeDescription: "default",
          },
        ],
      };

      const result = await connClient.reviewAccess(query, localResult);

      expect(result.verdict).toBe("LOCAL_MATCH");
      expect(result.allowed).toBe(false);
      expect(result.origin).toBe("local-analysis");
      expect(result.warnings?.[0]).toContain("desconectado");
      expect(mockPost).not.toHaveBeenCalled();
    });

    it("post-flight: discards late response when cluster connection becomes disconnected while in flight", async () => {
      let isDisconnected = false;

      const connClient = new AccessReviewClient({
        getJsonApi: () => ({ post: mockPost } as any),
        getActiveClusterId: () => "cluster-conn-1",
        getClusterConnectionStatus: () => ({
          isDisconnected,
          isAccessible: !isDisconnected,
          isOnline: !isDisconnected,
        }),
      });

      mockPost.mockImplementation(async () => {
        // Connection lost while waiting for response
        isDisconnected = true;

        return {
          kind: "SelfSubjectAccessReview",
          apiVersion: "authorization.k8s.io/v1",
          status: { allowed: true },
        };
      });

      const query: AccessReviewQuery = {
        identityType: "current-user",
        resourceAttributes: { verb: "get", resource: "pods" },
      };

      const result = await connClient.reviewAccess(query);

      expect(result.verdict).toBe("INDETERMINATE");
      expect(result.origin).toBe("fallback");
      expect(result.warnings?.[0]).toContain("cluster connection was lost in flight");
    });
  });
});
