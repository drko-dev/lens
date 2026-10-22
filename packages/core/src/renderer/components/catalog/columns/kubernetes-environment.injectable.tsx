/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import React from "react";
import type { CatalogEntity } from "../../../../common/catalog";
import { isKubernetesCluster } from "../../../../common/catalog-entities/kubernetes-cluster";
import { resolveClusterEnvironment } from "../../../../common/cluster/environment-types";
import getClusterByIdInjectable from "../../../../features/cluster/storage/common/get-by-id.injectable";
import { EnvironmentBadge } from "../../environment-badge";
import { customCatalogCategoryColumnInjectionToken } from "./custom-token";

const kubernetesEnvironmentColumnInjectable = getInjectable({
  id: "kubernetes-environment-column",
  instantiate: (di) => {
    const getClusterById = di.inject(getClusterByIdInjectable);
    const resolve = (entity: CatalogEntity) => resolveClusterEnvironment({
      preferences: getClusterById(entity.getId())?.preferences,
      spec: isKubernetesCluster(entity)
        ? { environment: entity.spec.environment, customEnvironmentName: entity.spec.customEnvironmentName }
        : undefined,
    });

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
