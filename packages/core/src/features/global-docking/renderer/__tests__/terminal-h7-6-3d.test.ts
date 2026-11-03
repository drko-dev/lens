/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { createGlobalPanelStore, dockedTerminalTabId, openTerminalPanel } from "../global-panel-store";

const tabIdOf = (store: ReturnType<typeof createGlobalPanelStore>, id: string) =>
  store.allActiveLeaves.find(l => l.id === id)?.resourceBinding?.tabId;

describe("H7.6.3D: docked terminal identity", () => {
  it("opens a new session per explicit call, with a cluster-bound tab id", () => {
    const store = createGlobalPanelStore("c1");
    const a = openTerminalPanel(store, "u-a");
    const b = openTerminalPanel(store, "u-b");

    expect(a).not.toBe(b);
    expect(tabIdOf(store, a)).toBe(dockedTerminalTabId("c1", "u-a"));
    expect(tabIdOf(store, b)).toBe(dockedTerminalTabId("c1", "u-b"));
    expect(store.allActiveLeaves.find(l => l.id === a)?.resourceBinding?.clusterId).toBe("c1");
  });

  it("keeps the session id when the panel is docked to another side", () => {
    const store = createGlobalPanelStore("c1");
    const id = openTerminalPanel(store, "u-a");
    const pods = store.allActiveLeaves.find(l => l.panelKind === "pods")!.id;

    store.dockPanel(id, pods, "right", "c1");
    expect(tabIdOf(store, id)).toBe(dockedTerminalTabId("c1", "u-a"));
  });

  it("collapse and restore keep the same session id", () => {
    const store = createGlobalPanelStore("c1");
    const id = openTerminalPanel(store, "u-a");

    store.collapsePanel(id);
    store.restorePanel(id);
    expect(tabIdOf(store, id)).toBe(dockedTerminalTabId("c1", "u-a"));
  });

  it("explicit close fires onPanelClosed exactly once; a vetoed close does not", async () => {
    const onPanelClosed = jest.fn();
    let allow = false;
    const store = createGlobalPanelStore("c1", { onPanelClosed, confirmPanelClose: async () => allow } as any);
    const id = openTerminalPanel(store, "u-a");

    await store.requestClosePanel(id);
    expect(onPanelClosed).not.toHaveBeenCalled();
    allow = true;
    await store.requestClosePanel(id);
    expect(onPanelClosed).toHaveBeenCalledTimes(1);
    expect(onPanelClosed.mock.calls[0][0].resourceBinding.tabId).toBe(dockedTerminalTabId("c1", "u-a"));
  });
});
