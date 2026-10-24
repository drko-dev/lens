/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { RbacInspector } from "./rbac-inspector";
import rbacInspectorRouteInjectable from "../../../../common/front-end-routing/routes/cluster/user-management/rbac-inspector/rbac-inspector-route.injectable";
import { routeSpecificComponentInjectionToken } from "../../../routes/route-specific-component-injection-token";

const rbacInspectorRouteComponentInjectable = getInjectable({
  id: "rbac-inspector-route-component",

  instantiate: (di) => ({
    route: di.inject(rbacInspectorRouteInjectable),
    Component: RbacInspector,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default rbacInspectorRouteComponentInjectable;
