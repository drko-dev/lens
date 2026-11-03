/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { act, render } from "@testing-library/react";
import { computed, observable, runInAction } from "mobx";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import currentPathInjectable from "../../../../renderer/routes/current-path.injectable";
import currentRouteComponentInjectable from "../../../../renderer/routes/current-route-component.injectable";
import startUrlInjectable from "../../../../renderer/frames/cluster-frame/start-url.injectable";
import clusterFrameLayoutChildComponentInjectable from "../../../../renderer/frames/cluster-frame/cluster-frame-layout-child-component.injectable";
import { PanelContentResolver } from "../../../../renderer/components/split-panel/panel-content-resolver";
import { PANEL_CATALOG } from "../../../../renderer/components/split-panel/panel-catalog";
import { canDetachAsList, SplitPanelStore } from "../../../../renderer/components/split-panel/split-panel-store";
import type { PanelKind, SplitLayoutGroup, SplitLayoutNode } from "../../../../renderer/components/split-panel/split-panel-types";
import { isBranchNode, isGroupNode } from "../../../../renderer/components/split-panel/split-panel-types";
import { createGlobalPanelStore, globalPanelKinds, globalPanelPolicy, showRoutePanel } from "../global-panel-store";
import { globalDockingStorageKey } from "../global-docking-feature-flag";
import activeGlobalPanelKindInjectable from "../active-global-panel-kind.injectable";

// The real list views need a live cluster frame; each marker proves which existing component the resolver mounts.
jest.mock("../../../../renderer/components/workloads-statefulsets/statefulsets", () => ({ StatefulSets: () => <div data-testid="view-StatefulSets" /> }));
jest.mock("../../../../renderer/components/workloads-daemonsets/daemonsets", () => ({ DaemonSets: () => <div data-testid="view-DaemonSets" /> }));
jest.mock("../../../../renderer/components/workloads-replicasets/replicasets", () => ({ ReplicaSets: () => <div data-testid="view-ReplicaSets" /> }));
jest.mock("../../../../renderer/components/workloads-jobs/jobs", () => ({ Jobs: () => <div data-testid="view-Jobs" /> }));
jest.mock("../../../../renderer/components/workloads-cronjobs/cronjobs", () => ({ CronJobs: () => <div data-testid="view-CronJobs" /> }));

// The layout test only checks which branch renders and whether the host survives navigation.
let mockHostMounts = 0;

