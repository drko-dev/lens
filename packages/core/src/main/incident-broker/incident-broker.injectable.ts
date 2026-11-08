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

const incidentBrokerInjectable = getInjectable({
  id: "incident-broker",
  instantiate: (di) => {
    const sqlite = di.inject(sqliteClientInjectable);

    const userAccessChecker: UserAccessReviewChecker = async (user, params) => {
      if (!user || !user.username) return false;
      return params.verb === "get" || params.verb === "list";
    };

    const agentAccessChecker: AgentAccessReviewChecker = async (agent, params) => {
      if (!agent || (agent.expiresAt && Date.now() > agent.expiresAt)) return false;
      return params.verb === "get" || params.verb === "list";
    };

    const authEngine = new IncidentAuthorizationEngine(userAccessChecker, agentAccessChecker);
    const identityManager = new KubernetesTechnicalIdentityManager();
    const budgetManager = new InvestigationBudgetManager();
    const auditLogger = new BrokerAuditLogger(sqlite);

    return new IncidentBrokerService(authEngine, identityManager, budgetManager, auditLogger);
  },
});

export default incidentBrokerInjectable;
