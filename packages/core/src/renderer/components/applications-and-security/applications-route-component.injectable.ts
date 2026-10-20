/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { Applications } from "./applications";
import applicationsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/applications/applications-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";

const applicationsRouteComponentInjectable = getInjectable({
  id: "applications-route-component",

  instantiate: (di) => ({
    route: di.inject(applicationsRouteInjectable),
    Component: Applications,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default applicationsRouteComponentInjectable;
