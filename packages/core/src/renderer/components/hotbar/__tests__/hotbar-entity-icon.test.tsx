/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "@testing-library/jest-dom/extend-expect";
import React from "react";
import { computed } from "mobx";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import activeEntityInjectable from "../../../api/catalog/entity/active.injectable";
import catalogCategoryRegistryInjectable from "../../../../common/catalog/category-registry.injectable";
import getClusterByIdInjectable from "../../../../features/cluster/storage/common/get-by-id.injectable";
import { renderFor } from "../../test-utils/renderFor";
import { KubernetesCluster } from "../../../../common/catalog-entities/kubernetes-cluster";
import { HotbarEntityIcon } from "../hotbar-entity-icon";

describe("<HotbarEntityIcon />", () => {
  it("fills a 56px cluster pin without the misleading Kubernetes settings badge", () => {
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
        size={56}
      />,
    );

    expect(rendered.container.querySelector("#hotbarIcon-qa-cluster")).toHaveStyle({
      width: "56px",
      height: "56px",
    });
    expect(rendered.container.querySelector(".kubernetesBadge")).not.toBeInTheDocument();
    expect(rendered.container.querySelector(".badge")).not.toBeInTheDocument();
    expect(rendered.container.querySelector(".productionIndicator")).toBeInTheDocument();
  });
});
