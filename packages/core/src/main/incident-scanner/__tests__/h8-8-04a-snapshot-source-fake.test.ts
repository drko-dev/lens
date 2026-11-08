/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { createContainer } from "@ogre-tools/injectable";
import { LocalIncidentScanner } from "../local-incident-scanner";
import { FakeK8sSnapshotSource } from "../fake-k8s-snapshot-source";
import {
  BrokerSnapshotAuthorizationAdapter,
  DisabledRealK8sSnapshotSource,
  SnapshotSourceSecurityError,
} from "../snapshot-source";
import fakeK8sSnapshotSourceInjectable from "../fake-k8s-snapshot-source.injectable";
import localIncidentScannerInjectable from "../local-incident-scanner.injectable";
import incidentRepositoryInjectable from "../../incident-storage/incident-repository.injectable";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { IncidentAuthorizationEngine } from "../../incident-broker/authorization-engine";
import { IncidentBrokerService } from "../../incident-broker/incident-broker-service";
import { KubernetesTechnicalIdentityManager } from "../../incident-broker/technical-identity-manager";
import type { K8sSnapshot } from "../../../common/incident/local-scanner-types";

describe("H8.8-04a: Safe SnapshotSource Contract & Offline Kubernetes Simulation", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let fakeSource: FakeK8sSnapshotSource;
  let scanner: LocalIncidentScanner;

  const fixedRefTimeMs = Date.parse("2026-11-07T12:00:00.000Z");
  const defaultClusterId = "sim-cluster-alpha";
  const defaultNamespace = "payments-prod";

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();
    incidentRepo = new IncidentRepository(sqlite);
    fakeSource = new FakeK8sSnapshotSource({
      defaultReferenceTimestampMs: fixedRefTimeMs,
    });
    scanner = new LocalIncidentScanner(incidentRepo, undefined, undefined, fakeSource);
  });

  afterEach(() => {
    scanner.dispose();
    sqlite.close();
  });

  describe("04a-01: Electron DI Wiring, Offline Guarantees & Zero Real Watchers", () => {
    it("resolves FakeK8sSnapshotSource and injects it into LocalIncidentScanner via Electron DI", () => {
      const di = createContainer("h8-8-04a-di-test");
      di.register(
        fakeK8sSnapshotSourceInjectable,
        localIncidentScannerInjectable,
        incidentRepositoryInjectable,
      );
      di.override(incidentRepositoryInjectable, () => incidentRepo);

      const injectedSource = di.inject(fakeK8sSnapshotSourceInjectable);
      const injectedScanner = di.inject(localIncidentScannerInjectable);

      expect(injectedSource).toBeInstanceOf(FakeK8sSnapshotSource);
      expect(injectedSource.isOfflineSynthetic).toBe(true);
      expect(injectedScanner.getSnapshotSource()).toBe(injectedSource);
      expect(injectedScanner.getStatus().isEnabled).toBe(false);
      expect(injectedScanner.getStatus().activeWatchersCount).toBe(0);
    });

    it("fails closed on DisabledRealK8sSnapshotSource and forbids real watchers", async () => {
      const disabledRealSource = new DisabledRealK8sSnapshotSource();
      expect(disabledRealSource.isOfflineSynthetic).toBe(false);

      await expect(
        disabledRealSource.collectSnapshot({
          scope: { clusterId: defaultClusterId, namespace: defaultNamespace },
        }),
      ).rejects.toThrow(/REAL_K8S_CONNECTIVITY_DISABLED/);

      expect(() => fakeSource.startWatch()).toThrow(/WATCHERS_FORBIDDEN/);
    });
  });

  describe("04a-02: Deterministic Reproduction of All 7 Operational Fault Scenarios", () => {
    beforeEach(async () => {
      await scanner.start({
        clusterId: defaultClusterId,
        namespace: defaultNamespace,
      });
    });

    it("reproduces CrashLoopBackOff, ImagePullBackOff, OOMKilled, and Frequent Restarts deterministically", async () => {
      const crashSignals = await scanner.scanFromSource({
        scenarioId: "crash_loop_backoff",
        referenceTimestampMs: fixedRefTimeMs,
      });
      expect(crashSignals).toHaveLength(1);
      expect(crashSignals[0].signalType).toBe("CRASH_LOOP_BACKOFF");
      expect(crashSignals[0].resourceKind).toBe("Pod");

      const imgPullSignals = await scanner.scanFromSource({
        scenarioId: "image_pull_backoff",
        referenceTimestampMs: fixedRefTimeMs,
      });
      expect(imgPullSignals).toHaveLength(1);
      expect(imgPullSignals[0].signalType).toBe("IMAGE_PULL_BACKOFF");

      const oomSignals = await scanner.scanFromSource({
        scenarioId: "oom_killed",
        referenceTimestampMs: fixedRefTimeMs,
      });
      expect(oomSignals).toHaveLength(1);
      expect(oomSignals[0].signalType).toBe("OOM_KILLED");
      expect(oomSignals[0].severity).toBe("critical");

      const restartSignals = await scanner.scanFromSource({
        scenarioId: "frequent_restarts",
        referenceTimestampMs: fixedRefTimeMs,
      });
      expect(restartSignals).toHaveLength(1);
      expect(restartSignals[0].signalType).toBe("ABNORMAL_RESTARTS");

      const incidents = incidentRepo.listIncidents({
        clusterId: defaultClusterId,
        namespace: defaultNamespace,
      });
      expect(incidents).toHaveLength(4);
    });

    it("reproduces Pending Pods and Readiness Failures with Pods, Deployments, and Warning Events", async () => {
      const pendingSignals = await scanner.scanFromSource({
        scenarioId: "pending_pods",
        referenceTimestampMs: fixedRefTimeMs,
      });

      expect(pendingSignals.map(s => s.signalType).sort()).toEqual([
        "ROLLOUT_DEGRADED",
        "WARNING_EVENT",
      ]);
      expect(pendingSignals.find(s => s.signalType === "WARNING_EVENT")?.message).toContain(
        "0/4 nodes are available",
      );

      const readinessSignals = await scanner.scanFromSource({
        scenarioId: "readiness_failure",
        referenceTimestampMs: fixedRefTimeMs,
      });

      expect(readinessSignals.map(s => s.signalType).sort()).toEqual([
        "ROLLOUT_DEGRADED",
        "WARNING_EVENT",
      ]);
      expect(readinessSignals.find(s => s.signalType === "WARNING_EVENT")?.message).toContain(
        "Readiness probe failed",
      );
    });

    it("filters ancient/obsolete events, sorts out-of-order events, and consolidates duplicates", async () => {
      const anomalySignals = await scanner.scanFromSource({
        scenarioId: "event_anomalies",
        referenceTimestampMs: fixedRefTimeMs,
      });

      // Stale 2h and 24h events must be ignored; the 3 duplicate/out-of-order events for order-processor-7c9d8
      // must be consolidated into a single deterministic WARNING_EVENT signal with the latest timestamp (-1m).
      expect(anomalySignals).toHaveLength(1);
      expect(anomalySignals[0].signalType).toBe("WARNING_EVENT");
      expect(anomalySignals[0].resourceName).toBe("order-processor-7c9d8");
      expect(anomalySignals[0].rawMetadata?.lastTimestamp).toBe(
        new Date(fixedRefTimeMs - 60 * 1000).toISOString(),
      );
      expect(anomalySignals[0].rawMetadata?.eventCount).toBe(5);
    });
  });

  describe("04a-03: Prohibited Operations & Broker Authorization Contract", () => {
    beforeEach(async () => {
      await scanner.start({
        clusterId: defaultClusterId,
        namespace: defaultNamespace,
      });
    });

    it("strictly forbids Secret reads, token creation, exec, attach, port-forward, proxy, watchers, and write verbs", async () => {
      for (const forbiddenResource of [
        "secret",
        "secrets",
        "serviceaccount",
        "serviceaccounts",
        "token",
        "tokens",
        "tokenrequest",
        "pods/exec",
        "pods/attach",
        "pods/portforward",
        "pods/proxy",
        "serviceaccounts/token",
      ]) {
        await expect(
          scanner.scanFromSource({
            requestedResources: [forbiddenResource],
          }),
        ).rejects.toThrow(SnapshotSourceSecurityError);
      }

      for (const forbiddenSubresource of ["exec", "attach", "port-forward", "portforward", "proxy", "token"]) {
        await expect(
          scanner.scanFromSource({
            requestedSubresource: forbiddenSubresource,
          }),
        ).rejects.toThrow(/FORBIDDEN_SUBRESOURCE/);
      }

      for (const forbiddenVerb of ["create", "update", "patch", "delete", "deletecollection", "post", "put", "apply"]) {
        await expect(
          scanner.scanFromSource({
            requestedVerb: forbiddenVerb,
          }),
        ).rejects.toThrow(/FORBIDDEN_VERB/);
      }

      await expect(
        scanner.scanFromSource({
          requestedVerb: "watch",
        }),
      ).rejects.toThrow(/WATCHERS_FORBIDDEN/);
    });

    it("enforces double-identity authorization contract via BrokerSnapshotAuthorizationAdapter", async () => {
      let allowAgentRbac = true;
      const authEngine = new IncidentAuthorizationEngine(
        async (user, params) => user.username === "sre-alice" && params.namespace === defaultNamespace,
        async (_agent, params) => allowAgentRbac && params.clusterId === defaultClusterId,
      );
      const identityManager = new KubernetesTechnicalIdentityManager();
      identityManager.registerTechnicalIdentity(defaultClusterId, {
        serviceAccountName: "openlens-ai-investigator",
        serviceAccountNamespace: "kube-system",
        audience: "openlens-ai-investigator",
        token: "synthetic-sa-jwt-token-do-not-use-in-prod",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 600_000,
      });

      const brokerService = new IncidentBrokerService(authEngine, identityManager);
      const brokerSession = brokerService.createSession({
        incidentId: "INC-BROKER-04A",
        clusterId: defaultClusterId,
        namespace: defaultNamespace,
        user: { username: "sre-alice", groups: ["sre-team"] },
      });

      const brokerBackedSource = new FakeK8sSnapshotSource({
        defaultReferenceTimestampMs: fixedRefTimeMs,
        brokerContract: new BrokerSnapshotAuthorizationAdapter(brokerService),
        brokerSessionIdResolver: (clusterId, namespace, user) =>
          clusterId === defaultClusterId && namespace === defaultNamespace && user.username === "sre-alice"
            ? brokerSession.sessionId
            : undefined,
      });

      scanner.setSnapshotSource(brokerBackedSource);

      // Authorized double-identity read succeeds
      const signals = await scanner.scanFromSource({
        user: { username: "sre-alice", groups: ["sre-team"] },
        scenarioId: "crash_loop_backoff",
        referenceTimestampMs: fixedRefTimeMs,
      });
      expect(signals).toHaveLength(1);

      // Revoking agent technical identity or denying RBAC blocks snapshot collection via broker
      allowAgentRbac = false;
      await expect(
        scanner.scanFromSource({
          user: { username: "sre-alice", groups: ["sre-team"] },
          scenarioId: "crash_loop_backoff",
          referenceTimestampMs: fixedRefTimeMs,
        }),
      ).rejects.toThrow(/BROKER_AUTHORIZATION_DENIED/);
    });
  });

  describe("04a-04: Adversarial Isolation (Cross-Cluster, Cross-Namespace, Simulated 403)", () => {
    it("blocks cross-cluster and cross-namespace requests and isolates multi-cluster deduplication", async () => {
      await scanner.start({
        clusterId: "cluster-alpha",
        namespace: "payments-prod",
      });

      await expect(
        scanner.scanFromSource({
          targetClusterId: "cluster-beta",
          scenarioId: "oom_killed",
        }),
      ).rejects.toThrow(/CLUSTER_SCOPE_VIOLATION/);

      await expect(
        scanner.scanFromSource({
          targetNamespace: "kube-system",
          scenarioId: "oom_killed",
        }),
      ).rejects.toThrow(/NAMESPACE_SCOPE_VIOLATION/);

      // Scan cluster-alpha
      await scanner.scanFromSource({
        scenarioId: "oom_killed",
        referenceTimestampMs: fixedRefTimeMs,
      });

      // Switch to cluster-beta with identical namespace & workload name
      await scanner.start({
        clusterId: "cluster-beta",
        namespace: "payments-prod",
      });
      await scanner.scanFromSource({
        scenarioId: "oom_killed",
        referenceTimestampMs: fixedRefTimeMs,
      });

      const alphaIncidents = incidentRepo.listIncidents({ clusterId: "cluster-alpha" });
      const betaIncidents = incidentRepo.listIncidents({ clusterId: "cluster-beta" });
      expect(alphaIncidents).toHaveLength(1);
      expect(betaIncidents).toHaveLength(1);
      expect(alphaIncidents[0].id).not.toBe(betaIncidents[0].id);
      expect(alphaIncidents[0].fingerprint).not.toBe(betaIncidents[0].fingerprint);
    });

    it("simulates 403 Forbidden RBAC errors per user, namespace, or resourceKind without persisting partial state", async () => {
      await scanner.start({
        clusterId: defaultClusterId,
        namespace: defaultNamespace,
      });

      fakeSource.addSimulatedForbiddenRule({
        clusterId: defaultClusterId,
        namespace: defaultNamespace,
        username: "restricted-viewer",
        resourceKind: "events",
      });

      await expect(
        scanner.scanFromSource({
          user: { username: "restricted-viewer" },
          scenarioId: "pending_pods",
        }),
      ).rejects.toThrow(/RBAC_FORBIDDEN_403.*403 Forbidden/);

      expect(incidentRepo.listIncidents()).toHaveLength(0);
    });
  });

  describe("04a-05: Adversarial Cancellation, TOCTOU Scope Switch & Malformed Snapshots", () => {
    beforeEach(async () => {
      await scanner.start({
        clusterId: defaultClusterId,
        namespace: defaultNamespace,
      });
    });

    it("aborts in-flight snapshot collection via AbortSignal or scanner stop/switch with zero persisted incidents", async () => {
      fakeSource.setSimulatedDelayMs(60);
      const abortController = new AbortController();

      const scanPromise = scanner.scanFromSource({
        scenarioId: "all_faults",
        signal: abortController.signal,
      });

      setTimeout(() => abortController.abort(), 15);

      await expect(scanPromise).rejects.toThrow(/OPERATION_ABORTED/);
      expect(incidentRepo.listIncidents()).toHaveLength(0);

      // TOCTOU test: scanner stops while snapshot collection is in flight
      const stopRacePromise = scanner.scanFromSource({
        scenarioId: "oom_killed",
      });
      setTimeout(() => {
        void scanner.stop();
      }, 15);

      await expect(stopRacePromise).rejects.toThrow(/OPERATION_ABORTED/);
      expect(incidentRepo.listIncidents()).toHaveLength(0);
    });

    it("rejects malformed snapshots, smuggled Secret objects, and oversized payloads fail-closed", async () => {
      // 1. Smuggled Secret inside pods array
      const smuggledSecretSnapshot = {
        pods: [
          {
            kind: "Secret",
            metadata: { name: "db-credentials", namespace: defaultNamespace },
          },
        ],
      } as unknown as K8sSnapshot;

      expect(() =>
        fakeSource.registerScopedSnapshot(defaultClusterId, defaultNamespace, smuggledSecretSnapshot),
      ).toThrow(/SecurityError: Forbidden resource kind 'Secret'/);

      await expect(scanner.processSnapshot(smuggledSecretSnapshot)).rejects.toThrow(
        /SecurityError: Forbidden resource kind 'Secret'/,
      );

      // 2. Malformed Pod missing metadata.name
      const missingNameSnapshot = {
        pods: [
          {
            kind: "Pod",
            metadata: { name: "", namespace: defaultNamespace },
          },
        ],
      } as unknown as K8sSnapshot;

      await expect(scanner.processSnapshot(missingNameSnapshot)).rejects.toThrow(
        /ValidationError: Pod 'metadata\.name' must be a non-empty string/,
      );

      // 3. Malformed Event missing involvedObject
      const malformedEventSnapshot = {
        events: [
          {
            kind: "Event",
            metadata: { name: "bad-ev", namespace: defaultNamespace },
            type: "Warning",
            reason: "Unhealthy",
            message: "Missing involvedObject",
          },
        ],
      } as unknown as K8sSnapshot;

      await expect(scanner.processSnapshot(malformedEventSnapshot)).rejects.toThrow(
        /ValidationError: Event 'involvedObject' must be a non-null object/,
      );

      expect(incidentRepo.listIncidents()).toHaveLength(0);
    });
  });

  describe("H8.8-04a-R1: Authorization Closure & Broker Fail-Closed Validation", () => {
    const fixtureWithMixedWorkloads: K8sSnapshot = {
      workloads: [
        {
          kind: "Deployment",
          metadata: { name: "dep-api", namespace: defaultNamespace },
          spec: { replicas: 3 },
          status: { replicas: 3, availableReplicas: 0 },
        },
        {
          kind: "StatefulSet",
          metadata: { name: "sts-db", namespace: defaultNamespace },
          spec: { replicas: 2 },
          status: { replicas: 2, availableReplicas: 0 },
        },
        {
          kind: "DaemonSet",
          metadata: { name: "ds-monitor", namespace: defaultNamespace },
          spec: { replicas: 1 },
          status: { replicas: 1, availableReplicas: 0 },
        },
      ],
    };

    beforeEach(async () => {
      await scanner.start({
        clusterId: defaultClusterId,
        namespace: defaultNamespace,
      });
      fakeSource.registerScopedSnapshot(defaultClusterId, defaultNamespace, fixtureWithMixedWorkloads);
    });

    describe("R1-01: Discrete Workload Authorization Isolation", () => {
      it("returns ONLY Deployments when requestedResources has only deployments", async () => {
        const envelope = await fakeSource.collectSnapshot({
          scope: { clusterId: defaultClusterId, namespace: defaultNamespace },
          requestedResources: ["deployments"],
        });

        expect(envelope.snapshot.workloads).toHaveLength(1);
        expect(envelope.snapshot.workloads![0].kind).toBe("Deployment");
        expect(envelope.snapshot.workloads![0].metadata.name).toBe("dep-api");
      });

      it("returns ONLY StatefulSets when requestedResources has only statefulsets", async () => {
        const envelope = await fakeSource.collectSnapshot({
          scope: { clusterId: defaultClusterId, namespace: defaultNamespace },
          requestedResources: ["statefulsets"],
        });

        expect(envelope.snapshot.workloads).toHaveLength(1);
        expect(envelope.snapshot.workloads![0].kind).toBe("StatefulSet");
        expect(envelope.snapshot.workloads![0].metadata.name).toBe("sts-db");
      });

      it("returns ONLY DaemonSets when requestedResources has only daemonsets", async () => {
        const envelope = await fakeSource.collectSnapshot({
          scope: { clusterId: defaultClusterId, namespace: defaultNamespace },
          requestedResources: ["daemonsets"],
        });

        expect(envelope.snapshot.workloads).toHaveLength(1);
        expect(envelope.snapshot.workloads![0].kind).toBe("DaemonSet");
        expect(envelope.snapshot.workloads![0].metadata.name).toBe("ds-monitor");
      });

      it("returns combination of authorized workload kinds without leaking unauthorized kinds", async () => {
        const envelope = await fakeSource.collectSnapshot({
          scope: { clusterId: defaultClusterId, namespace: defaultNamespace },
          requestedResources: ["deployments", "daemonsets"],
        });

        expect(envelope.snapshot.workloads).toHaveLength(2);
        const kinds = envelope.snapshot.workloads!.map(w => w.kind).sort();
        expect(kinds).toEqual(["DaemonSet", "Deployment"]);
        expect(envelope.snapshot.workloads!.some(w => w.kind === "StatefulSet")).toBe(false);
      });

      it("enforces RBAC evaluator allowing Deployments but denying StatefulSets", async () => {
        const rbacSource = new FakeK8sSnapshotSource({
          defaultReferenceTimestampMs: fixedRefTimeMs,
          rbacEvaluator: (params) => {
            if (params.resourceKind === "statefulsets") {
              return false;
            }
            return true;
          },
        });
        rbacSource.registerScopedSnapshot(defaultClusterId, defaultNamespace, fixtureWithMixedWorkloads);
        scanner.setSnapshotSource(rbacSource);

        // Requesting deployments succeeds and returns only Deployment
        const depSignals = await scanner.scanFromSource({
          requestedResources: ["deployments"],
          referenceTimestampMs: fixedRefTimeMs,
        });
        expect(depSignals).toHaveLength(1);
        expect(depSignals[0].resourceKind).toBe("Deployment");

        // Requesting statefulsets fails closed with RBAC_FORBIDDEN_403
        await expect(
          scanner.scanFromSource({
            requestedResources: ["statefulsets"],
            referenceTimestampMs: fixedRefTimeMs,
          }),
        ).rejects.toThrow(/RBAC_FORBIDDEN_403.*statefulsets/);
      });
    });

    describe("R1-02: Fail-Closed Broker Configuration & Zero Permission by Omission", () => {
      it("fails closed when brokerContract is configured but brokerSessionIdResolver is missing", async () => {
        let invocations = 0;
        const mockContract = {
          authorizeResourceRead: async () => {
            invocations++;
            throw new Error("Broker explicitly denies all access");
          },
        };

        const partiallyConfiguredSource = new FakeK8sSnapshotSource({
          defaultReferenceTimestampMs: fixedRefTimeMs,
          brokerContract: mockContract,
          // brokerSessionIdResolver intentionally undefined!
        });
        scanner.setSnapshotSource(partiallyConfiguredSource);

        await expect(
          scanner.scanFromSource({
            requestedResources: ["deployments"],
          }),
        ).rejects.toThrow(/BROKER_AUTHORIZATION_DENIED.*Incomplete broker configuration/);

        expect(invocations).toBe(0);
        expect(incidentRepo.listIncidents()).toHaveLength(0);
      });

      it("fails closed when brokerSessionIdResolver is configured but brokerContract is missing", async () => {
        const partiallyConfiguredSource = new FakeK8sSnapshotSource({
          defaultReferenceTimestampMs: fixedRefTimeMs,
          // brokerContract intentionally undefined!
          brokerSessionIdResolver: () => "sess-123",
        });
        scanner.setSnapshotSource(partiallyConfiguredSource);

        await expect(
          scanner.scanFromSource({
            requestedResources: ["deployments"],
          }),
        ).rejects.toThrow(/BROKER_AUTHORIZATION_DENIED.*Incomplete broker configuration/);

        expect(incidentRepo.listIncidents()).toHaveLength(0);
      });

      it("fails closed when broker rejects and error is not converted to authorization", async () => {
        let invocations = 0;
        const mockContract = {
          authorizeResourceRead: async () => {
            invocations++;
            throw new Error("403 Forbidden: Agent technical identity revoked");
          },
        };

        const fullyConfiguredRejectingSource = new FakeK8sSnapshotSource({
          defaultReferenceTimestampMs: fixedRefTimeMs,
          brokerContract: mockContract,
          brokerSessionIdResolver: () => "sess-valid-id",
        });
        scanner.setSnapshotSource(fullyConfiguredRejectingSource);

        await expect(
          scanner.scanFromSource({
            requestedResources: ["deployments"],
          }),
        ).rejects.toThrow(/Agent technical identity revoked/);

        expect(invocations).toBe(1);
        expect(incidentRepo.listIncidents()).toHaveLength(0);
      });

      it("continues functioning in pure offline fake mode when no broker is configured", async () => {
        const pureFakeSource = new FakeK8sSnapshotSource({
          defaultReferenceTimestampMs: fixedRefTimeMs,
        });
        scanner.setSnapshotSource(pureFakeSource);

        const signals = await scanner.scanFromSource({
          scenarioId: "crash_loop_backoff",
          referenceTimestampMs: fixedRefTimeMs,
        });

        expect(signals).toHaveLength(1);
        expect(signals[0].signalType).toBe("CRASH_LOOP_BACKOFF");
      });
    });
  });
});
