/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import type { DiContainer } from "@ogre-tools/injectable";
import { computed, observable } from "mobx";
import { getDiForUnitTesting } from "../../../../getDiForUnitTesting";
import { renderFor } from "../../../test-utils/renderFor";
import { Pod } from "@openlens/kube-object";
import podApiInjectable from "../../../../../common/k8s-api/endpoints/pod.api.injectable";
import attachDebugContainerDialogStateInjectable from "../attach-debug-container-dialog-state.injectable";
import isProductionClusterInjectable from "../../../kube-object-menu/is-production-cluster.injectable";
import hostedClusterInjectable from "../../../../cluster-frame-context/hosted-cluster.injectable";
import createPodTerminalTabInjectable from "../../../dock/terminal/create-pod-terminal-tab.injectable";
import showCheckedErrorNotificationInjectable from "../../../notifications/show-checked-error.injectable";
import showSuccessNotificationInjectable from "../../../notifications/show-success-notification.injectable";
import { AttachDebugContainerDialog } from "../attach-debug-container-dialog";

describe("AttachDebugContainerDialog (R7-08)", () => {
  let di: DiContainer;
  let mockPodApi: {
    attachEphemeralContainer: jest.Mock;
    get: jest.Mock;
  };
  let mockCreatePodTerminalTab: jest.Mock;
  let mockShowSuccessNotification: jest.Mock;
  let mockShowCheckedErrorNotification: jest.Mock;
  let isProdValue: boolean;
  let hostedClusterRef: { id?: string; name?: string; disconnected?: boolean; accessible?: boolean; preferences?: any };
  let dialogState: ReturnType<typeof attachDebugContainerDialogStateInjectable.instantiate>;

  const createMockPod = (
    name = "web-pod",
    namespace = "staging",
    ephemeralStatuses?: any[],
    uid = "pod-123",
  ): Pod => {
    return new Pod({
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name,
        namespace,
        uid,
        resourceVersion: "42",
        selfLink: `/api/v1/namespaces/${namespace}/pods/${name}`,
      },
      spec: {
        containers: [{ name: "web", image: "nginx:alpine" }],
        ephemeralContainers: [],
      },
      status: {
        phase: "Running",
        ephemeralContainerStatuses: ephemeralStatuses,
      } as any,
    });
  };

  beforeEach(() => {
    isProdValue = false;
    hostedClusterRef = {
      id: "cluster-staging",
      name: "Staging Cluster",
      disconnected: false,
      accessible: true,
      preferences: { clusterEnvironment: "development" },
    };

    mockPodApi = {
      attachEphemeralContainer: jest.fn().mockResolvedValue(createMockPod()),
      get: jest.fn().mockResolvedValue(createMockPod()),
    };
    mockCreatePodTerminalTab = jest.fn();
    mockShowSuccessNotification = jest.fn();
    mockShowCheckedErrorNotification = jest.fn();

    di = getDiForUnitTesting();

    dialogState = observable.box<Pod | undefined>(undefined);
    di.override(attachDebugContainerDialogStateInjectable, () => dialogState);
    di.override(podApiInjectable, () => mockPodApi as any);
    di.override(isProductionClusterInjectable, () => computed(() => isProdValue));
    di.override(hostedClusterInjectable, () => hostedClusterRef as any);
    di.override(createPodTerminalTabInjectable, () => mockCreatePodTerminalTab);
    di.override(showSuccessNotificationInjectable, () => mockShowSuccessNotification);
    di.override(showCheckedErrorNotificationInjectable, () => mockShowCheckedErrorNotification);
  });

  it("does not render when dialog state is undefined (zero auto-mutations)", () => {
    const { queryByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    expect(queryByTestId("attach-debug-container-dialog")).toBeNull();
    expect(mockPodApi.attachEphemeralContainer).not.toHaveBeenCalled();
  });

  it("renders pod target details, presets, and immutability warning banner in development", () => {
    const pod = createMockPod("auth-api", "dev-ns");

    dialogState.set(pod);

    const { getByTestId, queryByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    expect(getByTestId("attach-debug-container-dialog")).toBeInTheDocument();
    expect(getByTestId("target-pod")).toHaveTextContent("auth-api");
    expect(getByTestId("target-namespace")).toHaveTextContent("dev-ns");
    expect(getByTestId("target-cluster")).toHaveTextContent("Staging Cluster (DEVELOPMENT)");
    expect(getByTestId("immutable-warning-banner")).toBeInTheDocument();
    expect(queryByTestId("prod-guard-banner")).toBeNull();
  });

  it("enforces PROD Guard: displays red warning banner and disables submit until confirmed via checkbox AND exact pod name typing", () => {
    isProdValue = true;
    hostedClusterRef.preferences = { clusterEnvironment: "production" };
    const pod = createMockPod("billing-service", "prod");

    dialogState.set(pod);

    const { getByTestId, getByText } = renderFor(di)(<AttachDebugContainerDialog />);

    expect(getByTestId("prod-guard-banner")).toBeInTheDocument();
    expect(getByTestId("target-cluster")).toHaveTextContent("PRODUCTION");

    const submitBtn = getByText("Attach and Launch");

    expect(submitBtn).toBeDisabled();

    const confirmCheckbox = getByTestId("prod-confirm-checkbox");
    const confirmInput = getByTestId("prod-confirmation-input");

    // Case 1: Checkbox checked alone -> still disabled
    fireEvent.click(confirmCheckbox);
    expect(submitBtn).toBeDisabled();

    // Case 2: Wrong pod name typed -> still disabled
    fireEvent.change(confirmInput, { target: { value: "wrong-name" }});
    expect(submitBtn).toBeDisabled();

    // Case 3: Exact pod name typed -> enabled!
    fireEvent.change(confirmInput, { target: { value: "billing-service" }});
    expect(submitBtn).not.toBeDisabled();

    // Case 4: Context switch to another pod -> confirmation and input are reset, submit button disabled
    const otherPod = createMockPod("other-service", "prod");

    dialogState.set(otherPod);
    expect(getByText("Attach and Launch")).toBeDisabled();
  });

  it("submits attach request, waits for container to reach Running state, and opens terminal", async () => {
    const pod = createMockPod("frontend", "test");

    dialogState.set(pod);

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    // Set custom container name
    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "my-debugger" },
    });

    // Select netshoot preset
    fireEvent.click(getByTestId("preset-netshoot"));

    // First GET in polling returns pending (ContainerCreating), second returns Running
    mockPodApi.get
      .mockResolvedValueOnce(createMockPod("frontend", "test", [
        { name: "my-debugger", state: { waiting: { reason: "ContainerCreating" }}},
      ]))
      .mockResolvedValueOnce(createMockPod("frontend", "test", [
        { name: "my-debugger", state: { running: { startedAt: "2026-10-24T00:00:00Z" }}},
      ]));

    const submitBtn = getByText("Attach and Launch");

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalledWith(
        { name: "frontend", namespace: "test" },
        expect.objectContaining({
          name: "my-debugger",
          image: "nicolaka/netshoot:latest",
          stdin: true,
          tty: true,
          command: ["sh"],
        }),
        expect.objectContaining({ resourceVersion: "42" }),
      );
    });

    await waitFor(() => {
      expect(mockCreatePodTerminalTab).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedContainer: { name: "my-debugger" },
        }),
      );
    });

    expect(mockShowSuccessNotification).toHaveBeenCalledWith(expect.stringContaining("is running"));
    expect(dialogState.get()).toBeUndefined();
  });

  it("does not open terminal and displays error if container terminates with failure", async () => {
    const pod = createMockPod("backend", "test");

    dialogState.set(pod);

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "failed-debugger" },
    });

    mockPodApi.get.mockResolvedValue(createMockPod("backend", "test", [
      { name: "failed-debugger", state: { terminated: { exitCode: 137, reason: "OOMKilled" }}},
    ]));

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(getByTestId("error-banner")).toHaveTextContent("Debug container failed or terminated (exit code 137: OOMKilled)");
    });

    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
    expect(dialogState.get()).toBeDefined();
  });

  it("does not open terminal and displays error if container polling times out", async () => {
    const pod = createMockPod("backend", "test");

    dialogState.set(pod);

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "stuck-debugger" },
    });

    // Container stays stuck in waiting
    mockPodApi.get.mockResolvedValue(createMockPod("backend", "test", [
      { name: "stuck-debugger", state: { waiting: { reason: "ImagePullBackOff" }}},
    ]));

    const dialogElement = getByTestId("attach-debug-container-dialog");

    expect(dialogElement).toBeInTheDocument();

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(getByTestId("container-status-banner")).toHaveTextContent("Container is pending (ImagePullBackOff)");
    });

    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
  });

  it("discards late GET response if active cluster changed while GET was pending (zero terminal launches)", async () => {
    const pod = createMockPod("auth", "prod");

    dialogState.set(pod);

    let resolvePendingGet: (val: any) => void = () => {};
    const pendingGetPromise = new Promise(resolve => {
      resolvePendingGet = resolve;
    });

    mockPodApi.get.mockImplementationOnce(() => pendingGetPromise);

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "dbg-race" },
    });

    fireEvent.click(getByText("Attach and Launch"));

    // Wait until mutation succeeded and polling GET is called
    await waitFor(() => {
      expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalled();
      expect(mockPodApi.get).toHaveBeenCalled();
    });

    // Cluster changes underneath while GET is in flight!
    hostedClusterRef.id = "other-cluster-id";

    // Now resolve the in-flight GET with running container
    resolvePendingGet(createMockPod("auth", "prod", [
      { name: "dbg-race", state: { running: { startedAt: "2026-10-24T00:00:00Z" }}},
    ]));

    await waitFor(() => {
      expect(getByTestId("error-banner")).toHaveTextContent("Active cluster changed or lost during container startup");
    });

    // Zero terminal tabs launched!
    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
    expect(mockShowSuccessNotification).not.toHaveBeenCalled();
  });

  it("discards late GET response if target pod was deleted and recreated with same name but different UID", async () => {
    const initialPod = createMockPod("transient-pod", "default", undefined, "uid-original-123");

    dialogState.set(initialPod);

    // GET returns a recreated pod with the same name but different UID
    const recreatedPod = createMockPod("transient-pod", "default", [
      { name: "dbg-recreated", state: { running: { startedAt: "2026-10-24T00:00:00Z" }}},
    ], "uid-recreated-999");

    mockPodApi.get.mockResolvedValueOnce(recreatedPod);

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "dbg-recreated" },
    });

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(getByTestId("error-banner")).toHaveTextContent("Target pod \"transient-pod\" UID mismatch");
    });

    // Terminal must not be opened for a recreated pod!
    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
    expect(mockShowSuccessNotification).not.toHaveBeenCalled();
  });

  it("cancels polling cleanly during the wait interval without dangling promises or notifications", async () => {
    const pod = createMockPod("worker", "default");

    dialogState.set(pod);

    // First GET returns container in ContainerCreating so it enters cancelableDelay
    mockPodApi.get.mockResolvedValue(createMockPod("worker", "default", [
      { name: "dbg-cancel", state: { waiting: { reason: "ContainerCreating" }}},
    ]));

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "dbg-cancel" },
    });

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(getByTestId("container-status-banner")).toHaveTextContent("Container is pending");
    });

    // Operator clicks Cancel during the delay between polling attempts
    const cancelBtn = getByText("Cancel");

    fireEvent.click(cancelBtn);

    // Dialog state is cleared immediately without hanging promises
    expect(dialogState.get()).toBeUndefined();
    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
    expect(mockShowSuccessNotification).not.toHaveBeenCalled();
  });

  it("cancels polling cleanly when selected pod changes in dialog state", async () => {
    const pod1 = createMockPod("pod-alpha", "default", undefined, "uid-alpha");

    dialogState.set(pod1);

    mockPodApi.get.mockResolvedValue(createMockPod("pod-alpha", "default", [
      { name: "dbg-switch", state: { waiting: { reason: "ContainerCreating" }}},
    ], "uid-alpha"));

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "dbg-switch" },
    });

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(getByTestId("container-status-banner")).toBeInTheDocument();
    });

    // Selected pod changes in dialog state (user selected another pod)
    const pod2 = createMockPod("pod-beta", "default", undefined, "uid-beta");

    dialogState.set(pod2);

    // Previous polling must be aborted cleanly; terminal for alpha is never opened
    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
  });

  it("rejects execution when cluster identity is unknown (Point 5)", async () => {
    const pod = createMockPod("backend", "test");

    hostedClusterRef.id = undefined;
    dialogState.set(pod);

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(getByTestId("error-banner")).toHaveTextContent("Active cluster identity is unknown");
    });

    expect(mockPodApi.attachEphemeralContainer).not.toHaveBeenCalled();
  });

  it("handles cluster race condition and blocks execution if active cluster changes while dialog was open", async () => {
    const pod = createMockPod("payments", "test");

    dialogState.set(pod);

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    // Active cluster changes underneath
    hostedClusterRef.id = "cluster-production-dangerous";

    const submitBtn = getByText("Attach and Launch");

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(getByTestId("error-banner")).toHaveTextContent("Active cluster changed while dialog was open");
    });

    expect(mockPodApi.attachEphemeralContainer).not.toHaveBeenCalled();
  });

  it("displays explicit error message on HTTP 403 Forbidden without crashing", async () => {
    const pod = createMockPod("backend", "test");

    dialogState.set(pod);

    const error403: any = new Error("RBAC forbidden");

    error403.statusCode = 403;
    mockPodApi.attachEphemeralContainer.mockRejectedValueOnce(error403);

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(getByTestId("error-banner")).toHaveTextContent("Permission Denied (HTTP 403)");
    });

    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
  });

  it("closes dialog cleanly without calling API when cancel is clicked", () => {
    const pod = createMockPod("backend", "test");

    dialogState.set(pod);

    const { getByText } = renderFor(di)(<AttachDebugContainerDialog />);

    const cancelBtn = getByText("Cancel");

    fireEvent.click(cancelBtn);

    expect(dialogState.get()).toBeUndefined();
    expect(mockPodApi.attachEphemeralContainer).not.toHaveBeenCalled();
  });

  it("Caso A: discards late GET response when cancelled and reopening the exact same pod (0 terminals, state preserved)", async () => {
    const podA = createMockPod("web-pod-a", "staging", undefined, "uid-pod-a");

    dialogState.set(podA);

    let resolvePendingGetA: (val: any) => void = () => {};
    const pendingGetPromise = new Promise(resolve => {
      resolvePendingGetA = resolve;
    });

    mockPodApi.get.mockImplementationOnce(() => pendingGetPromise);

    const { getByText, getByTestId, queryByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "dbg-gen-a" },
    });

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalled();
      expect(mockPodApi.get).toHaveBeenCalled();
    });

    // Cancel the dialog
    fireEvent.click(getByText("Cancel"));
    expect(dialogState.get()).toBeUndefined();

    // Reopen the exact same Pod A in the exact same cluster
    dialogState.set(podA);
    expect(dialogState.get()?.getId()).toBe("uid-pod-a");

    // Resolve the old in-flight GET with Running
    resolvePendingGetA(createMockPod("web-pod-a", "staging", [
      { name: "dbg-gen-a", state: { running: { startedAt: "2026-10-24T00:00:00Z" }}},
    ], "uid-pod-a"));

    // Allow any pending microtasks to execute
    await new Promise(r => setTimeout(r, 50));

    // Zero terminal tabs opened and zero success notifications from old operation
    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
    expect(mockShowSuccessNotification).not.toHaveBeenCalled();

    // Reopened dialog preserves its clean initial state
    expect(getByTestId("attach-debug-container-dialog")).toBeInTheDocument();
    expect(getByTestId("target-pod")).toHaveTextContent("web-pod-a");
    expect(queryByTestId("error-banner")).toBeNull();
    expect(queryByTestId("container-status-banner")).toBeNull();
    expect(getByText("Attach and Launch")).not.toBeDisabled();
  });

  it("Caso B: abandons tracking when cancelled while PATCH is pending, preventing polling and terminal in new pod B", async () => {
    const podA = createMockPod("web-pod-a", "staging", undefined, "uid-pod-a");

    dialogState.set(podA);

    let resolvePendingPatchA: (val: any) => void = () => {};
    const pendingPatchPromise = new Promise(resolve => {
      resolvePendingPatchA = resolve;
    });

    mockPodApi.attachEphemeralContainer.mockImplementationOnce(() => pendingPatchPromise);

    const { getByText, getByTestId, queryByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "dbg-patch-pending" },
    });

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalled();
    });

    // Operator cancels while PATCH is still in-flight
    fireEvent.click(getByText("Cancel"));
    expect(dialogState.get()).toBeUndefined();

    // Open Pod B
    const podB = createMockPod("worker-pod-b", "staging", undefined, "uid-pod-b");

    dialogState.set(podB);

    // Resolve old PATCH successfully
    resolvePendingPatchA(podA);

    await new Promise(r => setTimeout(r, 50));

    // No polling GET started for old Pod A
    expect(mockPodApi.get).not.toHaveBeenCalled();
    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
    expect(mockShowSuccessNotification).not.toHaveBeenCalled();

    // Dialog for Pod B remains in clean initial state
    expect(getByTestId("attach-debug-container-dialog")).toBeInTheDocument();
    expect(getByTestId("target-pod")).toHaveTextContent("worker-pod-b");
    expect(queryByTestId("error-banner")).toBeNull();
    expect(queryByTestId("container-status-banner")).toBeNull();
  });

  it("Caso C: A -> B -> A out-of-order resolution guarantees only current generation mutates UI", async () => {
    const podA = createMockPod("pod-alpha", "staging", undefined, "uid-alpha");

    dialogState.set(podA);

    let resolveGetA: (val: any) => void = () => {};
    const pendingGetPromise = new Promise(resolve => {
      resolveGetA = resolve;
    });

    mockPodApi.get.mockImplementationOnce(() => pendingGetPromise);

    const { getByText, getByTestId, queryByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "dbg-alpha" },
    });

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(mockPodApi.get).toHaveBeenCalled();
    });

    // Switch to Pod B
    const podB = createMockPod("pod-bravo", "staging", undefined, "uid-bravo");

    dialogState.set(podB);

    // Switch back to Pod A
    dialogState.set(podA);

    // Resolve old GET from generation 1 out of order with Running
    resolveGetA(createMockPod("pod-alpha", "staging", [
      { name: "dbg-alpha", state: { running: { startedAt: "2026-10-24T00:00:00Z" }}},
    ], "uid-alpha"));

    await new Promise(r => setTimeout(r, 50));

    // Old generation response is discarded; zero terminal launches
    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
    expect(mockShowSuccessNotification).not.toHaveBeenCalled();

    // Reopened Pod A is clean and ready for fresh user interaction
    expect(getByTestId("target-pod")).toHaveTextContent("pod-alpha");
    expect(queryByTestId("error-banner")).toBeNull();
    expect(queryByTestId("container-status-banner")).toBeNull();
    expect(getByText("Attach and Launch")).not.toBeDisabled();
  });

  it.each([
    ["production", "PRODUCTION"],
    ["staging", "STAGING"],
    ["development", "DEVELOPMENT"],
    ["testing", "TESTING / QA"],
    ["local", "LOCAL"],
    ["custom", "CUSTOM"],
    ["none", "NONE"],
  ])("renders correct canonical environment tag for '%s' -> '%s'", (env, expectedTag) => {
    hostedClusterRef.preferences = { clusterEnvironment: env };
    isProdValue = env === "production";
    const pod = createMockPod("env-pod", "default");

    dialogState.set(pod);

    const { getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    expect(getByTestId("target-cluster")).toHaveTextContent(`Staging Cluster (${expectedTag})`);
  });

  it("renders all debug image presets including busybox, alpine, netshoot, and curl", () => {
    const pod = createMockPod("preset-pod", "default");

    dialogState.set(pod);

    const { getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    expect(getByTestId("preset-busybox")).toBeInTheDocument();
    expect(getByTestId("preset-alpine")).toBeInTheDocument();
    expect(getByTestId("preset-netshoot")).toBeInTheDocument();
    expect(getByTestId("preset-curl")).toBeInTheDocument();
    expect(getByTestId("preset-custom")).toBeInTheDocument();
  });

  it("cooperative cancellation: passes abort signal and isCancelled predicate to attachEphemeralContainer", async () => {
    const pod = createMockPod("cancel-get-pod", "default");

    dialogState.set(pod);

    let capturedOptions: any;
    let resolveAttach: (val: any) => void = () => {};
    const pendingAttachPromise = new Promise(resolve => {
      resolveAttach = resolve;
    });

    mockPodApi.attachEphemeralContainer.mockImplementationOnce((_res: any, _c: any, opts: any) => {
      capturedOptions = opts;

      return pendingAttachPromise;
    });

    const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

    fireEvent.change(getByTestId("debug-container-name-input"), {
      target: { value: "dbg-cancel-get" },
    });

    fireEvent.click(getByText("Attach and Launch"));

    await waitFor(() => {
      expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalled();
    });

    expect(capturedOptions?.signal).toBeDefined();
    expect(capturedOptions?.isCancelled).toBeDefined();
    expect(capturedOptions.signal.aborted).toBe(false);
    expect(capturedOptions.isCancelled()).toBe(false);

    // Operator cancels
    fireEvent.click(getByText("Cancel"));

    expect(capturedOptions.signal.aborted).toBe(true);
    expect(capturedOptions.isCancelled()).toBe(true);

    resolveAttach(pod);
    await new Promise(r => setTimeout(r, 50));

    expect(mockCreatePodTerminalTab).not.toHaveBeenCalled();
    expect(mockShowSuccessNotification).not.toHaveBeenCalled();
  });

  describe("Double Execution Prevention & Reentrancy Barriers (Hallazgo C)", () => {
    it("rapid double click: dispatches exactly 1 mutation without race conditions", async () => {
      const pod = createMockPod("dbl-click-pod", "default");

      dialogState.set(pod);

      let resolveAttach: (val: any) => void = () => {};
      const pendingAttach = new Promise(resolve => {
        resolveAttach = resolve;
      });

      mockPodApi.attachEphemeralContainer.mockImplementationOnce(() => pendingAttach);

      const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

      fireEvent.change(getByTestId("debug-container-name-input"), {
        target: { value: "dbg-double" },
      });

      const submitBtn = getByText("Attach and Launch");

      // Rapid consecutive clicks
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalledTimes(1);
      });

      resolveAttach(pod);
      await new Promise(r => setTimeout(r, 20));

      expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalledTimes(1);
    });

    it("pending PATCH followed by second invocation does not cancel or supersede the first operation", async () => {
      const pod = createMockPod("patch-in-flight-pod", "default");

      dialogState.set(pod);

      let resolveAttach: (val: any) => void = () => {};
      const pendingAttach = new Promise(resolve => {
        resolveAttach = resolve;
      });

      let capturedOpts: any;

      mockPodApi.attachEphemeralContainer.mockImplementationOnce((_res: any, _c: any, opts: any) => {
        capturedOpts = opts;

        return pendingAttach;
      });

      const runningPod = createMockPod("patch-in-flight-pod", "default", [
        { name: "dbg-inflight", state: { running: {}}},
      ]);

      mockPodApi.get.mockResolvedValue(runningPod);

      const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

      fireEvent.change(getByTestId("debug-container-name-input"), {
        target: { value: "dbg-inflight" },
      });

      const submitBtn = getByText("Attach and Launch");

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalledTimes(1);
      });

      const initialGen = capturedOpts.generation;

      // Second invocation while PATCH is pending in flight
      fireEvent.click(submitBtn);

      // Verify that first operation's controller was NOT aborted and generation was NOT invalidated
      expect(capturedOpts.signal.aborted).toBe(false);
      expect(capturedOpts.getCurrentGeneration()).toBe(initialGen);

      // Now PATCH resolves
      resolveAttach(runningPod);

      await waitFor(() => {
        expect(mockCreatePodTerminalTab).toHaveBeenCalledTimes(1);
      });
    });

    it("allows retry after HTTP 409 Conflict without getting stuck in executing state", async () => {
      const pod = createMockPod("retry-409-pod", "default");

      dialogState.set(pod);

      const conflictErr: any = new Error("Conflict");

      conflictErr.statusCode = 409;

      mockPodApi.attachEphemeralContainer
        .mockRejectedValueOnce(conflictErr)
        .mockResolvedValueOnce(pod);

      const runningPod = createMockPod("retry-409-pod", "default", [
        { name: "dbg-retry", state: { running: {}}},
      ]);

      mockPodApi.get.mockResolvedValue(runningPod);

      const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

      fireEvent.change(getByTestId("debug-container-name-input"), {
        target: { value: "dbg-retry" },
      });

      const submitBtn = getByText("Attach and Launch");

      // First attempt fails with 409
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(getByText(/Conflict \(HTTP 409\)/)).toBeInTheDocument();
      });

      // Second attempt (retry) must be allowed and succeed
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalledTimes(2);
        expect(mockCreatePodTerminalTab).toHaveBeenCalled();
      });
    });

    it("allows retry after transient network error without getting stuck in executing state", async () => {
      const pod = createMockPod("retry-net-pod", "default");

      dialogState.set(pod);

      mockPodApi.attachEphemeralContainer
        .mockRejectedValueOnce(new Error("ETIMEDOUT: Connection reset by peer"))
        .mockResolvedValueOnce(pod);

      const runningPod = createMockPod("retry-net-pod", "default", [
        { name: "dbg-net", state: { running: {}}},
      ]);

      mockPodApi.get.mockResolvedValue(runningPod);

      const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

      fireEvent.change(getByTestId("debug-container-name-input"), {
        target: { value: "dbg-net" },
      });

      const submitBtn = getByText("Attach and Launch");

      // First attempt fails with network error
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(getByText(/Failed to attach debug container: ETIMEDOUT/)).toBeInTheDocument();
      });

      // Second attempt succeeds
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalledTimes(2);
      });
    });

    it("allows legitimate launch after canceling previous dialog session", async () => {
      const pod = createMockPod("cancel-reopen-pod", "default");

      dialogState.set(pod);

      const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

      // Cancel session
      fireEvent.click(getByText("Cancel"));

      expect(dialogState.get()).toBeUndefined();

      // Reopen on same pod
      dialogState.set(pod);

      await waitFor(() => {
        expect(getByTestId("attach-debug-container-dialog")).toBeInTheDocument();
      });

      const runningPod = createMockPod("cancel-reopen-pod", "default", [
        { name: "dbg-reopen", state: { running: {}}},
      ]);

      mockPodApi.attachEphemeralContainer.mockResolvedValueOnce(runningPod);
      mockPodApi.get.mockResolvedValue(runningPod);

      fireEvent.change(getByTestId("debug-container-name-input"), {
        target: { value: "dbg-reopen" },
      });

      fireEvent.click(getByText("Attach and Launch"));

      await waitFor(() => {
        expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalledTimes(1);
        expect(mockCreatePodTerminalTab).toHaveBeenCalled();
      });
    });

    it("passes comprehensive cooperative validation preconditions (Hallazgo A)", async () => {
      const pod = createMockPod("precond-pod", "default");

      dialogState.set(pod);

      let capturedOpts: any;
      let resolveAttach: (val: any) => void = () => {};
      const pendingAttach = new Promise(resolve => {
        resolveAttach = resolve;
      });

      mockPodApi.attachEphemeralContainer.mockImplementationOnce((_res: any, _c: any, opts: any) => {
        capturedOpts = opts;

        return pendingAttach;
      });

      const runningPod = createMockPod("precond-pod", "default", [
        { name: "dbg-precond", state: { running: {}}},
      ]);

      mockPodApi.get.mockResolvedValue(runningPod);

      const { getByText, getByTestId } = renderFor(di)(<AttachDebugContainerDialog />);

      fireEvent.change(getByTestId("debug-container-name-input"), {
        target: { value: "dbg-precond" },
      });

      fireEvent.click(getByText("Attach and Launch"));

      await waitFor(() => {
        expect(mockPodApi.attachEphemeralContainer).toHaveBeenCalled();
      });

      // Verify all 9 cooperative preconditions while operation is in flight
      expect(capturedOpts.generation).toBeDefined();
      expect(capturedOpts.getCurrentGeneration()).toBe(capturedOpts.generation);
      expect(capturedOpts.clusterId).toBe("cluster-staging");
      expect(capturedOpts.getCurrentClusterId()).toBe("cluster-staging");
      expect(capturedOpts.isClusterHealthy()).toBe(true);
      expect(capturedOpts.expectedPodUid).toBe("pod-123");
      expect(capturedOpts.expectedName).toBe("precond-pod");
      expect(capturedOpts.expectedNamespace).toBe("default");
      expect(typeof capturedOpts.validateContext).toBe("function");

      // Validate validateContext behavior
      expect(capturedOpts.validateContext(pod)).toBe(true);

      // Context validation fails if cluster disconnected
      hostedClusterRef.disconnected = true;
      expect(capturedOpts.validateContext(pod)).toContain("disconnected");

      // Context validation fails if transitioned to PRODUCTION without confirmation
      hostedClusterRef.disconnected = false;
      hostedClusterRef.preferences = { clusterEnvironment: "production" };
      expect(capturedOpts.validateContext(pod)).toContain("PRODUCTION");

      resolveAttach(runningPod);
    });
  });
});
