/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { EndpointSlices } from "./endpoint-slices";
import endpointSlicesRouteInjectable from "../../../common/front-end-routing/routes/cluster/network/endpoint-slices/endpoint-slices-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";

const endpointSlicesRouteComponentInjectable = getInjectable({
  id: "endpoint-slices-route-component",

  instantiate: (di) => ({
    route: di.inject(endpointSlicesRouteInjectable),
    Component: EndpointSlices,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default endpointSlicesRouteComponentInjectable;
