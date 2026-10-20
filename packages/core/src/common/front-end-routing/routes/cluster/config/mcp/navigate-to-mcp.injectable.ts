/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { navigateToRouteInjectionToken } from "../../../../navigate-to-route-injection-token";
import mcpRouteInjectable from "./mcp-route.injectable";

const navigateToMcpInjectable = getInjectable({
  id: "navigate-to-mcp",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(mcpRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToMcpInjectable;
