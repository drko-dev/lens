/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { IncidentAuthorizationEngine } from "../authorization-engine";
import { IncidentBrokerService, BrokerSecurityError } from "../incident-broker-service";
import { InvestigationBudgetManager } from "../investigation-budget-manager";
import { BrokerAuditLogger } from "../broker-audit-logger";
import { KubernetesTechnicalIdentityManager } from "../technical-identity-manager";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import type { AgentTechnicalIdentity, UserIdentity } from "../../../common/incident/broker-types";

describe("H8-013: Investigation Budgets, Concurrency, and SQLite Audit Logging", () => {
  let identityManager: KubernetesTechnicalIdentityManager;
  let budgetManager: InvestigationBudgetManager;
  let broker: IncidentBrokerService;
  let sqlite: SqliteClient;
  let auditLogger: BrokerAuditLogger;

  const clusterId = "cluster-k8s-01";
  const namespace = "production";
  const incidentId = "INC-TEST-003";

  const operatorUser: UserIdentity = {
    username: "devops@company.org",
  };

  const agentIdentity: AgentTechnicalIdentity = {
    serviceAccountName: "openlens-ai-investigator",
    serviceAccountNamespace: "kube-system",
    audience: "openlens-ai-investigator",
    token: "agent-token-xyz-123",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  };

  beforeEach(() => {
    // In-memory SQLite for testing migration 004 and audit logging
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();

    // Create foreign key parent incident row
    const db = sqlite.getDb();
    db.prepare(`
      INSERT INTO incidents (
        id, cluster_id, namespace, title, severity, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      incidentId,
      clusterId,
      namespace,
      "Test incident for budget",
      "high",
      "INVESTIGANDO",
      new Date().toISOString(),
      new Date().toISOString(),
    );

    auditLogger = new BrokerAuditLogger(sqlite);
    identityManager = new KubernetesTechnicalIdentityManager();
    identityManager.registerTechnicalIdentity(clusterId, agentIdentity);

    budgetManager = new InvestigationBudgetManager();
    const authEngine = new IncidentAuthorizationEngine(async () => true, async () => true);

    broker = new IncidentBrokerService(authEngine, identityManager, budgetManager, auditLogger);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("Budget Quotas & Enforcement", () => {
    it("enforces maximum tool call quota per incident and stops operations", async () => {
      budgetManager.setLimits(incidentId, { maxToolCalls: 2 });
      const session = broker.createSession({ incidentId, clusterId, namespace, user: operatorUser });

      // Call 1 - should succeed
      await broker.executeDiagnosticOperation(
        session.sessionId,
        { toolName: "list_resources", resourceKind: "pods", verb: "list" },
        async () => ["pod-1"],
      );

      // Call 2 - should succeed
      await broker.executeDiagnosticOperation(
        session.sessionId,
        { toolName: "list_resources", resourceKind: "pods", verb: "list" },
        async () => ["pod-2"],
      );

      // Call 3 - should fail due to budget exhaustion
      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          { toolName: "list_resources", resourceKind: "pods", verb: "list" },
          async () => ["pod-3"],
        ),
      ).rejects.toThrow(BrokerSecurityError);

      const usage = budgetManager.getUsage(incidentId);
      expect(usage.isExhausted).toBe(true);
      expect(usage.exhaustedReason).toContain("Maximum tool calls limit reached (2/2)");
    });

    it("restores execution capability only after explicit human authorization to expand budget", async () => {
      budgetManager.setLimits(incidentId, { maxToolCalls: 1 });
      const session = broker.createSession({ incidentId, clusterId, namespace, user: operatorUser });

      // Call 1 uses up budget
      await broker.executeDiagnosticOperation(
        session.sessionId,
        { toolName: "list_resources", resourceKind: "pods", verb: "list" },
        async () => ["pod-1"],
      );

      // Call 2 fails
      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          { toolName: "list_resources", resourceKind: "pods", verb: "list" },
          async () => ["pod-2"],
        ),
      ).rejects.toThrow(/budget exhausted/i);

      // Operator explicitly approves expansion:
      budgetManager.expandBudget(incidentId, { maxToolCalls: 5 });

      // Call 3 now succeeds
      const result = await broker.executeDiagnosticOperation(
        session.sessionId,
        { toolName: "list_resources", resourceKind: "pods", verb: "list" },
        async () => ["pod-3"],
      );

      expect(result).toEqual(["pod-3"]);
    });

    it("enforces concurrency limits per incident", async () => {
      budgetManager.setLimits(incidentId, { maxConcurrent: 1 });
      const session = broker.createSession({ incidentId, clusterId, namespace, user: operatorUser });

      let releasePromise: () => void;
      const inFlightPromise = new Promise<void>(resolve => {
        releasePromise = resolve;
      });

      // Start first operation that blocks
      const call1 = broker.executeDiagnosticOperation(
        session.sessionId,
        { toolName: "list_resources", resourceKind: "pods", verb: "list" },
        async () => {
          await inFlightPromise;

          return "done-1";
        },
      );

      // Second operation launched while first is in-flight must fail with concurrency limit
      await expect(
        broker.executeDiagnosticOperation(
          session.sessionId,
          { toolName: "list_resources", resourceKind: "pods", verb: "list" },
          async () => "done-2",
        ),
      ).rejects.toThrow(/Concurrency limit reached/);

      releasePromise!();
      await call1;
    });
  });

  describe("Persistent SQLite Audit Log (Migration 004)", () => {
    it("persists sanitized audit log entries in SQLite and verifies zero credential leaks", async () => {
      const session = broker.createSession({ incidentId, clusterId, namespace, user: operatorUser });

      // Run allowed operation
      await broker.executeDiagnosticOperation(
        session.sessionId,
        { toolName: "list_resources", resourceKind: "pods", verb: "list" },
        async () => ["pod-1", "pod-2"],
      );

      // Run denied operation
      try {
        await broker.executeDiagnosticOperation(
          session.sessionId,
          { toolName: "get_resource", resourceKind: "secrets", verb: "get" },
          async () => null,
        );
      } catch {
        // Expected denial
      }

      const logs = auditLogger.getAuditLogsForIncident(incidentId);

      expect(logs).toHaveLength(2);
      expect(logs[0].toolName).toBe("list_resources");
      expect(logs[0].decisionCode).toBe("ALLOWED");
      expect(logs[0].decisionAllowed).toBe(true);
      expect(logs[0].success).toBe(true);

      expect(logs[1].toolName).toBe("get_resource");
      expect(logs[1].resourceKind).toBe("secrets");
      expect(logs[1].decisionCode).toBe("RESOURCE_FORBIDDEN");
      expect(logs[1].decisionAllowed).toBe(false);
      expect(logs[1].success).toBe(false);

      // Verify zero tokens leaked in SQLite audit rows
      const db = sqlite.getDb();
      const rawRows = db.prepare("SELECT * FROM broker_audit_log WHERE incident_id = ?").all(incidentId);
      const serialized = JSON.stringify(rawRows);
      expect(serialized).not.toContain(agentIdentity.token);
    });
  });
});
