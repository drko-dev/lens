/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { PortForwardStore } from "../port-forward-store/port-forward-store";
import { PortForwardItem, portForwardsEqual } from "../port-forward-item";
import type { ForwardedPort } from "../port-forward-item";

describe("PortForwardItem & Equality Contracts", () => {
  it("formats getId() with clusterId prefix when present", () => {
    const item = new PortForwardItem({
      clusterId: "c-prod-456",
      namespace: "production",
      kind: "service",
      name: "api-gateway",
      port: 8080,
      forwardPort: 8080,
    });

    expect(item.getId()).toBe("c-prod-456:production-service-api-gateway:8080");
  });

  it("formats getId() without prefix when clusterId is missing (legacy)", () => {
    const item = new PortForwardItem({
      namespace: "default",
      kind: "pod",
      name: "web-0",
      port: 80,
      forwardPort: 8080,
    });

    expect(item.getId()).toBe("default-pod-web-0:80");
  });

  it("defaults status to Disabled (No-Auto-Start contract)", () => {
    const item = new PortForwardItem({
      namespace: "default",
      kind: "service",
      name: "api",
      port: 8080,
      forwardPort: 8080,
    });

    expect(item.getStatus()).toBe("Disabled");
  });

  it("portForwardsEqual differentiates DEV and PROD resources with identical names", () => {
    const devPort: ForwardedPort = {
      clusterId: "cluster-dev-1",
      namespace: "default",
      kind: "service",
      name: "redis",
      port: 6379,
      forwardPort: 6379,
    };

    const prodPort: ForwardedPort = {
      clusterId: "cluster-prod-1",
      namespace: "default",
      kind: "service",
      name: "redis",
      port: 6379,
      forwardPort: 6379,
    };

    expect(portForwardsEqual(devPort, prodPort)).toBe(false);
  });

  it("portForwardsEqual matches identical ports in the same cluster", () => {
    const portA: ForwardedPort = {
      clusterId: "cluster-dev-1",
      namespace: "default",
      kind: "service",
      name: "redis",
      port: 6379,
      forwardPort: 6379,
    };

    const portB: ForwardedPort = {
      clusterId: "cluster-dev-1",
      namespace: "default",
      kind: "service",
      name: "redis",
      port: 6379,
      forwardPort: 16379, // forwardPort difference does not change equality
    };

    expect(portForwardsEqual(portA, portB)).toBe(true);
  });
});

