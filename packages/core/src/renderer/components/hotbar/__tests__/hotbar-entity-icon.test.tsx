/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { fireEvent } from "@testing-library/react";
import { computed, observable } from "mobx";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import activeEntityInjectable from "../../../api/catalog/entity/active.injectable";
import catalogCategoryRegistryInjectable from "../../../../common/catalog/category-registry.injectable";
import getClusterByIdInjectable from "../../../../features/cluster/storage/common/get-by-id.injectable";
import { renderFor } from "../../test-utils/renderFor";
import { KubernetesCluster } from "../../../../common/catalog-entities/kubernetes-cluster";
import { HotbarEntityIcon } from "../hotbar-entity-icon";
import { HotbarIcon } from "../hotbar-icon";

describe("<HotbarEntityIcon />", () => {
  it("fills a 36px cluster icon face without the misleading Kubernetes settings badge", () => {
    const di = getDiForUnitTesting();
    const entity = new KubernetesCluster({
      metadata: { uid: "qa-cluster", name: "qa-cluster", source: "local", labels: {}},
      spec: { kubeconfigPath: "", kubeconfigContext: "qa-cluster", environment: "production" },
      status: { phase: "disconnected" },
    });

    di.override(activeEntityInjectable, () => computed(() => undefined));
    di.override(catalogCategoryRegistryInjectable, () => ({
      getCategoryForEntity: () => ({ metadata: { icon: "settings" }}),
    } as any));
    di.override(getClusterByIdInjectable, () => () => undefined);

    const rendered = renderFor(di)(
      <HotbarEntityIcon
        entity={entity}
        index={0}
        add={jest.fn()}
        remove={jest.fn()}
        size={36}
      />,
    );

    expect(rendered.container.querySelector("#hotbarIcon-qa-cluster")).toHaveStyle({
      width: "36px",
      height: "36px",
    });
    expect(rendered.container.querySelector(".kubernetesBadge")).not.toBeInTheDocument();
    expect(rendered.container.querySelector(".badge")).not.toBeInTheDocument();
    expect(rendered.container.querySelector(".productionIndicator")).toBeInTheDocument();
  });

  it("navigates when the pin name is clicked", () => {
    const di = getDiForUnitTesting();
    const onClick = jest.fn();
    const entity = new KubernetesCluster({
      metadata: { uid: "qa-cluster", name: "qa-cluster", source: "local", labels: {}},
      spec: { kubeconfigPath: "", kubeconfigContext: "qa-cluster" },
      status: { phase: "disconnected" },
    });

    di.override(activeEntityInjectable, () => computed(() => undefined));
    di.override(catalogCategoryRegistryInjectable, () => ({
      getCategoryForEntity: () => ({ metadata: { icon: "settings" }}),
    } as any));
    di.override(getClusterByIdInjectable, () => () => undefined);

    const rendered = renderFor(di)(
      <HotbarEntityIcon
        entity={entity}
        index={0}
        add={jest.fn()}
        remove={jest.fn()}
        onClick={onClick}
        size={36}
      />,
    );

    fireEvent.click(rendered.getByText("qa-cluster"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("<HotbarIcon />", () => {
  it("does not navigate when a pin context menu item is chosen", () => {
    const di = getDiForUnitTesting();
    const onClick = jest.fn();
    const rendered = renderFor(di)(
      <HotbarIcon
        uid="qa-cluster"
        title="qa-cluster"
        menuItems={[{ title: "Remove from Hotbar", onClick: jest.fn() }]}
        onClick={onClick}
      />,
    );

    fireEvent.contextMenu(rendered.getByTestId("hotbar-pin"));
    fireEvent.click(rendered.getByText("Remove from Hotbar"));

    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("<HotbarEntityIcon /> appearance menu (H7.4)", () => {
  it("opens the appearance dialog from \"Change Color, Icon & Environment...\"", () => {
    const di = getDiForUnitTesting();
    const entity = new KubernetesCluster({
      metadata: { uid: "qa-cluster", name: "qa-cluster", source: "local", labels: {}},
      spec: { kubeconfigPath: "", kubeconfigContext: "qa-cluster" },
      status: { phase: "disconnected" },
    });
    const cluster = { id: "qa-cluster", preferences: observable({}), contextName: computed(() => "qa-cluster") };

    di.override(activeEntityInjectable, () => computed(() => undefined));
    di.override(catalogCategoryRegistryInjectable, () => ({
      getCategoryForEntity: () => ({ metadata: { icon: "settings" }, emit: () => {} }),
    } as any));
    di.override(getClusterByIdInjectable, () => () => cluster as any);

    const rendered = renderFor(di)(
      <HotbarEntityIcon
        entity={entity}
        index={0}
        add={jest.fn()}
        remove={jest.fn()}
        size={36}
      />,
    );

    fireEvent.contextMenu(rendered.getByTestId("hotbar-pin"));
    fireEvent.click(rendered.getByText("Change Color, Icon & Environment..."));

    expect(rendered.getByText("Customize Cluster & Pin Appearance")).toBeInTheDocument();
  });
});
