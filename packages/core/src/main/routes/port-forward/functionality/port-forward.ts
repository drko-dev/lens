/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import type { GetPortFromStream } from "../../../utils/get-port-from-stream.injectable";
import type { ChildProcessWithoutNullStreams } from "child_process";
import { spawn } from "child_process";
import * as tcpPortUsed from "tcp-port-used";
import { TypedRegEx } from "typed-regex";
import type { Logger } from "@openlens/logger";

const internalPortMatcher = "^forwarding from (?<address>.+) ->";
const internalPortRegex = Object.assign(TypedRegEx(internalPortMatcher, "i"), {
  rawMatcher: internalPortMatcher,
});

/**
 * Port-forwards are only ever exposed on IPv4 loopback. There is deliberately no way to configure this.
 */
export const PORT_FORWARD_BIND_ADDRESS = "127.0.0.1";

const STOP_GRACE_PERIOD_MS = 3000;
const STOP_KILL_TIMEOUT_MS = 2000;

export type PortForwardErrorCode = "PORT_IN_USE" | "PREMATURE_EXIT" | "UNEXPECTED_BIND_ADDRESS" | "START_FAILED";

const portInUsePattern = /address already in use|EADDRINUSE/i;

export interface PortForwardArgs {
  clusterId: string;
  kind: string;
  namespace: string;
  name: string;
  port: number;
  forwardPort: number;
}

export interface PortForwardDependencies {
  readonly logger: Logger;
  getKubectlBinPath: (bundled: boolean) => Promise<string>;
  getPortFromStream: GetPortFromStream;
}

export class PortForward {
  public static portForwards: PortForward[] = [];

  static getPortforward(forward: PortForwardArgs) {
    return PortForward.portForwards.find((pf) => (
      pf.ready &&
      pf.clusterId == forward.clusterId &&
      pf.kind == forward.kind &&
      pf.name == forward.name &&
      pf.namespace == forward.namespace &&
      pf.port == forward.port
    ));
  }

  public process?: ChildProcessWithoutNullStreams;
  public clusterId: string;
  public kind: string;
  public namespace: string;
  public name: string;
  public port: number;
  public forwardPort: number;
  public readonly address = PORT_FORWARD_BIND_ADDRESS;
  public lastError?: string;
  public lastErrorCode?: PortForwardErrorCode;
  /**
   * Only `true` once kubectl is confirmed listening on the loopback port
   */
  public ready = false;

  constructor(private dependencies: PortForwardDependencies, public pathToKubeConfig: string, args: PortForwardArgs) {
    this.clusterId = args.clusterId;
    this.kind = args.kind;
    this.namespace = args.namespace;
    this.name = args.name;
    this.port = args.port;
    this.forwardPort = args.forwardPort;
  }

  protected removeFromActiveList() {
    const index = PortForward.portForwards.indexOf(this);

    if (index > -1) {
      PortForward.portForwards.splice(index, 1);
    }
  }

  public async start() {
    const kubectlBin = await this.dependencies.getKubectlBinPath(false);
    const args = [
      "--kubeconfig", this.pathToKubeConfig,
      "port-forward",
      "--address", PORT_FORWARD_BIND_ADDRESS,
      "-n", this.namespace,
      `${this.kind}/${this.name}`,
      `${this.forwardPort ?? ""}:${this.port}`,
    ];

    this.lastError = undefined;
    this.lastErrorCode = undefined;
    this.ready = false;

    const childProcess = spawn(kubectlBin, args, {
      env: process.env,
    });

    this.process = childProcess;
    // Registered immediately so that quitting mid-start still stops this process; not "ready" until confirmed
    PortForward.portForwards.push(this);

    // Rejects as soon as the child dies or cannot be spawned, so start() never waits on a dead process
    const failed = new Promise<never>((resolve, reject) => {
      childProcess.once("exit", (code, signal) => {
        this.ready = false;
        this.removeFromActiveList();
        reject(new Error(`kubectl port-forward exited before becoming ready (code=${code}, signal=${signal})`));
      });
      childProcess.once("error", (error) => {
        this.ready = false;
        this.lastError = error.message;
        this.dependencies.logger.warn(`[PORT-FORWARD-ROUTE]: kubectl port-forward process error: ${error.message}`);
        this.removeFromActiveList();
        reject(error);
      });
    });

    failed.catch(() => {});

    childProcess.stderr.on("data", (data) => {
      const message = String(data).trim();

      if (message) {
        this.lastError = message;
      }

      this.dependencies.logger.debug(`[PORT-FORWARD-ROUTE]: kubectl port-forward process stderr: ${data}`);
    });

    childProcess.stdout.on("data", (data) => {
      for (const line of String(data).split("\n")) {
        const announced = /^forwarding from (.+):\d+ ->/i.exec(line.trim());

        if (announced && announced[1] !== PORT_FORWARD_BIND_ADDRESS) {
          this.lastErrorCode = "UNEXPECTED_BIND_ADDRESS";
          this.lastError = `kubectl announced unexpected bind address ${announced[1]}`;
          childProcess.kill();
        }
      }
    });

    try {
      const internalPort = await Promise.race([
        this.dependencies.getPortFromStream(childProcess.stdout, {
          lineRegex: internalPortRegex,
        }),
        failed,
      ]);

      await Promise.race([
        tcpPortUsed.waitUntilUsed(internalPort, 500, 15000),
        failed,
      ]);

      if (this.lastErrorCode === "UNEXPECTED_BIND_ADDRESS") {
        throw new Error(this.lastError);
      }

      // make sure this.forwardPort is set to the actual port used (if it was 0 then an available port is found by 'kubectl port-forward')
      this.forwardPort = internalPort;
      this.ready = true;

      return true;
    } catch (error) {
      this.ready = false;
      this.lastErrorCode ??= portInUsePattern.test(this.lastError ?? "")
        ? "PORT_IN_USE"
        : childProcess.exitCode !== null || childProcess.signalCode !== null
          ? "PREMATURE_EXIT"
          : "START_FAILED";
      this.removeFromActiveList();
      // Only ever our own child process; never anything holding the port
      childProcess.kill();

      return false;
    }
  }

  /**
   * Stops our own kubectl child: SIGTERM, then SIGKILL after a bounded grace period.
   * Resolves once the child has exited (or the kill timeout elapses).
   */
  public async stop() {
    this.ready = false;
    this.removeFromActiveList();

    const childProcess = this.process;

    if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) {
      return;
    }

    const waitForExit = (ms: number) => new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);

      childProcess.once("exit", () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

    childProcess.kill("SIGTERM");

    if (await waitForExit(STOP_GRACE_PERIOD_MS)) {
      return;
    }

    this.dependencies.logger.warn(`[PORT-FORWARD-ROUTE]: kubectl port-forward did not exit after SIGTERM, sending SIGKILL`);
    childProcess.kill("SIGKILL");
    await waitForExit(STOP_KILL_TIMEOUT_MS);
  }
}
