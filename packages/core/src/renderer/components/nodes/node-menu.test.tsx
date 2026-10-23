/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import { computed } from "mobx";
import type { Node } from "@openlens/kube-object";
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import nodeApiInjectable from "../../../common/k8s-api/endpoints/node.api.injectable";
import openDrainNodeDialogInjectable from "./drain-dialog/open.injectable";
import createNodeTerminalTabInjectable from "../dock/terminal/create-node-terminal-tab.injectable";
import openConfirmDialogInjectable from "../confirm-dialog/open.injectable";
import isProductionClusterInjectable from "../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../cluster-frame-context/hosted-cluster.injectable";
import showCheckedErrorNotificationInjectable from "../notifications/show-checked-error.injectable";
import showSuccessNotificationInjectable from "../notifications/show-success-notification.injectable";
import authorizeNodeShellInjectable from "./authorize-node-shell.injectable";
import { NodeMenu } from "./node-menu";
import { MenuContext } from "../menu/menu";

describe("NodeMenu", () => {
  let di: DiContainer;
  let mockNodeApi: { cordon: jest.Mock; uncordon: jest.Mock };
  let mockOpenDrainDialog: jest.Mock;
  let mockCreateNodeTerminalTab: jest.Mock;
  let mockOpenConfirmDialog: jest.Mock;
  let mockShowSuccess: jest.Mock;
  let mockShowCheckedErrorNotification: jest.Mock;
  let mockAuthorizeNodeShell: jest.Mock;
  let isProdValue: boolean;
  let nodeShellEnabledValue: boolean;
  let hostedClusterRef: { id: string; preferences: { nodeShellEnabled: boolean }};

  const createMockNode = (name: string, unschedulable = false) =>
    ({
      kind: "Node",
      apiVersion: "v1",
      getName: () => name,
      isUnschedulable: () => unschedulable,
    } as unknown as Node);

  beforeEach(() => {
    isProdValue = false;
    nodeShellEnabledValue = false;
    mockNodeApi = {
      cordon: jest.fn().mockResolvedValue({}),
      uncordon: jest.fn().mockResolvedValue({}),
    };
    mockOpenDrainDialog = jest.fn();
    mockCreateNodeTerminalTab = jest.fn().mockReturnValue("tab-123");
    mockOpenConfirmDialog = jest.fn();
    mockShowSuccess = jest.fn();
    mockShowCheckedErrorNotification = jest.fn();
    mockAuthorizeNodeShell = jest.fn().mockResolvedValue({ granted: true, tabId: "main-issued-tab" });

    hostedClusterRef = {
      id: "test-cluster",
      preferences: {
        nodeShellEnabled: nodeShellEnabledValue,
      },
    };

    di = getDiForUnitTesting();

    di.override(nodeApiInjectable, () => mockNodeApi as any);
    di.override(openDrainNodeDialogInjectable, () => mockOpenDrainDialog);
    di.override(createNodeTerminalTabInjectable, () => mockCreateNodeTerminalTab);
    di.override(openConfirmDialogInjectable, () => mockOpenConfirmDialog);
    di.override(isProductionClusterInjectable, () => computed(() => isProdValue));
    di.override(hostedClusterInjectable, () => hostedClusterRef as any);
    di.override(showCheckedErrorNotificationInjectable, () => mockShowCheckedErrorNotification);
    di.override(showSuccessNotificationInjectable, () => mockShowSuccess);
    di.override(authorizeNodeShellInjectable, () => mockAuthorizeNodeShell);
  });

  const renderComponent = (node: Node) => {
    return renderFor(di)(
      <MenuContext.Provider
        value={{
          props: { open: jest.fn(), close: jest.fn(), closeOnClickItem: false },
          close: jest.fn(),
        }}
      >
        <NodeMenu object={node} />
      </MenuContext.Provider>,
    );
  };

  it("renders Cordon action for schedulable node and opens confirmation dialog", async () => {
    const node = createMockNode("worker-node-1", false);
    const { getByTestId, queryByTestId } = renderComponent(node);

    expect(getByTestId("menu-action-cordon-node")).toBeInTheDocument();
    expect(queryByTestId("menu-action-uncordon-node")).toBeNull();

    fireEvent.click(getByTestId("menu-action-cordon-node"));
    expect(mockOpenConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        labelOk: "Cordon Node",
      }),
    );

    const okCallback = mockOpenConfirmDialog.mock.calls[0][0].ok;

    await okCallback();
    expect(mockNodeApi.cordon).toHaveBeenCalledWith({ name: "worker-node-1" });
    expect(mockShowSuccess).toHaveBeenCalledWith(
      expect.stringContaining("cordoned"),
    );
  });

  it("renders Uncordon action in non-prod and executes directly without modal barrier", async () => {
    isProdValue = false;
    const node = createMockNode("worker-node-2", true);
    const { getByTestId, queryByTestId } = renderComponent(node);

    expect(getByTestId("menu-action-uncordon-node")).toBeInTheDocument();
    expect(queryByTestId("menu-action-cordon-node")).toBeNull();

    fireEvent.click(getByTestId("menu-action-uncordon-node"));

    await waitFor(() => {
      expect(mockOpenConfirmDialog).not.toHaveBeenCalled();
      expect(mockNodeApi.uncordon).toHaveBeenCalledWith({ name: "worker-node-2" });
      expect(mockShowSuccess).toHaveBeenCalledWith(
        expect.stringContaining("uncordoned"),
      );
    });
  });

  it("enforces confirmation dialog before uncordoning a node in PROD", async () => {
    isProdValue = true;
    const node = createMockNode("worker-node-prod-2", true);
    const { getByTestId } = renderComponent(node);

    fireEvent.click(getByTestId("menu-action-uncordon-node"));

    expect(mockOpenConfirmDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        labelOk: "Uncordon Node",
      }),
    );
    expect(mockNodeApi.uncordon).not.toHaveBeenCalled();

    const okCallback = mockOpenConfirmDialog.mock.calls[0][0].ok;

    await okCallback();
    expect(mockNodeApi.uncordon).toHaveBeenCalledWith({ name: "worker-node-prod-2" });
    expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining("uncordoned"));
  });

  it("handles RBAC 403 Forbidden cleanly when cordoning", async () => {
    const node = createMockNode("worker-node-1", false);

    mockNodeApi.cordon.mockRejectedValueOnce({ statusCode: 403, message: "Forbidden" });

    const { getByTestId } = renderComponent(node);

    fireEvent.click(getByTestId("menu-action-cordon-node"));
    const okCallback = mockOpenConfirmDialog.mock.calls[0][0].ok;

    await okCallback();
    expect(mockShowCheckedErrorNotification).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
      expect.stringContaining("Permission denied (RBAC 403 Forbidden)"),
    );
  });

  it("handles 409 Conflict cleanly when uncordoning", async () => {
    const node = createMockNode("worker-node-2", true);

    mockNodeApi.uncordon.mockRejectedValueOnce({ statusCode: 409, message: "Conflict" });

    const { getByTestId } = renderComponent(node);

    fireEvent.click(getByTestId("menu-action-uncordon-node"));

    await waitFor(() => {
      expect(mockShowCheckedErrorNotification).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 409 }),
        expect.stringContaining("Conflict (409)"),
      );
    });
  });

  it("aborts cordon if cluster context changed between trigger and confirmation", async () => {
    const node = createMockNode("worker-node-1", false);
    const { getByTestId } = renderComponent(node);

    fireEvent.click(getByTestId("menu-action-cordon-node"));
    const okCallback = mockOpenConfirmDialog.mock.calls[0][0].ok;

    // Simulate switching cluster context
    hostedClusterRef.id = "different-cluster-id";

    await okCallback();
    expect(mockNodeApi.cordon).not.toHaveBeenCalled();
    expect(mockShowCheckedErrorNotification).toHaveBeenCalledWith(
      "Cluster context changed",
      "Cordon cancelled for safety",
    );
  });

  it("opens Drain dialog when Drain menu item is clicked", () => {
    const node = createMockNode("worker-node-1", false);
    const { getByTestId } = renderComponent(node);

    fireEvent.click(getByTestId("menu-action-drain-node"));
    expect(mockOpenDrainDialog).toHaveBeenCalledWith(node);
  });

  it("disables Node Shell by default when nodeShellEnabled is false", () => {
    hostedClusterRef.preferences.nodeShellEnabled = false;
    const node = createMockNode("worker-node-1", false);
    const { getByTestId } = renderComponent(node);

    const nodeShellItem = getByTestId("menu-action-node-shell");

    expect(nodeShellItem).toHaveClass("disabled");

    fireEvent.click(nodeShellItem);
    expect(mockCreateNodeTerminalTab).not.toHaveBeenCalled();
  });

  it("enables Node Shell when nodeShellEnabled is true in non-prod and launches terminal", () => {
    hostedClusterRef.preferences.nodeShellEnabled = true;
    isProdValue = false;
    const node = createMockNode("worker-node-1", false);
    const { getByTestId } = renderComponent(node);

    const nodeShellItem = getByTestId("menu-action-node-shell");

    expect(nodeShellItem).not.toHaveClass("disabled");

    fireEvent.click(nodeShellItem);
    expect(mockCreateNodeTerminalTab).toHaveBeenCalledWith({ nodeName: "worker-node-1" });
    expect(mockAuthorizeNodeShell).not.toHaveBeenCalled();
  });

  it("requests authorization from Main and creates the tab with the main-issued tab id in PROD", async () => {
    hostedClusterRef.preferences.nodeShellEnabled = true;
    isProdValue = true;
    const node = createMockNode("worker-node-prod", false);
    const { getByTestId } = renderComponent(node);

    const nodeShellItem = getByTestId("menu-action-node-shell");

    mockAuthorizeNodeShell.mockResolvedValueOnce({ granted: true, tabId: "main-issued-tab" });

    fireEvent.click(nodeShellItem);

    await waitFor(() => {
      expect(mockAuthorizeNodeShell).toHaveBeenCalledWith({
        clusterId: "test-cluster",
        nodeName: "worker-node-prod",
      });
      expect(mockCreateNodeTerminalTab).toHaveBeenCalledWith({
        nodeName: "worker-node-prod",
        tabId: "main-issued-tab",
      });
    });
  });

  it("does not create a terminal tab if Main denies authorization in PROD", async () => {
    hostedClusterRef.preferences.nodeShellEnabled = true;
    isProdValue = true;
    const node = createMockNode("worker-node-prod", false);
    const { getByTestId } = renderComponent(node);

    const nodeShellItem = getByTestId("menu-action-node-shell");

    mockAuthorizeNodeShell.mockResolvedValueOnce({ granted: false, reason: "unauthorized-sender" });

    fireEvent.click(nodeShellItem);

    await waitFor(() => {
      expect(mockAuthorizeNodeShell).toHaveBeenCalledTimes(1);
      expect(mockCreateNodeTerminalTab).not.toHaveBeenCalled();
      expect(mockShowCheckedErrorNotification).toHaveBeenCalled();
    });
  });

  it("stays silent when the operator simply cancels the main-process confirmation", async () => {
    hostedClusterRef.preferences.nodeShellEnabled = true;
    isProdValue = true;
    const node = createMockNode("worker-node-prod", false);
    const { getByTestId } = renderComponent(node);

    mockAuthorizeNodeShell.mockResolvedValueOnce({ granted: false, reason: "confirmation-denied" });

    fireEvent.click(getByTestId("menu-action-node-shell"));

    await waitFor(() => {
      expect(mockAuthorizeNodeShell).toHaveBeenCalledTimes(1);
      expect(mockCreateNodeTerminalTab).not.toHaveBeenCalled();
      expect(mockShowCheckedErrorNotification).not.toHaveBeenCalled();
    });
  });

  it("never creates a tab from a renderer-chosen id: a granted response without a main-issued tab id is rejected", async () => {
    hostedClusterRef.preferences.nodeShellEnabled = true;
    isProdValue = true;
    const node = createMockNode("worker-node-prod", false);
    const { getByTestId } = renderComponent(node);

    mockAuthorizeNodeShell.mockResolvedValueOnce({ granted: true });

    fireEvent.click(getByTestId("menu-action-node-shell"));

    await waitFor(() => {
      expect(mockAuthorizeNodeShell).toHaveBeenCalledTimes(1);
      expect(mockCreateNodeTerminalTab).not.toHaveBeenCalled();
    });
  });

  it("aborts Node Shell creation if the cluster context changed while Main was confirming", async () => {
    hostedClusterRef.preferences.nodeShellEnabled = true;
    isProdValue = true;
    const node = createMockNode("worker-node-prod", false);
    const { getByTestId } = renderComponent(node);

    mockAuthorizeNodeShell.mockImplementationOnce(async () => {
      hostedClusterRef.id = "other-cluster";

      return { granted: true, tabId: "main-issued-tab" };
    });

    fireEvent.click(getByTestId("menu-action-node-shell"));

    await waitFor(() => {
      expect(mockCreateNodeTerminalTab).not.toHaveBeenCalled();
      expect(mockShowCheckedErrorNotification).toHaveBeenCalled();
    });
  });
});
