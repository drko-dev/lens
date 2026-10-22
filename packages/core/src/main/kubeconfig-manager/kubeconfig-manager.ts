/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { KubeConfig } from "@kubernetes/client-node";
import { dumpConfigYaml } from "../../common/kube-helpers";
import { isErrnoException } from "@openlens/utilities";
import type { PartialDeep } from "type-fest";
import type { Logger } from "@openlens/logger";
import type { JoinPaths } from "../../common/path/join-paths.injectable";
import type { GetDirnameOfPath } from "../../common/path/get-dirname.injectable";
import type { PathExists } from "../../common/fs/path-exists.injectable";
import type { RemovePath } from "../../common/fs/remove.injectable";
import type { WriteFile } from "../../common/fs/write-file.injectable";
import { randomBytes } from "crypto";
import { rename } from "fs/promises";
import type { SelfSignedCert } from "selfsigned";
import type { Cluster } from "../../common/cluster/cluster";
import type { LoadKubeconfig } from "../../common/cluster/load-kubeconfig.injectable";
import type { ProxyAuthTokens } from "../lens-proxy/proxy-auth-tokens";
import type { KubeAuthProxyServer } from "../cluster/kube-auth-proxy-server.injectable";

interface KubeconfigManagerDependencies {
  readonly directoryForTemp: string;
  readonly logger: Logger;
  readonly certificate: SelfSignedCert;
  readonly kubeAuthProxyServer: KubeAuthProxyServer;
  readonly kubeAuthProxyUrl: string;
  joinPaths: JoinPaths;
  getDirnameOfPath: GetDirnameOfPath;
  pathExists: PathExists;
  removePath: RemovePath;
  writeFile: WriteFile;
  /** Defaults to `fs.promises.rename`; injectable for tests. */
  renameFile?: (from: string, to: string) => Promise<void>;
  loadKubeconfig: LoadKubeconfig;
  readonly proxyAuthTokens: ProxyAuthTokens;
}

export class KubeconfigManager {
  /**
   * The path to the temp config file
   *
   * - if `string` then path
   * - if `null` then not yet created or was cleared
   */
  protected tempFilePath: string | null = null;

  private unsubscribeFromRotation: (() => void) | undefined;

  /** Serializes rotation rewrites so an older write can never land after a newer one. */
  private rotationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly dependencies: KubeconfigManagerDependencies,
    private readonly cluster: Cluster,
  ) {}

  /**
   *
   * @returns The path to the temporary kubeconfig
   */
  async ensurePath(): Promise<string> {
    if (this.tempFilePath === null || !(await this.dependencies.pathExists(this.tempFilePath))) {
      return await this.ensureFile();
    }

    return this.tempFilePath;
  }

  /**
   * Deletes the temporary kubeconfig file
   */
  async clear(): Promise<void> {
    this.unsubscribeFromRotation?.();
    this.unsubscribeFromRotation = undefined;

    if (!this.tempFilePath) {
      return;
    }

    this.dependencies.logger.info(`[KUBECONFIG-MANAGER]: Deleting temporary kubeconfig: ${this.tempFilePath}`);

    try {
      await this.dependencies.removePath(this.tempFilePath);
    } catch (error) {
      if (isErrnoException(error) && error.code !== "ENOENT") {
        throw error;
      }
    } finally {
      this.tempFilePath = null;
    }
  }

  protected async ensureFile() {
    try {
      await this.dependencies.kubeAuthProxyServer.ensureRunning();

      this.tempFilePath = await this.createProxyKubeconfig();

      // R4-08: keep the token inside the file current when the cluster token rotates
      this.unsubscribeFromRotation ??= this.dependencies.proxyAuthTokens.onRotated((scope, token) => {
        if (scope === this.cluster.id && this.tempFilePath) {
          this.refreshForRotation(token);
        }
      });

      return this.tempFilePath;
    } catch (error) {
      throw new Error(`Failed to create temp config for auth-proxy: ${error}`);
    }
  }

  /**
   * The old token is already invalid (rotation only happens on disconnect), so there is no grace period:
   * the file is replaced atomically with the new token. A token that was revoked or superseded while
   * queued is never written, and a file written after `clear()` is removed again.
   */
  private refreshForRotation(token: string): void {
    const { logger, proxyAuthTokens, removePath } = this.dependencies;

    this.rotationQueue = this.rotationQueue.then(async () => {
      if (!this.tempFilePath || !proxyAuthTokens.verify(this.cluster.id, token)) {
        return;
      }

      const written = await this.createProxyKubeconfig(token);

      if (!this.tempFilePath) {
        await removePath(written).catch(() => undefined);
      }
    }).catch((error) => logger.warn(`[KUBECONFIG-MANAGER]: Failed to refresh temporary kubeconfig: ${error}`));
  }

  /**
   * Creates new "temporary" kubeconfig that point to the kubectl-proxy.
   * This way any user of the config does not need to know anything about the auth etc. details.
   */
  protected async createProxyKubeconfig(token = this.dependencies.proxyAuthTokens.get(this.cluster.id)): Promise<string> {
    const { id, preferences: { defaultNamespace }} = this.cluster;
    const contextName = this.cluster.contextName.get();
    const tempFile = this.dependencies.joinPaths(
      this.dependencies.directoryForTemp,
      `kubeconfig-${id}`,
    );
    const kubeConfig = await this.dependencies.loadKubeconfig();
    const proxyConfig: PartialDeep<KubeConfig> = {
      currentContext: contextName,
      clusters: [
        {
          name: contextName,
          server: this.dependencies.kubeAuthProxyUrl,
          skipTLSVerify: false,
          caData: Buffer.from(this.dependencies.certificate.cert).toString("base64"),
        },
      ],
      users: [
        { name: "proxy", token },
      ],
      contexts: [
        {
          user: "proxy",
          name: contextName,
          cluster: contextName,
          namespace: defaultNamespace || kubeConfig.getContextObject(contextName)?.namespace,
        },
      ],
    };
    // write
    const configYaml = dumpConfigYaml(proxyConfig);

    // Atomic replace: readers see either the old or the new complete file, never a partial one.
    // ponytail: no fsync; the file is regenerated on demand, so only crash durability is given up.
    const stagingFile = `${tempFile}.${randomBytes(6).toString("hex")}.tmp`;

    try {
      await this.dependencies.writeFile(stagingFile, configYaml, { mode: 0o600, flag: "wx" });
      await (this.dependencies.renameFile ?? rename)(stagingFile, tempFile);
    } catch (error) {
      await this.dependencies.removePath(stagingFile).catch(() => undefined);
      throw error;
    }

    this.dependencies.logger.debug(`[KUBECONFIG-MANAGER]: Created temp kubeconfig "${contextName}" at "${tempFile}"`);

    return tempFile;
  }
}
