/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { requestFromChannelInjectionToken } from "@openlens/messaging";
import type { DemoClusterStatus } from "../../common/demo-cluster/demo-cluster-channels";
import { getDemoClusterStatusChannel } from "../../common/demo-cluster/demo-cluster-channels";

export type GetDemoClusterStatus = () => Promise<DemoClusterStatus>;

const getDemoClusterStatusInjectable = getInjectable({
  id: "get-demo-cluster-status",
  instantiate: (di): GetDemoClusterStatus => {
    const requestFromChannel = di.inject(requestFromChannelInjectionToken);

    return () => requestFromChannel(getDemoClusterStatusChannel);
  },
});

export default getDemoClusterStatusInjectable;
