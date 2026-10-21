/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { action, makeObservable, observable, reaction } from "mobx";
import { ItemStore } from "../../../common/item.store";
import type { StorageLayer } from "../../utils/storage-helper";
import { disposer } from "@openlens/utilities";
import type { ForwardedPort } from "../port-forward-item";
import { PortForwardItem, isSamePortForward } from "../port-forward-item";
import { waitUntilFree } from "tcp-port-used";
import type { Logger } from "@openlens/logger";
import type { JsonApi } from "@openlens/json-api";
import type { RequestActivePortForward } from "./request-active-port-forward.injectable";
import type { Cluster } from "../../../common/cluster/cluster";
import { isProductionEnvironment, getClusterEnvironmentConfig } from "../../../common/cluster/environment-types";
import autoBind from "auto-bind";
import { assertToolActionClusterContext } from "../../../common/workspace/tool-context";

interface Dependencies {
  readonly storage: StorageLayer<ForwardedPort[] | undefined>;
  readonly apiBase: JsonApi; // TODO: replace with individual dependencies
  readonly logger: Logger;
  readonly hostedCluster?: Cluster;
  notifyErrorPortForwarding: (message: string) => void;
  requestActivePortForward: RequestActivePortForward;
}

export class PortForwardStore extends ItemStore<PortForwardItem> {
  @observable portForwards: PortForwardItem[] = [];

  /**
   * Last start failure per port-forward id, as reported by main (code is kept for diagnostics)
   */
  private readonly startFailures = new Map<string, { code?: string; message: string }>();

  constructor(protected readonly dependencies: Dependencies) {
    super();
    makeObservable(this);
    autoBind(this);

    this.init();
  }

  private async init() {
    const savedPortForwards = this.dependencies.storage.get(); // undefined on first load

    if (Array.isArray(savedPortForwards) && savedPortForwards.length > 0) {
      this.dependencies.logger.info(
        `[PORT-FORWARD-STORE] Restoring ${savedPortForwards.length} saved port-forwards inertly (No-Auto-Start policy)`,
      );

      const currentClusterId = this.dependencies.hostedCluster?.id;

      for (const raw of savedPortForwards) {
        // Quarantine items missing clusterId if no hostedCluster context is available
        const clusterId = raw.clusterId ?? currentClusterId;

        if (!clusterId) {
          this.dependencies.logger.warn(
            "[PORT-FORWARD-STORE] Quarantining legacy port-forward definition lacking clusterId",
            raw,
          );
          continue;
        }

        const pf: ForwardedPort = {
          ...raw,
          clusterId,
          status: "Disabled", // Strictly force Disabled upon restore (No Auto-Start)
          environmentBadge: raw.environmentBadge,
        };

        const existing = this.findPortForward(pf);

        if (!existing) {
          this.portForwards.push(new PortForwardItem(pf));
        }
      }
    }
  }

  watch() {
    return disposer(
      reaction(
        () => this.portForwards.slice(),
        () => this.loadAll(),
      ),
    );
  }

  loadAll() {
    return this.loadItems(() => {
      const portForwards = this.getPortForwards();

      this.dependencies.storage.set(portForwards);

      this.portForwards = [];
      portForwards.map((pf) => this.portForwards.push(new PortForwardItem(pf)));

      return this.portForwards;
    });
  }

  async removeItems(items: PortForwardItem[]) {
    await Promise.all(items.map(this.remove));
  }

  getById(id: string) {
    const index = this.getIndexById(id);

    if (index === -1) {
      return undefined;
    }

    return this.getItems()[index];
  }

  /**
   * add a port-forward to the store and optionally start it
   * @param portForward the port-forward to add. If the port-forward already exists in the store it will be
   * returned with its current state. If the forwardPort field is 0 then an arbitrary port will be
   * used. If the status field is "Active" or not present then an attempt is made to start the port-forward.
   *
   * @returns the port-forward with updated status ("Active" if successfully started, "Disabled" otherwise) and
   * forwardPort
   */
  add = action(async (portForward: ForwardedPort): Promise<ForwardedPort> => {
    if (!portForward.clusterId && this.dependencies.hostedCluster?.id) {
      portForward.clusterId = this.dependencies.hostedCluster.id;
    }

    if (!portForward.environmentBadge && this.dependencies.hostedCluster) {
      const isProd = isProductionEnvironment(this.dependencies.hostedCluster.preferences);
      const envConfig = getClusterEnvironmentConfig(this.dependencies.hostedCluster.preferences);

      portForward.environmentBadge = isProd ? "⚠️ PROD" : (envConfig.shortLabel || "DEV");
    }

    const pf = this.findPortForward(portForward);

    if (pf) {
      return pf;
    }

    this.portForwards.push(new PortForwardItem(portForward));

    if (!portForward.status) {
      portForward.status = "Active";
    }

    if (portForward.status === "Active") {
      portForward = await this.start(portForward);
    }

    return portForward;
  });

