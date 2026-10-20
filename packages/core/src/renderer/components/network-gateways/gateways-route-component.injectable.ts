/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { Gateways } from "./gateways";
import gatewaysRouteInjectable from "../../../common/front-end-routing/routes/cluster/network/gateways/gateways-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";

const gatewaysRouteComponentInjectable = getInjectable({
  id: "gateways-route-component",

  instantiate: (di) => ({
    route: di.inject(gatewaysRouteInjectable),
    Component: Gateways,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default gatewaysRouteComponentInjectable;
