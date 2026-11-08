/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { computed } from "mobx";
import queryParametersInjectable from "../../../renderer/routes/query-parameters.injectable";
import activeEntityInternalClusterInjectable from "../../../renderer/api/catalog/entity/get-active-cluster-entity.injectable";
import hostedClusterIdInjectable from "../../../renderer/cluster-frame-context/hosted-cluster-id.injectable";

export interface ActiveIncidentClusterContext {
  clusterId?: string;
  namespace?: string;
}

const activeIncidentClusterContextInjectable = getInjectable({
  id: "active-incident-cluster-context",

  instantiate: (di) => {
    const queryParameters = di.inject(queryParametersInjectable);
    const activeCluster = di.inject(activeEntityInternalClusterInjectable);
    const hostedClusterId = di.inject(hostedClusterIdInjectable);

    return computed((): ActiveIncidentClusterContext => {
      const params = queryParameters.get() as Record<string, string | string[] | undefined>;
      const queryClusterId = typeof params?.clusterId === "string" ? params.clusterId.trim() : undefined;
      const queryNamespace = typeof params?.namespace === "string" ? params.namespace.trim() : undefined;

      // H8.8-05-R4 (P0-A): Never treat URL query parameters as authorized identity or give them precedence.
      // Obtain trusted identity strictly from real window context:
      const activeClusterEntity = activeCluster.get();
      const entityClusterId = activeClusterEntity?.id;

      // Discrepancy check between hostedClusterId and activeCluster if both exist:
      if (hostedClusterId && entityClusterId && hostedClusterId !== entityClusterId) {
        // Discrepancy between window host and active entity: fail-closed
        return { clusterId: undefined, namespace: undefined };
      }

      const realWindowClusterId = hostedClusterId || entityClusterId || undefined;

      // If real window cluster context is absent, do not infer/assume any identity:
      if (!realWindowClusterId) {
        return { clusterId: undefined, namespace: undefined };
      }

      // If URL parameter was provided, it must match the authentic window context; reject discrepancies fail-closed:
      if (queryClusterId && queryClusterId !== realWindowClusterId) {
        return { clusterId: undefined, namespace: undefined };
      }

      // Check namespace separately:
      let authorizedNamespace: string | undefined = undefined;
      if (queryNamespace) {
        const accessibleNamespaces = activeClusterEntity?.accessibleNamespaces;
        if (Array.isArray(accessibleNamespaces) && accessibleNamespaces.length > 0) {
          if (!accessibleNamespaces.includes(queryNamespace)) {
            // Discrepancy: requested namespace is outside cluster's accessible scope
            return { clusterId: undefined, namespace: undefined };
          }
        }
        authorizedNamespace = queryNamespace;
      }

      return {
        clusterId: realWindowClusterId,
        namespace: authorizedNamespace,
      };
    });
  },
});

export default activeIncidentClusterContextInjectable;
