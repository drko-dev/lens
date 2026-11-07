/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  ALLOWLISTED_MCP_TOOLS,
  FORBIDDEN_WRITE_TOOLS,
} from "../../common/mcp/types";
import {
  ALLOWED_READ_VERBS,
  FORBIDDEN_RESOURCE_KINDS,
  FORBIDDEN_SUBRESOURCES,
  POSITIVE_ALLOWED_RESOURCE_KINDS,
  POSITIVE_ALLOWED_SUBRESOURCES,
  POSITIVE_ALLOWED_TOOLS,
  POSITIVE_ALLOWED_VERBS,
  type AgentTechnicalIdentity,
  type AuthorizationDecision,
  type AuthorizationRequest,
  type BrokerDecisionCode,
  type ReadVerb,
  type UserIdentity,
} from "../../common/incident/broker-types";

export interface AccessReviewCheckParams {
  clusterId: string;
  namespace?: string;
  resource: string;
  verb: string;
  subresource?: string;
  name?: string;
}

export type UserAccessReviewChecker = (
  user: UserIdentity,
  params: AccessReviewCheckParams,
) => Promise<boolean>;

export type AgentAccessReviewChecker = (
  agent: AgentTechnicalIdentity,
  params: AccessReviewCheckParams,
) => Promise<boolean>;

export class IncidentAuthorizationEngine {
  constructor(
    private readonly userAccessChecker: UserAccessReviewChecker,
    private readonly agentAccessChecker: AgentAccessReviewChecker,
  ) {}

