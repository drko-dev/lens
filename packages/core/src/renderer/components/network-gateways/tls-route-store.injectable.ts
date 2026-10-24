/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { kubeObjectStoreInjectionToken } from "../../../common/k8s-api/api-manager/kube-object-store-token";
import tlsRouteApiInjectable from "../../../common/k8s-api/endpoints/tls-route.api.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFrameContextForNamespacedResourcesInjectable from "../../cluster-frame-context/for-namespaced-resources.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import { TLSRouteStore } from "./tls-route-store";

const tlsRouteStoreInjectable = getInjectable({
  id: "tls-route-store",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "tlsRouteStore is only available in certain environments");

    const api = di.inject(tlsRouteApiInjectable);

    return new TLSRouteStore({
      context: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
      logger: di.inject(loggerInjectionToken),
    }, api);
  },
  injectionToken: kubeObjectStoreInjectionToken,
});

export default tlsRouteStoreInjectable;
