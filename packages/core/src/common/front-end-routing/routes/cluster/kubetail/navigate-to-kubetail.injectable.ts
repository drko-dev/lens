/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import kubetailRouteInjectable from "./kubetail-route.injectable";
import { navigateToRouteInjectionToken } from "../../../navigate-to-route-injection-token";

const navigateToKubetailInjectable = getInjectable({
  id: "navigate-to-kubetail",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(kubetailRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToKubetailInjectable;
