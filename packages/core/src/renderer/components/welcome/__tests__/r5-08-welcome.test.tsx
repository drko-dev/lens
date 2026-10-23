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
import resolveEntityEnvironmentInjectable from "../../catalog/resolve-entity-environment.injectable";
import type { CatalogEntity } from "../../../../common/catalog";
import { KubernetesCluster } from "../../../../common/catalog-entities/kubernetes-cluster";
import { CLUSTER_ENVIRONMENTS } from "../../../../common/cluster/environment-types";

describe("R5-08 Welcome modernization", () => {
  let di: ReturnType<typeof getDiForUnitTesting>;
  let navigateToCatalogMock: jest.Mock;
  let navigateToAddClusterMock: jest.Mock;

  const makeClusterEntity = (id: string, name: string) => new KubernetesCluster({
    metadata: {
      uid: id,
      name,
      labels: {},
    },
    spec: {
      kubeconfigPath: "/mock/kubeconfig",
      kubeconfigContext: name,
    },
    status: {
      phase: "disconnected",
    },
  });

  beforeEach(() => {
    di = getDiForUnitTesting();

    navigateToCatalogMock = jest.fn();
    navigateToAddClusterMock = jest.fn();

    di.override(navigateToCatalogInjectable, () => navigateToCatalogMock);
    di.override(navigateToAddClusterInjectable, () => navigateToAddClusterMock);
    di.override(productNameInjectable, () => "OpenLens DevOps");

    const clusters: CatalogEntity[] = [
      makeClusterEntity("c-1", "dev-cluster"),
      makeClusterEntity("c-2", "prod-cluster"),
    ];

    di.override(catalogEntityRegistryInjectable, () => ({
      items: computed(() => clusters),
    } as any));

    di.override(activeHotbarInjectable, () => computed(() => ({
      items: [
        { entity: { id: "c-1" }},
        null,
      ],
    })) as any);

    di.override(resolveEntityEnvironmentInjectable, () => (entity: CatalogEntity) => {
      if (entity.getId() === "c-2") {
        return CLUSTER_ENVIRONMENTS.production;
      }

      return CLUSTER_ENVIRONMENTS.development;
    });

    di.override(welcomeMenuItemsInjectable, () => computed(() => [
      {
        icon: "school",
        title: "Tutorials & Docs",
        click: jest.fn(),
      },
    ]));

    di.override(welcomeBannerItemsInjectable, () => computed(() => []));
  });

  it("renders product name, purpose and no-autoconnect notice", () => {
    const render = renderFor(di);

    render(<Welcome />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("OpenLens DevOps");
    expect(screen.getByText(/Nothing connects until you open a cluster/i)).toBeInTheDocument();
  });

  it("triggers catalog and add-cluster navigation actions", async () => {
    const render = renderFor(di);

    render(<Welcome />);

    const openCatalogBtn = screen.getByTestId("welcome-open-catalog");
    const addClusterBtn = screen.getByTestId("welcome-add-cluster");

    await userEvent.click(openCatalogBtn);
    expect(navigateToCatalogMock).toHaveBeenCalledTimes(1);

    await userEvent.click(addClusterBtn);
    expect(navigateToAddClusterMock).toHaveBeenCalledTimes(1);
  });

  it("displays local workspace summary with cluster counts, pinned counts and environment badges", () => {
    const render = renderFor(di);

    render(<Welcome />);

    const summary = screen.getByTestId("welcome-workspace-summary");

    expect(summary).toHaveTextContent("2 clusters");
    expect(summary).toHaveTextContent("1 pinned");
    expect(screen.getByText("PROD")).toBeInTheDocument();
    expect(screen.getByText("DEV")).toBeInTheDocument();
  });

  it("renders a single banner directly without carousel", () => {
    di.override(welcomeBannerItemsInjectable, () => computed(() => [
      {
        width: 320,
        Banner: () => <div data-testid="single-custom-banner">Custom Banner</div>,
      },
    ]));

    const render = renderFor(di);

    render(<Welcome />);

    expect(screen.getByTestId("single-custom-banner")).toBeInTheDocument();
  });

  it("preserves extension welcome menu items", async () => {
    const clickMock = jest.fn();

    di.override(welcomeMenuItemsInjectable, () => computed(() => [
      {
        icon: "extension",
        title: "Extension Feature Action",
        click: clickMock,
      },
    ]));

    const render = renderFor(di);

    render(<Welcome />);

    const menuItem = screen.getByText("Extension Feature Action");

    expect(menuItem).toBeInTheDocument();

    await userEvent.click(menuItem);
    expect(clickMock).toHaveBeenCalledTimes(1);
  });

  it("shows the OpenLens DevOps fork logo independently of theme when no banner is injected", () => {
    const render = renderFor(di);

    render(<Welcome />);

    const devopsIcon = screen.getByTestId("openlens-devops-brand-icon");

    expect(devopsIcon).toBeInTheDocument();
    expect(devopsIcon).toHaveClass("devops-brand");
    expect(screen.queryByTestId("no-welcome-banners-icon")).not.toBeInTheDocument();
  });
});
