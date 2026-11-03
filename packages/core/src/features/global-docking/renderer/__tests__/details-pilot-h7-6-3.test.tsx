/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { act, render } from "@testing-library/react";
import { computed, observable, runInAction } from "mobx";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import apiManagerInjectable from "../../../../common/k8s-api/api-manager/manager.injectable";
import subscribeStoresInjectable from "../../../../renderer/kube-watch-api/subscribe-stores.injectable";
import hostedClusterIdInjectable from "../../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";
import clusterFrameContextForNamespacedResourcesInjectable from "../../../../renderer/cluster-frame-context/for-namespaced-resources.injectable";
import kubeObjectDetailItemsInjectable from "../../../../renderer/components/kube-object-details/kube-object-detail-items/kube-object-detail-items.injectable";
import { PanelContentResolver, RouteViewsContext } from "../../../../renderer/components/split-panel/panel-content-resolver";
import { findParentGroup } from "../../../../renderer/components/split-panel/split-panel-store";
import type { PanelResourceBinding } from "../../../../renderer/components/split-panel/split-panel-types";
import { createGlobalPanelStore, openDetailsPanel, showRoutePanel } from "../global-panel-store";
import type { DetailsDescriptor } from "../global-panel-store";
import { BoundResourceDetails } from "../bound-resource-details";

jest.mock("../../../../renderer/components/split-panel/resource-details-panel-content", () => ({ ResourceDetailsPanelContent: () => <div data-testid="kubetail-details" /> }));
jest.mock("../../../../renderer/components/kube-object-details/details-header", () => ({ DetailsHeader: ({ object }: any) => <div data-testid="details-header">{object.metadata.name}</div> }));
jest.mock("../../../../renderer/components/kube-object-menu", () => ({ KubeObjectMenu: () => null }));

const pod: DetailsDescriptor = { apiVersion: "v1", kind: "Pod", name: "h7-pod-0", namespace: "h7-synthetic", uid: "uid-pod" };
const deploy: DetailsDescriptor = { apiVersion: "apps/v1", kind: "Deployment", name: "h7-deploy", namespace: "h7-synthetic", uid: "uid-deploy" };
const detailsLeaves = (store: ReturnType<typeof createGlobalPanelStore>) => store.allActiveLeaves.filter((leaf) => leaf.panelKind === "resource-details");
const bindingOf = (store: ReturnType<typeof createGlobalPanelStore>, id: string) => store.allActiveLeaves.find((leaf) => leaf.id === id)?.resourceBinding;

