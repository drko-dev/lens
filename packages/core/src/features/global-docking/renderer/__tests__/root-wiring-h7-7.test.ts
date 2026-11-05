/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { computed } from "mobx";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import lensLocalStorageStateInjectable from "../../../../renderer/utils/create-storage/state.injectable";
import activeRootPanelKindInjectable from "../active-root-panel-kind.injectable";
import rootPanelStoreInjectable from "../root-panel-store.injectable";
import { globalDockingStorageKey } from "../global-docking-feature-flag";
import { globalLayoutStorageKeys, serializeGlobalLayout } from "../../common/global-layout-persistence";
import { createLeafNode } from "../../../../renderer/components/split-panel/panel-catalog";
import type { SplitLayoutBranch } from "../../../../renderer/components/split-panel/split-panel-types";

const saved = (): string => {
  const root: SplitLayoutBranch = {
    type: "branch",
    id: "b1",
    orientation: "horizontal",
    ratio: 0.3,
    first: { ...createLeafNode("catalog"), id: "leaf-catalog" },
    second: { ...createLeafNode("settings"), id: "leaf-settings" },
  };

  return serializeGlobalLayout({ scope: "root", rootNode: root, collapsedLeafIds: ["leaf-settings"], now: 1 })!;
};

describe("H7.7: root store persistence wiring", () => {
  const keys = globalLayoutStorageKeys({ scope: "root" });

  const build = (flag: boolean, initial: Record<string, unknown>) => {
    window.localStorage.removeItem(globalDockingStorageKey);

    if (flag) {
      window.localStorage.setItem(globalDockingStorageKey, "true");
    }

    const di = getDiForUnitTesting();
    const state = di.inject(lensLocalStorageStateInjectable) as Record<string, unknown>;

    Object.assign(state, initial);
    di.override(activeRootPanelKindInjectable, () => computed(() => "settings" as const));

    return { store: di.inject(rootPanelStoreInjectable), state };
  };

  afterEach(() => window.localStorage.removeItem(globalDockingStorageKey));

  it("flag ON restores the saved root layout from the disk-backed state, collapsed included", () => {
    const { store } = build(true, { [keys.primary]: saved() });

    expect(store.allActiveLeaves.map((l) => l.panelKind).sort()).toEqual(["catalog", "settings"]);
    expect(store.isLeafCollapsed("leaf-settings")).toBe(true);
  });

  it("flag OFF neither reads nor writes the saved layout", () => {
    const { store, state } = build(false, { [keys.primary]: saved() });

    expect(store.allActiveLeaves.map((l) => l.panelKind)).toEqual(["settings"]);
    expect(state[keys.primary]).toBe(saved());
    expect(state[keys.previous]).toBeUndefined();
  });

  it("a corrupted saved layout falls back to the default and is kept aside", () => {
    const { store, state } = build(true, { [keys.primary]: "{not json" });

    expect(store.allActiveLeaves.map((l) => l.panelKind)).toEqual(["settings"]);
    expect(state[keys.corrupted]).toBe("{not json");
  });

  it("never touches the classic Kubetail layout key", () => {
    const { state } = build(true, { [keys.primary]: saved() });

    expect(state["openlens:split-layout"]).toBeUndefined();
  });
});
