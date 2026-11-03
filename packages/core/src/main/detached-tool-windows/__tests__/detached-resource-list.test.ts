/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { EventEmitter } from "events";
import type { IpcMainInvokeEvent } from "electron";
import { DetachedToolSessionManager } from "../detached-tool-session-manager";
import type { DetachedToolSessionManagerDependencies, DetachedToolCluster } from "../detached-tool-session-manager";
import type { DetachedWindowRecord } from "../detached-window-registry";
import { DetachedWindowRegistry, parseDetachedToolDescriptor } from "../detached-window-registry";
import type { DetachedToolWindowHooks } from "../open-detached-tool-window.injectable";

const clusters: Record<string, DetachedToolCluster> = {
  "cluster-dev": { id: "cluster-dev", name: "shop", preferences: { clusterEnvironment: "development", clusterColor: "#14B8A6" } as any },
  "cluster-prod": { id: "cluster-prod", name: "pay", preferences: { clusterEnvironment: "production" } as any },
};
const frames = new Map([
  ["cluster-dev", { frameId: 11, processId: 100 }],
  ["cluster-prod", { frameId: 22, processId: 200 }],
]);
const eventOf = (clusterId: string) => ({ ...frames.get(clusterId) }) as unknown as IpcMainInvokeEvent;
const listRequest = (clusterId: string, list: Record<string, unknown> = { kind: "Pod", namespace: "shop" }, extra: Record<string, unknown> = {}) => ({
  clusterId, workspaceId: "global-docking", tabId: "pods", toolKind: "resource-list", list, ...extra,
});

class FakeStream extends EventEmitter {
  destroy = jest.fn();
}

const pod = (name: string, phase = "Running", ready = [true]) => ({
  metadata: { name, namespace: "shop", uid: `uid-${name}`, creationTimestamp: "2026-11-02T00:00:00Z", annotations: { secret: "x" }},
  spec: { containers: [{ name: "c", env: [{ name: "TOKEN", value: "do-not-leak" }] }] },
  status: { phase, containerStatuses: ready.map((r) => ({ ready: r })) },
});

function setup(overrides: Partial<DetachedToolSessionManagerDependencies> = {}) {
  const registry = new DetachedWindowRegistry();
  const hooks = new Map<number, DetachedToolWindowHooks>();
  const sent: { windowId: number; payload: any }[] = [];
  const notices: { clusterId: string; notice: any }[] = [];
  const watches: { clusterId: string; path: string; signal: AbortSignal; stream: FakeStream }[] = [];
  let nextWindowId = 1;
  const closeWindow = jest.fn((windowId: number) => {
    const record = registry.release(windowId);

    if (record) hooks.get(windowId)?.onClosed?.(record);
  });
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
    openLogStream: jest.fn(),
    openApiStream: jest.fn(async (clusterId: string, path: string, signal: AbortSignal) => {
      const stream = new FakeStream();

      watches.push({ clusterId, path, signal, stream });

      return stream;
    }),
    getJson: jest.fn(async () => ({ metadata: { resourceVersion: "7" }, items: [pod("api-0"), pod("api-1", "Pending", [false])] })),
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  };
  const manager = new DetachedToolSessionManager(deps);
  const startWindow = (windowId: number) => hooks.get(windowId)?.onStart?.(registry.get(windowId) as DetachedWindowRecord);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const rows = () => sent.filter(s => s.payload.type === "rows").map(s => s.payload).pop();

  return { manager, deps, registry, sent, notices, watches, closeWindow, startWindow, flush, rows };
}

