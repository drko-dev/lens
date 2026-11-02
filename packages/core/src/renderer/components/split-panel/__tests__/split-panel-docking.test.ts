/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { dockLeafInTree, getAllLeaves, getDockOrientation } from "../split-panel-store";
import type { SplitLayoutBranch, SplitLayoutGroup, SplitLayoutLeaf, SplitLayoutNode } from "../split-panel-types";
import { isBranchNode, isGroupNode } from "../split-panel-types";

const leaf = (id: string): SplitLayoutLeaf => ({ type: "leaf", id, panelKind: id === "dep" ? "deployments" : "pods", title: id });
const branch = (id: string, orientation: "horizontal" | "vertical", first: SplitLayoutNode, second: SplitLayoutNode): SplitLayoutBranch => ({
  type: "branch", id, orientation, ratio: 0.5, first, second,
});
const group = (id: string, panels: SplitLayoutLeaf[], activePanelId = panels[0].id): SplitLayoutGroup => ({
  type: "group", id, panels, activePanelId,
});
const ids = (node: SplitLayoutNode) => getAllLeaves(node).map((l) => l.id);

// Pods | Deployments side by side, as created by the global host.
const sideBySide = () => branch("root", "horizontal", leaf("pods"), leaf("dep"));

describe("dockLeafInTree", () => {
  it("maps sides to the renderer orientation: left/right = horizontal (row), top/bottom = vertical (column)", () => {
    expect(getDockOrientation("left")).toBe("horizontal");
    expect(getDockOrientation("right")).toBe("horizontal");
    expect(getDockOrientation("top")).toBe("vertical");
    expect(getDockOrientation("bottom")).toBe("vertical");
  });

  it("left: places the source before the target in a horizontal split", () => {
    const result = dockLeafInTree(sideBySide(), "dep", "pods", "left") as SplitLayoutBranch;

    expect(result.orientation).toBe("horizontal");
    expect(ids(result)).toEqual(["dep", "pods"]);
  });

  it("right: places the source after the target in a horizontal split", () => {
    const start = branch("root", "horizontal", leaf("dep"), leaf("pods"));
    const result = dockLeafInTree(start, "dep", "pods", "right") as SplitLayoutBranch;

    expect(result.orientation).toBe("horizontal");
    expect(ids(result)).toEqual(["pods", "dep"]);
  });

  it("top: stacks the source above the target in a vertical split", () => {
    const result = dockLeafInTree(sideBySide(), "dep", "pods", "top") as SplitLayoutBranch;

    expect(result.orientation).toBe("vertical");
    expect(ids(result.first)).toEqual(["dep"]);
    expect(ids(result.second)).toEqual(["pods"]);
  });

  it("bottom: stacks the source below the target in a vertical split", () => {
    const result = dockLeafInTree(sideBySide(), "pods", "dep", "bottom") as SplitLayoutBranch;

    expect(result.orientation).toBe("vertical");
    expect(ids(result.first)).toEqual(["dep"]);
    expect(ids(result.second)).toEqual(["pods"]);
  });

  it("center: groups source and target as tabs with the source active", () => {
    const result = dockLeafInTree(sideBySide(), "dep", "pods", "center");

    expect(isGroupNode(result!)).toBe(true);
    expect(ids(result!)).toEqual(["pods", "dep"]);
    expect((result as SplitLayoutGroup).activePanelId).toBe("dep");
  });

  it("center on a tab of the same group reorders the source before it", () => {
    const start = group("g", [leaf("pods"), leaf("dep")], "pods");
    const result = dockLeafInTree(start, "dep", "pods", "center") as SplitLayoutGroup;

    expect(result.panels.map((p) => p.id)).toEqual(["dep", "pods"]);
    expect(result.activePanelId).toBe("dep");
  });

  it("splitting next to a grouped target docks beside the whole group (the source is never lost)", () => {
    const start = branch("root", "horizontal", group("g", [leaf("pods"), leaf("a")]), leaf("dep"));
    const result = dockLeafInTree(start, "dep", "a", "bottom") as SplitLayoutBranch;

    expect(isBranchNode(result)).toBe(true);
    expect(result.orientation).toBe("vertical");
    expect(isGroupNode(result.first)).toBe(true);
    expect(ids(result).sort()).toEqual(["a", "dep", "pods"]);
  });

  it("extracting a tab to a side of its own group compacts the remaining single tab", () => {
    const start = group("g", [leaf("pods"), leaf("dep")]);
    const result = dockLeafInTree(start, "dep", "pods", "right") as SplitLayoutBranch;

    expect(result.orientation).toBe("horizontal");
    expect(result.first).toEqual(expect.objectContaining({ type: "leaf", id: "pods" }));
    expect(result.second).toEqual(expect.objectContaining({ type: "leaf", id: "dep" }));
  });

  it("dropping the active tab on a side of its own group extracts it beside the group", () => {
    const start = branch("root", "horizontal", group("g", [leaf("pods"), leaf("a"), leaf("dep")], "dep"), leaf("b"));
    const result = dockLeafInTree(start, "dep", "dep", "bottom") as SplitLayoutBranch;
    const extracted = result.first as SplitLayoutBranch;

    expect(extracted.orientation).toBe("vertical");
    expect(ids(extracted.first)).toEqual(["pods", "a"]);
    expect(extracted.second).toEqual(expect.objectContaining({ type: "leaf", id: "dep" }));
  });

  it("compacts the branch the source leaves behind", () => {
    const start = branch("root", "horizontal", branch("inner", "vertical", leaf("pods"), leaf("a")), leaf("dep"));
    const result = dockLeafInTree(start, "a", "dep", "center")!;

    expect(isBranchNode(result) && result.first).toEqual(expect.objectContaining({ id: "pods", type: "leaf" }));
    expect(ids(result).sort()).toEqual(["a", "dep", "pods"]);
  });

  describe("invalid operations return undefined and never mutate the input", () => {
    it.each([
      ["onto itself", "pods", "pods", "left"],
      ["unknown source", "nope", "dep", "left"],
      ["unknown target", "pods", "nope", "right"],
      ["source is a branch id", "root", "dep", "left"],
    ] as const)("%s", (_label, source, target, position) => {
      const start = sideBySide();
      const snapshot = JSON.stringify(start);

      expect(dockLeafInTree(start, source, target, position)).toBeUndefined();
      expect(JSON.stringify(start)).toBe(snapshot);
    });

    it("a drop that would rebuild the same layout is a no-op", () => {
      expect(dockLeafInTree(sideBySide(), "pods", "dep", "left")).toBeUndefined();
      expect(dockLeafInTree(sideBySide(), "dep", "pods", "right")).toBeUndefined();
    });

    it("the only panel cannot be moved", () => {
      expect(dockLeafInTree(leaf("pods"), "pods", "pods", "left")).toBeUndefined();
    });

    it("grouping a panel already active in the target's group at the same position is a no-op", () => {
      expect(dockLeafInTree(group("g", [leaf("dep"), leaf("pods")]), "dep", "pods", "center")).toBeUndefined();
    });
  });
});
