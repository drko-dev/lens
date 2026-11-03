/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import hostedClusterIdInjectable from "../../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import logTabStoreInjectable from "../../../../renderer/components/dock/logs/tab-store.injectable";
import type { SplitLayoutLeaf } from "../../../../renderer/components/split-panel/split-panel-types";
import { createGlobalPanelStore, dockedLogsTabId, openLogsPanel } from "../global-panel-store";
import type { LogsDescriptor } from "../global-panel-store";
import { BoundPodLogs } from "../bound-pod-logs";

jest.mock("../../../../renderer/components/dock/logs/view", () => ({
  LogsDockTab: ({ tab }: any) => <div data-testid="logs-dock-tab-stub" data-tab={tab.id} />,
}));

const main: LogsDescriptor = { podId: "uid-pod", podName: "h7-pod-0", namespace: "h7-synthetic", container: "main" };
const sidecar: LogsDescriptor = { ...main, container: "sidecar" };
const logsLeaves = (store: ReturnType<typeof createGlobalPanelStore>) => store.allActiveLeaves.filter((leaf) => leaf.panelKind === "pod-logs");
const bindingOf = (store: ReturnType<typeof createGlobalPanelStore>, id: string) => store.allActiveLeaves.find((leaf) => leaf.id === id)?.resourceBinding;

describe("global docking Pod Logs (H7.6.3B)", () => {
  describe("descriptor and identity", () => {
    it("opens one panel per pod container, with a stable tab id derived from the identity", () => {
      const store = createGlobalPanelStore("c1");
      const first = openLogsPanel(store, main);

      expect(openLogsPanel(store, main)).toBe(first);

      const second = openLogsPanel(store, sidecar);

      expect(second).not.toBe(first);
      expect(logsLeaves(store)).toHaveLength(2);
      expect(bindingOf(store, first)).toMatchObject({ clusterId: "c1", kind: "Pod", name: "h7-pod-0", namespace: "h7-synthetic", uid: "uid-pod", container: "main" });
      expect(bindingOf(store, first)?.tabId).toBe("docked-logs:c1:h7-synthetic:uid-pod:main");
      expect(bindingOf(store, second)?.tabId).not.toBe(bindingOf(store, first)?.tabId);
    });

    it("never mixes clusters, namespaces, pods or containers in a tab id", () => {
      const base = { clusterId: "c1", namespace: "ns", name: "p", uid: "u", container: "main" };
      const ids = [
        dockedLogsTabId(base),
        dockedLogsTabId({ ...base, clusterId: "c2" }),
        dockedLogsTabId({ ...base, namespace: "other" }),
        dockedLogsTabId({ ...base, uid: "u2" }),
        dockedLogsTabId({ ...base, container: "sidecar" }),
      ];

      expect(new Set(ids).size).toBe(ids.length);
    });

    it("keeps leaf id, binding and tab id through moves, grouping, collapse and restore", () => {
      const store = createGlobalPanelStore("c1");
      const [pods] = store.allActiveLeaves;
      const id = openLogsPanel(store, main);
      const expected = bindingOf(store, id);

      for (const position of ["left", "right", "top", "bottom", "center"] as const) {
        expect(store.dockPanel(id, pods.id, position, "c1")).toBe(true);
        expect(bindingOf(store, id)).toEqual(expected);
      }

      store.collapsePanel(id);
      store.restorePanel(id);
      expect(bindingOf(store, id)).toEqual(expected);
      expect(store.dockPanel(id, pods.id, "left", "c2")).toBe(false);
    });

    it("reveals a collapsed panel instead of opening a second one", () => {
      const store = createGlobalPanelStore("c1");
      const id = openLogsPanel(store, main);

      store.collapsePanel(id);
      expect(store.isLeafCollapsed(id)).toBe(true);

      expect(openLogsPanel(store, main)).toBe(id);
      expect(store.isLeafCollapsed(id)).toBe(false);
      expect(logsLeaves(store)).toHaveLength(1);
    });
  });

  describe("release hook", () => {
    it("tells the owner about an explicit close, once, and not about moves or collapse", () => {
      const closed: SplitLayoutLeaf[] = [];
      const store = createGlobalPanelStore("c1", { onPanelClosed: (leaf) => closed.push(leaf) });
      const [pods] = store.allActiveLeaves;
      const id = openLogsPanel(store, main);

      store.dockPanel(id, pods.id, "left", "c1");
      store.collapsePanel(id);
      store.restorePanel(id);
      expect(closed).toHaveLength(0);

      store.closePanel(id);
      store.closePanel(id); // already gone: no second release

      expect(closed).toHaveLength(1);
      expect(closed[0].panelKind).toBe("pod-logs");
      expect(closed[0].resourceBinding?.tabId).toBe("docked-logs:c1:h7-synthetic:uid-pod:main");
    });

    it("keeps the classic behavior when no hook is given", () => {
      const store = createGlobalPanelStore("c1");
      const id = openLogsPanel(store, main);

      expect(() => store.closePanel(id)).not.toThrow();
      expect(logsLeaves(store)).toHaveLength(0);
    });
  });

  describe("BoundPodLogs", () => {
    const setup = (hostedClusterId: string) => {
      const di = getDiForUnitTesting();

      di.override(hostedClusterIdInjectable, () => hostedClusterId);

      return { di, render: renderFor(di) };
    };
    const binding = (clusterId: string) => {
      const store = createGlobalPanelStore(clusterId);

      return bindingOf(store, openLogsPanel(store, main))!;
    };

    it("creates the tab data of its session once and renders the original Logs tab with the stable id", () => {
      const { di, render } = setup("c1");
      const result = render(<BoundPodLogs binding={binding("c1")} />);
      const tabId = "docked-logs:c1:h7-synthetic:uid-pod:main";

      expect(result.getByTestId("bound-logs").getAttribute("data-tab-id")).toBe(tabId);
      expect(result.getByTestId("logs-dock-tab-stub").getAttribute("data-tab")).toBe(tabId);
      expect(di.inject(logTabStoreInjectable).getData(tabId)).toMatchObject({
        selectedPodId: "uid-pod", namespace: "h7-synthetic", selectedContainer: "main", showPrevious: false,
      });
    });

    it("does not overwrite what the user changed in the session when the panel remounts", () => {
      const { di, render } = setup("c1");
      const tabId = "docked-logs:c1:h7-synthetic:uid-pod:main";
      const first = render(<BoundPodLogs binding={binding("c1")} />);

      di.inject(logTabStoreInjectable).setData(tabId, { ...di.inject(logTabStoreInjectable).getData(tabId)!, showPrevious: true, tailLines: 100 });
      first.unmount();
      render(<BoundPodLogs binding={binding("c1")} />);

      expect(di.inject(logTabStoreInjectable).getData(tabId)).toMatchObject({ showPrevious: true, tailLines: 100 });
    });

    it("renders nothing of another cluster and creates no session for it", () => {
      const { di, render } = setup("c2");
      const result = render(<BoundPodLogs binding={binding("c1")} />);

      expect(result.queryByTestId("bound-logs")).toBeNull();
      expect(result.getByTestId("bound-logs-unavailable").getAttribute("data-cluster-id")).toBe("c1");
      expect(result.queryByTestId("logs-dock-tab-stub")).toBeNull();
      expect(di.inject(logTabStoreInjectable).getData("docked-logs:c1:h7-synthetic:uid-pod:main")).toBeUndefined();
    });
  });
});
