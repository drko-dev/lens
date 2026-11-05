/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { findParentGroup } from "../../../../renderer/components/split-panel/split-panel-store";
import type { PanelKind } from "../../../../renderer/components/split-panel/split-panel-types";
import { createGlobalPanelStore, showRoutePanel } from "../global-panel-store";

// Pods and Deployments grouped as tabs, Pods active (the layout D05 produces by mouse).
const groupedStore = () => {
  const store = createGlobalPanelStore("c1");
  const [pods, deployments] = store.allActiveLeaves;

  store.dockPanel(deployments.id, pods.id, "center", "c1");
  store.setActiveTabInGroup(findParentGroup(store.rootNode, pods.id)!.id, pods.id);

  return { store, pods, deployments };
};
const activeOf = (store: ReturnType<typeof createGlobalPanelStore>, leafId: string) => findParentGroup(store.rootNode, leafId)?.activePanelId;
const kinds = (store: ReturnType<typeof createGlobalPanelStore>) => store.allActiveLeaves.map((leaf) => leaf.panelKind).sort();

describe("global docking route navigation to existing panels (H7.6.2)", () => {
  it("activates the inactive tab of the route without creating a panel or touching the other tabs", () => {
    const { store, pods, deployments } = groupedStore();

    expect(activeOf(store, deployments.id)).toBe(pods.id);

    showRoutePanel(store, "deployments");

    expect(activeOf(store, deployments.id)).toBe(deployments.id);
    expect(kinds(store)).toEqual(["deployments", "pods"]);
    expect(findParentGroup(store.rootNode, pods.id)?.panels.map((leaf) => leaf.id)).toContain(pods.id);
  });

  it("restores and activates a collapsed tab", () => {
    const { store, pods, deployments } = groupedStore();

    store.collapsePanel(deployments.id);
    showRoutePanel(store, "deployments");

    expect(store.isLeafCollapsed(deployments.id)).toBe(false);
    expect(activeOf(store, deployments.id)).toBe(deployments.id);
    expect(store.isLeafCollapsed(pods.id)).toBe(false);
  });

  it("creates the panel when it does not exist", () => {
    const { store } = groupedStore();

    showRoutePanel(store, "statefulsets");

    expect(kinds(store)).toEqual(["deployments", "pods", "statefulsets"]);
  });

  it("adds a panel from the catalog of a grouped tab beside its group (was a silent no-op)", () => {
    const { store, pods, deployments } = groupedStore();

    store.addPanel("jobs", pods.id);

    expect(kinds(store)).toEqual(["deployments", "jobs", "pods"]);
    expect(findParentGroup(store.rootNode, deployments.id)?.panels).toHaveLength(2);
  });

  it("is idempotent when navigating to the same route again", () => {
    const { store, deployments } = groupedStore();

    showRoutePanel(store, "deployments");
    const layout = JSON.stringify(store.rootNode);

    for (const kind of ["deployments", "deployments"] as PanelKind[]) showRoutePanel(store, kind);

    expect(JSON.stringify(store.rootNode)).toBe(layout);
    expect(activeOf(store, deployments.id)).toBe(deployments.id);
  });

  it("leaves a panel that is not grouped as it is", () => {
    const store = createGlobalPanelStore("c1");
    const layout = JSON.stringify(store.rootNode);

    showRoutePanel(store, "deployments");

    expect(JSON.stringify(store.rootNode)).toBe(layout);
  });
});
