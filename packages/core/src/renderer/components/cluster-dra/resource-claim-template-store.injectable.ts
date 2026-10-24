/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { kubeObjectStoreInjectionToken } from "../../../common/k8s-api/api-manager/kube-object-store-token";
import resourceClaimTemplateApiInjectable from "../../../common/k8s-api/endpoints/resource-claim-template.api.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFrameContextForNamespacedResourcesInjectable from "../../cluster-frame-context/for-namespaced-resources.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import { ResourceClaimTemplateStore } from "./resource-claim-template-store";

const resourceClaimTemplateStoreInjectable = getInjectable({
  id: "resource-claim-template-store",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "resourceClaimTemplateStore is only available in certain environments");

    const api = di.inject(resourceClaimTemplateApiInjectable);

    return new ResourceClaimTemplateStore({
      context: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
      logger: di.inject(loggerInjectionToken),
    }, api);
  },
  injectionToken: kubeObjectStoreInjectionToken,
});

export default resourceClaimTemplateStoreInjectable;
