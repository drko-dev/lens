/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { requestFromChannelInjectionToken } from "@openlens/messaging";
import { ensureKubeconfigSyncActiveChannel } from "../../../common/kube-helpers/ensure-sync-channel";

const ensureKubeconfigSyncActiveInjectable = getInjectable({
  id: "ensure-kubeconfig-sync-active-renderer",
  instantiate: (di) => {
    const requestFromChannel = di.inject(requestFromChannelInjectionToken);

    return async (filePath: string): Promise<void> => {
      await requestFromChannel(ensureKubeconfigSyncActiveChannel, filePath);
    };
  },
});

export default ensureKubeconfigSyncActiveInjectable;
