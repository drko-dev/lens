/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { action, computed, makeObservable, observable } from "mobx";
import type { WorkspaceClusterTab } from "../common/types";
import type { NavigationHistoryEntry, WorkspaceId } from "../../../common/workspace/workspace-types";
import type { Cluster } from "../../../common/cluster/cluster";
import type { GetClusterById } from "../../../features/cluster/storage/common/get-by-id.injectable";
import type { NavigateToClusterView } from "../../../common/front-end-routing/routes/cluster-view/navigate-to-cluster-view.injectable";
import type { NavigateToCatalog } from "../../../common/front-end-routing/routes/catalog/navigate-to-catalog.injectable";
import type { Logger } from "@openlens/logger";
import type { WorkspaceHistoryManager } from "../common/workspace-history";
import {
  getClusterEnvironmentConfig,
  isProductionEnvironment,
} from "../../../common/cluster/environment-types";

export interface WorkspaceTabsStoreDependencies {
  readonly logger: Logger;
  getClusterById: GetClusterById;
  navigateToClusterView: NavigateToClusterView;
  navigateToCatalog: NavigateToCatalog;
  historyManager?: WorkspaceHistoryManager;
}

function resolveClusterName(cluster: Cluster): string {
  if (typeof cluster.name === "string") {
    return cluster.name;
  }

  if (cluster.name && typeof (cluster.name as any).get === "function") {
    return (cluster.name as any).get();
  }

  return cluster.id;
}

function clusterRoutePath(clusterId: string): string {
  return `/cluster/${encodeURIComponent(clusterId)}`;
}

export class WorkspaceTabsStore {
  @observable public activeWorkspaceId: WorkspaceId = "default";
  @observable public readonly tabs = observable.array<WorkspaceClusterTab>([]);
  @observable public activeTabId: string | undefined = undefined;
  @observable private readonly restoredInactiveClusterIds = observable.set<string>();

  constructor(protected readonly dependencies: WorkspaceTabsStoreDependencies) {
    makeObservable(this);
  }

  @computed
  public get tabCount(): number {
    return this.tabs.length;
  }

  @computed
  public get activeTab(): WorkspaceClusterTab | undefined {
    return this.tabs.find((tab) => tab.tabId === this.activeTabId);
  }

  @computed
  public get activeCluster(): Cluster | undefined {
    if (!this.activeTab) return undefined;

    return this.dependencies.getClusterById(this.activeTab.clusterId);
  }

  public getTabByClusterId(clusterId: string): WorkspaceClusterTab | undefined {
    return this.tabs.find((tab) => tab.clusterId === clusterId);
  }

  public getClusterForTab(clusterId: string): Cluster | undefined {
    return this.dependencies.getClusterById(clusterId);
  }

