/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { GitOps } from "./gitops";
import gitopsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/gitops/gitops-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";

const gitopsRouteComponentInjectable = getInjectable({
  id: "gitops-route-component",

  instantiate: (di) => ({
    route: di.inject(gitopsRouteInjectable),
    Component: GitOps,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default gitopsRouteComponentInjectable;
