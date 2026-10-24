/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { clusterOverviewUIBlockInjectionToken } from "@openlens/metrics";
import { ClusterOverviewResourceQuotaBlock } from "./cluster-overview-resource-quota-block";

const clusterOverviewResourceQuotaBlockInjectable = getInjectable({
  id: "cluster-overview-resource-quota-block",

  instantiate: () => ({
    id: "cluster-overview-resource-quota-block",
    Component: ClusterOverviewResourceQuotaBlock,
    orderNumber: 3,
  }),

  injectionToken: clusterOverviewUIBlockInjectionToken,
});

export default clusterOverviewResourceQuotaBlockInjectable;
