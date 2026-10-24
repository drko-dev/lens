/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Role, ClusterRole, RoleBinding, ClusterRoleBinding, PolicyRule, Subject } from "@openlens/kube-object";
import type { AccessReviewQuery, LocalEvaluationResult, MatchingRuleEvidence, RbacStoreStatus } from "./types";

/**
 * Checks if a subject in a RoleBinding or ClusterRoleBinding matches the query identity.
 * Aligned strictly with Kubernetes SubjectAccessReview identity conventions.
 */
export function subjectMatches(
  subject: Subject,
  query: AccessReviewQuery,
  bindingNamespace?: string,
): boolean {
  if (query.identityType === "service-account") {
    if (!query.serviceAccount?.name) {
      return false;
    }
    const saName = query.serviceAccount.name;
    const saNamespace = query.serviceAccount.namespace || "default";

    if (subject.kind === "ServiceAccount") {
      const subjectNs = subject.namespace || bindingNamespace || "default";

      return subject.name === saName && subjectNs === saNamespace;
    }

    if (subject.kind === "Group") {
      return (
        subject.name === "system:serviceaccounts" ||
        subject.name === `system:serviceaccounts:${saNamespace}` ||
        subject.name === "system:authenticated"
      );
    }

    if (subject.kind === "User") {
      return subject.name === `system:serviceaccount:${saNamespace}:${saName}`;
    }

    return false;
  }

  if (query.identityType === "user") {
    if (!query.user?.username) {
      return false;
    }
    const username = query.user.username;
    const userGroups = query.user.groups || ["system:authenticated"];

    if (subject.kind === "User") {
      return subject.name === username;
    }

    if (subject.kind === "Group") {
      return userGroups.includes(subject.name) || subject.name === "system:authenticated";
    }

    return false;
  }

  // For current-user without explicit username, local evaluation cannot match subjects reliably
  return false;
}

/**
 * Checks if a single RBAC PolicyRule permits the requested action.
 * Follows the official Kubernetes `rbac.ResourceMatches()` matcher semantics:
 * - resources: ["*"] matches all resources AND subresources.
 * - resources: ["pods/exec"] matches specifically "pods/exec".
 * - resources: ["* /exec"] matches subresource "exec" across any resource.
 * - resources: ["pods"] does NOT match subresource "pods/exec".
 * - "pods/*" and "* /*" are not treated as special universal wildcards.
 * - resourceNames restrictions: cannot authorize collection-level verbs (create, list, watch, deletecollection).
 */
