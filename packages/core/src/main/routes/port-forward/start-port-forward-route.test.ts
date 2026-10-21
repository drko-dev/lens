/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { DiContainer } from "@ogre-tools/injectable";
import * as tcpPortUsed from "tcp-port-used";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import startPortForwardRouteInjectable from "./start-port-forward-route.injectable";
import confirmProductionPortForwardInjectable from "./confirm-production-port-forward.injectable";
import createPortForwardInjectable from "./functionality/create-port-forward.injectable";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";
import kubeconfigManagerInjectable from "../../kubeconfig-manager/kubeconfig-manager.injectable";
import { PortForward } from "./functionality/port-forward";

jest.mock("tcp-port-used", () => ({
  check: jest.fn().mockResolvedValue(false),
}));

const makeCluster = (id: string, clusterEnvironment: string | undefined, clusterName = `name-${id}`) => ({
  id,
  preferences: { clusterEnvironment, clusterName },
  name: { get: () => clusterName },
}) as any;

describe("start-port-forward-route", () => {
  let di: DiContainer;
  let confirm: jest.Mock;
  let createPortForward: jest.Mock;
  let fake: any;
  let ensurePath: jest.Mock;
  let getClusterById: jest.Mock;
  let registry: Map<string, any>;
  let tcpCheck: jest.Mock;
  let handler: (request: any) => Promise<any>;

  const args = (overrides: Record<string, string> = {}) => ({
    params: { namespace: "ns", resourceType: "pod", resourceName: "api-0" },
    query: new URLSearchParams({ port: "8080", forwardPort: "9090", ...overrides }),
  });
  const call = (cluster: any, overrides: Record<string, string> = {}) => handler({ ...args(overrides), cluster });
  const register = (cluster: any) => {
    registry.set(cluster.id, cluster);

    return cluster;
  };

  beforeEach(() => {
    PortForward.portForwards = [];
    registry = new Map();
    tcpCheck = tcpPortUsed.check as unknown as jest.Mock;
    tcpCheck.mockReset().mockResolvedValue(false);

    fake = {
      start: jest.fn().mockResolvedValue(true),
      forwardPort: 9090,
      lastError: undefined,
      lastErrorCode: undefined,
    };
    confirm = jest.fn().mockResolvedValue(true);
    createPortForward = jest.fn().mockReturnValue(fake);
    ensurePath = jest.fn().mockResolvedValue("/tmp/fake-kubeconfig");
    getClusterById = jest.fn((id: string) => registry.get(id));

    di = getDiForUnitTesting();
    di.override(confirmProductionPortForwardInjectable, () => confirm);
    di.override(createPortForwardInjectable, () => createPortForward);
    di.override(getClusterByIdInjectable, () => getClusterById);
    di.override(kubeconfigManagerInjectable, () => ({ ensurePath }) as any);

    handler = di.inject(startPortForwardRouteInjectable).handler as any;
  });

  afterEach(() => {
    PortForward.portForwards = [];
  });

  describe("production clusters", () => {
    it("creates the port-forward and returns its port when the user confirms", async () => {
      const result = await call(register(makeCluster("c1", "production")));

      expect(result).toEqual({ response: { port: 9090 }});
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(createPortForward).toHaveBeenCalledTimes(1);
      expect(fake.start).toHaveBeenCalledTimes(1);
    });

    it("sends cluster name, environment label and ports to the confirmation", async () => {
      await call(register(makeCluster("c1", "production", "prod-one")));

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
        clusterId: "c1",
        clusterName: "prod-one",
        environmentLabel: "Production",
        namespace: "ns",
        kind: "pod",
        name: "api-0",
        port: 8080,
        forwardPort: 9090,
      }));
    });

    it("returns PROD_DECLINED and creates nothing when the user declines", async () => {
      confirm.mockResolvedValue(false);

      const result = await call(register(makeCluster("c1", "production")));

      expect(result.error.code).toBe("PROD_DECLINED");
      expect(createPortForward).not.toHaveBeenCalled();
      expect(ensurePath).not.toHaveBeenCalled();
      expect(tcpCheck).not.toHaveBeenCalled();
    });

    it("returns PROD_DECLINED and creates nothing when the dialog is cancelled", async () => {
      confirm.mockImplementation(async () => false);

      const result = await call(register(makeCluster("c1", "production")));

      expect(result.error.code).toBe("PROD_DECLINED");
      expect(fake.start).not.toHaveBeenCalled();
      expect(ensurePath).not.toHaveBeenCalled();
      expect(tcpCheck).not.toHaveBeenCalled();
    });

    it("requires confirmation for the 'prod' alias", async () => {
      confirm.mockResolvedValue(false);

      const result = await call(register(makeCluster("c1", "prod")));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(result.error.code).toBe("PROD_DECLINED");
    });

    it("returns PROD_DECLINED when the cluster is removed while the dialog is open", async () => {
      const cluster = register(makeCluster("c1", "production"));

      confirm.mockImplementation(async () => {
        registry.delete("c1");

        return true;
      });

      const result = await call(cluster);

      expect(result.error.code).toBe("PROD_DECLINED");
      expect(createPortForward).not.toHaveBeenCalled();
      expect(ensurePath).not.toHaveBeenCalled();
      expect(tcpCheck).not.toHaveBeenCalled();
    });

    it("reuses a ready port-forward started while the dialog was open", async () => {
      const cluster = register(makeCluster("c1", "production"));

      confirm.mockImplementation(async () => {
        const other = new PortForward({} as any, "/tmp/other", {
          clusterId: "c1", kind: "pod", name: "api-0", namespace: "ns", port: 8080, forwardPort: 9090,
        });

        other.ready = true;
        PortForward.portForwards.push(other);

        return true;
      });

      const result = await call(cluster);

      expect(result).toEqual({ response: { port: 9090 }});
      expect(createPortForward).not.toHaveBeenCalled();
    });
  });

  describe("non-production clusters", () => {
    it.each([
      ["development"],
      ["staging"],
      [undefined],
    ])("does not ask for confirmation when environment is %s", async (environment) => {
      const result = await call(register(makeCluster("c1", environment)));

      expect(confirm).not.toHaveBeenCalled();
      expect(createPortForward).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ response: { port: 9090 }});
    });
  });

  describe("cluster identity", () => {
    it("rejects a cluster whose id is 'unknown'", async () => {
      const result = await call(register(makeCluster("unknown", "production")));

      expect(result.error.code).toBe("CLUSTER_IDENTITY");
      expect(confirm).not.toHaveBeenCalled();
      expect(createPortForward).not.toHaveBeenCalled();
    });

    it("rejects a cluster object that differs from the registered one with the same id", async () => {
      register(makeCluster("c1", "development"));

      const result = await call(makeCluster("c1", "development"));

      expect(result.error.code).toBe("CLUSTER_IDENTITY");
      expect(confirm).not.toHaveBeenCalled();
      expect(createPortForward).not.toHaveBeenCalled();
    });

    it("rejects a cluster that is not registered", async () => {
      const result = await call(makeCluster("ghost", "production"));

      expect(result.error.code).toBe("CLUSTER_IDENTITY");
      expect(createPortForward).not.toHaveBeenCalled();
    });

    it("resolves identity from the authoritative cluster store only (caller frame is not authenticated)", async () => {
      // Known limitation: the route cannot tell which frame sent the request, so a
      // request carrying cluster B's identity is processed (and confirmed) as B.
      register(makeCluster("A", "development"));
      register(makeCluster("B", "production", "cluster-b"));

      const result = await call(registry.get("B"));

      expect(result).toEqual({ response: { port: 9090 }});
      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ clusterId: "B", clusterName: "cluster-b" }));
      expect(createPortForward).toHaveBeenCalledWith("/tmp/fake-kubeconfig", expect.objectContaining({ clusterId: "B" }));
    });
  });

  describe("port validation", () => {
    it.each([
      ["port", "0"],
      ["port", "70000"],
      ["port", "NaN"],
      ["forwardPort", "-1"],
    ])("returns INVALID_PORT for %s=%s", async (key, value) => {
      const result = await call(register(makeCluster("c1", "production")), { [key]: value });

      expect(result.error.code).toBe("INVALID_PORT");
      expect(confirm).not.toHaveBeenCalled();
      expect(createPortForward).not.toHaveBeenCalled();
    });
  });

  describe("port conflicts", () => {
    it("returns PORT_IN_USE when kubectl reports the port is in use", async () => {
      fake.start.mockResolvedValue(false);
      fake.lastErrorCode = "PORT_IN_USE";

      const result = await call(register(makeCluster("c1", "development")));

      expect(result.error.code).toBe("PORT_IN_USE");
      expect(result.error.message).toContain("already in use");
    });

    it("returns PORT_IN_USE without creating a port-forward when the pre-check finds the port taken", async () => {
      tcpCheck.mockResolvedValue(true);

      const result = await call(register(makeCluster("c1", "development")));

      expect(result.error.code).toBe("PORT_IN_USE");
      expect(createPortForward).not.toHaveBeenCalled();
    });
  });

  describe("concurrent identical requests", () => {
    it("starts a DEV port-forward once and shares the result between identical concurrent requests", async () => {
      const cluster = register(makeCluster("c1", "development"));

      const [first, second] = await Promise.all([call(cluster), call(cluster)]);

      expect(createPortForward).toHaveBeenCalledTimes(1);
      expect(fake.start).toHaveBeenCalledTimes(1);
      expect(first).toEqual({ response: { port: 9090 }});
      expect(second).toEqual(first);
    });

    it("asks for PROD confirmation once when identical requests overlap and returns the same result", async () => {
      const cluster = register(makeCluster("c1", "production"));

      const [first, second] = await Promise.all([call(cluster), call(cluster)]);

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(createPortForward).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
      expect(first).toEqual({ response: { port: 9090 }});
    });

    it("returns PROD_DECLINED to both overlapping requests and creates nothing when declined", async () => {
      confirm.mockResolvedValue(false);
      const cluster = register(makeCluster("c1", "production"));

      const [first, second] = await Promise.all([call(cluster), call(cluster)]);

      expect(first.error.code).toBe("PROD_DECLINED");
      expect(second.error.code).toBe("PROD_DECLINED");
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(createPortForward).not.toHaveBeenCalled();
    });

    it("does not coalesce requests that differ only by forwardPort", async () => {
      const cluster = register(makeCluster("c1", "development"));

      await Promise.all([call(cluster), call(cluster, { forwardPort: "9091" })]);

      expect(createPortForward).toHaveBeenCalledTimes(2);
    });

    it("does not coalesce requests that differ only by resourceName", async () => {
      const cluster = register(makeCluster("c1", "development"));

      await Promise.all([
        call(cluster),
        handler({ ...args(), params: { namespace: "ns", resourceType: "pod", resourceName: "api-1" }, cluster }),
      ]);

      expect(createPortForward).toHaveBeenCalledTimes(2);
    });

    it("starts a fresh attempt for an identical request after the previous one settled", async () => {
      const cluster = register(makeCluster("c1", "development"));

      await call(cluster);
      await call(cluster);

      expect(createPortForward).toHaveBeenCalledTimes(2);
    });

    it("starts a fresh attempt after a failed start() instead of replaying the failure", async () => {
      const cluster = register(makeCluster("c1", "development"));

      fake.start.mockResolvedValueOnce(false);

      const failed = await call(cluster);
      const retried = await call(cluster);

      expect(failed.error.code).toBe("START_FAILED");
      expect(retried).toEqual({ response: { port: 9090 }});
      expect(createPortForward).toHaveBeenCalledTimes(2);
    });
  });

  describe("environment change during confirmation", () => {
    it("returns PROD_DECLINED when the environment is no longer production after the user confirmed", async () => {
      const cluster = register(makeCluster("c1", "production"));

      confirm.mockImplementation(async () => {
        cluster.preferences.clusterEnvironment = "development";

        return true;
      });

      const result = await call(cluster);

      expect(result.error.code).toBe("PROD_DECLINED");
      expect(createPortForward).not.toHaveBeenCalled();
      expect(ensurePath).not.toHaveBeenCalled();
    });
  });
});
