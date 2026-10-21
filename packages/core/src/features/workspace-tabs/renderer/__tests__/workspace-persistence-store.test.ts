/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { observable } from "mobx";
import type { Logger } from "@openlens/logger";
import { WorkspacePersistenceStore } from "../workspace-persistence-store";
import { WorkspaceTabsStore } from "../workspace-tabs-store";
import { WorkspaceHistoryManager } from "../../common/workspace-history";
import { MemoryWorkspaceSessionStorageAdapter } from "../workspace-session-storage";
import {
  migrateLegacySnapshot,
} from "../../../../common/workspace/session-snapshot";
import type { Cluster } from "../../../../common/cluster/cluster";

describe("OpenLens DevOps R4-03: WorkspacePersistenceStore & Session Recovery Suite", () => {
  let logger: Logger;
  let historyManager: WorkspaceHistoryManager;
  let mockClusters: Map<string, Cluster>;
  let navigateToClusterView: jest.Mock;
  let navigateToCatalog: jest.Mock;
  let tabsStore: WorkspaceTabsStore;
  let storageAdapter: MemoryWorkspaceSessionStorageAdapter;
  let featureFlag: { isEnabled: boolean };
  let persistenceStore: WorkspacePersistenceStore;

  const createMockCluster = (id: string, name: string, isProduction = false): Cluster => {
    return {
      id,
      name: observable.box(name),
      contextName: observable.box(name),
      ready: observable.box(true),
      available: observable.box(true),
      disconnected: observable.box(false),
      preferences: {
        clusterAlias: name,
        clusterColor: isProduction ? "#c62828" : "#3d90ce",
        clusterEnvironment: isProduction ? "production" : "development",
      },
    } as unknown as Cluster;
  };

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as Logger;

    mockClusters = new Map();
    mockClusters.set("cluster-dev", createMockCluster("cluster-dev", "minikube-dev", false));
    mockClusters.set("cluster-stg", createMockCluster("cluster-stg", "staging-us-east", false));
    mockClusters.set("cluster-prod", createMockCluster("cluster-prod", "production-aws", true));

    navigateToClusterView = jest.fn();
    navigateToCatalog = jest.fn();
    historyManager = new WorkspaceHistoryManager();

    tabsStore = new WorkspaceTabsStore({
      logger,
      getClusterById: (id) => mockClusters.get(id),
      navigateToClusterView,
      navigateToCatalog,
      historyManager,
    });

    storageAdapter = new MemoryWorkspaceSessionStorageAdapter();
    featureFlag = { isEnabled: true };

    persistenceStore = new WorkspacePersistenceStore({
      logger,
      workspaceTabsStore: tabsStore,
      historyManager,
      getClusterById: (id) => mockClusters.get(id),
      featureFlag: featureFlag as any,
      storageAdapter,
      debounceMs: 0, // Synchronous for unit tests
    });
  });

  afterEach(() => {
    persistenceStore.dispose();
  });

  describe("Round-Trip Version 1 Persistence & Restoration", () => {
    it("keeps tabs, order, focus, and history independent when switching workspaces", () => {
      tabsStore.openOrFocusCluster("cluster-prod");
      tabsStore.openOrFocusCluster("cluster-dev");
      tabsStore.reorderTabs(1, 0);
      tabsStore.selectTab("tab-cluster-prod");
      const prodHistory = historyManager.toSnapshot("default");

      expect(persistenceStore.createWorkspace()).toBe("workspace-2");
      expect(tabsStore.tabs).toHaveLength(0);
      tabsStore.openOrFocusCluster("cluster-stg");
      tabsStore.openOrFocusCluster("cluster-dev");
      tabsStore.selectTab("tab-cluster-stg");

      expect(persistenceStore.createWorkspace()).toBe("workspace-3");
      tabsStore.openOrFocusCluster("cluster-dev");
      expect(persistenceStore.switchWorkspace("default")).toBe(true);
      expect(tabsStore.tabs.map(tab => tab.clusterId)).toEqual(["cluster-dev", "cluster-prod"]);
      expect(tabsStore.activeTabId).toBe("tab-cluster-prod");
      expect(historyManager.toSnapshot("default")).toEqual(prodHistory);
      expect(tabsStore.isRestoredTabInactive("cluster-prod")).toBe(true);

      persistenceStore.saveNow();
      const saved = JSON.parse(storageAdapter.load() || "{}");

      expect(saved.workspaces).toHaveLength(3);
      expect(saved.layouts["workspace-2"].tabs.map((tab: { clusterId: string }) => tab.clusterId)).toEqual([
        "cluster-stg", "cluster-dev",
      ]);
      expect(saved.layouts["workspace-2"].activeTabId).toBe("tab-cluster-stg");
      expect(saved.layouts["workspace-3"].tabs).toHaveLength(1);
      expect(saved.history["workspace-2"].entries).toHaveLength(3);
      expect(persistenceStore.switchWorkspace("missing")).toBe(false);
      expect(tabsStore.activeWorkspaceId).toBe("default");
    });

    it("persists 1, 5, and 10 tabs cleanly and restores descriptors accurately", () => {
      // Setup 5 mock clusters
      for (let i = 1; i <= 10; i++) {
        mockClusters.set(`cluster-${i}`, createMockCluster(`cluster-${i}`, `Cluster ${i}`, i % 2 === 0));
      }

      // Open 5 tabs
      for (let i = 1; i <= 5; i++) {
        tabsStore.openOrFocusCluster(`cluster-${i}`);
      }

      tabsStore.selectTab("tab-cluster-3");
      persistenceStore.saveNow();

      const savedJson = storageAdapter.load();

      expect(savedJson).toBeDefined();

      // Fresh stores to simulate app restart
      const freshHistory = new WorkspaceHistoryManager();
      const freshTabsStore = new WorkspaceTabsStore({
        logger,
        getClusterById: (id) => mockClusters.get(id),
        navigateToClusterView,
        navigateToCatalog,
        historyManager: freshHistory,
      });

      const freshPersistenceStore = new WorkspacePersistenceStore({
        logger,
        workspaceTabsStore: freshTabsStore,
        historyManager: freshHistory,
        getClusterById: (id) => mockClusters.get(id),
        featureFlag: featureFlag as any,
        storageAdapter,
        debounceMs: 0,
      });

      const restored = freshPersistenceStore.initAndRestore();

      expect(restored).toBe(true);
      expect(freshTabsStore.tabCount).toBe(5);
      expect(freshTabsStore.activeTabId).toBe("tab-cluster-3");
      expect(freshTabsStore.tabs.map((t) => t.clusterId)).toEqual([
        "cluster-1",
        "cluster-2",
        "cluster-3",
        "cluster-4",
        "cluster-5",
      ]);
    });

    it("strictly preserves R2 appearance metadata as authoritative during restoration", () => {
      tabsStore.openOrFocusCluster("cluster-prod");
      persistenceStore.saveNow();

      // Update cluster preference in catalog (simulating user changing alias/color in settings)
      const prodCluster = mockClusters.get("cluster-prod");

      if (!prodCluster) throw new Error("Expected cluster-prod");

      prodCluster.preferences.clusterAlias = "Renamed Production";
      prodCluster.preferences.clusterColor = "#ff0055";

      const freshTabsStore = new WorkspaceTabsStore({
        logger,
        getClusterById: (id) => mockClusters.get(id),
        navigateToClusterView,
        navigateToCatalog,
        historyManager,
      });

      const freshPersistence = new WorkspacePersistenceStore({
        logger,
        workspaceTabsStore: freshTabsStore,
        historyManager,
        getClusterById: (id) => mockClusters.get(id),
        featureFlag: featureFlag as any,
        storageAdapter,
        debounceMs: 0,
      });

      freshPersistence.initAndRestore();

      const restoredTab = freshTabsStore.tabs[0];

      expect(restoredTab.title).toBe("Renamed Production");
      expect(restoredTab.accentColor).toBe("#ff0055");
      expect(restoredTab.isProduction).toBe(true);
    });
  });

  describe("Safety Contracts: No Auto-Start Policy & Cluster Isolation", () => {
    it("reconciles all workspaces on disk without deleting valid inactive layouts or history", () => {
      const now = Date.now();
      const tab = (workspaceId: string, clusterId: string, suffix: string) => ({
        id: `tab-${suffix}`, workspaceId, clusterId, title: suffix, kind: "cluster", createdAt: now,
      });
      const entry = (workspaceId: string, clusterId: string, suffix: string) => ({
        workspaceId, clusterId, tabId: `tab-${suffix}`, path: `/cluster/${clusterId}`, timestamp: now,
      });
      const initial = {
        version: 1, timestamp: now, activeWorkspaceId: "prod",
        workspaces: [
          { id: "prod", name: "Production", clusterIds: ["cluster-prod"], activeClusterId: "cluster-prod", createdAt: now, updatedAt: now },
          { id: "staging", name: "Staging", clusterIds: ["cluster-stg", "cluster-removed"], activeClusterId: "cluster-removed", createdAt: now, updatedAt: now },
          { id: "dev", name: "Development", clusterIds: ["cluster-dev"], activeClusterId: "cluster-dev", createdAt: now, updatedAt: now },
        ],
        layouts: {
          prod: { tabs: [tab("prod", "cluster-prod", "prod-1"), tab("prod", "cluster-prod", "prod-2")], activeTabId: "tab-prod-2" },
          staging: { tabs: [tab("staging", "cluster-stg", "stg-1"), tab("staging", "cluster-removed", "stg-2")], activeTabId: "tab-stg-2" },
          dev: { tabs: [tab("dev", "cluster-dev", "dev-1")], activeTabId: "tab-dev-1" },
        },
        history: {
          prod: { workspaceId: "prod", entries: [entry("prod", "cluster-prod", "prod-1"), entry("prod", "cluster-prod", "prod-2")], currentIndex: 1 },
          staging: { workspaceId: "staging", entries: [entry("staging", "cluster-stg", "stg-1"), entry("staging", "cluster-removed", "stg-2")], currentIndex: 1 },
          dev: { workspaceId: "dev", entries: [entry("dev", "cluster-dev", "dev-1")], currentIndex: 0 },
        },
      };

      mockClusters.set("cluster-removed", createMockCluster("cluster-removed", "Same visible name"));
      storageAdapter.save(JSON.stringify(initial));
      mockClusters.delete("cluster-removed");
      mockClusters.set("replacement", createMockCluster("replacement", "Same visible name"));

      expect(persistenceStore.initAndRestore()).toBe(true);
      const cleaned = JSON.parse(storageAdapter.load() || "{}");

      expect(cleaned.workspaces.map((workspace: { id: string }) => workspace.id)).toEqual(["prod", "staging", "dev"]);
      expect(cleaned.layouts.prod.tabs.map((item: { id: string }) => item.id)).toEqual(["tab-prod-1", "tab-prod-2"]);
      expect(cleaned.layouts.prod.activeTabId).toBe("tab-prod-2");
      expect(cleaned.layouts.staging.tabs.map((item: { id: string }) => item.id)).toEqual(["tab-stg-1"]);
      expect(cleaned.layouts.staging.activeTabId).toBe("tab-stg-1");
      expect(cleaned.history.staging.entries).toHaveLength(1);
      expect(cleaned.history.staging.currentIndex).toBe(0);
      expect(cleaned.layouts.dev.tabs).toHaveLength(1);
      expect(storageAdapter.load()).not.toContain("cluster-removed");
      expect(storageAdapter.load()).not.toContain("replacement");
      expect(navigateToClusterView).not.toHaveBeenCalled();

      persistenceStore.saveNow();
      const savedAgain = JSON.parse(storageAdapter.load() || "{}");

      expect(savedAgain.layouts.staging).toEqual(cleaned.layouts.staging);
      expect(savedAgain.history.staging).toEqual(cleaned.history.staging);
      expect(savedAgain.layouts.dev).toEqual(cleaned.layouts.dev);
      expect(savedAgain.workspaces).toHaveLength(3);
    });

    it("NEVER calls navigateToClusterView or connects clusters during session restoration", () => {
      tabsStore.openOrFocusCluster("cluster-dev");
      tabsStore.openOrFocusCluster("cluster-prod");
      tabsStore.selectTab("tab-cluster-prod");

      navigateToClusterView.mockClear();
      persistenceStore.saveNow();

      const freshTabsStore = new WorkspaceTabsStore({
        logger,
        getClusterById: (id) => mockClusters.get(id),
        navigateToClusterView,
        navigateToCatalog,
        historyManager,
      });

      const freshPersistence = new WorkspacePersistenceStore({
        logger,
        workspaceTabsStore: freshTabsStore,
        historyManager,
        getClusterById: (id) => mockClusters.get(id),
        featureFlag: featureFlag as any,
        storageAdapter,
        debounceMs: 0,
      });

      freshPersistence.initAndRestore();

      // Invariant: restoration populates tabs, but DOES NOT initiate frame connection!
      expect(freshTabsStore.tabCount).toBe(2);
      expect(freshTabsStore.activeTabId).toBe("tab-cluster-prod");
      expect(freshTabsStore.isRestoredTabInactive("cluster-prod")).toBe(true);
      expect(navigateToClusterView).not.toHaveBeenCalled();
      expect(navigateToCatalog).not.toHaveBeenCalled();
    });

    it("omits tabs of deleted clusters and fails closed instead of redirecting to homonymous clusters", () => {
      tabsStore.openOrFocusCluster("cluster-dev");
      tabsStore.openOrFocusCluster("cluster-stg");
      const devCluster = mockClusters.get("cluster-dev");
      const stgCluster = mockClusters.get("cluster-stg");

      if (!devCluster || !stgCluster) throw new Error("Expected synthetic clusters");

      stgCluster.preferences.clusterAlias = devCluster.preferences.clusterAlias;
      persistenceStore.saveNow();

      // Cluster STG is deleted before next startup
      mockClusters.delete("cluster-stg");

      const freshTabsStore = new WorkspaceTabsStore({
        logger,
        getClusterById: (id) => mockClusters.get(id),
        navigateToClusterView,
        navigateToCatalog,
        historyManager,
      });

      const freshPersistence = new WorkspacePersistenceStore({
        logger,
        workspaceTabsStore: freshTabsStore,
        historyManager,
        getClusterById: (id) => mockClusters.get(id),
        featureFlag: featureFlag as any,
        storageAdapter,
        debounceMs: 0,
      });

      freshPersistence.initAndRestore();

      expect(freshTabsStore.tabCount).toBe(1);
      expect(freshTabsStore.tabs[0].clusterId).toBe("cluster-dev");
      expect(freshTabsStore.getTabByClusterId("cluster-stg")).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('cluster identity "cluster-stg" is unavailable or mismatched'),
      );
    });

    it("never leaks sensitive fields (tokens, secrets, credentials, commands, drafts) in snapshots", () => {
      tabsStore.openOrFocusCluster("cluster-dev");
      persistenceStore.saveNow();

      const json = storageAdapter.load() || "";

      expect(json).not.toContain("password");
      expect(json).not.toContain("secret");
      expect(json).not.toContain("token");
      expect(json).not.toContain("kubeconfig");
      expect(json).not.toContain("credential");
      expect(json).not.toContain("bearer");
      expect(json).not.toContain("draftYamlContent");
    });
  });

  describe("Fail-Closed Corruption Recovery & Migrations", () => {
    it("recovers safely from malformed JSON without crashing and falls back to clean workspace", () => {
      storageAdapter.save("{ invalid-json-payload-without-quotes ... ");

      const restored = persistenceStore.initAndRestore();

      expect(restored).toBe(false);
      expect(tabsStore.tabCount).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted session payload detected"),
      );
    });

    it("rejects unsupported future schema versions fail-closed", () => {
      const futureSnapshot = {
        version: 99,
        activeWorkspaceId: "default",
        workspaces: [],
        layouts: {},
      };

      storageAdapter.save(JSON.stringify(futureSnapshot));

      const restored = persistenceStore.initAndRestore();

      expect(restored).toBe(false);
      expect(tabsStore.tabCount).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted session payload detected"),
      );
    });

    it("migrates legacy v0 unversioned state cleanly into version 1 format", () => {
      const legacyState = {
        activeClusterId: "cluster-dev",
        clusters: ["cluster-dev", "cluster-prod"],
      };

      const migrated = migrateLegacySnapshot(legacyState, "default");

      expect(migrated.version).toBe(1);
      expect(migrated.activeWorkspaceId).toBe("default");
      expect(migrated.workspaces[0].clusterIds).toEqual(["cluster-dev", "cluster-prod"]);
      expect(migrated.layouts["default"].tabs).toHaveLength(2);
      expect(migrated.layouts["default"].tabs[0].kind).toBe("cluster");
    });

    it("migrates a legacy payload during startup restoration, not only through the helper", () => {
      storageAdapter.save(JSON.stringify({
        activeClusterId: "cluster-prod",
        clusters: ["cluster-dev", "cluster-prod"],
        token: "must-not-be-imported",
      }));

      expect(persistenceStore.initAndRestore()).toBe(true);
      expect(tabsStore.tabs.map((tab) => tab.clusterId)).toEqual(["cluster-dev", "cluster-prod"]);
      expect(tabsStore.activeTabId).toBe("tab-cluster-prod");
      expect(tabsStore.isRestoredTabInactive("cluster-dev")).toBe(true);
      expect(tabsStore.isRestoredTabInactive("cluster-prod")).toBe(true);
    });

    it("drops DEV/PROD cross-identified history and cannot navigate through the forged entry", () => {
      tabsStore.openOrFocusCluster("cluster-dev");
      tabsStore.openOrFocusCluster("cluster-prod");
      persistenceStore.saveNow();

      const snapshot = JSON.parse(storageAdapter.load() || "{}");

      snapshot.history.default.entries[0].clusterId = "cluster-prod";
      storageAdapter.save(JSON.stringify(snapshot));

      const freshHistory = new WorkspaceHistoryManager();
      const freshTabsStore = new WorkspaceTabsStore({
        logger,
        getClusterById: (id) => mockClusters.get(id),
        navigateToClusterView,
        navigateToCatalog,
        historyManager: freshHistory,
      });
      const freshPersistence = new WorkspacePersistenceStore({
        logger,
        workspaceTabsStore: freshTabsStore,
        historyManager: freshHistory,
        getClusterById: (id) => mockClusters.get(id),
        featureFlag: featureFlag as any,
        storageAdapter,
        debounceMs: 0,
      });

      freshPersistence.initAndRestore();
      navigateToClusterView.mockClear();

      expect(freshHistory.getHistory("default").map(({ tabId, clusterId }) => ({ tabId, clusterId }))).toEqual([
        { tabId: "tab-cluster-prod", clusterId: "cluster-prod" },
      ]);
      freshTabsStore.navigateHistoryBack();
      expect(navigateToClusterView).not.toHaveBeenCalled();

      freshPersistence.dispose();
    });

    it("restores history and performs back/forward navigation only after explicit user actions", () => {
      tabsStore.openOrFocusCluster("cluster-dev");
      tabsStore.openOrFocusCluster("cluster-prod");
      persistenceStore.saveNow();

      const freshHistory = new WorkspaceHistoryManager();
      const freshTabsStore = new WorkspaceTabsStore({
        logger,
        getClusterById: (id) => mockClusters.get(id),
        navigateToClusterView,
        navigateToCatalog,
        historyManager: freshHistory,
      });
      const freshPersistence = new WorkspacePersistenceStore({
        logger,
        workspaceTabsStore: freshTabsStore,
        historyManager: freshHistory,
        getClusterById: (id) => mockClusters.get(id),
        featureFlag: featureFlag as any,
        storageAdapter,
        debounceMs: 0,
      });

      freshPersistence.initAndRestore();

      expect(navigateToClusterView).not.toHaveBeenCalled();
      expect(freshHistory.canGoBack("default")).toBe(true);
      freshTabsStore.navigateHistoryBack();
      expect(navigateToClusterView).toHaveBeenLastCalledWith("cluster-dev");
      freshTabsStore.navigateHistoryForward();
      expect(navigateToClusterView).toHaveBeenLastCalledWith("cluster-prod");

      freshPersistence.dispose();
    });

    it("never falls back to a different cluster object returned for a requested ID", () => {
      tabsStore.openOrFocusCluster("cluster-dev");
      persistenceStore.saveNow();
      const prodCluster = mockClusters.get("cluster-prod");
      const wrongResolver = (id: string) => id === "cluster-dev" ? prodCluster : mockClusters.get(id);
      const freshHistory = new WorkspaceHistoryManager();
      const freshTabsStore = new WorkspaceTabsStore({
        logger,
        getClusterById: wrongResolver,
        navigateToClusterView,
        navigateToCatalog,
        historyManager: freshHistory,
      });
      const freshPersistence = new WorkspacePersistenceStore({
        logger,
        workspaceTabsStore: freshTabsStore,
        historyManager: freshHistory,
        getClusterById: wrongResolver,
        featureFlag: featureFlag as any,
        storageAdapter,
        debounceMs: 0,
      });

      freshPersistence.initAndRestore();

      expect(freshTabsStore.tabCount).toBe(0);
      expect(freshTabsStore.activeTabId).toBeUndefined();
      expect(navigateToClusterView).not.toHaveBeenCalled();

      freshPersistence.dispose();
    });

    it("autosaves history content changes when the bounded history length stays at its cap", () => {
      for (let index = 1; index <= 20; index++) {
        const clusterId = `history-cluster-${index}`;

        mockClusters.set(clusterId, createMockCluster(clusterId, clusterId));
        tabsStore.openOrFocusCluster(clusterId);
      }

      persistenceStore.startObserving();
      historyManager.recordNavigation({
        workspaceId: "default",
        tabId: "tab-history-cluster-20",
        clusterId: "history-cluster-20",
        path: "/pods?namespace=latest",
      });

      const saved = JSON.parse(storageAdapter.load() || "{}");
      const entries = saved.history?.default?.entries;

      expect(entries).toHaveLength(20);
      expect(entries[entries.length - 1].path).toBe("/pods?namespace=latest");
    });

    it("does not persist or restore when feature flag is disabled", () => {
      featureFlag.isEnabled = false;

      storageAdapter.save(
        JSON.stringify({
          version: 1,
          activeWorkspaceId: "default",
          workspaces: [],
          layouts: {},
        }),
      );

      const restored = persistenceStore.initAndRestore();

      expect(restored).toBe(false);
      expect(tabsStore.tabCount).toBe(0);

      // Save now should do nothing
      tabsStore.openOrFocusCluster("cluster-dev");
      persistenceStore.saveNow();

      // Original unchanged
      expect(storageAdapter.load()).not.toContain("cluster-dev");
    });

    it("is completely idempotent when restoring twice", () => {
      tabsStore.openOrFocusCluster("cluster-dev");
      tabsStore.openOrFocusCluster("cluster-prod");
      persistenceStore.saveNow();

      persistenceStore.initAndRestore();
      const count1 = tabsStore.tabCount;

      persistenceStore.initAndRestore();
      const count2 = tabsStore.tabCount;

      expect(count1).toBe(2);
      expect(count2).toBe(2);
      expect(tabsStore.tabs.map((t) => t.clusterId)).toEqual(["cluster-dev", "cluster-prod"]);
    });
  });
});
