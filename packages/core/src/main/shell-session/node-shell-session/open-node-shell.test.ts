/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { DiContainer } from "@ogre-tools/injectable";
import directoryForTempInjectable from "../../../common/app-paths/directory-for-temp/directory-for-temp.injectable";
import directoryForUserDataInjectable from "../../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import { buildVersionStateInjectable } from "../../../features/vars/build-version/main/init.injectable";
import createKubeApiInjectable from "../../../common/k8s-api/create-kube-api.injectable";
import createKubeJsonApiForClusterInjectable from "../../../common/k8s-api/create-kube-json-api-for-cluster.injectable";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import openNodeShellSessionInjectable from "./open.injectable";
import nodeShellAuthRegistryInjectable from "./node-shell-auth-registry.injectable";
import type { NodeShellAuthorizationBinding } from "./node-shell-auth-registry";
import { NODE_SHELL_OPEN_OPERATION } from "./node-shell-auth-registry";

describe("openNodeShellSession", () => {
  let di: DiContainer;
  let mockNodeGet: jest.Mock;

  beforeEach(() => {
    di = getDiForUnitTesting();

    mockNodeGet = jest.fn();

    di.override(directoryForUserDataInjectable, () => "/some-directory-for-user-data");
    di.override(directoryForTempInjectable, () => "/some-directory-for-tmp");
    di.override(buildVersionStateInjectable, () => "1.1.1");
    di.override(createKubeJsonApiForClusterInjectable, () => () => ({}) as any);
    di.override(createKubeApiInjectable, () => () => ({
      get: mockNodeGet,
    }) as any);
  });

  it("throws security error when nodeShellEnabled is false or undefined", async () => {
    const openNodeShellSession = di.inject(openNodeShellSessionInjectable);

    const cluster = {
      id: "dev-cluster",
      name: { get: () => "dev-cluster" },
      preferences: {},
    } as any;

    await expect(
      openNodeShellSession({
        cluster,
        nodeName: "node-1",
        tabId: "tab-1",
        websocket: {} as any,
      }),
    ).rejects.toThrow(/Node shell is disabled for cluster "dev-cluster"/);
  });

  it("blocks backend node shell in PROD when explicit per-operation authorization is missing", async () => {
    const openNodeShellSession = di.inject(openNodeShellSessionInjectable);

    const cluster = {
      id: "prod-cluster-1",
      name: { get: () => "prod-cluster-1" },
      preferences: {
        nodeShellEnabled: true,
        clusterEnvironment: "production",
      },
    } as any;

    await expect(
      openNodeShellSession({
        cluster,
        nodeName: "prod-node-1",
        tabId: "tab-prod-1",
        websocket: {} as any,
      }),
    ).rejects.toThrow(/missing explicit per-operation operator authorization/);
  });

  it("blocks backend node shell when target node does not exist in cluster", async () => {
    const openNodeShellSession = di.inject(openNodeShellSessionInjectable);
    const authRegistry = di.inject(nodeShellAuthRegistryInjectable);

    const grant = authRegistry.issue({ clusterId: "prod-cluster-1", nodeName: "non-existent-node", operation: NODE_SHELL_OPEN_OPERATION, productionConfirmed: true });

    mockNodeGet.mockResolvedValue(null);

    const cluster = {
      id: "prod-cluster-1",
      name: { get: () => "prod-cluster-1" },
      preferences: {
        nodeShellEnabled: true,
        clusterEnvironment: "production",
      },
    } as any;

    await expect(
      openNodeShellSession({
        cluster,
        nodeName: "non-existent-node",
        tabId: grant.grantId,
        websocket: {} as any,
      }),
    ).rejects.toThrow(/Target node "non-existent-node" does not exist in cluster/);
  });

  it("consumes authorization grant on use so token cannot be replayed (reutilización)", async () => {
    const authRegistry = di.inject(nodeShellAuthRegistryInjectable);

    const grant = authRegistry.issue({ clusterId: "prod-cluster-1", nodeName: "prod-node-1", operation: NODE_SHELL_OPEN_OPERATION, productionConfirmed: true });

    const binding: NodeShellAuthorizationBinding = {
      grantId: grant.grantId,
      clusterId: "prod-cluster-1",
      nodeName: "prod-node-1",
      operation: NODE_SHELL_OPEN_OPERATION,
      requireProductionConfirmation: true,
    };

    expect(authRegistry.consume(binding)).toBe(true);
    // Second attempt should be rejected (single-use)
    expect(authRegistry.consume(binding)).toBe(false);
  });

  it("blocks forged authorization when tabId, clusterId or nodeName do not match (autorización falsificada)", async () => {
    const authRegistry = di.inject(nodeShellAuthRegistryInjectable);

    const grant = authRegistry.issue({ clusterId: "prod-cluster-1", nodeName: "prod-node-1", operation: NODE_SHELL_OPEN_OPERATION, productionConfirmed: true });
    const base = {
      clusterId: "prod-cluster-1",
      nodeName: "prod-node-1",
      operation: NODE_SHELL_OPEN_OPERATION,
      requireProductionConfirmation: true,
    } as const;

    // Forged grant id
    expect(authRegistry.consume({ ...base, grantId: "forged-tab" })).toBe(false);
    // A valid grant cannot be used for another node
    expect(authRegistry.consume({ ...base, grantId: grant.grantId, nodeName: "forged-node" })).toBe(false);
    // ...nor for another cluster, nor for another operation
    expect(authRegistry.consume({ ...base, grantId: grant.grantId, clusterId: "forged-cluster" })).toBe(false);
    expect(authRegistry.consume({ ...base, grantId: grant.grantId, operation: "other.operation" as never })).toBe(false);
  });

  it("blocks authorization after 60s TTL expires (expiración)", async () => {
    const authRegistry = di.inject(nodeShellAuthRegistryInjectable);

    const now = Date.now();

    jest.spyOn(Date, "now").mockReturnValue(now);

    const grant = authRegistry.issue({ clusterId: "prod-cluster-1", nodeName: "prod-node-1", operation: NODE_SHELL_OPEN_OPERATION, productionConfirmed: true });

    expect(authRegistry.has(grant.grantId)).toBe(true);

    // Fast-forward past 60s TTL
    jest.spyOn(Date, "now").mockReturnValue(now + 61_000);

    expect(authRegistry.consume({
      grantId: grant.grantId,
      clusterId: "prod-cluster-1",
      nodeName: "prod-node-1",
      operation: NODE_SHELL_OPEN_OPERATION,
      requireProductionConfirmation: true,
    })).toBe(false);
    expect(authRegistry.has(grant.grantId)).toBe(false);

    jest.restoreAllMocks();
  });

  it("blocks backend node shell if cluster context switched (cambio de contexto)", async () => {
    const openNodeShellSession = di.inject(openNodeShellSessionInjectable);
    const authRegistry = di.inject(nodeShellAuthRegistryInjectable);

    // Authorized on cluster-A
    authRegistry.issue({ clusterId: "prod-cluster-A", nodeName: "prod-node-1", operation: NODE_SHELL_OPEN_OPERATION, productionConfirmed: true });

    // Attempting to open on cluster-B
    const clusterB = {
      id: "prod-cluster-B",
      name: { get: () => "prod-cluster-B" },
      preferences: {
        nodeShellEnabled: true,
        clusterEnvironment: "production",
      },
    } as any;

    await expect(
      openNodeShellSession({
        cluster: clusterB,
        nodeName: "prod-node-1",
        tabId: "tab-context-1",
        websocket: {} as any,
      }),
    ).rejects.toThrow(/missing explicit per-operation operator authorization/);
  });
});
