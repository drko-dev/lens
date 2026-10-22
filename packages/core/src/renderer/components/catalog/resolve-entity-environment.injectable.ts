/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { CatalogEntity } from "../../../common/catalog";
import { isKubernetesCluster } from "../../../common/catalog-entities/kubernetes-cluster";
import type { ClusterEnvironmentConfig } from "../../../common/cluster/environment-types";
import { resolveClusterEnvironment } from "../../../common/cluster/environment-types";
import getClusterByIdInjectable from "../../../features/cluster/storage/common/get-by-id.injectable";

export type ResolveEntityEnvironment = (entity: CatalogEntity) => ClusterEnvironmentConfig | undefined;

/**
 * R5-08: single resolver for the environment of a catalog entity.
 * Explicit cluster preference first, then entity spec; never inferred from names.
 * Returns undefined for entities that are not Kubernetes clusters.
 */
const resolveEntityEnvironmentInjectable = getInjectable({
  id: "resolve-entity-environment",
  instantiate: (di): ResolveEntityEnvironment => {
    const getClusterById = di.inject(getClusterByIdInjectable);

    return (entity) => isKubernetesCluster(entity)
      ? resolveClusterEnvironment({
        preferences: getClusterById(entity.getId())?.preferences,
        spec: { environment: entity.spec.environment, customEnvironmentName: entity.spec.customEnvironmentName },
      })
      : undefined;
  },
});

export default resolveEntityEnvironmentInjectable;
