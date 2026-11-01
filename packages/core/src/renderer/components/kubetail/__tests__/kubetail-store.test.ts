/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { KubetailStore } from "../kubetail-store";
import type { DeploymentStore } from "../../workloads-deployments/store";
import type { PodStore } from "../../workloads-pods/store";
import type { KubetailStreamClient, StreamCallbacks, StreamParams } from "../kubetail-stream-client.injectable";
import { resetLogSequence } from "../kubetail-types";

describe("KubetailStore", () => {
  let store: KubetailStore;
  let mockDeploymentStore: Partial<DeploymentStore>;
  let mockPodStore: Partial<PodStore>;
  let mockStreamClient: KubetailStreamClient;
  const activeStreamCallbacks = new Map<string, StreamCallbacks>();
  const abortedStreams = new Set<string>();
  const streamInvocations: StreamParams[] = [];

  const mockDeployment: any = {
    getName: () => "my-deployment",
    getNs: () => "default",
    getReplicas: () => 2,
  };

  const mockPod1: any = {
    getName: () => "my-deployment-pod-1",
    getNs: () => "default",
    getContainers: () => [{ name: "web" }],
  };

  const mockPod2: any = {
    getName: () => "my-deployment-pod-2",
    getNs: () => "default",
    getContainers: () => [{ name: "web" }],
  };

  let currentPods = [mockPod1, mockPod2];

  beforeEach(() => {
    jest.useFakeTimers();
    resetLogSequence();
    activeStreamCallbacks.clear();
    abortedStreams.clear();
    streamInvocations.length = 0;
    currentPods = [mockPod1, mockPod2];

    mockDeploymentStore = {
      items: [mockDeployment],
      getChildPods: (deployment) => {
        if (deployment.getName() === "my-deployment") {
          return currentPods;
        }

        return [];
      },
    } as any;

    mockPodStore = {
      items: currentPods,
    } as any;

    mockStreamClient = {
      startStream: (params: StreamParams, callbacks: StreamCallbacks) => {
        const streamKey = `${params.podName}/${params.containerName}`;

        activeStreamCallbacks.set(streamKey, callbacks);
        streamInvocations.push(params);

        return {
          abort: () => {
            abortedStreams.add(streamKey);
          },
        };
      },
    };

    store = new KubetailStore({
      deploymentStore: mockDeploymentStore as DeploymentStore,
      podStore: mockPodStore as PodStore,
      streamClient: mockStreamClient,
    });
  });

  afterEach(() => {
    store.destroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("discovers all child pods when a deployment is selected and initializes streams", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");

    expect(store.currentDeploymentPods).toHaveLength(2);
    expect(store.activePodNames.has("my-deployment-pod-1")).toBe(true);
    expect(store.activePodNames.has("my-deployment-pod-2")).toBe(true);
    expect(store.activeStreams.size).toBe(2);
    expect(store.activeStreams.get("my-deployment-pod-1/web")?.status).toBe("STREAMING");
  });

  it("ingests, deduplicates and batches incoming logs chronologically", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");

    const cb1 = activeStreamCallbacks.get("my-deployment-pod-1/web");

    expect(cb1).toBeDefined();

    cb1?.onLine("2026-11-01T02:00:00Z First log line");
    cb1?.onLine("2026-11-01T02:00:01Z Second log line");
    // Duplicate line with identical timestamp and message from the same pod
    cb1?.onLine("2026-11-01T02:00:01Z Second log line");

    // Advance 50ms batch flush
    jest.advanceTimersByTime(60);

    expect(store.logs).toHaveLength(2);
    expect(store.logs[0].message).toBe("First log line");
    expect(store.logs[1].message).toBe("Second log line");
    expect(store.logs[0].podName).toBe("my-deployment-pod-1");
  });

  it("multiplexes concurrent streams from multiple pods into a unified chronological log view", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");

    const cb1 = activeStreamCallbacks.get("my-deployment-pod-1/web");
    const cb2 = activeStreamCallbacks.get("my-deployment-pod-2/web");

    // Pod 2 sends an event first chronologically
    cb2?.onLine("2026-11-01T12:00:00.000Z Pod 2 started");
    // Pod 1 sends an event later
    cb1?.onLine("2026-11-01T12:00:01.000Z Pod 1 started");
    // Pod 2 sends next event
    cb2?.onLine("2026-11-01T12:00:02.000Z Pod 2 ready");

    jest.advanceTimersByTime(60);

    expect(store.logs).toHaveLength(3);
    expect(store.logs[0].podName).toBe("my-deployment-pod-2");
    expect(store.logs[0].message).toBe("Pod 2 started");
    expect(store.logs[1].podName).toBe("my-deployment-pod-1");
    expect(store.logs[1].message).toBe("Pod 1 started");
    expect(store.logs[2].podName).toBe("my-deployment-pod-2");
    expect(store.logs[2].message).toBe("Pod 2 ready");
  });

  it("pauses visual updates and queues pending lines", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");

    store.pause();
    expect(store.isPaused).toBe(true);

    const cb1 = activeStreamCallbacks.get("my-deployment-pod-1/web");

    cb1?.onLine("2026-11-01T02:00:00Z Queued line 1");
    cb1?.onLine("2026-11-01T02:00:01Z Queued line 2");

    jest.advanceTimersByTime(60);

    expect(store.logs).toHaveLength(0);
    expect(store.pendingLogs).toHaveLength(2);

    store.resume();
    expect(store.isPaused).toBe(false);
    expect(store.logs).toHaveLength(2);
    expect(store.pendingLogs).toHaveLength(0);
  });

  it("caps memory when paused for a prolonged period and sets isTruncated", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");
    store.maxPendingLogs = 5;

    store.pause();

    const cb1 = activeStreamCallbacks.get("my-deployment-pod-1/web");

    for (let i = 1; i <= 8; i++) {
      cb1?.onLine(`2026-11-01T00:00:0${i}Z Line ${i}`);
    }

    expect(store.pendingLogs).toHaveLength(5);
    expect(store.isTruncated).toBe(true);
    // Oldest 3 lines were dropped
    expect(store.pendingLogs[0].message).toBe("Line 4");
    expect(store.pendingLogs[4].message).toBe("Line 8");
  });

  it("filters logs by search query (text or regex)", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");

    const cb1 = activeStreamCallbacks.get("my-deployment-pod-1/web");

    cb1?.onLine("2026-11-01T02:00:00Z Error: connection reset by peer");
    cb1?.onLine("2026-11-01T02:00:01Z Info: health check OK");

    jest.advanceTimersByTime(60);

    expect(store.logs).toHaveLength(2);

    store.setSearchQuery("Error");
    expect(store.displayLogs).toHaveLength(1);
    expect(store.displayLogs[0].message).toContain("connection reset");

    store.setSearchQuery("^Info:");
    expect(store.displayLogs).toHaveLength(1);
    expect(store.displayLogs[0].message).toContain("health check");
  });

  it("automatically reconnects with sinceTime when a stream ends unexpectedly", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");

    const streamKey = "my-deployment-pod-1/web";
    const cb1 = activeStreamCallbacks.get(streamKey);

    // Ingest a line so lastSeenTimestamp is recorded
    cb1?.onLine("2026-11-01T15:30:00.500Z Heartbeat OK");
    jest.advanceTimersByTime(60);

    const stream = store.activeStreams.get(streamKey);

    expect(stream?.lastSeenTimestamp).toBe("2026-11-01T15:30:00.500Z");

    const initialInvocationCount = streamInvocations.length;

    // Simulate unexpected stream end by server
    cb1?.onEnd();

    expect(store.activeStreams.get(streamKey)?.status).toBe("RECONNECTING");

    // Advance backoff + jitter timer (max ~2000ms for first retry)
    jest.advanceTimersByTime(2500);

    expect(streamInvocations.length).toBe(initialInvocationCount + 1);
    const lastInvocation = streamInvocations[streamInvocations.length - 1];

    expect(lastInvocation.podName).toBe("my-deployment-pod-1");
    expect(lastInvocation.sinceTime).toBe("2026-11-01T15:30:00.500Z");
  });

  it("does not enter infinite retry loops on HTTP 403 Forbidden errors", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");

    const streamKey = "my-deployment-pod-1/web";
    const cb1 = activeStreamCallbacks.get(streamKey);
    const initialInvocationCount = streamInvocations.length;

    // Simulate HTTP 403 Forbidden
    const error: any = new Error("HTTP 403 Forbidden: pods/log access denied");

    error.statusCode = 403;
    cb1?.onError(error, 403);

    const stream = store.activeStreams.get(streamKey);

    expect(stream?.status).toBe("ERROR");
    expect(stream?.error).toContain("403 Forbidden");

    // Advance timer past any backoff
    jest.advanceTimersByTime(35000);

    // Should NOT have triggered any further startStream calls for this pod
    expect(streamInvocations.length).toBe(initialInvocationCount);
  });

  it("aborts all streams and clears state when namespace or deployment changes", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");

    expect(store.activeStreams.size).toBe(2);

    store.setDeployment("");

    expect(store.activeStreams.size).toBe(0);
    expect(abortedStreams.has("my-deployment-pod-1/web")).toBe(true);
    expect(abortedStreams.has("my-deployment-pod-2/web")).toBe(true);
  });

  it("discovers new pod replicas dynamically and begins streaming", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");

    expect(store.activeStreams.size).toBe(2);

    // Simulate scaling up to 3 replicas
    const mockPod3: any = {
      getName: () => "my-deployment-pod-3",
      getNs: () => "default",
      getContainers: () => [{ name: "web" }],
    };

    currentPods = [mockPod1, mockPod2, mockPod3];

    // Trigger sync
    (store as any).syncStreamsWithPods(currentPods);

    expect(store.activeStreams.size).toBe(3);
    expect(store.activeStreams.has("my-deployment-pod-3/web")).toBe(true);
    expect(store.activeStreams.get("my-deployment-pod-3/web")?.status).toBe("STREAMING");
  });

  it("aborts active streams and clears timers on destroy", () => {
    store.setNamespace("default");
    store.setDeployment("my-deployment");

    store.destroy();

    expect(abortedStreams.has("my-deployment-pod-1/web")).toBe(true);
    expect(abortedStreams.has("my-deployment-pod-2/web")).toBe(true);
    expect(store.logs).toHaveLength(0);
  });
});
