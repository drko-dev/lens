/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { AccessReviewClient } from "../../../../common/k8s-api/endpoints/rbac-evaluator";
import createKubeJsonApiInjectable from "../../../../common/k8s-api/create-kube-json-api.injectable";
import { apiBaseServerAddressInjectionToken } from "../../../../common/k8s-api/api-base-configs";
import windowLocationInjectable from "../../../../common/k8s-api/window-location.injectable";
import hostedClusterIdInjectable from "../../../cluster-frame-context/hosted-cluster-id.injectable";
import hostedClusterInjectable from "../../../cluster-frame-context/hosted-cluster.injectable";
import { storesAndApisCanBeCreatedInjectionToken } from "../../../../common/k8s-api/stores-apis-can-be-created.token";
import { apiKubePrefix } from "../../../../common/vars";
import isDevelopmentInjectable from "../../../../common/vars/is-development.injectable";
import type { KubeJsonApi } from "../../../../common/k8s-api/kube-json-api";

const accessReviewClientInjectable = getInjectable({
  id: "rbac-access-review-client",
  instantiate: (di) => {
    const canCreate = di.inject(storesAndApisCanBeCreatedInjectionToken);
    const getActiveClusterId = () => di.inject(hostedClusterIdInjectable);

    let jsonApi: KubeJsonApi | undefined;

    if (canCreate) {
      try {
        const createKubeJsonApi = di.inject(createKubeJsonApiInjectable);
        const apiBaseServerAddress = di.inject(apiBaseServerAddressInjectionToken);
        const isDevelopment = di.inject(isDevelopmentInjectable);
        const { host } = di.inject(windowLocationInjectable);

        jsonApi = createKubeJsonApi({
          serverAddress: apiBaseServerAddress,
          apiBase: apiKubePrefix,
          debug: isDevelopment,
        }, {
          headers: {
            "Host": host,
          },
        });
      } catch {
        jsonApi = undefined;
      }
    }

    return new AccessReviewClient({
      getJsonApi: () => jsonApi,
      getActiveClusterId,
      getClusterConnectionStatus: () => {
        const cluster = di.inject(hostedClusterInjectable);

        if (!cluster) {
          return { isOnline: false, isAccessible: false, isDisconnected: true };
        }

        const isDisconnected = typeof (cluster as any).disconnected?.get === "function"
          ? (cluster as any).disconnected.get()
          : Boolean(cluster.disconnected);
        const isAccessible = typeof (cluster as any).accessible?.get === "function"
          ? (cluster as any).accessible.get()
          : (cluster.accessible !== undefined ? Boolean(cluster.accessible) : true);
        const isOnline = typeof (cluster as any).online?.get === "function"
          ? (cluster as any).online.get()
          : (cluster.online !== undefined ? Boolean(cluster.online) : true);

        return { isOnline, isAccessible, isDisconnected };
      },
    });
  },
});

export default accessReviewClientInjectable;
