/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { ValidatingAdmissionPolicy, ValidatingAdmissionPolicyApi, ValidatingAdmissionPolicyData } from "../../../common/k8s-api/endpoints/validating-admission-policy.api";
import { KubeObjectStore } from "../../../common/k8s-api/kube-object.store";

export class ValidatingAdmissionPolicyStore extends KubeObjectStore<
  ValidatingAdmissionPolicy,
  ValidatingAdmissionPolicyApi,
  ValidatingAdmissionPolicyData
> {
}
