/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { NavigateToRouteOptions } from "../../../../navigate-to-route-injection-token";
import { navigateToRouteInjectionToken } from "../../../../navigate-to-route-injection-token";
import rbacInspectorRouteInjectable from "./rbac-inspector-route.injectable";

export type NavigateToRbacInspector = (options?: NavigateToRouteOptions<ReturnType<typeof rbacInspectorRouteInjectable.instantiate>>) => void;

const navigateToRbacInspectorInjectable = getInjectable({
  id: "navigate-to-rbac-inspector",

  instantiate: (di): NavigateToRbacInspector => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const route = di.inject(rbacInspectorRouteInjectable);

    return (options) => navigateToRoute(route, options);
  },
});

export default navigateToRbacInspectorInjectable;
