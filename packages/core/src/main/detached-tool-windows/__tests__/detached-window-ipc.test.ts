/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { detachedWindowChannels, registerDetachedWindowIpc } from "../detached-window-ipc";
import { DetachedWindowRegistry, parseDetachedToolDescriptor } from "../detached-window-registry";

const handlers = new Map<string, (...args: any[]) => any>();

jest.mock("electron", () => ({
  ipcMain: {
    handle: jest.fn((channel: string, listener: (...args: any[]) => any) => handlers.set(channel, listener)),
    removeHandler: jest.fn((channel: string) => handlers.delete(channel)),
  },
}));

const htmlPath = "/app/static/detached-tool.html";
const descriptor = parseDetachedToolDescriptor({
  workspaceId: "default",
  tabId: "tab-prod",
  clusterId: "cluster-prod",
  toolKind: "inspector",
  environment: "production",
  isProduction: true,
  title: "PROD api",
  resource: { kind: "Pod", namespace: "default", name: "api", uid: "2222-bbbb" },
});

describe("R4-06 detached window IPC", () => {
  let registry: DetachedWindowRegistry;
  let frames: Map<number, { url: string }>;
  let onRedockRequested: jest.Mock;
  let dispose: () => void;
  const call = (channel: string, event: any, ...args: any[]) => handlers.get(channel)?.(event, ...args);
  const eventFor = (id: number, frame = frames.get(id)) => ({ sender: { id }, senderFrame: frame });

  beforeEach(() => {
    handlers.clear();
    registry = new DetachedWindowRegistry();
    frames = new Map([[7, { url: "file:///app/static/detached-tool.html" }], [8, { url: "file:///app/static/detached-tool.html" }]]);
    onRedockRequested = jest.fn();
    registry.register(7, descriptor);
    dispose = registerDetachedWindowIpc({ registry, htmlPath, getMainFrame: id => frames.get(id), onRedockRequested });
  });

  afterEach(() => dispose());

  it("registers only the fixed channel allowlist and removes it on dispose", () => {
    expect([...handlers.keys()]).toEqual(Object.values(detachedWindowChannels));
    dispose();
    expect(handlers.size).toBe(0);
  });

  it("returns the immutable descriptor to the owning window, including PROD identity", () => {
    expect(call(detachedWindowChannels.getContext, eventFor(7))).toEqual({ windowId: 7, descriptor });
  });

  it("rejects an unregistered WebContents even with a valid document", () => {
    expect(() => call(detachedWindowChannels.getContext, eventFor(8))).toThrow("Unauthorized IPC sender.");
  });

  it("rejects subframes and other documents of a registered window", () => {
    expect(() => call(detachedWindowChannels.getContext, eventFor(7, { url: "file:///app/static/detached-tool.html" }))).toThrow("frame");
    frames.set(7, { url: "https://evil.example/detached-tool.html" });
    expect(() => call(detachedWindowChannels.getContext, eventFor(7))).toThrow("frame");
    expect(() => call(detachedWindowChannels.getContext, { sender: { id: 7 }})).toThrow("frame");
    expect(() => call(detachedWindowChannels.getContext, {})).toThrow("Unauthorized IPC sender.");
  });

  it("accepts a legitimate redock immediately after the window opened (no arming delay)", () => {
    expect(call(detachedWindowChannels.requestRedock, eventFor(7), { workspaceId: "default", tabId: "tab-prod", clusterId: "cluster-prod" })).toEqual({ accepted: true });
    expect(onRedockRequested).toHaveBeenCalledTimes(1);
  });

  it("accepts a redock that restates its own identity", () => {
    expect(call(detachedWindowChannels.requestRedock, eventFor(7), { workspaceId: "default", tabId: "tab-prod", clusterId: "cluster-prod" })).toEqual({ accepted: true });
    expect(onRedockRequested).toHaveBeenCalledWith(registry.get(7));
  });

  it("rejects forged identities and extra fields on redock", () => {
    expect(() => call(detachedWindowChannels.requestRedock, eventFor(7), { clusterId: "cluster-dev" })).toThrow("clusterId");
    expect(() => call(detachedWindowChannels.requestRedock, eventFor(7), { clusterId: "cluster-prod", command: "ls" })).toThrow("identity");
    expect(() => call(detachedWindowChannels.requestRedock, eventFor(7), "cluster-prod")).toThrow("identity");
    expect(onRedockRequested).not.toHaveBeenCalled();
  });

  it("stops authorizing a window as soon as it is released", () => {
    registry.release(7);
    expect(() => call(detachedWindowChannels.getContext, eventFor(7))).toThrow("Unauthorized IPC sender.");
  });
});
