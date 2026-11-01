/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { KubetailStore } from "../kubetail-store";
import type { DeploymentStore } from "../../workloads-deployments/store";
import type { PodStore } from "../../workloads-pods/store";
import type { KubetailStreamClient, StreamCallbacks } from "../kubetail-stream-client.injectable";

describe("Kubetail Milestone 5: Stress Testing & Concurrency Bounds", () => {
  let mockDeploymentStore: Partial<DeploymentStore>;
  let mockPodStore: Partial<PodStore>;
  let mockStreamClient: KubetailStreamClient;
  const activeCallbacks = new Map<string, StreamCallbacks>();
  const abortSpies = new Map<string, jest.Mock>();

  beforeEach(() => {
    activeCallbacks.clear();
    abortSpies.clear();

    mockStreamClient = {
      startStream: (params, callbacks) => {
        const key = `${params.podName}/${params.containerName}`;
        activeCallbacks.set(key, callbacks);
        const abortMock = jest.fn();
        abortSpies.set(key, abortMock);
        return { abort: abortMock };
      },
    };
  });

  describe("Stream Concurrency Limits", () => {
    it("enforces maxConcurrentStreams bound (default 50) when 60 pods are discovered", () => {
      const pods60: any[] = [];
      for (let i = 1; i <= 60; i++) {
        pods60.push({
          getName: () => `worker-pod-${i}`,
          getNs: () => "prod",
          getContainers: () => [{ name: "worker" }],
          getOwnerRefs: () => [{ name: "worker-deploy" }],
        });
      }

      const mockDeployment: any = {
        getName: () => "worker-deploy",
        getNs: () => "prod",
        metadata: { uid: "deploy-60" },
      };

      mockDeploymentStore = {
        items: [mockDeployment],
        getChildPods: () => pods60,
      } as any;

      mockPodStore = { items: pods60 } as any;

      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "worker-deploy",
        namespace: "prod",
      });

      // Default maxConcurrentStreams is 50
      expect(store.maxConcurrentStreams).toBe(50);
      expect(store.activeStreams.size).toBe(50);
      expect(activeCallbacks.size).toBe(50);

      store.destroy();
    });

    it("respects dynamic concurrency bounds adjustment (e.g. 20 and 5)", () => {
      const pods30: any[] = [];
      for (let i = 1; i <= 30; i++) {
        pods30.push({
          getName: () => `api-pod-${i}`,
          getNs: () => "default",
          getContainers: () => [{ name: "server" }],
          getOwnerRefs: () => [{ name: "api-deploy" }],
        });
      }

      const mockDeployment: any = {
        getName: () => "api-deploy",
        getNs: () => "default",
        metadata: { uid: "deploy-30" },
      };

      mockDeploymentStore = {
        items: [mockDeployment],
        getChildPods: () => pods30,
      } as any;

      mockPodStore = { items: pods30 } as any;

      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      store.maxConcurrentStreams = 20;

      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "api-deploy",
        namespace: "default",
      });

      expect(store.activeStreams.size).toBe(20);

      // Now lower to 5
      store.maxConcurrentStreams = 5;
      (store as any).syncStreamsWithPods();
      expect(store.activeStreams.size).toBe(5);

      store.destroy();
    });
  });

  describe("High-Throughput Ingestion & Memory Bounds", () => {
    it("handles 10,000 synthetic lines across 5 concurrent streams and strictly enforces maxLines buffer cap", () => {
      const pods5: any[] = [];
      for (let i = 1; i <= 5; i++) {
        pods5.push({
          getName: () => `srv-pod-${i}`,
          getNs: () => "default",
          getContainers: () => [{ name: "app" }],
          getOwnerRefs: () => [{ name: "srv-deploy" }],
        });
      }

      mockDeploymentStore = {
        items: [{ getName: () => "srv-deploy", getNs: () => "default" } as any],
        getChildPods: () => pods5,
      } as any;
      mockPodStore = { items: pods5 } as any;

      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      store.maxLines = 1000;

      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "srv-deploy",
        namespace: "default",
      });

      expect(activeCallbacks.size).toBe(5);

      const startTime = Date.now();
      const cpuBefore = process.cpuUsage();
      const memBefore = process.memoryUsage().heapUsed;

      // Ingest 2,000 lines per stream = 10,000 total lines
      const streamKeys = Array.from(activeCallbacks.keys());
      for (let lineNum = 1; lineNum <= 2000; lineNum++) {
        for (let sIdx = 0; sIdx < streamKeys.length; sIdx++) {
          const key = streamKeys[sIdx];
          const cb = activeCallbacks.get(key)!;
          const ts = new Date(1700000000000 + lineNum * 10 + sIdx).toISOString();
          cb.onLine(`${ts} Log payload message ${lineNum} from ${key} [status=200, latency=${lineNum % 50}ms]`);
        }
      }

      // Manually trigger flush of remaining batch
      (store as any).flushBatch();

      const durationMs = Date.now() - startTime;
      const cpuAfter = process.cpuUsage(cpuBefore);
      const memAfter = process.memoryUsage().heapUsed;

      // Assertions
      expect(store.logs.length).toBe(1000); // Capped at maxLines! Oldest 9,000 discarded
      expect(durationMs).toBeLessThan(1000); // Ingests 10k lines in < 1 second

      // Total stream line counts tracked accurately
      let totalStreamLines = 0;
      for (const s of store.activeStreams.values()) {
        totalStreamLines += s.lineCount;
      }
      expect(totalStreamLines).toBe(10000);

      // Verify oldest was evicted and newest is present
      const newestEntry = store.logs[store.logs.length - 1];
      expect(newestEntry.message).toContain("2000");

      store.destroy();
    });

    it("bounds seenKeys set to prevent runaway memory leak beyond 20,000 keys", () => {
      const mockDeployment: any = {
        getName: () => "single-pod-deploy",
        getNs: () => "default",
      };
      const mockPod: any = {
        getName: () => "single-pod-1",
        getNs: () => "default",
        getContainers: () => [{ name: "c1" }],
        getOwnerRefs: () => [{ name: "single-pod-deploy" }],
      };

      mockDeploymentStore = {
        items: [mockDeployment],
        getChildPods: () => [mockPod],
      } as any;
      mockPodStore = { items: [mockPod] } as any;

      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "single-pod-deploy",
        namespace: "default",
      });

      const cb = activeCallbacks.get("single-pod-1/c1")!;

      // Ingest 25,000 unique log lines
      for (let i = 1; i <= 25000; i++) {
        const ts = new Date(1700000000000 + i * 5).toISOString();
        cb.onLine(`${ts} Unique event #${i}`);
      }

      // The seenKeys internal set should be pruned down when it exceeds 20,000
      const seenKeysSet = (store as any).seenKeys as Set<string>;
      expect(seenKeysSet.size).toBeLessThanOrEqual(21000);
      expect(seenKeysSet.size).toBeGreaterThanOrEqual(15000);

      store.destroy();
    });

    it("cancels all active streams rapidly with low latency under load", () => {
      const pods20: any[] = [];
      for (let i = 1; i <= 20; i++) {
        pods20.push({
          getName: () => `cancel-pod-${i}`,
          getNs: () => "default",
          getContainers: () => [{ name: "app" }],
          getOwnerRefs: () => [{ name: "cancel-deploy" }],
        });
      }

      mockDeploymentStore = {
        items: [{ getName: () => "cancel-deploy", getNs: () => "default" } as any],
        getChildPods: () => pods20,
      } as any;
      mockPodStore = { items: pods20 } as any;

      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "cancel-deploy",
        namespace: "default",
      });

      expect(store.activeStreams.size).toBe(20);
      expect(abortSpies.size).toBe(20);

      const tStart = Date.now();
      store.stopAllStreams();
      const cancelDurationMs = Date.now() - tStart;

      expect(cancelDurationMs).toBeLessThan(50); // Instant abort < 50ms
      expect(store.activeStreams.size).toBe(0);

      for (const spy of abortSpies.values()) {
        expect(spy).toHaveBeenCalledTimes(1);
      }

      store.destroy();
    });
  });

  describe("Pause & Queue Overflow Under Load", () => {
    it("caps pending logs at maxPendingLogs when paused under heavy burst", () => {
      const mockPod: any = {
        getName: () => "pause-pod-1",
        getNs: () => "default",
        getContainers: () => [{ name: "app" }],
        getOwnerRefs: () => [{ name: "pause-deploy" }],
      };

      mockDeploymentStore = {
        items: [{ getName: () => "pause-deploy", getNs: () => "default" } as any],
        getChildPods: () => [mockPod],
      } as any;
      mockPodStore = { items: [mockPod] } as any;

      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "pause-deploy",
        namespace: "default",
      });

      store.pause();
      expect(store.isPaused).toBe(true);

      const cb = activeCallbacks.get("pause-pod-1/app")!;

      // Ingest 7,000 lines while paused (maxPendingLogs is 2,000)
      for (let i = 1; i <= 7000; i++) {
        const ts = new Date(1700000000000 + i * 10).toISOString();
        cb.onLine(`${ts} Message ${i} during pause`);
      }

      expect(store.pendingLogs.length).toBe(2000);
      expect(store.isTruncated).toBe(true);

      // Resume and verify pending logs are flushed cleanly
      store.resume();
      expect(store.isPaused).toBe(false);
      expect(store.pendingLogs.length).toBe(0);
      expect(store.logs.length).toBeLessThanOrEqual(5000);

      store.destroy();
    });
  });
});
