/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import validatingAdmissionPoliciesRouteInjectable from "../../../common/front-end-routing/routes/cluster/config/validating-admission-policies/validating-admission-policies-route.injectable";
import { configSidebarItemId } from "../config/config-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToValidatingAdmissionPoliciesInjectable from "../../../common/front-end-routing/routes/cluster/config/validating-admission-policies/navigate-to-validating-admission-policies.injectable";

const validatingAdmissionPoliciesSidebarItemsInjectable = getInjectable({
  id: "validating-admission-policies-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(validatingAdmissionPoliciesRouteInjectable);
    const navigateToPolicies = di.inject(navigateToValidatingAdmissionPoliciesInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "validating-admission-policies",
        parentId: configSidebarItemId,
        title: "Admission Policies",
        onClick: navigateToPolicies,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 105,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default validatingAdmissionPoliciesSidebarItemsInjectable;
