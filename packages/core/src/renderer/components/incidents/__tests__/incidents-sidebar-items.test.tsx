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
    const item = items[0];
    expect(item).toBeDefined();
    if (item) {
      expect(item.id).toBe(incidentsSidebarItemId);
      expect(item.title).toBe("Incidentes");
      expect(item.orderNumber).toBe(66);
      expect(item.isVisible?.get()).toBe(true);
    }
  });
});
