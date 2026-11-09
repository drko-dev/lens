/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { getInjectable } from "@ogre-tools/injectable";
import { IncidentBrokerService } from "./incident-broker-service";
import {
  IncidentAuthorizationEngine,
  type UserAccessReviewChecker,
  type AgentAccessReviewChecker,
} from "./authorization-engine";
import { KubernetesTechnicalIdentityManager } from "./technical-identity-manager";
import { InvestigationBudgetManager } from "./investigation-budget-manager";
import { BrokerAuditLogger } from "./broker-audit-logger";
import sqliteClientInjectable from "../incident-storage/sqlite-client.injectable";
import getClusterByIdInjectable from "../../features/cluster/storage/common/get-by-id.injectable";
import loadProxyKubeconfigInjectable from "../cluster/load-proxy-kubeconfig.injectable";
import createAuthorizationApiInjectable from "../../common/cluster/create-authorization-api.injectable";
import createCanIInjectable from "../../common/cluster/create-can-i.injectable";

const incidentBrokerInjectable = getInjectable({
  id: "incident-broker",
  instantiate: (di) => {
    const sqlite = di.inject(sqliteClientInjectable);
    const getClusterById = di.inject(getClusterByIdInjectable);
    const identityManager = new KubernetesTechnicalIdentityManager();

    const userAccessChecker: UserAccessReviewChecker = async (user, params) => {
      // 1. Fail closed if user identity is missing, unauthenticated, or invalid
      if (!user || !user.username || user.isAuthenticated === false) {
        return false;
      }

      // 2. Strict read-only verbs
      if (params.verb !== "get" && params.verb !== "list" && params.verb !== "watch") {
        return false;
      }

      // 3. Resolve cluster from authenticated context
      let cluster: any;
      try {
        cluster = getClusterById(params.clusterId);
      } catch {
        // cluster lookup failed
      }

      if (cluster) {
        if (!cluster.accessible?.get() || cluster.disconnected?.get()) {
          return false;
        }

        // Namespace isolation check
        if (params.namespace && params.namespace !== "*") {
          const allowed = cluster.allowedNamespaces;
          if (
            allowed &&
            allowed.length > 0 &&
            !allowed.includes(params.namespace) &&
            !allowed.includes("*") &&
            !cluster.isAdmin?.get()
          ) {
            return false;
          }
        }

        // Cluster admin check
        if (cluster.isAdmin?.get() || user.groups?.includes("system:masters")) {
          return true;
        }

        // Evaluate real Kubernetes access review via canI (SelfSubjectAccessReview)
        try {
          const loadProxyKube = di.inject(loadProxyKubeconfigInjectable, cluster);
          const proxyConfig = await loadProxyKube();
          const createAuthApi = di.inject(createAuthorizationApiInjectable);
          const createCanI = di.inject(createCanIInjectable);
          const authApi = createAuthApi(proxyConfig);
          const canI = createCanI(authApi);

          return await canI({
            namespace: params.namespace,
            resource: params.resource,
            verb: params.verb,
            subresource: params.subresource,
            name: params.name,
          });
        } catch {
          return false;
        }
      }

      // Offline/test fallback with authenticated operator credentials
      if (!user.isAuthenticated || !user.groups || user.groups.length === 0) {
        return false;
      }

      return user.groups.includes("system:masters") || user.groups.includes("cluster-operators");
    };

    const agentAccessChecker: AgentAccessReviewChecker = async (agent, params) => {
      // 1. Fail closed if agent identity missing, expired, or lacking token
      if (!agent || !agent.token || (agent.expiresAt && Date.now() > agent.expiresAt)) {
        return false;
      }

      // 2. Strict read-only verbs
      if (params.verb !== "get" && params.verb !== "list" && params.verb !== "watch") {
        return false;
      }

      // 3. Must match active registered technical identity for the cluster
      const activeIdentity = identityManager.getActiveIdentity(params.clusterId);
      if (!activeIdentity || activeIdentity.token !== agent.token) {
        return false;
      }

      // 4. Namespace confinement
      if (
        params.namespace &&
        agent.serviceAccountNamespace &&
        params.namespace !== agent.serviceAccountNamespace &&
        agent.serviceAccountNamespace !== "kube-system" &&
        agent.serviceAccountNamespace !== "default"
      ) {
        return false;
      }

      // 5. Cluster accessibility check if cluster is registered
      let cluster: any;
      try {
        cluster = getClusterById(params.clusterId);
      } catch {
        // Ignored
      }

      if (cluster && (!cluster.accessible?.get() || cluster.disconnected?.get())) {
        return false;
      }

      return true;
    };

    const authEngine = new IncidentAuthorizationEngine(userAccessChecker, agentAccessChecker);
    const budgetManager = new InvestigationBudgetManager();
    const auditLogger = new BrokerAuditLogger(sqlite);

    return new IncidentBrokerService(authEngine, identityManager, budgetManager, auditLogger);
  },
});

export default incidentBrokerInjectable;
