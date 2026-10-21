/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { registerSecurePilotIpcHandlers, SYNTHETIC_CLUSTERS } from "../secure-pilot-ipc-handlers";

const handlers = new Map<string, (...args: any[]) => any>();

function getHandler(channel: string): (...args: any[]) => any {
  const handler = handlers.get(channel);

  if (!handler) {
    throw new Error(`Missing IPC handler: ${channel}`);
  }

  return handler;
}

jest.mock("electron", () => ({
  app: { isPackaged: true },
  ipcMain: {
    handle: jest.fn((channel: string, listener: (...args: any[]) => any) => handlers.set(channel, listener)),
    removeHandler: jest.fn((channel: string) => handlers.delete(channel)),
  },
}));

describe("R4-01B isolated pilot IPC", () => {
  const htmlPath = "/app/static/secure-pilot.html";
  let cleanup: () => void;
  let browserWindow: any;
  let event: any;

  beforeEach(() => {
    handlers.clear();
    const frame = { url: "file:///app/static/secure-pilot.html" };
    const webContents = { id: 42, mainFrame: frame };

    browserWindow = { webContents, isDestroyed: () => false };
    event = { sender: webContents, senderFrame: frame };
    cleanup = registerSecurePilotIpcHandlers(browserWindow, htmlPath);
  });

  afterEach(() => cleanup());

  it("registers only the fixed read-only pilot channels", () => {
    expect([...handlers.keys()]).toEqual([
      "secure-pilot:get-info",
      "secure-pilot:list-clusters",
      "secure-pilot:query-resource",
    ]);
  });

  it("validates both the sender WebContents and the exact packaged local document", async () => {
    const handler = getHandler("secure-pilot:get-info");
    const info = await handler(event);

    expect(info.version).toBe("R4-01-PILOT");
    expect(info.isPackaged).toBe(true);
    expect(info.isIsolated).toBe(true);
    expect(info.nodeIntegration).toBe(false);
    expect(info.sandbox).toBe(true);
    expect(info.senderUrl).toBeUndefined();

    await expect(handler({ ...event, sender: { id: 42 }})).rejects.toThrow(/Unauthorized IPC sender/);
    await expect(handler({ ...event, senderFrame: { url: "https://attacker.invalid/" }})).rejects.toThrow(/Unauthorized IPC sender/);
    await expect(handler({ ...event, senderFrame: { url: "file:///app/static/other.html" }})).rejects.toThrow(/Unauthorized IPC sender/);
    await expect(handler({ ...event, senderFrame: null })).rejects.toThrow(/Unauthorized IPC sender/);
  });

  it("lists only immutable synthetic DEV and PROD contexts", async () => {
    const clusters = await getHandler("secure-pilot:list-clusters")(event);

    expect(clusters).toHaveLength(2);
    expect(clusters.find((cluster: any) => cluster.id === "cluster-dev-01").isProduction).toBe(false);
    expect(clusters.find((cluster: any) => cluster.id === "cluster-prod-99").isProduction).toBe(true);
    expect(Object.isFrozen(SYNTHETIC_CLUSTERS["cluster-dev-01"])).toBe(true);
    expect(Object.isFrozen(SYNTHETIC_CLUSTERS["cluster-prod-99"].pods)).toBe(true);
  });

  it.each([
    ["pilot-tab-dev", "cluster-dev-01", false, "192.0.2.10"],
    ["pilot-tab-prod", "cluster-prod-99", true, "192.0.2.99"],
  ])("keeps identical namespace/resource names bound to %s", async (tabId, clusterId, isProduction, podIP) => {
    const response = await getHandler("secure-pilot:query-resource")(event, {
      tabId,
      namespace: "default",
      kind: "Pod",
      name: "api",
    });

    expect(response.source).toBe("synthetic-fixture");
    expect(response.resourceKey).toContain(clusterId);
    expect(response.cluster.id).toBe(clusterId);
    expect(response.cluster.isProduction).toBe(isProduction);
    expect(response.resource.status.podIP).toBe(podIP);
  });

  it("rejects forged cluster IDs, retargeted tab queries, malformed arguments, and untrusted frames", async () => {
    const handler = getHandler("secure-pilot:query-resource");
    const validQuery = { tabId: "pilot-tab-dev", namespace: "default", kind: "Pod", name: "api" };

    await expect(handler(event, { ...validQuery, clusterId: "cluster-prod-99" })).rejects.toThrow(/Invalid synthetic resource query/);
    await expect(handler(event, { ...validQuery, tabId: "cluster-prod-99" })).rejects.toThrow(/Unauthorized synthetic resource query/);
    await expect(handler(event, { ...validQuery, namespace: "kube-system" })).rejects.toThrow(/does not match its immutable tab context/);
    await expect(handler(event, { ...validQuery, name: "payments" })).rejects.toThrow(/does not match its immutable tab context/);
    await expect(handler({ ...event, senderFrame: { url: "file:///app/static/secure-pilot.html", parent: {}}}, validQuery))
      .rejects.toThrow(/Unauthorized IPC sender/);
  });

  it("removes registered handlers when the pilot window closes", () => {
    cleanup();
    expect(handlers.size).toBe(0);
  });
});
