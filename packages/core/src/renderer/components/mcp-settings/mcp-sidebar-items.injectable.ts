/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import mcpRouteInjectable from "../../../common/front-end-routing/routes/cluster/config/mcp/mcp-route.injectable";
import { devopsSidebarItemId } from "../devops/devops-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToMcpInjectable from "../../../common/front-end-routing/routes/cluster/config/mcp/navigate-to-mcp.injectable";

const mcpSidebarItemsInjectable = getInjectable({
  id: "mcp-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(mcpRouteInjectable);
    const navigateToMcp = di.inject(navigateToMcpInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "mcp-server",
        parentId: devopsSidebarItemId,
        title: "MCP Server (stdio)",
        onClick: navigateToMcp,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 40,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default mcpSidebarItemsInjectable;
