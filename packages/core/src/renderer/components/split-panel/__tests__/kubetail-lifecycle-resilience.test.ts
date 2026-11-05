/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { KubetailStore } from "../../kubetail/kubetail-store";
import { SplitPanelStore } from "../split-panel-store";
import type { Pod } from "@openlens/kube-object";

// Mock helper to create synthetic pods
const createMockPod = (name: string, workloadName = "web-deploy", namespace = "default", containers = ["app"]): Pod => ({
  getName: () => name,
  getNs: () => namespace,
  getContainers: () => containers.map(cName => ({ name: cName })),
  getOwnerRefs: () => [{ name: workloadName }],
  status: { phase: "Running" },
  metadata: { uid: `uid-${name}` },
}) as unknown as Pod;

describe("Kubetail & SplitPanel Lifecycle Resilience Suite", () => {
  let kubetailStore: KubetailStore;
  let splitPanelStore: SplitPanelStore;
  let mockStreamClient: { startStream: jest.Mock };
  let mockPodStore: { items: Pod[] };
  let mockDeploymentStore: { items: any[]; getByName: jest.Mock; getChildPods: jest.Mock };

  beforeEach(() => {
    mockStreamClient = {
      startStream: jest.fn().mockReturnValue({ abort: jest.fn() }),
    };

    mockPodStore = { items: [] };
    mockDeploymentStore = {
      items: [
        { getName: () => "web-deploy", getNs: () => "default" },
        { getName: () => "new-deploy", getNs: () => "default" },
      ],
      getByName: jest.fn((name) => ({ getName: () => name, getNs: () => "default" })),
      getChildPods: jest.fn((dep) => mockPodStore.items.filter(p => (p as any).getOwnerRefs()[0]?.name === dep.getName())),
    };

    kubetailStore = new KubetailStore({
      hostedClusterId: "cluster-resilience",
      clusterContext: {
        name: "resilience-cluster",
        environment: "development" as const,
        isProduction: false,
        accessibleNamespaces: ["default"],
      } as any,
      streamClient: mockStreamClient as any,
      deploymentStore: mockDeploymentStore as any,
      statefulSetStore: { items: [], getByName: jest.fn() } as any,
      daemonSetStore: { items: [], getByName: jest.fn() } as any,
      podStore: mockPodStore as any,
    } as any);

    splitPanelStore = new SplitPanelStore({
      initialClusterId: "cluster-resilience",
    });
  });

  afterEach(() => {
    kubetailStore.destroy();
  });

  describe("Single Connection Ownership & Lifecycle Invariance", () => {
    it("preserves active streaming handles across ratio resizing operations", () => {
      const pods = [createMockPod("web-pod-1", "web-deploy"), createMockPod("web-pod-2", "web-deploy")];
      mockPodStore.items = pods;

      kubetailStore.setResource({ kind: "Deployment", name: "web-deploy", namespace: "default" });
      expect(mockStreamClient.startStream).toHaveBeenCalledTimes(2);

      // Simulate rapid user resizing via SplitPanelStore
      splitPanelStore.setRatio(0.45);
      splitPanelStore.setRatio(0.60);
      splitPanelStore.setRatio(0.72);

      // Verify that no streams were aborted or duplicated during resize
      expect(mockStreamClient.startStream).toHaveBeenCalledTimes(2);
      expect(kubetailStore.activeStreams.size).toBe(2);
    });

    it("does not abort or duplicate streams when panels are swapped", () => {
      const pods = [createMockPod("worker-pod-1", "web-deploy")];
      mockPodStore.items = pods;

      kubetailStore.setResource({ kind: "Deployment", name: "web-deploy", namespace: "default" });
      expect(mockStreamClient.startStream).toHaveBeenCalledTimes(1);

      // Swap Left and Right panels
      splitPanelStore.swapPanels();
      expect(splitPanelStore.isSwapped).toBe(true);

      // Call syncStreamsWithPods again to simulate reconciliation
      kubetailStore.syncStreamsWithPods(pods);

      // Assert that exactly the same single stream remains alive
      expect(mockStreamClient.startStream).toHaveBeenCalledTimes(1);
      expect(kubetailStore.activeStreams.size).toBe(1);
    });

    it("closing the Resource Details panel does not interrupt Kubetail streaming", () => {
      const pods = [createMockPod("api-pod-1", "web-deploy")];
      mockPodStore.items = pods;

      kubetailStore.setResource({ kind: "Deployment", name: "web-deploy", namespace: "default" });
      expect(mockStreamClient.startStream).toHaveBeenCalledTimes(1);

      // Close Details panel
      splitPanelStore.closeRightPanel();
      expect(splitPanelStore.isRightClosed).toBe(true);
      expect(splitPanelStore.effectiveLeftWidthPercent).toBe(100);

      // Kubetail stream continues untouched
      expect(mockStreamClient.startStream).toHaveBeenCalledTimes(1);
      expect(kubetailStore.activeStreams.size).toBe(1);

      // Reopen Details panel
      splitPanelStore.openRightPanel();
      expect(splitPanelStore.isRightClosed).toBe(false);
      expect(mockStreamClient.startStream).toHaveBeenCalledTimes(1);
    });

    it("switching workload stops existing streams and starts new ones cleanly without leak", () => {
      const oldPods = [createMockPod("old-pod-1", "web-deploy")];
      mockPodStore.items = oldPods;

      kubetailStore.setResource({ kind: "Deployment", name: "web-deploy", namespace: "default" });
      expect(mockStreamClient.startStream).toHaveBeenCalledTimes(1);

      // User selects different workload
      const newPods = [createMockPod("new-pod-1", "new-deploy"), createMockPod("new-pod-2", "new-deploy")];
      mockPodStore.items = newPods;

      kubetailStore.setResource({ kind: "Deployment", name: "new-deploy", namespace: "default" });

      // 1 stream for old pod + 2 streams for new pods = 3 calls total, with exactly 2 active
      expect(mockStreamClient.startStream).toHaveBeenCalledTimes(3);
      expect(kubetailStore.activeStreams.size).toBe(2);
    });
  });
});
