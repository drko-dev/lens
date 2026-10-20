/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import endpointSlicesRouteInjectable from "./endpoint-slices-route.injectable";
import { navigateToRouteInjectionToken } from "../../../../navigate-to-route-injection-token";

const navigateToEndpointSlicesInjectable = getInjectable({
  id: "navigate-to-endpoint-slices",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(endpointSlicesRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToEndpointSlicesInjectable;
