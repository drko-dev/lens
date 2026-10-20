/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { PortForward } from "./port-forward";
import childProcess from "child_process";
import { EventEmitter } from "events";

jest.mock("child_process");
jest.mock("tcp-port-used", () => ({
  waitUntilUsed: jest.fn().mockResolvedValue(undefined),
}));

describe("PortForward", () => {
  let mockProcess: any;

  beforeEach(() => {
    PortForward.portForwards = [];
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = jest.fn();

    (childProcess.spawn as jest.Mock).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    PortForward.portForwards = [];
  });

  it("spawns kubectl port-forward binding exclusively to 127.0.0.1 by default", async () => {
    const dependencies = {
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      getKubectlBinPath: jest.fn().mockResolvedValue("/path/to/kubectl"),
      getPortFromStream: jest.fn().mockResolvedValue(54321),
    };

    const pf = new PortForward(dependencies, "/path/to/kubeconfig", {
      clusterId: "cluster-test",
      kind: "pod",
      namespace: "app-ns",
      name: "postgres-0",
      port: 5432,
      forwardPort: 0,
    });

    const startPromise = pf.start();

    const success = await startPromise;

    expect(success).toBe(true);
    expect(childProcess.spawn).toHaveBeenCalledWith(
      "/path/to/kubectl",
      [
        "--kubeconfig",
        "/path/to/kubeconfig",
        "port-forward",
        "--address",
        "127.0.0.1",
        "-n",
        "app-ns",
        "pod/postgres-0",
        "0:5432",
      ],
      expect.anything(),
    );
    expect(pf.forwardPort).toBe(54321);
    expect(PortForward.getPortforward({
      clusterId: "cluster-test",
      kind: "pod",
      namespace: "app-ns",
      name: "postgres-0",
      port: 5432,
      forwardPort: 54321,
    })).toBe(pf);
  });

  it("cleans up from static portForwards when process exits", async () => {
    const dependencies = {
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      getKubectlBinPath: jest.fn().mockResolvedValue("/path/to/kubectl"),
      getPortFromStream: jest.fn().mockResolvedValue(8080),
    };

    const pf = new PortForward(dependencies, "/path/to/kubeconfig", {
      clusterId: "cluster-test",
      kind: "service",
      namespace: "default",
      name: "web-svc",
      port: 80,
      forwardPort: 8080,
    });

    await pf.start();
    expect(PortForward.portForwards.length).toBe(1);
    expect(dependencies.getKubectlBinPath).toHaveBeenCalledWith(false);

    mockProcess.emit("exit");
    expect(PortForward.portForwards.length).toBe(0);
  });

  it("captures stderr into lastError and removes failed port-forward from active registry", async () => {
    const dependencies = {
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      getKubectlBinPath: jest.fn().mockResolvedValue("/path/to/kubectl"),
      getPortFromStream: jest.fn().mockImplementation(async (_stream, opts) => {
        mockProcess.stderr.emit("data", Buffer.from("error: unable to forward port because pod is not running"));
        opts.onFindingError();
        throw new Error("Timed out waiting for port");
      }),
    };

    const pf = new PortForward(dependencies, "/path/to/kubeconfig", {
      clusterId: "cluster-test",
      kind: "pod",
      namespace: "default",
      name: "broken-pod",
      port: 8080,
      forwardPort: 8080,
    });

    const started = await pf.start();

    expect(started).toBe(false);
    expect(pf.lastError).toContain("unable to forward port because pod is not running");
    expect(PortForward.portForwards.length).toBe(0);
  });
});

