/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectionToken } from "@ogre-tools/injectable";

/**
 * R4-08: capability tokens for the local lens proxy.
 *
 * Every request that reaches Kubernetes (`/api-kube`, non-shell upgrades, the
 * `127.0.0.1:<port>/<clusterId>` form) or a local API route (`/api/...`) must carry
 * the token Main issued for exactly that cluster (or the app token for routes that
 * are not bound to a cluster). Tokens live only in Main's memory, are sent in this
 * header (or as `Authorization: Bearer` by kubeconfig clients), are stripped before
 * forwarding, and are never put in URLs or logs.
 */
export const proxyAuthHeaderName = "x-openlens-proxy-token";

export const proxyAuthChannels = {
  /** frame → Main (invoke, no payload): the token for the sender frame's own scope */
  getFrameToken: "lens-proxy-auth:get-frame-token",
  /** Main → one frame: its token was rotated; payload `{ token: string }` */
  frameTokenRotated: "lens-proxy-auth:frame-token-rotated",
} as const;

/**
 * Headers to add to a request sent to the lens proxy on behalf of `clusterId`
 * (`undefined` = app scope). Implemented separately in Main and in the renderer.
 * Returns `{}` when no token is available, so the proxy fails closed.
 */
export type GetProxyAuthHeaders = (clusterId: string | undefined) => Record<string, string>;

export const getProxyAuthHeadersInjectionToken = getInjectionToken<GetProxyAuthHeaders>({
  id: "get-proxy-auth-headers",
});
