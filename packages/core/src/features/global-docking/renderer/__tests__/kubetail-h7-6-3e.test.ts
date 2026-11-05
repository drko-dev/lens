/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import hostedClusterIdInjectable from "../../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import kubetailStoreInjectable from "../../../../renderer/components/kubetail/kubetail-store.injectable";
import globalPanelStoreInjectable from "../global-panel-store.injectable";
import { createGlobalPanelStore, dockedKubetailTabId, isKubetailHidden, openKubetailPanel } from "../global-panel-store";

const kubetailLeaves = (store: ReturnType<typeof createGlobalPanelStore>) => store.allActiveLeaves.filter(l => l.panelKind === "kubetail");

describe("H7.6.3E: docked Kubetail identity and visibility", () => {
  it("is a single instance bound to the cluster; opening again reveals it", () => {
    const store = createGlobalPanelStore("c1");
    const a = openKubetailPanel(store);
    const b = openKubetailPanel(store);

    expect(a).toBe(b);
    expect(kubetailLeaves(store)).toHaveLength(1);
    expect(kubetailLeaves(store)[0].resourceBinding).toMatchObject({ clusterId: "c1", tabId: dockedKubetailTabId("c1") });
  });

  it("keeps identity across a dock move, collapse and restore", () => {
    const store = createGlobalPanelStore("c1");
    const id = openKubetailPanel(store);
    const pods = store.allActiveLeaves.find(l => l.panelKind === "pods")!.id;

    store.dockPanel(id, pods, "left", "c1");
    store.collapsePanel(id);
    store.restorePanel(id);
    expect(kubetailLeaves(store)).toHaveLength(1);
    expect(kubetailLeaves(store)[0].resourceBinding?.tabId).toBe(dockedKubetailTabId("c1"));
  });

  it("is hidden when collapsed or an inactive tab, visible otherwise", () => {
    const store = createGlobalPanelStore("c1");
    const id = openKubetailPanel(store);
    const pods = store.allActiveLeaves.find(l => l.panelKind === "pods")!.id;

    expect(isKubetailHidden(store)).toBe(false);
    store.collapsePanel(id);
    expect(isKubetailHidden(store)).toBe(true);
    store.restorePanel(id);
    expect(isKubetailHidden(store)).toBe(false);
    store.dockPanel(id, pods, "center", "c1"); // group as a tab
    expect(isKubetailHidden(store)).toBe(false);
  });
});

describe("H7.6.3E: host wiring on the frame KubetailStore", () => {
  const setup = () => {
    const di = getDiForUnitTesting();
    const kubetail = { isPaused: false, pause: jest.fn(function (this: any) { kubetail.isPaused = true; }), resume: jest.fn(function () { kubetail.isPaused = false; }), stopAllStreams: jest.fn(), clearLogs: jest.fn() };

    di.override(hostedClusterIdInjectable, () => "c1");
    di.override(kubetailStoreInjectable, () => kubetail as any);

    return { store: di.inject(globalPanelStoreInjectable), kubetail };
  };

  it("collapse pauses once and restore resumes once; nothing else touches the streams", () => {
    const { store, kubetail } = setup();
    const id = openKubetailPanel(store);

    store.collapsePanel(id);
    expect(kubetail.pause).toHaveBeenCalledTimes(1);
    store.restorePanel(id);
    expect(kubetail.resume).toHaveBeenCalledTimes(1);
    expect(kubetail.stopAllStreams).not.toHaveBeenCalled();
    expect(kubetail.clearLogs).not.toHaveBeenCalled();
  });

  it("does not resume what the user paused", () => {
    const { store, kubetail } = setup();
    const id = openKubetailPanel(store);

    kubetail.isPaused = true; // paused by the user (Space)
    store.collapsePanel(id);
    store.restorePanel(id);
    expect(kubetail.pause).not.toHaveBeenCalled();
    expect(kubetail.resume).not.toHaveBeenCalled();
  });

  it("an explicit close stops and clears the streams exactly once", async () => {
    const { store, kubetail } = setup();
    const id = openKubetailPanel(store);

    await store.requestClosePanel(id);
    expect(kubetail.stopAllStreams).toHaveBeenCalledTimes(1);
    expect(kubetail.clearLogs).toHaveBeenCalledTimes(1);
    expect(kubetailLeaves(store)).toHaveLength(0);
  });
});
