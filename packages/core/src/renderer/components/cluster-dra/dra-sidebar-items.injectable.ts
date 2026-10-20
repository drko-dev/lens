/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import draRouteInjectable from "../../../common/front-end-routing/routes/cluster/storage/dra/dra-route.injectable";
import { storageSidebarItemId } from "../storage/storage-sidebar-items.injectable";
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
        parentId: storageSidebarItemId,
        title: "DRA Devices",
        onClick: navigateToDra,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 40,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default draSidebarItemsInjectable;
