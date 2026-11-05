/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { render } from "@testing-library/react";
import { PanelContentResolver, RouteViewsContext } from "../../../../renderer/components/split-panel/panel-content-resolver";
import { PANEL_CATALOG } from "../../../../renderer/components/split-panel/panel-catalog";
import { canDetachAsList, SplitPanelStore } from "../../../../renderer/components/split-panel/split-panel-store";
import type { PanelKind } from "../../../../renderer/components/split-panel/split-panel-types";
import { createGlobalPanelStore, globalPanelKinds } from "../global-panel-store";

// Each marker proves which existing Lens route view the resolver mounts (and with which props).
jest.mock("../../../../renderer/components/events/events", () => ({ Events: ({ compact }: { compact?: boolean }) => <div data-testid={compact ? "view-Events-compact" : "view-Events"} /> }));
jest.mock("../../../../renderer/components/config-maps/config-maps", () => ({ ConfigMaps: () => <div data-testid="view-ConfigMaps" /> }));
jest.mock("../../../../renderer/components/network-services/services", () => ({ Services: () => <div data-testid="view-Services" /> }));
jest.mock("../../../../renderer/components/network-ingresses/ingresses", () => ({ Ingresses: () => <div data-testid="view-Ingresses" /> }));
jest.mock("../../../../renderer/components/storage-volume-claims/volume-claims", () => ({ PersistentVolumeClaims: () => <div data-testid="view-PersistentVolumeClaims" /> }));
jest.mock("../../../../renderer/components/nodes/route", () => ({ NodesRoute: () => <div data-testid="view-NodesRoute" /> }));

const newKinds = [
  ["events", "Events"],
  ["configmaps", "ConfigMaps"],
  ["services", "Services"],
  ["ingresses", "Ingresses"],
  ["persistentvolumeclaims", "PersistentVolumeClaims"],
  ["nodes", "NodesRoute"],
] as const;

describe("global docking resources and networking (H7.6.2)", () => {
  it("hosts exactly the seven workloads and the six new resources", () => {
    expect([...globalPanelKinds]).toEqual([
      "pods", "deployments", "statefulsets", "daemonsets", "replicasets", "jobs", "cronjobs",
      "events", "configmaps", "services", "ingresses", "persistentvolumeclaims", "nodes",
    ]);
  });

  it.each(newKinds)("registers %s once, available and kept docked", (kind) => {
    const store = createGlobalPanelStore("c1");

    expect(PANEL_CATALOG.find((item) => item.kind === kind)).toMatchObject({ available: true });
    expect(canDetachAsList(kind)).toBe(false);
    store.addPanel(kind);
    store.addPanel(kind);
    expect(store.allActiveLeaves.filter((leaf) => leaf.panelKind === kind)).toHaveLength(1);
  });

  it.each(newKinds)("mounts the Lens route view of %s (%s) inside the host", (kind, view) => {
    const { getByTestId } = render(
      <RouteViewsContext.Provider value={true}>
        <PanelContentResolver panelKind={kind} leafId="leaf-1" />
      </RouteViewsContext.Provider>,
    );

    expect(getByTestId(`panel-content-${kind}-leaf-1`)).toContainElement(getByTestId(`view-${view}`));
  });

  it("keeps the compact Events panel and the original catalog for Kubetail", () => {
    const kubetail = new SplitPanelStore({ getLocalStorageItem: () => null, setLocalStorageItem: () => {} });
    const { getByTestId } = render(<PanelContentResolver panelKind="events" leafId="leaf-1" />);

    expect(getByTestId("view-Events-compact")).toBeTruthy();
    expect(kubetail.canAddPanelKind("events")).toBe(true);

    for (const [kind] of newKinds.filter(([kind]) => kind !== "events")) {
      expect(kubetail.canAddPanelKind(kind as PanelKind)).toBe(false);
    }
  });

  it("still refuses Secrets and the non-list tools inside the host", () => {
    const store = createGlobalPanelStore("c1");

    for (const kind of ["secrets", "kubetail", "terminal", "resource-editor", "resource-details"] as PanelKind[]) {
      expect(store.canAddPanelKind(kind)).toBe(false);
    }
  });
});
