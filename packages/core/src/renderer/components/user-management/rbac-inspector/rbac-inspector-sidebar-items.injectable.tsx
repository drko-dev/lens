/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import rbacInspectorRouteInjectable from "../../../../common/front-end-routing/routes/cluster/user-management/rbac-inspector/rbac-inspector-route.injectable";
import { userManagementSidebarItemId } from "../user-management-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../../routes/route-is-active.injectable";
import navigateToRbacInspectorInjectable from "../../../../common/front-end-routing/routes/cluster/user-management/rbac-inspector/navigate-to-rbac-inspector.injectable";

const rbacInspectorSidebarItemsInjectable = getInjectable({
  id: "rbac-inspector-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(rbacInspectorRouteInjectable);
    const navigateToRbacInspector = di.inject(navigateToRbacInspectorInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "rbac-inspector",
        parentId: userManagementSidebarItemId,
        title: "RBAC Inspector",
        onClick: () => navigateToRbacInspector(),
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 60,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default rbacInspectorSidebarItemsInjectable;
