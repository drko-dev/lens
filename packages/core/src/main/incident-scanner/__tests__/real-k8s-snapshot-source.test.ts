/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { RealK8sSnapshotSource, type RealK8sHttpClient } from "../real-k8s-snapshot-source";

describe("H8.8-04b: RealK8sSnapshotSource Integration & Security Invariants", () => {
  const testClusterId = "prod-cluster-central";
  const testNamespace = "billing-system";

  let mockHttpClient: RealK8sHttpClient;
  let source: RealK8sSnapshotSource;

  beforeEach(() => {
    mockHttpClient = {
      get: jest.fn().mockImplementation(async (url: string) => {
        if (url.includes("/pods")) {
          return {
            items: [
              {
                apiVersion: "v1",
                kind: "Pod",
                metadata: { name: "billing-api-123", namespace: testNamespace },
                status: { phase: "Running" },
              },
            ],
          };
        }
        if (url.includes("/deployments")) {
          return {
            items: [
              {
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: { name: "billing-api", namespace: testNamespace },
                status: { readyReplicas: 1, replicas: 1 },
              },
            ],
          };
        }
        if (url.includes("/events")) {
          return {
            items: [
              {
                apiVersion: "v1",
                kind: "Event",
                metadata: { name: "billing-api-event", namespace: testNamespace },
                reason: "Started",
                type: "Normal",
              },
            ],
          };
        }
        return { items: [] };
      }),
    };

    source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: testClusterId,
      proxyUrlResolver: () => `https://127.0.0.1:54321/api-prefix`,
      httpClient: mockHttpClient,
    });
  });

  afterEach(() => {
    source.dispose();
  });

  describe("1. Default Fail-Closed Policy & Zero Live Watchers", () => {
    it("fails closed by default when isRealK8sAuthorized is false", async () => {
      const unauthorizedSource = new RealK8sSnapshotSource({
        authorizedClusterId: testClusterId,
        httpClient: mockHttpClient,
      });

      await expect(
        unauthorizedSource.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
        }),
      ).rejects.toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);
    });

    it("strictly forbids live or streaming watchers ('watch')", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          requestedVerb: "watch" as any,
        }),
      ).rejects.toThrow(/WATCHERS_FORBIDDEN/);
    });

    it("strictly forbids write or mutation verbs (create, delete, patch)", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          requestedVerb: "delete" as any,
        }),
      ).rejects.toThrow(/FORBIDDEN_VERB/);
    });
  });

  describe("2. Strict Cluster Isolation & Namespace Scope", () => {
    it("denies collection when scope clusterId mismatches authorized live cluster", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: "rogue-malicious-cluster", namespace: testNamespace },
        }),
      ).rejects.toThrow(/CLUSTER_SCOPE_VIOLATION/);
    });

    it("denies cross-cluster targetClusterId spoofing", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          targetClusterId: "other-cluster",
        }),
      ).rejects.toThrow(/CLUSTER_SCOPE_VIOLATION/);
    });

    it("denies cross-namespace targetNamespace violation", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          targetNamespace: "kube-system",
        }),
      ).rejects.toThrow(/NAMESPACE_SCOPE_VIOLATION/);
    });
  });

  describe("3. Forbidden Resources, Secrets and Subresources", () => {
    it("strictly blocks attempting to request Secrets or ServiceAccounts", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          requestedResources: ["secrets" as any],
        }),
      ).rejects.toThrow(/FORBIDDEN_RESOURCE/);

      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          requestedResources: ["serviceaccounts" as any],
        }),
      ).rejects.toThrow(/FORBIDDEN_RESOURCE/);
    });

    it("strictly blocks subresources like exec, attach, port-forward, proxy", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          requestedSubresource: "exec",
        }),
      ).rejects.toThrow(/FORBIDDEN_SUBRESOURCE/);
    });
  });

  describe("4. Loopback Proxy Enforcement & Point-in-Time Collection", () => {
    it("refuses to connect if proxy URL resolves outside 127.0.0.1 loopback", async () => {
      const externalProxySource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        proxyUrlResolver: () => "https://api.external-cloud.com:6443",
        httpClient: mockHttpClient,
      });

      await expect(
        externalProxySource.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
        }),
      ).rejects.toThrow(/does not point to local loopback/);
    });

    it("successfully collects snapshot over loopback proxy with scope filtering", async () => {
      const envelope = await source.collectSnapshot({
        scope: { clusterId: testClusterId, namespace: testNamespace },
        requestedResources: ["pods", "deployments", "events"],
      });

      expect(envelope.sourceType).toBe("real_k8s_snapshot_source");
      expect(envelope.isSyntheticSimulation).toBe(false);
      expect(envelope.clusterId).toBe(testClusterId);
      expect(envelope.namespace).toBe(testNamespace);
      expect(envelope.snapshot.pods).toHaveLength(1);
      expect(envelope.snapshot.workloads).toHaveLength(1);
      expect(envelope.snapshot.events).toHaveLength(1);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(3);
    });

    it("filters out resources whose metadata.namespace does not match authorized scope", async () => {
      const mismatchedHttpClient: RealK8sHttpClient = {
        get: jest.fn().mockResolvedValue({
          items: [
            { kind: "Pod", metadata: { name: "good-pod", namespace: testNamespace } },
            { kind: "Pod", metadata: { name: "leaked-pod", namespace: "kube-system" } },
          ],
        }),
      };

      const filterSource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        httpClient: mismatchedHttpClient,
      });

      const envelope = await filterSource.collectSnapshot({
        scope: { clusterId: testClusterId, namespace: testNamespace },
        requestedResources: ["pods"],
      });

      expect(envelope.snapshot.pods).toBeDefined();
      expect(envelope.snapshot.pods).toHaveLength(1);
      expect(envelope.snapshot.pods![0].metadata.name).toBe("good-pod");
    });
  });

  describe("5. Cancellation, Timeouts & Resource Disposal", () => {
    it("aborts promptly when AbortSignal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          signal: controller.signal,
        }),
      ).rejects.toThrow(/OPERATION_ABORTED/);

      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it("aborts in-flight operations when signal triggers mid-flight", async () => {
      const controller = new AbortController();
      const slowHttpClient: RealK8sHttpClient = {
        get: jest.fn().mockImplementation(async (_url, opts) => {
          return new Promise((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () => {
              reject(new Error("aborted"));
            });
          });
        }),
      };

      const slowSource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        httpClient: slowHttpClient,
      });

      const promise = slowSource.collectSnapshot({
        scope: { clusterId: testClusterId, namespace: testNamespace },
        signal: controller.signal,
      });

      setTimeout(() => controller.abort(), 20);

      await expect(promise).rejects.toThrow(/OPERATION_ABORTED/);
    });

    it("disposes cleanly and refuses further snapshot collections", async () => {
      source.dispose();

      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
        }),
      ).rejects.toThrow(/RealK8sSnapshotSource has been disposed/);

      expect(() => source.authorizeLiveCluster(testClusterId)).toThrow(/disposed/);
    });
  });
});
