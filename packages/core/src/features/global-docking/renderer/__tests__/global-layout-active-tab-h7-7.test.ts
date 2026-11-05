/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { globalLayoutStorageKeys, serializeGlobalLayout } from "../../common/global-layout-persistence";
import { attachGlobalLayoutPersistence } from "../global-layout-persistence";
import { createRootPanelStore, rootPanelKinds } from "../root-panel-store";
import { RestoredSessionGate } from "../restored-session-gate";
import { createLeafNode } from "../../../../renderer/components/split-panel/panel-catalog";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe("H7.7: switching the active tab of a group is persisted", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("writes the new activePanelId after setActiveTabInGroup", () => {
    const keys = globalLayoutStorageKeys({ scope: "root" });
    const storage = new MemoryStorage();
    const group = {
      type: "group" as const,
      id: "g1",
      activePanelId: "leaf-settings",
      panels: [{ ...createLeafNode("settings"), id: "leaf-settings" }, { ...createLeafNode("catalog"), id: "leaf-catalog" }],
    };

    storage.setItem(keys.primary, serializeGlobalLayout({ scope: "root", rootNode: group as any, collapsedLeafIds: [], now: 1 })!);

    const store = createRootPanelStore("settings");
    const handle = attachGlobalLayoutPersistence({
      store, scope: "root", allowedKinds: rootPanelKinds, singleInstance: true,
      storage, gate: new RestoredSessionGate(), debounceMs: 300,
    });

    expect(handle.restored).toBe(true);
    store.setActiveTabInGroup("g1", "leaf-catalog");
    jest.advanceTimersByTime(400);

    expect(JSON.parse(storage.getItem(keys.primary)!).root.activePanelId).toBe("leaf-catalog");
    handle.dispose();
  });
});
