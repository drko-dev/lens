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

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

// Jest here lacks advanceTimersByTimeAsync: advance fake timers, then let promise continuations run
const advance = async (ms: number) => {
  jest.advanceTimersByTime(ms);

  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

const pfArgs = {
  clusterId: "cluster-test",
  kind: "service",
  namespace: "default",
  name: "web-svc",
  port: 80,
  forwardPort: 8080,
};

const createDependencies = (getPortFromStream: jest.Mock) => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
  getKubectlBinPath: jest.fn().mockResolvedValue("/path/to/kubectl"),
  getPortFromStream,
});

describe("PortForward", () => {
  let mockProcess: any;

  beforeEach(() => {
    PortForward.portForwards = [];
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = jest.fn();
    mockProcess.exitCode = null;
    mockProcess.signalCode = null;

    (childProcess.spawn as jest.Mock).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    PortForward.portForwards = [];
    jest.useRealTimers();
    jest.restoreAllMocks();
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

  it("always passes --address 127.0.0.1 to kubectl", async () => {
    const pf = new PortForward(createDependencies(jest.fn().mockResolvedValue(8080)), "/path/to/kubeconfig", pfArgs);

    await pf.start();

    const spawnArgs = (childProcess.spawn as jest.Mock).mock.calls[0][1] as string[];

    expect(spawnArgs[spawnArgs.indexOf("--address") + 1]).toBe("127.0.0.1");
  });

  it("exposes address 127.0.0.1", () => {
    const pf = new PortForward(createDependencies(jest.fn()), "/path/to/kubeconfig", pfArgs);

    expect(pf.address).toBe("127.0.0.1");
  });

  it("ignores an address passed in args and still binds to 127.0.0.1", async () => {
    const pf = new PortForward(
      createDependencies(jest.fn().mockResolvedValue(8080)),
      "/path/to/kubeconfig",
      { ...pfArgs, address: "0.0.0.0" } as any,
    );

    await pf.start();

    const spawnArgs = (childProcess.spawn as jest.Mock).mock.calls[0][1] as string[];

    expect(pf.address).toBe("127.0.0.1");
    expect(spawnArgs).toContain("127.0.0.1");
    expect(spawnArgs).not.toContain("0.0.0.0");
  });

  describe.each([
    ["IPv6 loopback", "Forwarding from [::1]:8080 -> 80"],
    ["wildcard", "Forwarding from 0.0.0.0:8080 -> 80"],
  ])("when kubectl announces %s", (_name, line) => {
    let pf: PortForward;
    let result: boolean;

    beforeEach(async () => {
      pf = new PortForward(createDependencies(jest.fn().mockImplementation(async () => {
        mockProcess.stdout.emit("data", Buffer.from(`${line}\n`));

        return 8080;
      })), "/path/to/kubeconfig", pfArgs);

      result = await pf.start();
    });

    it("resolves start() with false", () => {
      expect(result).toBe(false);
    });

    it("sets lastErrorCode to UNEXPECTED_BIND_ADDRESS", () => {
      expect(pf.lastErrorCode).toBe("UNEXPECTED_BIND_ADDRESS");
    });

    it("kills its own child process", () => {
      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it("is not left in the registry", () => {
      expect(PortForward.portForwards).not.toContain(pf);
    });
  });

  it("accepts kubectl announcing 127.0.0.1", async () => {
    const pf = new PortForward(createDependencies(jest.fn().mockImplementation(async () => {
      mockProcess.stdout.emit("data", Buffer.from("Forwarding from 127.0.0.1:8080 -> 80\n"));

      return 8080;
    })), "/path/to/kubeconfig", pfArgs);

    expect(await pf.start()).toBe(true);
    expect(pf.lastErrorCode).toBeUndefined();
  });

  it("resolves false with PREMATURE_EXIT when the child exits before the port is known", async () => {
    const pf = new PortForward(createDependencies(jest.fn().mockReturnValue(new Promise(() => {}))), "/path/to/kubeconfig", pfArgs);
    const started = pf.start();

    await flush();
    mockProcess.exitCode = 1;
    mockProcess.emit("exit", 1, null);

    expect(await started).toBe(false);
    expect(pf.lastErrorCode).toBe("PREMATURE_EXIT");
  });

  it("resolves false without waiting when kubectl cannot be spawned (error without exit)", async () => {
    const pf = new PortForward(createDependencies(jest.fn().mockReturnValue(new Promise(() => {}))), "/path/to/kubeconfig", pfArgs);
    const started = pf.start();

    await flush();
    mockProcess.emit("error", new Error("spawn /path/to/kubectl ENOENT"));

    expect(await started).toBe(false);
    expect(pf.lastError).toContain("ENOENT");
    expect(pf.ready).toBe(false);
    expect(PortForward.portForwards).toEqual([]);
  });

  it("removes the port-forward from the registry on premature exit", async () => {
    const pf = new PortForward(createDependencies(jest.fn().mockReturnValue(new Promise(() => {}))), "/path/to/kubeconfig", pfArgs);
    const started = pf.start();

    await flush();
    mockProcess.exitCode = 1;
    mockProcess.emit("exit", 1, null);
    await started;

    expect(PortForward.portForwards).toEqual([]);
  });

  describe("when stderr reports the port is already in use", () => {
    let pf: PortForward;
    let killSpy: jest.SpyInstance;

    beforeEach(async () => {
      killSpy = jest.spyOn(process, "kill").mockImplementation(() => true);
      pf = new PortForward(createDependencies(jest.fn().mockReturnValue(new Promise(() => {}))), "/path/to/kubeconfig", pfArgs);

      const started = pf.start();

      await flush();
      mockProcess.stderr.emit("data", Buffer.from("error: unable to listen on port 8080: Listeners failed to create with the following errors: [unable to create listener: Error listen tcp4 127.0.0.1:8080: bind: address already in use]"));
      mockProcess.exitCode = 1;
      mockProcess.emit("exit", 1, null);
      await started;
    });

    it("sets lastErrorCode to PORT_IN_USE", () => {
      expect(pf.lastErrorCode).toBe("PORT_IN_USE");
    });

    it("does not kill any process other than its own child", () => {
      expect(killSpy).not.toHaveBeenCalled();
    });

    it("only kills its own child process", () => {
      expect(mockProcess.kill).toHaveBeenCalledTimes(1);
    });
  });

  it("is not returned by getPortforward while start() is pending", async () => {
    let resolvePort!: (port: number) => void;
    const pf = new PortForward(createDependencies(jest.fn().mockReturnValue(new Promise<number>((resolve) => {
      resolvePort = resolve;
    }))), "/path/to/kubeconfig", pfArgs);
    const started = pf.start();

    await flush();

    expect(PortForward.portForwards).toContain(pf);
    expect(pf.ready).toBe(false);
    expect(PortForward.getPortforward(pfArgs)).toBeUndefined();

    resolvePort(8080);
    await started;
  });

  it("is returned by getPortforward and ready after start() succeeds", async () => {
    const pf = new PortForward(createDependencies(jest.fn().mockResolvedValue(8080)), "/path/to/kubeconfig", pfArgs);

    await pf.start();

    expect(pf.ready).toBe(true);
    expect(PortForward.getPortforward(pfArgs)).toBe(pf);
  });

  describe("stop()", () => {
    let pf: PortForward;

    beforeEach(async () => {
      pf = new PortForward(createDependencies(jest.fn().mockResolvedValue(8080)), "/path/to/kubeconfig", pfArgs);
      await pf.start();
    });

    it("sends SIGTERM to the child", async () => {
      const stopped = pf.stop();

      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");

      mockProcess.emit("exit", 0, "SIGTERM");
      await stopped;
    });

    it("resolves without SIGKILL when the child exits after SIGTERM", async () => {
      const stopped = pf.stop();

      mockProcess.emit("exit", 0, "SIGTERM");
      await stopped;

      expect(mockProcess.kill).not.toHaveBeenCalledWith("SIGKILL");
    });

    it("does not send SIGKILL before the 3000ms grace period elapses", async () => {
      jest.useFakeTimers();

      const stopped = pf.stop();

      await advance(2999);

      expect(mockProcess.kill).not.toHaveBeenCalledWith("SIGKILL");

      await advance(1);
      await advance(2000);
      await stopped;
    });

    it("sends SIGKILL after the grace period when the child never exits", async () => {
      jest.useFakeTimers();

      const stopped = pf.stop();

      await advance(3000);

      expect(mockProcess.kill).toHaveBeenLastCalledWith("SIGKILL");

      await advance(2000);
      await stopped;
    });

    it("resolves after the kill timeout even if the child never exits", async () => {
      jest.useFakeTimers();

      const onSettled = jest.fn();

      pf.stop().then(onSettled);

      await advance(3000);
      expect(onSettled).not.toHaveBeenCalled();

      await advance(2000);
      expect(onSettled).toHaveBeenCalled();
    });

    it("does not kill a child that has already exited", async () => {
      mockProcess.exitCode = 0;

      await pf.stop();

      expect(mockProcess.kill).not.toHaveBeenCalled();
    });

    it("removes the port-forward from the registry", async () => {
      mockProcess.exitCode = 0;

      await pf.stop();

      expect(PortForward.portForwards).not.toContain(pf);
    });

    it("sets ready to false", async () => {
      mockProcess.exitCode = 0;

      await pf.stop();

      expect(pf.ready).toBe(false);
    });
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

