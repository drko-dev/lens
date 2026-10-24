/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { MutatingAdmissionPolicyBinding, MutatingAdmissionPolicyBindingApi, MutatingAdmissionPolicyBindingData } from "../../../common/k8s-api/endpoints/validating-admission-policy.api";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class MutatingAdmissionPolicyBindingStore extends KubeObjectStore<
  MutatingAdmissionPolicyBinding,
  MutatingAdmissionPolicyBindingApi,
  MutatingAdmissionPolicyBindingData
> {
}
