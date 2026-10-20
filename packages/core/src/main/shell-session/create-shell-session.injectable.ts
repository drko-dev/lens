/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { Cluster } from "../../common/cluster/cluster";
import type WebSocket from "ws";
import openLocalShellSessionInjectable from "./local-shell-session/open.injectable";
import openNodeShellSessionInjectable from "./node-shell-session/open.injectable";
import openPodShellSessionInjectable from "./pod-shell-session/open.injectable";

export interface OpenShellSessionArgs {
  websocket: WebSocket;
  cluster: Cluster;
  tabId: string;
  nodeName?: string;
  podName?: string;
  namespace?: string;
  containerName?: string;
}

export type OpenShellSession = (args: OpenShellSessionArgs) => Promise<void>;

const openShellSessionInjectable = getInjectable({
  id: "open-shell-session",

  instantiate: (di): OpenShellSession => {
    const openLocalShellSession = di.inject(openLocalShellSessionInjectable);
    const openNodeShellSession = di.inject(openNodeShellSessionInjectable);
    const openPodShellSession = di.inject(openPodShellSessionInjectable);

    return ({ nodeName, podName, namespace, containerName, ...args }) => {
      if (podName && namespace && containerName) {
        return openPodShellSession({ podName, namespace, containerName, ...args });
      }

      if (nodeName) {
        return openNodeShellSession({ nodeName, ...args });
      }

      return openLocalShellSession(args);
    };
  },
});

export default openShellSessionInjectable;
