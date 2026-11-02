/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fse from "fs-extra";
import path from "path";
import { runInAction } from "mobx";
import { getRequestChannelListenerInjectable } from "@openlens/messaging";
import { ensureKubeconfigSyncActiveChannel } from "../../../common/kube-helpers/ensure-sync-channel";
import { isValidKubeconfigForFileImport } from "../../../common/kube-helpers/validate-file-import";
import kubeconfigSyncsInjectable from "../../../features/user-preferences/common/kubeconfig-syncs.injectable";

const ensureKubeconfigSyncActiveListener = getRequestChannelListenerInjectable({
  id: "ensure-kubeconfig-sync-active-main",
  channel: ensureKubeconfigSyncActiveChannel,
  getHandler: (di) => {
    const syncs = di.inject(kubeconfigSyncsInjectable);

    return async (filePath: string): Promise<void> => {
      // Renderer is untrusted. Never allow path traversal, arbitrary payloads,
      // or contents in IPC. Restrict size and verify kubeconfig structure.
      if (typeof filePath !== "string" || !path.isAbsolute(filePath) || filePath.length > 4096) {
        throw new Error("Invalid kubeconfig file path");
      }

      const stats = await fse.stat(filePath);

      if (!stats.isFile() || stats.size > 32 * 1024 * 1024) {
        throw new Error("Invalid kubeconfig file");
      }

      const content = await fse.readFile(filePath, "utf8");

      if (!isValidKubeconfigForFileImport(content)) {
        throw new Error("Invalid kubeconfig contexts");
      }

      // The Main-process watcher observes this exact map. This makes
      // additions available immediately, not only after restarting Electron.
      runInAction(() => syncs.set(filePath, {}));
    };
  },
});

export default ensureKubeconfigSyncActiveListener;
