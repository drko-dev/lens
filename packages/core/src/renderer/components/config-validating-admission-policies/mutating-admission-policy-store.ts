/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { MutatingAdmissionPolicy, MutatingAdmissionPolicyApi, MutatingAdmissionPolicyData } from "../../../common/k8s-api/endpoints/validating-admission-policy.api";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class MutatingAdmissionPolicyStore extends KubeObjectStore<
  MutatingAdmissionPolicy,
  MutatingAdmissionPolicyApi,
  MutatingAdmissionPolicyData
> {
}
