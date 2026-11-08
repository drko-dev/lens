/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { SnapshotUserSubject } from "../../../common/incident/local-scanner-types";
import { RealK8sSnapshotSource, type RealK8sHttpClient } from "../real-k8s-snapshot-source";
import { FakeK8sSnapshotSource } from "../fake-k8s-snapshot-source";
import type { SnapshotBrokerAuthorizationContract } from "../snapshot-source";

describe("H8.8-04b & R1: RealK8sSnapshotSource Security Hardening", () => {
  const testClusterId = "prod-cluster-central";
  const testNamespace = "billing-system";

  const validAuthenticatedUser: SnapshotUserSubject = {
    username: "alice@acme.corp",
    groups: ["system:authenticated", "devops-leads"],
    isAuthenticated: true,
  };

  let mockHttpClient: RealK8sHttpClient;
  let mockBrokerContract: SnapshotBrokerAuthorizationContract;
  let mockBrokerSessionResolver: jest.Mock;
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

    mockBrokerContract = {
      authorizeResourceRead: jest.fn().mockResolvedValue(undefined),
    };

    mockBrokerSessionResolver = jest.fn().mockReturnValue("broker-session-xyz-123");

    source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: testClusterId,
      proxyUrlResolver: () => `https://127.0.0.1:54321/api-prefix`,
      httpClient: mockHttpClient,
      brokerContract: mockBrokerContract,
      brokerSessionIdResolver: mockBrokerSessionResolver,
    });
  });

  afterEach(() => {
    source.dispose();
  });

  describe("R1-01: Strict Loopback Proxy Validation & Redirection Protection", () => {
    it("rejects malicious domain containing 127.0.0.1 substring (127.0.0.1.evil.example)", async () => {
      const badProxySource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        proxyUrlResolver: () => "https://127.0.0.1.evil.example:6443",
        httpClient: mockHttpClient,
        brokerContract: mockBrokerContract,
        brokerSessionIdResolver: mockBrokerSessionResolver,
      });

      await expect(
        badProxySource.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/hostname must be literal '127.0.0.1'/);
    });

    it("rejects external host containing 127.0.0.1 in pathname (https://external.example/127.0.0.1)", async () => {
      const badProxySource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        proxyUrlResolver: () => "https://external.example/127.0.0.1",
        httpClient: mockHttpClient,
        brokerContract: mockBrokerContract,
        brokerSessionIdResolver: mockBrokerSessionResolver,
      });

      await expect(
        badProxySource.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/hostname must be literal '127.0.0.1'/);
    });

    it("rejects localhost subdomains (https://localhost.evil.example)", async () => {
      const badProxySource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        proxyUrlResolver: () => "https://localhost.evil.example:6443",
        httpClient: mockHttpClient,
        brokerContract: mockBrokerContract,
        brokerSessionIdResolver: mockBrokerSessionResolver,
      });

      await expect(
        badProxySource.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/hostname must be literal '127.0.0.1'/);
    });

    it("rejects insecure HTTP protocol even when directed to 127.0.0.1", async () => {
      const insecureHttpSource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        proxyUrlResolver: () => "http://127.0.0.1:8080",
        httpClient: mockHttpClient,
        brokerContract: mockBrokerContract,
        brokerSessionIdResolver: mockBrokerSessionResolver,
      });

      await expect(
        insecureHttpSource.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/protocol must be 'https:'/);
    });

    it("rejects embedded credentials (userinfo) in proxy URL", async () => {
      const userinfoSource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        proxyUrlResolver: () => "https://admin:supersecret@127.0.0.1:6443",
        httpClient: mockHttpClient,
        brokerContract: mockBrokerContract,
        brokerSessionIdResolver: mockBrokerSessionResolver,
      });

      await expect(
        userinfoSource.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/Embedded credentials/);
    });

    it("rejects invalid or out-of-range ports in proxy URL", async () => {
      const badPortSource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        proxyUrlResolver: () => "https://127.0.0.1:70000",
        httpClient: mockHttpClient,
        brokerContract: mockBrokerContract,
        brokerSessionIdResolver: mockBrokerSessionResolver,
      });

      await expect(
        badPortSource.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/Invalid port/);
    });

    it("passes anti-redirection options (redirect: error, followRedirects: false) to httpClient", async () => {
      await source.collectSnapshot({
        scope: { clusterId: testClusterId, namespace: testNamespace },
        user: validAuthenticatedUser,
        requestedResources: ["pods"],
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringMatching(/^https:\/\/127\.0\.0\.1:54321\/api-prefix\/api\/v1\/namespaces\/billing-system\/pods/),
        expect.objectContaining({
          redirect: "error",
          followRedirects: false,
          maxRedirects: 0,
        }),
      );
    });
  });

  describe("R1-02: Strict Kubernetes Namespace Validation & Scope Control", () => {
    it("rejects path traversal attempts such as 'default/../../secrets'", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: "default/../../secrets" },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/NAMESPACE_SCOPE_VIOLATION/);

      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it("rejects namespaces with uppercase letters violating RFC 1123 DNS label format", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: "Billing-System" },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/must conform to Kubernetes RFC 1123 DNS label format/);
    });

    it("rejects namespaces exceeding maximum 63 characters", async () => {
      const longNamespace = "a".repeat(64);
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: longNamespace },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/exceeds maximum allowed length of 63 characters/);
    });

    it("rejects namespaces with separators or control characters", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: "billing\\system" },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/forbidden path traversal, separator/);

      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: "billing%2fsystem" },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/forbidden path traversal, separator/);
    });

    it("refuses cluster-wide scope ('*') without explicit authorization", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: "*" },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/Cluster-wide namespace access \('\*'\) is not authorized/);
    });

    it("encodes valid namespace route segments cleanly", async () => {
      await source.collectSnapshot({
        scope: { clusterId: testClusterId, namespace: "billing-system" },
        user: validAuthenticatedUser,
        requestedResources: ["pods"],
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        "https://127.0.0.1:54321/api-prefix/api/v1/namespaces/billing-system/pods",
        expect.anything(),
      );
    });
  });

  describe("R1-03: Mandatory Authenticated Identity & Double-Identity Broker Authorization", () => {
    it("strictly rejects missing user subject", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
        }),
      ).rejects.toThrow(/requires an authenticated, verified user identity/);
    });

    it("strictly rejects fallback to synthetic operator ('local-synthetic-operator')", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: { username: "local-synthetic-operator", isAuthenticated: true },
        }),
      ).rejects.toThrow(/strictly forbid synthetic operator fallback/);
    });

    it("strictly rejects unauthenticated renderer identity (isAuthenticated !== true)", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: { username: "alice@acme.corp", isAuthenticated: false },
        }),
      ).rejects.toThrow(/isAuthenticated must be true/);

      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: { username: "alice@acme.corp" },
        }),
      ).rejects.toThrow(/isAuthenticated must be true/);
    });

    it("strictly fails closed when broker authorization is missing", async () => {
      const noBrokerSource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        httpClient: mockHttpClient,
      });

      await expect(
        noBrokerSource.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/strictly requires a complete Broker authorization contract/);
    });

    it("evaluates double-identity authorization per resource through Broker and aborts before HTTP requests if denied", async () => {
      (mockBrokerContract.authorizeResourceRead as jest.Mock).mockRejectedValueOnce(
        new Error("RBAC: Technical ServiceAccount lacks get permission on deployments"),
      );

      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
          requestedResources: ["deployments"],
        }),
      ).rejects.toThrow(/Technical ServiceAccount lacks get permission/);

      expect(mockHttpClient.get).not.toHaveBeenCalled();
    });

    it("keeps FakeK8sSnapshotSource independent in pure offline synthetic mode", async () => {
      const fakeSource = new FakeK8sSnapshotSource();
      const fakeEnvelope = await fakeSource.collectSnapshot({
        scope: { clusterId: "any-synthetic-cluster", namespace: "default" },
      });

      expect(fakeEnvelope.sourceType).toBe("fake_k8s_snapshot_source");
      expect(fakeEnvelope.isSyntheticSimulation).toBe(true);
      expect(fakeEnvelope.user.username).toBe("local-synthetic-operator");
    });
  });

  describe("R1-04: Authorization Revocation & Late Async Response Rejection", () => {
    it("strictly rejects late HTTP response with OPERATION_ABORTED when authorization is revoked mid-flight (ignoring AbortSignal)", async () => {
      let triggerLateHttpResolve: (data: any) => void = () => {};

      const lateResolvingHttpClient: RealK8sHttpClient = {
        get: jest.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            triggerLateHttpResolve = resolve;
          });
        }),
      };

      const revocableSource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        httpClient: lateResolvingHttpClient,
        brokerContract: mockBrokerContract,
        brokerSessionIdResolver: mockBrokerSessionResolver,
      });

      // Start snapshot collection - HTTP request is now pending
      const collectionPromise = revocableSource.collectSnapshot({
        scope: { clusterId: testClusterId, namespace: testNamespace },
        user: validAuthenticatedUser,
        requestedResources: ["pods"],
      });

      // Operator revokes authorization while HTTP request is in-flight
      revocableSource.revokeLiveAuthorization();

      // Malicious or stubborn HTTP client resolves late, ignoring AbortSignal
      triggerLateHttpResolve({
        items: [
          { kind: "Pod", metadata: { name: "leaked-after-revocation", namespace: testNamespace } },
        ],
      });

      // MUST fail with OPERATION_ABORTED, NEVER succeed
      await expect(collectionPromise).rejects.toThrow(/OPERATION_ABORTED/);
    });

    it("rejects in-flight request when cluster is re-authorized to a new generation", async () => {
      let triggerLateHttpResolve: (data: any) => void = () => {};

      const lateResolvingHttpClient: RealK8sHttpClient = {
        get: jest.fn().mockImplementation(() => {
          return new Promise((resolve) => {
            triggerLateHttpResolve = resolve;
          });
        }),
      };

      const revocableSource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: true,
        authorizedClusterId: testClusterId,
        httpClient: lateResolvingHttpClient,
        brokerContract: mockBrokerContract,
        brokerSessionIdResolver: mockBrokerSessionResolver,
      });

      const initialGen = revocableSource.getAuthGeneration();

      const promise = revocableSource.collectSnapshot({
        scope: { clusterId: testClusterId, namespace: testNamespace },
        user: validAuthenticatedUser,
        requestedResources: ["pods"],
      });

      // Revoke and re-authorize to new generation
      revocableSource.revokeLiveAuthorization();
      revocableSource.authorizeLiveCluster(testClusterId);

      expect(revocableSource.getAuthGeneration()).toBeGreaterThan(initialGen);

      // Late HTTP resolution from old generation
      triggerLateHttpResolve({ items: [] });

      await expect(promise).rejects.toThrow(/OPERATION_ABORTED/);
    });
  });

  describe("General Security Invariants & Cleanup", () => {
    it("fails closed by default when isRealK8sAuthorized is false", async () => {
      const unauthorizedSource = new RealK8sSnapshotSource({
        authorizedClusterId: testClusterId,
        httpClient: mockHttpClient,
        brokerContract: mockBrokerContract,
        brokerSessionIdResolver: mockBrokerSessionResolver,
      });

      await expect(
        unauthorizedSource.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);
    });

    it("strictly forbids live or streaming watchers ('watch')", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
          requestedVerb: "watch" as any,
        }),
      ).rejects.toThrow(/WATCHERS_FORBIDDEN/);
    });

    it("strictly forbids write or mutation verbs (create, delete, patch)", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
          requestedVerb: "delete" as any,
        }),
      ).rejects.toThrow(/FORBIDDEN_VERB/);
    });

    it("strictly blocks attempting to request Secrets or ServiceAccounts", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
          requestedResources: ["secrets" as any],
        }),
      ).rejects.toThrow(/FORBIDDEN_RESOURCE/);
    });

    it("strictly blocks subresources like exec, attach, port-forward, proxy", async () => {
      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
          requestedSubresource: "exec",
        }),
      ).rejects.toThrow(/FORBIDDEN_SUBRESOURCE/);
    });

    it("successfully collects snapshot over loopback proxy with scope filtering", async () => {
      const envelope = await source.collectSnapshot({
        scope: { clusterId: testClusterId, namespace: testNamespace },
        user: validAuthenticatedUser,
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

    it("disposes cleanly and refuses further snapshot collections", async () => {
      source.dispose();

      await expect(
        source.collectSnapshot({
          scope: { clusterId: testClusterId, namespace: testNamespace },
          user: validAuthenticatedUser,
        }),
      ).rejects.toThrow(/RealK8sSnapshotSource has been disposed/);

      expect(() => source.authorizeLiveCluster(testClusterId)).toThrow(/disposed/);
    });
  });
});