  /**
   * modifies a port-forward in the store, including the forwardPort and protocol
   * @param portForward the port-forward to modify.
   *
   * @returns the port-forward after being modified.
   */
  modify = action(
    async (
      portForward: ForwardedPort,
      desiredPort: number,
    ): Promise<ForwardedPort> => {
      const pf = this.findPortForward(portForward);

      if (!pf) {
        throw new Error("port-forward not found");
      }

      if (pf.status === "Active") {
        try {
          await this.stop(pf);
        } catch {
          // ignore, assume it is stopped and proceed to restart it
        }

        pf.forwardPort = desiredPort;
        pf.protocol = portForward.protocol ?? "http";
        this.setPortForward(pf);

        return await this.start(pf);
      }

      pf.forwardPort = desiredPort;
      this.setPortForward(pf);

      return pf as ForwardedPort;
    },
  );

  /**
   * remove and stop an existing port-forward.
   * @param portForward the port-forward to remove.
   */
  remove = action(async (portForward: ForwardedPort) => {
    const pf = this.findPortForward(portForward);

    if (!pf) {
      const error = new Error("port-forward not found");

      this.dependencies.logger.warn(
        `[PORT-FORWARD-STORE] Error getting port-forward: ${error}`,
        portForward,
      );

      return;
    }

    try {
      await this.stop(portForward);
    } catch (error) {
      if (pf.status === "Active") {
        this.dependencies.logger.warn(
          `[PORT-FORWARD-STORE] Error removing port-forward: ${error}`,
          portForward,
        );
      }
    }

    const index = this.portForwards.findIndex(portForwardsEqual(portForward));

    if (index >= 0) {
      this.portForwards.splice(index, 1);
    }
  });

  /**
   * gets the list of port-forwards in the store
   *
   * @returns the port-forwards
   */
  getPortForwards = (): ForwardedPort[] => {
    return this.portForwards;
  };

  /**
   * stop an existing port-forward. Its status is set to "Disabled" after successfully stopped.
   * @param portForward the port-forward to stop.
   *
   * @throws if the port-forward could not be stopped. Its status is unchanged
   */
  stop = action(async (portForward: ForwardedPort) => {
    const pf = this.findPortForward(portForward);

    if (!pf) {
      this.dependencies.logger.warn(
        "[PORT-FORWARD-STORE] Error getting port-forward: port-forward not found",
        portForward,
      );

      return;
    }

    this.assertClusterContext(pf, "stop");

    const { port, forwardPort } = portForward;

    try {
      await this.dependencies.apiBase.del(
        `/pods/port-forward/${portForward.namespace}/${portForward.kind}/${portForward.name}`,
        { query: { port, forwardPort }},
      );

      if (+forwardPort > 0) {
        try {
          await waitUntilFree(+forwardPort, 200, 1000);
        } catch {
          // ignore timeout if port was already freed
        }
      }
    } catch (error) {
      this.dependencies.logger.warn(
        `[PORT-FORWARD-STORE] Error stopping active port-forward: ${error}`,
        portForward,
      );
      throw error;
    }

    pf.status = "Disabled";

    this.setPortForward(pf);
  });

  /**
   * A user-facing description of why the last start() of this port-forward failed, if main reported a known reason
   */
  describeStartFailure(portForward: ForwardedPort): string | undefined {
    const pf = this.findPortForward(portForward);
    const failure = pf && this.startFailures.get(pf.getId());

    if (!failure?.code) {
      return undefined;
    }

    switch (failure.code) {
      case "PROD_DECLINED":
        return `Port-forward to ${pf?.kind} ${pf?.name} on a production cluster was not confirmed, nothing was started (PROD_DECLINED)`;
      case "PORT_IN_USE":
        return `Local port ${pf?.forwardPort} is already in use by another process, choose a different local port (PORT_IN_USE)`;
      default:
        return `${failure.message} (${failure.code})`;
    }
  }

