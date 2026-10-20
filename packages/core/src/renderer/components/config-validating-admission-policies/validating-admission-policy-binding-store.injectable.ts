/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import assert from "assert";
import { kubeObjectStoreInjectionToken } from "../../../common/k8s-api/api-manager/kube-object-store-token";
import validatingAdmissionPolicyBindingApiInjectable from "../../../common/k8s-api/endpoints/validating-admission-policy-binding.api.injectable";
import { loggerInjectionToken } from "@openlens/logger";
import clusterFrameContextForNamespacedResourcesInjectable from "../../cluster-frame-context/for-namespaced-resources.injectable";
import storesAndApisCanBeCreatedInjectable from "../../stores-apis-can-be-created.injectable";
import { ValidatingAdmissionPolicyBindingStore } from "./validating-admission-policy-binding-store";

const validatingAdmissionPolicyBindingStoreInjectable = getInjectable({
  id: "validating-admission-policy-binding-store",
  instantiate: (di) => {
    assert(di.inject(storesAndApisCanBeCreatedInjectable), "validatingAdmissionPolicyBindingStore is only available in certain environments");

    const api = di.inject(validatingAdmissionPolicyBindingApiInjectable);

    return new ValidatingAdmissionPolicyBindingStore({
      context: di.inject(clusterFrameContextForNamespacedResourcesInjectable),
      logger: di.inject(loggerInjectionToken),
    }, api);
  },
  injectionToken: kubeObjectStoreInjectionToken,
});

export default validatingAdmissionPolicyBindingStoreInjectable;
