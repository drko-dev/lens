/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { IncidentAuthorizationEngine } from "../authorization-engine";
import { IncidentBrokerService, BrokerSecurityError, type OperationAuditRecord } from "../incident-broker-service";
import { KubernetesTechnicalIdentityManager } from "../technical-identity-manager";
import type { AgentTechnicalIdentity, UserIdentity } from "../../../common/incident/broker-types";

describe("H8-010: IncidentBrokerService & Double Identity Authorization Engine", () => {
  let identityManager: KubernetesTechnicalIdentityManager;
  let userAccessMock: jest.Mock;
  let agentAccessMock: jest.Mock;
  let authEngine: IncidentAuthorizationEngine;
  let broker: IncidentBrokerService;

  const clusterId = "k8s-prod-cluster-01";
  const namespace = "production";
  const incidentId = "INC-TEST-001";

  const adminUser: UserIdentity = {
    username: "admin-ops@company.com",
    groups: ["system:masters", "cluster-admins"],
  };

  const restrictedUser: UserIdentity = {
    username: "developer-guest@company.com",
    groups: ["developers"],
  };

  const validAgentIdentity: AgentTechnicalIdentity = {
    serviceAccountName: "openlens-ai-investigator",
    serviceAccountNamespace: "kube-system",
    audience: "openlens-ai-investigator",
    token: "k8s-bounded-jwt-token-synthetic-xyz",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600 * 1000,
  };

  beforeEach(() => {
    identityManager = new KubernetesTechnicalIdentityManager();
    identityManager.registerTechnicalIdentity(clusterId, { ...validAgentIdentity });

    userAccessMock = jest.fn().mockResolvedValue(true);
    agentAccessMock = jest.fn().mockResolvedValue(true);

    authEngine = new IncidentAuthorizationEngine(userAccessMock, agentAccessMock);
    broker = new IncidentBrokerService(authEngine, identityManager);
  });

  describe("Double Identity Evaluation (USER_AUTHZ ∧ AGENT_AUTHZ)", () => {
    it("authorizes operation when BOTH user and agent have permissions", async () => {
      const session = broker.createSession({
        incidentId,
        clusterId,
        namespace,
        user: adminUser,
      });

      const executorMock = jest.fn().mockResolvedValue({ status: "healthy", pods: ["pod-1"] });

      const result = await broker.executeDiagnosticOperation(
        session.sessionId,
        {
          toolName: "list_resources",
          resourceKind: "pods",
          verb: "list",
        },
        executorMock,
      );

      expect(result).toEqual({ status: "healthy", pods: ["pod-1"] });
      expect(executorMock).toHaveBeenCalledTimes(1);
      expect(executorMock.mock.calls[0][0].token).toBe(validAgentIdentity.token);
    });

    it("DENIES access when User is cluster-admin but Agent ServiceAccount lacks permissions", async () => {
      // User is admin (true), but Agent SA has no permissions on nodes (false)
      userAccessMock.mockResolvedValue(true);
      agentAccessMock.mockResolvedValue(false);

      const session = broker.createSession({
        incidentId,
        clusterId,
        namespace,
        user: adminUser,
      });

      const executorMock = jest.fn();

      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          {
            toolName: "list_resources",
            resourceKind: "nodes",
            verb: "list",
          },
          executorMock,
        ),
      ).rejects.toThrow(BrokerSecurityError);

      expect(executorMock).not.toHaveBeenCalled();
    });

    it("DENIES access when Agent is authorized but User lacks permissions", async () => {
      // User is restricted and lacks permissions on deployments (false)
      userAccessMock.mockResolvedValue(false);
      agentAccessMock.mockResolvedValue(true);

      const session = broker.createSession({
        incidentId,
        clusterId,
        namespace,
        user: restrictedUser,
      });

      const executorMock = jest.fn();

      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          {
            toolName: "list_resources",
            resourceKind: "deployments",
            verb: "list",
          },
          executorMock,
        ),
      ).rejects.toThrow(/Human operator 'developer-guest@company.com' does not have 'list' permissions/);

      expect(executorMock).not.toHaveBeenCalled();
    });

    it("DENIES and fails closed with NO FALLBACK when agent technical identity is missing", async () => {
      identityManager.revokeToken(clusterId); // Wipe technical identity from RAM

      const session = broker.createSession({
        incidentId,
        clusterId,
        namespace,
        user: adminUser, // Even with admin user!
      });

      const executorMock = jest.fn();

      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          {
            toolName: "list_resources",
            resourceKind: "pods",
            verb: "list",
          },
          executorMock,
        ),
      ).rejects.toThrow(/Technical ServiceAccount agent identity is missing/);

      expect(executorMock).not.toHaveBeenCalled();
    });

    it("DENIES access when agent technical token is expired", async () => {
      const expiredIdentity: AgentTechnicalIdentity = {
        ...validAgentIdentity,
        expiresAt: Date.now() - 1000, // Expired
      };

      // Force register expired token into manager
      (identityManager as any).tokensByCluster.set(clusterId, expiredIdentity);

      const session = broker.createSession({
        incidentId,
        clusterId,
        namespace,
        user: adminUser,
      });

      const executorMock = jest.fn();

      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          {
            toolName: "list_resources",
            resourceKind: "pods",
            verb: "list",
          },
          executorMock,
        ),
      ).rejects.toThrow(BrokerSecurityError);

      expect(executorMock).not.toHaveBeenCalled();
    });
  });

  describe("Scope Boundaries & Forbidden Access", () => {
    it("DENIES cross-namespace lateral access violation", async () => {
      const session = broker.createSession({
        incidentId,
        clusterId,
        namespace: "production",
        user: adminUser,
      });

      const executorMock = jest.fn();

      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          {
            toolName: "list_resources",
            resourceKind: "pods",
            namespace: "kube-system", // Attempt to inspect kube-system!
            verb: "list",
          },
          executorMock,
        ),
      ).rejects.toThrow(/Cross-namespace access violation: requested 'kube-system' but investigation is locked to namespace 'production'/);

      expect(executorMock).not.toHaveBeenCalled();
    });

    it("DENIES access to forbidden resource kinds: secrets and serviceaccounts", async () => {
      const session = broker.createSession({
        incidentId,
        clusterId,
        namespace,
        user: adminUser,
      });

      const executorMock = jest.fn();

      for (const forbiddenKind of ["secrets", "Secret", "serviceaccounts", "RoleBinding"]) {
        await expect(
          broker.executeDiagnosticOperation(
            session.sessionId,
            {
              toolName: "get_resource",
              resourceKind: forbiddenKind,
              verb: "get",
            },
            executorMock,
          ),
        ).rejects.toThrow(/strictly forbidden/);
      }

      expect(executorMock).not.toHaveBeenCalled();
    });

    it("DENIES access to forbidden subresources like exec, attach, port-forward", async () => {
      const session = broker.createSession({
        incidentId,
        clusterId,
        namespace,
        user: adminUser,
      });

      const executorMock = jest.fn();

      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          {
            toolName: "get_resource",
            resourceKind: "pods",
            subresource: "exec",
            verb: "get",
          },
          executorMock,
        ),
      ).rejects.toThrow(/Subresource 'exec' is strictly forbidden/);

      expect(executorMock).not.toHaveBeenCalled();
    });

    it("DENIES mutation verbs and forbidden mutation tools", async () => {
      const session = broker.createSession({
        incidentId,
        clusterId,
        namespace,
        user: adminUser,
      });

      const executorMock = jest.fn();

      // Non-read verb
      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          {
            toolName: "list_resources",
            resourceKind: "pods",
            verb: "create" as any,
          },
          executorMock,
        ),
      ).rejects.toThrow(/not an authorized read-only verb/);

      // Mutating tool
      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          {
            toolName: "delete_resource",
            resourceKind: "pods",
            verb: "get",
          },
          executorMock,
        ),
      ).rejects.toThrow(/classified as a mutation tool and is strictly forbidden/);

      expect(executorMock).not.toHaveBeenCalled();
    });
  });

  describe("Session Lifecycle, Revocation and Audit", () => {
    it("invalidates all sessions for a cluster when cluster disconnects or switches", async () => {
      const session1 = broker.createSession({ incidentId: "INC-1", clusterId, namespace, user: adminUser });
      const session2 = broker.createSession({ incidentId: "INC-2", clusterId, namespace, user: adminUser });

      expect(broker.getSession(session1.sessionId)?.isValid).toBe(true);
      expect(broker.getSession(session2.sessionId)?.isValid).toBe(true);

      broker.invalidateSessionsForCluster(clusterId, "Operator switched active cluster context");

      expect(broker.getSession(session1.sessionId)).toBeUndefined();
      expect(broker.getSession(session2.sessionId)).toBeUndefined();
      expect(identityManager.getActiveIdentity(clusterId)).toBeUndefined(); // Token purged from RAM too
    });

    it("discards late execution output if session was invalidated mid-flight (TOCTOU guard)", async () => {
      const session = broker.createSession({ incidentId, clusterId, namespace, user: adminUser });

      const delayedExecutor = async () => {
        // Invalidate session while execution is in-flight!
        broker.invalidateSession(session.sessionId, "Revoked during execution");

        return { lateData: "dangerous" };
      };

      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          {
            toolName: "list_resources",
            resourceKind: "pods",
            verb: "list",
          },
          delayedExecutor,
        ),
      ).rejects.toThrow(/Session was invalidated during operation execution/);
    });

    it("emits structured audit events for both allowed and denied operations without leaking credentials", async () => {
      const auditLog: OperationAuditRecord[] = [];
      broker.onAudit(record => auditLog.push(record));

      const session = broker.createSession({ incidentId, clusterId, namespace, user: adminUser });

      // 1. Allowed operation
      await broker.executeDiagnosticOperation(
        session.sessionId,
        { toolName: "list_resources", resourceKind: "pods", verb: "list" },
        async () => ({ ok: true }),
      );

      // 2. Denied operation (secret)
      try {
        await broker.executeDiagnosticOperation(
          session.sessionId,
          { toolName: "get_resource", resourceKind: "secrets", verb: "get" },
          async () => ({ ok: true }),
        );
      } catch {
        // Expected denial
      }

      expect(auditLog).toHaveLength(2);
      expect(auditLog[0].success).toBe(true);
      expect(auditLog[0].decision.code).toBe("ALLOWED");
      expect(auditLog[1].success).toBe(false);
      expect(auditLog[1].decision.code).toBe("RESOURCE_FORBIDDEN");

      // Verify no tokens leaked in audit records
      const serializedAudit = JSON.stringify(auditLog);
      expect(serializedAudit).not.toContain(validAgentIdentity.token);
    });
  });
});
