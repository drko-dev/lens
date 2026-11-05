/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { globalLayoutStorageKeys, serializeGlobalLayout } from "../../common/global-layout-persistence";
import { attachGlobalLayoutPersistence, revealRouteOnMount } from "../global-layout-persistence";
import { createGlobalPanelStore, globalPanelKinds, showRoutePanel } from "../global-panel-store";
import { RestoredSessionGate } from "../restored-session-gate";
import { createLeafNode } from "../../../../renderer/components/split-panel/panel-catalog";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

const activeOf = (store: ReturnType<typeof createGlobalPanelStore>) => (store.rootNode as any).activePanelId as string;

describe("H7.7: the route does not override the restored active tab on mount", () => {
  const keys = globalLayoutStorageKeys({ scope: "cluster", clusterId: "A" });

  const restoredStore = () => {
    const storage = new MemoryStorage();
    const group = {
      type: "group" as const,
      id: "g1",
      activePanelId: "leaf-deployments",
      panels: [{ ...createLeafNode("pods"), id: "leaf-pods" }, { ...createLeafNode("deployments"), id: "leaf-deployments" }],
    };

    storage.setItem(keys.primary, serializeGlobalLayout({ scope: "cluster", clusterId: "A", rootNode: group as any, collapsedLeafIds: [], now: 1 })!);

    const store = createGlobalPanelStore("A");
    const handle = attachGlobalLayoutPersistence({
      store, scope: "cluster", clusterId: "A", allowedKinds: globalPanelKinds, singleInstance: true,
      storage, gate: new RestoredSessionGate(), debounceMs: 300,
    });

    expect(handle.restored).toBe(true);

    return { store, handle };
  };

  it("keeps the restored active tab when the route's panel already exists", () => {
    const { store, handle } = restoredStore();

    revealRouteOnMount(store, "pods");
    expect(activeOf(store)).toBe("leaf-deployments");
    handle.dispose();
  });

  it("later route changes still reveal their panel", () => {
    const { store, handle } = restoredStore();

    revealRouteOnMount(store, "pods");
    showRoutePanel(store, "pods");
    expect(activeOf(store)).toBe("leaf-pods");
    handle.dispose();
  });

  it("a store that was not restored keeps revealing the route's panel on mount", () => {
    const store = createGlobalPanelStore("A");

    revealRouteOnMount(store, "deployments");
    expect(store.allActiveLeaves.some((l) => l.panelKind === "deployments")).toBe(true);
  });
});

describe("H7.7: a corrupted primary layout", () => {
  it("is kept under :corrupted while the previous valid copy is restored and stays untouched", () => {
    const keys = globalLayoutStorageKeys({ scope: "cluster", clusterId: "A" });
    const storage = new MemoryStorage();
    const valid = serializeGlobalLayout({ scope: "cluster", clusterId: "A", rootNode: { ...createLeafNode("pods"), id: "leaf-pods" } as any, collapsedLeafIds: [], now: 1 })!;

    storage.setItem(keys.previous, valid);
    storage.setItem(keys.primary, "{garbage");

    const store = createGlobalPanelStore("A");
    const handle = attachGlobalLayoutPersistence({
      store, scope: "cluster", clusterId: "A", allowedKinds: globalPanelKinds, singleInstance: true,
      storage, gate: new RestoredSessionGate(), debounceMs: 300,
    });

    expect(handle.restored).toBe(true);
    expect(storage.getItem(keys.corrupted)).toBe("{garbage");
    expect(storage.getItem(keys.previous)).toBe(valid);
    expect(store.allActiveLeaves.map((l) => l.panelKind)).toEqual(["pods"]);
    handle.dispose();
  });
});
