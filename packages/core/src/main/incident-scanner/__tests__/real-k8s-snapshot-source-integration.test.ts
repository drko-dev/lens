/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import http from "http";
import type { AddressInfo } from "net";
import type { SnapshotUserSubject } from "../../../common/incident/local-scanner-types";
import { RealK8sSnapshotSource, type RealK8sHttpClient } from "../real-k8s-snapshot-source";
import { FakeK8sSnapshotSource } from "../fake-k8s-snapshot-source";
import { LocalIncidentScanner } from "../local-incident-scanner";
import { registerIncidentIpcHandlers } from "../../incident-storage/setup-incident-ipc.injectable";
import { incidentIpcChannels } from "../../../common/incident/incident-ipc";
import type { SnapshotBrokerAuthorizationContract } from "../snapshot-source";
import { SnapshotSourceSecurityError } from "../snapshot-source";
import { IncidentScannerConsentManager } from "../incident-scanner-consent-manager";

describe("Phase A: RealK8sSnapshotSource Production Integration & Security Gates", () => {
  let server: http.Server;
  let serverPort: number;
  let serverBaseUrl: string;

  const validClusterId = "prod-cluster-primary";
  const validNamespace = "workload-apps";

  const validUser: SnapshotUserSubject = {
    username: "lead-devops@novakube.corp",
    groups: ["system:authenticated", "cluster-operators"],
    isAuthenticated: true,
  };

  let mockBrokerContract: SnapshotBrokerAuthorizationContract;
  let mockSessionResolver: jest.Mock;
  let httpClient: RealK8sHttpClient;

  beforeAll((done) => {
    // Spin up an in-process mock Kubernetes loopback server on 127.0.0.1
    server = http.createServer((req, res) => {
      const url = req.url || "";

      // Simulate redirect defense verification
      if (url.includes("/trigger-redirect")) {
        res.writeHead(302, { Location: "/api/v1/namespaces/workload-apps/pods" });
        res.end();
        return;
      }

      // Simulate normal Kubernetes collection endpoints
      if (url.includes("/api/v1/namespaces/workload-apps/pods")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            apiVersion: "v1",
            kind: "PodList",
            items: [
              {
                kind: "Pod",
                metadata: { name: "app-pod-1", namespace: validNamespace },
                status: { phase: "Running" },
              },
            ],
          }),
        );
        return;
      }

      if (url.includes("/apis/apps/v1/namespaces/workload-apps/deployments")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            apiVersion: "apps/v1",
            kind: "DeploymentList",
            items: [
              {
                metadata: { name: "app-deployment", namespace: validNamespace },
                status: { replicas: 1, readyReplicas: 1 },
              },
            ],
          }),
        );
        return;
      }

      if (url.includes("/api/v1/namespaces/workload-apps/events")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            apiVersion: "v1",
            kind: "EventList",
            items: [
              {
                metadata: { name: "app-event-1", namespace: validNamespace },
                reason: "Scheduled",
                message: "Successfully assigned",
              },
            ],
          }),
        );
        return;
      }

      if (url.includes("/api/v1/nodes")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            apiVersion: "v1",
            kind: "NodeList",
            items: [
              {
                metadata: { name: "node-worker-1" },
                status: { conditions: [{ type: "Ready", status: "True" }] },
              },
            ],
          }),
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found", path: url }));
    });

    server.listen(0, "127.0.0.1", () => {
      serverPort = (server.address() as AddressInfo).port;
      // Note: RealK8sSnapshotSource requires https by default for production, but in unit tests
      // we test the loopback URL validation with custom client or validated https mocks
      serverBaseUrl = `https://127.0.0.1:${serverPort}/${validClusterId}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    mockBrokerContract = {
      authorizeResourceRead: jest.fn().mockResolvedValue(undefined),
    };
    mockSessionResolver = jest.fn().mockReturnValue("broker-session-valid-token-777");

    // Production-like HTTP client with redirect: error
    httpClient = {
      async get(url: string, options) {
        if (options?.signal?.aborted) {
          throw new Error("The operation was aborted.");
        }

        // Test client mapping https mock URL to the active in-process test server port
        const parsed = new URL(url);
        return new Promise((resolve, reject) => {
          const req = http.request(
            {
              hostname: "127.0.0.1",
              port: serverPort,
              path: parsed.pathname + parsed.search,
              method: "GET",
              headers: { Accept: "application/json" },
            },
            (res) => {
              if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
                if (options?.redirect === "error" || options?.followRedirects === false) {
                  return reject(new Error(`HTTP Redirection blocked by policy: status ${res.statusCode}`));
                }
              }

              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                try {
                  const json = JSON.parse(data);
                  resolve(json);
                } catch (e) {
                  reject(e);
                }
              });
            },
          );

          if (options?.signal) {
            options.signal.addEventListener("abort", () => {
              req.destroy();
              reject(new Error("The operation was aborted."));
            });
          }

          req.on("error", reject);
          req.end();
        });
      },
    };
  });

  // 1. Valid snapshot collection with authentic broker contract and loopback proxy
  it("collects live Kubernetes snapshot successfully over authorized loopback proxy", async () => {
    const source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: validClusterId,
      proxyUrlResolver: () => serverBaseUrl,
      httpClient,
      brokerContract: mockBrokerContract,
      brokerSessionIdResolver: mockSessionResolver,
    });

    const result = await source.collectSnapshot({
      scope: { clusterId: validClusterId, namespace: validNamespace },
      user: validUser,
      requestedResources: ["pods", "deployments", "events"],
      requestedVerb: "list",
    });

    expect(result.sourceType).toBe("real_k8s_snapshot_source");
    expect(result.isSyntheticSimulation).toBe(false);
    expect(result.clusterId).toBe(validClusterId);
    expect(result.namespace).toBe(validNamespace);
    expect(result.snapshot.pods?.length).toBe(1);
    expect(result.snapshot.pods?.[0]?.metadata?.name).toBe("app-pod-1");
    expect(result.snapshot.workloads?.length).toBe(1);
    expect(result.snapshot.events?.length).toBe(1);
    expect(mockBrokerContract.authorizeResourceRead).toHaveBeenCalledTimes(6);
  });

  // 2. Clúster incorrecto
  it("rejects collection when clusterId does not match authorized live cluster", async () => {
    const source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: validClusterId,
      proxyUrlResolver: () => serverBaseUrl,
      httpClient,
      brokerContract: mockBrokerContract,
      brokerSessionIdResolver: mockSessionResolver,
    });

    await expect(
      source.collectSnapshot({
        scope: { clusterId: "rogue-unauthorized-cluster", namespace: validNamespace },
        user: validUser,
        requestedResources: ["pods"],
        requestedVerb: "list",
      }),
    ).rejects.toThrow(/CLUSTER_SCOPE_VIOLATION/);
  });

  // 3. Namespace incorrecto (path traversal o RFC 1123 inválido)
  it("rejects invalid namespaces violating RFC 1123 or attempting path traversal", async () => {
    const source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: validClusterId,
      proxyUrlResolver: () => serverBaseUrl,
      httpClient,
      brokerContract: mockBrokerContract,
      brokerSessionIdResolver: mockSessionResolver,
    });

    // Uppercase namespace
    await expect(
      source.collectSnapshot({
        scope: { clusterId: validClusterId, namespace: "INVALID-UPPERCASE" },
        user: validUser,
        requestedResources: ["pods"],
        requestedVerb: "list",
      }),
    ).rejects.toThrow(/NAMESPACE_SCOPE_VIOLATION/);

    // Path traversal attempt
    await expect(
      source.collectSnapshot({
        scope: { clusterId: validClusterId, namespace: "default/../../secrets" },
        user: validUser,
        requestedResources: ["pods"],
        requestedVerb: "list",
      }),
    ).rejects.toThrow(/NAMESPACE_SCOPE_VIOLATION/);
  });

  // 4. Identidad ausente o no autenticada
  it("rejects unauthenticated user identities fail-closed", async () => {
    const source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: validClusterId,
      proxyUrlResolver: () => serverBaseUrl,
      httpClient,
      brokerContract: mockBrokerContract,
      brokerSessionIdResolver: mockSessionResolver,
    });

    const unauthenticatedUser: SnapshotUserSubject = {
      username: "anonymous@untrusted",
      groups: [],
      isAuthenticated: false,
    };

    await expect(
      source.collectSnapshot({
        scope: { clusterId: validClusterId, namespace: validNamespace },
        user: unauthenticatedUser,
        requestedResources: ["pods"],
        requestedVerb: "list",
      }),
    ).rejects.toThrow(/MISSING_USER_IDENTITY/);
  });

  // 5. Sesión revocada durante cambio de contexto
  it("rejects in-flight collection when live authorization is revoked mid-flight", async () => {
    const slowHttpClient: RealK8sHttpClient = {
      async get() {
        await new Promise((r) => setTimeout(r, 80));
        return { items: [] };
      },
    };

    const source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: validClusterId,
      proxyUrlResolver: () => serverBaseUrl,
      httpClient: slowHttpClient,
      brokerContract: mockBrokerContract,
      brokerSessionIdResolver: mockSessionResolver,
    });

    const promise = source.collectSnapshot({
      scope: { clusterId: validClusterId, namespace: validNamespace },
      user: validUser,
      requestedResources: ["pods"],
      requestedVerb: "list",
    });

    // Revoke authorization while request is in flight
    setTimeout(() => {
      source.revokeLiveAuthorization();
    }, 20);

    await expect(promise).rejects.toThrow(/OPERATION_ABORTED/);
  });

  // 6. Broker denegado
  it("fails closed when Broker authorization denies access to any resource", async () => {
    const rejectingBroker: SnapshotBrokerAuthorizationContract = {
      authorizeResourceRead: jest.fn().mockRejectedValue(
        new SnapshotSourceSecurityError("BROKER_AUTHORIZATION_DENIED", "Access denied by RBAC policy", 403),
      ),
    };

    const source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: validClusterId,
      proxyUrlResolver: () => serverBaseUrl,
      httpClient,
      brokerContract: rejectingBroker,
      brokerSessionIdResolver: mockSessionResolver,
    });

    await expect(
      source.collectSnapshot({
        scope: { clusterId: validClusterId, namespace: validNamespace },
        user: validUser,
        requestedResources: ["pods"],
        requestedVerb: "list",
      }),
    ).rejects.toThrow(/BROKER_AUTHORIZATION_DENIED/);
  });

  // 7. Permisos GET en lugar de LIST para colecciones
  it("rejects requestedVerb 'get' on collection snapshots without issuing HTTP calls", async () => {
    const httpSpy = jest.fn();
    const spyHttpClient: RealK8sHttpClient = { get: httpSpy };

    const source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: validClusterId,
      proxyUrlResolver: () => serverBaseUrl,
      httpClient: spyHttpClient,
      brokerContract: mockBrokerContract,
      brokerSessionIdResolver: mockSessionResolver,
    });

    await expect(
      source.collectSnapshot({
        scope: { clusterId: validClusterId, namespace: validNamespace },
        user: validUser,
        requestedResources: ["pods"],
        requestedVerb: "get" as any,
      }),
    ).rejects.toThrow(/FORBIDDEN_VERB/);

    expect(httpSpy).not.toHaveBeenCalled();
  });

  // 8. SSRF: Rechazo de dominios externos o IPs maliciosas
  it("rejects malicious proxy URLs attempting SSRF or external redirection", () => {
    expect(() =>
      RealK8sSnapshotSource.validateAndNormalizeLoopbackProxyUrl("https://127.0.0.1.evil.attacker.com:6443"),
    ).toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);

    expect(() =>
      RealK8sSnapshotSource.validateAndNormalizeLoopbackProxyUrl("http://127.0.0.1:6443"),
    ).toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);

    expect(() =>
      RealK8sSnapshotSource.validateAndNormalizeLoopbackProxyUrl("https://169.254.169.254:6443"),
    ).toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);
  });

  // 9. Path traversal y URLs codificadas
  it("rejects encoded path traversal vectors in proxy URLs", () => {
    expect(() =>
      RealK8sSnapshotSource.validateAndNormalizeLoopbackProxyUrl("https://127.0.0.1:6443/api/v1/..%2fsecrets"),
    ).toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);

    expect(() =>
      RealK8sSnapshotSource.validateAndNormalizeLoopbackProxyUrl("https://127.0.0.1:6443/api/v1/%2e%2e/tokens"),
    ).toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);
  });

  // 10. Redirecciones HTTP bloqueadas
  it("strictly blocks HTTP redirects fail-closed", async () => {
    const redirectingUrl = `https://127.0.0.1:${serverPort}/${validClusterId}/trigger-redirect`;

    const source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: validClusterId,
      proxyUrlResolver: () => redirectingUrl,
      httpClient,
      brokerContract: mockBrokerContract,
      brokerSessionIdResolver: mockSessionResolver,
    });

    await expect(
      source.collectSnapshot({
        scope: { clusterId: validClusterId, namespace: validNamespace },
        user: validUser,
        requestedResources: ["pods"],
        requestedVerb: "list",
      }),
    ).rejects.toThrow(/Redirection blocked by policy/);
  });

  // 11. Cancelación concurrente mediante AbortSignal
  it("supports prompt in-flight cancellation via AbortSignal", async () => {
    const abortController = new AbortController();

    const slowHttpClient: RealK8sHttpClient = {
      async get(_url, options) {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new SnapshotSourceSecurityError("OPERATION_ABORTED", "Client aborted operation.", 499));
          });
        });
      },
    };

    const source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: validClusterId,
      proxyUrlResolver: () => serverBaseUrl,
      httpClient: slowHttpClient,
      brokerContract: mockBrokerContract,
      brokerSessionIdResolver: mockSessionResolver,
    });

    const promise = source.collectSnapshot({
      scope: { clusterId: validClusterId, namespace: validNamespace },
      user: validUser,
      requestedResources: ["pods"],
      requestedVerb: "list",
      signal: abortController.signal,
    });

    setTimeout(() => {
      abortController.abort();
    }, 15);

    await expect(promise).rejects.toThrow(/OPERATION_ABORTED/);
  });

  // 12. Lecturas no autorizadas (Secrets y ServiceAccounts)
  it("strictly forbids reading Secrets or ServiceAccounts", async () => {
    const source = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: validClusterId,
      proxyUrlResolver: () => serverBaseUrl,
      httpClient,
      brokerContract: mockBrokerContract,
      brokerSessionIdResolver: mockSessionResolver,
    });

    await expect(
      source.collectSnapshot({
        scope: { clusterId: validClusterId, namespace: validNamespace },
        user: validUser,
        requestedResources: ["secrets" as any],
        requestedVerb: "list",
      }),
    ).rejects.toThrow(/FORBIDDEN_RESOURCE/);
  });

  describe("P1-01: End-to-End IPC Lifecycle, Broker Authorization & Scope Revocation", () => {
    let handlers: Map<string, Function>;
    let mockIpc: { handle: jest.Mock; removeHandler: jest.Mock };
    let httpSpy: jest.Mock;
    let realSource: RealK8sSnapshotSource;
    let fakeSource: FakeK8sSnapshotSource;
    let scanner: LocalIncidentScanner;
    let mockIncidentRepo: any;
    let mockCluster: any;

    const validEvent = {
      sender: {
        isDestroyed: () => false,
      },
      senderFrame: {
        parent: null,
        isDestroyed: () => false,
        url: "http://localhost:9191/index.html",
      },
    };

    beforeEach(() => {
      handlers = new Map();
      mockIpc = {
        handle: jest.fn((channel: string, handler: Function) => {
          handlers.set(channel, handler);
        }),
        removeHandler: jest.fn(),
      };

      httpSpy = jest.fn();

      const trackingHttpClient: RealK8sHttpClient = {
        async get(url, options) {
          httpSpy(url, options);
          return httpClient.get(url, options);
        },
      };

      realSource = new RealK8sSnapshotSource({
        isRealK8sAuthorized: false,
        authorizedClusterId: validClusterId,
        proxyUrlResolver: () => serverBaseUrl,
        httpClient: trackingHttpClient,
        brokerContract: mockBrokerContract,
        brokerSessionIdResolver: mockSessionResolver,
      });

      fakeSource = new FakeK8sSnapshotSource();

      mockIncidentRepo = {
        getIncidentById: jest.fn(),
        listIncidents: jest.fn().mockReturnValue([]),
        createIncident: jest.fn((input: any) => ({
          id: `inc-${Date.now()}`,
          ...input,
          status: "DETECTADO",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })),
        saveIncident: jest.fn(),
        searchDuplicate: jest.fn().mockReturnValue(null),
        findOpenIncidentByFingerprint: jest.fn().mockReturnValue(null),
        addTimelineEntry: jest.fn(),
        transaction: jest.fn((cb: any) => cb()),
      };

      scanner = new LocalIncidentScanner(
        mockIncidentRepo,
        undefined,
        undefined,
        fakeSource,
        realSource,
      );

      mockCluster = {
        id: validClusterId,
        contextName: { get: () => "lead-devops@novakube.corp" },
        accessible: { get: () => true },
        disconnected: { get: () => false },
        isAdmin: { get: () => true },
        allowedNamespaces: [validNamespace],
      };
      const getClusterById = jest.fn((id: string) => (id === validClusterId ? mockCluster : undefined));
      const consentManager = new IncidentScannerConsentManager();

      registerIncidentIpcHandlers(
        mockIncidentRepo,
        {} as any,
        undefined,
        undefined,
        {
          scanner,
          getClusterById,
          consentManager,
        },
        mockIpc,
      );
    });

    // 13. Recorrido end-to-end completo desde IPC con Real activado y consentimiento verificable
    it("completes full end-to-end collection from IPC over loopback proxy when explicitly authorized with verifiable consent", async () => {
      const consentHandler = handlers.get(incidentIpcChannels.scannerRequestConsent);
      const startHandler = handlers.get(incidentIpcChannels.scannerStart);
      const scanHandler = handlers.get(incidentIpcChannels.scannerScanFromSource);

      expect(consentHandler).toBeDefined();
      expect(startHandler).toBeDefined();
      expect(scanHandler).toBeDefined();

      // Request verifiable consent token
      const consentRecord = await consentHandler!(validEvent, {
        clusterId: validClusterId,
        namespace: validNamespace,
      });

      expect(consentRecord.consentToken).toBeDefined();
      expect(consentRecord.operatorUsername).toBe("lead-devops@novakube.corp");

      // Start scanner in real mode with verifiable consent token
      const status = await startHandler!(validEvent, {
        scope: { clusterId: validClusterId, namespace: validNamespace },
        sourceMode: "real",
        explicitConsent: true,
        consentToken: consentRecord.consentToken,
      });

      expect(status.isEnabled).toBe(true);
      expect(status.sourceType).toBe("k8s_watcher");
      expect(status.isSyntheticDemo).toBe(false);

      // Perform scan from source via IPC
      const signals = await scanHandler!(validEvent, {
        requestedResources: ["pods"],
        requestedVerb: "list",
      });

      expect(signals).toBeDefined();
      expect(httpSpy).toHaveBeenCalledTimes(1);
      expect(mockBrokerContract.authorizeResourceRead).toHaveBeenCalled();
    });

    // 14. Fallback fail-closed a Fake como opción predeterminada sin consentimiento
    it("maintains Fake source mode by default when explicitConsent is not provided", async () => {
      const startHandler = handlers.get(incidentIpcChannels.scannerStart);
      const scanHandler = handlers.get(incidentIpcChannels.scannerScanFromSource);

      // Start without real source authorization
      const status = await startHandler!(validEvent, {
        scope: { clusterId: validClusterId, namespace: validNamespace },
      });

      expect(status.isEnabled).toBe(true);
      expect(status.sourceType).toBe("synthetic_feed");
      expect(status.isSyntheticDemo).toBe(true);

      // Execute scan from source
      await scanHandler!(validEvent, {});

      // Proves ZERO HTTP traffic was emitted to real cluster or proxy
      expect(httpSpy).not.toHaveBeenCalled();
    });

    // 15. Verificación de que Broker denegado no produce tráfico HTTP
    it("strictly verifies that a denied Broker authorization produces ZERO HTTP traffic", async () => {
      const consentHandler = handlers.get(incidentIpcChannels.scannerRequestConsent);
      const startHandler = handlers.get(incidentIpcChannels.scannerStart);
      const scanHandler = handlers.get(incidentIpcChannels.scannerScanFromSource);

      const consent = await consentHandler!(validEvent, {
        clusterId: validClusterId,
        namespace: validNamespace,
      });

      await startHandler!(validEvent, {
        scope: { clusterId: validClusterId, namespace: validNamespace },
        sourceMode: "real",
        explicitConsent: true,
        consentToken: consent.consentToken,
      });

      // Broker throws authorization denial
      (mockBrokerContract.authorizeResourceRead as jest.Mock).mockRejectedValueOnce(
        new SnapshotSourceSecurityError(
          "BROKER_AUTHORIZATION_DENIED",
          "Double-identity evaluation failed: Technical identity not authorized for namespace.",
          403,
        ),
      );

      await expect(
        scanHandler!(validEvent, {
          requestedResources: ["pods"],
          requestedVerb: "list",
        }),
      ).rejects.toThrow(/BROKER_AUTHORIZATION_DENIED/);

      // CRITICAL SECURITY ASSERTION: Zero HTTP calls issued when Broker denies
      expect(httpSpy).not.toHaveBeenCalled();
    });

    // 16. Revocación y aborto automático al cambiar clúster o namespace
    it("revokes real cluster authorization and aborts when switching to another cluster", async () => {
      const consentHandler = handlers.get(incidentIpcChannels.scannerRequestConsent);
      const startHandler = handlers.get(incidentIpcChannels.scannerStart);
      const scanHandler = handlers.get(incidentIpcChannels.scannerScanFromSource);

      const consent = await consentHandler!(validEvent, {
        clusterId: validClusterId,
        namespace: validNamespace,
      });

      // First authorize for validClusterId
      await startHandler!(validEvent, {
        scope: { clusterId: validClusterId, namespace: validNamespace },
        sourceMode: "real",
        explicitConsent: true,
        consentToken: consent.consentToken,
      });

      expect(scanner.getActiveSourceMode()).toBe("real");

      // Now switch cluster without explicit real consent for the new cluster
      const switchedStatus = await startHandler!(validEvent, {
        scope: { clusterId: "different-cluster-xyz", namespace: "default" },
      });

      expect(switchedStatus.sourceType).toBe("synthetic_feed");
      expect(switchedStatus.isSyntheticDemo).toBe(true);
      expect(scanner.getActiveSourceMode()).toBe("fake");

      // Further scan runs offline on fake mode with zero HTTP calls
      await scanHandler!(validEvent, {});
      expect(httpSpy).not.toHaveBeenCalled();
    });

    // 17. Adversarial: Rechazo de consentimiento falsificado, reutilizado o ausente
    it("fails closed and disables real source if consent token is missing, reused or invalid", async () => {
      const consentHandler = handlers.get(incidentIpcChannels.scannerRequestConsent);
      const startHandler = handlers.get(incidentIpcChannels.scannerStart);

      // 1. Missing consentToken when requesting real mode
      await expect(
        startHandler!(validEvent, {
          scope: { clusterId: validClusterId, namespace: validNamespace },
          sourceMode: "real",
          explicitConsent: true,
        }),
      ).rejects.toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);

      expect(scanner.getActiveSourceMode()).toBe("fake");

      // 2. Forged / invalid consentToken
      await expect(
        startHandler!(validEvent, {
          scope: { clusterId: validClusterId, namespace: validNamespace },
          sourceMode: "real",
          explicitConsent: true,
          consentToken: "forged-token-abc",
        }),
      ).rejects.toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);

      expect(scanner.getActiveSourceMode()).toBe("fake");

      // 3. Replay attack: single-use token cannot be consumed twice
      const validConsent = await consentHandler!(validEvent, {
        clusterId: validClusterId,
        namespace: validNamespace,
      });

      const firstStart = await startHandler!(validEvent, {
        scope: { clusterId: validClusterId, namespace: validNamespace },
        sourceMode: "real",
        explicitConsent: true,
        consentToken: validConsent.consentToken,
      });
      expect(firstStart.sourceType).toBe("k8s_watcher");

      // Stop scanner
      await scanner.stop();

      // Attempt to reuse same token
      await expect(
        startHandler!(validEvent, {
          scope: { clusterId: validClusterId, namespace: validNamespace },
          sourceMode: "real",
          explicitConsent: true,
          consentToken: validConsent.consentToken,
        }),
      ).rejects.toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);

      expect(scanner.getActiveSourceMode()).toBe("fake");

      // 4. Fabricated identity rejection: context resolving to "local-authorized-operator" is strictly prohibited
      mockCluster.contextName.get = () => "local-authorized-operator";
      await expect(
        startHandler!(validEvent, {
          scope: { clusterId: validClusterId, namespace: validNamespace },
          sourceMode: "real",
          explicitConsent: true,
          consentToken: "any-token",
        }),
      ).rejects.toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);

      mockCluster.contextName.get = () => "lead-devops@novakube.corp";
      expect(scanner.getActiveSourceMode()).toBe("fake");
    });

    // 18. Adversarial: Rechazo estricto si el clúster está offline o no accesible
    it("fails closed if the target cluster is not accessible or disconnected in Main", async () => {
      const consentHandler = handlers.get(incidentIpcChannels.scannerRequestConsent);
      const startHandler = handlers.get(incidentIpcChannels.scannerStart);

      // Cluster non-existent
      await expect(
        consentHandler!(validEvent, {
          clusterId: "inaccessible-cluster-999",
          namespace: validNamespace,
        }),
      ).rejects.toThrow();

      await expect(
        startHandler!(validEvent, {
          scope: { clusterId: "inaccessible-cluster-999", namespace: validNamespace },
          sourceMode: "real",
          explicitConsent: true,
          consentToken: "any-token",
        }),
      ).rejects.toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);

      expect(scanner.getActiveSourceMode()).toBe("fake");
    });

    // 19. Adversarial: TOCTOU race protection in processSnapshot() when cluster switches mid-flight
    it("aborts processSnapshot and ensures zero post-switch signal persistence when cluster switches mid-flight", async () => {
      // Setup scanner with cluster A
      await scanner.start({ clusterId: validClusterId, namespace: validNamespace });

      let persistCalls = 0;
      let abortedMidFlight = false;

      // Mock deduplicator ingestSignal to simulate an async delay during persistence of multiple signals
      const originalIngestSignal = (scanner as any).deduplicator.ingestSignal;
      (scanner as any).deduplicator.ingestSignal = jest.fn(async (signal: any, cooldown: any) => {
        persistCalls++;
        if (persistCalls === 1) {
          // Mid-flight: switch scanner to Cluster B while signal 1 is finishing
          await scanner.start({ clusterId: "cluster-b-switched", namespace: "default" });
        }
        return originalIngestSignal.call((scanner as any).deduplicator, signal, cooldown);
      });

      // Prepare snapshot with 3 crashing pods in validClusterId
      const snapshot: import("../../../common/incident/local-scanner-types").K8sSnapshot = {
        pods: [
          {
            kind: "Pod" as const,
            metadata: { name: "crashing-pod-1", namespace: validNamespace },
            status: {
              phase: "Running",
              containerStatuses: [
                {
                  name: "app",
                  ready: false,
                  restartCount: 5,
                  state: { waiting: { reason: "CrashLoopBackOff", message: "back-off" } },
                },
              ],
            },
          },
          {
            kind: "Pod" as const,
            metadata: { name: "crashing-pod-2", namespace: validNamespace },
            status: {
              phase: "Running",
              containerStatuses: [
                {
                  name: "app",
                  ready: false,
                  restartCount: 5,
                  state: { waiting: { reason: "CrashLoopBackOff", message: "back-off" } },
                },
              ],
            },
          },
          {
            kind: "Pod" as const,
            metadata: { name: "crashing-pod-3", namespace: validNamespace },
            status: {
              phase: "Running",
              containerStatuses: [
                {
                  name: "app",
                  ready: false,
                  restartCount: 5,
                  state: { waiting: { reason: "CrashLoopBackOff", message: "back-off" } },
                },
              ],
            },
          },
        ],
      };

      try {
        await scanner.processSnapshot(snapshot);
      } catch (err: any) {
        if (err?.code === "OPERATION_ABORTED" || err?.message?.includes("OPERATION_ABORTED")) {
          abortedMidFlight = true;
        }
      }

      // Assertions:
      // 1. processSnapshot caught the scopeGeneration / cluster switch and aborted
      expect(abortedMidFlight).toBe(true);

      // 2. Only the in-flight signal before the switch was attempted, subsequent signals 2 and 3 were never ingested
      expect(persistCalls).toBe(1);

      // 3. Scanner status verifies active scope is now cluster B
      const currentStatus = scanner.getStatus();
      expect(currentStatus.scope?.clusterId).toBe("cluster-b-switched");
    });
  });
});
