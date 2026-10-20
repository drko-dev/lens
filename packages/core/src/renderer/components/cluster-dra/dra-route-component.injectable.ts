/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { DynamicResourceAllocation } from "./dra";
import draRouteInjectable from "../../../common/front-end-routing/routes/cluster/storage/dra/dra-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";

const draRouteComponentInjectable = getInjectable({
  id: "dra-route-component",

  instantiate: (di) => ({
    route: di.inject(draRouteInjectable),
    Component: DynamicResourceAllocation,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default draRouteComponentInjectable;
