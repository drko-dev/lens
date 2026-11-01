/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { frontEndRouteInjectionToken } from "../../../front-end-route-injection-token";

const kubetailRouteInjectable = getInjectable({
  id: "kubetail-route",

  instantiate: () => ({
    path: "/kubetail",
    clusterFrame: true,
    isEnabled: computed(() => true),
  }),

  injectionToken: frontEndRouteInjectionToken,
});

export default kubetailRouteInjectable;
