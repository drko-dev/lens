/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { DetachedWindowRegistry, parseDetachedToolDescriptor, sessionKeyOf } from "../detached-window-registry";

const dev = {
  workspaceId: "default",
  tabId: "tab-dev",
  clusterId: "cluster-dev",
  toolKind: "logs",
  environment: "development",
  isProduction: false,
  title: "DEV api logs",
  resource: { kind: "Pod", namespace: "default", name: "api", uid: "1111-aaaa" },
};
const prod = {
  ...dev,
  tabId: "tab-prod",
  clusterId: "cluster-prod",
  environment: "production",
  isProduction: true,
  title: "PROD api logs",
  resource: { kind: "Pod", namespace: "default", name: "api", uid: "2222-bbbb" },
};

describe("R4-06 detached window registry", () => {
  let registry: DetachedWindowRegistry;

  beforeEach(() => {
    registry = new DetachedWindowRegistry(3, () => 1000);
  });

  describe("descriptor validation", () => {
    it("returns a deeply frozen copy that keeps cluster, environment, resource and UID", () => {
      const descriptor = parseDetachedToolDescriptor(prod);

      expect(descriptor).toEqual(prod);
      expect(descriptor).not.toBe(prod);
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(Object.isFrozen(descriptor.resource)).toBe(true);
    });

    it.each([
      ["unknown field", { ...dev, command: "rm -rf /" }],
      ["token field", { ...dev, token: "secret" }],
      ["unknown resource field", { ...dev, resource: { ...dev.resource, data: "x" }}],
      ["unsafe cluster id", { ...dev, clusterId: "../prod" }],
      ["unknown tool", { ...dev, toolKind: "shell" }],
      ["PROD environment flagged as non-production", { ...prod, isProduction: false }],
      ["non-production environment flagged as PROD", { ...dev, isProduction: true }],
      ["missing environment", { ...dev, environment: undefined }],
      ["logs without resource", { ...dev, resource: undefined }],
      ["invalid resource name", { ...dev, resource: { kind: "Pod", name: "API!" }}],
      ["array input", [dev]],
      ["prototype-polluted input", Object.assign(Object.create({ isAdmin: true }), dev)],
    ])("rejects %s", (_label, input) => {
      expect(() => parseDetachedToolDescriptor(input)).toThrow();
    });

    it("accepts a terminal descriptor without a resource", () => {
      expect(parseDetachedToolDescriptor({ ...dev, toolKind: "terminal", resource: undefined }).toolKind).toBe("terminal");
    });
  });

  describe("ownership", () => {
    it("keeps homonymous DEV and PROD resources as different sessions", () => {
      const devRecord = registry.register(11, parseDetachedToolDescriptor(dev));
      const prodRecord = registry.register(12, parseDetachedToolDescriptor(prod));

      expect(devRecord.sessionKey).not.toBe(prodRecord.sessionKey);
      expect(registry.windowsForCluster("cluster-prod").map(record => record.windowId)).toEqual([12]);
    });

    it("refuses a second window for the same session and points to the owner", () => {
      const descriptor = parseDetachedToolDescriptor(dev);

      registry.register(11, descriptor);

      expect(() => registry.register(12, descriptor)).toThrow("already detached");
      expect(registry.findOwner(descriptor)?.windowId).toBe(11);
    });

    it("never lets a window change its identity", () => {
      registry.register(11, parseDetachedToolDescriptor(dev));

      expect(() => registry.register(11, parseDetachedToolDescriptor(prod))).toThrow("immutable");
      expect(registry.get(11)?.descriptor.clusterId).toBe("cluster-dev");
    });

    it("enforces the window limit and rejects invalid window ids", () => {
      registry.register(1, parseDetachedToolDescriptor(dev));
      registry.register(2, parseDetachedToolDescriptor(prod));
      registry.register(3, parseDetachedToolDescriptor({ ...dev, toolKind: "inspector" }));

      expect(() => registry.register(4, parseDetachedToolDescriptor({ ...prod, toolKind: "inspector" }))).toThrow("limit");
      expect(() => new DetachedWindowRegistry().register(0, parseDetachedToolDescriptor(dev))).toThrow("Invalid window id");
    });
  });

  describe("authorization", () => {
    beforeEach(() => {
      registry.register(11, parseDetachedToolDescriptor(dev));
    });

    it("authorizes the registered window with its own identity", () => {
      expect(registry.authorize(11, { workspaceId: "default", tabId: "tab-dev", clusterId: "cluster-dev" }).windowId).toBe(11);
    });

    it("rejects unknown windows and forged cluster/tab/workspace identities", () => {
      expect(() => registry.authorize(99)).toThrow("Unknown");
      expect(() => registry.authorize(11, { clusterId: "cluster-prod" })).toThrow("clusterId");
      expect(() => registry.authorize(11, { tabId: "tab-prod" })).toThrow("tabId");
      expect(() => registry.authorize(11, { workspaceId: "workspace-2" })).toThrow("workspaceId");
    });
  });

  describe("lifecycle", () => {
    it("releases ownership on close so the session can be detached again", () => {
      const descriptor = parseDetachedToolDescriptor(dev);

      registry.register(11, descriptor);
      expect(registry.release(11)?.sessionKey).toBe(sessionKeyOf(descriptor));
      expect(registry.release(11)).toBeUndefined();
      expect(registry.findOwner(descriptor)).toBeUndefined();
      expect(registry.register(12, descriptor).windowId).toBe(12);
    });

    it("drops stale records left by crashed windows without touching live ones", () => {
      registry.register(11, parseDetachedToolDescriptor(dev));
      registry.register(12, parseDetachedToolDescriptor(prod));

      expect(registry.releaseStale(id => id === 12).map(record => record.windowId)).toEqual([11]);
      expect(registry.size).toBe(1);
      expect(() => registry.authorize(11)).toThrow("Unknown");
    });
  });
});
