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

export const POSITIVE_ALLOWED_TOOLS = new Set([
  "list_resources",
  "get_resource",
  "get_pod_logs",
  "get_events",
  "get_cluster_info",
  "list_clusters",
  "estimate_cluster_costs",
]);

export const POSITIVE_ALLOWED_RESOURCE_KINDS = new Set([
  "pods",
  "pod",
  "deployments",
  "deployment",
  "services",
  "service",
  "configmaps",
  "configmap",
  "events",
  "event",
  "nodes",
  "node",
  "ingresses",
  "ingress",
  "persistentvolumeclaims",
  "persistentvolumeclaim",
  "statefulsets",
  "statefulset",
  "daemonsets",
  "daemonset",
  "replicasets",
  "replicaset",
  "jobs",
  "job",
  "cronjobs",
  "cronjob",
]);

export const POSITIVE_ALLOWED_VERBS = new Set(["get", "list", "watch"] as const);

export const POSITIVE_ALLOWED_SUBRESOURCES = new Set([
  "log",
  "status",
]);

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
  "token",
  "tokens",
  "certificatesigningrequest",
  "certificatesigningrequests",
]);

export const FORBIDDEN_SUBRESOURCES = new Set([
  "exec",
  "attach",
  "portforward",
  "port-forward",
  "proxy",
  "token",
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
  targetClusterId?: string;
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
