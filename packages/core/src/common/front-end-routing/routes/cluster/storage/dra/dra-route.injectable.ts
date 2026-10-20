/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { shouldShowResourceInjectionToken } from "../../../../../../features/cluster/showing-kube-resources/common/allowed-resources-injection-token";
import { frontEndRouteInjectionToken } from "../../../../front-end-route-injection-token";

const draRouteInjectable = getInjectable({
  id: "dra-route",

  instantiate: (di) => ({
    path: "/dra",
    clusterFrame: true,
    isEnabled: di.inject(shouldShowResourceInjectionToken, {
      apiName: "deviceclasses",
      group: "resource.k8s.io",
    }),
  }),

  injectionToken: frontEndRouteInjectionToken,
});

export default draRouteInjectable;
