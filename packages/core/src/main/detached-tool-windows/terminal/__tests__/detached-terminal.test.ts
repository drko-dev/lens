/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { DetachedWindowRegistry } from "../../detached-window-registry";
import type { DetachedToolDescriptor } from "../../detached-window-registry";
import type { BridgedPty } from "../detached-terminal-bridge";
import { DetachedTerminalBridge } from "../detached-terminal-bridge";
import type { DetachedTerminalManagerDependencies } from "../detached-terminal-manager";
import { DetachedTerminalManager } from "../detached-terminal-manager";
import { ShellSessionHandover } from "../../../shell-session/shell-session-handover.injectable";

class FakePty implements BridgedPty {
  dataListeners = new Set<(data: string) => void>();
  exitListeners = new Set<(e: { exitCode: number }) => void>();
  write = jest.fn();
  resize = jest.fn();
  kill = jest.fn();
  onData(listener: (data: string) => void) {
    this.dataListeners.add(listener);

    return { dispose: () => void this.dataListeners.delete(listener) };
  }
  onExit(listener: (e: { exitCode: number }) => void) {
    this.exitListeners.add(listener);

    return { dispose: () => void this.exitListeners.delete(listener) };
  }
  emit(data: string) {
    [...this.dataListeners].forEach(l => l(data));
  }
  exit(exitCode = 0) {
    [...this.exitListeners].forEach(l => l({ exitCode }));
  }
}

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const HTML = "file:///static/detached-terminal.html";
const TAB = "tab-1";

function setup(options: { enabled?: boolean; confirm?: boolean } = {}) {
  const registry = new DetachedWindowRegistry();
  const processes = new Map<string, BridgedPty>();
  const handover = new ShellSessionHandover();
  const sent: { windowId: number; payload: unknown }[] = [];
  const notices: { clusterId: string; notice: any }[] = [];
  const closedWindows: number[] = [];
  const frames = new Map<string, { frameId: number; processId: number }>([
    ["dev-cluster", { frameId: 1, processId: 10 }],
    ["prod-cluster", { frameId: 2, processId: 10 }],
  ]);
  const clusters = new Map([
    // Homonyms on purpose: same visible name, only the explicit preference differs.
    ["dev-cluster", { id: "dev-cluster", name: "payments", preferences: { clusterEnvironment: "development" }}],
    ["prod-cluster", { id: "prod-cluster", name: "payments", preferences: { clusterEnvironment: "production" }}],
  ]);
  const mainFrames = new Map<number, object>();
  let nextWindowId = 100;
  const consumerClosed = jest.fn();
  const bridgeRef: { manager?: DetachedTerminalManager } = {};
  const bridge = new DetachedTerminalBridge({
    processes,
    handover,
    logger,
    sendToWindow: (windowId, payload) => sent.push({ windowId, payload }),
    onPtyExit: record => bridgeRef.manager?.ptyExited(record),
  });
  const confirmProduction = jest.fn(async () => options.confirm ?? true);
  const openWindow = jest.fn((descriptor: DetachedToolDescriptor, hooks: any) => {
    const owner = registry.findOwner(descriptor);

    if (owner) return { windowId: owner.windowId, reused: true };

    const windowId = nextWindowId++;

    registry.register(windowId, descriptor);
    mainFrames.set(windowId, { url: HTML });
    hooksByWindow.set(windowId, hooks);

    return { windowId, reused: false };
  });
  const hooksByWindow = new Map<number, any>();
  const deps: DetachedTerminalManagerDependencies = {
    logger,
    registry,
    bridge,
    isEnabled: () => options.enabled ?? true,
    getClusterFrames: () => frames,
    getCluster: id => clusters.get(id) as any,
    confirmProduction,
    openWindow: openWindow as any,
    closeWindow: (windowId) => {
      closedWindows.push(windowId);
      const record = registry.release(windowId);

      if (record) hooksByWindow.get(windowId).onClosed(record, "redock");
    },
    getMainFrame: id => mainFrames.get(id),
    isExpectedDocument: url => url === HTML,
    notifyClusterFrame: (clusterId, notice) => notices.push({ clusterId, notice }),
  };
  const manager = new DetachedTerminalManager(deps);

  bridgeRef.manager = manager;

  const pty = (clusterId: string) => {
    const p = new FakePty();

    processes.set(`${clusterId}:${TAB}`, p);
    handover.registerConsumer(`${clusterId}:${TAB}`, consumerClosed);

    return p;
  };
  const frameEvent = (clusterId: string) => ({ ...frames.get(clusterId) }) as any;
  const detach = (clusterId: string, extra: object = {}) => manager.handleDetach(frameEvent(clusterId), { clusterId, workspaceId: "default", tabId: TAB, ...extra });
  const windowEvent = (windowId: number, url = HTML) => ({ sender: { id: windowId }, senderFrame: windowId in Object.fromEntries(mainFrames) ? (url === HTML ? mainFrames.get(windowId) : { url }) : undefined }) as any;

  return { registry, processes, handover, sent, notices, closedWindows, manager, bridge, pty, detach, windowEvent, frameEvent, openWindow, confirmProduction, consumerClosed, mainFrames, hooksByWindow };
}

