/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { Costs } from "./costs";
import costsRouteInjectable from "../../../common/front-end-routing/routes/cluster/costs/costs-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";

const costsRouteComponentInjectable = getInjectable({
  id: "costs-route-component",

  instantiate: (di) => ({
    route: di.inject(costsRouteInjectable),
    Component: Costs,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default costsRouteComponentInjectable;
