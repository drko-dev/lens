/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import autoBind from "auto-bind";
import { KubeObject } from "@openlens/kube-object";
import type {
  ClusterScopedMetadata,
  KubeJsonApiData,
  KubeObjectMetadata,
  KubeObjectScope,
} from "@openlens/kube-object";
import type { DerivedKubeApiOptions, KubeApiDependencies } from "../kube-api";
import { KubeApi } from "../kube-api";

export interface ValidationExpression {
  expression: string;
  message?: string;
  messageExpression?: string;
  reason?: string;
}

export interface MatchResources {
  matchPolicy?: string;
  namespaceSelector?: Record<string, any>;
  objectSelector?: Record<string, any>;
  resourceRules?: Array<{
    apiGroups?: string[];
    apiVersions?: string[];
    resources?: string[];
    operations?: string[];
  }>;
  excludeResourceRules?: Array<{
    apiGroups?: string[];
    apiVersions?: string[];
    resources?: string[];
    operations?: string[];
  }>;
}

export interface ValidatingAdmissionPolicySpec {
  failurePolicy?: "Fail" | "Ignore";
  matchConstraints?: MatchResources;
  validations?: ValidationExpression[];
  auditAnnotations?: Array<{
    key: string;
    valueExpression: string;
  }>;
  paramKind?: {
    apiVersion?: string;
    kind?: string;
  };
}

export interface ValidatingAdmissionPolicyStatus {
  typeChecking?: {
    expressionWarnings?: Array<{
      fieldRef: string;
      warning: string;
    }>;
  };
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
}

export type ValidatingAdmissionPolicyData = KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Cluster>,
  ValidatingAdmissionPolicyStatus,
  ValidatingAdmissionPolicySpec
>;

export class ValidatingAdmissionPolicy extends KubeObject<
  ClusterScopedMetadata,
  ValidatingAdmissionPolicyStatus,
  ValidatingAdmissionPolicySpec
> {
  static kind = "ValidatingAdmissionPolicy";
  static namespaced = false;
  static apiBase = "/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies";

  constructor(data: ValidatingAdmissionPolicyData) {
    super(data);
    autoBind(this);
  }

  getFailurePolicy(): string {
    return this.spec?.failurePolicy || "Fail";
  }

  getValidations(): ValidationExpression[] {
    return this.spec?.validations || [];
  }

  getExpressionsCount(): number {
    return this.getValidations().length;
  }

  getMatchResourcesSummary(): string {
    const rules = this.spec?.matchConstraints?.resourceRules || [];

    if (!rules.length) {
      return "*";
    }

    const resources = rules.flatMap(r => r.resources || []);

    return resources.slice(0, 3).join(", ") + (resources.length > 3 ? ` (+${resources.length - 3})` : "");
  }

  getParamKind(): string {
    if (!this.spec?.paramKind) {
      return "<none>";
    }

    return `${this.spec.paramKind.kind || "?"} (${this.spec.paramKind.apiVersion || "?"})`;
  }
}

export class ValidatingAdmissionPolicyApi extends KubeApi<ValidatingAdmissionPolicy, ValidatingAdmissionPolicyData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "admissionregistration.k8s.io": [
          "v1",
          "v1beta1",
          "v1alpha1",
        ],
      },
      fallbackApiBases: [
        "/apis/admissionregistration.k8s.io/v1beta1/validatingadmissionpolicies",
        "/apis/admissionregistration.k8s.io/v1alpha1/validatingadmissionpolicies",
      ],
      ...opts,
      objectConstructor: ValidatingAdmissionPolicy,
    });
  }
}

export interface ValidatingAdmissionPolicyBindingSpec {
  policyName: string;
  paramRef?: {
    name?: string;
    namespace?: string;
    parameterNotFoundAction?: "Allow" | "Deny";
  };
  matchResources?: MatchResources;
  validationActions?: Array<"Deny" | "Warn" | "Audit">;
}

export type ValidatingAdmissionPolicyBindingData = KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Cluster>,
  void,
  ValidatingAdmissionPolicyBindingSpec
>;

export class ValidatingAdmissionPolicyBinding extends KubeObject<
  ClusterScopedMetadata,
  void,
  ValidatingAdmissionPolicyBindingSpec
> {
  static kind = "ValidatingAdmissionPolicyBinding";
  static namespaced = false;
  static apiBase = "/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicybindings";

  constructor(data: ValidatingAdmissionPolicyBindingData) {
    super(data);
    autoBind(this);
  }

  getPolicyName(): string {
    return this.spec?.policyName || "";
  }

  getValidationActions(): string[] {
    return this.spec?.validationActions || ["Deny"];
  }

  getParamRefSummary(): string {
    if (!this.spec?.paramRef?.name) {
      return "<none>";
    }

    return this.spec.paramRef.namespace
      ? `${this.spec.paramRef.namespace}/${this.spec.paramRef.name}`
      : this.spec.paramRef.name;
  }
}

export class ValidatingAdmissionPolicyBindingApi extends KubeApi<ValidatingAdmissionPolicyBinding, ValidatingAdmissionPolicyBindingData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "admissionregistration.k8s.io": [
          "v1",
          "v1beta1",
          "v1alpha1",
        ],
      },
      fallbackApiBases: [
        "/apis/admissionregistration.k8s.io/v1beta1/validatingadmissionpolicybindings",
        "/apis/admissionregistration.k8s.io/v1alpha1/validatingadmissionpolicybindings",
      ],
      ...opts,
      objectConstructor: ValidatingAdmissionPolicyBinding,
    });
  }
}
