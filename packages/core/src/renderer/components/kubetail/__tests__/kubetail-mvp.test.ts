/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { KubetailStore } from "../kubetail-store";
import type { DeploymentStore } from "../../workloads-deployments/store";
import type { StatefulSetStore } from "../../workloads-statefulsets/store";
import type { DaemonSetStore } from "../../workloads-daemonsets/store";
import type { PodStore } from "../../workloads-pods/store";
import type { KubetailStreamClient, StreamCallbacks, StreamParams } from "../kubetail-stream-client.injectable";
import { resetLogSequence, formatLogsAsText, formatLogsAsJsonl } from "../kubetail-types";
import type { LogEntry } from "../kubetail-types";

describe("Kubetail MVP Features (Milestone 3)", () => {
  let store: KubetailStore;
  let mockDeploymentStore: Partial<DeploymentStore>;
  let mockStatefulSetStore: Partial<StatefulSetStore>;
  let mockDaemonSetStore: Partial<DaemonSetStore>;
  let mockPodStore: Partial<PodStore>;
  let mockStreamClient: KubetailStreamClient;
  const activeStreamCallbacks = new Map<string, StreamCallbacks>();
  const abortedStreams = new Set<string>();
  const streamInvocations: StreamParams[] = [];

  const mockDeployment: any = {
    getName: () => "web-deploy",
    getNs: () => "prod",
  };

  const mockStatefulSet: any = {
    getName: () => "db-redis",
    getNs: () => "prod",
  };

  const mockDaemonSet: any = {
    getName: () => "node-exporter",
    getNs: () => "prod",
  };

  const mockStandalonePod: any = {
    getName: () => "debug-toolbox",
    getNs: () => "prod",
    getContainers: () => [{ name: "toolbox" }],
    getOwnerRefs: () => [],
  };

  const stsPod0: any = {
    getName: () => "db-redis-0",
    getNs: () => "prod",
    getContainers: () => [{ name: "redis" }, { name: "exporter" }],
    getOwnerRefs: () => [{ name: "db-redis" }],
  };

  const stsPod1: any = {
    getName: () => "db-redis-1",
    getNs: () => "prod",
    getContainers: () => [{ name: "redis" }, { name: "exporter" }],
    getOwnerRefs: () => [{ name: "db-redis" }],
  };

  const dsPod1: any = {
    getName: () => "node-exporter-abc",
    getNs: () => "prod",
    getContainers: () => [{ name: "collector" }],
    getOwnerRefs: () => [{ name: "node-exporter" }],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    resetLogSequence();
    activeStreamCallbacks.clear();
    abortedStreams.clear();
    streamInvocations.length = 0;

    mockDeploymentStore = {
      items: [mockDeployment],
      getChildPods: () => [],
    } as any;

    mockStatefulSetStore = {
      items: [mockStatefulSet],
      getChildPods: (sts: any) => {
        if (sts.getName() === "db-redis") {
          return [stsPod0, stsPod1];
        }
        return [];
      },
    } as any;

    mockDaemonSetStore = {
      items: [mockDaemonSet],
      getChildPods: (ds: any) => {
        if (ds.getName() === "node-exporter") {
          return [dsPod1];
        }
        return [];
      },
    } as any;

    mockPodStore = {
      items: [mockStandalonePod, stsPod0, stsPod1, dsPod1],
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
      statefulSetStore: mockStatefulSetStore as StatefulSetStore,
      daemonSetStore: mockDaemonSetStore as DaemonSetStore,
      podStore: mockPodStore as PodStore,
      streamClient: mockStreamClient,
    });
  });

  afterEach(() => {
    store.destroy();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("Multi-Workload Support", () => {
    it("lists available workloads across Deployments, StatefulSets, DaemonSets and Pods", () => {
      store.setNamespace("prod");

      const workloads = store.availableWorkloads;
      expect(workloads.map(w => `${w.kind}:${w.name}`)).toEqual([
        "DaemonSet:node-exporter",
        "Deployment:web-deploy",
        "Pod:debug-toolbox",
        "StatefulSet:db-redis",
      ]);
    });

    it("streams child pods for a StatefulSet with multiple containers", () => {
      store.setNamespace("prod");
      store.setWorkload("StatefulSet", "db-redis");

      expect(store.currentResourcePods).toHaveLength(2);
      expect(store.activePodNames.has("db-redis-0")).toBe(true);
      expect(store.activePodNames.has("db-redis-1")).toBe(true);
      expect(store.availableContainers).toEqual(["exporter", "redis"]);
      expect(store.activeContainerNames.has("redis")).toBe(true);
      expect(store.activeContainerNames.has("exporter")).toBe(true);

      // 2 pods * 2 containers = 4 streams
      expect(store.activeStreams.size).toBe(4);
      expect(activeStreamCallbacks.has("db-redis-0/redis")).toBe(true);
      expect(activeStreamCallbacks.has("db-redis-0/exporter")).toBe(true);
      expect(activeStreamCallbacks.has("db-redis-1/redis")).toBe(true);
      expect(activeStreamCallbacks.has("db-redis-1/exporter")).toBe(true);
    });

    it("streams child pods for a DaemonSet", () => {
      store.setNamespace("prod");
      store.setWorkload("DaemonSet", "node-exporter");

      expect(store.currentResourcePods).toHaveLength(1);
      expect(store.activePodNames.has("node-exporter-abc")).toBe(true);
      expect(store.activeStreams.size).toBe(1);
      expect(activeStreamCallbacks.has("node-exporter-abc/collector")).toBe(true);
    });

    it("streams a standalone Pod", () => {
      store.setNamespace("prod");
      store.setWorkload("Pod", "debug-toolbox");

      expect(store.currentResourcePods).toHaveLength(1);
      expect(store.currentResourcePods[0].getName()).toBe("debug-toolbox");
      expect(store.activeStreams.size).toBe(1);
      expect(activeStreamCallbacks.has("debug-toolbox/toolbox")).toBe(true);
    });
  });

  describe("Granular Pod and Container Selection", () => {
    beforeEach(() => {
      store.setNamespace("prod");
      store.setWorkload("StatefulSet", "db-redis");
    });

    it("allows toggling individual pods on and off", () => {
      expect(store.activeStreams.size).toBe(4);

      // Disable db-redis-0
      store.togglePod("db-redis-0");
      expect(store.activePodNames.has("db-redis-0")).toBe(false);
      expect(store.activePodNames.has("db-redis-1")).toBe(true);
      expect(store.activeStreams.size).toBe(2);
      expect(abortedStreams.has("db-redis-0/redis")).toBe(true);
      expect(abortedStreams.has("db-redis-0/exporter")).toBe(true);

      // Re-enable db-redis-0
      store.togglePod("db-redis-0");
      expect(store.activePodNames.has("db-redis-0")).toBe(true);
      expect(store.activeStreams.size).toBe(4);
    });

    it("allows toggling individual containers on and off across all active pods", () => {
      expect(store.activeStreams.size).toBe(4);

      // Disable 'exporter' container
      store.toggleContainer("exporter");
      expect(store.activeContainerNames.has("exporter")).toBe(false);
      expect(store.activeContainerNames.has("redis")).toBe(true);
      expect(store.activeStreams.size).toBe(2);
      expect(abortedStreams.has("db-redis-0/exporter")).toBe(true);
      expect(abortedStreams.has("db-redis-1/exporter")).toBe(true);

      // Only 'redis' container streams remain active
      expect(store.activeStreams.has("db-redis-0/redis")).toBe(true);
      expect(store.activeStreams.has("db-redis-1/redis")).toBe(true);
    });

    it("handles selectAllPods and deselectAllPods correctly", () => {
      store.deselectAllPods();
      expect(store.activePodNames.size).toBe(0);
      expect(store.activeStreams.size).toBe(0);

      store.selectAllPods();
      expect(store.activePodNames.size).toBe(2);
      expect(store.activeStreams.size).toBe(4);
    });

    it("handles selectAllContainers and deselectAllContainers correctly", () => {
      store.deselectAllContainers();
      expect(store.activeContainerNames.size).toBe(0);
      expect(store.activeStreams.size).toBe(0);

      store.selectAllContainers();
      expect(store.activeContainerNames.size).toBe(2);
      expect(store.activeStreams.size).toBe(4);
    });
  });

  describe("Replica Auto-Follow Toggle", () => {
    it("does not auto-stream new replicas when autoFollowNewReplicas is disabled", () => {
      store.setNamespace("prod");
      store.setWorkload("StatefulSet", "db-redis");
      store.toggleAutoFollowNewReplicas(); // turns OFF

      expect(store.autoFollowNewReplicas).toBe(false);

      // Simulate third pod appearing
      const stsPod2: any = {
        getName: () => "db-redis-2",
        getNs: () => "prod",
        getContainers: () => [{ name: "redis" }, { name: "exporter" }],
        getOwnerRefs: () => [{ name: "db-redis" }],
      };
      (mockStatefulSetStore as any).getChildPods = () => [stsPod0, stsPod1, stsPod2];

      store.syncStreamsWithPods([stsPod0, stsPod1, stsPod2]);

      expect(store.activePodNames.has("db-redis-2")).toBe(false);
      expect(store.activeStreams.has("db-redis-2/redis")).toBe(false);
    });

    it("auto-streams new replicas when autoFollowNewReplicas is enabled", () => {
      store.setNamespace("prod");
      store.setWorkload("StatefulSet", "db-redis");
      expect(store.autoFollowNewReplicas).toBe(true);

      const stsPod2: any = {
        getName: () => "db-redis-2",
        getNs: () => "prod",
        getContainers: () => [{ name: "redis" }, { name: "exporter" }],
        getOwnerRefs: () => [{ name: "db-redis" }],
      };
      (mockStatefulSetStore as any).getChildPods = () => [stsPod0, stsPod1, stsPod2];

      store.syncStreamsWithPods([stsPod0, stsPod1, stsPod2]);

      expect(store.activePodNames.has("db-redis-2")).toBe(true);
      expect(store.activeStreams.has("db-redis-2/redis")).toBe(true);
      expect(store.activeStreams.has("db-redis-2/exporter")).toBe(true);
    });
  });

  describe("Advanced Visual Filtering", () => {
    beforeEach(() => {
      store.setNamespace("prod");
      store.setWorkload("StatefulSet", "db-redis");

      const cb0Redis = activeStreamCallbacks.get("db-redis-0/redis");
      const cb0Exp = activeStreamCallbacks.get("db-redis-0/exporter");
      const cb1Redis = activeStreamCallbacks.get("db-redis-1/redis");

      cb0Redis?.onLine("2026-11-01T10:00:00Z [info] Redis 0 ready to accept connections");
      cb0Exp?.onLine("2026-11-01T10:00:01Z [metrics] scrape duration 12ms");
      cb1Redis?.onLine("2026-11-01T10:00:02Z [error] Redis 1 connection timeout");

      jest.advanceTimersByTime(60);
      expect(store.logs).toHaveLength(3);
    });

    it("filters visually by pod name without terminating active streams", () => {
      expect(store.activeStreams.size).toBe(4);

      store.setFilterPod("db-redis-0");
      expect(store.displayLogs).toHaveLength(2);
      expect(store.displayLogs.every(l => l.podName === "db-redis-0")).toBe(true);

      // Active streams must NOT have been restarted or aborted
      expect(store.activeStreams.size).toBe(4);
      expect(abortedStreams.size).toBe(0);

      store.setFilterPod("");
      expect(store.displayLogs).toHaveLength(3);
    });

    it("filters visually by container name without terminating active streams", () => {
      store.setFilterContainer("exporter");
      expect(store.displayLogs).toHaveLength(1);
      expect(store.displayLogs[0].containerName).toBe("exporter");
      expect(store.displayLogs[0].message).toContain("scrape duration");

      store.setFilterContainer("");
      expect(store.displayLogs).toHaveLength(3);
    });

    it("safely handles invalid regex without throwing or crashing", () => {
      // Invalid unclosed parenthesis regex
      expect(() => {
        store.setSearchQuery("(?=unclosed");
      }).not.toThrow();

      // Gracefully falls back to plain string includes
      expect(store.displayLogs).toHaveLength(0);

      store.setSearchQuery("ready");
      expect(store.displayLogs).toHaveLength(1);
      expect(store.displayLogs[0].message).toContain("ready to accept connections");
    });
  });

  describe("Log Export (TXT and JSONL)", () => {
    const sampleEntries: LogEntry[] = [
      {
        id: "entry-1",
        seq: 1,
        timestamp: new Date("2026-11-01T14:00:00.000Z").getTime(),
        timestampRaw: "2026-11-01T14:00:00.000Z",
        podName: "pod-alpha",
        containerName: "web",
        namespace: "prod",
        message: "\u001b[32mServer listening on port 8080\u001b[0m",
        color: "#00ff00",
      },
      {
        id: "entry-2",
        seq: 2,
        timestamp: new Date("2026-11-01T14:00:05.123Z").getTime(),
        timestampRaw: "2026-11-01T14:00:05.123Z",
        podName: "pod-beta",
        containerName: "worker",
        namespace: "prod",
        message: "Processing job #42",
        color: "#0000ff",
      },
    ];

    it("formats logs as plain text with ANSI codes stripped and clean metadata headers", () => {
      const txt = formatLogsAsText(sampleEntries, "my-cluster");

      expect(txt).toContain("# Kubetail Log Export");
      expect(txt).toContain("# Cluster: my-cluster");
      expect(txt).toContain("# Total Lines: 2");
      // ANSI escape codes must be removed
      expect(txt).not.toContain("\u001b[32m");
      expect(txt).not.toContain("\u001b[0m");
      expect(txt).toContain("[2026-11-01T14:00:00.000Z] [pod-alpha] [web] Server listening on port 8080");
      expect(txt).toContain("[2026-11-01T14:00:05.123Z] [pod-beta] [worker] Processing job #42");
    });

    it("formats logs as JSON Lines (JSONL) with one valid JSON object per line", () => {
      const jsonl = formatLogsAsJsonl(sampleEntries, "my-cluster");
      const lines = jsonl.trim().split("\n");

      expect(lines).toHaveLength(2);

      const parsed1 = JSON.parse(lines[0]);
      expect(parsed1.cluster).toBe("my-cluster");
      expect(parsed1.namespace).toBe("prod");
      expect(parsed1.pod).toBe("pod-alpha");
      expect(parsed1.container).toBe("web");
      expect(parsed1.timestamp).toBe("2026-11-01T14:00:00.000Z");
      // ANSI stripped in message
      expect(parsed1.message).toBe("Server listening on port 8080");

      const parsed2 = JSON.parse(lines[1]);
      expect(parsed2.pod).toBe("pod-beta");
      expect(parsed2.message).toBe("Processing job #42");
    });

    it("exports through store method respecting filtered vs all logs", () => {
      store.setNamespace("prod");
      store.setWorkload("StatefulSet", "db-redis");

      const cb = activeStreamCallbacks.get("db-redis-0/redis");
      cb?.onLine("2026-11-01T15:00:00Z line 1");
      cb?.onLine("2026-11-01T15:00:01Z line 2");
      jest.advanceTimersByTime(60);

      store.setSearchQuery("line 1");
      expect(store.displayLogs).toHaveLength(1);

      // Filtered export contains only 1 line
      const filteredTxt = store.exportLogs("txt", true);
      expect(filteredTxt).toContain("Total Lines: 1");
      expect(filteredTxt).toContain("line 1");
      expect(filteredTxt).not.toContain("line 2");

      // Full export contains all 2 lines
      const fullTxt = store.exportLogs("txt", false);
      expect(fullTxt).toContain("Total Lines: 2");
      expect(fullTxt).toContain("line 1");
      expect(fullTxt).toContain("line 2");
    });
  });
});
