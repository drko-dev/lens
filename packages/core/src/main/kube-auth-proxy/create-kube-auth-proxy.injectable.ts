/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable, lifecycleEnum } from "@ogre-tools/injectable";
import type { Cluster } from "../../common/cluster/cluster";
import spawnInjectable from "../child-process/spawn.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import waitUntilPortIsUsedInjectable from "./wait-until-port-is-used/wait-until-port-is-used.injectable";
import lensK8sProxyPathInjectable from "./lens-k8s-proxy-path.injectable";
import getPortFromStreamInjectable from "../utils/get-port-from-stream.injectable";
import getDirnameOfPathInjectable from "../../common/path/get-dirname.injectable";
import randomBytesInjectable from "../../common/utils/random-bytes.injectable";
import type { ChildProcess } from "child_process";
import { observable, when } from "mobx";
import assert from "assert";
import clusterApiUrlInjectable from "../../features/cluster/connections/main/api-url.injectable";
import kubeAuthProxyCertificateInjectable from "./kube-auth-proxy-certificate.injectable";
import kubeAuthProxyClientCertificateInjectable from "./kube-auth-proxy-client-certificate.injectable";
import lensK8sProxySupportsClientAuthInjectable from "./lens-k8s-proxy-supports-client-auth.injectable";
import broadcastConnectionUpdateInjectable from "../cluster/broadcast-connection-update.injectable";
import { TypedRegEx } from "typed-regex";

export interface KubeAuthProxy {
  readonly apiPrefix: string;
  readonly port: number;
  run: () => Promise<void>;
  exit: () => void;
}

export type CreateKubeAuthProxy = (env: NodeJS.ProcessEnv) => KubeAuthProxy;

const startingServeMatcher = "starting to serve on (?<address>.+)";
const startingServeRegex = Object.assign(TypedRegEx(startingServeMatcher, "i"), {
  rawMatcher: startingServeMatcher,
});

