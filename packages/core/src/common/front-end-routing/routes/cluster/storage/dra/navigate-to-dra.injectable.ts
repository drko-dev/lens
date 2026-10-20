/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { navigateToRouteInjectionToken } from "../../../../navigate-to-route-injection-token";
import draRouteInjectable from "./dra-route.injectable";

const navigateToDraInjectable = getInjectable({
  id: "navigate-to-dra",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(draRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToDraInjectable;
