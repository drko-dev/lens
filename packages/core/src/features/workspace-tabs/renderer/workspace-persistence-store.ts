/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { action, makeObservable, observable, reaction } from "mobx";
import type { Disposer } from "@openlens/utilities";
import type { Logger } from "@openlens/logger";
import type { WorkspaceTabsStore } from "./workspace-tabs-store";
import type { WorkspaceHistoryManager } from "../common/workspace-history";
import type { GetClusterById } from "../../../features/cluster/storage/common/get-by-id.injectable";
import type { WorkspaceTabsFeatureFlag } from "../common/workspace-tabs-feature-flag.injectable";
import type { WorkspaceSessionStorageAdapter } from "./workspace-session-storage";
import {
  createDefaultSessionSnapshot,
  safeDeserializeSessionSnapshot,
  serializeSessionSnapshot,
} from "../../../common/workspace/session-snapshot";
import type {
  ClusterWorkspaceTab,
  SessionSnapshotV1,
  WorkspaceContext,
  WorkspaceNavigationHistory,
} from "../../../common/workspace/workspace-types";
import type { WorkspaceClusterTab } from "../common/types";
import {
  getClusterEnvironmentConfig,
  isProductionEnvironment,
} from "../../../common/cluster/environment-types";

export interface WorkspacePersistenceStoreDependencies {
  readonly logger: Logger;
  workspaceTabsStore: WorkspaceTabsStore;
  historyManager: WorkspaceHistoryManager;
  getClusterById: GetClusterById;
  featureFlag: WorkspaceTabsFeatureFlag;
  storageAdapter: WorkspaceSessionStorageAdapter;
  debounceMs?: number;
}

export class WorkspacePersistenceStore {
  @observable public isHydrated = false;
  private saveTimeout: NodeJS.Timeout | null = null;
  private reactionDisposer: Disposer | null = null;
  private isSavingInternally = false;
  private sessionSnapshot: SessionSnapshotV1 | undefined;

  constructor(protected readonly dependencies: WorkspacePersistenceStoreDependencies) {
    makeObservable(this);
  }

  public getWorkspaces(): readonly WorkspaceContext[] {
    return this.sessionSnapshot?.workspaces ?? [];
  }

  public createWorkspace(): string | undefined {
    if (!this.dependencies.featureFlag.isEnabled) return undefined;

    this.saveNow();
    const base = this.sessionSnapshot;

    if (!base || base.workspaces.length >= 30) return undefined;

    let number = 2;

    while (base.workspaces.some(workspace => workspace.id === `workspace-${number}`)) number++;

    const id = `workspace-${number}`;
    const now = Date.now();

    this.sessionSnapshot = {
      ...base,
      workspaces: [...base.workspaces, {
        id,
        name: `Workspace ${number}`,
        clusterIds: [],
        createdAt: now,
        updatedAt: now,
      }],
      layouts: { ...base.layouts, [id]: { tabs: [] }},
      history: { ...base.history, [id]: { workspaceId: id, entries: [], currentIndex: -1 }},
    };
    this.switchWorkspace(id);

    return id;
  }

  public switchWorkspace(id: string): boolean {
    if (!this.dependencies.featureFlag.isEnabled) return false;
    if (this.dependencies.workspaceTabsStore.activeWorkspaceId === id) return true;

    this.saveNow();

    if (!this.sessionSnapshot?.workspaces.some(workspace => workspace.id === id)) return false;

    this.dependencies.workspaceTabsStore.navigateToCatalog();
    this.restoreSnapshot({ ...this.sessionSnapshot, activeWorkspaceId: id });
    this.saveNow();

    return true;
  }

  /**
   * Restores persisted workspace session snapshot into WorkspaceTabsStore.
   * STRICT SAFETY CONTRACT:
   * 1. Restores tab descriptors into memory only.
   * 2. NEVER triggers cluster connections, API requests, port-forwards, or terminal revivals.
   * 3. Validates cluster existence; missing clusters are omitted with warning and never retargeted.
   */
  @action
  public initAndRestore(): boolean {
    if (!this.dependencies.featureFlag.isEnabled) {
      this.dependencies.logger.info("[WORKSPACE-PERSISTENCE]: Feature flag disabled. Skipping restoration.");

      return false;
    }

    const payload = this.dependencies.storageAdapter.load();

    if (!payload || !payload.trim()) {
      this.isHydrated = true;

      return false;
    }

    const { snapshot, isCorrupted } = safeDeserializeSessionSnapshot(
      payload,
      this.dependencies.workspaceTabsStore.activeWorkspaceId,
    );

    if (isCorrupted) {
      this.dependencies.logger.warn("[WORKSPACE-PERSISTENCE]: Corrupted session payload detected; starting with a clean workspace.");
      this.isHydrated = true;

      return false;
    }

    const reconciled = this.reconcileSnapshot(snapshot);

    this.sessionSnapshot = reconciled;

    if (JSON.stringify(reconciled) !== JSON.stringify(snapshot)) {
      this.dependencies.storageAdapter.save(serializeSessionSnapshot(reconciled));
    }

    this.restoreSnapshot(reconciled);
    this.isHydrated = true;

    return true;
  }

