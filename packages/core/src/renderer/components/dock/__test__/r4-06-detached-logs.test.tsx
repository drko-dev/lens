/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import type { DiRender } from "../../test-utils/renderFor";
import { renderFor } from "../../test-utils/renderFor";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import ipcRendererInjectable from "../../../utils/channel/ipc-renderer.injectable";
import detachedToolWindowsFeatureFlagInjectable from "../../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import { detachedToolFrameChannels } from "../../../../common/detached-tools/detached-tool-channels";
import showCheckedErrorNotificationInjectable from "../../notifications/show-checked-error.injectable";
import detachedLogsHydrationInjectable from "../logs/detached-logs-hydration.injectable";
import detachedLogsTabsInjectable from "../logs/detached-logs-tabs.injectable";
import setupDetachedLogsRedockListenerInjectable from "../logs/setup-detached-logs-redock-listener.injectable";
import { DetachedLogsPlaceholder, LogDetachButton } from "../logs/detach-logs-controls";
import { MenuActions } from "../../menu";
import { DetachInspectorMenuItem } from "../../kube-object-menu/detach-inspector-menu-item";

describe("R4-06: detached logs / inspector renderer side", () => {
  let di: DiContainer;
  let render: DiRender;
  let invoke: jest.Mock;
  let listeners: Record<string, (event: unknown, payload: unknown) => void>;
  let showError: jest.Mock;
  const model = (stopLoadingLogs: jest.Mock) => ({
    logTabData: { get: () => ({ selectedPodId: "pod-uid", selectedContainer: "api", namespace: "shop", showPrevious: false, showTimestamps: true }) },
    pod: { get: () => ({ getNs: () => "shop", getName: () => "api-0", getId: () => "pod-uid" }) },
    stopLoadingLogs,
  }) as any;

  beforeEach(() => {
    di = getDiForUnitTesting();
    render = renderFor(di);
    invoke = jest.fn(async () => ({ windowId: 3, reused: false }));
    listeners = {};
    showError = jest.fn();
    di.override(hostedClusterInjectable, () => ({ id: "cluster-prod", name: "shop", preferences: { clusterEnvironment: "production" }}) as any);
    di.override(ipcRendererInjectable, () => ({ invoke, on: (channel: string, listener: any) => { listeners[channel] = listener; } }) as any);
    di.override(showCheckedErrorNotificationInjectable, () => showError as any);
  });

  const setFlag = (enabled: boolean) => di.inject(detachedToolWindowsFeatureFlagInjectable).setEnabled(enabled);

  describe("frame reload: Main decides which tabs are detached", () => {
    it("marks the tabs Main owns before reporting ready (so logs are never loaded for them)", async () => {
      setFlag(true);
      let answer!: (value: unknown) => void;

      invoke.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
      const hydration = di.inject(detachedLogsHydrationInjectable);
      const tabs = di.inject(detachedLogsTabsInjectable);

      await Promise.resolve();
      expect(invoke).toHaveBeenCalledWith(detachedToolFrameChannels.listDetached);
      expect(hydration.done).toBe(false);
      expect(tabs.has("tab-1")).toBe(false);

      answer({ tabs: [{ workspaceId: "default", tabId: "tab-1", toolKind: "logs" }, { workspaceId: "default", tabId: "tab-i", toolKind: "inspector" }] });
      await hydration.ready;

      expect(hydration.done).toBe(true);
      expect([...tabs]).toEqual(["tab-1"]);
    });

    it("flag OFF never asks Main; an unreachable Main falls back to the dock owning the stream", async () => {
      setFlag(false);
      await di.inject(detachedLogsHydrationInjectable).ready;
      expect(invoke).not.toHaveBeenCalled();

      invoke.mockRejectedValueOnce(new Error("gone"));
      const di2 = getDiForUnitTesting();

      di2.override(hostedClusterInjectable, () => ({ id: "cluster-prod" }) as any);
      di2.override(ipcRendererInjectable, () => ({ invoke, on: jest.fn() }) as any);
      di2.inject(detachedToolWindowsFeatureFlagInjectable).setEnabled(true);
      const hydration = di2.inject(detachedLogsHydrationInjectable);

      await hydration.ready;
      expect(hydration.done).toBe(true);
      expect(di2.inject(detachedLogsTabsInjectable).size).toBe(0);
    });
  });

  it("flag OFF: no detach button for logs and no inspector action", () => {
    setFlag(false);
    render(<LogDetachButton tabId="tab-1" model={model(jest.fn())} />);
    render(<DetachInspectorMenuItem object={{ metadata: { uid: "u-1" }, apiVersion: "v1" } as any} />);

    expect(screen.queryByTestId("log-detach-btn")).toBeNull();
    expect(screen.queryByTestId("detach-inspector-btn")).toBeNull();
  });

  it("flag ON: detach stops the dock stream first, marks the tab detached and sends only allowlisted fields", async () => {
    setFlag(true);
    const stop = jest.fn();

    render(<LogDetachButton tabId="tab-1" model={model(stop)} />);
    fireEvent.click(screen.getByTestId("log-detach-btn"));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(di.inject(detachedLogsTabsInjectable).has("tab-1")).toBe(true);
    expect(invoke).toHaveBeenCalledWith(detachedToolFrameChannels.requestDetach, {
      clusterId: "cluster-prod",
      workspaceId: "default",
      tabId: "tab-1",
      toolKind: "logs",
      resource: { kind: "Pod", namespace: "shop", name: "api-0", uid: "pod-uid" },
      logs: { container: "api", tailLines: 500, previous: false, timestamps: true },
    });
  });

  it("a refused detach gives the stream back to the dock", async () => {
    setFlag(true);
    invoke.mockRejectedValueOnce(new Error("Detached tool windows are disabled."));
    render(<LogDetachButton tabId="tab-1" model={model(jest.fn())} />);
    fireEvent.click(screen.getByTestId("log-detach-btn"));

    await waitFor(() => expect(showError).toHaveBeenCalled());

    expect(di.inject(detachedLogsTabsInjectable).has("tab-1")).toBe(false);
  });

  it("placeholder redock asks Main; a stale tab nobody owns is released locally", async () => {
    setFlag(true);
    di.inject(detachedLogsTabsInjectable).add("tab-1");
    invoke.mockResolvedValueOnce({ accepted: false });
    render(<DetachedLogsPlaceholder tabId="tab-1" />);

    expect(screen.getByTestId("log-detached-placeholder")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("log-redock-btn"));

    await waitFor(() => expect(di.inject(detachedLogsTabsInjectable).has("tab-1")).toBe(false));
    expect(invoke).toHaveBeenCalledWith(detachedToolFrameChannels.requestRedock, { clusterId: "cluster-prod", workspaceId: "default", tabId: "tab-1", toolKind: "logs" });
  });

  it("the dock only resumes for a redock notice of its own cluster", () => {
    const detached = di.inject(detachedLogsTabsInjectable);

    di.inject(setupDetachedLogsRedockListenerInjectable).run();
    detached.add("tab-1");

    listeners[detachedToolFrameChannels.redocked]({}, { clusterId: "cluster-dev", tabId: "tab-1", toolKind: "logs" });
    listeners[detachedToolFrameChannels.redocked]({}, { clusterId: "cluster-prod", tabId: "tab-1", toolKind: "terminal" });
    listeners[detachedToolFrameChannels.redocked]({}, "garbage");
    expect(detached.has("tab-1")).toBe(true);

    listeners[detachedToolFrameChannels.redocked]({}, { clusterId: "cluster-prod", tabId: "tab-1", toolKind: "logs" });
    expect(detached.has("tab-1")).toBe(false);
  });

  it("flag ON: inspector action sends apiVersion, kind and the uid of the object", async () => {
    setFlag(true);
    const object = { apiVersion: "apps/v1", kind: "Deployment", metadata: { uid: "dep-uid" }, getName: () => "api", getNs: () => "shop" };

    render(<MenuActions id="menu" toolbar><DetachInspectorMenuItem object={object as any} toolbar /></MenuActions>);
    fireEvent.click(screen.getByTestId("detach-inspector-btn"));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith(detachedToolFrameChannels.requestDetach, {
      clusterId: "cluster-prod",
      workspaceId: "default",
      tabId: "inspect-dep-uid",
      toolKind: "inspector",
      resource: { apiVersion: "apps/v1", kind: "Deployment", name: "api", uid: "dep-uid", namespace: "shop" },
    });
  });
});
