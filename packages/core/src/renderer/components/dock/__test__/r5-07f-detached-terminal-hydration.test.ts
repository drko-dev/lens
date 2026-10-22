/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DiContainer } from "@ogre-tools/injectable";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import ipcRendererInjectable from "../../../utils/channel/ipc-renderer.injectable";
import detachedToolWindowsFeatureFlagInjectable from "../../../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import { detachedToolFrameChannels } from "../../../../common/detached-tools/detached-tool-channels";
import { detachedTerminalFrameChannels } from "../../../../common/terminal/detached-terminal-channels";
import detachedTerminalTabsInjectable from "../terminal/detached-terminal-tabs.injectable";
import setupDetachedTerminalRedockListenerInjectable from "../terminal/setup-detached-terminal-redock-listener.injectable";

describe("R5-07F: detached terminal tabs are hydrated from Main on frame reload", () => {
  let di: DiContainer;
  let invoke: jest.Mock;
  let listeners: Record<string, (event: unknown, payload: unknown) => void>;

  beforeEach(() => {
    di = getDiForUnitTesting();
    invoke = jest.fn(async () => ({ tabs: [] }));
    listeners = {};
    di.override(hostedClusterInjectable, () => ({ id: "cluster-prod" }) as any);
    di.override(ipcRendererInjectable, () => ({ invoke, on: (channel: string, listener: any) => { listeners[channel] = listener; } }) as any);
  });

  const setFlag = (enabled: boolean) => di.inject(detachedToolWindowsFeatureFlagInjectable).setEnabled(enabled);
  const run = () => di.inject(setupDetachedTerminalRedockListenerInjectable).run();

  it("marks the terminal tabs Main owns as detached; logs/inspector entries are ignored", async () => {
    setFlag(true);
    invoke.mockResolvedValueOnce({ tabs: [
      { workspaceId: "default", tabId: "term-1", toolKind: "terminal" },
      { workspaceId: "default", tabId: "log-1", toolKind: "logs" },
      { workspaceId: "default", tabId: "insp-1", toolKind: "inspector" },
    ] });

    await run();

    expect(invoke).toHaveBeenCalledWith(detachedToolFrameChannels.listDetached);
    expect([...di.inject(detachedTerminalTabsInjectable).entries()]).toEqual([["term-1", "detached"]]);
  });

  it("flag OFF never asks Main", async () => {
    setFlag(false);
    await run();

    expect(invoke).not.toHaveBeenCalled();
    expect(di.inject(detachedTerminalTabsInjectable).size).toBe(0);
  });

  it("an unreachable Main leaves the map untouched and does not throw", async () => {
    setFlag(true);
    invoke.mockRejectedValueOnce(new Error("gone"));

    await expect(run()).resolves.toBeUndefined();
    expect(di.inject(detachedTerminalTabsInjectable).size).toBe(0);
  });

  it("a redock notice that arrives while the invoke is pending wins", async () => {
    setFlag(true);
    let answer!: (value: unknown) => void;

    invoke.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    const running = run();

    listeners[detachedTerminalFrameChannels.redocked](undefined, { clusterId: "cluster-prod", tabId: "term-1", reason: "closed" });
    answer({ tabs: [{ workspaceId: "default", tabId: "term-1", toolKind: "terminal" }] });
    await running;

    expect(di.inject(detachedTerminalTabsInjectable).has("term-1")).toBe(false);
  });
});
