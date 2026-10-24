/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { requestFromChannelInjectionToken } from "@openlens/messaging";
import { stopDemoClusterChannel } from "../../common/demo-cluster/demo-cluster-channels";

export type StopDemoCluster = () => Promise<void>;

const stopDemoClusterInjectable = getInjectable({
  id: "stop-demo-cluster",
  instantiate: (di): StopDemoCluster => {
    const requestFromChannel = di.inject(requestFromChannelInjectionToken);

    return () => requestFromChannel(stopDemoClusterChannel);
  },
});

export default stopDemoClusterInjectable;
