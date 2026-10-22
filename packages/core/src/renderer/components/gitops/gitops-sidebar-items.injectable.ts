/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import gitopsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/gitops/gitops-route.injectable";
import { devopsSidebarItemId } from "../devops/devops-sidebar-items.injectable";
import { sidebarItemsInjectionToken } from "../layout/sidebar-items.injectable";
import routeIsActiveInjectable from "../../routes/route-is-active.injectable";
import navigateToGitopsInjectable from "../../../common/front-end-routing/routes/cluster/workloads/gitops/navigate-to-gitops.injectable";

const gitopsSidebarItemsInjectable = getInjectable({
  id: "gitops-sidebar-items",

  instantiate: (di) => {
    const route = di.inject(gitopsRouteInjectable);
    const navigateToGitops = di.inject(navigateToGitopsInjectable);
    const routeIsActive = di.inject(routeIsActiveInjectable, route);

    return computed(() => [
      {
        id: "gitops",
        parentId: devopsSidebarItemId,
        title: "GitOps (Argo/Flux)",
        onClick: navigateToGitops,
        isActive: routeIsActive,
        isVisible: route.isEnabled,
        orderNumber: 20,
      },
    ]);
  },

  injectionToken: sidebarItemsInjectionToken,
});

export default gitopsSidebarItemsInjectable;