  private reconcileSnapshot(snapshot: SessionSnapshotV1): SessionSnapshotV1 {
    const layouts: SessionSnapshotV1["layouts"] = {};
    const history: Record<string, WorkspaceNavigationHistory> = {};
    const workspaces = snapshot.workspaces.map(workspace => {
      const clusterIds = workspace.clusterIds.filter(id => this.dependencies.getClusterById(id)?.id === id);
      const validClusterIds = new Set(clusterIds);
      const layout = snapshot.layouts[workspace.id] ?? { tabs: [] };
      const tabs = layout.tabs.filter(tab => {
        if (validClusterIds.has(tab.clusterId)) return true;

        this.dependencies.logger.warn(
          `[WORKSPACE-PERSISTENCE]: Skipping restored tab "${tab.id}"; cluster identity "${tab.clusterId}" is unavailable or mismatched.`,
        );

        return false;
      });
      const validTabs = new Map(tabs.map(tab => [tab.id, tab.clusterId]));
      const activeTabId = tabs.some(tab => tab.id === layout.activeTabId)
        ? layout.activeTabId
        : tabs[0]?.id;
      const previousHistory = snapshot.history?.[workspace.id];
      const entries = previousHistory?.entries.filter(entry => validTabs.get(entry.tabId) === entry.clusterId) ?? [];
      const currentIndex = previousHistory
        ? previousHistory.entries.slice(0, previousHistory.currentIndex + 1)
          .filter(entry => validTabs.get(entry.tabId) === entry.clusterId).length - 1
        : -1;

      layouts[workspace.id] = { ...layout, tabs, activeTabId };
      history[workspace.id] = {
        workspaceId: workspace.id,
        entries,
        currentIndex: entries.length ? Math.max(0, currentIndex) : -1,
      };

      return {
        ...workspace,
        clusterIds,
        activeClusterId: activeTabId ? validTabs.get(activeTabId) : undefined,
      };
    });

    return { ...snapshot, workspaces, layouts, history };
  }

  @action
  public restoreSnapshot(snapshot: SessionSnapshotV1): void {
    const wsId = snapshot.activeWorkspaceId || "default";

    this.dependencies.workspaceTabsStore.activeWorkspaceId = wsId;

    const layout = snapshot.layouts[wsId];

    if (!layout || !Array.isArray(layout.tabs)) {
      this.dependencies.workspaceTabsStore.restoreTabs([], undefined);
      this.dependencies.historyManager.restoreSnapshot({ workspaceId: wsId, entries: [], currentIndex: -1 });

      return;
    }

    const restoredTabs: WorkspaceClusterTab[] = [];

    for (const rawTab of layout.tabs) {
      if (rawTab.kind !== "cluster") continue;
      const clusterId = rawTab.clusterId;
      const cluster = this.dependencies.getClusterById(clusterId);

      if (!cluster || cluster.id !== clusterId) {
        this.dependencies.logger.warn(
          `[WORKSPACE-PERSISTENCE]: Skipping restored tab "${rawTab.id}"; cluster identity "${clusterId}" is unavailable or mismatched.`,
        );
        continue;
      }

      // Reconcile mutable display properties with authoritative R2 cluster preferences
      const envConfig = getClusterEnvironmentConfig(cluster.preferences);
      const isProd = isProductionEnvironment(cluster.preferences);
      const clusterName = typeof cluster.name === "string" ? cluster.name : (cluster.name as any)?.get?.() || cluster.id;
      const title = cluster.preferences?.clusterAlias || clusterName;

      restoredTabs.push({
        tabId: rawTab.id,
        workspaceId: wsId,
        clusterId: cluster.id,
        title,
        environment: envConfig.id,
        isProduction: isProd,
        accentColor: cluster.preferences?.clusterColor || envConfig.defaultColor,
        customEnvironmentName: cluster.preferences?.customEnvironmentName,
        createdAt: rawTab.createdAt || Date.now(),
        lastActiveAt: Date.now(),
      });
    }

    // Determine safe active tab ID without triggering navigation
    let restoredActiveTabId: string | undefined = undefined;

    if (layout.activeTabId && restoredTabs.some((t) => t.tabId === layout.activeTabId)) {
      restoredActiveTabId = layout.activeTabId;
    } else if (restoredTabs.length > 0) {
      restoredActiveTabId = restoredTabs[0].tabId;
    }

    this.dependencies.workspaceTabsStore.restoreTabs(restoredTabs, restoredActiveTabId);

    // Restore navigation history if present in snapshot
    this.dependencies.historyManager.restoreSnapshot(
      snapshot.history?.[wsId] ?? { workspaceId: wsId, entries: [], currentIndex: -1 },
    );

    this.dependencies.logger.info(
      `[WORKSPACE-PERSISTENCE]: Restored ${restoredTabs.length} tabs for workspace "${wsId}" (No Auto-Start enforced).`,
    );
  }

