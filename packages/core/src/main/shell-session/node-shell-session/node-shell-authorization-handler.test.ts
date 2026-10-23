/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IpcMainInvokeEvent } from "electron";
import type { Cluster } from "../../../common/cluster/cluster";
import { isClusterFrameSender } from "../../ipc/is-cluster-frame-sender";
import type { NodeShellAuthorizationBinding } from "./node-shell-auth-registry";
import { NodeShellAuthRegistry, NODE_SHELL_OPEN_OPERATION } from "./node-shell-auth-registry";
import { createNodeShellAuthorizationHandler } from "./node-shell-authorization-handler";

const PORT = 4321;

const frame = (url: string, parent: unknown = {}) => ({
  senderFrame: { url, parent },
  frameId: 7,
  processId: 3,
} as unknown as IpcMainInvokeEvent);

const createCluster = (overrides: Partial<{ id: string; enabled: boolean; environment: string }> = {}): Cluster => ({
  id: overrides.id ?? "cluster-1",
  name: { get: () => overrides.id ?? "cluster-1" },
  preferences: {
    nodeShellEnabled: overrides.enabled ?? true,
    clusterEnvironment: overrides.environment ?? "production",
  },
} as unknown as Cluster);

describe("Node Shell authorization handler", () => {
  let registry: NodeShellAuthRegistry;
  let clusters: Map<string, Cluster>;
  let logger: { warn: jest.Mock; info: jest.Mock; error: jest.Mock };
  let confirmProduction: jest.Mock;
  let verifyNodeExists: jest.Mock;
  let handler: ReturnType<typeof createNodeShellAuthorizationHandler>;
  let grantSequence: number;
  let grantedEvent: IpcMainInvokeEvent;

  beforeEach(() => {
    grantSequence = 0;
    registry = new NodeShellAuthRegistry({
      ttlMs: 60_000,
      generateGrantId: () => `grant-${++grantSequence}`,
    });
    clusters = new Map([["cluster-1", createCluster({ id: "cluster-1" })]]);
    logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() };
    confirmProduction = jest.fn().mockResolvedValue(true);
    verifyNodeExists = jest.fn().mockResolvedValue(true);
    grantedEvent = frame(`https://cluster-1.lens.app:${PORT}/`);

    handler = createNodeShellAuthorizationHandler({
      registry,
      getClusterById: (clusterId) => clusters.get(clusterId),
      isSenderAuthorized: (event, clusterId) => isClusterFrameSender(event, clusterId, PORT),
      verifyNodeExists,
      isProduction: (preferences) => preferences?.clusterEnvironment === "production",
      getEnvironmentLabel: () => "Production",
      confirmProduction,
      logger: logger as never,
    });
  });

  const request = (overrides: Record<string, unknown> = {}) => ({
    clusterId: "cluster-1",
    nodeName: "prod-node-1",
    ...overrides,
  });

  it("issues a main-owned single-use grant bound to cluster, node and operation", async () => {
    const result = await handler(grantedEvent, request());

    expect(result).toEqual({ granted: true, tabId: "grant-1" });
    expect(registry.pendingCount).toBe(1);
    expect(registry.has("grant-1")).toBe(true);
    expect(registry.consume({
      grantId: "grant-1",
      clusterId: "cluster-1",
      nodeName: "prod-node-1",
      operation: NODE_SHELL_OPEN_OPERATION,
      requireProductionConfirmation: true,
    })).toBe(true);
  });

  it("rejects a direct IPC invocation from the top-level renderer (no trusted cluster frame)", async () => {
    const result = await handler(frame(`https://cluster-1.lens.app:${PORT}/`, null), request());

    expect(result).toEqual({ granted: false, reason: "unauthorized-sender" });
    expect(registry.pendingCount).toBe(0);
    expect(confirmProduction).not.toHaveBeenCalled();
  });

  it("rejects a direct IPC invocation from another cluster's frame", async () => {
    const result = await handler(frame(`https://cluster-2.lens.app:${PORT}/`), request());

    expect(result).toEqual({ granted: false, reason: "unauthorized-sender" });
    expect(registry.pendingCount).toBe(0);
  });

  it("rejects a renderer-supplied tab id instead of registering it (forged authorization)", async () => {
    const withTabId = await handler(grantedEvent, request({ tabId: "attacker-chosen-tab" }));

    expect(withTabId).toEqual({ granted: false, reason: "invalid-request" });

    const legacyThreeArgumentCall = await handler(
      grantedEvent,
      "cluster-1" as never,
      "prod-node-1",
      "attacker-chosen-tab",
    );

    expect(legacyThreeArgumentCall).toEqual({ granted: false, reason: "invalid-request" });
    expect(registry.pendingCount).toBe(0);
    expect(confirmProduction).not.toHaveBeenCalled();
  });

  it("rejects invalid cluster or node arguments before any dialog is shown", async () => {
    expect(await handler(grantedEvent, request({ clusterId: "" }))).toEqual({ granted: false, reason: "invalid-request" });
    expect(await handler(grantedEvent, request({ nodeName: "INVALID NODE" }))).toEqual({ granted: false, reason: "invalid-request" });
    expect(await handler(grantedEvent, undefined)).toEqual({ granted: false, reason: "invalid-request" });
    expect(confirmProduction).not.toHaveBeenCalled();
  });

  it("rejects requests when node shell is disabled for the cluster", async () => {
    clusters.set("cluster-1", createCluster({ id: "cluster-1", enabled: false }));

    expect(await handler(grantedEvent, request())).toEqual({ granted: false, reason: "cluster-not-found" });
    expect(registry.pendingCount).toBe(0);
    expect(confirmProduction).not.toHaveBeenCalled();
  });

  it("rejects requests when the target node does not exist", async () => {
    verifyNodeExists.mockResolvedValue(false);

    expect(await handler(grantedEvent, request())).toEqual({ granted: false, reason: "node-not-found" });
    expect(registry.pendingCount).toBe(0);
    expect(confirmProduction).not.toHaveBeenCalled();
  });

  it("does not register a grant when the operator cancels the production dialog", async () => {
    confirmProduction.mockResolvedValue(false);

    expect(await handler(grantedEvent, request())).toEqual({ granted: false, reason: "confirmation-denied" });
    expect(registry.pendingCount).toBe(0);
  });

  it("does not register a grant if the cluster context is invalidated during confirmation (context change)", async () => {
    confirmProduction.mockImplementation(async () => {
      clusters.set("cluster-1", createCluster({ id: "cluster-1", enabled: false }));

      return true;
    });

    expect(await handler(grantedEvent, request())).toEqual({ granted: false, reason: "context-changed" });
    expect(registry.pendingCount).toBe(0);
  });

  it("does not register a grant if the node disappears during confirmation", async () => {
    verifyNodeExists
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    expect(await handler(grantedEvent, request())).toEqual({ granted: false, reason: "context-changed" });
    expect(registry.pendingCount).toBe(0);
  });

  it("issues a grant without production confirmation only when the cluster is not production", async () => {
    clusters.set("cluster-1", createCluster({ id: "cluster-1", environment: "development" }));

    const result = await handler(grantedEvent, request());

    expect(result.granted).toBe(true);
    expect(confirmProduction).not.toHaveBeenCalled();

    const tabId = result.tabId;

    expect(typeof tabId).toBe("string");
    expect(registry.consume({
      grantId: tabId as string,
      clusterId: "cluster-1",
      nodeName: "prod-node-1",
      operation: NODE_SHELL_OPEN_OPERATION,
      requireProductionConfirmation: true,
    })).toBe(false);
  });
});

