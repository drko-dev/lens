/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { act, fireEvent } from "@testing-library/react";
import { computed } from "mobx";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import { findParentGroup } from "../../../../renderer/components/split-panel/split-panel-store";
import { isBranchNode } from "../../../../renderer/components/split-panel/split-panel-types";
import type { SplitPanelStore } from "../../../../renderer/components/split-panel/split-panel-store";
import { PanelHostView } from "../global-panel-host";
import { createRootPanelStore, rootPanelKinds } from "../root-panel-store";
import activeRootPanelKindInjectable from "../active-root-panel-kind.injectable";
import shouldUseRootPanelHostInjectable from "../../../../renderer/components/cluster-manager/cluster-manager-root-panel.injectable";
import { globalDockingStorageKey } from "../global-docking-feature-flag";

// The real Settings / Catalog trees are covered by their own suites; here only the docking shell matters.
jest.mock("../bound-settings", () => ({ BoundSettings: () => <div data-testid="bound-settings" /> }));
jest.mock("../bound-catalog", () => ({ BoundCatalog: () => <div data-testid="bound-catalog" /> }));

const leafOf = (store: SplitPanelStore, kind: string) => store.allActiveLeaves.find((leaf) => leaf.panelKind === kind)!;
const bothStore = () => {
  const store = createRootPanelStore("settings");

  store.addPanel("catalog");

  return store;
};

