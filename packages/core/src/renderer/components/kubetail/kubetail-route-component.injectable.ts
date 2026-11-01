/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";
import { KubetailPage } from "./kubetail-page";
import kubetailRouteInjectable from "../../../common/front-end-routing/routes/cluster/kubetail/kubetail-route.injectable";

const kubetailRouteComponentInjectable = getInjectable({
  id: "kubetail-route-component",

  instantiate: (di) => ({
    route: di.inject(kubetailRouteInjectable),
    Component: KubetailPage,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default kubetailRouteComponentInjectable;
