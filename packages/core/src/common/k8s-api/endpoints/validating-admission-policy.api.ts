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

export interface MutationExpression {
  patchType?: "JSONPatch" | "ApplyConfiguration";
  applyConfiguration?: {
    expression: string;
  };
  jsonPatch?: {
    expression: string;
  };
}

export interface MutatingAdmissionPolicySpec {
  failurePolicy?: "Fail" | "Ignore";
  matchConstraints?: MatchResources;
  mutations?: MutationExpression[];
  paramKind?: {
    apiVersion?: string;
    kind?: string;
  };
  reinvocationPolicy?: "Never" | "IfNeeded";
}

export type MutatingAdmissionPolicyData = KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Cluster>,
  ValidatingAdmissionPolicyStatus,
  MutatingAdmissionPolicySpec
>;

export class MutatingAdmissionPolicy extends KubeObject<
  ClusterScopedMetadata,
  ValidatingAdmissionPolicyStatus,
  MutatingAdmissionPolicySpec
> {
  static kind = "MutatingAdmissionPolicy";
  static namespaced = false;
  static apiBase = "/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicies";

  constructor(data: MutatingAdmissionPolicyData) {
    super(data);
    autoBind(this);
  }

  getFailurePolicy(): string {
    return this.spec?.failurePolicy || "Fail";
  }

  getMutations(): MutationExpression[] {
    return this.spec?.mutations || [];
  }

  getMutationsCount(): number {
    return this.getMutations().length;
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

export class MutatingAdmissionPolicyApi extends KubeApi<MutatingAdmissionPolicy, MutatingAdmissionPolicyData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "admissionregistration.k8s.io": [
          "v1alpha1",
        ],
      },
      ...opts,
      objectConstructor: MutatingAdmissionPolicy,
    });
  }
}

export interface MutatingAdmissionPolicyBindingSpec {
  policyName: string;
  paramRef?: {
    name?: string;
    namespace?: string;
    parameterNotFoundAction?: "Allow" | "Deny";
  };
  matchResources?: MatchResources;
}

export type MutatingAdmissionPolicyBindingData = KubeJsonApiData<
  KubeObjectMetadata<KubeObjectScope.Cluster>,
  void,
  MutatingAdmissionPolicyBindingSpec
>;

export class MutatingAdmissionPolicyBinding extends KubeObject<
  ClusterScopedMetadata,
  void,
  MutatingAdmissionPolicyBindingSpec
> {
  static kind = "MutatingAdmissionPolicyBinding";
  static namespaced = false;
  static apiBase = "/apis/admissionregistration.k8s.io/v1alpha1/mutatingadmissionpolicybindings";

  constructor(data: MutatingAdmissionPolicyBindingData) {
    super(data);
    autoBind(this);
  }

  getPolicyName(): string {
    return this.spec?.policyName || "";
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

export class MutatingAdmissionPolicyBindingApi extends KubeApi<MutatingAdmissionPolicyBinding, MutatingAdmissionPolicyBindingData> {
  constructor(deps: KubeApiDependencies, opts: DerivedKubeApiOptions = {}) {
    super(deps, {
      checkPreferredVersion: true,
      allowedUsableVersions: {
        "admissionregistration.k8s.io": [
          "v1alpha1",
        ],
      },
      ...opts,
      objectConstructor: MutatingAdmissionPolicyBinding,
    });
  }
}
