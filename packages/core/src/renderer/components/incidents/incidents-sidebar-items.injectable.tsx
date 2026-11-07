/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import React from "react";
import { computed } from "mobx";
import { Icon } from "../icon";
import type { SidebarItemRegistration } from "../layout/sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import incidentsRouteInjectable from "../../../common/front-end-routing/routes/cluster/incidents/incidents-route.injectable";
import navigateToIncidentsInjectable from "../../../common/front-end-routing/routes/cluster/incidents/navigate-to-incidents.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";

export const incidentsSidebarItemId = "incidents";

const incidentsSidebarItemsInjectable = getInjectable({
  id: "incidents-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(incidentsRouteInjectable);
    const navigateToIncidents = di.inject(navigateToIncidentsInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed((): SidebarItemRegistration[] => [
      {
        id: incidentsSidebarItemId,
        parentId: null,
        title: "Incidentes",
        getIcon: () => <Icon material="warning" />,
        onClick: navigateToIncidents,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 66,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default incidentsSidebarItemsInjectable;
