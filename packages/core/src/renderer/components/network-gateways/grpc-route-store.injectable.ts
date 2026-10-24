/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { kubeObjectStoreInjectionToken } from "../../../common/k8s-api/api-manager/kube-object-store-token";
import grpcRouteApiInjectable from "../../../common/k8s-api/endpoints/grpc-route.api.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFrameContextForNamespacedResourcesInjectable from "../../cluster-frame-context/for-namespaced-resources.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import { GRPCRouteStore } from "./grpc-route-store";

const grpcRouteStoreInjectable = getInjectable({
  id: "grpc-route-store",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "grpcRouteStore is only available in certain environments");

    const api = di.inject(grpcRouteApiInjectable);

    return new GRPCRouteStore({
      context: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
      logger: di.inject(loggerInjectionToken),
    }, api);
  },
  injectionToken: kubeObjectStoreInjectionToken,
});

export default grpcRouteStoreInjectable;
