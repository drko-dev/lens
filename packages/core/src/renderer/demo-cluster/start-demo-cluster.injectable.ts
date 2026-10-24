/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { requestFromChannelInjectionToken } from "@openlens/messaging";
import type { DemoClusterStatus } from "../../common/demo-cluster/demo-cluster-channels";
import { startDemoClusterChannel } from "../../common/demo-cluster/demo-cluster-channels";

export type StartDemoCluster = () => Promise<DemoClusterStatus>;

const startDemoClusterInjectable = getInjectable({
  id: "start-demo-cluster",
  instantiate: (di): StartDemoCluster => {
    const requestFromChannel = di.inject(requestFromChannelInjectionToken);

    return () => requestFromChannel(startDemoClusterChannel);
  },
});

export default startDemoClusterInjectable;
