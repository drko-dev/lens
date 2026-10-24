/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getRequestChannelListenerInjectable } from "@openlens/messaging";
import { stopDemoClusterChannel } from "../../../common/demo-cluster/demo-cluster-channels";
import demoClusterManagerInjectable from "../demo-cluster-manager.injectable";

const stopDemoClusterListenerInjectable = getRequestChannelListenerInjectable({
  id: "stop-demo-cluster-listener",
  channel: stopDemoClusterChannel,
  getHandler: (di) => {
    const manager = di.inject(demoClusterManagerInjectable);

    return () => manager.stopDemoCluster();
  },
});

export default stopDemoClusterListenerInjectable;
