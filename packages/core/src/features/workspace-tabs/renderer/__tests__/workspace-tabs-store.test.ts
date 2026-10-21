/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { WorkspaceTabsStore } from "../workspace-tabs-store";
import { WorkspaceHistoryManager } from "../../common/workspace-history";
import type { Cluster } from "../../../../common/cluster/cluster";

describe("OpenLens DevOps R4-02: WorkspaceTabsStore Unit & Isolation Suite", () => {
  let store: WorkspaceTabsStore;
  let mockLogger: any;
  let mockGetClusterById: jest.Mock;
  let mockNavigateToClusterView: jest.Mock;
  let mockNavigateToCatalog: jest.Mock;

  const devCluster: Partial<Cluster> = {
    id: "cluster-dev-01",
    name: "minikube-dev" as any,
    preferences: {
      clusterAlias: "Minikube Development",
      clusterEnvironment: "development",
      clusterColor: "#10B981",
    },
  };

  const prodCluster: Partial<Cluster> = {
    id: "cluster-prod-99",
    name: "aws-k8s-prod" as any,
    preferences: {
      clusterAlias: "AWS Production Live",
      clusterEnvironment: "production",
      clusterColor: "#EF4444",
    },
  };

  const clusterNamedProdWithoutEnv: Partial<Cluster> = {
    id: "cluster-fake-01",
    name: "prod" as any,
    contextName: { get: () => "prod" } as any,
    preferences: {
      clusterAlias: "prod",
    },
  };

  const clusterWithProdContextWithoutEnv: Partial<Cluster> = {
    id: "cluster-fake-02",
    name: "my-k8s" as any,
    contextName: { get: () => "production-us-east-1" } as any,
    preferences: {
      clusterAlias: "my-k8s",
    },
  };

  const clusterWithPrdIdWithoutEnv: Partial<Cluster> = {
    id: "cluster-prd-9988",
    name: "my-staging-cluster" as any,
    contextName: { get: () => "stg-context" } as any,
    preferences: {
      clusterAlias: "Staging Cluster",
    },
  };

  const clusterExplicitProdDisguisedName: Partial<Cluster> = {
    id: "cluster-disguised-prod",
    name: "local-dev-sandbox" as any,
    contextName: { get: () => "minikube-local" } as any,
    preferences: {
      clusterAlias: "Local Dev Sandbox",
      clusterEnvironment: "production",
    },
  };

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockGetClusterById = jest.fn((id: string) => {
      if (id === devCluster.id) return devCluster as Cluster;
      if (id === prodCluster.id) return prodCluster as Cluster;
      if (id === clusterNamedProdWithoutEnv.id) return clusterNamedProdWithoutEnv as Cluster;
      if (id === clusterWithProdContextWithoutEnv.id) return clusterWithProdContextWithoutEnv as Cluster;
      if (id === clusterWithPrdIdWithoutEnv.id) return clusterWithPrdIdWithoutEnv as Cluster;
      if (id === clusterExplicitProdDisguisedName.id) return clusterExplicitProdDisguisedName as Cluster;

      return undefined;
    });
    mockNavigateToClusterView = jest.fn();
    mockNavigateToCatalog = jest.fn();

    store = new WorkspaceTabsStore({
      logger: mockLogger,
      getClusterById: mockGetClusterById,
      navigateToClusterView: mockNavigateToClusterView,
      navigateToCatalog: mockNavigateToCatalog,
    });
  });

  describe("Tab Creation & Single Tab Per Cluster Semantics", () => {
    it("opens a new cluster tab with immutable identity and visual attributes", () => {
      const tab = store.openOrFocusCluster("cluster-dev-01");

      expect(tab).toBeDefined();
      expect(tab?.tabId).toBe("tab-cluster-dev-01");
      expect(tab?.clusterId).toBe("cluster-dev-01");
      expect(tab?.title).toBe("Minikube Development");
      expect(tab?.environment).toBe("development");
      expect(tab?.isProduction).toBe(false);
      expect(tab?.accentColor).toBe("#10B981");

      expect(store.tabCount).toBe(1);
      expect(store.activeTabId).toBe("tab-cluster-dev-01");
      expect(mockNavigateToClusterView).not.toHaveBeenCalled();
    });

    it("focuses existing tab instead of creating duplicate if opened again", () => {
      store.openOrFocusCluster("cluster-dev-01");
      expect(store.tabCount).toBe(1);

      // Open second cluster
      store.openOrFocusCluster("cluster-prod-99");
      expect(store.tabCount).toBe(2);
      expect(store.activeTabId).toBe("tab-cluster-prod-99");

      // Re-open first cluster
      const tab = store.openOrFocusCluster("cluster-dev-01");

      expect(store.tabCount).toBe(2); // Still 2 tabs, NO duplication!
      expect(store.activeTabId).toBe("tab-cluster-dev-01");
      expect(tab?.clusterId).toBe("cluster-dev-01");
    });

    it("correctly identifies and flags production cluster with hazard styling", () => {
      const tab = store.openOrFocusCluster("cluster-prod-99");

      expect(tab).toBeDefined();
      expect(tab?.isProduction).toBe(true);
      expect(tab?.environment).toBe("production");
      expect(tab?.accentColor).toBe("#EF4444");
    });

    it("never flags cluster as production based solely on clusterName, contextName, or clusterId (negative checks)", () => {
      // 1. cluster named 'prod' without environment configured
      const tabNameProd = store.openOrFocusCluster("cluster-fake-01");

      expect(tabNameProd).toBeDefined();
      expect(tabNameProd?.isProduction).toBe(false);
      expect(tabNameProd?.environment).toBe("none");

      // 2. contextName containing 'production' without environment configured
      const tabContextProd = store.openOrFocusCluster("cluster-fake-02");

      expect(tabContextProd).toBeDefined();
      expect(tabContextProd?.isProduction).toBe(false);
      expect(tabContextProd?.environment).toBe("none");

      // 3. clusterId containing 'prd' without environment configured
      const tabIdPrd = store.openOrFocusCluster("cluster-prd-9988");

      expect(tabIdPrd).toBeDefined();
      expect(tabIdPrd?.isProduction).toBe(false);
      expect(tabIdPrd?.environment).toBe("none");

      // 4. explicit environment='production' flags hazard regardless of dev-like name
      const tabExplicitProd = store.openOrFocusCluster("cluster-disguised-prod");

      expect(tabExplicitProd).toBeDefined();
      expect(tabExplicitProd?.isProduction).toBe(true);
      expect(tabExplicitProd?.environment).toBe("production");
      expect(tabExplicitProd?.accentColor).toBe("#EF4444");
    });

    it("rejects opening tabs for unknown or non-existent cluster IDs", () => {
      const tab = store.openOrFocusCluster("cluster-ghost-404");

      expect(tab).toBeUndefined();
      expect(store.tabCount).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining("non-existent clusterId"));
    });
  });

  describe("Tab Selection & Route Synchronization", () => {
    it("selects a cluster tab by navigating to its immutable cluster ID", () => {
      store.openOrFocusCluster("cluster-dev-01");
      store.openOrFocusCluster("cluster-prod-99");

      store.selectTab("tab-cluster-dev-01");

      expect(store.activeTabId).toBe("tab-cluster-dev-01");
      expect(mockNavigateToClusterView).toHaveBeenCalledWith("cluster-dev-01");
    });

    it("keeps route and active tab synchronized, and clears selection outside a cluster route", () => {
      store.syncRoute("cluster-dev-01");
      store.syncRoute("cluster-prod-99");
      store.syncRoute("cluster-dev-01");

      expect(store.tabCount).toBe(2);
      expect(store.activeTab?.clusterId).toBe("cluster-dev-01");

      store.syncRoute(undefined);

      expect(store.activeTabId).toBeUndefined();
      expect(store.tabCount).toBe(2);
    });

    it("preserves restored focus on the initial non-cluster route and marks restored tabs inactive", () => {
      const devTab = store.openOrFocusCluster("cluster-dev-01");
      const prodTab = store.openOrFocusCluster("cluster-prod-99");

      if (!devTab || !prodTab) throw new Error("Expected synthetic tabs");

      store.restoreTabs([devTab, prodTab], prodTab.tabId);
      store.syncRoute(undefined, { preserveSelection: true });

      expect(store.activeTabId).toBe(prodTab.tabId);
      expect(store.isRestoredTabInactive("cluster-dev-01")).toBe(true);
      expect(store.isRestoredTabInactive("cluster-prod-99")).toBe(true);
      expect(mockNavigateToClusterView).not.toHaveBeenCalled();

      store.selectTab(devTab.tabId);

      expect(store.isRestoredTabInactive("cluster-dev-01")).toBe(false);
      expect(mockNavigateToClusterView).toHaveBeenCalledWith("cluster-dev-01");
    });

    it("fails closed instead of navigating when history tab and cluster IDs cross DEV/PROD", () => {
      const historyManager = new WorkspaceHistoryManager();

      store = new WorkspaceTabsStore({
        logger: mockLogger,
        getClusterById: mockGetClusterById,
        navigateToClusterView: mockNavigateToClusterView,
        navigateToCatalog: mockNavigateToCatalog,
        historyManager,
      });
      store.openOrFocusCluster("cluster-dev-01");
      store.openOrFocusCluster("cluster-prod-99");
      historyManager.restoreSnapshot({
        workspaceId: "default",
        entries: [
          { tabId: "tab-cluster-dev-01", workspaceId: "default", clusterId: "cluster-prod-99", timestamp: 1 },
          { tabId: "tab-cluster-prod-99", workspaceId: "default", clusterId: "cluster-prod-99", timestamp: 2 },
        ],
        currentIndex: 1,
      });
      mockNavigateToClusterView.mockClear();

      store.navigateHistoryBack();

      expect(store.activeTab?.clusterId).toBe("cluster-prod-99");
      expect(mockNavigateToClusterView).not.toHaveBeenCalled();
      expect(historyManager.canGoBack("default")).toBe(false);
    });

    it("fails closed when a route points at a removed cluster", () => {
      store.openOrFocusCluster("cluster-dev-01");
      mockGetClusterById.mockReturnValue(undefined);

      store.syncRoute("cluster-dev-01");

      expect(store.activeTabId).toBeUndefined();
      expect(store.getTabByClusterId("cluster-dev-01")).toBeUndefined();
      expect(mockNavigateToCatalog).toHaveBeenCalledTimes(1);
      expect(mockNavigateToClusterView).not.toHaveBeenCalled();
    });
  });

  describe("Tab Closing & Navigation Lifecycle", () => {
    it("switches to remaining tab when active tab is closed", () => {
      store.openOrFocusCluster("cluster-dev-01");
      store.openOrFocusCluster("cluster-prod-99");

      expect(store.activeTabId).toBe("tab-cluster-prod-99");

      store.closeTab("tab-cluster-prod-99");

      expect(store.tabCount).toBe(1);
      expect(store.activeTabId).toBe("tab-cluster-dev-01");
      expect(mockNavigateToClusterView).toHaveBeenCalledWith("cluster-dev-01");
    });

    it("navigates to catalog and clears visible frame when last tab is closed", () => {
      store.openOrFocusCluster("cluster-dev-01");

      store.closeTab("tab-cluster-dev-01");

      expect(store.tabCount).toBe(0);
      expect(store.activeTabId).toBeUndefined();
      expect(mockNavigateToCatalog).toHaveBeenCalled();
    });

    it("removes a deleted active cluster and fails closed instead of selecting another cluster", () => {
      store.openOrFocusCluster("cluster-dev-01");
      store.openOrFocusCluster("cluster-prod-99");

      store.handleClusterRemoved("cluster-prod-99");

      expect(store.tabCount).toBe(1);
      expect(store.tabs[0].clusterId).toBe("cluster-dev-01");
      expect(store.activeTabId).toBeUndefined();
      expect(mockNavigateToCatalog).toHaveBeenCalledTimes(1);
    });
  });

  describe("Tab Reordering", () => {
    it("reorders tabs accurately without changing active tab identity", () => {
      store.openOrFocusCluster("cluster-dev-01");
      store.openOrFocusCluster("cluster-prod-99");

      expect(store.tabs[0].clusterId).toBe("cluster-dev-01");
      expect(store.tabs[1].clusterId).toBe("cluster-prod-99");

      store.reorderTabs(0, 1);

      expect(store.tabs[0].clusterId).toBe("cluster-prod-99");
      expect(store.tabs[1].clusterId).toBe("cluster-dev-01");

      store.reorderTabs(-1, 8);
      expect(store.tabs.map((tab) => tab.clusterId)).toEqual(["cluster-prod-99", "cluster-dev-01"]);
    });
  });

  describe("Multi-Cluster Invariant Verification", () => {
    it("maintains separate, isolated cluster contexts with zero cross-cluster leakage", () => {
      const devTab = store.openOrFocusCluster("cluster-dev-01");
      const prodTab = store.openOrFocusCluster("cluster-prod-99");

      if (!devTab || !prodTab) {
        throw new Error("Expected both synthetic cluster tabs to open");
      }

      expect(devTab.clusterId).toBe("cluster-dev-01");
      expect(prodTab.clusterId).toBe("cluster-prod-99");
      expect(devTab.isProduction).toBe(false);
      expect(prodTab.isProduction).toBe(true);

      // Mutating tab selection never alters clusterId
      store.selectTab(devTab.tabId);
      expect(store.activeTab?.clusterId).toBe("cluster-dev-01");

      store.selectTab(prodTab.tabId);
      expect(store.activeTab?.clusterId).toBe("cluster-prod-99");
    });
  });
});
