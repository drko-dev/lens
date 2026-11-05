/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { runInAction } from "mobx";
import { globalLayoutStorageKeys } from "../../common/global-layout-persistence";
import { attachGlobalLayoutPersistence } from "../global-layout-persistence";
import { createGlobalPanelStore, globalPanelKinds } from "../global-panel-store";
import { createRootPanelStore, rootPanelKinds } from "../root-panel-store";
import { RestoredSessionGate } from "../restored-session-gate";

class MemoryStorage implements Storage {
  public data = new Map<string, string>();
  public sets: string[] = [];
  public failWrites = false;
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error("QuotaExceededError");
    this.sets.push(key);
    this.data.set(key, value);
  }
}

const keysA = globalLayoutStorageKeys({ scope: "cluster", clusterId: "A" });
const clusterOpts = (storage: MemoryStorage, store = createGlobalPanelStore("A"), gate = new RestoredSessionGate()) => ({
  store, scope: "cluster" as const, clusterId: "A", allowedKinds: [...globalPanelKinds, "terminal", "pod-logs", "resource-editor", "kubetail", "resource-details"] as never,
  singleInstance: true, storage, gate, debounceMs: 300,
});
const saved = (storage: MemoryStorage, key: string) => JSON.parse(storage.getItem(key)!);

