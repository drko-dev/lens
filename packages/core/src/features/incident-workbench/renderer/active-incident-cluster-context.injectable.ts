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

      const clusterId = queryClusterId || activeCluster.get()?.id || hostedClusterId || undefined;
      const namespace = queryNamespace || undefined;

      return {
        clusterId,
        namespace,
      };
    });
  },
});

export default activeIncidentClusterContextInjectable;
