/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { proxyAuthHeaderName } from "../../common/lens-proxy-auth/proxy-auth";
import type { GetProxyAuthHeaders } from "../../common/lens-proxy-auth/proxy-auth";

/**
 * R4-08: in-memory token of this frame's own scope. `ownClusterId` is the hosted cluster id
 * (undefined in the root frame = app scope). Requests for any other scope get no token.
 */
export class FrameProxyAuth {
  private token: string | undefined;

  constructor(private readonly ownClusterId: string | undefined) {}

  setToken(token: unknown): void {
    if (typeof token === "string" && token.length > 0) {
      this.token = token;
    }
  }

  readonly getHeaders: GetProxyAuthHeaders = (clusterId) => {
    const headers: Record<string, string> = {};

    // A frame only ever talks to its own host: `undefined` (generic apiBase for `/api` routes)
    // means "this frame's scope". Asking for any other cluster yields no credential.
    if (this.token && (clusterId === undefined || clusterId === this.ownClusterId)) {
      headers[proxyAuthHeaderName] = this.token;
    }

    return headers;
  };
}