describe("R4-06B detachable terminal", () => {
  it("transfers the SAME pty to the window without spawning or killing, and redocks without killing", async () => {
    const s = setup();
    const pty = s.pty("dev-cluster");
    const before = new Map(s.processes);

    const result = await s.detach("dev-cluster");

    expect(result).toEqual({ accepted: true, windowId: 100, reused: false });
    expect(s.handover.isHeld(`dev-cluster:${TAB}`)).toBe(true);
    expect(s.consumerClosed).toHaveBeenCalledTimes(1); // dock websocket disconnected, exactly once
    expect(pty.kill).not.toHaveBeenCalled();

    pty.emit("early");
    s.manager.handleWindowStart(s.windowEvent(100));
    pty.emit("late");
    expect(s.sent.map(m => m.payload)).toEqual([{ type: "output", data: "early" }, { type: "output", data: "late" }]);

    s.manager.handleWindowRedock(s.windowEvent(100));

    expect(pty.kill).not.toHaveBeenCalled();
    expect(s.handover.isHeld(`dev-cluster:${TAB}`)).toBe(false);
    expect(pty.dataListeners.size).toBe(0);
    expect(pty.exitListeners.size).toBe(0);
    expect(s.processes).toEqual(before); // same process object still registered, no second PTY
    expect(s.processes.get(`dev-cluster:${TAB}`)).toBe(pty);
    expect(s.notices).toEqual([{ clusterId: "dev-cluster", notice: { clusterId: "dev-cluster", workspaceId: "default", tabId: TAB, reason: "redock" }}]);
  });

  it("a second detach of the same tab focuses the owner and never attaches again", async () => {
    const s = setup();
    const pty = s.pty("dev-cluster");

    await s.detach("dev-cluster");
    const again = await s.detach("dev-cluster");

    expect(again).toEqual({ accepted: true, windowId: 100, reused: true });
    expect(pty.dataListeners.size).toBe(1);
    expect(s.consumerClosed).toHaveBeenCalledTimes(1);
  });

  it("refuses when the shell is not running (nothing opened)", async () => {
    const s = setup();

    await expect(s.detach("dev-cluster")).rejects.toThrow("not running");
    expect(s.openWindow).not.toHaveBeenCalled();
  });

  it("flag OFF: Main refuses and transfers nothing", async () => {
    const s = setup({ enabled: false });

    s.pty("dev-cluster");

    await expect(s.detach("dev-cluster")).rejects.toThrow("disabled");
    expect(s.openWindow).not.toHaveBeenCalled();
    expect(s.handover.isHeld(`dev-cluster:${TAB}`)).toBe(false);
    expect(s.consumerClosed).not.toHaveBeenCalled();
  });

  describe("forged ids", () => {
    it("rejects senders that are not a registered cluster frame", async () => {
      const s = setup();

      s.pty("dev-cluster");

      await expect(s.manager.handleDetach({ frameId: 99, processId: 10 } as any, { clusterId: "dev-cluster", workspaceId: "default", tabId: TAB })).rejects.toThrow("registered cluster frame");
      await expect(s.manager.handleDetach({} as any, { clusterId: "dev-cluster", workspaceId: "default", tabId: TAB })).rejects.toThrow("Unauthorized");
    });

    it("rejects a cluster frame naming another cluster", async () => {
      const s = setup();

      s.pty("prod-cluster");

      await expect(s.manager.handleDetach(s.frameEvent("dev-cluster"), { clusterId: "prod-cluster", workspaceId: "default", tabId: TAB })).rejects.toThrow("Cluster context mismatch");
      expect(s.confirmProduction).not.toHaveBeenCalled();
      expect(s.openWindow).not.toHaveBeenCalled();
    });

    it("rejects extra fields (environment/command smuggling) and malformed ids", async () => {
      const s = setup();

      s.pty("dev-cluster");

      await expect(s.detach("dev-cluster", { isProduction: false })).rejects.toThrow("Invalid terminal request");
      await expect(s.detach("dev-cluster", { tabId: "../x" })).rejects.toThrow("Invalid terminal identity");
      expect(() => s.manager.handleFrameRedock(s.frameEvent("dev-cluster"), { clusterId: "prod-cluster", workspaceId: "default", tabId: TAB })).toThrow("Cluster context mismatch");
    });

    it("window channels reject unregistered windows, wrong frames and wrong documents", async () => {
      const s = setup();

      s.pty("dev-cluster");
      await s.detach("dev-cluster");

      expect(() => s.manager.handleWindowInput(s.windowEvent(555), "ls\r")).toThrow("Unauthorized IPC sender");
      expect(() => s.manager.handleWindowInput({ sender: { id: 100 }, senderFrame: { url: HTML }} as any, "ls\r")).toThrow("sender frame");
      s.mainFrames.set(100, { url: "file:///evil.html" });
      expect(() => s.manager.handleWindowInput({ sender: { id: 100 }, senderFrame: s.mainFrames.get(100) } as any, "ls\r")).toThrow("sender frame");
      expect((s.processes.get(`dev-cluster:${TAB}`) as FakePty).write).not.toHaveBeenCalled();
    });

    it("a non-terminal registry window cannot drive the terminal channels", async () => {
      const s = setup();

      s.registry.register(300, { workspaceId: "default", tabId: TAB, clusterId: "dev-cluster", toolKind: "logs", environment: "development", isProduction: false, title: "logs", resource: { kind: "Pod", name: "p", namespace: "default" }});
      s.mainFrames.set(300, { url: HTML });

      expect(() => s.manager.handleWindowInput({ sender: { id: 300 }, senderFrame: s.mainFrames.get(300) } as any, "x")).toThrow("Unauthorized IPC sender");
    });
  });

  describe("input and resize validation", () => {
    const attached = async () => {
      const s = setup();
      const pty = s.pty("dev-cluster");

      await s.detach("dev-cluster");

      return { s, pty, ev: s.windowEvent(100) };
    };

    it("writes valid input and resizes within range", async () => {
      const { s, pty, ev } = await attached();

      s.manager.handleWindowInput(ev, "ls\r");
      s.manager.handleWindowResize(ev, { cols: 120, rows: 40 });

      expect(pty.write).toHaveBeenCalledWith("ls\r");
      expect(pty.resize).toHaveBeenCalledWith(120, 40);
    });

    it.each([[""], [123], [{}], [null], ["x".repeat(65537)]])("rejects input %p", async (bad) => {
      const { s, pty, ev } = await attached();

      expect(() => s.manager.handleWindowInput(ev, bad)).toThrow("Invalid terminal input");
      expect(pty.write).not.toHaveBeenCalled();
    });

    it.each([
      [{ cols: 0, rows: 10 }], [{ cols: 10, rows: 0 }], [{ cols: 1001, rows: 10 }], [{ cols: 10, rows: 501 }],
      [{ cols: 1.5, rows: 10 }], [{ cols: "80", rows: 10 }], [{ cols: NaN, rows: 10 }], [{ cols: 10 }], [{ cols: 10, rows: 10, extra: 1 }], [null], [[80, 24]],
    ])("rejects resize %p", async (bad) => {
      const { s, pty, ev } = await attached();

      expect(() => s.manager.handleWindowResize(ev, bad)).toThrow("Invalid terminal size");
      expect(pty.resize).not.toHaveBeenCalled();
    });
  });

  describe("PROD confirmation", () => {
    it("decline: nothing is transferred (no window, no hold, dock websocket untouched)", async () => {
      const s = setup({ confirm: false });
      const pty = s.pty("prod-cluster");

      const result = await s.detach("prod-cluster");

      expect(result).toEqual({ accepted: false, reason: "declined" });
      expect(s.openWindow).not.toHaveBeenCalled();
      expect(s.handover.isHeld(`prod-cluster:${TAB}`)).toBe(false);
      expect(s.consumerClosed).not.toHaveBeenCalled();
      expect(pty.dataListeners.size).toBe(0);
    });

    it("accept: confirms with Main-resolved identity, then detaches", async () => {
      const s = setup({ confirm: true });

      s.pty("prod-cluster");

      const result = await s.detach("prod-cluster");

      expect(result).toMatchObject({ accepted: true });
      expect(s.confirmProduction).toHaveBeenCalledWith(expect.objectContaining({ clusterId: "prod-cluster", clusterName: "payments", tabId: TAB }));
      expect(s.registry.get(100)?.descriptor.isProduction).toBe(true);
      expect(s.handover.isHeld(`prod-cluster:${TAB}`)).toBe(true);
    });

    it("DEV/PROD homonyms: only the explicit production cluster asks, and sessions never mix", async () => {
      const s = setup({ confirm: true });
      const devPty = s.pty("dev-cluster");
      const prodPty = s.pty("prod-cluster");

      await s.detach("dev-cluster");
      expect(s.confirmProduction).not.toHaveBeenCalled();
      expect(s.registry.get(100)?.descriptor).toMatchObject({ clusterId: "dev-cluster", environment: "development", isProduction: false });

      await s.detach("prod-cluster");
      expect(s.confirmProduction).toHaveBeenCalledTimes(1);
      expect(s.registry.get(101)?.descriptor).toMatchObject({ clusterId: "prod-cluster", isProduction: true });

      s.manager.handleWindowInput(s.windowEvent(100), "dev\r");
      expect(devPty.write).toHaveBeenCalledWith("dev\r");
      expect(prodPty.write).not.toHaveBeenCalled();
    });

    it("a confirmation that rejects or a changed shell leaves nothing transferred", async () => {
      const s = setup({ confirm: true });

      s.pty("prod-cluster");
      s.confirmProduction.mockImplementationOnce(async () => {
        s.processes.delete(`prod-cluster:${TAB}`);

        return true;
      });

      await expect(s.detach("prod-cluster")).rejects.toThrow("changed while waiting");
      expect(s.openWindow).not.toHaveBeenCalled();
    });
  });

  it("pty exit: window gets the end event, bridge disposed, dock notified, dead pty not resumable", async () => {
    const s = setup();
    const pty = s.pty("dev-cluster");

    await s.detach("dev-cluster");
    s.manager.handleWindowStart(s.windowEvent(100));
    pty.exit(3);

    expect(s.sent.at(-1)).toEqual({ windowId: 100, payload: { type: "exit", exitCode: 3 }});
    expect(pty.dataListeners.size + pty.exitListeners.size).toBe(0);
    expect(s.processes.has(`dev-cluster:${TAB}`)).toBe(false);
    expect(s.handover.isHeld(`dev-cluster:${TAB}`)).toBe(false);
    expect(s.notices.at(-1)).toEqual({ clusterId: "dev-cluster", notice: expect.objectContaining({ reason: "exited" }) });
    // typing after the end is ignored
    s.manager.handleWindowInput(s.windowEvent(100), "x");
    expect(pty.write).not.toHaveBeenCalled();
  });

  it("window crash/OS close: bridge released, PTY alive, only the originating cluster frame is told", async () => {
    const s = setup();
    const pty = s.pty("dev-cluster");

    await s.detach("dev-cluster");
    const record = s.registry.release(100) as NonNullable<ReturnType<typeof s.registry.release>>;

    s.hooksByWindow.get(100).onClosed(record, "crash");

    expect(pty.kill).not.toHaveBeenCalled();
    expect(s.processes.get(`dev-cluster:${TAB}`)).toBe(pty);
    expect(pty.dataListeners.size).toBe(0);
    expect(s.handover.isHeld(`dev-cluster:${TAB}`)).toBe(false);
    expect(s.notices).toHaveLength(1);
    expect(s.notices[0]).toMatchObject({ clusterId: "dev-cluster", notice: { reason: "crash", tabId: TAB }});
  });

  it("frame redock closes only the window owning that tab; unknown tab is not accepted", async () => {
    const s = setup();

    s.pty("dev-cluster");
    await s.detach("dev-cluster");

    expect(s.manager.handleFrameRedock(s.frameEvent("dev-cluster"), { clusterId: "dev-cluster", workspaceId: "default", tabId: "other" })).toEqual({ accepted: false });
    expect(s.manager.handleFrameRedock(s.frameEvent("dev-cluster"), { clusterId: "dev-cluster", workspaceId: "default", tabId: TAB })).toEqual({ accepted: true });
    expect(s.closedWindows).toEqual([100]);
  });

  it("bridge: attach without a PTY or a second attach for the same terminal is refused", () => {
    const s = setup();
    const register = (windowId: number, workspaceId: string) => s.registry.register(windowId, { workspaceId, tabId: TAB, clusterId: "dev-cluster", toolKind: "terminal", environment: "development", isProduction: false, title: "t" });
    const first = register(7, "default");
    const second = register(8, "other");

    expect(() => s.bridge.attach(first)).toThrow("not running");
    const pty = s.pty("dev-cluster");

    s.bridge.attach(first);
    expect(() => s.bridge.attach(second)).toThrow("already attached");
    expect(pty.dataListeners.size).toBe(1);
  });
});
