/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import ipcRendererInjectable from "../../utils/channel/ipc-renderer.injectable";
import { NODE_SHELL_AUTHORIZATION_CHANNEL } from "../../../common/node-shell-channels";

export interface NodeShellAuthorizationRequest {
  clusterId: string;
  nodeName: string;
}

/**
 * The renderer never supplies the authorization identifier. It only learns the main-process issued
 * tab id when the request is granted, and it must use that exact id for the terminal tab.
 */
export interface NodeShellAuthorizationResult {
  granted: boolean;
  tabId?: string;
  reason?: string;
}

export type AuthorizeNodeShell = (request: NodeShellAuthorizationRequest) => Promise<NodeShellAuthorizationResult>;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

const isAuthorizationResult = (value: unknown): value is NodeShellAuthorizationResult => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as NodeShellAuthorizationResult;

  if (typeof candidate.granted !== "boolean") {
    return false;
  }

  return !candidate.granted || isNonEmptyString(candidate.tabId);
};

const authorizeNodeShellInjectable = getInjectable({
  id: "authorize-node-shell",
  instantiate: (di): AuthorizeNodeShell => {
    const ipcRenderer = di.inject(ipcRendererInjectable);

    return async (request) => {
      try {
        const response = await ipcRenderer.invoke(NODE_SHELL_AUTHORIZATION_CHANNEL, {
          clusterId: request.clusterId,
          nodeName: request.nodeName,
        });

        if (!isAuthorizationResult(response)) {
          return { granted: false, reason: "invalid-response" };
        }

        return response;
      } catch {
        return { granted: false, reason: "ipc-error" };
      }
    };
  },
});

export default authorizeNodeShellInjectable;