describe("attachGlobalLayoutPersistence (H7.7)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("keeps the seed and does not write when nothing is stored", () => {
    const storage = new MemoryStorage();
    const h = attachGlobalLayoutPersistence(clusterOpts(storage));

    expect(h.restored).toBe(false);
    jest.advanceTimersByTime(1000);
    expect(storage.sets).toEqual([]);
    h.dispose();
  });

  it("debounces many mutations into a single write, then persists and restores the layout", () => {
    const storage = new MemoryStorage();
    const store = createGlobalPanelStore("A");
    const h = attachGlobalLayoutPersistence(clusterOpts(storage, store));
    const branchId = (store.rootNode as any).id;

    for (let i = 1; i <= 20; i++) {
      runInAction(() => store.setBranchRatio(branchId, 0.3 + i / 100));
    }
    store.collapsePanel(store.allActiveLeaves[0].id);
    expect(storage.sets).toEqual([]);
    jest.advanceTimersByTime(300);
    expect(storage.sets).toEqual([keysA.primary]);
    expect(saved(storage, keysA.primary).root.ratio).toBeCloseTo(0.5);
    h.dispose();

    const store2 = createGlobalPanelStore("A");
    const h2 = attachGlobalLayoutPersistence(clusterOpts(storage, store2));

    expect(h2.restored).toBe(true);
    expect((store2.rootNode as any).ratio).toBeCloseTo(0.5);
    expect(store2.isLeafCollapsed(store2.allActiveLeaves[0].id)).toBe(true);
    h2.dispose();
  });

  it("does not save right after restoring the same content", () => {
    const storage = new MemoryStorage();
    const h = attachGlobalLayoutPersistence(clusterOpts(storage));

    const s1 = createGlobalPanelStore("A");
    const h1 = attachGlobalLayoutPersistence(clusterOpts(storage, s1));

    s1.collapsePanel(s1.allActiveLeaves[0].id);
    h1.flush();
    h1.dispose();
    h.dispose();
    storage.sets.length = 0;

    const h2 = attachGlobalLayoutPersistence(clusterOpts(storage));

    jest.advanceTimersByTime(1000);
    h2.flush();
    expect(storage.sets).toEqual([]);
    h2.dispose();
  });

  it("flush writes immediately and keeps the previous valid layout in :prev", () => {
    const storage = new MemoryStorage();
    const store = createGlobalPanelStore("A");
    const h = attachGlobalLayoutPersistence(clusterOpts(storage, store));

    store.collapsePanel(store.allActiveLeaves[0].id);
    h.flush();
    const first = storage.getItem(keysA.primary)!;

    expect(storage.getItem(keysA.previous)).toBeNull();

    store.restorePanel(store.allActiveLeaves[0].id);
    h.flush();
    expect(storage.getItem(keysA.previous)).toBe(first);
    expect(storage.getItem(keysA.primary)).not.toBe(first);
    h.dispose();
  });

  it("dispose stops pending and future writes", () => {
    const storage = new MemoryStorage();
    const store = createGlobalPanelStore("A");
    const h = attachGlobalLayoutPersistence(clusterOpts(storage, store));

    store.collapsePanel(store.allActiveLeaves[0].id);
    h.dispose();
    jest.advanceTimersByTime(1000);
    store.restorePanel(store.allActiveLeaves[0].id);
    jest.advanceTimersByTime(1000);
    h.flush();
    expect(storage.sets).toEqual([]);
  });

  it("falls back primary -> prev, and never throws", () => {
    const storage = new MemoryStorage();
    const s0 = createGlobalPanelStore("A");
    const h0 = attachGlobalLayoutPersistence(clusterOpts(storage, s0));

    s0.collapsePanel(s0.allActiveLeaves[0].id);
    h0.flush();
    h0.dispose();
    const good = storage.getItem(keysA.primary)!;

    storage.setItem(keysA.previous, good);
    storage.setItem(keysA.primary, "{broken");

    const store = createGlobalPanelStore("A");
    const h = attachGlobalLayoutPersistence(clusterOpts(storage, store));

    expect(h.restored).toBe(true);
    expect(store.isLeafCollapsed(store.allActiveLeaves[0].id)).toBe(true);
    h.dispose();
  });

  it("keeps the seed on double failure, backs up the corrupt primary, and preserves a valid :prev on later writes", () => {
    const storage = new MemoryStorage();

    storage.setItem(keysA.primary, "{broken");
    storage.setItem(keysA.previous, JSON.stringify({ version: 9 }));
    const store = createGlobalPanelStore("A");
    const seed = JSON.stringify(store.rootNode);
    const h = attachGlobalLayoutPersistence(clusterOpts(storage, store));

    expect(h.restored).toBe(false);
    expect(JSON.stringify(store.rootNode)).toBe(seed);
    expect(storage.getItem(keysA.corrupted)).toBe("{broken");

    store.collapsePanel(store.allActiveLeaves[0].id);
    h.flush();
    expect(saved(storage, keysA.primary).version).toBe(1);
    // the corrupt primary never replaced :prev
    expect(storage.getItem(keysA.previous)).toBe(JSON.stringify({ version: 9 }));
    h.dispose();
  });

  it("does not overwrite an existing valid :prev with the corrupted backup", () => {
    const storage = new MemoryStorage();
    const s0 = createGlobalPanelStore("A");
    const h0 = attachGlobalLayoutPersistence(clusterOpts(storage, s0));

    s0.collapsePanel(s0.allActiveLeaves[0].id);
    h0.flush();
    h0.dispose();
    const good = storage.getItem(keysA.primary)!;

    storage.setItem(keysA.previous, good);
    storage.setItem(keysA.primary, JSON.stringify({ version: 1, scope: "cluster", clusterId: "A", root: { type: "bogus" } }));
    attachGlobalLayoutPersistence(clusterOpts(storage)).dispose();
    expect(storage.getItem(keysA.previous)).toBe(good);
  });

  it("rejects another cluster's layout and isolates cluster, other cluster and root keys", () => {
    const storage = new MemoryStorage();
    const sB = createGlobalPanelStore("B");
    const hB = attachGlobalLayoutPersistence({ ...clusterOpts(storage, sB), clusterId: "B" });

    sB.collapsePanel(sB.allActiveLeaves[0].id);
    hB.flush();
    hB.dispose();
    // forge: put B's layout under A's key
    storage.setItem(keysA.primary, storage.getItem(globalLayoutStorageKeys({ scope: "cluster", clusterId: "B" }).primary)!);

    const sA = createGlobalPanelStore("A");
    const hA = attachGlobalLayoutPersistence(clusterOpts(storage, sA));

    expect(hA.restored).toBe(false);
    expect(sA.isLeafCollapsed(sA.allActiveLeaves[0].id)).toBe(false);
    hA.dispose();

    const root = createRootPanelStore("settings");
    const hR = attachGlobalLayoutPersistence({ store: root, scope: "root", allowedKinds: rootPanelKinds, singleInstance: true, storage, gate: new RestoredSessionGate() });

    expect(hR.restored).toBe(false);
    root.collapsePanel(root.allActiveLeaves[0].id);
    hR.flush();
    hR.dispose();
    expect(storage.getItem("openlens:root-layout:v1")).not.toBeNull();
    expect([...storage.data.keys()].some((k) => k.startsWith("openlens:split-layout"))).toBe(false);
  });

  it("restores session kinds inert, terminal with a fresh tabId, and persists no sensitive data", () => {
    const storage = new MemoryStorage();
    const store = createGlobalPanelStore("A");
    const h = attachGlobalLayoutPersistence(clusterOpts(storage, store));
    const { openTerminalPanel, openLogsPanel } = jest.requireActual("../global-panel-store");
    const tid = openTerminalPanel(store, "old-uuid");

    openLogsPanel(store, { podId: "u", podName: "p", namespace: "ns", container: "c" });
    runInAction(() => {
      (store.allActiveLeaves.find((l) => l.id === tid) as any).token = "SECRET";
      (store.allActiveLeaves.find((l) => l.id === tid) as any).resourceBinding.grantId = "GRANT";
    });
    h.flush();
    h.dispose();

    const raw = storage.getItem(keysA.primary)!;

    expect(raw).not.toContain("SECRET");
    expect(raw).not.toContain("GRANT");
    expect(raw).toContain("docked-terminal:A:old-uuid");

    const store2 = createGlobalPanelStore("A");
    const gate = new RestoredSessionGate();
    const h2 = attachGlobalLayoutPersistence(clusterOpts(storage, store2, gate));
    const term = store2.allActiveLeaves.find((l) => l.panelKind === "terminal")!;
    const logs = store2.allActiveLeaves.find((l) => l.panelKind === "pod-logs")!;

    expect(term.resourceBinding!.tabId).toMatch(/^docked-terminal:A:/);
    expect(term.resourceBinding!.tabId).not.toBe("docked-terminal:A:old-uuid");
    expect(gate.isInert(term.id)).toBe(true);
    expect(gate.isInert(logs.id)).toBe(true);
    expect(gate.isInert(store2.allActiveLeaves.find((l) => l.panelKind === "pods")!.id)).toBe(false);
    h2.dispose();
  });

  it("catches storage write failures", () => {
    const storage = new MemoryStorage();
    const store = createGlobalPanelStore("A");
    const logger = { warn: jest.fn() };
    const h = attachGlobalLayoutPersistence({ ...clusterOpts(storage, store), logger });

    storage.failWrites = true;
    store.collapsePanel(store.allActiveLeaves[0].id);
    expect(() => h.flush()).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
    h.dispose();
  });

  it("never touches the Kubetail layout key or the shared templates", () => {
    const storage = new MemoryStorage();
    const real = window.localStorage;

    real.setItem("openlens:split-layout", "kubetail-layout");
    const store = createGlobalPanelStore("A");
    const h = attachGlobalLayoutPersistence(clusterOpts(storage, store));

    store.collapsePanel(store.allActiveLeaves[0].id);
    h.flush();
    h.dispose();
    expect(real.getItem("openlens:split-layout")).toBe("kubetail-layout");
    expect(storage.getItem("openlens:split-layout")).toBeNull();
  });

  it("is independent from the feature flag (never reads it)", () => {
    // The helper only needs a store/storage/gate: attaching works with no flag setup at all.
    const h = attachGlobalLayoutPersistence(clusterOpts(new MemoryStorage()));

    expect(typeof h.flush).toBe("function");
    h.dispose();
  });
});