describe("H7.5 detached resource-list windows", () => {
  it("opens a read-only list window whose identity comes from Main, not from the frame", () => {
    const { manager, registry } = setup();

    expect(manager.handleDetach(eventOf("cluster-dev"), listRequest("cluster-dev"))).toEqual({ windowId: 1, reused: false });

    expect(registry.get(1)?.descriptor).toEqual({
      workspaceId: "global-docking",
      tabId: "pods",
      clusterId: "cluster-dev",
      toolKind: "resource-list",
      environment: "development",
      isProduction: false,
      title: "shop · Pods",
      accent: "#14B8A6",
      list: { kind: "Pod", namespace: "shop" },
    });
  });

  it("marks a production cluster's window as production", () => {
    const { manager, registry } = setup();

    manager.handleDetach(eventOf("cluster-prod"), listRequest("cluster-prod", { kind: "Deployment" }, { tabId: "deployments" }));

    expect(registry.get(1)?.descriptor).toMatchObject({ isProduction: true, environment: "production", title: "pay · Deployments", list: { kind: "Deployment" }});
    expect(registry.get(1)?.descriptor.accent).toBeUndefined();
  });

  it("focuses the existing window instead of opening a second one (idempotent detach)", () => {
    const { manager, deps } = setup();

    manager.handleDetach(eventOf("cluster-dev"), listRequest("cluster-dev"));

    expect(manager.handleDetach(eventOf("cluster-dev"), listRequest("cluster-dev"))).toEqual({ windowId: 1, reused: true });
    expect(deps.openWindow).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["another cluster than the sending frame", eventOf("cluster-dev"), listRequest("cluster-prod")],
    ["unsupported kind", eventOf("cluster-dev"), listRequest("cluster-dev", { kind: "Secret" })],
    ["namespace injection", eventOf("cluster-dev"), listRequest("cluster-dev", { kind: "Pod", namespace: "../kube-system" })],
    ["extra list key", eventOf("cluster-dev"), listRequest("cluster-dev", { kind: "Pod", path: "/api/v1/secrets" })],
    ["resource on a list", eventOf("cluster-dev"), listRequest("cluster-dev", undefined, { resource: { kind: "Pod", name: "x" }})],
    ["logs on a list", eventOf("cluster-dev"), listRequest("cluster-dev", undefined, { logs: { container: "c", tailLines: 1, previous: false, timestamps: false }})],
    ["list without kind", eventOf("cluster-dev"), listRequest("cluster-dev", {})],
  ])("rejects %s", (_name, event, payload) => {
    const { manager, deps } = setup();

    expect(() => manager.handleDetach(event, payload)).toThrow();
    expect(deps.openWindow).not.toHaveBeenCalled();
  });

  it("lists, projects only display fields and keeps the rows live through a watch", async () => {
    const { manager, deps, watches, startWindow, flush, rows, sent } = setup();

    manager.handleDetach(eventOf("cluster-dev"), listRequest("cluster-dev"));
    startWindow(1);
    await flush();

    expect(deps.getJson).toHaveBeenCalledWith("cluster-dev", "/api/v1/namespaces/shop/pods", expect.any(Object));
    expect(rows()).toEqual({
      type: "rows",
      kind: "Pod",
      rows: [
        { name: "api-0", namespace: "shop", status: "Running", ready: "1/1", createdAt: "2026-11-02T00:00:00Z" },
        { name: "api-1", namespace: "shop", status: "Pending", ready: "0/1", createdAt: "2026-11-02T00:00:00Z" },
      ],
    });
    expect(JSON.stringify(sent)).not.toContain("do-not-leak");
    expect(watches.map(w => w.path)).toEqual(["/api/v1/namespaces/shop/pods?watch=1&resourceVersion=7&allowWatchBookmarks=false"]);

    watches[0].stream.emit("data", `${JSON.stringify({ type: "ADDED", object: pod("api-2") })}\n${JSON.stringify({ type: "DELETED", object: pod("api-0") })}\n`);
    watches[0].stream.emit("data", JSON.stringify({ type: "MODIFIED", object: pod("api-1", "Running", [true]) }));
    watches[0].stream.emit("data", "\n");
    await flush();

    expect(rows().rows.map((r: any) => `${r.name}:${r.status}:${r.ready}`)).toEqual(["api-1:Running:1/1", "api-2:Running:1/1"]);
  });

  it("projects deployments cluster-wide when no namespace was selected", async () => {
    const deployment = {
      metadata: { name: "web", namespace: "shop", creationTimestamp: "2026-11-02T00:00:00Z" },
      spec: { replicas: 3, template: { spec: { containers: [] }}},
      status: { readyReplicas: 2, updatedReplicas: 3, availableReplicas: 2 },
    };
    const { manager, deps, startWindow, flush, rows } = setup({ getJson: jest.fn(async () => ({ metadata: { resourceVersion: "3" }, items: [deployment] })) });

    manager.handleDetach(eventOf("cluster-dev"), listRequest("cluster-dev", { kind: "Deployment" }, { tabId: "deployments" }));
    startWindow(1);
    await flush();

    expect(deps.getJson).toHaveBeenCalledWith("cluster-dev", "/apis/apps/v1/deployments", expect.any(Object));
    expect(rows().rows).toEqual([{ name: "web", namespace: "shop", status: "2 available", ready: "2/3", createdAt: "2026-11-02T00:00:00Z" }]);
  });

  it("closing the window aborts the watch and tells only the origin frame to redock", async () => {
    const { manager, watches, startWindow, flush, closeWindow, notices } = setup();

    manager.handleDetach(eventOf("cluster-dev"), listRequest("cluster-dev"));
    startWindow(1);
    await flush();
    closeWindow(1);

    expect(watches[0].signal.aborted).toBe(true);
    expect(watches[0].stream.destroy).toHaveBeenCalled();
    expect(manager.activeStreamCount).toBe(0);
    expect(notices).toEqual([{ clusterId: "cluster-dev", notice: { clusterId: "cluster-dev", workspaceId: "global-docking", tabId: "pods", toolKind: "resource-list" }}]);
  });

  it("accepts a frame redock for a list window of its own cluster only", () => {
    const { manager, closeWindow } = setup();

    manager.handleDetach(eventOf("cluster-dev"), listRequest("cluster-dev"));

    expect(() => manager.handleFrameRedock(eventOf("cluster-prod"), { clusterId: "cluster-dev", workspaceId: "global-docking", tabId: "pods", toolKind: "resource-list" })).toThrow();
    expect(manager.handleFrameRedock(eventOf("cluster-dev"), { clusterId: "cluster-dev", workspaceId: "global-docking", tabId: "pods", toolKind: "resource-list" })).toEqual({ accepted: true });
    expect(closeWindow).toHaveBeenCalledWith(1);
  });

  it("closes the list windows of a cluster whose frame went away, and nothing else", () => {
    const { manager, registry, closeWindow } = setup();

    manager.handleDetach(eventOf("cluster-dev"), listRequest("cluster-dev"));
    manager.handleDetach(eventOf("cluster-prod"), listRequest("cluster-prod"));
    manager.closeListWindowsOfCluster("cluster-dev");

    expect(closeWindow).toHaveBeenCalledTimes(1);
    expect(registry.windowsForCluster("cluster-dev")).toEqual([]);
    expect(registry.windowsForCluster("cluster-prod")).toHaveLength(1);
  });

  it("does not pile up abort listeners while it keeps reconnecting (list allowed, watch refused)", async () => {
    jest.useFakeTimers();

    try {
      const added: string[] = [];
      const removed: string[] = [];
      const { manager, startWindow, closeWindow } = setup({
        openApiStream: jest.fn(async (_clusterId: string, _path: string, signal: AbortSignal) => {
          if (!added.length) {
            const add = signal.addEventListener.bind(signal);
            const remove = signal.removeEventListener.bind(signal);

            signal.addEventListener = ((type: string, listener: any, options?: any) => { added.push(type); add(type, listener, options); }) as any;
            signal.removeEventListener = ((type: string, listener: any, options?: any) => { removed.push(type); remove(type, listener, options); }) as any;
          }
          throw new Error("Failed to open Kubernetes stream: 403 Forbidden");
        }),
      });

      manager.handleDetach(eventOf("cluster-dev"), listRequest("cluster-dev"));
      startWindow(1);

      const settle = async () => { for (let k = 0; k < 20; k++) await Promise.resolve(); };

      for (let i = 0; i < 20; i++) {
        await settle();
        jest.advanceTimersByTime(2_100);
      }
      await settle();
      expect(added.length).toBeGreaterThan(10); // the loop really kept reconnecting

      expect(added.length - removed.length).toBeLessThanOrEqual(1);
      closeWindow(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
