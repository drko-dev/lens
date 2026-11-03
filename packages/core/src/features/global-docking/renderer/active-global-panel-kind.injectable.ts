/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Injectable } from "@ogre-tools/injectable";
import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import type { Route } from "../../../common/front-end-routing/front-end-route-injection-token";
import podsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/pods/pods-route.injectable";
import deploymentsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/deployments/deployments-route.injectable";
import statefulsetsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/statefulsets/statefulsets-route.injectable";
import daemonsetsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/daemonsets/daemonsets-route.injectable";
import replicasetsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/replicasets/replicasets-route.injectable";
import jobsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/jobs/jobs-route.injectable";
import cronJobsRouteInjectable from "../../../common/front-end-routing/routes/cluster/workloads/cron-jobs/cron-jobs-route.injectable";
import eventsRouteInjectable from "../../../common/front-end-routing/routes/cluster/events/events-route.injectable";
import configMapsRouteInjectable from "../../../common/front-end-routing/routes/cluster/config/config-maps/config-maps-route.injectable";
import servicesRouteInjectable from "../../../common/front-end-routing/routes/cluster/network/services/services-route.injectable";
import ingressesRouteInjectable from "../../../common/front-end-routing/routes/cluster/network/ingresses/ingresses-route.injectable";
import persistentVolumeClaimsRouteInjectable from "../../../common/front-end-routing/routes/cluster/storage/persistent-volume-claims/persistent-volume-claims-route.injectable";
import nodesRouteInjectable from "../../../common/front-end-routing/routes/cluster/nodes/nodes-route.injectable";
import routeIsActiveInjectable from "../../../renderer/routes/route-is-active.injectable";
import type { GlobalPanelKind } from "./global-panel-store";
import { globalPanelKinds } from "./global-panel-store";

// The Record type makes a hosted kind without a route a compile error.
const routeOfKind: Record<GlobalPanelKind, Injectable<Route<unknown>, Route<unknown>, void>> = {
  pods: podsRouteInjectable,
  deployments: deploymentsRouteInjectable,
  statefulsets: statefulsetsRouteInjectable,
  daemonsets: daemonsetsRouteInjectable,
  replicasets: replicasetsRouteInjectable,
  jobs: jobsRouteInjectable,
  cronjobs: cronJobsRouteInjectable,
  events: eventsRouteInjectable,
  configmaps: configMapsRouteInjectable,
  services: servicesRouteInjectable,
  ingresses: ingressesRouteInjectable,
  persistentvolumeclaims: persistentVolumeClaimsRouteInjectable,
  nodes: nodesRouteInjectable,
};

/** The hosted panel kind of the current cluster route, or undefined for a route rendered classically. */
const activeGlobalPanelKindInjectable = getInjectable({
  id: "active-global-panel-kind",
  instantiate: (di) => {
    const routes = globalPanelKinds.map((kind) => ({
      kind,
      isActive: di.inject(routeIsActiveInjectable, di.inject(routeOfKind[kind])),
    }));

    return computed((): GlobalPanelKind | undefined => routes.find(({ isActive }) => isActive.get())?.kind);
  },
});

export default activeGlobalPanelKindInjectable;
