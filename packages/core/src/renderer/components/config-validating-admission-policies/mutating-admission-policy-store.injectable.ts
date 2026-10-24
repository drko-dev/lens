/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { kubeObjectStoreInjectionToken } from "../../../common/k8s-api/api-manager/kube-object-store-token";
import mutatingAdmissionPolicyApiInjectable from "../../../common/k8s-api/endpoints/mutating-admission-policy.api.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFrameContextForNamespacedResourcesInjectable from "../../cluster-frame-context/for-namespaced-resources.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import { MutatingAdmissionPolicyStore } from "./mutating-admission-policy-store";

const mutatingAdmissionPolicyStoreInjectable = getInjectable({
  id: "mutating-admission-policy-store",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "mutatingAdmissionPolicyStore is only available in certain environments");

    const api = di.inject(mutatingAdmissionPolicyApiInjectable);

    return new MutatingAdmissionPolicyStore({
      context: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
      logger: di.inject(loggerInjectionToken),
    }, api);
  },
  injectionToken: kubeObjectStoreInjectionToken,
});

export default mutatingAdmissionPolicyStoreInjectable;
