/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import incidentsSidebarItemsInjectable, { incidentsSidebarItemId } from "../incidents-sidebar-items.injectable";
import incidentsRouteInjectable from "../../../../common/front-end-routing/routes/cluster/incidents/incidents-route.injectable";
import currentlyInClusterFrameInjectable from "../../../routes/currently-in-cluster-frame.injectable";

describe("Incidents Sidebar Item (H8-007)", () => {
  it("registers 'Incidentes' with orderNumber 66 and route /incidents", () => {
    const di = getDiForUnitTesting();
    di.override(currentlyInClusterFrameInjectable, () => true);

    const route = di.inject(incidentsRouteInjectable);
    expect(route.path).toBe("/incidents");
    expect(route.clusterFrame).toBe(true);

    const sidebarItems = di.inject(incidentsSidebarItemsInjectable);
    const items = sidebarItems.get();

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(incidentsSidebarItemId);
    expect(items[0].title).toBe("Incidentes");
    expect(items[0].orderNumber).toBe(66);
    expect(items[0].isVisible.get()).toBe(true);
  });
});