describe("PortForwardStore — Multi-Cluster Security & No-Auto-Start", () => {
  let mockStorage: any;
  let mockApiBase: any;
  let mockLogger: any;
  let mockNotifyError: jest.Mock;
  let mockRequestActive: jest.Mock;

  beforeEach(() => {
    mockStorage = {
      data: undefined as ForwardedPort[] | undefined,
      get: jest.fn(() => mockStorage.data),
      set: jest.fn((val) => { mockStorage.data = val; }),
    };

    mockApiBase = {
      post: jest.fn().mockResolvedValue({ port: 9090 }),
      del: jest.fn().mockResolvedValue({ status: true }),
    };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    mockNotifyError = jest.fn();
    mockRequestActive = jest.fn();
  });

  it("restores saved port-forwards strictly in 'Disabled' state with ZERO network requests", async () => {
    // Storage contains a forward that was previously active or missing status
    mockStorage.data = [
      {
        clusterId: "cluster-dev",
        kind: "service",
        namespace: "default",
        name: "api",
        port: 8080,
        forwardPort: 8080,
        status: "Active", // legacy active state
      },
      {
        clusterId: "cluster-dev",
        kind: "service",
        namespace: "default",
        name: "db",
        port: 5432,
        forwardPort: 5432,
        // status undefined
      },
    ];

    const store = new PortForwardStore({
      storage: mockStorage,
      apiBase: mockApiBase,
      logger: mockLogger,
      hostedCluster: { id: "cluster-dev", preferences: { clusterTheme: "dev" }} as any,
      notifyErrorPortForwarding: mockNotifyError,
      requestActivePortForward: mockRequestActive,
    });

    const items = store.getPortForwards();

    expect(items.length).toBe(2);

    // All restored items MUST be Disabled
    expect(items[0].status).toBe("Disabled");
    expect(items[1].status).toBe("Disabled");

    // ZERO POST requests should have been made during restore
    expect(mockApiBase.post).not.toHaveBeenCalled();
    expect(mockApiBase.del).not.toHaveBeenCalled();
    expect(mockNotifyError).not.toHaveBeenCalled();
  });

  it("isolates identically named resources across DEV and PROD clusters", async () => {
    const store = new PortForwardStore({
      storage: mockStorage,
      apiBase: mockApiBase,
      logger: mockLogger,
      hostedCluster: { id: "cluster-dev", preferences: { clusterTheme: "dev" }} as any,
      notifyErrorPortForwarding: mockNotifyError,
      requestActivePortForward: mockRequestActive,
    });

    // Add DEV forward
    await store.add({
      clusterId: "cluster-dev",
      kind: "service",
      namespace: "default",
      name: "api-service",
      port: 80,
      forwardPort: 8081,
      status: "Disabled",
    });

    // Add PROD forward
    await store.add({
      clusterId: "cluster-prod",
      kind: "service",
      namespace: "default",
      name: "api-service",
      port: 80,
      forwardPort: 8082,
      status: "Disabled",
    });

    const items = store.portForwards;

    expect(items.length).toBe(2);
    expect(items[0].getId()).toBe("cluster-dev:default-service-api-service:80");
    expect(items[1].getId()).toBe("cluster-prod:default-service-api-service:80");
  });

  it("blocks starting a port-forward when clusterId mismatches the active cluster frame (fail-closed)", async () => {
    const store = new PortForwardStore({
      storage: mockStorage,
      apiBase: mockApiBase,
      logger: mockLogger,
      hostedCluster: { id: "cluster-dev", preferences: { clusterTheme: "dev" }} as any,
      notifyErrorPortForwarding: mockNotifyError,
      requestActivePortForward: mockRequestActive,
    });

    const prodForward: ForwardedPort = {
      clusterId: "cluster-prod",
      kind: "service",
      namespace: "default",
      name: "payment-api",
      port: 443,
      forwardPort: 9443,
      status: "Disabled",
    };

    store.portForwards.push(new PortForwardItem(prodForward));

    // Attempting to start prodForward inside DEV cluster frame must throw fail-closed
    await expect(store.start(prodForward)).rejects.toThrow(/Cluster context mismatch/);
    expect(mockApiBase.post).not.toHaveBeenCalled();
  });

  it("blocks stopping a port-forward when clusterId mismatches the active cluster frame (fail-closed)", async () => {
    const store = new PortForwardStore({
      storage: mockStorage,
      apiBase: mockApiBase,
      logger: mockLogger,
      hostedCluster: { id: "cluster-dev", preferences: { clusterTheme: "dev" }} as any,
      notifyErrorPortForwarding: mockNotifyError,
      requestActivePortForward: mockRequestActive,
    });

    const prodForward: ForwardedPort = {
      clusterId: "cluster-prod",
      kind: "service",
      namespace: "default",
      name: "payment-api",
      port: 443,
      forwardPort: 9443,
      status: "Active",
    };

    store.portForwards.push(new PortForwardItem(prodForward));

    // Attempting to stop prodForward inside DEV cluster frame must throw fail-closed
    await expect(store.stop(prodForward)).rejects.toThrow(/Cluster context mismatch/);
    expect(mockApiBase.del).not.toHaveBeenCalled();
  });

  it("auto-populates clusterId and environment badge on add()", async () => {
    const store = new PortForwardStore({
      storage: mockStorage,
      apiBase: mockApiBase,
      logger: mockLogger,
      hostedCluster: {
        id: "cluster-prod-secret",
        preferences: {
          clusterEnvironment: "production",
          clusterName: "Production Cluster",
        },
      } as any,
      notifyErrorPortForwarding: mockNotifyError,
      requestActivePortForward: mockRequestActive,
    });

    const added = await store.add({
      kind: "pod",
      namespace: "prod-apps",
      name: "nginx-ingress-0",
      port: 80,
      forwardPort: 8080,
      status: "Disabled",
    });

    expect(added.clusterId).toBe("cluster-prod-secret");
    expect(added.environmentBadge).toBe("⚠️ PROD");
  });
});

