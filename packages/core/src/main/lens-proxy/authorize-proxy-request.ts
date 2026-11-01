/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { apiKubePrefix, apiPrefix } from "../../common/vars";
import { proxyAuthHeaderName } from "../../common/lens-proxy-auth/proxy-auth";
import type { ProxyAuthTokens } from "./proxy-auth-tokens";
import { APP_SCOPE } from "./proxy-auth-tokens";

export interface ProxyRequestFacts {
  readonly method: string;
  /** The URL as received, before any cluster-prefix rewriting. */
  readonly originalUrl: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly isUpgrade: boolean;
  /** Cluster resolved from Host or from the `127.0.0.1:<port>/<clusterId>` path form. */
  readonly clusterId: string | undefined;
}

export type ProxyAuthDecision =
  | { readonly allowed: true; readonly authenticated: boolean }
  | { readonly allowed: false; readonly status: 401 | 403 | 421; readonly reason: string };

const loopbackHosts = ["127.0.0.1", "localhost"];

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function presentedToken(headers: ProxyRequestFacts["headers"]): string | undefined {
  const explicit = single(headers[proxyAuthHeaderName]);

  if (explicit) {
    return explicit;
  }

  const authorization = single(headers.authorization);
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]{16,128})$/);

  return match?.[1];
}

/**
 * Decides whether a lens proxy request may proceed. Fail-closed: anything that reaches
 * Kubernetes or a local API route needs the capability token of exactly its scope.
 * Static frontend files and `/version` stay public (they carry no cluster data).
 */
export function authorizeProxyRequest(facts: ProxyRequestFacts, port: number, tokens: ProxyAuthTokens): ProxyAuthDecision {
  const host = single(facts.headers.host)?.toLowerCase();

  if (!host) {
    return { allowed: false, status: 421, reason: "missing host" };
  }

  const [hostname, hostPort] = host.split(":");
  const isLoopback = loopbackHosts.includes(hostname);
  const isLensHost = hostname === "lens.app" || /^[a-z0-9-]+\.lens\.app$/.test(hostname);

  // Electron 45 + host-resolver-rules may omit the port in Host (or send Host for
  // lens.app while connecting to 127.0.0.1:<ephemeral>). Treat missing port as the
  // active proxy port for known local Lens hosts only.
  const portOk = !hostPort || hostPort === String(port);

  if (!portOk || !(isLoopback || isLensHost)) {
    return { allowed: false, status: 421, reason: "unexpected host" };
  }

  const hostClusterId = isLensHost && hostname !== "lens.app" ? hostname.slice(0, -".lens.app".length) : undefined;
  const origin = single(facts.headers.origin);

  if (origin && origin !== "null") {
    const allowedOrigins = new Set([`https://lens.app:${port}`]);

    if (hostClusterId) {
      allowedOrigins.add(`https://${hostClusterId}.lens.app:${port}`);
    }

    if (!allowedOrigins.has(origin.toLowerCase())) {
      return { allowed: false, status: 403, reason: "origin not allowed" };
    }
  }

  const path = facts.originalUrl.split("?")[0];
  const isApiPath = path === apiPrefix || path.startsWith(`${apiPrefix}/`) || path.startsWith(apiKubePrefix);
  const isPathForm = isLoopback && facts.clusterId !== undefined && path.startsWith(`/${facts.clusterId}`);
  const isShellUpgrade = facts.isUpgrade && facts.originalUrl.startsWith(`${apiPrefix}?`);

  if (isShellUpgrade) {
    // Authenticated by the single-use shell token of the shell route.
    return { allowed: true, authenticated: false };
  }

  const needsToken = facts.isUpgrade || isApiPath || isPathForm
    || !(facts.method === "GET" || facts.method === "HEAD");

  if (!needsToken) {
    return { allowed: true, authenticated: false }; // static frontend files and /version
  }

  const kubernetesBound = facts.isUpgrade || isPathForm || path.startsWith(apiKubePrefix);
  const scope = facts.clusterId ?? (kubernetesBound ? undefined : APP_SCOPE);

  if (scope === undefined || !tokens.verify(scope, presentedToken(facts.headers))) {
    return { allowed: false, status: 401, reason: "unauthorized" };
  }

  return { allowed: true, authenticated: true };
}

/** Removes every credential header the proxy itself consumed before forwarding upstream. */
export function stripProxyAuth(headers: Record<string, unknown>): void {
  delete headers[proxyAuthHeaderName];
  delete headers.authorization;
}
