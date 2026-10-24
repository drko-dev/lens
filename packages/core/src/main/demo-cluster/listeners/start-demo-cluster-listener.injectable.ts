/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getRequestChannelListenerInjectable } from "@openlens/messaging";
import { startDemoClusterChannel } from "../../../common/demo-cluster/demo-cluster-channels";
import demoClusterManagerInjectable from "../demo-cluster-manager.injectable";

const startDemoClusterListenerInjectable = getRequestChannelListenerInjectable({
  id: "start-demo-cluster-listener",
  channel: startDemoClusterChannel,
  getHandler: (di) => {
    const manager = di.inject(demoClusterManagerInjectable);

    return () => manager.startDemoCluster();
  },
});

export default startDemoClusterListenerInjectable;
