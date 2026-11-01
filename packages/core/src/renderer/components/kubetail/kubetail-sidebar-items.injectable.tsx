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
import kubetailRouteInjectable from "../../../common/front-end-routing/routes/cluster/kubetail/kubetail-route.injectable";
import navigateToKubetailInjectable from "../../../common/front-end-routing/routes/cluster/kubetail/navigate-to-kubetail.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";

export const kubetailSidebarItemId = "kubetail";

const kubetailSidebarItemsInjectable = getInjectable({
  id: "kubetail-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(kubetailRouteInjectable);
    const navigateToKubetail = di.inject(navigateToKubetailInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed((): SidebarItemRegistration[] => [
      {
        id: kubetailSidebarItemId,
        parentId: null,
        title: "Kubetail",
        getIcon: () => <Icon material="subject" />,
        onClick: navigateToKubetail,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 65,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default kubetailSidebarItemsInjectable;
