/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { runInAction } from "mobx";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { renderFor } from "../../../../renderer/components/test-utils/renderFor";
import { CompactPanelControlsContext, DynamicLayoutRenderer, PanelDetachContext } from "../../../../renderer/components/split-panel/dynamic-layout-renderer";
import { SplitPanelStore } from "../../../../renderer/components/split-panel/split-panel-store";
import { createBranchNode, createLeafNode } from "../../../../renderer/components/split-panel/panel-catalog";
import { createGlobalPanelStore, globalDockingWorkspaceId } from "../global-panel-store";

// The real Pods/Deployments list views need a live cluster frame; a marker shows when the docked view is mounted.
jest.mock("../../../../renderer/components/split-panel/panel-content-resolver", () => ({
  ...jest.requireActual("../../../../renderer/components/split-panel/panel-content-resolver"),
  PanelContentResolver: ({ leafId }: { leafId: string }) => <div data-testid={`docked-view-${leafId}`} />,
}));

type Invoke = jest.Mock<Promise<unknown>, any[]>;

const setup = (invoke: Invoke) => {
  let notify: (notice: unknown) => void = () => {};
  const store = createGlobalPanelStore("c1", {
    invoke,
    onRedocked: (callback) => {
      notify = callback;

      return () => {};
    },
  });
  const [pods, deployments] = store.allActiveLeaves;

  return { store, pods, deployments, redocked: (notice: unknown) => act(() => notify(notice)) };
};

