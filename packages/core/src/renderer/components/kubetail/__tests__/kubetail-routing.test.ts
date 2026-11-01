/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import kubetailRouteInjectable from "../../../../common/front-end-routing/routes/cluster/kubetail/kubetail-route.injectable";
import kubetailSidebarItemsInjectable, { kubetailSidebarItemId } from "../kubetail-sidebar-items.injectable";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import currentlyInClusterFrameInjectable from "../../../routes/currently-in-cluster-frame.injectable";

describe("Kubetail Routing & Sidebar Registration", () => {
  it("registers /kubetail route correctly for ClusterFrame", () => {
    const di = getDiForUnitTesting();
    const route = di.inject(kubetailRouteInjectable);

    expect(route.path).toBe("/kubetail");
    expect(route.clusterFrame).toBe(true);
    expect(route.isEnabled.get()).toBe(true);
  });

  it("registers Kubetail as a root-level sidebar item", () => {
    const di = getDiForUnitTesting();

    di.override(currentlyInClusterFrameInjectable, () => true);

    const sidebarItems = di.inject(kubetailSidebarItemsInjectable).get();

    expect(sidebarItems).toHaveLength(1);
    const item = sidebarItems[0];

    expect(item.id).toBe(kubetailSidebarItemId);
    expect(item.parentId).toBeNull();
    expect(item.title).toBe("Kubetail");
    expect(item.orderNumber).toBe(65);
    expect(typeof item.onClick).toBe("function");
  });
});
