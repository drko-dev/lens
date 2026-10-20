/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { navigateToRouteInjectionToken } from "../../../../navigate-to-route-injection-token";
import applicationsRouteInjectable from "./applications-route.injectable";

const navigateToApplicationsInjectable = getInjectable({
  id: "navigate-to-applications",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(applicationsRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToApplicationsInjectable;
