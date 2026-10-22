/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { BrowserWindow, webContents } from "electron";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFramesInjectable from "../../common/cluster-frames.injectable";
import detachedToolWindowsFeatureFlagInjectable from "../../common/detached-tools/detached-tool-windows-feature-flag.injectable";
import { detachedToolFrameChannels } from "../../common/detached-tools/detached-tool-channels";
import getClusterByIdInjectable from "../../features/cluster/storage/common/get-by-id.injectable";
import { createToolContextFromCluster } from "../../common/workspace/tool-context";
import { request as httpsRequest } from "https";
import kubeAuthProxyServerInjectable from "../cluster/kube-auth-proxy-server.injectable";
import k8sRequestInjectable from "../k8s-request.injectable";
import detachedWindowRegistryInjectable from "./detached-window-registry.injectable";
import openDetachedToolWindowInjectable from "./open-detached-tool-window.injectable";
import { detachedWindowEventChannel } from "./detached-window-ipc";
import { DetachedToolSessionManager } from "./detached-tool-session-manager";

const detachedToolSessionManagerInjectable = getInjectable({
  id: "detached-tool-session-manager",

  instantiate: (di) => {
    const logger = di.inject(loggerInjectionToken);
    const clusterFrames = di.inject(clusterFramesInjectable);
    const getClusterById = di.inject(getClusterByIdInjectable);
    const k8sRequest = di.inject(k8sRequestInjectable);
    const openWindow = di.inject(openDetachedToolWindowInjectable);
    const registry = di.inject(detachedWindowRegistryInjectable);
    const flag = di.inject(detachedToolWindowsFeatureFlagInjectable);

    return new DetachedToolSessionManager({
      logger,
      isEnabled: () => flag.isEnabled,
      getClusterFrames: () => clusterFrames,
      getCluster: (clusterId) => {
        const cluster = getClusterById(clusterId);

        return cluster
          ? { id: cluster.id, name: createToolContextFromCluster(cluster, "detached").clusterName, preferences: cluster.preferences }
          : undefined;
      },
      openWindow,
      listOwned: clusterId => registry.windowsForCluster(clusterId),
      findOwner: key => registry.findOwner(key),
      closeWindow: (windowId) => {
        const contents = webContents.fromId(windowId);
        const window = contents && !contents.isDestroyed() ? BrowserWindow.fromWebContents(contents) : null;

        window?.close();
      },
      sendToWindow: (windowId, payload) => {
        const contents = webContents.fromId(windowId);

        if (contents && !contents.isDestroyed()) {
          contents.send(detachedWindowEventChannel, payload);
        }
      },
      sendToClusterFrame: (clusterId, notice) => {
        const frame = clusterFrames.get(clusterId);

        if (!frame) return;

        for (const view of webContents.getAllWebContents()) {
          try {
            view.sendToFrame([frame.processId, frame.frameId], detachedToolFrameChannels.redocked, notice);
          } catch (error) {
            logger.debug(`[DETACHED-TOOL]: could not notify frame of cluster ${clusterId}: ${error}`);
          }
        }
      },
      openLogStream: async (clusterId, params, signal) => {
        const query = new URLSearchParams({
          container: params.container,
          tailLines: String(params.tailLines),
          timestamps: String(params.timestamps),
          previous: String(params.previous),
          follow: String(!params.previous),
        });
        const cluster = getClusterById(clusterId);

        if (!cluster) {
          throw new Error(`Unknown cluster ${clusterId}`);
        }

        // Talk to this cluster's kube-auth-proxy directly (not through the lens proxy) so that
        // destroying the response closes the upstream follow connection.
        const { target, headers } = await di.inject(kubeAuthProxyServerInjectable, cluster).getApiTarget(true);
        const { host, port, path, ca, cert, key } = target as { host: string; port: number; path: string; ca: string; cert: string; key: string };

        return new Promise((resolve, reject) => {
          const req = httpsRequest({
            host,
            port,
            ca,
            cert, // R4-09: kube-auth-proxy requires Main's client certificate
            key,
            agent: false, // same as http-proxy: no shared agent, the app's patched global agent does not apply
            headers: headers as Record<string, string>,
            path: `${path}/api/v1/namespaces/${encodeURIComponent(params.namespace)}/pods/${encodeURIComponent(params.pod)}/log?${query}`,
            signal,
          }, (res) => {
            const status = res.statusCode ?? 0;

            if (status < 200 || status >= 300) {
              res.destroy();
              reject(new Error(`Failed to open pod log stream: ${status} ${res.statusMessage}`));
            } else {
              resolve(res);
            }
          });

          req.on("error", reject);
          req.end();
        });
      },
      getJson: (clusterId, pathAndQuery, signal) => k8sRequest({ id: clusterId }, pathAndQuery, { signal }),
    });
  },
});

export default detachedToolSessionManagerInjectable;
