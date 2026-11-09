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
      if (!user || !user.username || user.isAuthenticated !== true) {
        return false;
      }

      // 2. Strict read-only verbs
      if (params.verb !== "get" && params.verb !== "list" && params.verb !== "watch") {
        return false;
      }

      // 3. Resolve cluster from authenticated context - fail closed if not found or inaccessible
      let cluster: any;
      try {
        cluster = getClusterById(params.clusterId);
      } catch {
        return false;
      }

      if (!cluster || !cluster.accessible?.get() || cluster.disconnected?.get()) {
        return false;
      }

      // 4. Namespace isolation check
      if (params.namespace && params.namespace !== "*") {
        const allowed = cluster.allowedNamespaces;
        if (allowed && allowed.length > 0 && !allowed.includes(params.namespace) && !allowed.includes("*")) {
          return false;
        }
      }

      // 5. Evaluate real Kubernetes access review via canI (SelfSubjectAccessReview)
      // Strictly fail-closed: NO bypassing via cluster.isAdmin or system:masters declarations
      try {
        const loadProxyKube = di.inject(loadProxyKubeconfigInjectable, cluster);
        const proxyConfig = await loadProxyKube();
        const createAuthApi = di.inject(createAuthorizationApiInjectable);
        const createCanI = di.inject(createCanIInjectable);
        const authApi = createAuthApi(proxyConfig);
        const canI = createCanI(authApi);

        const allowed = await canI({
          namespace: params.namespace,
          resource: params.resource,
          verb: params.verb,
          subresource: params.subresource,
          name: params.name,
        });

        return allowed === true;
      } catch {
        return false;
      }
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

      // 4. Namespace confinement: strictly enforced with ZERO exceptions for default or kube-system
      if (params.namespace && agent.serviceAccountNamespace && params.namespace !== agent.serviceAccountNamespace) {
        return false;
      }

      // 5. Resolve cluster from authenticated context - fail closed if missing or inaccessible
      let cluster: any;
      try {
        cluster = getClusterById(params.clusterId);
      } catch {
        return false;
      }

      if (!cluster || !cluster.accessible?.get() || cluster.disconnected?.get()) {
        return false;
      }

      // 6. Consult effective Kubernetes permissions via SubjectAccessReview for the ServiceAccount identity
      try {
        const loadProxyKube = di.inject(loadProxyKubeconfigInjectable, cluster);
        const proxyConfig = await loadProxyKube();
        const createAuthApi = di.inject(createAuthorizationApiInjectable);
        const authApi = createAuthApi(proxyConfig);

        const saUsername = `system:serviceaccount:${agent.serviceAccountNamespace}:${agent.serviceAccountName}`;
        const saGroups = ["system:serviceaccounts", `system:serviceaccounts:${agent.serviceAccountNamespace}`];

        const sarRes = await authApi.createSubjectAccessReview({
          apiVersion: "authorization.k8s.io/v1",
          kind: "SubjectAccessReview",
          spec: {
            user: saUsername,
            groups: saGroups,
            resourceAttributes: {
              namespace: params.namespace,
              resource: params.resource,
              verb: params.verb,
              subresource: params.subresource,
              name: params.name,
            },
          },
        });

        return sarRes.body.status?.allowed === true;
      } catch {
        return false;
      }
    };

    const authEngine = new IncidentAuthorizationEngine(userAccessChecker, agentAccessChecker);
    const budgetManager = new InvestigationBudgetManager();
    const auditLogger = new BrokerAuditLogger(sqlite);

    return new IncidentBrokerService(authEngine, identityManager, budgetManager, auditLogger);
  },
});

export default incidentBrokerInjectable;