describe("NodeShellAuthRegistry", () => {
  it("enforces single-use consumption (reutilización)", () => {
    const registry = new NodeShellAuthRegistry({ generateGrantId: () => "grant-1" });
    const grant = registry.issue({ clusterId: "c1", nodeName: "n1", operation: NODE_SHELL_OPEN_OPERATION, productionConfirmed: true });
    const binding: NodeShellAuthorizationBinding = {
      grantId: grant.grantId,
      clusterId: "c1",
      nodeName: "n1",
      operation: NODE_SHELL_OPEN_OPERATION,
      requireProductionConfirmation: true,
    };

    expect(registry.consume(binding)).toBe(true);
    expect(registry.consume(binding)).toBe(false);
    expect(registry.pendingCount).toBe(0);
  });

  it("rejects expiration after the TTL (expiración)", () => {
    let now = 1_000;
    const registry = new NodeShellAuthRegistry({
      ttlMs: 60_000,
      now: () => now,
      generateGrantId: () => "grant-1",
    });

    registry.issue({ clusterId: "c1", nodeName: "n1", operation: NODE_SHELL_OPEN_OPERATION, productionConfirmed: true });

    now += 60_001;

    expect(registry.has("grant-1")).toBe(false);
    expect(registry.consume({
      grantId: "grant-1",
      clusterId: "c1",
      nodeName: "n1",
      operation: NODE_SHELL_OPEN_OPERATION,
    })).toBe(false);
  });

  it("rejects a grant used with a different cluster, node or operation (cambio de contexto)", () => {
    const registry = new NodeShellAuthRegistry({ generateGrantId: () => "grant-1" });

    registry.issue({ clusterId: "c1", nodeName: "n1", operation: NODE_SHELL_OPEN_OPERATION, productionConfirmed: true });

    expect(registry.consume({
      grantId: "grant-1",
      clusterId: "c2",
      nodeName: "n1",
      operation: NODE_SHELL_OPEN_OPERATION,
    })).toBe(false);

    // The mismatched attempt consumed the grant; it cannot be retried with the right context.
    expect(registry.consume({
      grantId: "grant-1",
      clusterId: "c1",
      nodeName: "n1",
      operation: NODE_SHELL_OPEN_OPERATION,
    })).toBe(false);
  });

  it("rejects a grant issued without production confirmation when confirmation is required", () => {
    const registry = new NodeShellAuthRegistry({ generateGrantId: () => "grant-1" });

    registry.issue({ clusterId: "c1", nodeName: "n1", operation: NODE_SHELL_OPEN_OPERATION, productionConfirmed: false });

    expect(registry.consume({
      grantId: "grant-1",
      clusterId: "c1",
      nodeName: "n1",
      operation: NODE_SHELL_OPEN_OPERATION,
      requireProductionConfirmation: true,
    })).toBe(false);
  });

  it("rejects an unknown forged grant id", () => {
    const registry = new NodeShellAuthRegistry();

    expect(registry.consume({
      grantId: "forged",
      clusterId: "c1",
      nodeName: "n1",
      operation: NODE_SHELL_OPEN_OPERATION,
    })).toBe(false);
  });
});