export function ruleMatches(
  rule: PolicyRule,
  query: AccessReviewQuery,
  isClusterScopedBinding: boolean,
): boolean {
  // 1. Non-resource URL evaluation
  if (query.nonResourceAttributes) {
    if (!isClusterScopedBinding) {
      // RoleBindings cannot grant non-resource URL access in Kubernetes RBAC
      return false;
    }

    const { verb, path } = query.nonResourceAttributes;

    if (!verb) {
      return false;
    }

    // Verb matching
    const verbs = rule.verbs || [];
    const verbMatch = verbs.includes("*") || verbs.some(v => v.toLowerCase() === verb.toLowerCase());

    if (!verbMatch) {
      return false;
    }

    // Non-resource URL matching
    const urls = rule.nonResourceURLs || [];

    if (urls.length === 0) {
      return false;
    }

    if (!path) {
      return urls.includes("*");
    }

    return urls.some(urlPattern => {
      if (urlPattern === "*") return true;
      if (urlPattern === path) return true;

      if (urlPattern.endsWith("*")) {
        const prefix = urlPattern.slice(0, -1);

        return path.startsWith(prefix);
      }

      return false;
    });
  }

  // 2. Resource evaluation
  if (query.resourceAttributes) {
    const { verb, group = "", resource, subresource, name } = query.resourceAttributes;

    if (!verb) {
      return false;
    }

    const normalizedVerb = verb.toLowerCase();

    // 2.1 Verb match
    const verbs = rule.verbs || [];
    const verbMatch = verbs.includes("*") || verbs.some(v => v.toLowerCase() === normalizedVerb);

    if (!verbMatch) {
      return false;
    }

    // 2.2 API Group match (core group is "")
    const apiGroups = rule.apiGroups || [];
    const normalizedQueryGroup = group.toLowerCase();
    const groupMatch = apiGroups.includes("*") || apiGroups.some(g => g.toLowerCase() === normalizedQueryGroup);

    if (!groupMatch) {
      return false;
    }

    // 2.3 Official Kubernetes ResourceMatches() implementation:
    // combinedRequestedResource is:
    // - resource if subresource is empty (e.g. "pods")
    // - resource + "/" + subresource if subresource is non-empty (e.g. "pods/exec")
    const normalizedResource = (resource || "").toLowerCase();
    const normalizedSubresource = (subresource || "").toLowerCase();

    const combinedRequestedResource = normalizedSubresource
      ? `${normalizedResource}/${normalizedSubresource}`
      : normalizedResource;

    const resources = rule.resources || [];

    const resourceMatch = resources.some(ruleResource => {
      const lr = ruleResource.toLowerCase();

      // Rule has "*": in Kubernetes RBAC, "*" matches ALL resources and ALL subresources
      if (lr === "*") {
        return true;
      }

      // Exact match with combinedRequestedResource (e.g. "pods" === "pods" or "pods/exec" === "pods/exec")
      if (lr === combinedRequestedResource) {
        return true;
      }

      // Wildcard resource with specific subresource (e.g. "*/exec" matches requested subresource "exec")
      if (normalizedSubresource && lr === `*/${normalizedSubresource}`) {
        return true;
      }

      return false;
    });

    if (!resourceMatch) {
      return false;
    }

    // 2.4 Official Kubernetes resourceNames restrictions:
    // Reference: https://kubernetes.io/docs/reference/access-authn-authz/rbac/#referring-to-resources
    const ruleNames = rule.resourceNames || [];

    if (ruleNames.length > 0) {
      // 1. deletecollection is always a collection-level verb and can never be authorized by resourceNames
      if (normalizedVerb === "deletecollection") {
        return false;
      }

      // 2. Root resource "create" operates on the collection because the object name is not known
      // at authorization time (may be generated or in body). It can never be authorized by resourceNames.
      // However, subresource "create" (e.g. create pods/exec, create pods/portforward) targets an
      // existing parent resource instance whose name is known and present in authorizer attributes.
      if (normalizedVerb === "create" && !normalizedSubresource) {
        return false;
      }

      // 3. For list and watch:
      // If a request specifies a name (representing a metadata.name field selector),
      // the authorizer evaluates whether that name is permitted by rule.resourceNames.
      // If no name is specified (unfiltered collection list/watch), resourceNames can NEVER authorize it.
      if ((normalizedVerb === "list" || normalizedVerb === "watch") && !name) {
        return false;
      }

      // 4. For instance requests (get, update, patch, delete, subresource create, or named list/watch):
      // The query must provide a name, and that name must be contained in rule.resourceNames.
      if (!name || !ruleNames.includes(name)) {
        return false;
      }
    }

    return true;
  }

  return false;
}

export interface EvaluateLocalRbacParams {
  roles: Role[];
  clusterRoles: ClusterRole[];
  roleBindings: RoleBinding[];
  clusterRoleBindings: ClusterRoleBinding[];
  query: AccessReviewQuery;
  storeStatuses?: {
    roles?: RbacStoreStatus;
    clusterRoles?: RbacStoreStatus;
    roleBindings?: RbacStoreStatus;
    clusterRoleBindings?: RbacStoreStatus;
  };
}

/**
 * Pure evaluator for local RBAC definitions.
 * Evaluates Roles, ClusterRoles, RoleBindings, and ClusterRoleBindings against a given query.
 * Respects namespace scoping, official Kubernetes ResourceMatches, subresources, and resourceNames.
 * Evaluates RBAC store health and flags partial/incomplete caches without false claims.
 */
