/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { detachedThemeChannels } from "../../../common/detached-tools/detached-tool-channels";
import { registerDetachedThemeIpc } from "../detached-theme-ipc";
import { DetachedWindowRegistry, parseDetachedToolDescriptor } from "../detached-window-registry";

const listeners = new Map<string, (...args: any[]) => any>();
const handlers = new Map<string, (...args: any[]) => any>();

jest.mock("electron", () => ({
  ipcMain: {
    on: jest.fn((channel: string, fn: (...args: any[]) => any) => listeners.set(channel, fn)),
    handle: jest.fn((channel: string, fn: (...args: any[]) => any) => handlers.set(channel, fn)),
    removeListener: jest.fn((channel: string) => listeners.delete(channel)),
    removeHandler: jest.fn((channel: string) => handlers.delete(channel)),
  },
}));

const descriptor = parseDetachedToolDescriptor({
  workspaceId: "default", tabId: "t", clusterId: "c", toolKind: "terminal", environment: "none", isProduction: false, title: "T",
});

describe("R5-07 detached theme IPC", () => {
  const rootFrame = { id: "root" };
  const subFrame = { id: "sub" };
  const appEvent = (frame: unknown = rootFrame, id = 1) => ({ sender: { id, mainFrame: rootFrame }, senderFrame: frame });
  const detachedEvent = (frame: unknown = rootFrame) => ({ sender: { id: 7, mainFrame: rootFrame }, senderFrame: frame });
  const valid = { type: "dark", colors: { mainBackground: "#000", evil: "#fff", primary: "url(x)" }};
  let send: jest.Mock;
  let dispose: () => void;

  beforeEach(() => {
    listeners.clear();
    handlers.clear();
    const registry = new DetachedWindowRegistry();

    registry.register(7, descriptor);
    registry.register(8, { ...descriptor, tabId: "t2" });
    send = jest.fn();
    dispose = registerDetachedThemeIpc({ registry, send });
  });

  afterEach(() => dispose());

  it("sanitizes, caches and broadcasts to every detached window", () => {
    listeners.get(detachedThemeChannels.update)?.(appEvent(), valid);

    const expected = { type: "dark", colors: { mainBackground: "#000" }};

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(7, detachedThemeChannels.changed, expected);
    expect(send).toHaveBeenCalledWith(8, detachedThemeChannels.changed, expected);
    expect(handlers.get(detachedThemeChannels.get)?.(detachedEvent())).toEqual(expected);
  });

  it("rejects updates from detached windows and from subframes", () => {
    listeners.get(detachedThemeChannels.update)?.(detachedEvent(), valid);
    listeners.get(detachedThemeChannels.update)?.(appEvent(subFrame), valid);
    listeners.get(detachedThemeChannels.update)?.({ sender: { id: 1, mainFrame: rootFrame }}, valid);

    expect(send).not.toHaveBeenCalled();
    expect(handlers.get(detachedThemeChannels.get)?.(detachedEvent())).toBeUndefined();
  });

  it("ignores invalid payloads and keeps the previous cache", () => {
    listeners.get(detachedThemeChannels.update)?.(appEvent(), valid);
    send.mockClear();
    listeners.get(detachedThemeChannels.update)?.(appEvent(), { type: "x" });

    expect(send).not.toHaveBeenCalled();
    expect(handlers.get(detachedThemeChannels.get)?.(detachedEvent())).toEqual({ type: "dark", colors: { mainBackground: "#000" }});
  });

  it("get serves only registered detached root frames", () => {
    listeners.get(detachedThemeChannels.update)?.(appEvent(), valid);

    expect(handlers.get(detachedThemeChannels.get)?.(appEvent())).toBeUndefined();
    expect(handlers.get(detachedThemeChannels.get)?.(detachedEvent(subFrame))).toBeUndefined();
  });

  it("removes handlers on dispose", () => {
    dispose();
    expect(listeners.size + handlers.size).toBe(0);
  });
});