describe("global docking Details pilot (H7.6.3)", () => {
  describe("descriptor and identity", () => {
    it("opens one panel per resource, bound to the host cluster", () => {
      const store = createGlobalPanelStore("c1");
      const podPanel = openDetailsPanel(store, pod);

      expect(openDetailsPanel(store, pod)).toBe(podPanel);
      const deployPanel = openDetailsPanel(store, deploy);

      expect(deployPanel).not.toBe(podPanel);
      expect(detailsLeaves(store)).toHaveLength(2);
      expect(bindingOf(store, podPanel)).toEqual({ ...pod, clusterId: "c1" });
      expect(bindingOf(store, deployPanel)).toEqual({ ...deploy, clusterId: "c1" });
    });

    it("keeps leaf id and binding through moves, grouping, collapse and route changes", () => {
      const store = createGlobalPanelStore("c1");
      const [pods] = store.allActiveLeaves;
      const id = openDetailsPanel(store, pod);
      const expected = bindingOf(store, id);

      for (const position of ["left", "right", "top", "bottom", "center"] as const) {
        expect(store.dockPanel(id, pods.id, position, "c1")).toBe(true);
        expect(bindingOf(store, id)).toEqual(expected);
      }

      store.collapsePanel(id);
      store.restorePanel(id);
      showRoutePanel(store, "deployments");
      showRoutePanel(store, "events");

      expect(bindingOf(store, id)).toEqual(expected);
      expect(store.dockPanel(id, pods.id, "left", "c2")).toBe(false);
    });

    it("reveals an existing panel that is collapsed or an inactive tab instead of duplicating it", () => {
      const store = createGlobalPanelStore("c1");
      const [pods] = store.allActiveLeaves;
      const id = openDetailsPanel(store, pod);

      store.dockPanel(id, pods.id, "center", "c1");
      store.setActiveTabInGroup(findParentGroup(store.rootNode, id)!.id, pods.id);
      expect(openDetailsPanel(store, pod)).toBe(id);
      expect(findParentGroup(store.rootNode, id)?.activePanelId).toBe(id);

      store.collapsePanel(id);
      openDetailsPanel(store, pod);
      expect(store.isLeafCollapsed(id)).toBe(false);
      expect(detailsLeaves(store)).toHaveLength(1);
    });

    it("reopens a closed panel with the same descriptor", () => {
      const store = createGlobalPanelStore("c1");
      const first = openDetailsPanel(store, deploy);

      store.closePanel(first);
      expect(detailsLeaves(store)).toHaveLength(0);
      const second = openDetailsPanel(store, deploy);

      expect(second).not.toBe(first);
      expect(bindingOf(store, second)).toEqual({ ...deploy, clusterId: "c1" });
    });

    it("keeps Details out of the catalog (it needs a resource)", () => {
      expect(createGlobalPanelStore("c1").canAddPanelKind("resource-details")).toBe(false);
    });
  });

  describe("rendering", () => {
    it("uses the bound view inside the host and the Kubetail view elsewhere", () => {
      const binding: PanelResourceBinding = { ...pod, clusterId: "c1" };
      const kubetail = render(<PanelContentResolver panelKind="resource-details" leafId="l1" resourceBinding={binding} />);

      expect(kubetail.queryByTestId("kubetail-details")).not.toBeNull();
    });

    const setup = (hostedClusterId: string, contextNamespaces = ["h7-synthetic"]) => {
      const di = getDiForUnitTesting();
      const items = observable.array<any>([]);
      const store = { getByName: jest.fn((name: string, ns?: string) => items.find((o) => o.metadata.name === name && o.metadata.namespace === ns)) };
      const api = {};
      const dispose = jest.fn();
      const subscribeStores = jest.fn(() => dispose);

      di.override(apiManagerInjectable, () => ({ getApiByKind: jest.fn(() => api), getStore: jest.fn((a: unknown) => (a === api ? store : undefined)) }) as any);
      di.override(subscribeStoresInjectable, () => subscribeStores);
      di.override(hostedClusterIdInjectable, () => hostedClusterId);
      di.override(clusterFrameContextForNamespacedResourcesInjectable, () => ({ contextNamespaces, hasSelectedAll: false, allNamespaces: contextNamespaces, isLoadingAll: false }) as any);
      // The registered detail items receive the bound object (marker instead of the real Lens items).
      di.override(kubeObjectDetailItemsInjectable, () => computed(() => [({ object }: any) => <div data-testid="detail-item">{object.metadata.name}</div>]));

      return { di, items, store, subscribeStores, dispose };
    };

    it("shows the bound object, shares the list watch of its store once per mount and releases it on unmount", () => {
      const { di, items, subscribeStores, dispose } = setup("c1");
      const result = renderFor(di)(<BoundResourceDetails binding={{ ...pod, clusterId: "c1" }} />);

      expect(result.queryByTestId("bound-details-unavailable")).not.toBeNull();
      act(() => runInAction(() => { items.push({ metadata: { name: "h7-pod-0", namespace: "h7-synthetic" } }); }));
      expect(result.getByTestId("bound-details").dataset).toMatchObject({ kind: "Pod", name: "h7-pod-0", namespace: "h7-synthetic", clusterId: "c1" });
      expect(result.getByTestId("detail-item").textContent).toBe("h7-pod-0");
      expect(subscribeStores).toHaveBeenCalledTimes(1);
      // No explicit namespaces: KubeWatchApi reference-counts the filter watch shared with list views.
      expect(subscribeStores).toHaveBeenCalledWith([expect.anything()], {});

      result.unmount();
      expect(dispose).toHaveBeenCalledTimes(1);
    });

    it("watches only its own namespace when the namespace filter does not cover it", () => {
      const { di, subscribeStores } = setup("c1", ["other"]);

      renderFor(di)(<BoundResourceDetails binding={{ ...pod, clusterId: "c1" }} />);
      expect(subscribeStores).toHaveBeenCalledWith([expect.anything()], { namespaces: ["h7-synthetic"] });
    });

    it("never renders or subscribes a resource of another cluster", () => {
      const { di, subscribeStores } = setup("c2");
      const result = renderFor(di)(<BoundResourceDetails binding={{ ...pod, clusterId: "c1" }} />);

      expect(result.getByTestId("bound-details-unavailable").textContent).toContain("another cluster");
      expect(subscribeStores).not.toHaveBeenCalled();
    });

    it("renders the bound view through the resolver inside the host", () => {
      const { di } = setup("c1");
      const result = renderFor(di)(
        <RouteViewsContext.Provider value={true}>
          <PanelContentResolver panelKind="resource-details" leafId="l1" resourceBinding={{ ...pod, clusterId: "c1" }} />
        </RouteViewsContext.Provider>,
      );

      expect(result.queryByTestId("kubetail-details")).toBeNull();
      expect(result.getByTestId("bound-details-unavailable").dataset.name).toBe("h7-pod-0");
    });
  });
});