  /**
   * Evaluates the conjunction:
   * Decision = USER_AUTHZ ∧ AGENT_AUTHZ ∧ CLUSTER_SCOPE ∧ NAMESPACE_SCOPE ∧ TOOL_ALLOWLIST
   * Fails closed on any check failure.
   */
  public async evaluateAuthorization(
    request: AuthorizationRequest,
    user: UserIdentity | undefined,
    agent: AgentTechnicalIdentity | undefined,
  ): Promise<AuthorizationDecision> {
    const checkedAt = new Date().toISOString();

    const makeDecision = (
      allowed: boolean,
      code: BrokerDecisionCode,
      reason: string,
      flags: {
        userAllowed?: boolean;
        agentAllowed?: boolean;
        scopeValid?: boolean;
        toolValid?: boolean;
      } = {},
    ): AuthorizationDecision => ({
      allowed,
      code,
      reason,
      checkedAt,
      userAllowed: flags.userAllowed ?? false,
      agentAllowed: flags.agentAllowed ?? false,
      scopeValid: flags.scopeValid ?? false,
      toolValid: flags.toolValid ?? false,
    });

    // 1. Validar Identidades obligatorias
    if (!user || !user.username) {
      return makeDecision(false, "MISSING_USER_IDENTITY", "Human operator identity is missing or unauthenticated.");
    }

    if (!agent || !agent.token) {
      return makeDecision(
        false,
        "MISSING_TECHNICAL_IDENTITY",
        "Technical ServiceAccount agent identity is missing. Operation requires verified independent identity.",
      );
    }

    if (Date.now() >= agent.expiresAt) {
      return makeDecision(false, "TOKEN_EXPIRED", "Technical ServiceAccount token has expired. Re-authentication required.");
    }

    // 2. Validar Tool Allowlist y Mutaciones Prohibidas (Positive Allowlist)
    const { toolName, verb, resourceKind, subresource, namespace, scope, targetClusterId } = request;

    if (FORBIDDEN_WRITE_TOOLS.has(toolName)) {
      return makeDecision(
        false,
        "TOOL_NOT_ALLOWLISTED",
        `Tool '${toolName}' is classified as a mutation tool and is strictly forbidden in diagnostic read-only mode.`,
      );
    }

    if (!POSITIVE_ALLOWED_TOOLS.has(toolName) || !ALLOWLISTED_MCP_TOOLS.some(t => t.name === toolName)) {
      return makeDecision(
        false,
        "TOOL_NOT_ALLOWLISTED",
        `Tool '${toolName}' is not in the positive allowlist of permitted diagnostic tools.`,
      );
    }

    // 3. Validar Verbo y Recursos (Positive Allowlist + Negative Defense)
    if (!POSITIVE_ALLOWED_VERBS.has(verb as ReadVerb) || !ALLOWED_READ_VERBS.has(verb as ReadVerb)) {
      return makeDecision(
        false,
        "VERB_FORBIDDEN",
        `Verb '${verb}' is not an authorized read-only verb (allowed: get, list, watch).`,
      );
    }

    const normalizedKind = (resourceKind || "").toLowerCase().trim();

    if (FORBIDDEN_RESOURCE_KINDS.has(normalizedKind)) {
      return makeDecision(
        false,
        "RESOURCE_FORBIDDEN",
        `Resource kind '${resourceKind}' is strictly forbidden from diagnostic discovery and AI access.`,
      );
    }

    if (!POSITIVE_ALLOWED_RESOURCE_KINDS.has(normalizedKind)) {
      return makeDecision(
        false,
        "RESOURCE_FORBIDDEN",
        `Resource kind '${resourceKind}' is not in the positive allowlist of authorized diagnostic resources.`,
      );
    }

    if (subresource) {
      const normalizedSubresource = subresource.toLowerCase().trim();

      if (FORBIDDEN_SUBRESOURCES.has(normalizedSubresource)) {
        return makeDecision(
          false,
          "SUBRESOURCE_FORBIDDEN",
          `Subresource '${subresource}' is strictly forbidden from diagnostic execution.`,
        );
      }

      if (!POSITIVE_ALLOWED_SUBRESOURCES.has(normalizedSubresource)) {
        return makeDecision(
          false,
          "SUBRESOURCE_FORBIDDEN",
          `Subresource '${subresource}' is not in the positive allowlist of permitted subresources.`,
        );
      }
    }

    // 4. Validar Alcance Real (Non-Tautological Cluster Scope y Namespace Scope)
    if (!scope.clusterId) {
      return makeDecision(
        false,
        "CLUSTER_SCOPE_VIOLATION",
        "Active investigation scope is missing a valid clusterId.",
      );
    }

    if (targetClusterId && targetClusterId !== scope.clusterId) {
      return makeDecision(
        false,
        "CLUSTER_SCOPE_VIOLATION",
        `Cross-cluster access violation: requested '${targetClusterId}' but investigation is locked to cluster '${scope.clusterId}'.`,
      );
    }

    if (scope.namespace && scope.namespace !== "*") {
      const targetNamespace = namespace || request.scope.namespace;

      if (!targetNamespace || targetNamespace !== scope.namespace) {
        return makeDecision(
          false,
          "NAMESPACE_SCOPE_VIOLATION",
          `Cross-namespace access violation: requested '${targetNamespace}' but investigation is locked to namespace '${scope.namespace}'.`,
          { toolValid: true },
        );
      }
    }

    // 5. Validar Permisos del Usuario Humano (USER_AUTHZ)
    const checkParams: AccessReviewCheckParams = {
      clusterId: scope.clusterId,
      namespace: namespace || scope.namespace,
      resource: normalizedKind,
      verb,
      subresource,
      name: request.resourceName,
    };

    let userAllowed = false;

    try {
      userAllowed = await this.userAccessChecker(user, checkParams);
    } catch {
      return makeDecision(
        false,
        "USER_NOT_AUTHORIZED",
        "Failed to verify human operator permissions via SelfSubjectAccessReview.",
        { toolValid: true, scopeValid: true },
      );
    }

    if (!userAllowed) {
      return makeDecision(
        false,
        "USER_NOT_AUTHORIZED",
        `Human operator '${user.username}' does not have '${verb}' permissions for '${resourceKind}' in namespace '${checkParams.namespace}'.`,
        { toolValid: true, scopeValid: true, userAllowed: false },
      );
    }

    // 6. Validar Permisos del Agente Técnico (AGENT_AUTHZ)
    let agentAllowed = false;

    try {
      agentAllowed = await this.agentAccessChecker(agent, checkParams);
    } catch {
      return makeDecision(
        false,
        "AGENT_NOT_AUTHORIZED",
        "Failed to verify technical ServiceAccount permissions against Kubernetes RBAC.",
        { toolValid: true, scopeValid: true, userAllowed: true },
      );
    }

    if (!agentAllowed) {
      return makeDecision(
        false,
        "AGENT_NOT_AUTHORIZED",
        `Technical ServiceAccount '${agent.serviceAccountName}' does not have '${verb}' permissions for '${resourceKind}' in namespace '${checkParams.namespace}'.`,
        { toolValid: true, scopeValid: true, userAllowed: true, agentAllowed: false },
      );
    }

    // Todos los controles aprobados
    return makeDecision(
      true,
      "ALLOWED",
      "Operation authorized under strict double-identity and scope verification.",
      {
        toolValid: true,
        scopeValid: true,
        userAllowed: true,
        agentAllowed: true,
      },
    );
  }
}
