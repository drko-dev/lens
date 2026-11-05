/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { routeSpecificComponentInjectionToken } from "../../routes/route-specific-component-injection-token";
import incidentsRouteInjectable from "../../../common/front-end-routing/routes/cluster/incidents/incidents-route.injectable";
import { IncidentListView } from "../../../features/incident-workbench/renderer/incident-list-view";

const incidentsRouteComponentInjectable = getInjectable({
  id: "incidents-route-component",

  instantiate: (di) => ({
    route: di.inject(incidentsRouteInjectable),
    Component: IncidentListView,
  }),

  injectionToken: routeSpecificComponentInjectionToken,
});

export default incidentsRouteComponentInjectable;
