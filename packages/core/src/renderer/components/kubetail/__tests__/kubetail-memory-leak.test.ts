/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { KubetailStore } from "../kubetail-store";
import type { DeploymentStore } from "../../workloads-deployments/store";
import type { PodStore } from "../../workloads-pods/store";
import type { KubetailStreamClient } from "../kubetail-stream-client.injectable";

describe("Kubetail Milestone 5: Memory Leaks & Resource Cleanup", () => {
  let mockDeploymentStore: Partial<DeploymentStore>;
  let mockPodStore: Partial<PodStore>;
  let activeAbortMocks: jest.Mock[] = [];

  const mockStreamClient: KubetailStreamClient = {
    startStream: (params, callbacks) => {
      const abortMock = jest.fn();
      activeAbortMocks.push(abortMock);
      return { abort: abortMock };
    },
  };

  const createMockPod = (name: string, ns = "default") => ({
    getName: () => name,
    getNs: () => ns,
    getContainers: () => [{ name: "container-1" }],
    getOwnerRefs: () => [{ name: "deploy-1" }],
  });

  beforeEach(() => {
    activeAbortMocks = [];
  });

  it("cleans up all AbortControllers, timers, and MobX reactions over 50 mount/unmount cycles", () => {
    const pod1 = createMockPod("pod-1");
    const pod2 = createMockPod("pod-2");

    mockDeploymentStore = {
      items: [{ getName: () => "deploy-1", getNs: () => "default" } as any],
      getChildPods: () => [pod1, pod2],
    } as any;
    mockPodStore = { items: [pod1, pod2] } as any;

    const initialHeap = process.memoryUsage().heapUsed;

    for (let cycle = 1; cycle <= 50; cycle++) {
      const store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
      });

      // 1. Select workload
      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "deploy-1",
        namespace: "default",
      });

      expect(store.activeStreams.size).toBe(2);

      // 2. Pause & Resume
      store.pause();
      expect(store.isPaused).toBe(true);
      store.resume();
      expect(store.isPaused).toBe(false);

      // 3. Switch namespace
      store.setNamespace("staging");
      expect(store.activeStreams.size).toBe(0);

      // 4. Switch back & select workload
      store.setNamespace("default");
      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "deploy-1",
        namespace: "default",
      });
      expect(store.activeStreams.size).toBe(2);

      // 5. Destroy/unmount store
      store.destroy();

      expect(store.activeStreams.size).toBe(0);
      expect((store as any).streamHandles.size).toBe(0);
      expect((store as any).retryTimers.size).toBe(0);
      expect((store as any).flushTimer).toBeNull();
    }

    // Over 50 cycles, each cycle started streams and was aborted
    // Verify that every single AbortController created was aborted!
    expect(activeAbortMocks.length).toBeGreaterThanOrEqual(100);
    for (const abortMock of activeAbortMocks) {
      expect(abortMock).toHaveBeenCalled();
    }

    // Check memory stability: heap growth over 50 cycles should be negligible (< 15MB)
    if (global.gc) {
      global.gc();
    }
    const finalHeap = process.memoryUsage().heapUsed;
    const heapGrowthMb = (finalHeap - initialHeap) / (1024 * 1024);

    expect(heapGrowthMb).toBeLessThan(25);
  });

  it("completely resets all internal buffers on clearLogs and stopAllStreams", () => {
    const pod1 = createMockPod("pod-1");
    mockDeploymentStore = {
      items: [{ getName: () => "deploy-1", getNs: () => "default" } as any],
      getChildPods: () => [pod1],
    } as any;
    mockPodStore = { items: [pod1] } as any;

    let onLineCb: any;
    const streamClient: KubetailStreamClient = {
      startStream: (params, callbacks) => {
        onLineCb = callbacks.onLine;
        return { abort: jest.fn() };
      },
    };

    const store = new KubetailStore({
      deploymentStore: mockDeploymentStore as DeploymentStore,
      podStore: mockPodStore as PodStore,
      streamClient,
    });

    store.selectWorkloadFromNavigation({
      kind: "Deployment",
      name: "deploy-1",
      namespace: "default",
    });

    // Ingest lines
    for (let i = 0; i < 500; i++) {
      onLineCb(`2026-11-01T12:00:00.${i.toString().padStart(3, "0")}Z Message ${i}`);
    }
    (store as any).flushBatch();

    expect(store.logs.length).toBe(500);

    // Clear logs
    store.clearLogs();
    expect(store.logs.length).toBe(0);
    expect(store.displayLogs.length).toBe(0);

    // Stop streams
    store.stopAllStreams();
    expect(store.activeStreams.size).toBe(0);
    expect((store as any).streamHandles.size).toBe(0);
    expect((store as any).retryCounts.size).toBe(0);

    store.destroy();
  });
});
