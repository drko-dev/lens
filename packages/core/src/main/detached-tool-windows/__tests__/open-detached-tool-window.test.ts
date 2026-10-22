/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { EventEmitter } from "events";
import { loggerInjectionToken } from "@openlens/logger";
import { detachedWindowChannels } from "../detached-window-ipc";
import openDetachedToolWindowInjectable from "../open-detached-tool-window.injectable";
import detachedWindowRegistryInjectable from "../detached-window-registry.injectable";
import staticFilesDirectoryInjectable from "../../../common/vars/static-files-directory.injectable";
import joinPathsInjectable from "../../../common/path/join-paths.injectable";
import { DetachedWindowRegistry } from "../detached-window-registry";

const handlers = new Map<string, unknown>();
const created: FakeWindow[] = [];
const liveIds = new Set<number>();
let nextId = 100;

class FakeWindow extends EventEmitter {
  readonly options: any;
  readonly webContents: any;
  destroyed = false;
  focus = jest.fn();
  show = jest.fn();
  loadFile = jest.fn(() => Promise.resolve());
  navigationHandlers: Record<string, (event: any, url: string) => void> = {};

  constructor(options: any) {
    super();
    this.options = options;
    const id = nextId++;

    liveIds.add(id);
    this.webContents = Object.assign(new EventEmitter(), {
      id,
      mainFrame: { url: "file:///app/static/detached-tool.html" },
      isDestroyed: () => this.destroyed,
      setWindowOpenHandler: jest.fn(),
    });
    const on = this.webContents.on.bind(this.webContents);

    this.webContents.on = (name: string, listener: any) => {
      this.navigationHandlers[name] = listener;

      return on(name, listener);
    };
    created.push(this);
  }

  isDestroyed() {
    return this.destroyed;
  }

  close() {
    this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    liveIds.delete(this.webContents.id);
    this.emit("closed");
  }
}

jest.mock("electron", () => ({
  BrowserWindow: jest.fn((options: any) => new FakeWindow(options)),
  session: { fromPartition: jest.fn(() => ({ setPermissionRequestHandler: jest.fn(), setPermissionCheckHandler: jest.fn() })) },
  webContents: { fromId: jest.fn((id: number) => (liveIds.has(id) ? { isDestroyed: () => false } : undefined)) },
  ipcMain: {
    handle: jest.fn((channel: string, listener: unknown) => handlers.set(channel, listener)),
    removeHandler: jest.fn((channel: string) => handlers.delete(channel)),
  },
}));

const dev = {
  workspaceId: "default", tabId: "tab-dev", clusterId: "cluster-dev", toolKind: "terminal",
  environment: "development", isProduction: false, title: "DEV shell",
};
const prod = {
  workspaceId: "default", tabId: "tab-prod", clusterId: "cluster-prod", toolKind: "logs",
  environment: "production", isProduction: true, title: "PROD api logs",
  resource: { kind: "Pod", namespace: "default", name: "api" },
};

describe("R4-06 open detached tool window", () => {
  let registry: DetachedWindowRegistry;
  let open: (input: unknown) => { windowId: number; reused: boolean };
  let logger: Record<string, jest.Mock>;

  beforeEach(() => {
    handlers.clear();
    created.length = 0;
    liveIds.clear();
    registry = new DetachedWindowRegistry();
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const values = new Map<unknown, unknown>([
      [loggerInjectionToken, logger],
      [detachedWindowRegistryInjectable, registry],
      [staticFilesDirectoryInjectable, "/app/static"],
      [joinPathsInjectable, (...parts: string[]) => parts.join("/")],
    ]);

    open = (openDetachedToolWindowInjectable as any).instantiate({ inject: (token: unknown) => values.get(token) });
  });

  it("creates a sandboxed, isolated window bound to the exact descriptor", () => {
    const { windowId, reused } = open(prod);
    const [window] = created;

    expect(reused).toBe(false);
    expect(window.options.webPreferences).toMatchObject({
      nodeIntegration: false, nodeIntegrationInSubFrames: false, contextIsolation: true,
      sandbox: true, webSecurity: true, devTools: false, webviewTag: false,
    });
    expect(window.options.title).toBe("[PRODUCTION] PROD api logs");
    expect(registry.get(windowId)?.descriptor.clusterId).toBe("cluster-prod");
    expect(window.loadFile).toHaveBeenCalledWith("/app/static/detached-tool.html");
  });

  it("focuses the existing owner instead of opening a duplicate session window", () => {
    const first = open(dev);
    const second = open(dev);

    expect(second).toEqual({ windowId: first.windowId, reused: true });
    expect(created).toHaveLength(1);
    expect(created[0].focus).toHaveBeenCalled();
  });

  it("blocks external navigation and new windows", () => {
    open(dev);
    const [window] = created;
    const event = { preventDefault: jest.fn() };

    window.navigationHandlers["will-navigate"](event, "https://evil.example/");
    window.navigationHandlers["will-redirect"](event, "file:///etc/passwd");
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    expect(window.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({ action: "deny" });
  });

  it("releases ownership and IPC channels when the last window closes", () => {
    const { windowId } = open(dev);

    expect(handlers.size).toBe(Object.keys(detachedWindowChannels).length);
    created[0].close();
    expect(registry.get(windowId)).toBeUndefined();
    expect(handlers.size).toBe(0);
    expect(open(dev).reused).toBe(false);
  });

  it("closes and releases a window whose renderer crashed", () => {
    const { windowId } = open(prod);

    created[0].webContents.emit("render-process-gone");
    expect(registry.get(windowId)).toBeUndefined();
  });

  it("rejects invalid descriptors before creating any window", () => {
    expect(() => open({ ...dev, clusterId: "../prod" })).toThrow();
    expect(() => open({ ...prod, isProduction: false })).toThrow();
    expect(created).toHaveLength(0);
    expect(handlers.size).toBe(0);
  });

  it("keeps DEV and PROD windows independent", () => {
    const devWindow = open(dev);
    const prodWindow = open(prod);

    created[0].close();
    expect(registry.get(devWindow.windowId)).toBeUndefined();
    expect(registry.get(prodWindow.windowId)?.descriptor.isProduction).toBe(true);
    expect(handlers.size).toBe(Object.keys(detachedWindowChannels).length);
  });
});
