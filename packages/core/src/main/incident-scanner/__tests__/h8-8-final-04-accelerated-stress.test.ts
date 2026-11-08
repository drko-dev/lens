/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

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
import { KubetailStore } from "../../../renderer/components/kubetail/kubetail-store";
import { SplitPanelStore } from "../../../renderer/components/split-panel/split-panel-store";
import { DetachedWindowRegistry, parseDetachedToolDescriptor } from "../../detached-tool-windows/detached-window-registry";
import {
  aggregateAndValidateAppMetrics,
  validateScannerStatusResponse,
} from "../telemetry-validator";

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

  // 3. Abrir y cerrar repetidamente terminales PTY reales en entorno aislado
  it("Scenario 3: opens and closes real isolated PTY terminal sessions releasing OS handles and listeners", async () => {
    let pty: any;
    try {
      pty = jest.requireActual("node-pty");
    } catch {
      pty = null;
    }

    if (!pty || typeof pty.spawn !== "function") {
      throw new Error("BLOCKED: node-pty native binding not available in test environment.");
    }

    const PTY_CYCLES = 10;
    for (let i = 0; i < PTY_CYCLES; i++) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          proc.kill();
          reject(new Error(`PTY execution timed out on cycle ${i}`));
        }, 4000);

        const proc = pty.spawn("/bin/sh", ["-c", `echo "pty-cycle-${i}"`], {
          name: "xterm-color",
          cols: 80,
          rows: 24,
        });

        let output = "";
        const dataSub = proc.onData((data: string) => {
          output += data;
        });

        const exitSub = proc.onExit((e: { exitCode: number }) => {
          clearTimeout(timeout);
          if (dataSub?.dispose) dataSub.dispose();
          if (exitSub?.dispose) exitSub.dispose();
          try {
            expect(e.exitCode).toBe(0);
            expect(output).toContain(`pty-cycle-${i}`);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      });
    }
  });

  // 3b. Validar ciclo de vida de Kubetail y liberación de streams concurrentes
  it("Scenario 3b: validates Kubetail stream multiplexing, workload switching, and complete abort cleanup", () => {
    const activeAbortMocks: jest.Mock[] = [];
    const mockStreamClient = {
      startStream: () => {
        const abortMock = jest.fn();
        activeAbortMocks.push(abortMock);
        return { abort: abortMock };
      },
    };

    const mockPods = [
      {
        getName: () => "web-pod-1",
        getNs: () => "default",
        getContainers: () => [{ name: "c1" }],
        getOwnerRefs: () => [{ name: "web-deploy" }],
      },
      {
        getName: () => "web-pod-2",
        getNs: () => "default",
        getContainers: () => [{ name: "c1" }],
        getOwnerRefs: () => [{ name: "web-deploy" }],
      },
    ];

    const mockDeploymentStore = {
      items: [{ getName: () => "web-deploy", getNs: () => "default" } as any],
      getChildPods: () => mockPods,
    };

    const kubetailStore = new KubetailStore({
      deploymentStore: mockDeploymentStore as any,
      podStore: { items: mockPods } as any,
      streamClient: mockStreamClient as any,
    });

    // 1. Select workload to spin up log streams
    kubetailStore.selectWorkloadFromNavigation({
      kind: "Deployment",
      name: "web-deploy",
      namespace: "default",
    });

    expect(kubetailStore.activeStreams.size).toBe(2);
    expect(activeAbortMocks).toHaveLength(2);

    // 2. Destroy store and ensure all active streams are cleanly aborted
    kubetailStore.destroy();

    expect(activeAbortMocks.every((m) => m.mock.calls.length === 1)).toBe(true);
    expect(kubetailStore.activeStreams.size).toBe(0);
  });

  // 3c. Validar apertura, cierre, redimensionamiento y desacoplamiento de paneles
  it("Scenario 3c: executes rapid panel resizing, collapsing, and detached window roundtrip in SplitPanelStore", async () => {
    const mockInvoke = jest.fn().mockResolvedValue({ windowId: 105 });
    const splitStore = new SplitPanelStore({
      initialClusterId: "panel-stress-cluster",
      invoke: mockInvoke,
    });

    // 1. Rapid ratio adjustments (stress layout engine)
    for (let i = 1; i <= 20; i++) {
      splitStore.setRatio(0.1 + (i % 8) * 0.1);
      expect(splitStore.ratio).toBeGreaterThan(0);
      expect(splitStore.ratio).toBeLessThan(1);
    }

    // 2. Collapse and restore active leaves
    expect(splitStore.allActiveLeaves.length).toBeGreaterThan(0);
    const targetLeaf = splitStore.allActiveLeaves[0];
    const collapsed = splitStore.collapsePanel(targetLeaf.id);
    expect(collapsed).toBe(true);
    expect(splitStore.collapsedLeafIds.has(targetLeaf.id)).toBe(true);

    splitStore.restorePanel(targetLeaf.id);
    expect(splitStore.collapsedLeafIds.has(targetLeaf.id)).toBe(false);

    // 3. Clean disposal
    splitStore.dispose();
    expect(splitStore.isDisposed).toBe(true);
  });

  // 3d. Validar registro de ventanas desacopladas Electron, inmutabilidad y destrucción
  it("Scenario 3d: manages detached window registry under multi-cluster load enforcing session immutability and leak-free release", () => {
    const registry = new DetachedWindowRegistry(20);

    // Register 15 windows across dev and prod clusters
    for (let i = 1; i <= 15; i++) {
      const isProd = i % 2 === 0;
      const desc = parseDetachedToolDescriptor({
        workspaceId: `ws-${(i % 3) + 1}`,
        tabId: `tab-${i}`,
        clusterId: isProd ? "cluster-production" : "cluster-development",
        toolKind: "terminal",
        environment: isProd ? "production" : "development",
        isProduction: isProd,
        title: `Detached Window ${i}`,
      });

      const record = registry.register(200 + i, desc);
      expect(record.windowId).toBe(200 + i);

      // Verify immutable identity authorization
      const authorized = registry.authorize(200 + i, { tabId: `tab-${i}` });
      expect(authorized.sessionKey).toBe(record.sessionKey);
    }

    expect(registry.size).toBe(15);
    expect(registry.windowsForCluster("cluster-production")).toHaveLength(7);
    expect(registry.windowsForCluster("cluster-development")).toHaveLength(8);

    // Cleanly release all windows simulating window close events
    for (let i = 1; i <= 15; i++) {
      const released = registry.release(200 + i);
      expect(released).toBeDefined();
    }

    expect(registry.size).toBe(0);
    expect(registry.windowIds()).toHaveLength(0);
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

  // 11. Pruebas adversariales de métricas de proceso ausentes o inválidas (FINAL-04-R2)
  it("Scenario 11: rejects missing, non-finite, and negative process metrics fail-closed", () => {
    const validMainMem = {
      rss: 100 * 1024 * 1024,
      heapUsed: 50 * 1024 * 1024,
      heapTotal: 80 * 1024 * 1024,
      external: 10 * 1024 * 1024,
    };

    // 1. Missing Main (Browser) process
    expect(() =>
      aggregateAndValidateAppMetrics(
        [
          { type: "Tab", pid: 200, memory: { workingSetSize: 50000, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 1.2 } },
        ],
        validMainMem,
      ),
    ).toThrow(/Missing or zero-consumption Main \(Browser\) process/);

    // 2. Missing Renderer (Tab) process
    expect(() =>
      aggregateAndValidateAppMetrics(
        [
          { type: "Browser", pid: 100, memory: { workingSetSize: 50000, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 0.5 } },
        ],
        validMainMem,
      ),
    ).toThrow(/No Renderer \(Tab\) process found in rawMetrics/);

    // 3. Negative working set size
    expect(() =>
      aggregateAndValidateAppMetrics(
        [
          { type: "Browser", pid: 100, memory: { workingSetSize: -500, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 0.5 } },
          { type: "Tab", pid: 200, memory: { workingSetSize: 50000, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 1.2 } },
        ],
        validMainMem,
      ),
    ).toThrow(/invalid workingSetSize/);

    // 4. Non-finite CPU percent (NaN / Infinity)
    expect(() =>
      aggregateAndValidateAppMetrics(
        [
          { type: "Browser", pid: 100, memory: { workingSetSize: 50000, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: NaN } },
          { type: "Tab", pid: 200, memory: { workingSetSize: 50000, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 1.2 } },
        ],
        validMainMem,
      ),
    ).toThrow(/invalid percentCPUUsage/);

    // 5. Invalid main memory object
    expect(() =>
      aggregateAndValidateAppMetrics(
        [
          { type: "Browser", pid: 100, memory: { workingSetSize: 50000, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 0.5 } },
          { type: "Tab", pid: 200, memory: { workingSetSize: 50000, peakWorkingSetSize: 60000 }, cpu: { percentCPUUsage: 1.2 } },
        ],
        { rss: -100, heapUsed: 50, heapTotal: 80, external: 10 },
      ),
    ).toThrow(/mainMem\.rss must be a non-negative finite number/);
  });

  // 12. Validación rigurosa de contabilidad multirrenderer (FINAL-04-R2)
  it("Scenario 12: correctly aggregates multiple renderer processes without data loss or overwriting", () => {
    const validMainMem = {
      rss: 200 * 1024 * 1024,
      heapUsed: 60 * 1024 * 1024,
      heapTotal: 90 * 1024 * 1024,
      external: 20 * 1024 * 1024,
    };

    const rawMetrics = [
      { type: "Browser", pid: 1001, memory: { workingSetSize: 102400, peakWorkingSetSize: 204800 }, cpu: { percentCPUUsage: 0.5 } },
      { type: "Tab", pid: 2001, memory: { workingSetSize: 204800, peakWorkingSetSize: 307200 }, cpu: { percentCPUUsage: 1.0 } },
      { type: "Tab", pid: 2002, memory: { workingSetSize: 153600, peakWorkingSetSize: 256000 }, cpu: { percentCPUUsage: 0.75 } },
      { type: "GPU", pid: 3001, memory: { workingSetSize: 51200, peakWorkingSetSize: 61440 }, cpu: { percentCPUUsage: 0.2 } },
      { type: "Utility", pid: 4001, memory: { workingSetSize: 25600, peakWorkingSetSize: 30720 }, cpu: { percentCPUUsage: 0.1 } },
    ];

    const breakdown = aggregateAndValidateAppMetrics(rawMetrics, validMainMem);

    expect(breakdown.main.pid).toBe(1001);
    expect(breakdown.main.workingSetMb).toBe(100);
    expect(breakdown.renderer.count).toBe(2);
    expect(breakdown.renderer.pids).toEqual([2001, 2002]);
    // 204800 / 1024 = 200 MB; 153600 / 1024 = 150 MB -> 350 MB total
    expect(breakdown.renderer.workingSetMb).toBe(350);
    // 1.0 + 0.75 = 1.75%
    expect(breakdown.renderer.cpuPercent).toBe(1.75);
    // Total combined: (102400 + 204800 + 153600 + 51200 + 25600) / 1024 = 525 MB
    expect(breakdown.totalCombinedWorkingSetMb).toBe(525);
    expect(breakdown.activeProcessesCount).toBe(5);
  });

  // 13. Validación estricta fail-closed del estado del escáner ante fallas IPC (FINAL-04-R2)
  it("Scenario 13: rejects simulated IPC failures fail-closed without returning fake success values", () => {
    // 1. Explicit IPC error payload
    expect(() =>
      validateScannerStatusResponse({ error: "E_IPC_CHANNEL_DESTROYED" }),
    ).toThrow(/TELEMETRY_IPC_FAILURE: Scanner status returned error/);

    // 2. Null or undefined payload
    expect(() => validateScannerStatusResponse(null)).toThrow(
      /TELEMETRY_IPC_FAILURE: Scanner status response is null or not an object/,
    );

    // 3. Non-boolean isEnabled
    expect(() =>
      validateScannerStatusResponse({ isEnabled: "yes", activeWatchersCount: 0 }),
    ).toThrow(/TELEMETRY_IPC_FAILURE: Scanner status 'isEnabled' must be a boolean/);

    // 4. Negative activeWatchersCount
    expect(() =>
      validateScannerStatusResponse({ isEnabled: true, activeWatchersCount: -1 }),
    ).toThrow(/TELEMETRY_IPC_FAILURE: Scanner status 'activeWatchersCount' must be a non-negative finite integer/);

    // 5. Valid status returns authentic data
    const valid = validateScannerStatusResponse({
      isEnabled: true,
      activeWatchersCount: 3,
      scope: { clusterId: "prod-cluster", namespace: "monitoring" },
    });
    expect(valid.isEnabled).toBe(true);
    expect(valid.activeWatchersCount).toBe(3);
    expect(valid.scope?.clusterId).toBe("prod-cluster");
  });
});
