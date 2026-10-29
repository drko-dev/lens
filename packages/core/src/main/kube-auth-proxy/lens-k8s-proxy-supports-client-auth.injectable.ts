/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import execFileInjectable from "../../common/fs/exec-file.injectable";
import lensK8sProxyPathInjectable from "./lens-k8s-proxy-path.injectable";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * R4-09: whether the bundled lens-k8s-proxy is the OpenLens build that reads its secrets from stdin
 * and requires a client certificate (`<version>-openlens.<n>`). The stock binary keeps the legacy,
 * unauthenticated launch (accepted inherited risk until the patched binary ships).
 */
const lensK8sProxySupportsClientAuthInjectable = getInjectable({
  id: "lens-k8s-proxy-supports-client-auth",
  instantiate: (di) => {
    const execFile = di.inject(execFileInjectable);
    const lensK8sProxyPath = di.inject(lensK8sProxyPathInjectable);
    let result: Promise<boolean> | undefined;

    return () => result ??= (async () => {
      let probeRoot: string | undefined;

      try {
        probeRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openlens-proxy-capability-"));
        const probeHome = path.join(probeRoot, "home");
        const probeConfig = path.join(probeRoot, "empty-kubeconfig");

        await fs.promises.mkdir(probeHome, { recursive: true, mode: 0o700 });
        await fs.promises.writeFile(probeConfig, "apiVersion: v1\nkind: Config\nclusters: []\ncontexts: []\nusers: []\n", { mode: 0o600, flag: "wx" });

        const inheritedEnv = process.env;
        const sanitizedEnv = Object.fromEntries(Object.entries(inheritedEnv).filter(([key]) => (
          !/^(KUBECONFIG|KUBECONFIG_CONTEXT|KUBE_.*|MINIKUBE_HOME|HELM_.*|XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_CACHE_HOME|HOME)$/i.test(key)
        )));
        const output = await execFile(lensK8sProxyPath, ["version"], {
          cwd: probeRoot,
          env: {
            ...sanitizedEnv,
            HOME: probeHome,
            KUBECONFIG: probeConfig,
          },
          timeout: 5000,
          windowsHide: true,
        });

        if (!output.callWasSuccessful) {
          return false;
        }

        try {
          return /-openlens\.\d+$/.test(String(JSON.parse(output.response).gitVersion));
        } catch {
          return false;
        }
      } catch {
        return false;
      } finally {
        if (probeRoot) {
          await fs.promises.rm(probeRoot, { recursive: true, force: true }).catch(() => undefined);
        }
      }

    })();
  },
});

export default lensK8sProxySupportsClientAuthInjectable;
