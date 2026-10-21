/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./workspace-tab-bar.scss";
import React, { useRef } from "react";
import { observer } from "mobx-react";
import { withInjectables } from "@ogre-tools/injectable-react";
import workspaceTabsStoreInjectable from "./workspace-tabs-store.injectable";
import type { WorkspaceTabsStore } from "./workspace-tabs-store";
import workspaceTabsFeatureFlagInjectable from "../common/workspace-tabs-feature-flag.injectable";
import type { WorkspaceTabsFeatureFlag } from "../common/workspace-tabs-feature-flag.injectable";
import workspaceHistoryManagerInjectable from "../common/workspace-history.injectable";
import type { WorkspaceHistoryManager } from "../common/workspace-history";
import workspacePersistenceStoreInjectable from "./workspace-persistence-store.injectable";
import type { WorkspacePersistenceStore } from "./workspace-persistence-store";
import type { WorkspaceClusterTab } from "../common/types";
import type { Cluster } from "../../../common/cluster/cluster";
import { getClusterEnvironmentConfig, isProductionEnvironment } from "../../../common/cluster/environment-types";

export interface WorkspaceTabBarProps {
  store: WorkspaceTabsStore;
  featureFlag: WorkspaceTabsFeatureFlag;
  historyManager?: WorkspaceHistoryManager;
  persistenceStore?: WorkspacePersistenceStore;
}

function clusterTitle(cluster: Cluster | undefined, fallback: string): string {
  if (!cluster) return fallback;

  const name = typeof cluster.name === "string" ? cluster.name : cluster.name?.get();

  return cluster.preferences.clusterAlias || name || fallback;
}

function environmentBadge(environment: string): string {
  switch (environment) {
    case "development": return "DEV";
    case "staging": return "STG";
    case "production": return "PROD";
    case "testing": return "TEST";
    case "local": return "LOCAL";
    case "custom": return "CUSTOM";
    default: return "NONE";
  }
}