const createKubeAuthProxyInjectable = getInjectable({
  id: "create-kube-auth-proxy",

  instantiate: (di, cluster): CreateKubeAuthProxy => {
    const lensK8sProxyPath = di.inject(lensK8sProxyPathInjectable);
    const spawn = di.inject(spawnInjectable);
    const logger = di.inject(loggerInjectionToken);
    const waitUntilPortIsUsed = di.inject(waitUntilPortIsUsedInjectable);
    const getPortFromStream = di.inject(getPortFromStreamInjectable);
    const getDirnameOfPath = di.inject(getDirnameOfPathInjectable);
    const randomBytes = di.inject(randomBytesInjectable);
    const clusterApiUrl = di.inject(clusterApiUrlInjectable, cluster);
    const broadcastConnectionUpdate = di.inject(broadcastConnectionUpdateInjectable, cluster);
    const clientCertificate = di.inject(kubeAuthProxyClientCertificateInjectable);
    const supportsClientAuth = di.inject(lensK8sProxySupportsClientAuthInjectable);

    return (env) => {
      let port: number | undefined;
      let proxyProcess: ChildProcess | undefined;
      const ready = observable.box(false);
      const apiPrefix = `/${randomBytes(8).toString("hex")}`;

      // `run` awaits before it spawns, so concurrent callers must share one start and `exit` must cancel a start in flight.
      let starting: Promise<void> | undefined;
      let generation = 0;

      const exit = () => {
        generation += 1;
        ready.set(false);

        if (proxyProcess) {
          logger.debug("[KUBE-AUTH]: stopping local proxy", cluster.getMeta());
          proxyProcess.removeAllListeners();
          proxyProcess.stderr?.removeAllListeners();
          proxyProcess.stdout?.removeAllListeners();
          proxyProcess.kill();
          proxyProcess = undefined;
        }
      };

      const maxStartupAttempts = 3;

      const start = async (attempt: number): Promise<void> => {
        if (proxyProcess) {
          return when(() => ready.get());
        }

        const startGeneration = generation;
        const apiUrl = await clusterApiUrl();
        const certificate = di.inject(kubeAuthProxyCertificateInjectable, apiUrl.hostname);

        const hardened = await supportsClientAuth();

        if (startGeneration !== generation) {
          throw new Error("Authentication proxy start was cancelled by exit()");
        }

        const secrets = { apiPrefix, proxyCert: certificate.cert, proxyKey: certificate.private };

        // R4-09: the OpenLens build reads its secrets from stdin and requires Main's client certificate.
        // The stock binary only knows the legacy environment launch (accepted inherited risk: any local
        // process of the user can read the prefix from the environment and use the proxy unauthenticated).
        proxyProcess = spawn(lensK8sProxyPath, [], {
          env: {
            ...env,
            KUBECONFIG: cluster.kubeConfigPath.get(),
            KUBECONFIG_CONTEXT: cluster.contextName.get(),
            ...(hardened
              ? { LENS_PROXY_STDIN_CONFIG: "1" }
              : { API_PREFIX: secrets.apiPrefix, PROXY_CERT: secrets.proxyCert, PROXY_KEY: secrets.proxyKey }),
          },
          cwd: getDirnameOfPath(cluster.kubeConfigPath.get()),
        });

        if (hardened) {
          proxyProcess.stdin?.on("error", () => {});
          proxyProcess.stdin?.end(`${JSON.stringify({ ...secrets, clientCa: clientCertificate.cert })}\n`);
        } else {
          logger.warn("[KUBE-AUTH-PROXY]: stock lens-k8s-proxy without client authentication (accepted inherited risk)");
        }
        proxyProcess.on("error", (error) => {
          broadcastConnectionUpdate({
            level: "error",
            message: error.message,
          });
          exit();
        });

        proxyProcess.on("exit", (code) => {
          if (code) {
            broadcastConnectionUpdate({
              level: "error",
              message: `proxy exited with code: ${code}`,
            });
          } else {
            broadcastConnectionUpdate({
              level: "info",
              message: "proxy exited successfully",
            });
          }
          exit();
        });

        proxyProcess.on("disconnect", () => {
          broadcastConnectionUpdate({
            level: "error",
            message: "Proxy disconnected communications",
          });
          exit();
        });

        assert(proxyProcess.stderr);
        assert(proxyProcess.stdout);

        proxyProcess.stderr.on("data", (data: Buffer) => {
          if (data.includes("http: TLS handshake error")) {
            return;
          }

          broadcastConnectionUpdate({
            level: "error",
            message: data.toString(),
          });
        });

        proxyProcess.stdout.on("data", (data: Buffer) => {
          if (typeof port === "number") {
            broadcastConnectionUpdate({
              level: "info",
              message: data.toString(),
            });
          }
        });

        let clientAuthRequired = false;

        proxyProcess.stdout.on("data", (data: Buffer) => {
          clientAuthRequired ||= data.includes("client authentication: required");
        });

        port = await getPortFromStream(proxyProcess.stdout, {
          lineRegex: startingServeRegex,
          onFind: () => broadcastConnectionUpdate({
            level: "info",
            message: "Authentication proxy started",
          }),
        });

        logger.info(`[KUBE-AUTH-PROXY]: found port=${port}`);

        if (hardened && !clientAuthRequired) {
          // Fail closed: a binary that claims the OpenLens build must actually enforce client authentication
          const failMessage = "lens-k8s-proxy does not enforce client authentication; refusing to use it";

          exit();
          logger.error(`[KUBE-AUTH-PROXY]: ${failMessage}`);
          broadcastConnectionUpdate({
            level: "error",
            message: failMessage,
          });
          throw new Error(failMessage);
        }

        try {
          await waitUntilPortIsUsed(port, 500, 10000);
          ready.set(true);
        } catch (error) {
          logger.warn("[KUBE-AUTH-PROXY]: waitUntilUsed failed", error);
          exit();

          if (attempt >= maxStartupAttempts) {
            const failMessage = `Authentication proxy failed to become ready after ${maxStartupAttempts} attempts`;

            broadcastConnectionUpdate({
              level: "error",
              message: failMessage,
            });
            throw new Error(failMessage);
          }

          broadcastConnectionUpdate({
            level: "error",
            message: "Proxy port failed to be used within time limit, restarting...",
          });

          return start(attempt + 1);
        }
      };

      const run = async (): Promise<void> => {
        if (proxyProcess) {
          return when(() => ready.get());
        }

        const pending = starting ??= start(1).finally(() => {
          starting = undefined;
        });

        return pending;
      };

      return {
        apiPrefix,
        exit,
        run,
        get port() {
          assert(port, "port has not yet been initialized");

          return port;
        },
      };
    };
  },
  lifecycle: lifecycleEnum.keyedSingleton({
    getInstanceKey: (di, cluster: Cluster) => cluster.id,
  }),
});

export default createKubeAuthProxyInjectable;
