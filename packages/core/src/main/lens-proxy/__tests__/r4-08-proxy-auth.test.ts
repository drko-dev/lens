/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { ProxyAuthTokens, APP_SCOPE } from "../proxy-auth-tokens";
import type { ProxyRequestFacts } from "../authorize-proxy-request";
import { authorizeProxyRequest, stripProxyAuth } from "../authorize-proxy-request";
import { proxyAuthHeaderName } from "../../../common/lens-proxy-auth/proxy-auth";

const PORT = 41234;
const DEV = "dev-cluster-id";
const PROD = "prod-cluster-id";

describe("R4-08 lens proxy capability tokens", () => {
  let tokens: ProxyAuthTokens;
  let devToken: string;
  let prodToken: string;
  let appToken: string;

  const facts = (overrides: Partial<ProxyRequestFacts> & { headers?: ProxyRequestFacts["headers"] }): ProxyRequestFacts => ({
    method: "GET",
    originalUrl: "/api-kube/api/v1/secrets",
    isUpgrade: false,
    clusterId: DEV,
    ...overrides,
    headers: { host: `${DEV}.lens.app:${PORT}`, ...overrides.headers },
  });
  const decide = (f: ProxyRequestFacts) => authorizeProxyRequest(f, PORT, tokens);

  beforeEach(() => {
    tokens = new ProxyAuthTokens();
    devToken = tokens.get(DEV);
    prodToken = tokens.get(PROD);
    appToken = tokens.get(APP_SCOPE);
  });

  describe("tokens", () => {
    it("issues 32-byte random tokens, distinct per scope and stable until rotated", () => {
      expect(Buffer.from(devToken, "base64url")).toHaveLength(32);
      expect(new Set([devToken, prodToken, appToken]).size).toBe(3);
      expect(tokens.get(DEV)).toBe(devToken);
    });

    it("verifies only the exact scope", () => {
      expect(tokens.verify(DEV, devToken)).toBe(true);
      expect(tokens.verify(PROD, devToken)).toBe(false);
      expect(tokens.verify(APP_SCOPE, devToken)).toBe(false);
      expect(tokens.verify("unknown", devToken)).toBe(false);
    });

    it("rejects malformed, empty, oversized and non-string tokens", () => {
      expect(tokens.verify(DEV, "")).toBe(false);
      expect(tokens.verify(DEV, undefined)).toBe(false);
      expect(tokens.verify(DEV, ["x"])).toBe(false);
      expect(tokens.verify(DEV, devToken.slice(0, -2))).toBe(false);
      expect(tokens.verify(DEV, devToken + "A".repeat(200))).toBe(false);
    });

    it("rotation invalidates the old token immediately and notifies listeners with the new one", () => {
      const seen: [string, string][] = [];

      tokens.onRotated((scope, token) => seen.push([scope, token]));
      tokens.rotate(DEV);

      expect(tokens.verify(DEV, devToken)).toBe(false);
      expect(seen).toHaveLength(1);
      expect(seen[0][0]).toBe(DEV);
      expect(tokens.verify(DEV, seen[0][1])).toBe(true);
      expect(tokens.verify(PROD, prodToken)).toBe(true);
    });

    it("revoke and revokeAll leave no valid token", () => {
      tokens.revoke(DEV);
      expect(tokens.verify(DEV, devToken)).toBe(false);
      tokens.revokeAll();
      expect(tokens.verify(PROD, prodToken)).toBe(false);
      expect(tokens.verify(APP_SCOPE, appToken)).toBe(false);
    });
  });

  describe("Kubernetes access", () => {
    it("allows the cluster's own token in the header or as a Bearer token", () => {
      expect(decide(facts({ headers: { [proxyAuthHeaderName]: devToken }}))).toEqual({ allowed: true, authenticated: true });
      expect(decide(facts({ headers: { authorization: `Bearer ${devToken}` }}))).toEqual({ allowed: true, authenticated: true });
    });

    it("rejects requests without a token (fail closed)", () => {
      expect(decide(facts({}))).toMatchObject({ allowed: false, status: 401 });
    });

    it("rejects another cluster's token (cross-cluster)", () => {
      expect(decide(facts({ headers: { [proxyAuthHeaderName]: prodToken }}))).toMatchObject({ allowed: false, status: 401 });
      expect(decide(facts({ clusterId: PROD, headers: { host: `${PROD}.lens.app:${PORT}`, [proxyAuthHeaderName]: devToken }}))).toMatchObject({ allowed: false, status: 401 });
    });

    it("rejects the app token for cluster-bound Kubernetes requests", () => {
      expect(decide(facts({ headers: { [proxyAuthHeaderName]: appToken }}))).toMatchObject({ allowed: false, status: 401 });
    });

    it("rejects a Kubernetes request whose host resolves no cluster", () => {
      expect(decide(facts({ clusterId: undefined, headers: { host: `lens.app:${PORT}`, [proxyAuthHeaderName]: appToken }}))).toMatchObject({ allowed: false, status: 401 });
    });

    it("protects the 127.0.0.1:<port>/<clusterId> path form used by kubeconfig clients", () => {
      const pathForm = (headers: ProxyRequestFacts["headers"]) => facts({ originalUrl: `/${DEV}/api/v1/namespaces`, headers: { host: `127.0.0.1:${PORT}`, ...headers }});

      expect(decide(pathForm({}))).toMatchObject({ allowed: false, status: 401 });
      expect(decide(pathForm({ authorization: `Bearer ${prodToken}` }))).toMatchObject({ allowed: false, status: 401 });
      expect(decide(pathForm({ authorization: `Bearer ${devToken}` }))).toEqual({ allowed: true, authenticated: true });
    });

    it("ignores tokens passed in the query string", () => {
      expect(decide(facts({ originalUrl: `/api-kube/api/v1/pods?token=${devToken}&${proxyAuthHeaderName}=${devToken}` }))).toMatchObject({ allowed: false, status: 401 });
    });

    it("rejects a revoked token after disconnect", () => {
      tokens.rotate(DEV);
      expect(decide(facts({ headers: { [proxyAuthHeaderName]: devToken }}))).toMatchObject({ allowed: false, status: 401 });
    });

    it("requires a token for non-shell upgrades (exec/attach/port-forward)", () => {
      const upgrade = (headers: ProxyRequestFacts["headers"]) => facts({ isUpgrade: true, originalUrl: "/api/v1/namespaces/default/pods/web-0/exec?command=sh", headers });

      expect(decide(upgrade({}))).toMatchObject({ allowed: false, status: 401 });
      expect(decide(upgrade({ [proxyAuthHeaderName]: prodToken }))).toMatchObject({ allowed: false, status: 401 });
      expect(decide(upgrade({ authorization: `Bearer ${devToken}` }))).toEqual({ allowed: true, authenticated: true });
    });

    it("leaves the shell upgrade to its own single-use shell token", () => {
      expect(decide(facts({ isUpgrade: true, originalUrl: "/api?id=tab-1&shellToken=abc" }))).toEqual({ allowed: true, authenticated: false });
    });
  });

  describe("local API routes", () => {
    it("requires the cluster token for /api routes on a cluster host", () => {
      const pf = (headers: ProxyRequestFacts["headers"]) => facts({ method: "POST", originalUrl: "/api/pods/port-forward/default/pod/web-0?port=80", headers });

      expect(decide(pf({}))).toMatchObject({ allowed: false, status: 401 });
      expect(decide(pf({ [proxyAuthHeaderName]: prodToken }))).toMatchObject({ allowed: false, status: 401 });
      expect(decide(pf({ [proxyAuthHeaderName]: devToken }))).toEqual({ allowed: true, authenticated: true });
    });

    it("requires the app token for /api routes not bound to a cluster", () => {
      const charts = (headers: ProxyRequestFacts["headers"]) => facts({ clusterId: undefined, originalUrl: "/api/v2/charts", headers: { host: `lens.app:${PORT}`, ...headers }});

      expect(decide(charts({}))).toMatchObject({ allowed: false, status: 401 });
      expect(decide(charts({ [proxyAuthHeaderName]: devToken }))).toMatchObject({ allowed: false, status: 401 });
      expect(decide(charts({ [proxyAuthHeaderName]: appToken }))).toEqual({ allowed: true, authenticated: true });
    });
  });

  describe("public resources", () => {
    it("serves static frontend files and /version without a token", () => {
      expect(decide(facts({ originalUrl: "/index.html" }))).toEqual({ allowed: true, authenticated: false });
      expect(decide(facts({ clusterId: undefined, originalUrl: "/version", headers: { host: `127.0.0.1:${PORT}` }}))).toEqual({ allowed: true, authenticated: false });
    });

    it("does not accept non-GET methods without a token, even on static paths", () => {
      expect(decide(facts({ method: "POST", originalUrl: "/index.html" }))).toMatchObject({ allowed: false, status: 401 });
      expect(decide(facts({ method: "DELETE", originalUrl: "/anything" }))).toMatchObject({ allowed: false, status: 401 });
    });
  });

  describe("Host and Origin", () => {
    it("rejects missing, foreign or wrong-port hosts (DNS rebinding)", () => {
      const withHost = (host: string | undefined) => decide(facts({ originalUrl: "/index.html", headers: { host, [proxyAuthHeaderName]: devToken }}));

      expect(withHost(undefined)).toMatchObject({ allowed: false, status: 421 });
      expect(withHost(`evil.example:${PORT}`)).toMatchObject({ allowed: false, status: 421 });
      expect(withHost(`${DEV}.lens.app.evil.example:${PORT}`)).toMatchObject({ allowed: false, status: 421 });
      expect(withHost(`${DEV}.lens.app:1`)).toMatchObject({ allowed: false, status: 421 });
      // Missing port is OK for local Lens hosts (Electron 45 may omit it).
      expect(withHost(`127.0.0.1`)).toEqual({ allowed: true, authenticated: false });
      expect(withHost(`lens.app`)).toEqual({ allowed: true, authenticated: false });
    });

    it("rejects foreign origins and another cluster frame's origin", () => {
      const withOrigin = (origin: string) => decide(facts({ headers: { origin, [proxyAuthHeaderName]: devToken }}));

      expect(withOrigin("https://evil.example")).toMatchObject({ allowed: false, status: 403 });
      expect(withOrigin(`https://${PROD}.lens.app:${PORT}`)).toMatchObject({ allowed: false, status: 403 });
      expect(withOrigin(`http://${DEV}.lens.app:${PORT}`)).toMatchObject({ allowed: false, status: 403 });
      expect(withOrigin(`https://${DEV}.lens.app:${PORT}`)).toEqual({ allowed: true, authenticated: true });
      expect(withOrigin(`https://lens.app:${PORT}`)).toEqual({ allowed: true, authenticated: true });
    });
  });

  it("stripProxyAuth removes the proxy credential and Authorization before forwarding", () => {
    const headers: Record<string, unknown> = { [proxyAuthHeaderName]: devToken, authorization: `Bearer ${devToken}`, accept: "application/json" };

    stripProxyAuth(headers);
    expect(headers).toEqual({ accept: "application/json" });
  });
});