export function evaluateLocalRbac({
  roles,
  clusterRoles,
  roleBindings,
  clusterRoleBindings,
  query,
  storeStatuses,
}: EvaluateLocalRbacParams): LocalEvaluationResult {
  const evidence: MatchingRuleEvidence[] = [];
  const warnings: string[] = [];

  // Evaluate store health and completeness
  const failedStores: string[] = [];
  const unloadedStores: string[] = [];

  if (storeStatuses) {
    if (storeStatuses.roles) {
      if (!storeStatuses.roles.isLoaded) unloadedStores.push("Roles");
      if (storeStatuses.roles.failedLoading) failedStores.push("Roles");
    }

    if (storeStatuses.clusterRoles) {
      if (!storeStatuses.clusterRoles.isLoaded) unloadedStores.push("ClusterRoles");
      if (storeStatuses.clusterRoles.failedLoading) failedStores.push("ClusterRoles");
    }

    if (storeStatuses.roleBindings) {
      if (!storeStatuses.roleBindings.isLoaded) unloadedStores.push("RoleBindings");
      if (storeStatuses.roleBindings.failedLoading) failedStores.push("RoleBindings");
    }

    if (storeStatuses.clusterRoleBindings) {
      if (!storeStatuses.clusterRoleBindings.isLoaded) unloadedStores.push("ClusterRoleBindings");
      if (storeStatuses.clusterRoleBindings.failedLoading) failedStores.push("ClusterRoleBindings");
    }
  }

  const storesStatusSummary = {
    allLoaded: failedStores.length === 0 && unloadedStores.length === 0,
    failedStores,
    unloadedStores,
  };

  if (failedStores.length > 0) {
    warnings.push(`Uno o más stores de RBAC fallaron al cargar (${failedStores.join(", ")}). Posible error RBAC 403 al listar recursos.`);
  }

  if (unloadedStores.length > 0) {
    warnings.push(`Uno o más stores de RBAC no están completamente cargados (${unloadedStores.join(", ")}).`);
  }

  // Detect aggregated ClusterRoles that may have dynamic rules not materialized locally
  const aggregatedRoles = clusterRoles.filter(cr => Boolean((cr as any).raw?.aggregationRule || (cr as any).aggregationRule));

  if (aggregatedRoles.length > 0) {
    const names = aggregatedRoles.map(cr => cr.getName()).join(", ");

    warnings.push(`El clúster contiene ClusterRoles agregados (${names}) cuyas reglas finales son calculadas dinámicamente por el API server.`);
  }

  // For current-user with no explicit user/group details, local analysis cannot confirm
  if (query.identityType === "current-user" && !query.user?.username) {
    return {
      hasMatch: false,
      evidence: [],
      isPartial: true,
      reason: "Current user identity details are not available locally. Access review via Kubernetes API server required.",
      warnings,
      storesStatusSummary,
    };
  }

  const clusterRoleMap = new Map<string, ClusterRole>();

  for (const cr of clusterRoles) {
    clusterRoleMap.set(cr.getName(), cr);
  }

  // 1. Evaluate ClusterRoleBindings (Cluster-scoped)
  for (const crb of clusterRoleBindings) {
    const subjects = crb.getSubjects();
    const matchedSubject = subjects.find(s => subjectMatches(s, query));

    if (!matchedSubject) {
      continue;
    }

    if (crb.roleRef.kind === "ClusterRole") {
      const referencedRole = clusterRoleMap.get(crb.roleRef.name);

      if (!referencedRole) {
        continue;
      }

      for (const rule of referencedRole.getRules()) {
        if (ruleMatches(rule, query, true)) {
          evidence.push({
            bindingName: crb.getName(),
            bindingKind: "ClusterRoleBinding",
            roleRefKind: "ClusterRole",
            roleRefName: crb.roleRef.name,
            matchedRule: {
              verbs: [...rule.verbs],
              apiGroups: rule.apiGroups ? [...rule.apiGroups] : undefined,
              resources: rule.resources ? [...rule.resources] : undefined,
              resourceNames: rule.resourceNames ? [...rule.resourceNames] : undefined,
              nonResourceURLs: rule.nonResourceURLs ? [...rule.nonResourceURLs] : undefined,
            },
            matchedSubject: {
              kind: matchedSubject.kind,
              name: matchedSubject.name,
              namespace: matchedSubject.namespace,
            },
            scopeDescription: `Cluster-wide via ClusterRoleBinding '${crb.getName()}'`,
          });
        }
      }
    }
  }

  // 2. Evaluate RoleBindings (Namespaced)
  // Note: RoleBindings only apply if:
  // - The query is for a namespaced resource AND matches the RoleBinding's namespace.
  // - A RoleBinding CANNOT grant cluster-scoped resource access or non-resource URLs.
  if (query.resourceAttributes?.namespace) {
    const queryNamespace = query.resourceAttributes.namespace;

    // Index roles by namespace + name
    const namespacedRoleMap = new Map<string, Role>();

    for (const r of roles) {
      namespacedRoleMap.set(`${r.getNs()}/${r.getName()}`, r);
    }

    for (const rb of roleBindings) {
      const rbNamespace = rb.getNs();

      if (rbNamespace !== queryNamespace) {
        // Scoping rule: RoleBinding only grants permissions in its own namespace
        continue;
      }

      const subjects = rb.getSubjects();
      const matchedSubject = subjects.find(s => subjectMatches(s, query, rbNamespace));

      if (!matchedSubject) {
        continue;
      }

      let rulesToEvaluate: PolicyRule[] = [];
      let roleNamespace: string | undefined = undefined;

      if (rb.roleRef.kind === "Role") {
        const role = namespacedRoleMap.get(`${rbNamespace}/${rb.roleRef.name}`);

        if (role) {
          rulesToEvaluate = role.getRules();
          roleNamespace = rbNamespace;
        }
      } else if (rb.roleRef.kind === "ClusterRole") {
        // A RoleBinding referencing a ClusterRole binds its rules ONLY within rbNamespace
        const clusterRole = clusterRoleMap.get(rb.roleRef.name);

        if (clusterRole) {
          rulesToEvaluate = clusterRole.getRules();
        }
      }

      for (const rule of rulesToEvaluate) {
        if (ruleMatches(rule, query, false)) {
          evidence.push({
            bindingName: rb.getName(),
            bindingKind: "RoleBinding",
            bindingNamespace: rbNamespace,
            roleRefKind: rb.roleRef.kind as "Role" | "ClusterRole",
            roleRefName: rb.roleRef.name,
            roleNamespace,
            matchedRule: {
              verbs: [...rule.verbs],
              apiGroups: rule.apiGroups ? [...rule.apiGroups] : undefined,
              resources: rule.resources ? [...rule.resources] : undefined,
              resourceNames: rule.resourceNames ? [...rule.resourceNames] : undefined,
              nonResourceURLs: rule.nonResourceURLs ? [...rule.nonResourceURLs] : undefined,
            },
            matchedSubject: {
              kind: matchedSubject.kind,
              name: matchedSubject.name,
              namespace: matchedSubject.namespace,
            },
            scopeDescription: `Namespace '${rbNamespace}' via RoleBinding '${rb.getName()}'`,
          });
        }
      }
    }
  }

  const isPartial = evidence.length === 0 || !storesStatusSummary.allLoaded;

  let reason = "";

  if (evidence.length > 0) {
    reason = `Se encontraron ${evidence.length} regla(s) coincidentes en definiciones locales.`;

    if (!storesStatusSummary.allLoaded) {
      reason += " Atención: Almacén local incompleto; pueden existir otras reglas no evaluadas.";
    }
  } else if (!storesStatusSummary.allLoaded) {
    reason = "No se encontraron reglas coincidentes en caché, pero los stores de RBAC no están completamente cargados o fallaron. Análisis no concluyente.";
  } else {
    reason = "No se encontraron RoleBindings locales coincidentes en caché. Nota: La autorización de Kubernetes puede ser otorgada por webhooks de admisión, Node authorizer o authorizers no reflejados en RBAC.";
  }

  return {
    hasMatch: evidence.length > 0,
    evidence,
    isPartial,
    reason,
    warnings,
    storesStatusSummary,
  };
}