  /**
   * Starts observing changes in WorkspaceTabsStore and WorkspaceHistoryManager.
   * Debounces disk persistence to prevent IO thrashing.
   */
  public startObserving(): Disposer {
    if (this.reactionDisposer) {
      this.reactionDisposer();
    }

    this.reactionDisposer = reaction(
      () => {
        if (!this.dependencies.featureFlag.isEnabled) return null;

        const store = this.dependencies.workspaceTabsStore;
        const history = this.dependencies.historyManager;

        return {
          workspaceId: store.activeWorkspaceId,
          activeTabId: store.activeTabId,
          tabs: store.tabs.map((tab) => ({
            id: tab.tabId,
            clusterId: tab.clusterId,
            title: tab.title,
            environment: tab.environment,
            isProduction: tab.isProduction,
            accentColor: tab.accentColor,
            customEnvironmentName: tab.customEnvironmentName,
            createdAt: tab.createdAt,
          })),
          history: history.getHistory(store.activeWorkspaceId).map(({ tabId, workspaceId, clusterId, path, timestamp }) => ({
            tabId,
            workspaceId,
            clusterId,
            path,
            timestamp,
          })),
          historyCurrentIndex: history.getCurrentIndex(store.activeWorkspaceId),
        };
      },
      (data) => {
        if (!data || this.isSavingInternally) return;
        this.scheduleDebouncedSave();
      },
      { fireImmediately: false },
    );

    return () => this.dispose();
  }

  public scheduleDebouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    const delay = this.dependencies.debounceMs ?? 300;

    if (delay <= 0) {
      this.saveNow();

      return;
    }

    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.saveNow();
    }, delay);
  }

  public saveNow(): void {
    if (!this.dependencies.featureFlag.isEnabled) return;

    this.isSavingInternally = true;

    try {
      const store = this.dependencies.workspaceTabsStore;
      const history = this.dependencies.historyManager;
      const wsId = store.activeWorkspaceId;

      const clusterIds = store.tabs.map((t) => t.clusterId);
      const activeTab = store.activeTab;

      const base = this.sessionSnapshot ?? createDefaultSessionSnapshot(wsId);
      const existing = base.workspaces.find(workspace => workspace.id === wsId);
      const workspaceContext: WorkspaceContext = {
        id: wsId,
        name: existing?.name ?? (wsId === "default" ? "Default Workspace" : wsId),
        activeClusterId: activeTab?.clusterId,
        clusterIds,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };

      const clusterTabs: ClusterWorkspaceTab[] = store.tabs.map((tab) => ({
        id: tab.tabId,
        workspaceId: wsId,
        clusterId: tab.clusterId,
        title: tab.title,
        kind: "cluster",
        environment: tab.environment,
        isProduction: tab.isProduction,
        accentColor: tab.accentColor,
        customEnvironmentName: tab.customEnvironmentName,
        createdAt: tab.createdAt,
      }));

      const snapshot: SessionSnapshotV1 = {
        version: 1,
        timestamp: Date.now(),
        activeWorkspaceId: wsId,
        workspaces: [...base.workspaces.filter(workspace => workspace.id !== wsId), workspaceContext],
        layouts: {
          ...base.layouts,
          [wsId]: {
            ...base.layouts[wsId],
            tabs: clusterTabs,
            activeTabId: store.activeTabId,
          },
        },
        history: {
          ...base.history,
          [wsId]: history.toSnapshot(wsId),
        },
      };

      const serialized = serializeSessionSnapshot(snapshot);

      this.dependencies.storageAdapter.save(serialized);
      this.sessionSnapshot = snapshot;
    } catch (err: any) {
      this.dependencies.logger.error(`[WORKSPACE-PERSISTENCE]: Failed to serialize and save session: ${err?.message}`);
    } finally {
      this.isSavingInternally = false;
    }
  }

  public dispose(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    if (this.reactionDisposer) {
      this.reactionDisposer();
      this.reactionDisposer = null;
    }
  }
}
