/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import fs from "fs";
import { getDiForUnitTesting } from "../getDiForUnitTesting";
import execFileInjectable from "../../common/fs/exec-file.injectable";
import lensK8sProxyPathInjectable from "../kube-auth-proxy/lens-k8s-proxy-path.injectable";
import lensK8sProxySupportsClientAuthInjectable from "../kube-auth-proxy/lens-k8s-proxy-supports-client-auth.injectable";

describe("lens-k8s-proxy capability probe isolation", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      HOME: "/host/private-home",
      KUBECONFIG: "/host/private-home/.kube/config",
      KUBECONFIG_CONTEXT: "rancher-desktop",
      MINIKUBE_HOME: "/host/minikube",
      XDG_CONFIG_HOME: "/host/xdg-config",
      XDG_DATA_HOME: "/host/xdg-data",
      HELM_CONFIG_HOME: "/host/helm",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses a temporary HOME and empty kubeconfig for version probe, then removes probe files", async () => {
    const di = getDiForUnitTesting();
    const calls: any[] = [];
    let probeConfig = "";

    di.override(execFileInjectable, () => jest.fn(async (...args: any[]) => {
      calls.push(args);
      const options = args[2];

      probeConfig = fs.readFileSync(options.env.KUBECONFIG, "utf8");

      return { callWasSuccessful: true, response: JSON.stringify({ gitVersion: "v0.3.0-openlens.1" }) };
    }) as any);
    di.override(lensK8sProxyPathInjectable, () => "/safe/bin/lens-k8s-proxy");

    await expect(di.inject(lensK8sProxySupportsClientAuthInjectable)()).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    const [binary, args, options] = calls[0];

    expect(binary).toBe("/safe/bin/lens-k8s-proxy");
    expect(args).toEqual(["version"]);
    expect(options.env.HOME).toContain("openlens-proxy-capability-");
    expect(options.env.HOME).not.toBe("/host/private-home");
    expect(options.env.KUBECONFIG).toContain(options.cwd);
    expect(options.env.KUBECONFIG).not.toBe("/host/private-home/.kube/config");
    expect(options.env.KUBECONFIG_CONTEXT).toBeUndefined();
    expect(options.env.MINIKUBE_HOME).toBeUndefined();
    expect(options.env.XDG_CONFIG_HOME).toBeUndefined();
    expect(options.env.XDG_DATA_HOME).toBeUndefined();
    expect(options.env.HELM_CONFIG_HOME).toBeUndefined();
    expect(probeConfig).toContain("clusters: []");
    expect(probeConfig).toContain("contexts: []");
    expect(probeConfig).toContain("users: []");
    expect(probeConfig).not.toContain("rancher-desktop");
    expect(fs.existsSync(options.cwd)).toBe(false);
  });

  it("fails safe when proxy capability command returns an error", async () => {
    const di = getDiForUnitTesting();

    di.override(execFileInjectable, () => jest.fn(async () => ({ callWasSuccessful: false, error: new Error("simulated") })) as any);
    di.override(lensK8sProxyPathInjectable, () => "/safe/bin/lens-k8s-proxy");

    await expect(di.inject(lensK8sProxySupportsClientAuthInjectable)()).resolves.toBe(false);
  });

  it("fails safe when proxy version output is invalid JSON", async () => {
    const di = getDiForUnitTesting();

    di.override(execFileInjectable, () => jest.fn(async () => ({ callWasSuccessful: true, response: "not-json" })) as any);
    di.override(lensK8sProxyPathInjectable, () => "/safe/bin/lens-k8s-proxy");

    await expect(di.inject(lensK8sProxySupportsClientAuthInjectable)()).resolves.toBe(false);
  });

  it("fails safe when temporary HOME creation fails", async () => {
    const di = getDiForUnitTesting();
    const mkdtempSpy = jest.spyOn(fs.promises, "mkdtemp").mockRejectedValueOnce(new Error("simulated temp failure"));
    const execFileMock = jest.fn(async () => ({ callWasSuccessful: true, response: "{}" }));

    di.override(execFileInjectable, () => execFileMock as any);
    di.override(lensK8sProxyPathInjectable, () => "/safe/bin/lens-k8s-proxy");

    await expect(di.inject(lensK8sProxySupportsClientAuthInjectable)()).resolves.toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
    mkdtempSpy.mockRestore();
  });

  it("fails safe and cleans temporary directory when empty kubeconfig write fails", async () => {
    const di = getDiForUnitTesting();
    let createdRoot: string | undefined;
    const mkdtempSpy = jest.spyOn(fs.promises, "mkdtemp").mockImplementationOnce(async prefix => {
      createdRoot = `${prefix}test`;
      await fs.promises.mkdir(createdRoot, { recursive: true });

      return createdRoot;
    });
    const writeFileSpy = jest.spyOn(fs.promises, "writeFile").mockRejectedValueOnce(new Error("simulated write failure"));
    const execFileMock = jest.fn(async () => ({ callWasSuccessful: true, response: "{}" }));

    di.override(execFileInjectable, () => execFileMock as any);
    di.override(lensK8sProxyPathInjectable, () => "/safe/bin/lens-k8s-proxy");

    await expect(di.inject(lensK8sProxySupportsClientAuthInjectable)()).resolves.toBe(false);
    expect(execFileMock).not.toHaveBeenCalled();
    expect(fs.existsSync(createdRoot as string)).toBe(false);
    mkdtempSpy.mockRestore();
    writeFileSpy.mockRestore();
  });
});
