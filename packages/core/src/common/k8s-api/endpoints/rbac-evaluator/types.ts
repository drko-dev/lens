/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export type AccessVerdict =
  | "ALLOWED_API"         // Confirmed ALLOWED by Kubernetes API server
  | "DENIED_API"          // Confirmed DENIED by Kubernetes API server
  | "LOCAL_MATCH"         // Matched by local Roles/RoleBindings, but NOT verified by API server
  | "INDETERMINATE"       // API server returned indeterminate or error, or local analysis cannot confirm
  | "INSUFFICIENT_DATA";  // Insufficient local/remote data (e.g. RBAC 403 to list roles or inspect)

export type IdentityType = "current-user" | "service-account" | "user";

export interface ResourceAttributes {
  namespace?: string;
  verb: string;
  group?: string;
  resource?: string;
  subresource?: string;
  name?: string;
}

export interface NonResourceAttributes {
  path?: string;
  verb: string;
}

export interface AccessReviewQuery {
  identityType: IdentityType;
  serviceAccount?: {
    name: string;
    namespace: string;
  };
  user?: {
    username: string;
    groups?: string[];
  };
  resourceAttributes?: ResourceAttributes;
  nonResourceAttributes?: NonResourceAttributes;
  clusterId?: string;
  requestId?: number;
}

export interface MatchingRuleEvidence {
  bindingName: string;
  bindingKind: "RoleBinding" | "ClusterRoleBinding";
  bindingNamespace?: string;
  roleRefKind: "Role" | "ClusterRole";
  roleRefName: string;
  roleNamespace?: string;
  matchedRule: {
    verbs: string[];
    apiGroups?: string[];
    resources?: string[];
    resourceNames?: string[];
    nonResourceURLs?: string[];
  };
  matchedSubject?: {
    kind: string;
    name: string;
    namespace?: string;
  };
  scopeDescription: string;
}

export interface AccessReviewResult {
  verdict: AccessVerdict;
  allowed: boolean;
  origin: "api-server" | "local-analysis" | "fallback";
  reason?: string;
  evaluationError?: string;
  matchingEvidence: MatchingRuleEvidence[];
  warnings?: string[];
  query: AccessReviewQuery;
  timestamp: string;
  clusterId?: string;
  requestId?: number;
}

export interface RbacStoreStatus {
  isLoaded: boolean;
  failedLoading?: boolean;
  error?: any;
}

export interface LocalEvaluationResult {
  hasMatch: boolean;
  evidence: MatchingRuleEvidence[];
  isPartial: boolean;
  reason?: string;
  warnings?: string[];
  storesStatusSummary?: {
    allLoaded: boolean;
    failedStores: string[];
    unloadedStores: string[];
  };
}