  @action
  public openOrFocusCluster(clusterId: string): WorkspaceClusterTab | undefined {
    const cluster = this.dependencies.getClusterById(clusterId);

    if (!cluster) {
      this.dependencies.logger.warn(`[WORKSPACE-TABS]: Cannot open tab for non-existent clusterId="${clusterId}"`);

      return undefined;
    }

    this.restoredInactiveClusterIds.delete(clusterId);

    const existingTab = this.getTabByClusterId(clusterId);

    if (existingTab) {
      existingTab.lastActiveAt = Date.now();
      // Update mutable preferences if changed in R2 appearance
      const envConfig = getClusterEnvironmentConfig(cluster.preferences);

      existingTab.title = cluster.preferences?.clusterAlias || resolveClusterName(cluster);
      existingTab.environment = envConfig.id;
      existingTab.isProduction = isProductionEnvironment(cluster.preferences);
      existingTab.accentColor = cluster.preferences?.clusterColor || envConfig.defaultColor;

      this.activeTabId = existingTab.tabId;

      if (this.dependencies.historyManager) {
        this.dependencies.historyManager.recordNavigation({
          workspaceId: this.activeWorkspaceId,
          tabId: existingTab.tabId,
          clusterId: existingTab.clusterId,
          path: clusterRoutePath(existingTab.clusterId),
        });
      }

      return existingTab;
    }

    // Create new tab with immutable clusterId and workspaceId
    const envConfig = getClusterEnvironmentConfig(cluster.preferences);
    const isProd = isProductionEnvironment(cluster.preferences);

    const newTab: WorkspaceClusterTab = {
      tabId: `tab-${cluster.id}`,
      workspaceId: this.activeWorkspaceId,
      clusterId: cluster.id,
      title: cluster.preferences?.clusterAlias || resolveClusterName(cluster),
      environment: envConfig.id,
      isProduction: isProd,
      accentColor: cluster.preferences?.clusterColor || envConfig.defaultColor,
      customEnvironmentName: cluster.preferences?.customEnvironmentName,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    this.tabs.push(newTab);
    this.activeTabId = newTab.tabId;

    if (this.dependencies.historyManager) {
      this.dependencies.historyManager.recordNavigation({
        workspaceId: this.activeWorkspaceId,
        tabId: newTab.tabId,
        clusterId: newTab.clusterId,
        path: clusterRoutePath(newTab.clusterId),
      });
    }

    this.dependencies.logger.info(`[WORKSPACE-TABS]: Opened new cluster tab for "${newTab.title}" (ID: ${clusterId})`);

    return newTab;
  }

  @action
  public syncRoute(clusterId: string | undefined, options?: { preserveSelection?: boolean }): void {
    if (!clusterId) {
      if (!options?.preserveSelection && !this.restoredInactiveClusterIds.has(this.activeTab?.clusterId ?? "")) {
        this.activeTabId = undefined;
      }

      return;
    }

    if (!this.dependencies.getClusterById(clusterId)) {
      const staleTab = this.getTabByClusterId(clusterId);

      if (staleTab) {
        this.tabs.remove(staleTab);
      }

      this.restoredInactiveClusterIds.delete(clusterId);

      this.activeTabId = undefined;

      this.dependencies.logger.warn(`[WORKSPACE-TABS]: Route references unavailable clusterId="${clusterId}"`);
      this.dependencies.navigateToCatalog();

      return;
    }

    this.openOrFocusCluster(clusterId);
  }

  public navigateToCatalog(): void {
    this.dependencies.navigateToCatalog();
  }

  public getClusterTabStatus(clusterId: string): string | undefined {
    if (this.isRestoredTabInactive(clusterId)) return "INACTIVE";

    const cluster = this.dependencies.getClusterById(clusterId);

    if (!cluster) return "UNAVAILABLE";
    if (cluster.disconnected.get()) return "DISCONNECTED";
    if (!cluster.available.get()) return "UNAVAILABLE";
    if (!cluster.ready.get()) return "CONNECTING";

    return undefined;
  }

  @action
  public selectTab(tabId: string, options?: { skipHistory?: boolean; path?: string }): void {
    const tab = this.tabs.find((t) => t.tabId === tabId);

    if (!tab) {
      this.dependencies.logger.warn(`[WORKSPACE-TABS]: Cannot select non-existent tabId="${tabId}"`);

      return;
    }

    if (!this.dependencies.getClusterById(tab.clusterId)) {
      this.tabs.remove(tab);
      this.activeTabId = undefined;
      this.dependencies.navigateToCatalog();

      return;
    }

    this.activeTabId = tab.tabId;
    this.restoredInactiveClusterIds.delete(tab.clusterId);
    tab.lastActiveAt = Date.now();

    if (!options?.skipHistory && this.dependencies.historyManager) {
      this.dependencies.historyManager.recordNavigation({
        workspaceId: this.activeWorkspaceId,
        tabId: tab.tabId,
        clusterId: tab.clusterId,
        path: options?.path ?? clusterRoutePath(tab.clusterId),
      });
    }

    this.dependencies.navigateToClusterView(tab.clusterId);
  }

  @action
  public closeTab(tabId: string): void {
    const index = this.tabs.findIndex((t) => t.tabId === tabId);

    if (index === -1) return;

    const [closedTab] = this.tabs.splice(index, 1);

    this.restoredInactiveClusterIds.delete(closedTab.clusterId);

    this.dependencies.historyManager?.purgeTab(tabId);

    this.dependencies.logger.info(`[WORKSPACE-TABS]: Closed tab "${closedTab.title}" (clusterId: ${closedTab.clusterId})`);

    // If closed tab was active, determine next active tab
    if (this.activeTabId === tabId) {
      if (this.tabs.length > 0) {
        const nextIndex = Math.min(index, this.tabs.length - 1);
        const nextTab = this.tabs[nextIndex];

        this.selectTab(nextTab.tabId);
      } else {
        this.activeTabId = undefined;
        this.dependencies.navigateToCatalog();
      }
    }
  }

  @action
  public reorderTabs(sourceIndex: number, targetIndex: number): void {
    if (
      sourceIndex < 0 ||
      sourceIndex >= this.tabs.length ||
      targetIndex < 0 ||
      targetIndex >= this.tabs.length ||
      sourceIndex === targetIndex
    ) {
      return;
    }

    const [movedTab] = this.tabs.splice(sourceIndex, 1);

    this.tabs.splice(targetIndex, 0, movedTab);
  }

  @action
  public handleClusterRemoved(clusterId: string): void {
    const tab = this.getTabByClusterId(clusterId);

    if (!tab) return;

    this.dependencies.historyManager?.purgeCluster(clusterId);
    this.restoredInactiveClusterIds.delete(clusterId);

    const wasActive = this.activeTabId === tab.tabId;

    this.tabs.remove(tab);

    if (wasActive) {
      this.activeTabId = undefined;
      this.dependencies.navigateToCatalog();
    }
  }

  @action
  public restoreTabs(tabs: WorkspaceClusterTab[], activeTabId?: string): void {
    this.tabs.replace(tabs);
    this.restoredInactiveClusterIds.replace(tabs.map(tab => tab.clusterId));

    if (activeTabId && tabs.some((t) => t.tabId === activeTabId)) {
      this.activeTabId = activeTabId;
    } else if (tabs.length > 0) {
      this.activeTabId = tabs[0].tabId;
    } else {
      this.activeTabId = undefined;
    }
  }

  @action
  public navigateHistoryBack(): void {
    if (!this.dependencies.historyManager?.canGoBack(this.activeWorkspaceId)) return;

    this.navigateToHistoryEntry(this.dependencies.historyManager.goBack(this.activeWorkspaceId));
  }

  @action
  public navigateHistoryForward(): void {
    if (!this.dependencies.historyManager?.canGoForward(this.activeWorkspaceId)) return;

    this.navigateToHistoryEntry(this.dependencies.historyManager.goForward(this.activeWorkspaceId));
  }

  private navigateToHistoryEntry(entry: NavigationHistoryEntry | undefined): void {
    if (!entry) return;

    const tab = this.tabs.find(candidate => candidate.tabId === entry.tabId);

    if (
      entry.workspaceId !== this.activeWorkspaceId ||
      !tab ||
      tab.workspaceId !== entry.workspaceId ||
      tab.clusterId !== entry.clusterId
    ) {
      this.dependencies.historyManager?.clearWorkspace(this.activeWorkspaceId);

      return;
    }

    this.selectTab(tab.tabId, { skipHistory: true, path: entry.path });
  }

  @action
  public clearTabs(): void {
    this.tabs.clear();
    this.activeTabId = undefined;
    this.restoredInactiveClusterIds.clear();
  }

  public isRestoredTabInactive(clusterId: string): boolean {
    return this.restoredInactiveClusterIds.has(clusterId);
  }
}
