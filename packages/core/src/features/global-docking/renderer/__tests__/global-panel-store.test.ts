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
