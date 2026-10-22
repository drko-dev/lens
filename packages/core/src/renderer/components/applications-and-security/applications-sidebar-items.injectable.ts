/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import applicationsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/applications/applications-route.injectable";
import { devopsSidebarItemId } from "../devops/devops-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToApplicationsInjectable from "../../../common/front-end-routing/routes/cluster/workloads/applications/navigate-to-applications.injectable";

const applicationsSidebarItemsInjectable = getInjectable({
  id: "applications-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(applicationsRouteInjectable);
    const navigateToApplications = di.inject(navigateToApplicationsInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "applications",
        parentId: devopsSidebarItemId,
        title: "Applications & Images",
        onClick: navigateToApplications,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 10,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default applicationsSidebarItemsInjectable;
