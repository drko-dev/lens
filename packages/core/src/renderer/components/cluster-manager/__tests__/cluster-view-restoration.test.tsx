/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { computed, observable, runInAction } from "mobx";
import type { Cluster } from "../../../../common/cluster/cluster";
import { NonInjectedClusterView } from "../cluster-view";
import { WorkspaceTabsStore } from "../../../../features/workspace-tabs/renderer/workspace-tabs-store";

// The "connecting" status needs the DI container; these tests only check activation.
jest.mock("../cluster-status", () => ({ ClusterStatus: () => null }));

const clusterId = "cluster-dev-01";

function createView({
  workspaceTabsEnabled = true,
  hydrated = true,
  restored = true,
}: {
  workspaceTabsEnabled?: boolean;
  hydrated?: boolean;
  restored?: boolean;
} = {}) {
  const cluster = {
    id: clusterId,
    name: observable.box("Synthetic DEV"),
    ready: observable.box(true),
    available: observable.box(true),
    disconnected: observable.box(false),
  } as unknown as Cluster;
  const viewLoaded = observable.box(true);
  const clusterFrames = {
    hasLoadedView: jest.fn(() => viewLoaded.get()),
    initView: jest.fn(),
    setVisibleCluster: jest.fn(),
    clearVisibleCluster: jest.fn(),
  };
  const navigateToClusterView = jest.fn();
  const navigateToCatalog = jest.fn();
  const requestClusterActivation = jest.fn();
  const workspaceTabsStore = new WorkspaceTabsStore({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    getClusterById: id => id === clusterId ? cluster : undefined,
    navigateToClusterView,
    navigateToCatalog,
  });
  const tab = workspaceTabsStore.openOrFocusCluster(clusterId);

  if (!tab) throw new Error("Expected synthetic cluster tab");
  if (restored) workspaceTabsStore.restoreTabs([tab], tab.tabId);

  const hydration = observable.box(hydrated);
  const props = {
    clusterId: computed(() => clusterId),
    clusterFrames: clusterFrames as any,
    navigateToCatalog,
    entityRegistry: { getById: jest.fn(() => ({})), activeEntity: undefined } as any,
    getClusterById: jest.fn(() => cluster),
    requestClusterActivation,
    workspaceTabsStore,
    workspacePersistenceStore: { get isHydrated() { return hydration.get(); } } as any,
    workspaceTabsFeatureFlag: { isEnabled: workspaceTabsEnabled } as any,
  };

  return { props, cluster, clusterFrames, navigateToClusterView, requestClusterActivation, hydration, viewLoaded };
}

describe("ClusterView session restoration safety", () => {
  it("keeps restored cluster views inactive until explicit activation", () => {
    const view = createView();

    render(<NonInjectedClusterView {...view.props} />);

    expect(screen.getByRole("status")).toHaveTextContent("restored cluster view is inactive");
    expect(screen.getByRole("button", { name: "Activate cluster" })).toBeInTheDocument();
    expect(view.clusterFrames.initView).not.toHaveBeenCalled();
    expect(view.requestClusterActivation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Activate cluster" }));

    expect(view.navigateToClusterView).toHaveBeenCalledWith(clusterId);
    expect(view.clusterFrames.initView).toHaveBeenCalledWith(clusterId);
    expect(view.requestClusterActivation).toHaveBeenCalledWith({ clusterId });
  });

  it("waits for workspace hydration before activating a non-restored route", () => {
    const view = createView({ hydrated: false, restored: false });

    render(<NonInjectedClusterView {...view.props} />);

    expect(view.clusterFrames.initView).not.toHaveBeenCalled();
    expect(view.requestClusterActivation).not.toHaveBeenCalled();

    runInAction(() => view.hydration.set(true));

    expect(view.clusterFrames.initView).toHaveBeenCalledWith(clusterId);
    expect(view.requestClusterActivation).toHaveBeenCalledWith({ clusterId });
  });

  it("preserves classic-shell activation when workspace tabs are disabled", () => {
    const view = createView({ workspaceTabsEnabled: false, hydrated: false, restored: false });

    render(<NonInjectedClusterView {...view.props} />);

    expect(view.clusterFrames.initView).toHaveBeenCalledWith(clusterId);
    expect(view.requestClusterActivation).toHaveBeenCalledWith({ clusterId });
  });

  // H7.6: Disconnect removes the cluster's view; that must not reconnect the cluster.
  it("does not reconnect a cluster whose view was torn down by Disconnect", () => {
    const view = createView({ restored: false });

    render(<NonInjectedClusterView {...view.props} />);
    expect(view.requestClusterActivation).toHaveBeenCalledTimes(1);

    runInAction(() => {
      (view.cluster.disconnected as any).set(true);
      view.viewLoaded.set(false);
    });

    expect(view.requestClusterActivation).toHaveBeenCalledTimes(1);
    expect(view.clusterFrames.initView).toHaveBeenCalledTimes(1);
  });

  it("still re-creates the view of a connected cluster when it disappears", () => {
    const view = createView({ restored: false });

    render(<NonInjectedClusterView {...view.props} />);
    runInAction(() => view.viewLoaded.set(false));

    expect(view.clusterFrames.initView).toHaveBeenCalledTimes(2);
    expect(view.requestClusterActivation).toHaveBeenCalledTimes(2);
  });
});
