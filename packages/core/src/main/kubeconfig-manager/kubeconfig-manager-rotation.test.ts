/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import fse from "fs-extra";
import os from "os";
import path from "path";
import { KubeconfigManager } from "./kubeconfig-manager";
import { ProxyAuthTokens } from "../lens-proxy/proxy-auth-tokens";

describe("KubeconfigManager atomic write and rotation", () => {
  let dir: string;
  let tokens: ProxyAuthTokens;
  let logger: Record<"warn" | "info" | "debug" | "error" | "silly", jest.Mock>;
  let writeFile: jest.Mock;
  let rename: jest.Mock;
  let manager: KubeconfigManager;
  let file: string;

  const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
  const read = () => fse.readFileSync(file, "utf-8");

  beforeEach(async () => {
    dir = await fse.mkdtemp(path.join(os.tmpdir(), "kcm-"));
    file = path.join(dir, "kubeconfig-foo");
    tokens = new ProxyAuthTokens();
    logger = { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn(), silly: jest.fn() };
    writeFile = jest.fn((p: string, c: string, o: any) => fse.writeFile(p, c, o));
    rename = jest.fn((a: string, b: string) => fse.rename(a, b));
    manager = new KubeconfigManager({
      directoryForTemp: dir,
      logger: logger as any,
      certificate: { cert: "c" } as any,
      kubeAuthProxyServer: { ensureRunning: async () => {} } as any,
      kubeAuthProxyUrl: "https://127.0.0.1:1/foo",
      joinPaths: (...p: string[]) => path.join(...p),
      getDirnameOfPath: path.dirname,
      pathExists: (p: string) => fse.pathExists(p),
      removePath: (p: string) => fse.remove(p),
      writeFile,
      renameFile: rename,
      loadKubeconfig: async () => ({ getContextObject: () => undefined }) as any,
      proxyAuthTokens: tokens,
    } as any, { id: "foo", preferences: {}, contextName: { get: () => "ctx" }} as any);
  });

  afterEach(() => fse.remove(dir));

  it("writes via an exclusive 0600 staging file renamed over the target, leaving no temp files", async () => {
    await manager.ensurePath();

    const [staging, , opts] = writeFile.mock.calls[0];

    expect(staging).not.toBe(file);
    expect(opts).toMatchObject({ mode: 0o600, flag: "wx" });
    expect(fse.statSync(file).mode & 0o777).toBe(0o600);
    expect(fse.readdirSync(dir)).toEqual(["kubeconfig-foo"]);
  });

  it("removes the staging file and keeps the old file when the write fails", async () => {
    await manager.ensurePath();
    const before = read();

    writeFile.mockImplementationOnce(async (p: string) => {
      await fse.writeFile(p, "partial");
      throw new Error("disk full");
    });
    tokens.rotate("foo");
    await flush();

    expect(read()).toBe(before);
    expect(fse.readdirSync(dir)).toEqual(["kubeconfig-foo"]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("disk full"));
    expect(logger.warn.mock.calls.join()).not.toContain(tokens.get("foo"));
  });

  it("never exposes a partial file: readers see the old content until rename completes", async () => {
    await manager.ensurePath();
    const before = read();
    let gate!: () => void;

    rename.mockImplementationOnce(async (a: string, b: string) => {
      await new Promise<void>((resolve) => { gate = resolve; });
      await fse.rename(a, b);
    });
    tokens.rotate("foo");
    await flush();

    expect(read()).toBe(before);
    gate();
    await flush();
    expect(read()).toContain(tokens.get("foo"));
    expect(read()).not.toBe(before);
  });

  it("rejects the old token immediately on rotation and the file carries the new one once written", async () => {
    await manager.ensurePath();
    const old = tokens.get("foo");

    tokens.rotate("foo");

    expect(tokens.verify("foo", old)).toBe(false);
    await flush();
    expect(tokens.verify("foo", tokens.get("foo"))).toBe(true);
    expect(read()).toContain(tokens.get("foo"));
    expect(read()).not.toContain(old);
  });

  it("does not write a token that was revoked while the rewrite was queued", async () => {
    await manager.ensurePath();
    const before = read();

    tokens.rotate("foo");
    tokens.revoke("foo");
    await flush();

    expect(read()).toBe(before);
    expect(tokens.verify("foo", String(/token: (\S+)/.exec(before)?.[1]))).toBe(false);
  });

  it("last rotation wins when rotations overlap", async () => {
    await manager.ensurePath();

    tokens.rotate("foo");
    tokens.rotate("foo");
    await flush();

    expect(read()).toContain(tokens.get("foo"));
  });

  it("removes a file finished after clear()", async () => {
    await manager.ensurePath();
    let gate!: () => void;

    rename.mockImplementationOnce(async (a: string, b: string) => {
      await new Promise<void>((resolve) => { gate = resolve; });
      await fse.rename(a, b);
    });
    tokens.rotate("foo");
    await flush();
    await manager.clear();
    gate();
    await flush();

    expect(fse.readdirSync(dir)).toEqual([]);
  });
});
