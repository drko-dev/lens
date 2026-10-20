/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { fireEvent } from "@testing-library/react";
import type { Pod } from "@openlens/kube-object";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import createPodTerminalTabInjectable from "../dock/terminal/create-pod-terminal-tab.injectable";
import createPodLogsTabInjectable from "../dock/logs/create-pod-logs-tab.injectable";
import portForwardDialogModelInjectable from "../../port-forward/port-forward-dialog-model/port-forward-dialog-model.injectable";
import showCheckedErrorNotificationInjectable from "../notifications/show-checked-error.injectable";
import { PodDevOpsMenu } from "./pod-devops-menu";
import { MenuContext } from "../menu/menu";

const container = { name: "app", image: "busybox", ports: [{ containerPort: 8080 }] };
const secondContainer = { name: "sidecar", image: "envoy" };
const pod = {
  getContainers: () => [container],
  getRunningContainers: () => [container],
  getContainerStatuses: () => [{ name: "app", state: { running: {}}, ready: true }],
  getNs: () => "openlens-editor-lab",
  getName: () => "app-123",
} as unknown as Pod;

const multiContainerPod = {
  getContainers: () => [container, secondContainer],
  getRunningContainers: () => [container, secondContainer],
  getContainerStatuses: () => [
    { name: "app", state: { running: {}}, ready: true },
    { name: "sidecar", state: { running: {}}, ready: true },
  ],
  getNs: () => "openlens-editor-lab",
  getName: () => "multi-123",
} as unknown as Pod;

describe("PodDevOpsMenu", () => {
  const createPodTerminalTab = jest.fn().mockReturnValue("terminal-id");
  const createPodLogsTab = jest.fn().mockReturnValue("logs-id");
  const portForwardOpen = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupDi = () => {
    const di = getDiForUnitTesting();

    di.override(createPodTerminalTabInjectable, () => createPodTerminalTab);
    di.override(createPodLogsTabInjectable, () => createPodLogsTab);
    di.override(portForwardDialogModelInjectable, () => ({
      open: portForwardOpen,
      close: jest.fn(),
      data: { get: () => undefined, set: jest.fn() },
    }) as any);
    di.override(showCheckedErrorNotificationInjectable, () => jest.fn());

    return di;
  };

  it("opens a dedicated container terminal in the bottom dock", () => {
    const di = setupDi();
    const { getAllByText } = renderFor(di)(
      <MenuContext.Provider value={{ props: { open: jest.fn(), close: jest.fn(), closeOnClickItem: false }, close: jest.fn() }}>
        <PodDevOpsMenu object={pod} />
      </MenuContext.Provider>,
    );

    fireEvent.click(getAllByText("Terminal")[0]);
    expect(createPodTerminalTab).toHaveBeenCalledWith({
      selectedPod: pod,
      selectedContainer: container,
    });
  });

  it("opens logs for exactly the selected container", () => {
    const di = setupDi();
    const { getAllByText } = renderFor(di)(
      <MenuContext.Provider value={{ props: { open: jest.fn(), close: jest.fn(), closeOnClickItem: false }, close: jest.fn() }}>
        <PodDevOpsMenu object={pod} />
      </MenuContext.Provider>,
    );

    fireEvent.click(getAllByText("Logs")[0]);
    expect(createPodLogsTab).toHaveBeenCalledWith({
      selectedPod: pod,
      selectedContainer: container,
    });
  });

  it("opens the port forward dialog for the pod", () => {
    const di = setupDi();
    const { getAllByText } = renderFor(di)(
      <MenuContext.Provider value={{ props: { open: jest.fn(), close: jest.fn(), closeOnClickItem: false }, close: jest.fn() }}>
        <PodDevOpsMenu object={pod} />
      </MenuContext.Provider>,
    );

    fireEvent.click(getAllByText("Port Forward")[0]);
    expect(portForwardOpen).toHaveBeenCalledWith({
      kind: "pod",
      name: "app-123",
      namespace: "openlens-editor-lab",
      port: 8080,
      forwardPort: 0,
    });
  });

  it("renders distinct actions for each container in a multi-container pod", () => {
    const di = setupDi();
    const { getAllByText } = renderFor(di)(
      <MenuContext.Provider value={{ props: { open: jest.fn(), close: jest.fn(), closeOnClickItem: false }, close: jest.fn() }}>
        <PodDevOpsMenu object={multiContainerPod} />
      </MenuContext.Provider>,
    );

    // Logs and Terminal are single top-level menu items
    expect(getAllByText("Logs")[0]).toBeInTheDocument();
    expect(getAllByText("Terminal")[0]).toBeInTheDocument();

    // Underneath, container names are rendered for each menu
    expect(getAllByText("app").length).toBe(2);
    expect(getAllByText("sidecar").length).toBe(2);

    // Clicking sidecar in the Terminal submenu opens the sidecar terminal
    const sidecarItems = getAllByText("sidecar");

    fireEvent.click(sidecarItems[0]); // first container submenu is Terminal
    expect(createPodTerminalTab).toHaveBeenCalledWith({
      selectedPod: multiContainerPod,
      selectedContainer: secondContainer,
    });
  });
});
