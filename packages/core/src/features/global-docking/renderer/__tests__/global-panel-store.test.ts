/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { createGlobalPanelStore } from "../global-panel-store";
import { isGlobalDockingEnabled, globalDockingStorageKey } from "../global-docking-feature-flag";
import { isBranchNode, isLeafNode } from "../../../../renderer/components/split-panel/split-panel-types";

describe("global panel store (H7.1)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("starts with Pods and Deployments side by side, bound to the hosted cluster", () => {
    const store = createGlobalPanelStore("cluster-a");

    expect(store.clusterId).toBe("cluster-a");
    expect(isBranchNode(store.rootNode)).toBe(true);
    expect(store.allActiveLeaves.map((leaf) => leaf.panelKind)).toEqual(["pods", "deployments"]);
    expect(store.allActiveLeaves.every(isLeafNode)).toBe(true);
  });

  it("never reads or writes the Kubetail split layout key", () => {
    window.localStorage.setItem("openlens:split-layout", "kubetail-layout");
    const store = createGlobalPanelStore("cluster-a");
    const [pods, deployments] = store.allActiveLeaves;

    store.movePanel(deployments.id, pods.id, "group");
    store.setBranchRatio(store.rootNode.id, 0.3);

    expect(window.localStorage.getItem("openlens:split-layout")).toBe("kubetail-layout");
    expect(store.allActiveLeaves.map((leaf) => leaf.panelKind)).toEqual(["pods", "deployments"]);
  });

  it("keeps independent layouts per cluster frame instance", () => {
    const first = createGlobalPanelStore("cluster-a");
    const second = createGlobalPanelStore("cluster-b");
    const [pods] = first.allActiveLeaves;

    first.closePanel(pods.id);

    expect(first.allActiveLeaves.map((leaf) => leaf.panelKind)).toEqual(["deployments"]);
    expect(second.allActiveLeaves.map((leaf) => leaf.panelKind)).toEqual(["pods", "deployments"]);
    expect(second.clusterId).toBe("cluster-b");
  });
});

describe("global panel store docking and catalog (H7.2)", () => {
  it("docks Pods below Deployments and keeps every leaf exactly once", () => {
    const store = createGlobalPanelStore("cluster-a");
    const [pods, deployments] = store.allActiveLeaves;

    expect(store.dockPanel(pods.id, deployments.id, "bottom", "cluster-a")).toBe(true);
    expect(isBranchNode(store.rootNode) && store.rootNode.orientation).toBe("vertical");
    expect(store.allActiveLeaves.map((leaf) => leaf.id)).toEqual([deployments.id, pods.id]);
  });

  it("rejects a drop coming from another cluster without touching the layout", () => {
    const store = createGlobalPanelStore("cluster-a");
    const [pods, deployments] = store.allActiveLeaves;
    const before = store.rootNode;

    expect(store.dockPanel(pods.id, deployments.id, "left", "cluster-b")).toBe(false);
    expect(store.rootNode).toBe(before);
  });

  it("only offers hosted kinds, and only while not already open", () => {
    const store = createGlobalPanelStore("cluster-a");

    expect(store.canAddPanelKind("terminal")).toBe(false);
    expect(store.canAddPanelKind("kubetail")).toBe(false);
    expect(store.canAddPanelKind("pods")).toBe(false);

    store.closePanel(store.allActiveLeaves[0].id);
    expect(store.canAddPanelKind("pods")).toBe(true);
  });

  it("addPanel refuses kinds outside the host catalog", () => {
    const store = createGlobalPanelStore("cluster-a");
    const before = store.rootNode;

    store.addPanel("kubetail");
    store.addPanel("terminal");
    store.addPanel("deployments");

    expect(store.rootNode).toBe(before);
    expect(store.allActiveLeaves.map((leaf) => leaf.panelKind)).toEqual(["pods", "deployments"]);
  });
});

describe("global docking feature flag", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("is off by default so the classic RC3 layout is kept", () => {
    expect(isGlobalDockingEnabled(window.localStorage)).toBe(false);
  });

  it("is on only when explicitly set to \"true\"", () => {
    window.localStorage.setItem(globalDockingStorageKey, "true");
    expect(isGlobalDockingEnabled(window.localStorage)).toBe(true);

    window.localStorage.setItem(globalDockingStorageKey, "1");
    expect(isGlobalDockingEnabled(window.localStorage)).toBe(false);
  });

  it("is off when storage is unavailable", () => {
    expect(isGlobalDockingEnabled(undefined)).toBe(false);
  });
});
