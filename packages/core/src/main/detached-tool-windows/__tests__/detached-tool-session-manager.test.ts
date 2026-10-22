/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { EventEmitter } from "events";
import type { IpcMainInvokeEvent } from "electron";
import type { DetachToolRequest } from "../../../common/detached-tools/detached-tool-channels";
import { DetachedToolSessionManager, MIN_REFRESH_INTERVAL_MS } from "../detached-tool-session-manager";
import type { DetachedToolSessionManagerDependencies, DetachedToolCluster } from "../detached-tool-session-manager";
import type { DetachedWindowRecord } from "../detached-window-registry";
import { DetachedWindowRegistry, parseDetachedToolDescriptor } from "../detached-window-registry";
import type { DetachedToolWindowHooks } from "../open-detached-tool-window.injectable";

const clusters: Record<string, DetachedToolCluster> = {
  "cluster-dev": { id: "cluster-dev", name: "shop", preferences: { clusterEnvironment: "development" } as any },
  "cluster-prod": { id: "cluster-prod", name: "shop", preferences: { clusterEnvironment: "production" } as any },
};
const frames = new Map([
  ["cluster-dev", { frameId: 11, processId: 100 }],
  ["cluster-prod", { frameId: 22, processId: 200 }],
]);

const eventOf = (clusterId: string) => ({ ...frames.get(clusterId) }) as unknown as IpcMainInvokeEvent;

const logsRequest = (clusterId: string, overrides: Partial<DetachToolRequest> = {}): DetachToolRequest => ({
  clusterId,
  workspaceId: "default",
  tabId: "tab-1",
  toolKind: "logs",
  resource: { kind: "Pod", namespace: "shop", name: "api-0", uid: "aaaa-1111" },
  logs: { container: "api", tailLines: 500, previous: false, timestamps: false },
  ...overrides,
});

const inspectorRequest = (clusterId: string, uid = "aaaa-1111"): DetachToolRequest => ({
  clusterId,
  workspaceId: "default",
  tabId: `inspect-${uid}`,
  toolKind: "inspector",
  resource: { apiVersion: "apps/v1", kind: "Deployment", namespace: "shop", name: "api", uid },
});

class FakeStream extends EventEmitter {
  destroy = jest.fn();
}

function setup(overrides: Partial<DetachedToolSessionManagerDependencies> = {}) {
  const registry = new DetachedWindowRegistry();
  const hooks = new Map<number, DetachedToolWindowHooks>();
  const sent: { windowId: number; payload: any }[] = [];
  const notices: { clusterId: string; notice: any }[] = [];
  const streams: { clusterId: string; signal: AbortSignal; stream: FakeStream; params: any }[] = [];
  let nextWindowId = 1;
  let now = 1_000_000;
  const closeWindow = (windowId: number) => {
    const record = registry.release(windowId);

    if (record) hooks.get(windowId)?.onClosed?.(record);
  };
  const deps: DetachedToolSessionManagerDependencies = {
    isEnabled: () => true,
    getCluster: id => clusters[id],
    getClusterFrames: () => frames,
    openWindow: jest.fn((input: unknown, windowHooks: DetachedToolWindowHooks) => {
      const descriptor = parseDetachedToolDescriptor(input);
      const owner = registry.findOwner(descriptor);

      if (owner) return { windowId: owner.windowId, reused: true };

      const windowId = nextWindowId++;

      registry.register(windowId, descriptor);
      hooks.set(windowId, windowHooks);

      return { windowId, reused: false };
    }),
    listOwned: clusterId => registry.windowsForCluster(clusterId),
    findOwner: key => registry.findOwner(key),
    closeWindow,
    sendToWindow: (windowId, payload) => sent.push({ windowId, payload }),
    sendToClusterFrame: (clusterId, notice) => notices.push({ clusterId, notice }),
    openLogStream: jest.fn(async (clusterId, params, signal) => {
      const stream = new FakeStream();

      streams.push({ clusterId, signal, stream, params });

      return stream;
    }),
    getJson: jest.fn(),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    now: () => now,
    ...overrides,
  };
  const manager = new DetachedToolSessionManager(deps);
  const startWindow = (windowId: number) => hooks.get(windowId)?.onStart?.(registry.get(windowId) as DetachedWindowRecord);
  const refreshWindow = (windowId: number) => hooks.get(windowId)?.onRefresh?.(registry.get(windowId) as DetachedWindowRecord);
  const flush = () => new Promise(resolve => setImmediate(resolve));

  return { manager, deps, registry, sent, notices, streams, closeWindow, startWindow, refreshWindow, flush, advance: (ms: number) => { now += ms; } };
}

