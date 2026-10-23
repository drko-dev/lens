/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { Cluster } from "../../../common/cluster/cluster";
import type WebSocket from "ws";
import createKubectlInjectable from "../../kubectl/create-kubectl.injectable";
import type { NodeShellSessionDependencies } from "./node-shell-session";
import { NodeShellSession } from "./node-shell-session";
import isMacInjectable from "../../../common/vars/is-mac.injectable";
import isWindowsInjectable from "../../../common/vars/is-windows.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import createKubeJsonApiForClusterInjectable from "../../../common/k8s-api/create-kube-json-api-for-cluster.injectable";
import computeShellEnvironmentInjectable from "../../../features/shell-sync/main/compute-shell-environment.injectable";
import spawnPtyInjectable from "../spawn-pty.injectable";
import appNameInjectable from "../../../common/vars/app-name.injectable";
import emitAppEventInjectable from "../../../common/app-event-bus/emit-event.injectable";
import statInjectable from "../../../common/fs/stat.injectable";
import createKubeApiInjectable from "../../../common/k8s-api/create-kube-api.injectable";
import loadProxyKubeconfigInjectable from "../../cluster/load-proxy-kubeconfig.injectable";
import kubeconfigManagerInjectable from "../../kubeconfig-manager/kubeconfig-manager.injectable";
import userShellSettingInjectable from "../../../features/user-preferences/common/shell-setting.injectable";
import shellSessionEnvsInjectable from "../shell-envs.injectable";
import shellSessionProcessesInjectable from "../processes.injectable";
import shellSessionHandoverInjectable from "../shell-session-handover.injectable";
import { buildVersionInitializable } from "../../../features/vars/build-version/common/token";
import { isProductionEnvironment } from "../../../common/cluster/environment-types";
import { NodeApi } from "../../../common/k8s-api/endpoints";
import nodeShellAuthRegistryInjectable from "./node-shell-auth-registry.injectable";
import { NODE_SHELL_OPEN_OPERATION } from "./node-shell-auth-registry";

export interface NodeShellSessionArgs {
  websocket: WebSocket;
  cluster: Cluster;
  tabId: string;
  nodeName: string;
}

export type OpenNodeShellSession = (args: NodeShellSessionArgs) => Promise<void>;

const openNodeShellSessionInjectable = getInjectable({
  id: "open-node-shell-session",
  instantiate: (di): OpenNodeShellSession => {
    const createKubectl = di.inject(createKubectlInjectable);
    // Instantiated eagerly so the main-process authorization handler is registered during app
    // startup, before the renderer can request a PROD Node Shell authorization.
    const nodeShellAuthRegistry = di.inject(nodeShellAuthRegistryInjectable);
    const dependencies: Omit<NodeShellSessionDependencies, "proxyKubeconfigPath" | "loadProxyKubeconfig" | "directoryContainingKubectl"> = {
      isMac: di.inject(isMacInjectable),
      isWindows: di.inject(isWindowsInjectable),
      logger: di.inject(loggerInjectionToken),
      userShellSetting: di.inject(userShellSettingInjectable),
      appName: di.inject(appNameInjectable),
      buildVersion: di.inject(buildVersionInitializable.stateToken),
      shellSessionEnvs: di.inject(shellSessionEnvsInjectable),
      shellSessionProcesses: di.inject(shellSessionProcessesInjectable),
      shellSessionHandover: di.inject(shellSessionHandoverInjectable),
      createKubeJsonApiForCluster: di.inject(createKubeJsonApiForClusterInjectable),
      computeShellEnvironment: di.inject(computeShellEnvironmentInjectable),
      spawnPty: di.inject(spawnPtyInjectable),
      emitAppEvent: di.inject(emitAppEventInjectable),
      stat: di.inject(statInjectable),
      createKubeApi: di.inject(createKubeApiInjectable),
    };

    return async (args) => {
      if (!args.cluster.preferences?.nodeShellEnabled) {
        throw new Error(
          `Node shell is disabled for cluster "${args.cluster.name.get()}". Privileged host access must be explicitly enabled in Cluster Settings.`,
        );
      }

      const isProd = isProductionEnvironment(args.cluster.preferences);

      if (isProd) {
        // `tabId` is the opaque grant id issued by the main process. A renderer-chosen tab id has
        // no matching grant and is rejected. The grant is single-use and bound to this exact
        // cluster + node + operation, and only a native PROD confirmation can produce it.
        const isAuthorized = nodeShellAuthRegistry.consume({
          grantId: args.tabId,
          clusterId: args.cluster.id,
          nodeName: args.nodeName,
          operation: NODE_SHELL_OPEN_OPERATION,
          requireProductionConfirmation: true,
        });

        if (!isAuthorized) {
          throw new Error(
            `[SECURITY HAZARD] Privileged Node Shell on PRODUCTION cluster "${args.cluster.name.get()}" for node "${args.nodeName}" rejected: missing explicit per-operation operator authorization.`,
          );
        }
      }

      // Backend safety check: verify target node existence BEFORE creating privileged pod
      const nodeApi = dependencies.createKubeApi(NodeApi, {
        request: dependencies.createKubeJsonApiForCluster(args.cluster.id),
      });
      const node = await nodeApi.get({ name: args.nodeName });

      if (!node) {
        throw new Error(
          `Target node "${args.nodeName}" does not exist in cluster "${args.cluster.name.get()}". Aborting privileged node shell session.`,
        );
      }

      const kubectl = createKubectl(args.cluster.version.get());
      const kubeconfigManager = di.inject(kubeconfigManagerInjectable, args.cluster);
      const loadProxyKubeconfig = di.inject(loadProxyKubeconfigInjectable, args.cluster);
      const proxyKubeconfigPath = await kubeconfigManager.ensurePath();
      const directoryContainingKubectl = await kubectl.binDir();

      const session = new NodeShellSession({
        ...dependencies,
        loadProxyKubeconfig,
        proxyKubeconfigPath,
        directoryContainingKubectl,
      }, { kubectl, ...args });

      return session.open();
    };
  },
});

export default openNodeShellSessionInjectable;
