/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import costsRouteInjectable from "../../../common/front-end-routing/routes/cluster/costs/costs-route.injectable";
import { devopsSidebarItemId } from "../devops/devops-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToCostsInjectable from "../../../common/front-end-routing/routes/cluster/costs/navigate-to-costs.injectable";

const costsSidebarItemsInjectable = getInjectable({
  id: "costs-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(costsRouteInjectable);
    const navigateToCosts = di.inject(navigateToCostsInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "costs",
        parentId: devopsSidebarItemId,
        title: "Cost & OpenCost",
        onClick: navigateToCosts,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 30,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default costsSidebarItemsInjectable;
