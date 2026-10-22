/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import execFileInjectable from "../../common/fs/exec-file.injectable";
import lensK8sProxyPathInjectable from "./lens-k8s-proxy-path.injectable";

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
      const output = await execFile(lensK8sProxyPath, ["version"]);

      if (!output.callWasSuccessful) {
        return false;
      }

      try {
        return /-openlens\.\d+$/.test(String(JSON.parse(output.response).gitVersion));
      } catch {
        return false;
      }
    })();
  },
});

export default lensK8sProxySupportsClientAuthInjectable;