describe("PortForwardStore — fail-closed cluster context guard (R4-05)", () => {
  const makeDeps = (hostedCluster: unknown) => ({
    storage: { get: jest.fn(() => undefined), set: jest.fn() },
    apiBase: { post: jest.fn().mockResolvedValue({ port: 9090 }), del: jest.fn().mockResolvedValue({}) },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    hostedCluster: hostedCluster as any,
    notifyErrorPortForwarding: jest.fn(),
    requestActivePortForward: jest.fn(),
  });

  const makeForward = (clusterId: string | undefined, status: ForwardedPort["status"]): ForwardedPort => ({
    clusterId,
    kind: "service",
    namespace: "default",
    name: "payment-api",
    port: 443,
    forwardPort: 0,
    status,
  });

  const rejectedContexts: [string, unknown, string | undefined][] = [
    ["hostedCluster undefined", undefined, "cluster-dev"],
    ["hostedCluster.id empty", { id: "" }, "cluster-dev"],
    ["hostedCluster.id 'unknown'", { id: "unknown" }, "cluster-dev"],
    ["pf.clusterId undefined", { id: "cluster-dev" }, undefined],
    ["pf.clusterId empty", { id: "cluster-dev" }, ""],
    ["pf.clusterId 'unknown'", { id: "cluster-dev" }, "unknown"],
    ["both 'unknown'", { id: "unknown" }, "unknown"],
    ["identities differ", { id: "cluster-dev" }, "cluster-prod"],
  ];

  describe.each(rejectedContexts)("when %s", (_, hostedCluster, clusterId) => {
    it.each([
      ["start", "Disabled"],
      ["stop", "Active"],
    ] as const)("%s() throws before any request or state change", async (operation, status) => {
      const deps = makeDeps(hostedCluster);
      const store = new PortForwardStore(deps as any);
      const forward = makeForward(clusterId, status);

      store.portForwards.push(new PortForwardItem(forward));
      deps.storage.set.mockClear();

      await expect(store[operation](forward)).rejects.toThrow(/Cluster context mismatch/);

      expect(deps.apiBase.post).not.toHaveBeenCalled();
      expect(deps.apiBase.del).not.toHaveBeenCalled();
      expect(deps.requestActivePortForward).not.toHaveBeenCalled();
      expect(deps.storage.set).not.toHaveBeenCalled();
      expect(store.portForwards).toHaveLength(1);
      expect(store.portForwards[0].status).toBe(status);
      expect(deps.logger.error).toHaveBeenCalledWith(expect.stringContaining("[PORT-FORWARD-SECURITY]"));
    });
  });

  describe("when identities match", () => {
    it("start() requests the forward and marks it Active", async () => {
      const deps = makeDeps({ id: "cluster-dev" });
      const store = new PortForwardStore(deps as any);
      const forward = makeForward("cluster-dev", "Disabled");

      store.portForwards.push(new PortForwardItem(forward));

      const result = await store.start(forward);

      expect(deps.apiBase.post).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("Active");
      expect(deps.logger.error).not.toHaveBeenCalled();
    });

    it("stop() requests the stop and marks it Disabled", async () => {
      const deps = makeDeps({ id: "cluster-dev" });
      const store = new PortForwardStore(deps as any);
      const forward = makeForward("cluster-dev", "Active");

      store.portForwards.push(new PortForwardItem(forward));

      await store.stop(forward);

      expect(deps.apiBase.del).toHaveBeenCalledTimes(1);
      expect(store.portForwards[0].status).toBe("Disabled");
      expect(deps.logger.error).not.toHaveBeenCalled();
    });
  });
});
