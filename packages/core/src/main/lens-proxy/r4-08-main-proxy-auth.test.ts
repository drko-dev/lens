/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { getDiForUnitTesting } from "../getDiForUnitTesting";
import { getProxyAuthHeadersInjectionToken, proxyAuthHeaderName } from "../../common/lens-proxy-auth/proxy-auth";
import { APP_SCOPE } from "./proxy-auth-tokens";
import proxyAuthTokensInjectable from "./proxy-auth-tokens.injectable";
import { KubeconfigManager } from "../kubeconfig-manager/kubeconfig-manager";
import clusterConnectionInjectable from "../cluster/cluster-connection.injectable";
import appPathsStateInjectable from "../../common/app-paths/app-paths-state.injectable";
import directoryForUserDataInjectable from "../../common/app-paths/directory-for-user-data/directory-for-user-data.injectable";
import type { AppPaths } from "../../common/app-paths/app-path-injection-token";
import lensProxyPortInjectable from "./lens-proxy-port.injectable";
import type { Cluster } from "../../common/cluster/cluster";

const createDi = () => {
  const di = getDiForUnitTesting();

  di.override(directoryForUserDataInjectable, () => "/some-user-store-path");
  di.inject(lensProxyPortInjectable).set(1234);
  di.override(appPathsStateInjectable, () => ({ get: () => ({} as AppPaths), set: () => {} }));

  return di;
};

describe("R4-08 main proxy auth", () => {
  it("main getProxyAuthHeaders returns the scoped token", () => {
    const di = createDi();
    const tokens = di.inject(proxyAuthTokensInjectable);
    const getHeaders = di.inject(getProxyAuthHeadersInjectionToken);

    expect(getHeaders("c1")).toEqual({ [proxyAuthHeaderName]: tokens.get("c1") });
    expect(getHeaders(undefined)).toEqual({ [proxyAuthHeaderName]: tokens.get(APP_SCOPE) });
    expect(getHeaders("c1")[proxyAuthHeaderName]).not.toBe(getHeaders(undefined)[proxyAuthHeaderName]);
  });

  describe("kubeconfig", () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), "r4-08-"));
    });

    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("contains the cluster token with mode 0600, is rewritten on rotation and removed on clear", async () => {
      const di = createDi();
      const tokens = di.inject(proxyAuthTokensInjectable);
      const { writeFile, rm: removeFile, access } = await import("fs/promises");
      const manager = new KubeconfigManager({
        directoryForTemp: dir,
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
        certificate: { cert: "cert", private: "", public: "" },
        kubeAuthProxyServer: { ensureRunning: async () => {} } as never,
        kubeAuthProxyUrl: "https://127.0.0.1:1/c1",
        joinPaths: (...p: string[]) => path.join(...p),
        getDirnameOfPath: (p: string) => path.dirname(p),
        pathExists: async (p: string) => access(p).then(() => true, () => false),
        removePath: (p: string) => removeFile(p),
        writeFile: (p: string, c: string, o?: never) => writeFile(p, c, o),
        loadKubeconfig: async () => ({ getContextObject: () => undefined }) as never,
        proxyAuthTokens: tokens,
      } as never, {
        id: "c1",
        contextName: { get: () => "ctx" },
        preferences: {},
      } as unknown as Cluster);

      const file = await manager.ensurePath();
      const oldToken = tokens.get("c1");

      expect(await readFile(file, "utf-8")).toContain(oldToken);
      expect((await stat(file)).mode & 0o777).toBe(0o600);

      tokens.rotate("c1");
      const newToken = tokens.get("c1");

      await new Promise(resolve => setTimeout(resolve, 50));
      const rewritten = await readFile(file, "utf-8");

      expect(rewritten).toContain(newToken);
      expect(rewritten).not.toContain(oldToken);
      expect((await stat(file)).mode & 0o777).toBe(0o600);

      await manager.clear();
      await expect(stat(file)).rejects.toThrow();
    });
  });

  it("disconnect rotates the cluster token and removal revoke invalidates it", () => {
    const di = createDi();
    const tokens = di.inject(proxyAuthTokensInjectable);
    const flag = (v: boolean) => { let x = v;

      return { get: () => x, set: (n: boolean) => { x = n; } }; };
    const cluster = {
      id: "c1",
      disconnected: flag(false),
      online: flag(true),
      accessible: flag(true),
      ready: flag(true),
      allowedNamespaces: { clear: jest.fn() },
    } as unknown as Cluster;
    const connection = di.inject(clusterConnectionInjectable, cluster);
    const old = tokens.get("c1");

    expect(tokens.verify("c1", old)).toBe(true);
    connection.disconnect();
    expect(tokens.verify("c1", old)).toBe(false);
    expect(tokens.verify("c1", tokens.get("c1"))).toBe(true);

    tokens.revoke("c1");
    expect(tokens.verify("c1", old)).toBe(false);
  });
});