describe("root views docking (H7.6.4)", () => {
  describe("root panel store", () => {
    it("has no cluster identity and starts with only the opened view", () => {
      const store = createRootPanelStore("catalog");

      expect(store.clusterId).toBe("");
      expect(store.allActiveLeaves.map((leaf) => leaf.panelKind)).toEqual(["catalog"]);
      expect(store.hasPanelPolicy).toBe(true);
    });

    it("rejects foreign kinds and keeps a single instance of each view", () => {
      const store = bothStore();

      for (const kind of ["pods", "terminal", "kubetail", "resource-details"] as const) {
        store.addPanel(kind);
      }

      store.addPanel("settings");
      store.addPanel("catalog");

      expect(store.allActiveLeaves.map((leaf) => leaf.panelKind).sort()).toEqual([...rootPanelKinds].sort());
      expect(store.canAddPanelKind("settings")).toBe(false);
    });

    it("does not offer the root views to the Kubetail / classic stores", () => {
      const classic = new (createRootPanelStore().constructor as new (d: object) => SplitPanelStore)({});

      expect(classic.canAddPanelKind("settings")).toBe(false);
      expect(classic.canAddPanelKind("catalog")).toBe(false);
    });

    it.each(["right", "left", "top", "bottom"] as const)("docks a view to the %s of the other", (position) => {
      const store = bothStore();
      const settings = leafOf(store, "settings");
      const catalog = leafOf(store, "catalog");

      store.dockPanel(settings.id, catalog.id, position, "");

      const root = store.rootNode;

      expect(isBranchNode(root)).toBe(true);
      expect(isBranchNode(root) && root.orientation).toBe(position === "left" || position === "right" ? "horizontal" : "vertical");
      expect(store.allActiveLeaves).toHaveLength(2);
    });

    it("groups the views as tabs, collapses and restores them", () => {
      const store = bothStore();
      const settings = leafOf(store, "settings");
      const catalog = leafOf(store, "catalog");

      store.dockPanel(settings.id, catalog.id, "center", "");
      expect(findParentGroup(store.rootNode, settings.id)?.panels).toHaveLength(2);

      store.collapsePanel(catalog.id);
      expect(store.isLeafCollapsed(catalog.id)).toBe(true);
      store.restorePanel(catalog.id);
      expect(store.isLeafCollapsed(catalog.id)).toBe(false);
    });

    it("refuses to detach (no cluster, no detached window)", async () => {
      const store = bothStore();

      expect(await store.detachPanel(leafOf(store, "settings").id)).toBe(false);
      expect(store.isPanelDetached(leafOf(store, "settings").id)).toBe(false);
    });

    it("yields a fresh panel after closing and reopening", () => {
      const store = bothStore();
      const before = leafOf(store, "catalog").id;

      store.closePanel(before);
      expect(store.canAddPanelKind("catalog")).toBe(true);
      store.addPanel("catalog");

      expect(leafOf(store, "catalog").id).not.toBe(before);
    });
  });

  describe("root panel host", () => {
    const renderHost = (store: SplitPanelStore, kind?: "settings" | "catalog") => {
      const render = renderFor(getDiForUnitTesting());

      return render(
        <PanelHostView
          store={store}
          activeKind={computed(() => kind)}
          testId="root-panel-host"
          onSelectPanel={(k, o) => store.addPanel(k, undefined, o)}
          isKindAllowed={(k) => store.canAddPanelKind(k)}
        />,
      );
    };

    it("renders both views with the shared engine and no cluster identity", () => {
      const store = bothStore();
      const result = renderHost(store);
      const host = result.getByTestId("root-panel-host");

      expect(host.getAttribute("data-cluster-id")).toBe("");
      expect(result.getByTestId("bound-settings")).toBeTruthy();
      expect(result.getByTestId("bound-catalog")).toBeTruthy();
      expect(host.querySelector("[data-environment], [data-cluster-accent]")).toBeNull();
    });

    it("reveals the opened view when the route points to it", () => {
      const store = bothStore();
      const settings = leafOf(store, "settings");
      const catalog = leafOf(store, "catalog");

      store.dockPanel(settings.id, catalog.id, "center", "");
      store.setActiveTabInGroup(findParentGroup(store.rootNode, settings.id)!.id, catalog.id);
      store.collapsePanel(settings.id);

      const result = renderHost(store, "settings");

      expect(store.isLeafCollapsed(settings.id)).toBe(false);
      expect(result.getByTestId("bound-settings")).toBeTruthy();
    });

    it("offers only the other root view in the catalog modal", () => {
      const store = createRootPanelStore("settings");
      const result = renderHost(store, "settings");

      act(() => store.openCatalog());

      expect(result.getByTestId("catalog-card-catalog")).toBeTruthy();
      expect(result.queryByTestId("catalog-card-settings")).toBeNull();
      expect(result.queryByTestId("catalog-card-terminal")).toBeNull();
      expect(result.queryByTestId("catalog-card-pods")).toBeNull();

      fireEvent.click(result.getByTestId("catalog-add-catalog"));

      expect(store.allActiveLeaves.map((leaf) => leaf.panelKind).sort()).toEqual(["catalog", "settings"]);
    });

    it("moves a panel with the keyboard through the same engine", () => {
      const store = bothStore();
      const result = renderHost(store);
      const settings = leafOf(store, "settings");
      const before = JSON.stringify(store.rootNode);

      fireEvent.click(result.getByTestId(`panel-move-button-${settings.id}`));
      const menu = result.getByTestId(`panel-move-menu-${settings.id}`);

      expect(menu.querySelectorAll("[role=menuitem]").length).toBeGreaterThan(0);
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      fireEvent.keyDown(menu, { key: "Enter" });

      expect(store.allActiveLeaves).toHaveLength(2);
      expect(JSON.stringify(store.rootNode)).not.toBe(before);
    });
  });

  describe("route gate", () => {
    const gate = (flag: boolean, kind: "settings" | "catalog" | undefined) => {
      window.localStorage.removeItem(globalDockingStorageKey);

      if (flag) {
        window.localStorage.setItem(globalDockingStorageKey, "true");
      }

      const di = getDiForUnitTesting();

      di.override(activeRootPanelKindInjectable, () => computed(() => kind));

      return di.inject(shouldUseRootPanelHostInjectable).get();
    };

    afterEach(() => window.localStorage.removeItem(globalDockingStorageKey));

    it("keeps the plain route components when the flag is OFF", () => {
      expect(gate(false, "settings")).toBe(false);
      expect(gate(false, "catalog")).toBe(false);
    });

    it("hosts only the Preferences and Catalog routes when the flag is ON", () => {
      expect(gate(true, "settings")).toBe(true);
      expect(gate(true, "catalog")).toBe(true);
      expect(gate(true, undefined)).toBe(false);
    });
  });
});