jest.mock("../global-panel-host", () => ({
  GlobalPanelHost: () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("react").useEffect(() => {
      mockHostMounts += 1;
    }, []);

    return <div data-testid="global-panel-host" />;
  },
}));
jest.mock("../../../../renderer/components/layout/main-layout", () => ({ MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("../../../../renderer/components/layout/sidebar", () => ({ Sidebar: () => null }));
jest.mock("../../../../renderer/components/dock", () => ({ Dock: () => null }));

const newKinds = [
  ["statefulsets", "StatefulSets"],
  ["daemonsets", "DaemonSets"],
  ["replicasets", "ReplicaSets"],
  ["jobs", "Jobs"],
  ["cronjobs", "CronJobs"],
] as const;

const routeOfKind: Record<string, string> = {
  pods: "/pods",
  deployments: "/deployments",
  statefulsets: "/statefulsets",
  daemonsets: "/daemonsets",
  replicasets: "/replicasets",
  jobs: "/jobs",
  cronjobs: "/cronjobs",
  events: "/events",
  configmaps: "/configmaps",
  services: "/services",
  ingresses: "/ingresses",
  persistentvolumeclaims: "/persistent-volume-claims",
  nodes: "/nodes",
};

describe("global docking workloads (H7.6.1)", () => {
  describe("catalog and registration", () => {
    it("hosts the seven workload list views (H7.6.2 adds resources, see resources-h7-6-2)", () => {
      expect([...globalPanelPolicy.allowedKinds]).toEqual([...globalPanelKinds]);
      expect(globalPanelKinds.slice(0, 7)).toEqual(["pods", "deployments", "statefulsets", "daemonsets", "replicasets", "jobs", "cronjobs"]);
      expect(globalPanelPolicy.singleInstance).toBe(true);
    });

    it.each(["kubetail", "terminal", "resource-editor", "resource-details", "secrets"] as PanelKind[])("refuses %s inside the host", (kind) => {
      const store = createGlobalPanelStore("c1");
      const before = store.rootNode;

      expect(store.canAddPanelKind(kind)).toBe(false);
      store.addPanel(kind);
      expect(store.rootNode).toBe(before);
    });

    it.each(newKinds)("registers %s as an available workload, opened once and kept docked", (kind) => {
      const item = PANEL_CATALOG.find((entry) => entry.kind === kind);
      const store = createGlobalPanelStore("c1");

      expect(item).toMatchObject({ category: "workloads", available: true });
      expect(canDetachAsList(kind)).toBe(false);
      expect(store.canAddPanelKind(kind)).toBe(true);

      store.addPanel(kind);
      store.addPanel(kind);

      expect(store.allActiveLeaves.filter((leaf) => leaf.panelKind === kind)).toHaveLength(1);
      expect(store.canAddPanelKind(kind)).toBe(false);
    });

    it("keeps the Kubetail catalog (no panel policy) unchanged", () => {
      const kubetail = new SplitPanelStore({ getLocalStorageItem: () => null, setLocalStorageItem: () => {} });

      for (const [kind] of newKinds) {
        expect(kubetail.canAddPanelKind(kind)).toBe(false);
      }

      expect(kubetail.canAddPanelKind("events")).toBe(true);
      expect(kubetail.canAddPanelKind("pods")).toBe(true);
    });

    it.each(newKinds)("resolves %s to the existing Lens %s view", (kind, component) => {
      const { getByTestId } = render(<PanelContentResolver panelKind={kind} leafId="leaf-1" />);

      expect(getByTestId(`panel-content-${kind}-leaf-1`)).toContainElement(getByTestId(`view-${component}`));
    });
  });

  describe("docking compatibility", () => {
    it("groups, splits and keeps new workloads bound to their cluster", () => {
      const store = createGlobalPanelStore("c1");

      store.addPanel("statefulsets");
      store.addPanel("jobs");

      const leafOf = (kind: PanelKind) => store.allActiveLeaves.find((leaf) => leaf.panelKind === kind)!;

      expect(store.dockPanel(leafOf("statefulsets").id, leafOf("jobs").id, "left", "c2")).toBe(false);
      expect(store.dockPanel(leafOf("statefulsets").id, leafOf("jobs").id, "center", "c1")).toBe(true);

      expect(findGroup(store.rootNode)?.panels.map((leaf) => leaf.panelKind).sort()).toEqual(["jobs", "statefulsets"]);
      expect(store.dockPanel(leafOf("statefulsets").id, leafOf("pods").id, "bottom", "c1")).toBe(true);
      expect(store.allActiveLeaves.map((leaf) => leaf.panelKind).sort()).toEqual(["deployments", "jobs", "pods", "statefulsets"]);
    });
  });

  describe("route panel resolution", () => {
    it("adds the panel of a hosted route once, restores it when collapsed and ignores unhosted kinds", () => {
      const store = createGlobalPanelStore("c1");

      showRoutePanel(store, "daemonsets");
      showRoutePanel(store, "daemonsets");

      const daemonsets = store.allActiveLeaves.filter((leaf) => leaf.panelKind === "daemonsets");

      expect(daemonsets).toHaveLength(1);

      store.collapsePanel(daemonsets[0].id);
      showRoutePanel(store, "daemonsets");
      expect(store.isLeafCollapsed(daemonsets[0].id)).toBe(false);

      const before = store.rootNode;

      showRoutePanel(store, undefined);
      showRoutePanel(store, "secrets" as PanelKind);
      expect(store.rootNode).toBe(before);
    });
  });

  describe("cluster frame layout", () => {
    const setup = (flag: string | null) => {
      const di = getDiForUnitTesting();
      const path = observable.box("/pods");
      const Classic = () => <div data-testid="classic-view" />;

      if (flag === null) {
        window.localStorage.removeItem(globalDockingStorageKey);
      } else {
        window.localStorage.setItem(globalDockingStorageKey, flag);
      }

      di.override(currentPathInjectable, () => computed(() => path.get()));
      di.override(currentRouteComponentInjectable, () => computed(() => Classic));
      di.override(startUrlInjectable, () => computed(() => "/pods"));

      const { Component } = di.inject(clusterFrameLayoutChildComponentInjectable);
      const result = renderFor(di)(<Component />);
      const navigate = (to: string) => act(() => runInAction(() => path.set(to)));

      return { ...result, navigate, activeKind: di.inject(activeGlobalPanelKindInjectable) };
    };

    beforeEach(() => {
      mockHostMounts = 0;
    });

    afterEach(() => {
      window.localStorage.removeItem(globalDockingStorageKey);
    });

    it("keeps one mounted host while navigating across every hosted route", () => {
      const { queryByTestId, navigate, activeKind } = setup("true");

      for (const kind of [...globalPanelKinds, "pods"] as PanelKind[]) {
        navigate(routeOfKind[kind]);
        expect(activeKind.get()).toBe(kind);
        expect(queryByTestId("global-panel-host")).not.toBeNull();
        expect(queryByTestId("classic-view")).toBeNull();
      }

      expect(mockHostMounts).toBe(1);
    });

    it("renders unhosted routes classically", () => {
      const { queryByTestId, navigate, activeKind } = setup("true");

      navigate("/secrets");
      expect(activeKind.get()).toBeUndefined();
      expect(queryByTestId("classic-view")).not.toBeNull();
      expect(queryByTestId("global-panel-host")).toBeNull();
    });

    it("renders every workload route classically while the flag is off", () => {
      const { queryByTestId, navigate } = setup(null);

      for (const kind of globalPanelKinds) {
        navigate(routeOfKind[kind]);
        expect(queryByTestId("classic-view")).not.toBeNull();
        expect(queryByTestId("global-panel-host")).toBeNull();
      }

      expect(mockHostMounts).toBe(0);
    });
  });
});

function findGroup(node: SplitLayoutNode): SplitLayoutGroup | undefined {
  if (isGroupNode(node)) return node;

  return isBranchNode(node) ? findGroup(node.first) ?? findGroup(node.second) : undefined;
}
