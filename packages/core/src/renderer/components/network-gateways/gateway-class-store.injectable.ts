/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import assert from "assert";
import { getInjectable } from "@ogre-tools/injectable";
import { kubeObjectStoreInjectionToken } from "../../../common/k8s-api/api-manager/kube-object-store-token";
import gatewayClassApiInjectable from "../../../common/k8s-api/endpoints/gateway-class.api.injectable";
import { GatewayClassStore } from "./gateway-class-store";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import clusterFrameContextForClusterScopedResourcesInjectable from "../../cluster-frame-context/for-cluster-scoped-resources.injectable";
import { loggerInjectionToken } from "@openlens/logger";

const gatewayClassStoreInjectable = getInjectable({
  id: "gateway-class-store",

  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "gatewayClassStore is only available in certain environments");

    const api = di.inject(gatewayClassApiInjectable);

    return new GatewayClassStore({
      context: di.inject(clusterFrameContextForClusterScopedResourcesInjectable),
      logger: di.inject(loggerInjectionToken),
    }, api);
  },

  injectionToken: kubeObjectStoreInjectionToken,
});

export default gatewayClassStoreInjectable;
