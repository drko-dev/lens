/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import { shouldShowResourceInjectionToken } from "../../../../../../features/cluster/showing-kube-resources/common/allowed-resources-injection-token";
import { frontEndRouteInjectionToken } from "../../../../front-end-route-injection-token";

const gitopsRouteInjectable = getInjectable({
  id: "gitops-route",

  instantiate: (di) => {
    const argoAllowed = di.inject(shouldShowResourceInjectionToken, {
      apiName: "applications",
      group: "argoproj.io",
    });
    const fluxAllowed = di.inject(shouldShowResourceInjectionToken, {
      apiName: "kustomizations",
      group: "kustomize.toolkit.fluxcd.io",
    });

    return {
      path: "/gitops",
      clusterFrame: true,
      isEnabled: computed(() => argoAllowed.get() || fluxAllowed.get()),
    };
  },

  injectionToken: frontEndRouteInjectionToken,
});

export default gitopsRouteInjectable;
