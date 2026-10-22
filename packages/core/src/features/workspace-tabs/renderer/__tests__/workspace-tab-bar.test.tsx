/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import { NonInjectedWorkspaceTabBar } from "../workspace-tab-bar";
import { WorkspaceTabsStore } from "../workspace-tabs-store";
import { WorkspaceTabsFeatureFlag } from "../../common/workspace-tabs-feature-flag.injectable";
import type { Cluster } from "../../../../common/cluster/cluster";

describe("<WorkspaceTabBar />", () => {
  const render = renderFor(getDiForUnitTesting());
  let store: WorkspaceTabsStore;
  let featureFlag: WorkspaceTabsFeatureFlag;

  const devCluster: Partial<Cluster> = {
    id: "cluster-dev-01",
    name: "minikube-dev" as any,
    preferences: {
      clusterAlias: "Minikube DEV",
      clusterEnvironment: "development",
      clusterColor: "#10B981",
    },
    available: { get: () => true, set: jest.fn() } as any,
    disconnected: { get: () => false, set: jest.fn() } as any,
    ready: { get: () => true, set: jest.fn() } as any,
  };

  const prodCluster: Partial<Cluster> = {
    id: "cluster-prod-99",
    name: "aws-k8s-prod" as any,
    preferences: {
      clusterAlias: "AWS PROD",
      clusterEnvironment: "production",
      clusterColor: "#EF4444",
    },
    available: { get: () => true, set: jest.fn() } as any,
    disconnected: { get: () => false, set: jest.fn() } as any,
    ready: { get: () => true, set: jest.fn() } as any,
  };

  const fakeProdCluster: Partial<Cluster> = {
    id: "cluster-named-prod",
    name: "prod" as any,
    contextName: { get: () => "prod-context" } as any,
    preferences: {
      clusterAlias: "prod",
    },
    available: { get: () => true, set: jest.fn() } as any,
    disconnected: { get: () => false, set: jest.fn() } as any,
    ready: { get: () => true, set: jest.fn() } as any,
  };

  const fakeContextCluster: Partial<Cluster> = {
    id: "cluster-ctx-prod",
    name: "my-k8s" as any,
    contextName: { get: () => "production-us-east-1" } as any,
    preferences: {
      clusterAlias: "my-k8s",
    },
    available: { get: () => true, set: jest.fn() } as any,
    disconnected: { get: () => false, set: jest.fn() } as any,
    ready: { get: () => true, set: jest.fn() } as any,
  };

  const fakeIdCluster: Partial<Cluster> = {
    id: "cluster-prd-4455",
    name: "stage-cluster" as any,
    contextName: { get: () => "stg-context" } as any,
    preferences: {
      clusterAlias: "stage-cluster",
    },
    available: { get: () => true, set: jest.fn() } as any,
    disconnected: { get: () => false, set: jest.fn() } as any,
    ready: { get: () => true, set: jest.fn() } as any,
  };

  const disguisedProdCluster: Partial<Cluster> = {
    id: "cluster-disguised-prod",
    name: "local-dev-box" as any,
    contextName: { get: () => "minikube-local" } as any,
    preferences: {
      clusterAlias: "Local Dev Box",
      clusterEnvironment: "production",
    },
    available: { get: () => true, set: jest.fn() } as any,
    disconnected: { get: () => false, set: jest.fn() } as any,
    ready: { get: () => true, set: jest.fn() } as any,
  };

  beforeEach(() => {
    featureFlag = new WorkspaceTabsFeatureFlag();

    store = new WorkspaceTabsStore({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      getClusterById: (id) => {
        if (id === devCluster.id) return devCluster as Cluster;
        if (id === prodCluster.id) return prodCluster as Cluster;
        if (id === fakeProdCluster.id) return fakeProdCluster as Cluster;
        if (id === fakeContextCluster.id) return fakeContextCluster as Cluster;
        if (id === fakeIdCluster.id) return fakeIdCluster as Cluster;
        if (id === disguisedProdCluster.id) return disguisedProdCluster as Cluster;

        return undefined;
      },
      navigateToClusterView: jest.fn(),
      navigateToCatalog: jest.fn(),
    });
  });

  it("renders null when feature flag is off (classic shell fallback)", () => {
    featureFlag.setEnabled(false);
    store.openOrFocusCluster("cluster-dev-01");

    const { container } = render(<NonInjectedWorkspaceTabBar store={store} featureFlag={featureFlag} />);

    expect(container.firstChild).toBeNull();
  });

  it("keeps the enabled workspace strip visible before the first cluster route", () => {
    featureFlag.setEnabled(true);

    render(<NonInjectedWorkspaceTabBar store={store} featureFlag={featureFlag} />);

    expect(screen.getByTestId("workspace-tab-bar")).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: /Kubernetes cluster tabs/i })).toBeEmptyDOMElement();
  });

  it("renders explicit accessible DEV and PROD tabs when enabled", () => {
    featureFlag.setEnabled(true);
    store.openOrFocusCluster("cluster-dev-01");
    store.openOrFocusCluster("cluster-prod-99");

    render(<NonInjectedWorkspaceTabBar store={store} featureFlag={featureFlag} />);

    const tablist = screen.getByRole("tablist", { name: /Kubernetes cluster tabs/i });

    expect(tablist).toBeInTheDocument();

    const devTab = screen.getByTestId("workspace-tab-cluster-dev-01");
    const prodTab = screen.getByTestId("workspace-tab-cluster-prod-99");

    expect(devTab).toBeInTheDocument();
    expect(prodTab).toBeInTheDocument();

    // Verify PROD hazard class and badge
    expect(prodTab).toHaveClass("prod-hazard");
    const prodBadge = screen.getByTestId("tab-env-badge-cluster-prod-99");

    expect(prodBadge).toHaveTextContent("PROD");

    // Verify DEV badge
    const devBadge = screen.getByTestId("tab-env-badge-cluster-dev-01");

    expect(devBadge).toHaveTextContent("DEV");
    expect(prodTab).toHaveAttribute("aria-controls", "cluster-frame-cluster-prod-99");
    expect(screen.getByRole("tab", { name: /Production.*AWS PROD/ })).toBeInTheDocument();
  });

  it("strictly requires explicit environment configuration for production hazard styling (negative and positive checks)", () => {
    featureFlag.setEnabled(true);
    store.openOrFocusCluster("cluster-named-prod");
    store.openOrFocusCluster("cluster-ctx-prod");
    store.openOrFocusCluster("cluster-prd-4455");
    store.openOrFocusCluster("cluster-disguised-prod");

    render(<NonInjectedWorkspaceTabBar store={store} featureFlag={featureFlag} />);

    // 1. cluster named 'prod' without environment
    const tabNameProd = screen.getByTestId("workspace-tab-cluster-named-prod");

    expect(tabNameProd).not.toHaveClass("prod-hazard");
    expect(screen.getByTestId("tab-env-badge-cluster-named-prod")).not.toHaveClass("badge-prod");

    // 2. contextName containing 'production' without environment
    const tabCtxProd = screen.getByTestId("workspace-tab-cluster-ctx-prod");

    expect(tabCtxProd).not.toHaveClass("prod-hazard");
    expect(screen.getByTestId("tab-env-badge-cluster-ctx-prod")).not.toHaveClass("badge-prod");

    // 3. clusterId containing 'prd' without environment
    const tabIdPrd = screen.getByTestId("workspace-tab-cluster-prd-4455");

    expect(tabIdPrd).not.toHaveClass("prod-hazard");
    expect(screen.getByTestId("tab-env-badge-cluster-prd-4455")).not.toHaveClass("badge-prod");

    // 4. explicit environment='production' flags hazard styling regardless of name
    const tabDisguised = screen.getByTestId("workspace-tab-cluster-disguised-prod");

    expect(tabDisguised).toHaveClass("prod-hazard");
    expect(screen.getByTestId("tab-env-badge-cluster-disguised-prod")).toHaveClass("badge-prod");
    expect(screen.getByTestId("tab-env-badge-cluster-disguised-prod")).toHaveTextContent("PROD");
    expect(tabDisguised).toHaveAccessibleName(/Production — production warning/i);
  });

  it("labels restored tabs inactive and requires an explicit click before associating a cluster frame", () => {
    featureFlag.setEnabled(true);
    const tab = store.openOrFocusCluster("cluster-prod-99");

    if (!tab) throw new Error("Expected synthetic production tab");

    store.restoreTabs([tab], tab.tabId);
    render(<NonInjectedWorkspaceTabBar store={store} featureFlag={featureFlag} />);

    const prodTab = screen.getByTestId("workspace-tab-cluster-prod-99");

    expect(prodTab).toHaveAttribute("data-restored-inactive", "true");
    expect(prodTab).not.toHaveAttribute("aria-controls");
    expect(prodTab).toHaveAccessibleName(/restored inactive, click to activate/i);
    expect(screen.getByTestId("tab-status-cluster-prod-99")).toHaveTextContent("INACTIVE");

    fireEvent.click(prodTab);

    expect(prodTab).not.toHaveAttribute("data-restored-inactive");
    expect(prodTab).toHaveAttribute("aria-controls", "cluster-frame-cluster-prod-99");
  });

  it("switches tab on click and updates aria-selected", () => {
    featureFlag.setEnabled(true);
    store.openOrFocusCluster("cluster-dev-01");
    store.openOrFocusCluster("cluster-prod-99");

    render(<NonInjectedWorkspaceTabBar store={store} featureFlag={featureFlag} />);

    const devTab = screen.getByTestId("workspace-tab-cluster-dev-01");
    const prodTab = screen.getByTestId("workspace-tab-cluster-prod-99");

    expect(prodTab).toHaveAttribute("aria-selected", "true");
    expect(devTab).toHaveAttribute("aria-selected", "false");

    fireEvent.click(devTab);

    expect(store.activeTabId).toBe("tab-cluster-dev-01");
  });

  it("closes tab when close button is clicked", () => {
    featureFlag.setEnabled(true);
    store.openOrFocusCluster("cluster-dev-01");
    store.openOrFocusCluster("cluster-prod-99");

    render(<NonInjectedWorkspaceTabBar store={store} featureFlag={featureFlag} />);

    const closeProdBtn = screen.getByTestId("close-tab-cluster-prod-99");

    fireEvent.click(closeProdBtn);

    expect(store.tabCount).toBe(1);
    expect(store.tabs[0].clusterId).toBe("cluster-dev-01");
  });

  it("navigates tabs using keyboard arrow keys and moves DOM focus", () => {
    featureFlag.setEnabled(true);
    store.openOrFocusCluster("cluster-dev-01");
    store.openOrFocusCluster("cluster-prod-99");

    render(<NonInjectedWorkspaceTabBar store={store} featureFlag={featureFlag} />);

    const devTab = screen.getByTestId("workspace-tab-cluster-dev-01");
    const prodTab = screen.getByTestId("workspace-tab-cluster-prod-99");

    // Press ArrowLeft on prod tab to switch to dev tab
    fireEvent.keyDown(prodTab, { key: "ArrowLeft" });
    expect(store.activeTabId).toBe("tab-cluster-dev-01");
    expect(devTab).toHaveFocus();

    // Press ArrowRight on dev tab to switch back to prod tab
    fireEvent.keyDown(devTab, { key: "ArrowRight" });
    expect(store.activeTabId).toBe("tab-cluster-prod-99");
    expect(prodTab).toHaveFocus();
  });

  it("reorders tabs using drag and drop without changing active cluster identity", () => {
    featureFlag.setEnabled(true);
    store.openOrFocusCluster("cluster-dev-01");
    store.openOrFocusCluster("cluster-prod-99");
    const dataTransfer = {
      setData: jest.fn(),
      getData: jest.fn(() => "tab-cluster-dev-01"),
    };

    render(<NonInjectedWorkspaceTabBar store={store} featureFlag={featureFlag} />);

    const devTab = screen.getByTestId("workspace-tab-cluster-dev-01");
    const prodTab = screen.getByTestId("workspace-tab-cluster-prod-99");

    fireEvent.dragStart(devTab, { dataTransfer });
    fireEvent.dragOver(prodTab, { dataTransfer });
    fireEvent.drop(prodTab, { dataTransfer });

    expect(store.tabs.map((tab) => tab.clusterId)).toEqual(["cluster-prod-99", "cluster-dev-01"]);
    expect(store.activeTab?.clusterId).toBe("cluster-prod-99");
  });

  it("renders back and forward navigation controls and updates enabled states", () => {
    featureFlag.setEnabled(true);
    const historyManager = new (require("../../common/workspace-history").WorkspaceHistoryManager)();

    store = new WorkspaceTabsStore({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      getClusterById: (id) => {
        if (id === devCluster.id) return devCluster as Cluster;
        if (id === prodCluster.id) return prodCluster as Cluster;

        return undefined;
      },
      navigateToClusterView: jest.fn(),
      navigateToCatalog: jest.fn(),
      historyManager,
    });

    const { rerender } = render(
      <NonInjectedWorkspaceTabBar
        store={store}
        featureFlag={featureFlag}
        historyManager={historyManager}
      />,
    );

    const backBtn = screen.getByTestId("workspace-nav-back");
    const forwardBtn = screen.getByTestId("workspace-nav-forward");

    expect(backBtn).toBeDisabled();
    expect(forwardBtn).toBeDisabled();

    // Open first tab and select it
    store.openOrFocusCluster("cluster-dev-01");
    store.selectTab("tab-cluster-dev-01");

    // Open second tab and select it
    store.openOrFocusCluster("cluster-prod-99");
    store.selectTab("tab-cluster-prod-99");

    rerender(
      <NonInjectedWorkspaceTabBar
        store={store}
        featureFlag={featureFlag}
        historyManager={historyManager}
      />,
    );

    expect(backBtn).not.toBeDisabled();
    expect(forwardBtn).toBeDisabled();

    // Click back button
    fireEvent.click(backBtn);
    expect(store.activeTabId).toBe("tab-cluster-dev-01");

    rerender(
      <NonInjectedWorkspaceTabBar
        store={store}
        featureFlag={featureFlag}
        historyManager={historyManager}
      />,
    );
    expect(backBtn).toBeDisabled();
    expect(forwardBtn).not.toBeDisabled();

    // Click forward button
    fireEvent.click(forwardBtn);
    expect(store.activeTabId).toBe("tab-cluster-prod-99");
  });

  it("supports Alt+ArrowLeft and Alt+ArrowRight keyboard shortcuts for history navigation", () => {
    featureFlag.setEnabled(true);
    const historyManager = new (require("../../common/workspace-history").WorkspaceHistoryManager)();

    store = new WorkspaceTabsStore({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      getClusterById: (id) => {
        if (id === devCluster.id) return devCluster as Cluster;
        if (id === prodCluster.id) return prodCluster as Cluster;

        return undefined;
      },
      navigateToClusterView: jest.fn(),
      navigateToCatalog: jest.fn(),
      historyManager,
    });

    store.openOrFocusCluster("cluster-dev-01");
    store.selectTab("tab-cluster-dev-01");
    store.openOrFocusCluster("cluster-prod-99");
    store.selectTab("tab-cluster-prod-99");

    render(
      <NonInjectedWorkspaceTabBar
        store={store}
        featureFlag={featureFlag}
        historyManager={historyManager}
      />,
    );

    const prodTab = screen.getByTestId("workspace-tab-cluster-prod-99");

    // Alt+ArrowLeft on prod tab navigates back in history
    fireEvent.keyDown(prodTab, { key: "ArrowLeft", altKey: true });
    expect(store.activeTabId).toBe("tab-cluster-dev-01");

    const devTab = screen.getByTestId("workspace-tab-cluster-dev-01");

    // Alt+ArrowRight on dev tab navigates forward in history
    fireEvent.keyDown(devTab, { key: "ArrowRight", altKey: true });
    expect(store.activeTabId).toBe("tab-cluster-prod-99");
  });
});