export const NonInjectedWorkspaceTabBar = observer(({ store, featureFlag, historyManager, persistenceStore }: WorkspaceTabBarProps) => {
  const tabButtons = useRef(new Map<string, HTMLButtonElement>());

  if (!featureFlag.isEnabled) return null;

  const focusTab = (tabId: string | undefined) => {
    if (tabId) tabButtons.current.get(tabId)?.focus();
  };

  const focusAfterClose = (tab: WorkspaceClusterTab) => {
    const index = store.tabs.findIndex((candidate) => candidate.tabId === tab.tabId);

    if (store.tabs.length < 2) return undefined;

    return store.tabs[Math.min(index, store.tabs.length - 2)].tabId;
  };

  const selectAndFocus = (tabId: string) => {
    store.selectTab(tabId);
    focusTab(tabId);
  };

  const closeTab = (tab: WorkspaceClusterTab) => {
    const focusTarget = tab.tabId === store.activeTabId
      ? focusAfterClose(tab)
      : store.activeTabId;

    store.closeTab(tab.tabId);
    focusTab(focusTarget);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number, tab: WorkspaceClusterTab) => {
    let target: WorkspaceClusterTab | undefined;

    if (event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      store.navigateHistoryBack();

      return;
    }

    if (event.altKey && event.key === "ArrowRight") {
      event.preventDefault();
      store.navigateHistoryForward();

      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      const focusTarget = focusAfterClose(tab);

      store.closeTab(tab.tabId);
      focusTab(focusTarget);

      return;
    }

    switch (event.key) {
      case "ArrowLeft":
        target = store.tabs[(index - 1 + store.tabs.length) % store.tabs.length];
        break;
      case "ArrowRight":
        target = store.tabs[(index + 1) % store.tabs.length];
        break;
      case "Home":
        target = store.tabs[0];
        break;
      case "End":
        target = store.tabs[store.tabs.length - 1];
        break;
      default:
        return;
    }

    event.preventDefault();
    if (target) selectAndFocus(target.tabId);
  };

  const canGoBack = historyManager ? historyManager.canGoBack(store.activeWorkspaceId) : false;
  const canGoForward = historyManager ? historyManager.canGoForward(store.activeWorkspaceId) : false;

  return (
    <div className="WorkspaceTabBar" data-testid="workspace-tab-bar">
      <div className="workspace-header-controls">
        <div className="workspace-indicator" title={`Workspace: ${store.activeWorkspaceId}`}>
          <span className="ws-icon" aria-hidden="true">▦</span>
          <select
            aria-label="Select workspace"
            data-testid="workspace-selector"
            value={store.activeWorkspaceId}
            onChange={(event) => persistenceStore?.switchWorkspace(event.target.value)}
          >
            {(persistenceStore?.getWorkspaces().length
              ? persistenceStore.getWorkspaces()
              : [{ id: store.activeWorkspaceId, name: "Default Workspace" }]
            ).map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
          </select>
        </div>
        <button
          type="button"
          aria-label="Create workspace"
          title="Create workspace"
          data-testid="workspace-create"
          onClick={() => persistenceStore?.createWorkspace()}
        >
          +
        </button>
        <div
          className="workspace-nav-controls"
          role="group"
          aria-label="Workspace history navigation"
        >
          <button
            type="button"
            className="nav-btn nav-back"
            aria-label="Go back in workspace history"
            title="Go back (Alt+Left)"
            disabled={!canGoBack}
            onClick={() => store.navigateHistoryBack()}
            data-testid="workspace-nav-back"
          >
            ‹
          </button>
          <button
            type="button"
            className="nav-btn nav-forward"
            aria-label="Go forward in workspace history"
            title="Go forward (Alt+Right)"
            disabled={!canGoForward}
            onClick={() => store.navigateHistoryForward()}
            data-testid="workspace-nav-forward"
          >
            ›
          </button>
        </div>
      </div>

      <div
        className="tabs-scroll-container"
        role="tablist"
        aria-label="Kubernetes cluster tabs">
        {store.tabs.map((tab, index) => {
          const cluster = store.getClusterForTab(tab.clusterId);
          const environment = getClusterEnvironmentConfig(cluster?.preferences);
          const isProduction = cluster ? isProductionEnvironment(cluster.preferences) : tab.isProduction;
          const environmentId = cluster ? environment.id : tab.environment;
          const environmentLabel = environmentBadge(environmentId);
          const title = clusterTitle(cluster, tab.title);
          const status = store.getClusterTabStatus(tab.clusterId);
          const isRestoredInactive = store.isRestoredTabInactive(tab.clusterId);
          const accentColor = cluster?.preferences.clusterColor || tab.accentColor || environment.defaultColor || "#3d90ce";
          const environmentTitle = isProduction ? "Production" : cluster ? environment.label : environmentLabel;
          const statusLabel = isRestoredInactive ? "restored inactive, click to activate" : status?.toLowerCase();
          const tabLabel = `${environmentTitle}${isProduction ? " — production warning" : ""}: ${title}${statusLabel ? `, ${statusLabel}` : ""}`;

          return (
            <div
              className="workspace-tab-item"
              role="presentation"
              key={tab.tabId}>
              <button
                ref={(node) => {
                  if (node) tabButtons.current.set(tab.tabId, node);
                  else tabButtons.current.delete(tab.tabId);
                }}
                id={`workspace-tab-${tab.clusterId}`}
                type="button"
                role="tab"
                aria-label={tabLabel}
                aria-selected={tab.tabId === store.activeTabId}
                aria-controls={isRestoredInactive ? undefined : `cluster-frame-${tab.clusterId}`}
                tabIndex={tab.tabId === store.activeTabId ? 0 : -1}
                data-testid={`workspace-tab-${tab.clusterId}`}
                data-restored-inactive={isRestoredInactive || undefined}
                className={`WorkspaceTab ${tab.tabId === store.activeTabId ? "active" : ""} ${isProduction ? "prod-hazard" : ""} env-${environmentId}`}
                style={{ "--tab-accent": accentColor } as React.CSSProperties}
                title={tabLabel}
                draggable
                onClick={() => store.selectTab(tab.tabId)}
                onKeyDown={(event) => handleKeyDown(event, index, tab)}
                onDragStart={(event) => event.dataTransfer.setData("text/plain", tab.tabId)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceTabId = event.dataTransfer.getData("text/plain");
                  const sourceIndex = store.tabs.findIndex((candidate) => candidate.tabId === sourceTabId);

                  store.reorderTabs(sourceIndex, index);
                }}
              >
                <span
                  className="tab-accent-dot"
                  style={{ backgroundColor: accentColor }}
                  aria-hidden="true" />
                <span
                  className={`env-badge ${isProduction ? "badge-prod" : "badge-env"}`}
                  data-testid={`tab-env-badge-${tab.clusterId}`}
                  title={environmentTitle}
                  aria-hidden="true"
                >
                  {environmentLabel}
                </span>
                <span className="tab-title" title={title}>{title}</span>
                {status && (
                  <span
                    className="tab-status"
                    data-testid={`tab-status-${tab.clusterId}`}
                    aria-hidden="true">
                    {status}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="tab-close-btn"
                aria-label={`Close tab for ${title}`}
                data-testid={`close-tab-${tab.clusterId}`}
                onClick={() => closeTab(tab)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export interface Dependencies {
  store: WorkspaceTabsStore;
  featureFlag: WorkspaceTabsFeatureFlag;
  historyManager: WorkspaceHistoryManager;
  persistenceStore: WorkspacePersistenceStore;
}

export const WorkspaceTabBar = withInjectables<Dependencies>(NonInjectedWorkspaceTabBar, {
  getProps: (di) => ({
    store: di.inject(workspaceTabsStoreInjectable),
    featureFlag: di.inject(workspaceTabsFeatureFlagInjectable),
    historyManager: di.inject(workspaceHistoryManagerInjectable),
    persistenceStore: di.inject(workspacePersistenceStoreInjectable),
  }),
});

WorkspaceTabBar.displayName = "WorkspaceTabBar";
