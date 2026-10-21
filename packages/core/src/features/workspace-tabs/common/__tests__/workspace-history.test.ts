/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { WorkspaceHistoryManager } from "../workspace-history";

describe("WorkspaceHistoryManager Unit Suite", () => {
  let manager: WorkspaceHistoryManager;

  beforeEach(() => {
    manager = new WorkspaceHistoryManager();
  });

  it("initializes with empty history and cannot go back or forward", () => {
    expect(manager.canGoBack("ws-1")).toBe(false);
    expect(manager.canGoForward("ws-1")).toBe(false);
    expect(manager.getCurrentIndex("ws-1")).toBe(-1);
    expect(manager.getCurrentEntry("ws-1")).toBeUndefined();
  });

  it("records navigation entries and updates current entry", () => {
    manager.recordNavigation({
      workspaceId: "ws-1",
      tabId: "tab-dev",
      clusterId: "cluster-dev",
      path: "/workloads/pods",
    });

    expect(manager.canGoBack("ws-1")).toBe(false);
    expect(manager.canGoForward("ws-1")).toBe(false);
    expect(manager.getCurrentIndex("ws-1")).toBe(0);

    const current = manager.getCurrentEntry("ws-1");

    expect(current?.tabId).toBe("tab-dev");
    expect(current?.clusterId).toBe("cluster-dev");
    expect(current?.path).toBe("/workloads/pods");
  });

  it("prevents duplicate navigation loops when recording identical successive entries", () => {
    manager.recordNavigation({
      workspaceId: "ws-1",
      tabId: "tab-dev",
      clusterId: "cluster-dev",
      path: "/workloads/pods",
    });

    manager.recordNavigation({
      workspaceId: "ws-1",
      tabId: "tab-dev",
      clusterId: "cluster-dev",
      path: "/workloads/pods",
    });

    expect(manager.getHistory("ws-1")).toHaveLength(1);
    expect(manager.getCurrentIndex("ws-1")).toBe(0);
  });

  it("navigates back and forward accurately through history entries", () => {
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "tab-1", clusterId: "c-1", path: "/overview" });
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "tab-2", clusterId: "c-2", path: "/nodes" });
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "tab-3", clusterId: "c-3", path: "/pods" });

    expect(manager.canGoBack("ws-1")).toBe(true);
    expect(manager.canGoForward("ws-1")).toBe(false);
    expect(manager.getCurrentIndex("ws-1")).toBe(2);

    const back1 = manager.goBack("ws-1");

    expect(back1?.tabId).toBe("tab-2");
    expect(manager.canGoBack("ws-1")).toBe(true);
    expect(manager.canGoForward("ws-1")).toBe(true);

    const back2 = manager.goBack("ws-1");

    expect(back2?.tabId).toBe("tab-1");
    expect(manager.canGoBack("ws-1")).toBe(false);
    expect(manager.canGoForward("ws-1")).toBe(true);

    const forward1 = manager.goForward("ws-1");

    expect(forward1?.tabId).toBe("tab-2");
    expect(manager.canGoBack("ws-1")).toBe(true);
  });

  it("truncates forward history when recording a new navigation from an intermediate history state", () => {
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "tab-1", clusterId: "c-1" });
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "tab-2", clusterId: "c-2" });
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "tab-3", clusterId: "c-3" });

    manager.goBack("ws-1"); // now at tab-2

    manager.recordNavigation({ workspaceId: "ws-1", tabId: "tab-4", clusterId: "c-4" });

    expect(manager.getHistory("ws-1").map((e) => e.tabId)).toEqual(["tab-1", "tab-2", "tab-4"]);
    expect(manager.getCurrentIndex("ws-1")).toBe(2);
    expect(manager.canGoForward("ws-1")).toBe(false);
  });

  it("strictly enforces maximum 20 entries bound and shifts oldest entries", () => {
    for (let i = 1; i <= 25; i++) {
      manager.recordNavigation({
        workspaceId: "ws-1",
        tabId: `tab-${i}`,
        clusterId: `cluster-${i}`,
      });
    }

    const history = manager.getHistory("ws-1");

    expect(history).toHaveLength(20);
    expect(history[0].tabId).toBe("tab-6");
    expect(history[19].tabId).toBe("tab-25");
    expect(manager.getCurrentIndex("ws-1")).toBe(19);
  });

  it("purges entries referencing a deleted cluster and clamps current index safely", () => {
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "tab-1", clusterId: "cluster-keep" });
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "tab-2", clusterId: "cluster-drop" });
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "tab-3", clusterId: "cluster-keep" });

    manager.purgeCluster("cluster-drop");

    const history = manager.getHistory("ws-1");

    expect(history).toHaveLength(2);
    expect(history.map((e) => e.clusterId)).toEqual(["cluster-keep", "cluster-keep"]);
    expect(manager.getCurrentIndex("ws-1")).toBe(1);
  });

  it("sanitizes unsafe navigation paths (traversal, schemes, tokens)", () => {
    manager.recordNavigation({
      workspaceId: "ws-1",
      tabId: "tab-1",
      clusterId: "c-1",
      path: "/pods/../../secret",
    });

    expect(manager.getCurrentEntry("ws-1")?.path).toBeUndefined();

    manager.recordNavigation({
      workspaceId: "ws-1",
      tabId: "tab-2",
      clusterId: "c-2",
      path: "javascript:alert(1)",
    });

    expect(manager.getCurrentEntry("ws-1")?.path).toBeUndefined();

    manager.recordNavigation({
      workspaceId: "ws-1",
      tabId: "tab-3",
      clusterId: "c-3",
      path: "/pods?token=sensitive-12345",
    });

    expect(manager.getCurrentEntry("ws-1")?.path).toBeUndefined();

    manager.recordNavigation({
      workspaceId: "ws-1",
      tabId: "tab-4",
      clusterId: "c-4",
      path: "/workloads/pods?namespace=default",
    });

    expect(manager.getCurrentEntry("ws-1")?.path).toBe("/workloads/pods?namespace=default");
  });

  it("serializes and restores history snapshots accurately", () => {
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "t-1", clusterId: "c-1", path: "/a" });
    manager.recordNavigation({ workspaceId: "ws-1", tabId: "t-2", clusterId: "c-2", path: "/b" });
    manager.goBack("ws-1");

    const snapshot = manager.toSnapshot("ws-1");

    expect(snapshot.workspaceId).toBe("ws-1");
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.currentIndex).toBe(0);

    const freshManager = new WorkspaceHistoryManager();

    freshManager.restoreSnapshot(snapshot);

    expect(freshManager.getCurrentIndex("ws-1")).toBe(0);
    expect(freshManager.getCurrentEntry("ws-1")?.tabId).toBe("t-1");
    expect(freshManager.canGoForward("ws-1")).toBe(true);
  });
});
