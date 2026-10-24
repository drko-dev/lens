/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getRequestChannelListenerInjectable } from "@openlens/messaging";
import { getDemoClusterStatusChannel } from "../../../common/demo-cluster/demo-cluster-channels";
import demoClusterManagerInjectable from "../demo-cluster-manager.injectable";

const getDemoClusterStatusListenerInjectable = getRequestChannelListenerInjectable({
  id: "get-demo-cluster-status-listener",
  channel: getDemoClusterStatusChannel,
  getHandler: (di) => {
    const manager = di.inject(demoClusterManagerInjectable);

    return () => manager.getStatus();
  },
});

export default getDemoClusterStatusListenerInjectable;
