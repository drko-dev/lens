/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { kubeObjectStoreInjectionToken } from "../../../common/k8s-api/api-manager/kube-object-store-token";
import resourceSliceApiInjectable from "../../../common/k8s-api/endpoints/resource-slice.api.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFrameContextForClusterScopedResourcesInjectable from "../../cluster-frame-context/for-cluster-scoped-resources.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import { ResourceSliceStore } from "./resource-slice-store";

const resourceSliceStoreInjectable = getInjectable({
  id: "resource-slice-store",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "resourceSliceStore is only available in certain environments");

    const api = di.inject(resourceSliceApiInjectable);

    return new ResourceSliceStore({
      context: di.inject(clusterFrameContextForClusterScopedResourcesInjectable),
      logger: di.inject(loggerInjectionToken),
    }, api);
  },
  injectionToken: kubeObjectStoreInjectionToken,
});

export default resourceSliceStoreInjectable;
