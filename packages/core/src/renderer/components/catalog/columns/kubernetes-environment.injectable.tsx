/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import React from "react";
import type { CatalogEntity } from "../../../../common/catalog";
import { resolveClusterEnvironment } from "../../../../common/cluster/environment-types";
import resolveEntityEnvironmentInjectable from "../resolve-entity-environment.injectable";
import { EnvironmentBadge } from "../../environment-badge";
import { customCatalogCategoryColumnInjectionToken } from "./custom-token";

const kubernetesEnvironmentColumnInjectable = getInjectable({
  id: "kubernetes-environment-column",
  instantiate: (di) => {
    const resolveEntityEnvironment = di.inject(resolveEntityEnvironmentInjectable);
    // R5-08: shared resolver; entities without environment config fall back to "none"
    const resolve = (entity: CatalogEntity) => resolveEntityEnvironment(entity) ?? resolveClusterEnvironment({});

    return {
      group: "entity.k8slens.dev",
      kind: "KubernetesCluster",
      registration: {
        id: "environment",
        priority: 20,
        renderCell: (entity: CatalogEntity) => (
          <EnvironmentBadge
            environment={resolve(entity)}
            size="sm"
            data-testid="catalog-env-badge" />
        ),
        titleProps: {
          title: "Environment",
          id: "environment",
          sortBy: "environment",
        },
        sortCallback: (entity: CatalogEntity) => resolve(entity).label,
      },
    };
  },
  injectionToken: customCatalogCategoryColumnInjectionToken,
});

export default kubernetesEnvironmentColumnInjectable;
