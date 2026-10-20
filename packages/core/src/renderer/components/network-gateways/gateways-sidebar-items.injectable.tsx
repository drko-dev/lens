/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import gatewaysRouteInjectable from "../../../common/front-end-routing/routes/cluster/network/gateways/gateways-route.injectable";
import { networkSidebarItemId } from "../network/network-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToGatewaysInjectable from "../../../common/front-end-routing/routes/cluster/network/gateways/navigate-to-gateways.injectable";

const gatewaysSidebarItemsInjectable = getInjectable({
  id: "gateways-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(gatewaysRouteInjectable);
    const navigateToGateways = di.inject(navigateToGatewaysInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "gateways",
        parentId: networkSidebarItemId,
        title: "Gateways",
        onClick: navigateToGateways,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 35,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default gatewaysSidebarItemsInjectable;