  private findPortForward = (portForward: ForwardedPort) => {
    return this.portForwards.find(portForwardsEqual(portForward));
  };

  /**
   * Fail closed unless the port-forward is bound to the hosted cluster frame.
   * Must run before any request or state change.
   */
  private assertClusterContext(pf: ForwardedPort, operation: "start" | "stop") {
    try {
      assertToolActionClusterContext(pf.clusterId, this.dependencies.hostedCluster?.id, `port-forward:${operation}`);
    } catch (error) {
      this.dependencies.logger.error(`[PORT-FORWARD-SECURITY] ${operation} blocked: ${error}`);
      throw error;
    }
  }

  private setPortForward = action((portForward: ForwardedPort) => {
    const index = this.portForwards.findIndex(portForwardsEqual(portForward));

    if (index < 0) {
      return;
    }

    this.portForwards[index] = new PortForwardItem(portForward);
  });

  /**
   * start an existing port-forward
   * @param portForward the port-forward to start. If the forwardPort field is 0 then an arbitrary port will be
   * used
   *
   * @returns the port-forward with updated status ("Active" if successfully started, "Disabled" otherwise) and
   * forwardPort
   *
   * @throws if the port-forward does not already exist in the store
   */
  start = action(async (portForward: ForwardedPort): Promise<ForwardedPort> => {
    const pf = this.findPortForward(portForward);

    if (!pf) {
      throw new Error("cannot start non-existent port-forward");
    }

    this.assertClusterContext(pf, "start");
    this.startFailures.delete(pf.getId());

    const { port, forwardPort } = pf;
    let response: { port: number };

    try {
      response = await this.dependencies.apiBase.post(
        `/pods/port-forward/${pf.namespace}/${pf.kind}/${pf.name}`,
        { query: { port, forwardPort }},
      );

      // expecting the received port to be the specified port, unless the specified port is 0, which indicates any available port is suitable
      if (
        pf.forwardPort &&
        response?.port &&
        response.port != +pf.forwardPort
      ) {
        this.dependencies.logger.warn(
          `[PORT-FORWARD-STORE] specified ${pf.forwardPort}, got ${response.port}`,
        );
      }

      pf.forwardPort = response.port;
      pf.status = "Active";
    } catch (error) {
      this.dependencies.logger.warn(
        `[PORT-FORWARD-STORE] Error starting port-forward: ${error}`,
        pf,
      );
      this.startFailures.set(pf.getId(), getStartFailure(error));
      pf.status = "Disabled";
    }

    this.setPortForward(pf);

    return pf as ForwardedPort;
  });

  /**
   * get a port-forward from the store, with up-to-date status
   * @param portForward the port-forward to get.
   *
   * @returns the port-forward with updated status ("Active" if running, "Disabled" if not) and
   * forwardPort used.
   *
   * @throws if the port-forward does not exist in the store
   */
  getPortForward = async (portForward: ForwardedPort): Promise<ForwardedPort | undefined> => {
    if (!this.findPortForward(portForward)) {
      throw new Error("port-forward not found");
    }

    try {
      // check if the port-forward is active, and if so check if it has the same local port
      const pf = await this.dependencies.requestActivePortForward(portForward);

      if (pf?.forwardPort && pf.forwardPort !== portForward.forwardPort) {
        this.dependencies.logger.warn(
          `[PORT-FORWARD-STORE] local port, expected ${pf.forwardPort}, got ${portForward.forwardPort}`,
        );
      }

      return pf;
    } catch (error) {
      // port is not active
      return undefined;
    }
  };
}

function portForwardsEqual(portForward: ForwardedPort) {
  return isSamePortForward(portForward);
}

function getStartFailure(error: unknown): { code?: string; message: string } {
  const body = (error as { error?: { code?: unknown; message?: unknown }} | undefined)?.error;

  return {
    code: typeof body?.code === "string" ? body.code : undefined,
    message: typeof body?.message === "string" ? body.message : String(error),
  };
}