describe("R4-06 detached tool session manager", () => {
  describe("feature flag and sender validation", () => {
    it("refuses everything while the flag is OFF and opens nothing", () => {
      const { manager, deps } = setup({ isEnabled: () => false });

      expect(() => manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"))).toThrow("disabled");
      expect(deps.openWindow).not.toHaveBeenCalled();
    });

    it("rejects an unregistered sender (no cluster frame)", () => {
      const { manager, deps } = setup();
      const stranger = { frameId: 99, processId: 999 } as unknown as IpcMainInvokeEvent;

      expect(() => manager.handleDetach(stranger, logsRequest("cluster-dev"))).toThrow("registered cluster frame");
      expect(() => manager.handleDetach(undefined as any, logsRequest("cluster-dev"))).toThrow("Unauthorized");
      expect(deps.openWindow).not.toHaveBeenCalled();
    });

    it("rejects a request that claims another cluster than the frame it came from", () => {
      const { manager, deps } = setup();

      expect(() => manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-prod"))).toThrow("Cluster context mismatch");
      expect(() => manager.handleDetach(eventOf("cluster-prod"), logsRequest("cluster-dev"))).toThrow("Cluster context mismatch");
      expect(deps.openWindow).not.toHaveBeenCalled();
    });

    it.each([
      ["extra key", { ...logsRequest("cluster-dev"), command: "rm -rf /" }],
      ["path traversal pod", logsRequest("cluster-dev", { resource: { kind: "Pod", namespace: "shop", name: "../secrets" }})],
      ["query injection container", logsRequest("cluster-dev", { logs: { container: "api&follow=false", tailLines: 5, previous: false, timestamps: false }})],
      ["huge tailLines", logsRequest("cluster-dev", { logs: { container: "api", tailLines: 10_000_000, previous: false, timestamps: false }})],
      ["terminal kind", { ...logsRequest("cluster-dev"), toolKind: "terminal" }],
      ["forged env fields", { ...logsRequest("cluster-dev"), isProduction: false, environment: "development" }],
      ["logs for non-pod", logsRequest("cluster-dev", { resource: { kind: "Secret", namespace: "shop", name: "x" }})],
      ["inspector without uid", { ...inspectorRequest("cluster-dev"), resource: { apiVersion: "v1", kind: "Pod", name: "x" }}],
      ["bad apiVersion", { ...inspectorRequest("cluster-dev"), resource: { apiVersion: "../v1", kind: "Pod", name: "x", uid: "aa" }}],
      ["not an object", "logs"],
    ])("rejects forged payload: %s", (_name, payload) => {
      const { manager, deps } = setup();

      expect(() => manager.handleDetach(eventOf("cluster-dev"), payload)).toThrow();
      expect(deps.openWindow).not.toHaveBeenCalled();
    });

    it("rejects a cluster that Main does not know", () => {
      const { manager } = setup({ getCluster: () => undefined });

      expect(() => manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"))).toThrow("Unknown cluster");
    });
  });

  describe("single owner", () => {
    it("a second detach focuses the existing window and never adds a stream", async () => {
      const { manager, deps, streams, startWindow, flush } = setup();
      const first = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));
      const second = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));

      expect(first.reused).toBe(false);
      expect(second).toEqual({ windowId: first.windowId, reused: true });

      startWindow(first.windowId);
      await flush();

      expect(deps.openLogStream).toHaveBeenCalledTimes(1);
      expect(streams).toHaveLength(1);
      expect(manager.activeStreamCount).toBe(1);
    });

    it("a repeated start (page reload) aborts the previous stream: never two concurrent streams", async () => {
      const { manager, streams, startWindow, flush } = setup();
      const { windowId } = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));

      startWindow(windowId);
      await flush();
      startWindow(windowId);
      await flush();

      expect(streams).toHaveLength(2);
      expect(streams[0].signal.aborted).toBe(true);
      expect(streams[0].stream.destroy).toHaveBeenCalled();
      expect(streams[1].signal.aborted).toBe(false);
      expect(manager.activeStreamCount).toBe(1);
    });

    it("builds the stream only from Main-held parameters", async () => {
      const { manager, streams, startWindow, flush } = setup();
      const { windowId } = manager.handleDetach(eventOf("cluster-prod"), logsRequest("cluster-prod"));

      startWindow(windowId);
      await flush();

      expect(streams[0].clusterId).toBe("cluster-prod");
      expect(streams[0].params).toEqual({ namespace: "shop", pod: "api-0", container: "api", tailLines: 500, previous: false, timestamps: false });
    });
  });

  describe("log stream lifecycle", () => {
    it("pushes complete lines only, keeps partial lines buffered and reports the end", async () => {
      const { manager, streams, sent, startWindow, flush } = setup();
      const { windowId } = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));

      startWindow(windowId);
      await flush();
      streams[0].stream.emit("data", Buffer.from("one\ntw"));
      streams[0].stream.emit("data", "o\nthree");
      streams[0].stream.emit("end");

      const lines = sent.filter(entry => entry.payload.type === "log-lines").flatMap(entry => entry.payload.lines);

      expect(lines).toEqual(["one", "two", "three"]);
      expect(sent.map(entry => entry.payload).filter(payload => payload.type === "status").map(payload => payload.status)).toEqual(["connecting", "live", "ended"]);
    });

    it("aborts the stream and notifies the dock when the window closes (OS close, redock or crash share this path)", async () => {
      const { manager, streams, notices, closeWindow, startWindow, flush } = setup();
      const { windowId } = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));

      startWindow(windowId);
      await flush();
      closeWindow(windowId);

      expect(streams[0].signal.aborted).toBe(true);
      expect(manager.activeStreamCount).toBe(0);
      expect(notices).toEqual([{ clusterId: "cluster-dev", notice: { clusterId: "cluster-dev", workspaceId: "default", tabId: "tab-1", toolKind: "logs" }}]);

      // data arriving after the abort is dropped
      streams[0].stream.emit("data", "late\n");
    });

    it("a stream that fails after the window closed is ignored", async () => {
      let rejectOpen: (error: Error) => void = () => undefined;
      const { manager, closeWindow, startWindow, sent, flush } = setup({
        openLogStream: () => new Promise((_resolve, reject) => { rejectOpen = reject; }),
      });
      const { windowId } = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));

      startWindow(windowId);
      closeWindow(windowId);
      rejectOpen(new Error("aborted"));
      await flush();

      expect(sent.some(entry => entry.payload.type === "error")).toBe(false);
    });

    it("app quit aborts every stream", async () => {
      const { manager, streams, startWindow, flush } = setup();
      const dev = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));
      const prod = manager.handleDetach(eventOf("cluster-prod"), logsRequest("cluster-prod"));

      startWindow(dev.windowId);
      startWindow(prod.windowId);
      await flush();
      manager.disposeAll();

      expect(streams.every(entry => entry.signal.aborted)).toBe(true);
      expect(manager.activeStreamCount).toBe(0);
    });
  });

  describe("frame reload: Main is the source of truth", () => {
    it("lists only the tabs owned by the SENDER's cluster, derived from the sender frame", () => {
      const { manager } = setup();

      manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));
      manager.handleDetach(eventOf("cluster-prod"), logsRequest("cluster-prod", { tabId: "tab-p" }));

      expect(manager.handleFrameListDetached(eventOf("cluster-dev"))).toEqual({ tabs: [{ workspaceId: "default", tabId: "tab-1", toolKind: "logs" }] });
      expect(manager.handleFrameListDetached(eventOf("cluster-prod")).tabs.map(tab => tab.tabId)).toEqual(["tab-p"]);
    });

    it("rejects unknown frames and payloads, and forgets a tab once its window is closed", () => {
      const { manager, closeWindow } = setup();
      const { windowId } = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));

      expect(() => manager.handleFrameListDetached({ frameId: 1, processId: 1 } as any)).toThrow();
      expect(() => manager.handleFrameListDetached(eventOf("cluster-dev"), { clusterId: "cluster-prod" })).toThrow();
      closeWindow(windowId);
      expect(manager.handleFrameListDetached(eventOf("cluster-dev"))).toEqual({ tabs: [] });
    });

    it("a re-detach of a tab Main already owns (stale frame) focuses the owner instead of streaming twice", () => {
      const { manager, deps } = setup();
      const first = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));

      expect(manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"))).toEqual({ windowId: first.windowId, reused: true });
      expect(deps.openWindow).toHaveBeenCalledTimes(2);
    });
  });

  describe("redock", () => {
    it("redock from the dock placeholder closes the owner window, aborts its stream and notifies only the originating cluster frame", async () => {
      const { manager, streams, notices, startWindow, registry, flush } = setup();
      const dev = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));
      const prod = manager.handleDetach(eventOf("cluster-prod"), logsRequest("cluster-prod"));

      startWindow(dev.windowId);
      startWindow(prod.windowId);
      await flush();

      const result = manager.handleFrameRedock(eventOf("cluster-dev"), { clusterId: "cluster-dev", workspaceId: "default", tabId: "tab-1", toolKind: "logs" });

      expect(result).toEqual({ accepted: true });
      expect(registry.get(dev.windowId)).toBeUndefined();
      expect(registry.get(prod.windowId)).toBeDefined();
      expect(streams.find(entry => entry.clusterId === "cluster-dev")?.signal.aborted).toBe(true);
      expect(streams.find(entry => entry.clusterId === "cluster-prod")?.signal.aborted).toBe(false);
      expect(notices.map(entry => entry.clusterId)).toEqual(["cluster-dev"]);
    });

    it("a frame cannot redock another cluster's tab", () => {
      const { manager, registry } = setup();
      const prod = manager.handleDetach(eventOf("cluster-prod"), logsRequest("cluster-prod"));

      expect(() => manager.handleFrameRedock(eventOf("cluster-dev"), { clusterId: "cluster-prod", workspaceId: "default", tabId: "tab-1", toolKind: "logs" })).toThrow("Cluster context mismatch");
      expect(() => manager.handleFrameRedock({ frameId: 1, processId: 1 } as any, { clusterId: "cluster-prod", workspaceId: "default", tabId: "tab-1", toolKind: "logs" })).toThrow("registered cluster frame");
      expect(registry.get(prod.windowId)).toBeDefined();
    });

    it("redock of a tab nobody owns is a no-op", () => {
      const { manager, notices } = setup();

      expect(manager.handleFrameRedock(eventOf("cluster-dev"), { clusterId: "cluster-dev", workspaceId: "default", tabId: "tab-1", toolKind: "logs" })).toEqual({ accepted: false });
      expect(notices).toEqual([]);
    });
  });

  describe("DEV / PROD homonym isolation", () => {
    it("two clusters with the same name keep separate windows, identity, streams and notices", async () => {
      const { manager, registry, streams, notices, closeWindow, startWindow, flush } = setup();
      const dev = manager.handleDetach(eventOf("cluster-dev"), logsRequest("cluster-dev"));
      const prod = manager.handleDetach(eventOf("cluster-prod"), logsRequest("cluster-prod"));

      expect(dev.windowId).not.toBe(prod.windowId);
      expect(prod.reused).toBe(false);
      expect(registry.get(dev.windowId)?.descriptor).toMatchObject({ clusterId: "cluster-dev", environment: "development", isProduction: false });
      expect(registry.get(prod.windowId)?.descriptor).toMatchObject({ clusterId: "cluster-prod", environment: "production", isProduction: true });

      startWindow(dev.windowId);
      startWindow(prod.windowId);
      await flush();
      expect(streams.map(entry => entry.clusterId).sort()).toEqual(["cluster-dev", "cluster-prod"]);

      closeWindow(prod.windowId);

      expect(notices.map(entry => entry.clusterId)).toEqual(["cluster-prod"]);
      expect(streams.find(entry => entry.clusterId === "cluster-dev")?.signal.aborted).toBe(false);
    });

    it("a renderer cannot downgrade a PROD cluster: environment comes from Main", () => {
      const { manager, registry } = setup();
      const { windowId } = manager.handleDetach(eventOf("cluster-prod"), logsRequest("cluster-prod"));

      expect(registry.get(windowId)?.descriptor.isProduction).toBe(true);
      expect(registry.get(windowId)?.descriptor.title).toContain("shop");
    });
  });

  describe("resource inspector", () => {
    const deployment = (uid: string, extra: Record<string, unknown> = {}) => ({ apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "api", namespace: "shop", uid, managedFields: [{}] }, ...extra });
    const discovery = { resources: [{ name: "deployments/status", kind: "Deployment", namespaced: true }, { name: "deployments", kind: "Deployment", namespaced: true }] };

    it("shows the object when the uid matches and strips managedFields", async () => {
      const getJson = jest.fn(async (_cluster: string, path: string) => (path === "/apis/apps/v1" ? discovery : deployment("aaaa-1111")));
      const { manager, sent, startWindow, flush } = setup({ getJson });
      const { windowId } = manager.handleDetach(eventOf("cluster-dev"), inspectorRequest("cluster-dev"));

      startWindow(windowId);
      await flush();

      expect(getJson.mock.calls.map(call => call[1])).toEqual(["/apis/apps/v1", "/apis/apps/v1/namespaces/shop/deployments/api"]);
      const shown = sent.find(entry => entry.payload.type === "inspector")?.payload.object;

      expect(shown.metadata.uid).toBe("aaaa-1111");
      expect(shown.metadata.managedFields).toBeUndefined();
    });

    it("uid mismatch shows an error and no data", async () => {
      const getJson = jest.fn(async (_cluster: string, path: string) => (path === "/apis/apps/v1" ? discovery : deployment("bbbb-2222")));
      const { manager, sent, startWindow, flush } = setup({ getJson });
      const { windowId } = manager.handleDetach(eventOf("cluster-dev"), inspectorRequest("cluster-dev"));

      startWindow(windowId);
      await flush();

      expect(sent.some(entry => entry.payload.type === "inspector")).toBe(false);
      expect(sent.find(entry => entry.payload.type === "error")?.payload.message).toContain("uid mismatch");
    });

    it("never returns Secret values", async () => {
      const secret = { apiVersion: "v1", kind: "Secret", metadata: { name: "api", namespace: "shop", uid: "aaaa-1111", annotations: { "kubectl.kubernetes.io/last-applied-configuration": "{\"data\":\"c2VjcmV0\"}", keep: "me" }}, data: { password: "c2VjcmV0" }};
      const getJson = jest.fn(async (_cluster: string, path: string) => (path === "/api/v1" ? { resources: [{ name: "secrets", kind: "Secret", namespaced: true }] } : secret));
      const { manager, sent, startWindow, flush } = setup({ getJson });
      const request = inspectorRequest("cluster-dev");

      request.resource = { apiVersion: "v1", kind: "Secret", namespace: "shop", name: "api", uid: "aaaa-1111" };
      const { windowId } = manager.handleDetach(eventOf("cluster-dev"), request);

      startWindow(windowId);
      await flush();

      const shown = JSON.stringify(sent.find(entry => entry.payload.type === "inspector")?.payload.object);

      expect(shown).not.toContain("c2VjcmV0");
      expect(shown).toContain("<redacted>");
      expect(shown).toContain("me");
    });

    it("throttles on-demand refresh and is read-only (GET paths only)", async () => {
      const getJson = jest.fn(async (_cluster: string, path: string) => (path === "/apis/apps/v1" ? discovery : deployment("aaaa-1111")));
      const { manager, startWindow, refreshWindow, advance, flush } = setup({ getJson });
      const { windowId } = manager.handleDetach(eventOf("cluster-dev"), inspectorRequest("cluster-dev"));

      startWindow(windowId);
      await flush();
      refreshWindow(windowId);
      await flush();
      refreshWindow(windowId);
      await flush();
      expect(getJson).toHaveBeenCalledTimes(4);

      advance(MIN_REFRESH_INTERVAL_MS + 1);
      refreshWindow(windowId);
      await flush();
      expect(getJson).toHaveBeenCalledTimes(6);
      expect(manager.activeStreamCount).toBe(1);
    });
  });

  describe("terminal", () => {
    it("is refused: no PTY is moved, no window is opened", () => {
      const { manager, deps } = setup();

      expect(() => manager.handleDetach(eventOf("cluster-prod"), { ...logsRequest("cluster-prod"), toolKind: "terminal" })).toThrow("Unsupported");
      expect(deps.openWindow).not.toHaveBeenCalled();
    });
  });
});
