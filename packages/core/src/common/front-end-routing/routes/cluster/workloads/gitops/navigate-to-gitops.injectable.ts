/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { navigateToRouteInjectionToken } from "../../../../navigate-to-route-injection-token";
import gitopsRouteInjectable from "./gitops-route.injectable";

const navigateToGitopsInjectable = getInjectable({
  id: "navigate-to-gitops",

  instantiate: (di) => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(gitopsRouteInjectable);

    return () => navigateToRoute(route);
  },
});

export default navigateToGitopsInjectable;
