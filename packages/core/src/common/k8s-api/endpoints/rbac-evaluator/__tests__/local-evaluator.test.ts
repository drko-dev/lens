/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Role, ClusterRole, RoleBinding, ClusterRoleBinding } from "@openlens/kube-object";
import { evaluateLocalRbac, ruleMatches, subjectMatches } from "../local-evaluator";
import type { AccessReviewQuery } from "../types";

describe("RBAC Local Evaluator", () => {
  const createMockRole = (name: string, namespace: string, rules: any[]): Role => {
    return new Role({
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "Role",
      metadata: {
        name,
        namespace,
        uid: `role-${namespace}-${name}`,
        resourceVersion: "1",
        creationTimestamp: "2026-01-01T00:00:00Z",
        selfLink: `/apis/rbac.authorization.k8s.io/v1/namespaces/${namespace}/roles/${name}`,
      },
      rules,
    });
  };

  const createMockClusterRole = (name: string, rules: any[], aggregationRule?: any): ClusterRole => {
    return new ClusterRole({
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRole",
      metadata: {
        name,
        uid: `clusterrole-${name}`,
        resourceVersion: "1",
        creationTimestamp: "2026-01-01T00:00:00Z",
        selfLink: `/apis/rbac.authorization.k8s.io/v1/clusterroles/${name}`,
      },
      rules,
      aggregationRule,
    });
  };

  const createMockRoleBinding = (name: string, namespace: string, roleRef: any, subjects: any[]): RoleBinding => {
    return new RoleBinding({
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "RoleBinding",
      metadata: {
        name,
        namespace,
        uid: `rb-${namespace}-${name}`,
        resourceVersion: "1",
        creationTimestamp: "2026-01-01T00:00:00Z",
        selfLink: `/apis/rbac.authorization.k8s.io/v1/namespaces/${namespace}/rolebindings/${name}`,
      },
      roleRef,
      subjects,
    });
  };

  const createMockClusterRoleBinding = (name: string, roleRef: any, subjects: any[]): ClusterRoleBinding => {
    return new ClusterRoleBinding({
      apiVersion: "rbac.authorization.k8s.io/v1",
      kind: "ClusterRoleBinding",
      metadata: {
        name,
        uid: `crb-${name}`,
        resourceVersion: "1",
        creationTimestamp: "2026-01-01T00:00:00Z",
        selfLink: `/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/${name}`,
      },
      roleRef,
      subjects,
    });
  };

  describe("subjectMatches", () => {
    it("matches ServiceAccount by name and namespace", () => {
      const saQuery: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "my-app", namespace: "staging" },
      };

      expect(subjectMatches({ kind: "ServiceAccount", name: "my-app", namespace: "staging" }, saQuery)).toBe(true);
      expect(subjectMatches({ kind: "ServiceAccount", name: "my-app", namespace: "prod" }, saQuery)).toBe(false);
      expect(subjectMatches({ kind: "ServiceAccount", name: "other-app", namespace: "staging" }, saQuery)).toBe(false);
    });

    it("matches ServiceAccount via group system:serviceaccounts", () => {
      const saQuery: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "my-app", namespace: "staging" },
      };

      expect(subjectMatches({ kind: "Group", name: "system:serviceaccounts" }, saQuery)).toBe(true);
      expect(subjectMatches({ kind: "Group", name: "system:serviceaccounts:staging" }, saQuery)).toBe(true);
      expect(subjectMatches({ kind: "Group", name: "system:serviceaccounts:prod" }, saQuery)).toBe(false);
    });

    it("matches User and Groups", () => {
      const userQuery: AccessReviewQuery = {
        identityType: "user",
        user: { username: "alice@example.com", groups: ["devs", "system:authenticated"] },
      };

      expect(subjectMatches({ kind: "User", name: "alice@example.com" }, userQuery)).toBe(true);
      expect(subjectMatches({ kind: "User", name: "bob@example.com" }, userQuery)).toBe(false);
      expect(subjectMatches({ kind: "Group", name: "devs" }, userQuery)).toBe(true);
      expect(subjectMatches({ kind: "Group", name: "admins" }, userQuery)).toBe(false);
    });
  });

  describe("ruleMatches — Kubernetes RBAC exact ResourceMatches semantics", () => {
    it("matches wildcard verbs and apiGroups", () => {
      const rule = {
        verbs: ["*"],
        apiGroups: ["*"],
        resources: ["pods"],
      };

      const query: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "get", group: "apps", resource: "pods" },
      };

      expect(ruleMatches(rule, query, true)).toBe(true);
    });

    it("resources: ['*'] includes both resources and subresources", () => {
      const wildcardRule = {
        verbs: ["*"],
        apiGroups: [""],
        resources: ["*"],
      };

      const getPodsQuery: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "get", group: "", resource: "pods" },
      };

      const execQuery: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "create", group: "", resource: "pods", subresource: "exec" },
      };

      expect(ruleMatches(wildcardRule, getPodsQuery, true)).toBe(true);
      expect(ruleMatches(wildcardRule, execQuery, true)).toBe(true);
    });

    it("resources: ['pods/exec'] matches specifically pods/exec, not pods or pods/log", () => {
      const execRule = {
        verbs: ["create"],
        apiGroups: [""],
        resources: ["pods/exec"],
      };

      const execQuery: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "create", group: "", resource: "pods", subresource: "exec" },
      };

      const getPodsQuery: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "get", group: "", resource: "pods" },
      };

      const logQuery: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "get", group: "", resource: "pods", subresource: "log" },
      };

      expect(ruleMatches(execRule, execQuery, true)).toBe(true);
      expect(ruleMatches(execRule, getPodsQuery, true)).toBe(false);
      expect(ruleMatches(execRule, logQuery, true)).toBe(false);
    });

    it("resources: ['*/exec'] matches subresource 'exec' across different resources", () => {
      const wildcardSubresourceRule = {
        verbs: ["create"],
        apiGroups: [""],
        resources: ["*/exec"],
      };

      const podExecQuery: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "create", group: "", resource: "pods", subresource: "exec" },
      };

      const nodeExecQuery: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "create", group: "", resource: "nodes", subresource: "exec" },
      };

      const podLogQuery: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "get", group: "", resource: "pods", subresource: "log" },
      };

      expect(ruleMatches(wildcardSubresourceRule, podExecQuery, true)).toBe(true);
      expect(ruleMatches(wildcardSubresourceRule, nodeExecQuery, true)).toBe(true);
      expect(ruleMatches(wildcardSubresourceRule, podLogQuery, true)).toBe(false);
    });

    it("negative test: does NOT treat 'pods/*' or '*/*' as universal wildcard matchers", () => {
      const podsWildcardRule = {
        verbs: ["create"],
        apiGroups: [""],
        resources: ["pods/*"],
      };

      const wildcardSlashWildcardRule = {
        verbs: ["create"],
        apiGroups: [""],
        resources: ["*/*"],
      };

      const execQuery: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "create", group: "", resource: "pods", subresource: "exec" },
      };

      // Upstream k8s ResourceMatches does not treat pods/* or */* as valid wildcards
      expect(ruleMatches(podsWildcardRule, execQuery, true)).toBe(false);
      expect(ruleMatches(wildcardSlashWildcardRule, execQuery, true)).toBe(false);
    });

    it("resources: ['pods'] does NOT match subresource 'pods/exec'", () => {
      const podsOnlyRule = {
        verbs: ["create", "get"],
        apiGroups: [""],
        resources: ["pods"],
      };

      const execQuery: AccessReviewQuery = {
        identityType: "service-account",
        resourceAttributes: { verb: "create", group: "", resource: "pods", subresource: "exec" },
      };

      expect(ruleMatches(podsOnlyRule, execQuery, true)).toBe(false);
    });

    it("enforces upstream Kubernetes resourceNames restrictions for collection verbs vs instance verbs", () => {
      const restrictedRule = {
        verbs: ["*"],
        apiGroups: [""],
        resources: ["secrets"],
        resourceNames: ["app-secret-1", "app-secret-2"],
      };

      // Instance verbs (get, update, delete, patch) match when name matches
      expect(ruleMatches(restrictedRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "get", group: "", resource: "secrets", name: "app-secret-1" },
      }, true)).toBe(true);

      expect(ruleMatches(restrictedRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "update", group: "", resource: "secrets", name: "app-secret-2" },
      }, true)).toBe(true);

      // Instance verbs do NOT match when name is missing or different
      expect(ruleMatches(restrictedRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "get", group: "", resource: "secrets", name: "app-secret-3" },
      }, true)).toBe(false);

      expect(ruleMatches(restrictedRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "get", group: "", resource: "secrets" },
      }, true)).toBe(false);

      // Root create can NEVER be authorized by resourceNames in upstream k8s (object name not known at authz time)
      expect(ruleMatches(restrictedRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "create", group: "", resource: "secrets", name: "app-secret-1" },
      }, true)).toBe(false);

      // Unfiltered collection list and watch can NEVER be authorized by resourceNames
      expect(ruleMatches(restrictedRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "list", group: "", resource: "secrets" },
      }, true)).toBe(false);

      expect(ruleMatches(restrictedRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "watch", group: "", resource: "secrets" },
      }, true)).toBe(false);

      // deletecollection is always a collection-level verb and can NEVER be authorized by resourceNames
      expect(ruleMatches(restrictedRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "deletecollection", group: "", resource: "secrets" },
      }, true)).toBe(false);

      expect(ruleMatches(restrictedRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "deletecollection", group: "", resource: "secrets", name: "app-secret-1" },
      }, true)).toBe(false);
    });

    it("authorizes named list and watch requests with resourceNames (metadata.name field selector)", () => {
      const restrictedSecretRule = {
        verbs: ["list", "watch"],
        apiGroups: [""],
        resources: ["secrets"],
        resourceNames: ["app-secret-1"],
      };

      // Named list request matching resourceNames is authorized
      expect(ruleMatches(restrictedSecretRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "list", group: "", resource: "secrets", name: "app-secret-1" },
      }, true)).toBe(true);

      // Named watch request matching resourceNames is authorized
      expect(ruleMatches(restrictedSecretRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "watch", group: "", resource: "secrets", name: "app-secret-1" },
      }, true)).toBe(true);

      // Named list/watch with different name is rejected
      expect(ruleMatches(restrictedSecretRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "list", group: "", resource: "secrets", name: "other-secret" },
      }, true)).toBe(false);

      // Unfiltered list/watch (no name) is rejected
      expect(ruleMatches(restrictedSecretRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "list", group: "", resource: "secrets" },
      }, true)).toBe(false);
    });

    it("authorizes subresource create requests with resourceNames (e.g. pods/exec targeting named pod)", () => {
      const podExecRule = {
        verbs: ["create"],
        apiGroups: [""],
        resources: ["pods/exec"],
        resourceNames: ["allowed-pod-0"],
      };

      // Subresource create targeting the named pod instance is authorized
      expect(ruleMatches(podExecRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "create", group: "", resource: "pods", subresource: "exec", name: "allowed-pod-0" },
      }, true)).toBe(true);

      // Subresource create targeting a different pod name is rejected
      expect(ruleMatches(podExecRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "create", group: "", resource: "pods", subresource: "exec", name: "disallowed-pod-1" },
      }, true)).toBe(false);

      // Subresource create without target pod name is rejected
      expect(ruleMatches(podExecRule, {
        identityType: "service-account",
        resourceAttributes: { verb: "create", group: "", resource: "pods", subresource: "exec" },
      }, true)).toBe(false);
    });

    it("evaluates non-resource URLs on cluster bindings", () => {
      const nonResourceRule = {
        verbs: ["get"],
        nonResourceURLs: ["/healthz", "/api/*"],
      };

      const healthQuery: AccessReviewQuery = {
        identityType: "service-account",
        nonResourceAttributes: { verb: "get", path: "/healthz" },
      };

      expect(ruleMatches(nonResourceRule, healthQuery, true)).toBe(true);

      const prefixQuery: AccessReviewQuery = {
        identityType: "service-account",
        nonResourceAttributes: { verb: "get", path: "/api/v1/status" },
      };

      expect(ruleMatches(nonResourceRule, prefixQuery, true)).toBe(true);

      // RoleBinding (non-cluster scoped) cannot grant nonResourceURLs
      expect(ruleMatches(nonResourceRule, healthQuery, false)).toBe(false);
    });
  });

  describe("evaluateLocalRbac namespace scoping, ClusterRoleBinding, and health status", () => {
    const roles = [
      createMockRole("pod-reader", "frontend", [
        { verbs: ["get", "list"], apiGroups: [""], resources: ["pods"] },
      ]),
    ];

    const clusterRoles = [
      createMockClusterRole("secret-reader", [
        { verbs: ["get"], apiGroups: [""], resources: ["secrets"] },
      ]),
      createMockClusterRole("cluster-admin", [
        { verbs: ["*"], apiGroups: ["*"], resources: ["*"] },
      ]),
      createMockClusterRole("aggregated-view", [], { clusterRoleSelectors: [{ matchLabels: { rbac: "view" }}] }),
    ];

    const roleBindings = [
      // RoleBinding in 'frontend' namespace
      createMockRoleBinding(
        "frontend-pod-reader-rb",
        "frontend",
        { kind: "Role", name: "pod-reader" },
        [{ kind: "ServiceAccount", name: "web-sa", namespace: "frontend" }],
      ),
      // RoleBinding in 'frontend' namespace referencing ClusterRole 'secret-reader'
      // This grants secret-reader ONLY in 'frontend' namespace!
      createMockRoleBinding(
        "frontend-secret-reader-rb",
        "frontend",
        { kind: "ClusterRole", name: "secret-reader" },
        [{ kind: "ServiceAccount", name: "web-sa", namespace: "frontend" }],
      ),
    ];

    const clusterRoleBindings = [
      createMockClusterRoleBinding(
        "admin-crb",
        { kind: "ClusterRole", name: "cluster-admin" },
        [{ kind: "ServiceAccount", name: "admin-sa", namespace: "kube-system" }],
      ),
    ];

    it("allows web-sa to get pods in frontend namespace", () => {
      const query: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "web-sa", namespace: "frontend" },
        resourceAttributes: { verb: "get", group: "", resource: "pods", namespace: "frontend" },
      };

      const result = evaluateLocalRbac({ roles, clusterRoles, roleBindings, clusterRoleBindings, query });

      expect(result.hasMatch).toBe(true);
      expect(result.evidence.length).toBe(1);
      expect(result.evidence[0].bindingName).toBe("frontend-pod-reader-rb");
      expect(result.evidence[0].scopeDescription).toContain("frontend");
    });

    it("strictly isolates: web-sa CANNOT get pods in backend namespace via frontend RoleBinding", () => {
      const query: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "web-sa", namespace: "frontend" },
        resourceAttributes: { verb: "get", group: "", resource: "pods", namespace: "backend" },
      };

      const result = evaluateLocalRbac({ roles, clusterRoles, roleBindings, clusterRoleBindings, query });

      expect(result.hasMatch).toBe(false);
      expect(result.isPartial).toBe(true);
    });

    it("scopes ClusterRole bound via RoleBinding to only the binding's namespace", () => {
      // In frontend namespace: allowed
      const allowedQuery: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "web-sa", namespace: "frontend" },
        resourceAttributes: { verb: "get", group: "", resource: "secrets", namespace: "frontend" },
      };
      const allowedRes = evaluateLocalRbac({ roles, clusterRoles, roleBindings, clusterRoleBindings, query: allowedQuery });

      expect(allowedRes.hasMatch).toBe(true);
      expect(allowedRes.evidence[0].bindingName).toBe("frontend-secret-reader-rb");

      // In production namespace: NOT allowed
      const deniedQuery: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "web-sa", namespace: "frontend" },
        resourceAttributes: { verb: "get", group: "", resource: "secrets", namespace: "production" },
      };
      const deniedRes = evaluateLocalRbac({ roles, clusterRoles, roleBindings, clusterRoleBindings, query: deniedQuery });

      expect(deniedRes.hasMatch).toBe(false);
    });

    it("ClusterRoleBinding grants cluster-wide access across all namespaces", () => {
      const query: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "admin-sa", namespace: "kube-system" },
        resourceAttributes: { verb: "delete", group: "apps", resource: "deployments", namespace: "custom-tenant" },
      };

      const result = evaluateLocalRbac({ roles, clusterRoles, roleBindings, clusterRoleBindings, query });

      expect(result.hasMatch).toBe(true);
      expect(result.evidence[0].bindingKind).toBe("ClusterRoleBinding");
      expect(result.evidence[0].bindingName).toBe("admin-crb");
      expect(result.evidence[0].scopeDescription).toContain("Cluster-wide");
    });

    it("evaluates storeStatuses and generates warnings when stores are unloaded or failed", () => {
      const query: AccessReviewQuery = {
        identityType: "service-account",
        serviceAccount: { name: "web-sa", namespace: "frontend" },
        resourceAttributes: { verb: "get", group: "", resource: "pods", namespace: "frontend" },
      };

      const result = evaluateLocalRbac({
        roles,
        clusterRoles,
        roleBindings,
        clusterRoleBindings,
        query,
        storeStatuses: {
          roles: { isLoaded: true },
          clusterRoles: { isLoaded: false },
          roleBindings: { isLoaded: true },
          clusterRoleBindings: { isLoaded: false, failedLoading: true, error: "403 Forbidden" },
        },
      });

      expect(result.storesStatusSummary?.allLoaded).toBe(false);
      expect(result.storesStatusSummary?.failedStores).toContain("ClusterRoleBindings");
      expect(result.storesStatusSummary?.unloadedStores).toContain("ClusterRoles");
      expect(result.warnings?.some(w => w.includes("ClusterRoleBindings"))).toBe(true);
      expect(result.warnings?.some(w => w.includes("aggregated-view"))).toBe(true);
    });
  });
});
