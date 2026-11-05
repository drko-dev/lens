/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export const DEFAULT_TECHNICAL_SA_NAME = "openlens-ai-investigator";
export const DEFAULT_TECHNICAL_SA_NAMESPACE = "kube-system";
export const DEFAULT_TECHNICAL_AUDIENCE = "openlens-ai-investigator";
export const MAX_TOKEN_TTL_SECONDS = 3600; // 1 hour

export const ALLOWED_READ_VERBS = new Set(["get", "list", "watch"] as const);
export type ReadVerb = "get" | "list" | "watch";

export const FORBIDDEN_RESOURCE_KINDS = new Set([
  "secret",
  "secrets",
  "serviceaccount",
  "serviceaccounts",
  "role",
  "roles",
  "clusterrole",
  "clusterroles",
  "rolebinding",
  "rolebindings",
  "clusterrolebinding",
  "clusterrolebindings",
]);

export const FORBIDDEN_SUBRESOURCES = new Set([
  "exec",
  "attach",
  "portforward",
  "port-forward",
  "proxy",
  "token",
  "status", // mutators via subresource
]);

export type BrokerDecisionCode =
  | "ALLOWED"
  | "USER_NOT_AUTHORIZED"
  | "AGENT_NOT_AUTHORIZED"
  | "CLUSTER_SCOPE_VIOLATION"
  | "NAMESPACE_SCOPE_VIOLATION"
  | "TOOL_NOT_ALLOWLISTED"
  | "RESOURCE_FORBIDDEN"
  | "SUBRESOURCE_FORBIDDEN"
  | "VERB_FORBIDDEN"
  | "SESSION_INVALIDATED"
  | "TOKEN_EXPIRED"
  | "MISSING_TECHNICAL_IDENTITY"
  | "MISSING_USER_IDENTITY"
  | "BUDGET_EXHAUSTED"
  | "OPERATION_ABORTED";

export interface InvestigationScope {
  incidentId: string;
  clusterId: string;
  namespace: string;
  resourceKind?: string;
  resourceName?: string;
}

export interface UserIdentity {
  username: string;
  groups?: string[];
  extra?: Record<string, string[]>;
}

export interface AgentTechnicalIdentity {
  serviceAccountName: string;
  serviceAccountNamespace: string;
  audience: string;
  token: string;
  issuedAt: number;
  expiresAt: number;
}

export interface AuthorizationRequest {
  scope: InvestigationScope;
  toolName: string;
  resourceKind: string;
  resourceName?: string;
  namespace?: string;
  subresource?: string;
  verb: ReadVerb;
}

export interface AuthorizationDecision {
  allowed: boolean;
  code: BrokerDecisionCode;
  reason: string;
  checkedAt: string;
  userAllowed: boolean;
  agentAllowed: boolean;
  scopeValid: boolean;
  toolValid: boolean;
}

export interface BrokerSession {
  sessionId: string;
  incidentId: string;
  clusterId: string;
  namespace: string;
  userIdentity: UserIdentity;
  createdAt: number;
  lastActiveAt: number;
  isValid: boolean;
  invalidationReason?: string;
}
