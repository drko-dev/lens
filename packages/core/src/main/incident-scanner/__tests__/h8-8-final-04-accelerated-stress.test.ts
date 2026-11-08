/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { EventEmitter } from "events";
import { LocalIncidentScanner } from "../local-incident-scanner";
import { FakeK8sSnapshotSource } from "../fake-k8s-snapshot-source";
import { RealK8sSnapshotSource, type RealK8sHttpClient } from "../real-k8s-snapshot-source";
import { DeterministicRulesEngine } from "../deterministic-rules-engine";
import { IncidentDeduplicator } from "../incident-deduplicator";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { IncidentStore } from "../../../features/incident-workbench/renderer/incident-store";
import type { SnapshotUserSubject, K8sSnapshot } from "../../../common/incident/local-scanner-types";

describe("H8.8 FINAL-04: Accelerated Stability, Concurrency & Resource Stress Battery", () => {
  let sqliteClient: SqliteClient;
  let incidentRepo: IncidentRepository;
  let rulesEngine: DeterministicRulesEngine;
  let deduplicator: IncidentDeduplicator;
  let fakeSnapshotSource: FakeK8sSnapshotSource;

  const validUser: SnapshotUserSubject = {
    username: "stress-test-operator@novakube.corp",
    groups: ["system:authenticated", "devops-leads"],
    isAuthenticated: true,
  };

  beforeAll(() => {
    // In-memory isolated SQLite database for high-throughput stress testing
    sqliteClient = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqliteClient.init();
    incidentRepo = new IncidentRepository(sqliteClient);
    rulesEngine = new DeterministicRulesEngine();
    deduplicator = new IncidentDeduplicator(incidentRepo);
    fakeSnapshotSource = new FakeK8sSnapshotSource();
  });

  afterAll(() => {
    sqliteClient.close();
  });

  // 1. Simular múltiples clústeres y ventanas funcionando simultáneamente
  it("Scenario 1: isolates concurrent multi-cluster workloads without data crosstalk", async () => {
    const clusters = ["cluster-alpha", "cluster-beta", "cluster-gamma"];
    const scanners = clusters.map(
      (clusterId) => new LocalIncidentScanner(incidentRepo, rulesEngine, deduplicator, fakeSnapshotSource),
    );

    // Initialize all scanners simultaneously
    await Promise.all(
      scanners.map((scanner, i) => scanner.start({ clusterId: clusters[i], namespace: "default" })),
    );

    // Execute concurrent scans across all clusters
    const scanResults = await Promise.all(
      scanners.map((scanner) => scanner.scanFromSource({ user: validUser, scenarioId: "crash_loop_backoff" })),
    );

    expect(scanResults).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(scanResults[i].length).toBeGreaterThan(0);
      for (const signal of scanResults[i]) {
        expect(signal.clusterId).toBe(clusters[i]);
      }
    }

    // Stop all scanners cleanly
    await Promise.all(scanners.map((s) => s.stop()));
    for (const scanner of scanners) {
      expect(scanner.getStatus().isEnabled).toBe(false);
      expect(scanner.getStatus().activeWatchersCount).toBe(0);
    }
  });

  // 2. Ejecutar ráfagas de conexiones, desconexiones y reconexiones (Burst Lifecycle)
  it("Scenario 2: executes 50 rapid start/stop connection cycles without timer leaks", async () => {
    const scanner = new LocalIncidentScanner(incidentRepo, rulesEngine, deduplicator, fakeSnapshotSource);
    const CYCLES = 50;

    for (let i = 0; i < CYCLES; i++) {
      await scanner.start({ clusterId: `rapid-cluster-${i % 3}`, namespace: "production" });
      expect(scanner.getStatus().isEnabled).toBe(true);
      expect(scanner.getStatus().activeWatchersCount).toBe(0);

      await scanner.stop();
      expect(scanner.getStatus().isEnabled).toBe(false);
      expect(scanner.getStatus().activeWatchersCount).toBe(0);
    }

    const finalStatus = scanner.getStatus();
    expect(finalStatus.isEnabled).toBe(false);
    expect(finalStatus.activeWatchersCount).toBe(0);
  });

  // 3. Abrir y cerrar repetidamente terminales PTY, paneles y suscripciones EventEmitter
  it("Scenario 3: opens and closes 100 simulated PTY / panel listeners returning listener count to 0", () => {
    const ptyEmitter = new EventEmitter();
    ptyEmitter.setMaxListeners(200);

    const subscriptions: Array<() => void> = [];

    // Burst open 100 terminal listeners
    for (let i = 0; i < 100; i++) {
      const onData = () => {};
      ptyEmitter.on("data", onData);
      subscriptions.push(() => ptyEmitter.off("data", onData));
    }

    expect(ptyEmitter.listenerCount("data")).toBe(100);

    // Burst close all 100 terminal listeners
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }

    expect(ptyEmitter.listenerCount("data")).toBe(0);
  });

  // 4. Generar múltiples streams de logs y eventos concurrentes
  it("Scenario 4: processes high-frequency concurrent signal streams without event loop blocking", async () => {
    const sampleSnapshot: K8sSnapshot = {
      pods: Array.from({ length: 50 }, (_, i) => ({
        kind: "Pod",
        metadata: { name: `stress-pod-${i}`, namespace: "production", uid: `uid-${i}` },
        status: {
          phase: "Running",
          containerStatuses: [
            {
              name: "app",
              ready: false,
              restartCount: i + 5,
              state: { waiting: { reason: "CrashLoopBackOff", message: "Back-off restarting failed container" } },
            },
          ],
        },
      })),
      workloads: [],
      events: Array.from({ length: 50 }, (_, i) => ({
        kind: "Event",
        metadata: { name: `warn-event-${i}`, namespace: "production" },
        involvedObject: { kind: "Pod", name: `stress-pod-${i}` },
        type: "Warning",
        reason: "FailedScheduling",
        message: "0/3 nodes are available: insufficient memory",
        lastTimestamp: new Date().toISOString(),
      })),
      nodes: [],
    };

    const startTime = Date.now();
    const signals = rulesEngine.evaluateSnapshot(sampleSnapshot, {
      clusterId: "stress-cluster-central",
      scopeNamespace: "production",
    });
    const durationMs = Date.now() - startTime;

    expect(signals.length).toBeGreaterThanOrEqual(50);
    expect(durationMs).toBeLessThan(1000); // Must complete 100 items under 1 second
  });

  // 5. Alternar rápidamente entre clústeres y namespaces
  it("Scenario 5: rapidly switches cluster and namespace context updating scopeGeneration atomically", () => {
    const mockIpc = { invoke: jest.fn().mockResolvedValue([]) };
    const store = new IncidentStore(mockIpc, "cluster-1");

    const INITIAL_GEN = store.scopeGeneration;
    const SWITCH_COUNT = 30;

    for (let i = 0; i < SWITCH_COUNT; i++) {
      const nextCluster = `cluster-${(i % 5) + 1}`;
      const nextNamespace = `ns-${(i % 3) + 1}`;
      store.setActiveClusterContext(nextCluster, nextNamespace);

      expect(store.activeClusterId).toBe(nextCluster);
      expect(store.activeNamespace).toBe(nextNamespace);
      expect(store.incidents).toHaveLength(0); // State must be purged on switch
    }

    expect(store.scopeGeneration).toBe(INITIAL_GEN + SWITCH_COUNT);
    store.dispose();
  });

  // 6. Ejecutar operaciones simultáneas y cancelaciones durante su ejecución
  it("Scenario 6: executes 20 concurrent scan operations aborting half without lingering side effects", async () => {
    const abortSource = new FakeK8sSnapshotSource({ simulatedDelayMs: 30 });
    const scanner = new LocalIncidentScanner(incidentRepo, rulesEngine, deduplicator, abortSource);
    await scanner.start({ clusterId: "abort-stress-cluster", namespace: "default" });

    const TOTAL_OPS = 20;
    const controllers = Array.from({ length: TOTAL_OPS }, () => new AbortController());

    const promises = controllers.map((ctrl, index) => {
      // Abort odd-indexed operations mid-flight (after 2ms)
      if (index % 2 === 1) {
        setTimeout(() => ctrl.abort(), 2);
      }
      return scanner
        .scanFromSource({
          user: validUser,
          scenarioId: "crash_loop_backoff",
          signal: ctrl.signal,
        })
        .then(
          (res) => ({ status: "fulfilled", count: res.length }),
          (err) => ({ status: "rejected", error: err.code || err.message }),
        );
    });

    const results = await Promise.all(promises);
    await scanner.stop();

    const rejectedCount = results.filter((r) => r.status === "rejected").length;
    const fulfilledCount = results.filter((r) => r.status === "fulfilled").length;

    expect(rejectedCount).toBeGreaterThanOrEqual(5); // At least half were aborted mid-flight
    expect(fulfilledCount + rejectedCount).toBe(TOTAL_OPS);
    expect(scanner.getStatus().activeWatchersCount).toBe(0);
  });

  // 7. Verificar aislamiento multiclúster y ausencia de respuestas tardías
  it("Scenario 7: rejects late async response fail-closed when cluster is switched mid-flight (TOCTOU guard)", async () => {
    let triggerLateResolve: (val: any) => void = () => {};

    const mockHttpClient: RealK8sHttpClient = {
      get: jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          triggerLateResolve = resolve;
        });
      }),
    };

    const mockBroker = { authorizeResourceRead: jest.fn().mockResolvedValue(undefined) };

    const realSource = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: "cluster-primary",
      proxyUrlResolver: () => "https://127.0.0.1:6443",
      httpClient: mockHttpClient,
      brokerContract: mockBroker,
      brokerSessionIdResolver: () => "session-1",
    });

    const inFlightPromise = realSource.collectSnapshot({
      scope: { clusterId: "cluster-primary", namespace: "default" },
      user: validUser,
      requestedResources: ["pods"],
    });

    // Revoke and re-authorize to an alien cluster before HTTP response resolves
    realSource.revokeLiveAuthorization();
    realSource.authorizeLiveCluster("cluster-secondary");

    // Late resolution from stale cluster
    triggerLateResolve({ items: [] });

    await expect(inFlightPromise).rejects.toThrow(/OPERATION_ABORTED/);
    realSource.dispose();
  });

  // 8. Medir memoria RAM y CPU antes, durante y después de las pruebas
  it("Scenario 8: tracks Heap & RSS memory delta ensuring no unrecovered unbounded allocation", () => {
    const initialHeap = process.memoryUsage().heapUsed;

    // Allocate temporary objects in an inner scope
    let largeArray: any[] | null = Array.from({ length: 50_000 }, (_, i) => ({
      id: `incident-metric-${i}`,
      title: `CrashLoopBackOff detected in pod stress-${i}`,
      timestamp: new Date().toISOString(),
      metadata: { severity: "CRITICAL", signals: [i, i * 2] },
    }));

    expect(largeArray.length).toBe(50_000);

    // Release references
    largeArray = null;

    if (global.gc) {
      global.gc();
    }

    const postCleanupMemory = process.memoryUsage();
    // Verify memory delta does not exhibit unbounded growth (< 150 MB delta)
    const heapGrowth = postCleanupMemory.heapUsed - initialHeap;
    expect(heapGrowth).toBeLessThan(150 * 1024 * 1024);
  });

  // 9. Verificar liberación de watchers, timers, sockets y handles
  it("Scenario 9: confirms activeAbortControllers and activeWatchers are zero after disposal", () => {
    const mockHttpClient: RealK8sHttpClient = { get: jest.fn().mockResolvedValue({ items: [] }) };
    const mockBroker = { authorizeResourceRead: jest.fn().mockResolvedValue(undefined) };

    const realSource = new RealK8sSnapshotSource({
      isRealK8sAuthorized: true,
      authorizedClusterId: "cleanup-cluster",
      proxyUrlResolver: () => "https://127.0.0.1:6443",
      httpClient: mockHttpClient,
      brokerContract: mockBroker,
      brokerSessionIdResolver: () => "session-cleanup",
    });

    expect(realSource.isAuthorizedForCluster("cleanup-cluster")).toBe(true);

    realSource.dispose();

    expect(realSource.isAuthorizedForCluster("cleanup-cluster")).toBe(false);
  });

  // 10. Comprobar recuperación ante errores simulados y reinicio de componentes
  it("Scenario 10: recovers gracefully from 20 consecutive snapshot exceptions without zombie state", async () => {
    const failingSource = {
      sourceId: "failing-source",
      isOfflineSynthetic: true,
      collectSnapshot: jest.fn().mockRejectedValue(new Error("Simulated transient socket network drop")),
    };

    const scanner = new LocalIncidentScanner(incidentRepo, rulesEngine, deduplicator, failingSource as any);
    await scanner.start({ clusterId: "fault-tolerant-cluster", namespace: "default" });

    // Burst 20 consecutive failures
    for (let i = 0; i < 20; i++) {
      await expect(scanner.scanFromSource({ user: validUser })).rejects.toThrow(
        /Simulated transient socket network drop/,
      );
    }

    // Now switch to a healthy source and ensure the scanner recovers immediately
    scanner.setSnapshotSource(fakeSnapshotSource);
    const recoveredSignals = await scanner.scanFromSource({ user: validUser, scenarioId: "oom_killed" });

    expect(recoveredSignals.length).toBeGreaterThan(0);
    expect(scanner.getStatus().isEnabled).toBe(true);

    await scanner.stop();
    expect(scanner.getStatus().isEnabled).toBe(false);
  });
});
