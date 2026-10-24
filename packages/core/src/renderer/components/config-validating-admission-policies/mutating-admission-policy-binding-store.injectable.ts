/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { kubeObjectStoreInjectionToken } from "../../../common/k8s-api/api-manager/kube-object-store-token";
import mutatingAdmissionPolicyBindingApiInjectable from "../../../common/k8s-api/endpoints/mutating-admission-policy-binding.api.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFrameContextForNamespacedResourcesInjectable from "../../cluster-frame-context/for-namespaced-resources.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import { MutatingAdmissionPolicyBindingStore } from "./mutating-admission-policy-binding-store";

const mutatingAdmissionPolicyBindingStoreInjectable = getInjectable({
  id: "mutating-admission-policy-binding-store",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "mutatingAdmissionPolicyBindingStore is only available in certain environments");

    const api = di.inject(mutatingAdmissionPolicyBindingApiInjectable);

    return new MutatingAdmissionPolicyBindingStore({
      context: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
      logger: di.inject(loggerInjectionToken),
    }, api);
  },
  injectionToken: kubeObjectStoreInjectionToken,
});

export default mutatingAdmissionPolicyBindingStoreInjectable;
