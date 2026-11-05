/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import incidentsRouteInjectable from "./incidents-route.injectable";
import { navigateToRouteInjectionToken } from "../../../navigate-to-route-injection-token";

const navigateToIncidentsInjectable = getInjectable({
  id: "navigate-to-incidents",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(incidentsRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToIncidentsInjectable;
