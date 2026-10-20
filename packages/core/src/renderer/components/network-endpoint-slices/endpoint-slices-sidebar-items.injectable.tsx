/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import endpointSlicesRouteInjectable from "../../../common/front-end-routing/routes/cluster/network/endpoint-slices/endpoint-slices-route.injectable";
import { networkSidebarItemId } from "../network/network-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToEndpointSlicesInjectable from "../../../common/front-end-routing/routes/cluster/network/endpoint-slices/navigate-to-endpoint-slices.injectable";

const endpointSlicesSidebarItemsInjectable = getInjectable({
  id: "endpoint-slices-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(endpointSlicesRouteInjectable);
    const navigateToEndpointSlices = di.inject(navigateToEndpointSlicesInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "endpoint-slices",
        parentId: networkSidebarItemId,
        title: "Endpoint Slices",
        onClick: navigateToEndpointSlices,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 25,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default endpointSlicesSidebarItemsInjectable;
