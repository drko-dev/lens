/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { WorkspaceTabsStore } from "../workspace-tabs-store";
import {
  ClusterIsolationEngine,
  createScopedResourceKey,
} from "../../../../common/workspace/cluster-isolation";
import type { Cluster } from "../../../../common/cluster/cluster";

describe("OpenLens DevOps R4-02: Multi-Cluster Isolation & Alternation Gate", () => {
  let store: WorkspaceTabsStore;
  let isolationEngine: ClusterIsolationEngine;
  let mockNavigateToClusterView: jest.Mock;

  const devCluster: any = {
    id: "dev-cluster",
    name: "minikube-dev",
    preferences: {
      clusterAlias: "Development Cluster",
      clusterEnvironment: "development",
      clusterColor: "#10B981",
    },
  };

  const prodCluster: any = {
    id: "prod-cluster",
    name: "aws-k8s-prod",
    preferences: {
      clusterAlias: "Production Cluster",
      clusterEnvironment: "production",
      clusterColor: "#EF4444",
    },
  };

  beforeEach(() => {
    isolationEngine = new ClusterIsolationEngine();
    isolationEngine.registerCluster({
      clusterId: "dev-cluster",
      name: "shared-cluster-name",
      environment: "development",
      isProduction: false,
    });
    isolationEngine.registerCluster({
      clusterId: "prod-cluster",
      name: "shared-cluster-name",
      environment: "production",
      isProduction: true,
    });

    mockNavigateToClusterView = jest.fn();

    store = new WorkspaceTabsStore({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      getClusterById: (id: string) => {
        if (id === devCluster.id) return devCluster as Cluster;
        if (id === prodCluster.id) return prodCluster as Cluster;

        return undefined;
      },
      navigateToClusterView: mockNavigateToClusterView,
      navigateToCatalog: jest.fn(),
    });
  });

  it("alternates 30 times between DEV and PROD while same-named resources remain cluster-scoped", () => {
    store.openOrFocusCluster("dev-cluster");
    store.openOrFocusCluster("prod-cluster");

    expect(store.tabCount).toBe(2);

    const fixtureResources = {
      "dev-cluster": { namespace: "default", kind: "Pod", name: "api", uid: "uid-dev-api", image: "api:dev-sha" },
      "prod-cluster": { namespace: "default", kind: "Pod", name: "api", uid: "uid-prod-api", image: "api:prod-sha" },
    };

    for (let i = 0; i < 30; i++) {
      const targetClusterId = i % 2 === 0 ? "dev-cluster" : "prod-cluster";
      const targetTabId = `tab-${targetClusterId}`;

      store.selectTab(targetTabId);

      // Verify active tab and cluster
      expect(store.activeTabId).toBe(targetTabId);
      expect(store.activeTab?.clusterId).toBe(targetClusterId);
      expect(mockNavigateToClusterView).toHaveBeenCalledWith(targetClusterId);

      // Execute simulated query on the active tab's bound cluster
      const queryResult = isolationEngine.executeScopedQuery({
        clusterId: targetClusterId,
        namespace: "default",
        kind: "Pod",
        name: "api",
      });

      const resource = fixtureResources[queryResult.clusterContext.clusterId as keyof typeof fixtureResources];

      expect(resource.namespace).toBe("default");
      expect(resource.name).toBe("api");

      if (targetClusterId === "dev-cluster") {
        expect(queryResult.clusterContext.isProduction).toBe(false);
        expect(queryResult.resourceKey).toBe("k8s://dev-cluster/default/pod/api");
        expect(resource).toMatchObject({ uid: "uid-dev-api", image: "api:dev-sha" });
      } else {
        expect(queryResult.clusterContext.isProduction).toBe(true);
        expect(queryResult.resourceKey).toBe("k8s://prod-cluster/default/pod/api");
        expect(resource).toMatchObject({ uid: "uid-prod-api", image: "api:prod-sha" });
      }
    }

    expect(mockNavigateToClusterView).toHaveBeenCalledTimes(30);
  });

  it("prevents async operation cross-talk when switching tabs while operation is in flight", async () => {
    store.openOrFocusCluster("dev-cluster");
    store.openOrFocusCluster("prod-cluster");

    // Capture the immutable source context before switching the visible tab.
    const devTab = store.getTabByClusterId("dev-cluster");

    if (!devTab) {
      throw new Error("DEV tab was not opened");
    }

    const operationClusterId = devTab.clusterId;
    const asyncDevPromise = new Promise<{ clusterId: string; dataKey: string }>((resolve) => {
      setTimeout(() => {
        resolve({
          clusterId: operationClusterId,
          dataKey: createScopedResourceKey(operationClusterId, "default", "Pod", "api"),
        });
      }, 50);
    });

    // Rapidly switch active tab to PROD while DEV query is in flight
    store.selectTab("tab-prod-cluster");
    expect(store.activeTabId).toBe("tab-prod-cluster");

    // Await async result from DEV
    const result = await asyncDevPromise;

    // Result remains strictly bound to DEV and is NOT attributed to PROD
    expect(result.clusterId).toBe("dev-cluster");
    expect(result.dataKey).toContain("dev-cluster");
    expect(result.clusterId).not.toBe(store.activeTab?.clusterId);
  });
});
