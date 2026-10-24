/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computed } from "mobx";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";
import { Welcome } from "../welcome";
import welcomeMenuItemsInjectable from "../welcome-menu-items/welcome-menu-items.injectable";
import welcomeBannerItemsInjectable from "../welcome-banner-items/welcome-banner-items.injectable";
import productNameInjectable from "../../../../common/vars/product-name.injectable";
import catalogEntityRegistryInjectable from "../../../api/catalog/entity/registry.injectable";
import activeHotbarInjectable from "../../../../features/hotbar/storage/common/active.injectable";
import navigateToCatalogInjectable from "../../../../common/front-end-routing/routes/catalog/navigate-to-catalog.injectable";
import navigateToAddClusterInjectable from "../../../../common/front-end-routing/routes/add-cluster/navigate-to-add-cluster.injectable";
import navigateToClusterViewInjectable from "../../../../common/front-end-routing/routes/cluster-view/navigate-to-cluster-view.injectable";
import startDemoClusterInjectable from "../../../demo-cluster/start-demo-cluster.injectable";
import resolveEntityEnvironmentInjectable from "../../catalog/resolve-entity-environment.injectable";

describe("Welcome View (R8-06 Demo Cluster Launch Action)", () => {
  let di: ReturnType<typeof getDiForUnitTesting>;
  let startDemoClusterMock: jest.Mock;
  let navigateToClusterViewMock: jest.Mock;

  beforeEach(() => {
    di = getDiForUnitTesting();

    startDemoClusterMock = jest.fn().mockResolvedValue({
      isRunning: true,
      clusterId: "openlens-demo-cluster-local",
      port: 54321,
    });
    navigateToClusterViewMock = jest.fn();

    di.override(startDemoClusterInjectable, () => startDemoClusterMock);
    di.override(navigateToClusterViewInjectable, () => navigateToClusterViewMock);
    di.override(navigateToCatalogInjectable, () => jest.fn());
    di.override(navigateToAddClusterInjectable, () => jest.fn());
    di.override(productNameInjectable, () => "OpenLens DevOps");
    di.override(catalogEntityRegistryInjectable, () => ({ items: computed(() => []) } as any));
    di.override(activeHotbarInjectable, () => computed(() => ({ items: [] })) as any);
    di.override(resolveEntityEnvironmentInjectable, () => () => undefined);
    di.override(welcomeMenuItemsInjectable, () => computed(() => []));
    di.override(welcomeBannerItemsInjectable, () => computed(() => []));
  });

  it("renders Launch demo cluster button and navigates to cluster view on click", async () => {
    const { getByTestId } = renderFor(di)(<Welcome />);

    const launchButton = getByTestId("welcome-launch-demo-cluster");

    expect(launchButton).toBeInTheDocument();
    expect(launchButton).toHaveTextContent("Launch demo cluster");

    userEvent.click(launchButton);

    await screen.findByTestId("welcome-launch-demo-cluster");
    expect(startDemoClusterMock).toHaveBeenCalledTimes(1);

    // Wait microtask for async completion
    await Promise.resolve();
    expect(navigateToClusterViewMock).toHaveBeenCalledWith("openlens-demo-cluster-local");
  });
});