describe("global docking detached panels (H7.5)", () => {
  describe("store", () => {
    it("asks Main for a read-only list window keyed by cluster, global-docking workspace and panel kind", async () => {
      const invoke: Invoke = jest.fn(async () => ({ windowId: 7, reused: false }));
      const { store, pods } = setup(invoke);

      await expect(store.detachPanel(pods.id, { namespace: "shop" })).resolves.toBe(true);

      expect(invoke).toHaveBeenCalledWith("detached-tool:request-detach", {
        clusterId: "c1",
        workspaceId: globalDockingWorkspaceId,
        tabId: "pods",
        toolKind: "resource-list",
        list: { kind: "Pod", namespace: "shop" },
      });
      expect(store.isPanelDetached(pods.id)).toBe(true);
      expect(store.getDetachedState(pods.id)).toMatchObject({ clusterId: "c1", panelId: pods.id, panelKind: "pods", windowId: 7 });
    });

    it("lists every namespace for deployments when none is given", async () => {
      const invoke: Invoke = jest.fn(async () => ({ windowId: 8, reused: false }));
      const { store, deployments } = setup(invoke);

      await store.detachPanel(deployments.id);

      expect(invoke.mock.calls[0][1]).toMatchObject({ tabId: "deployments", list: { kind: "Deployment" }});
      expect(invoke.mock.calls[0][1].list).not.toHaveProperty("namespace");
    });

    it("keeps the panel docked when Main refuses the window", async () => {
      const invoke: Invoke = jest.fn(async () => { throw new Error("Detached window limit reached."); });
      const { store, pods } = setup(invoke);

      await expect(store.detachPanel(pods.id)).rejects.toThrow("limit");

      expect(store.isPanelDetached(pods.id)).toBe(false);
      expect(store.allActiveLeaves.map((l) => l.panelKind)).toEqual(["pods", "deployments"]);
    });

    it("redocks when Main reports that the window closed, and ignores notices for other clusters or kinds", async () => {
      const invoke: Invoke = jest.fn(async () => ({ windowId: 7, reused: false }));
      const { store, pods, redocked } = setup(invoke);

      await store.detachPanel(pods.id);
      redocked({ clusterId: "c2", workspaceId: globalDockingWorkspaceId, tabId: "pods", toolKind: "resource-list" });
      redocked({ clusterId: "c1", workspaceId: globalDockingWorkspaceId, tabId: "pods", toolKind: "logs" });
      expect(store.isPanelDetached(pods.id)).toBe(true);

      redocked({ clusterId: "c1", workspaceId: globalDockingWorkspaceId, tabId: "pods", toolKind: "resource-list" });

      expect(store.isPanelDetached(pods.id)).toBe(false);
      expect(store.allActiveLeaves[0].id).toBe(pods.id);
    });

    it("asking again for a detached panel's window goes back to Main, which focuses (and restores) it", async () => {
      const invoke: Invoke = jest.fn(async () => ({ windowId: 7, reused: invoke.mock.calls.length > 1 }));
      const { store, pods } = setup(invoke);

      await store.detachPanel(pods.id, { namespace: "shop" });
      await expect(store.detachPanel(pods.id, { namespace: "shop" })).resolves.toBe(true);

      expect(invoke).toHaveBeenCalledTimes(2);
      expect(invoke.mock.calls[1]).toEqual(invoke.mock.calls[0]);
      expect(store.getDetachedState(pods.id)?.windowId).toBe(7);
    });

    it("an explicit redock asks Main to close the window of that panel", async () => {
      const invoke: Invoke = jest.fn(async () => ({ windowId: 7, reused: false }));
      const { store, pods } = setup(invoke);

      await store.detachPanel(pods.id);
      await store.redockPanel(pods.id);

      expect(invoke).toHaveBeenLastCalledWith("detached-tool:frame-request-redock", {
        clusterId: "c1", workspaceId: globalDockingWorkspaceId, tabId: "pods", toolKind: "resource-list",
      });
      expect(store.isPanelDetached(pods.id)).toBe(false);
    });
  });

  describe("renderer", () => {
    const render = (store: SplitPanelStore, canDetach = true) => renderFor(getDiForUnitTesting())(
      <CompactPanelControlsContext.Provider value={true}>
        <PanelDetachContext.Provider value={canDetach ? { canDetach: () => true, getNamespace: () => "shop" } : undefined}>
          <DynamicLayoutRenderer node={store.rootNode} splitPanelStore={store} />
        </PanelDetachContext.Provider>
      </CompactPanelControlsContext.Provider>,
    );
    const unknownStore = (invoke: Invoke) => {
      const store = new SplitPanelStore({ initialClusterId: "c1", getLocalStorageItem: () => null, setLocalStorageItem: () => {}, invoke, onRedocked: () => () => {} });

      runInAction(() => { store.rootNode = createBranchNode("horizontal", 0.5, createLeafNode("pods"), createLeafNode("deployments")); });

      return store;
    };

    it("offers an accessible detach control only when detaching is available", () => {
      const store = unknownStore(jest.fn());
      const [pods] = store.allActiveLeaves;

      expect(render(store).getByTestId(`panel-detach-button-${pods.id}`).getAttribute("aria-label")).toBe("Open Pods Overview panel in a separate window");
      expect(render(store, false).container.querySelector(`[data-testid="panel-detach-button-${pods.id}"]`)).toBeNull();
    });

    it("unmounts the docked view while detached and shows how to get it back", async () => {
      const invoke: Invoke = jest.fn(async () => ({ windowId: 7, reused: false }));
      const store = unknownStore(invoke);
      const [pods] = store.allActiveLeaves;
      const result = render(store);

      expect(result.getByTestId(`docked-view-${pods.id}`)).toBeTruthy();
      fireEvent.click(result.getByTestId(`panel-detach-button-${pods.id}`));
      await waitFor(() => expect(result.getByTestId(`panel-detached-placeholder-${pods.id}`)).toBeTruthy());

      expect(invoke.mock.calls[0][1]).toMatchObject({ list: { kind: "Pod", namespace: "shop" }});
      expect(result.queryByTestId(`docked-view-${pods.id}`)).toBeNull();
      expect(result.queryByTestId(`panel-detach-button-${pods.id}`)).toBeNull();

      fireEvent.click(result.getByTestId(`panel-redock-button-${pods.id}`));
      await waitFor(() => expect(result.queryByTestId(`panel-detached-placeholder-${pods.id}`)).toBeNull());
      expect(result.getByTestId(`docked-view-${pods.id}`)).toBeTruthy();
    });

    it("keeps the panel and shows the error when the window cannot be opened", async () => {
      const invoke: Invoke = jest.fn(async () => { throw new Error("Detached window limit reached."); });
      const store = unknownStore(invoke);
      const [pods] = store.allActiveLeaves;
      const result = render(store);

      fireEvent.click(result.getByTestId(`panel-detach-button-${pods.id}`));

      await waitFor(() => expect(result.getByTestId(`panel-detach-error-${pods.id}`).textContent).toContain("could not be opened"));
      expect(result.queryByTestId(`panel-detached-placeholder-${pods.id}`)).toBeNull();
      expect(store.isPanelDetached(pods.id)).toBe(false);
      expect(result.getByTestId(`docked-view-${pods.id}`)).toBeTruthy();
    });
  });
});
