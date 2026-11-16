/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import draRouteInjectable from "../../../common/front-end-routing/routes/cluster/storage/dra/dra-route.injectable";
import { Icon } from "../icon";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToDraInjectable from "../../../common/front-end-routing/routes/cluster/storage/dra/navigate-to-dra.injectable";

const draSidebarItemsInjectable = getInjectable({
  id: "dra-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(draRouteInjectable);
    const navigateToDra = di.inject(navigateToDraInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "dra",
        parentId: null,
        title: "Device Resources",
        badge: "NEW",
        getIcon: () => React.createElement(Icon, { material: "memory" }),
        onClick: navigateToDra,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 65,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default draSidebarItemsInjectable;
