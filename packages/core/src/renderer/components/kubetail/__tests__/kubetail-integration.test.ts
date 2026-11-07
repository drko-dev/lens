/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import kubetailDeploymentMenuItemInjectable from "../menu-item/kubetail-deployment-menu-item.injectable";
import kubetailStatefulSetMenuItemInjectable from "../menu-item/kubetail-statefulset-menu-item.injectable";
import kubetailDaemonSetMenuItemInjectable from "../menu-item/kubetail-daemonset-menu-item.injectable";
import kubetailPodMenuItemInjectable from "../menu-item/kubetail-pod-menu-item.injectable";
import { kubeObjectMenuItemInjectionToken } from "../../kube-object-menu/kube-object-menu-item-injection-token";
import { KubetailStore } from "../kubetail-store";
import type { DeploymentStore } from "../../workloads-deployments/store";
import type { StatefulSetStore } from "../../workloads-statefulsets/store";
import type { DaemonSetStore } from "../../workloads-daemonsets/store";
import type { PodStore } from "../../workloads-pods/store";
import type { KubetailStreamClient } from "../kubetail-stream-client.injectable";
import type { ClusterContext } from "../../../cluster-frame-context/cluster-frame-context";

describe("Kubetail Milestone 4: Deep Integration with OpenLens DevOps", () => {
  describe("Context Menu Extension Registrations", () => {
    it("registers View in Kubetail for Deployments with orderNumber 25", () => {
      const di = getDiForUnitTesting();
      const menuItem = di.inject(kubetailDeploymentMenuItemInjectable);

      expect(menuItem.kind).toBe("Deployment");
      expect(menuItem.apiVersions).toContain("apps/v1");
      expect(menuItem.orderNumber).toBe(25);
      expect(menuItem.enabled.get()).toBe(true);
      expect(menuItem.Component).toBeDefined();
    });

    it("registers View in Kubetail for StatefulSets with orderNumber 25", () => {
      const di = getDiForUnitTesting();
      const menuItem = di.inject(kubetailStatefulSetMenuItemInjectable);

      expect(menuItem.kind).toBe("StatefulSet");
      expect(menuItem.apiVersions).toContain("apps/v1");
      expect(menuItem.orderNumber).toBe(25);
      expect(menuItem.enabled.get()).toBe(true);
      expect(menuItem.Component).toBeDefined();
    });

    it("registers View in Kubetail for DaemonSets with orderNumber 25", () => {
      const di = getDiForUnitTesting();
      const menuItem = di.inject(kubetailDaemonSetMenuItemInjectable);

      expect(menuItem.kind).toBe("DaemonSet");
      expect(menuItem.apiVersions).toContain("apps/v1");
      expect(menuItem.orderNumber).toBe(25);
      expect(menuItem.enabled.get()).toBe(true);
      expect(menuItem.Component).toBeDefined();
    });

    it("registers View in Kubetail for Pods with orderNumber 16", () => {
      const di = getDiForUnitTesting();
      const menuItem = di.inject(kubetailPodMenuItemInjectable);

      expect(menuItem.kind).toBe("Pod");
      expect(menuItem.apiVersions).toContain("v1");
      expect(menuItem.orderNumber).toBe(16);
      expect(menuItem.enabled.get()).toBe(true);
      expect(menuItem.Component).toBeDefined();
    });

    it("injects all 4 menu items via kubeObjectMenuItemInjectionToken", () => {
      const di = getDiForUnitTesting();
      const allMenuItems = di.injectMany(kubeObjectMenuItemInjectionToken);

      const kubetailItems = allMenuItems.filter(item =>
        ["Deployment", "StatefulSet", "DaemonSet", "Pod"].includes(item.kind) &&
        item.orderNumber >= 16 && item.orderNumber <= 25,
      );

      expect(kubetailItems.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Automatic Navigation & Workload Preloading (KubetailStore)", () => {
    let store: KubetailStore;
    let mockDeploymentStore: Partial<DeploymentStore>;
    let mockStatefulSetStore: Partial<StatefulSetStore>;
    let mockDaemonSetStore: Partial<DaemonSetStore>;
    let mockPodStore: Partial<PodStore>;
    let mockStreamClient: KubetailStreamClient;
    const startedStreams: string[] = [];

    const mockDeployment: any = {
      getName: () => "payment-service",
      getNs: () => "production",
      metadata: { uid: "uid-deploy-123" },
    };

    const mockPod1: any = {
      getName: () => "payment-service-abc",
      getNs: () => "production",
      getContainers: () => [{ name: "api" }],
      getOwnerRefs: () => [{ name: "payment-service" }],
    };

    const mockClusterContext: Partial<ClusterContext> = {
      allNamespaces: ["default", "production", "staging"],
      contextNamespaces: ["production"],
      hasSelectedAll: false,
    };

    let storedPreferences: any = null;
    const mockCreateStorage: any = (key: string, defaultVal: any) => ({
      get: () => storedPreferences || defaultVal,
      set: (val: any) => { storedPreferences = val; },
    });

    beforeEach(() => {
      startedStreams.length = 0;
      storedPreferences = null;

      mockDeploymentStore = {
        items: [mockDeployment],
        getChildPods: (dep: any) => dep.getName() === "payment-service" ? [mockPod1] : [],
      } as any;

      mockStatefulSetStore = {
        items: [],
        getChildPods: () => [],
      } as any;

      mockDaemonSetStore = {
        items: [],
        getChildPods: () => [],
      } as any;

      mockPodStore = {
        items: [mockPod1],
      } as any;

      mockStreamClient = {
        startStream: (params, callbacks) => {
          startedStreams.push(`${params.podName}/${params.containerName}`);
          return { abort: jest.fn() };
        },
      };

      store = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        statefulSetStore: mockStatefulSetStore as StatefulSetStore,
        daemonSetStore: mockDaemonSetStore as DaemonSetStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
        clusterContext: mockClusterContext as ClusterContext,
        createStorage: mockCreateStorage,
        hostedCluster: { name: { get: () => "prod-eu-west-1" }, id: "c-prod-123" } as any,
      });
    });

    afterEach(() => {
      store.destroy();
    });

    it("preloads workload and automatically starts streaming child pods on valid navigation", () => {
      const success = store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "payment-service",
        namespace: "production",
        uid: "uid-deploy-123",
      });

      expect(success).toBe(true);
      expect(store.selectedNamespace).toBe("production");
      expect(store.selectedKind).toBe("Deployment");
      expect(store.selectedResource?.name).toBe("payment-service");
      expect(store.selectedResource?.uid).toBe("uid-deploy-123");
      expect(store.notFoundResource).toBeNull();

      // Verified child pods discovered and streaming initiated
      expect(store.activePodNames.has("payment-service-abc")).toBe(true);
      expect(store.activeStreams.size).toBe(1);
      expect(startedStreams).toContain("payment-service-abc/api");
    });

    it("handles non-existent or deleted resource gracefully without crashing", () => {
      const success = store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "deleted-service",
        namespace: "production",
      });

      expect(success).toBe(false);
      expect(store.selectedResource).toBeUndefined();
      expect(store.notFoundResource).toEqual({
        kind: "Deployment",
        name: "deleted-service",
        namespace: "production",
      });
      expect(store.activeStreams.size).toBe(0);
      expect(startedStreams).toHaveLength(0);
    });

    it("synchronizes with ClusterContext when opened without explicit resource", () => {
      // User opens Kubetail directly with single namespace selected in Lens
      store.syncWithClusterContext();

      expect(store.selectedNamespace).toBe("production");
      expect(store.selectedResource).toBeUndefined();
    });

    it("falls back to empty namespace when multiple namespaces are active in ClusterContext", () => {
      const multiNsContext: Partial<ClusterContext> = {
        allNamespaces: ["default", "production", "staging"],
        contextNamespaces: ["production", "staging"],
        hasSelectedAll: false,
      };

      const testStore = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
        clusterContext: multiNsContext as ClusterContext,
      });

      testStore.syncWithClusterContext();
      expect(testStore.selectedNamespace).toBe("");
      testStore.destroy();
    });

    it("persists presentation preferences (autoScroll, autoFollowNewReplicas) via storage", () => {
      expect(store.autoScroll).toBe(true);
      expect(store.autoFollowNewReplicas).toBe(true);

      store.toggleAutoScroll(); // turns false
      expect(store.autoScroll).toBe(false);
      expect(storedPreferences?.autoScroll).toBe(false);

      store.toggleAutoFollowNewReplicas(); // turns false
      expect(store.autoFollowNewReplicas).toBe(false);
      expect(storedPreferences?.autoFollowNewReplicas).toBe(false);
    });

    it("restores saved preferences from storage on store initialization", () => {
      storedPreferences = {
        autoScroll: false,
        autoFollowNewReplicas: false,
        maxLines: 3000,
      };

      const restoredStore = new KubetailStore({
        deploymentStore: mockDeploymentStore as DeploymentStore,
        podStore: mockPodStore as PodStore,
        streamClient: mockStreamClient,
        createStorage: mockCreateStorage,
      });

      expect(restoredStore.autoScroll).toBe(false);
      expect(restoredStore.autoFollowNewReplicas).toBe(false);
      expect(restoredStore.maxLines).toBe(3000);
      restoredStore.destroy();
    });

    it("isolates cluster context and includes cluster name in log exports", () => {
      expect(store.clusterName).toBe("prod-eu-west-1");
      expect(store.clusterId).toBe("c-prod-123");

      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "payment-service",
        namespace: "production",
      });

      const txt = store.exportLogs("txt");
      expect(txt).toContain("# Cluster: prod-eu-west-1");

      const jsonl = store.exportLogs("jsonl");
      // JSONL format includes cluster name when available
      expect(typeof jsonl).toBe("string");
    });

    it("stops all active streams when navigating between different resources", () => {
      store.selectWorkloadFromNavigation({
        kind: "Deployment",
        name: "payment-service",
        namespace: "production",
      });
      expect(store.activeStreams.size).toBe(1);

      // User navigates to a different workload
      store.setResource(undefined);
      expect(store.activeStreams.size).toBe(0);
    });
  });
});
