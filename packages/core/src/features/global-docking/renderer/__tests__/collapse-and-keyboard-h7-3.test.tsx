/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, act } from "@testing-library/react";
import { runInAction } from "mobx";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import type { DiRender } from "../../../../renderer/components/test-utils/renderFor";
import { CompactPanelControlsContext, DynamicLayoutRenderer } from "../../../../renderer/components/split-panel/dynamic-layout-renderer";
import { SplitPanelStore } from "../../../../renderer/components/split-panel/split-panel-store";
import type { SplitLayoutBranch, SplitLayoutGroup, SplitLayoutLeaf, SplitLayoutNode } from "../../../../renderer/components/split-panel/split-panel-types";
import { createGlobalPanelStore } from "../global-panel-store";

const leaf = (id: string): SplitLayoutLeaf => ({ type: "leaf", id, panelKind: "unknown" as never, title: id });
const branch = (orientation: "horizontal" | "vertical", first: SplitLayoutNode, second: SplitLayoutNode): SplitLayoutBranch => ({
  type: "branch", id: "b1", orientation, ratio: 0.5, first, second,
});
const group = (...panels: SplitLayoutLeaf[]): SplitLayoutGroup => ({ type: "group", id: "g1", activePanelId: panels[0].id, panels });

describe("global docking collapse and keyboard move (H7.3)", () => {
  describe("store", () => {
    it("collapsing keeps the panel in the layout with its identity and cluster", () => {
      const store = createGlobalPanelStore("cluster-a");
      const [pods, deployments] = store.allActiveLeaves;
      const before = store.serializeLayout();

      expect(store.collapsePanel(deployments.id)).toBe(true);

      expect(store.isLeafCollapsed(deployments.id)).toBe(true);
      expect(store.allActiveLeaves.map((l) => l.id)).toEqual([pods.id, deployments.id]);
      expect(store.collapsedLeaves.map((l) => l.panelKind)).toEqual(["deployments"]);
      expect(store.clusterId).toBe("cluster-a");
      // The collapsed state is view state: the persisted layout shape does not change.
      expect(store.serializeLayout().rootNode).toEqual(before.rootNode);
    });

    it("restores a collapsed panel and ignores unknown ids", () => {
      const store = createGlobalPanelStore("cluster-a");
      const [, deployments] = store.allActiveLeaves;

      store.collapsePanel(deployments.id);
      store.restorePanel(deployments.id);

      expect(store.isLeafCollapsed(deployments.id)).toBe(false);
      expect(store.collapsePanel("missing")).toBe(false);
      expect(store.collapsedLeaves).toEqual([]);
    });

    it("keeps a valid layout when every panel is collapsed", () => {
      const store = createGlobalPanelStore("cluster-a");

      store.allActiveLeaves.forEach((l) => store.collapsePanel(l.id));

      expect(store.isSubtreeCollapsed(store.rootNode)).toBe(true);
      expect(store.activePanelsCount).toBe(2);
    });

    it("closing a collapsed panel forgets its collapsed state", () => {
      const store = createGlobalPanelStore("cluster-a");
      const [, deployments] = store.allActiveLeaves;

      store.collapsePanel(deployments.id);
      store.closePanel(deployments.id);

      expect(store.collapsedLeaves).toEqual([]);
      expect(store.isLeafCollapsed(deployments.id)).toBe(false);
    });
  });

  describe("renderer", () => {
    let render: DiRender;
    let store: SplitPanelStore;

    beforeEach(() => {
      render = renderFor(getDiForUnitTesting());
      store = new SplitPanelStore({ initialClusterId: "c1", getLocalStorageItem: () => null, setLocalStorageItem: () => {} });
    });

    const renderTree = (root: SplitLayoutNode) => {
      runInAction(() => { store.rootNode = root; });

      return render(
        <CompactPanelControlsContext.Provider value={true}>
          <DynamicLayoutRenderer node={store.rootNode} splitPanelStore={store} />
        </CompactPanelControlsContext.Provider>,
      );
    };

    it("frees the space of a collapsed panel and unmounts its content, then restores it", () => {
      const result = renderTree(branch("horizontal", leaf("a"), leaf("b")));

      fireEvent.click(result.getByTestId("panel-collapse-button-b"));

      expect(result.queryByTestId("panel-container-b")).toBeNull();
      expect(result.queryByTestId("branch-divider-b1")).toBeNull();
      expect(result.getByTestId("branch-first-b1").style.flexBasis).toBe("100%");

      act(() => store.restorePanel("b"));

      expect(result.getByTestId("panel-container-b")).toBeTruthy();
      expect(result.getByTestId("branch-first-b1").style.flexBasis).toBe("50%");
    });

    it("collapsing a tab hides it from its group and restoring makes it active again", () => {
      const result = renderTree(group(leaf("a"), leaf("b")));

      fireEvent.click(result.getByTestId("panel-collapse-button-a"));

      expect(result.queryByTestId("tab-a")).toBeNull();
      expect(result.getByTestId("panel-container-b")).toBeTruthy();

      act(() => store.restorePanel("a"));

      expect(result.getByTestId("tab-a")).toBeTruthy();
      expect(result.getByTestId("panel-container-a")).toBeTruthy();
    });

    it("shows compact collapse and close controls with accessible names", () => {
      const result = renderTree(branch("horizontal", leaf("a"), leaf("b")));

      expect(result.getByTestId("panel-collapse-button-a").getAttribute("aria-label")).toBe("Collapse a panel");
      expect(result.getByTestId("panel-close-button-a").getAttribute("aria-label")).toBe("Close a panel");
      expect(result.queryByTestId("panel-maximize-button-a")).toBeNull();
    });

    it("moves a panel with the keyboard through the same docking rules as drag and drop", () => {
      const result = renderTree(branch("horizontal", leaf("a"), leaf("b")));
      const trigger = result.getByTestId("panel-move-button-a");

      fireEvent.click(trigger);
      const menu = result.getByTestId("panel-move-menu-a");
      const items = Array.from(menu.querySelectorAll("[role=menuitem]")).map((e) => e.textContent);

      // Left of b would leave the layout unchanged, so dockLeafInTree rejects it and it is not offered.
      expect(items).toEqual(["Right of b", "Above b", "Below b", "Group with b"]);
      expect(document.activeElement?.textContent).toBe("Right of b");

      fireEvent.keyDown(menu, { key: "ArrowDown" });
      expect(document.activeElement?.textContent).toBe("Above b");
      fireEvent.keyDown(menu, { key: "Enter" });

      const root = store.rootNode as SplitLayoutBranch;

      expect(root.orientation).toBe("vertical");
      expect([root.first.id, root.second.id]).toEqual(["a", "b"]);
      expect(result.queryByTestId("panel-move-menu-a")).toBeNull();
    });

    it("cancels a keyboard move with Escape and returns focus to the trigger", () => {
      const result = renderTree(branch("horizontal", leaf("a"), leaf("b")));
      const before = store.rootNode;
      const trigger = result.getByTestId("panel-move-button-a");

      fireEvent.click(trigger);
      fireEvent.keyDown(result.getByTestId("panel-move-menu-a"), { key: "Escape" });

      expect(result.queryByTestId("panel-move-menu-a")).toBeNull();
      expect(store.rootNode).toBe(before);
      expect(document.activeElement).toBe(trigger);
    });
  });
});
