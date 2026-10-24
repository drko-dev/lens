/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { frontEndRouteInjectionToken } from "../../../../front-end-route-injection-token";

const rbacInspectorRouteInjectable = getInjectable({
  id: "rbac-inspector-route",

  instantiate: () => ({
    path: "/rbac-inspector",
    clusterFrame: true,
    isEnabled: computed(() => true),
  }),

  injectionToken: frontEndRouteInjectionToken,
});

export default rbacInspectorRouteInjectable;
