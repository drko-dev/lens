/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type {
  AgentTechnicalIdentity,
  AuthorizationDecision,
  AuthorizationRequest,
  BrokerSession,
  InvestigationScope,
  UserIdentity,
} from "../../common/incident/broker-types";
import type { IncidentAuthorizationEngine } from "./authorization-engine";
import type { KubernetesTechnicalIdentityManager } from "./technical-identity-manager";
import {
  type InvestigationBudgetManager,
  BudgetExhaustedError,
} from "./investigation-budget-manager";
import type { BrokerAuditLogger } from "./broker-audit-logger";

export class BrokerSecurityError extends Error {
  constructor(readonly code: string, message: string, readonly decision?: AuthorizationDecision) {
    super(message);
    this.name = "BrokerSecurityError";
  }
}

export interface CreateBrokerSessionParams {
  incidentId: string;
  clusterId: string;
  namespace: string;
  user: UserIdentity;
}

export interface OperationAuditRecord {
  sessionId: string;
  incidentId: string;
  clusterId: string;
  namespace: string;
  toolName: string;
  resourceKind: string;
  verb: string;
  decision: AuthorizationDecision;
  executionDurationMs?: number;
  success: boolean;
  errorMessage?: string;
  timestamp: string;
}

export type BrokerAuditListener = (record: OperationAuditRecord) => void;

export class IncidentBrokerService {
  private readonly sessions = new Map<string, BrokerSession>();
  private readonly auditListeners: BrokerAuditListener[] = [];

  constructor(
    private readonly authEngine: IncidentAuthorizationEngine,
    private readonly identityManager: KubernetesTechnicalIdentityManager,
    private readonly budgetManager?: InvestigationBudgetManager,
    private readonly auditLogger?: BrokerAuditLogger,
  ) {
    if (this.auditLogger) {
      this.onAudit(record => this.auditLogger!.recordAudit(record));
    }
  }

  public getBudgetManager(): InvestigationBudgetManager | undefined {
    return this.budgetManager;
  }

  public createMcpBridge(sessionId: string, k8sExecutor: any): any {
    const { McpBrokerBridge } = require("./mcp-broker-bridge");

    return new McpBrokerBridge(this, k8sExecutor, sessionId);
  }

  public onAudit(listener: BrokerAuditListener): () => void {
    this.auditListeners.push(listener);

    return () => {
      const idx = this.auditListeners.indexOf(listener);

      if (idx !== -1) this.auditListeners.splice(idx, 1);
    };
  }

  private emitAudit(record: OperationAuditRecord): void {
    for (const listener of this.auditListeners) {
      try {
        listener(record);
      } catch {
        // Audit listeners must never break broker flow
      }
    }
  }

  /**
   * Creates and registers a new investigation broker session bound to an incident, cluster, namespace and user.
   */
  public createSession(params: CreateBrokerSessionParams): BrokerSession {
    const { incidentId, clusterId, namespace, user } = params;

    if (!incidentId || !clusterId || !namespace || !user?.username) {
      throw new BrokerSecurityError("INVALID_SESSION_PARAMS", "incidentId, clusterId, namespace, and user are required.");
    }

    const sessionId = `session-${crypto.randomUUID()}`;
    const now = Date.now();

    const session: BrokerSession = {
      sessionId,
      incidentId,
      clusterId,
      namespace,
      userIdentity: user,
      createdAt: now,
      lastActiveAt: now,
      isValid: true,
    };

    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Retrieves an active session, ensuring it has not been invalidated.
   */
  public getSession(sessionId: string): BrokerSession | undefined {
    const session = this.sessions.get(sessionId);

    if (!session || !session.isValid) {
      return undefined;
    }

    return session;
  }

  /**
   * Invalidates a specific session immediately.
   */
  public invalidateSession(sessionId: string, reason = "Explicitly revoked"): void {
    const session = this.sessions.get(sessionId);

    if (session) {
      session.isValid = false;
      session.invalidationReason = reason;
    }
  }

  /**
   * Invalidates all active sessions bound to a specific cluster.
   * Also triggers revocation of technical identity tokens for that cluster.
   */
  public invalidateSessionsForCluster(clusterId: string, reason = "Cluster disconnected or switched"): void {
    for (const session of this.sessions.values()) {
      if (session.clusterId === clusterId && session.isValid) {
        session.isValid = false;
        session.invalidationReason = reason;
      }
    }

    this.identityManager.revokeToken(clusterId);
  }

  /**
   * Executes a diagnostic operation through the broker, strictly enforcing:
   * 1. Session validity
   * 2. Double-identity evaluation (USER_AUTHZ ∧ AGENT_AUTHZ ∧ CLUSTER_SCOPE ∧ NAMESPACE_SCOPE ∧ TOOL_ALLOWLIST)
   * 3. Execution under agent technical identity
   * 4. Post-execution session re-verification (TOCTOU guard against race conditions)
   */
  public async executeDiagnosticOperation<T>(
    sessionId: string,
    operationRequest: Omit<AuthorizationRequest, "scope">,
    executor: (agent: AgentTechnicalIdentity, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const startTime = Date.now();
    const session = this.sessions.get(sessionId);

    if (!session || !session.isValid) {
      const code = "SESSION_INVALIDATED";
      const reason = session?.invalidationReason || "Session does not exist or has been invalidated.";
      const failedDecision: AuthorizationDecision = {
        allowed: false,
        code,
        reason,
        checkedAt: new Date().toISOString(),
        userAllowed: false,
        agentAllowed: false,
        scopeValid: false,
        toolValid: false,
      };

      this.emitAudit({
        sessionId,
        incidentId: session?.incidentId || "unknown",
        clusterId: session?.clusterId || "unknown",
        namespace: session?.namespace || "unknown",
        toolName: operationRequest.toolName,
        resourceKind: operationRequest.resourceKind,
        verb: operationRequest.verb,
        decision: failedDecision,
        success: false,
        errorMessage: reason,
        timestamp: new Date().toISOString(),
      });

      throw new BrokerSecurityError(code, reason, failedDecision);
    }

    const scope: InvestigationScope = {
      incidentId: session.incidentId,
      clusterId: session.clusterId,
      namespace: session.namespace,
      resourceKind: operationRequest.resourceKind,
      resourceName: operationRequest.resourceName,
    };

    const fullRequest: AuthorizationRequest = {
      ...operationRequest,
      scope,
    };

    // Obtain active technical identity for cluster
    const agentIdentity = this.identityManager.getActiveIdentity(session.clusterId);

    // Evaluate conjunction
    const decision = await this.authEngine.evaluateAuthorization(
      fullRequest,
      session.userIdentity,
      agentIdentity,
    );

    if (!decision.allowed || !agentIdentity) {
      this.emitAudit({
        sessionId,
        incidentId: session.incidentId,
        clusterId: session.clusterId,
        namespace: session.namespace,
        toolName: operationRequest.toolName,
        resourceKind: operationRequest.resourceKind,
        verb: operationRequest.verb,
        decision,
        executionDurationMs: Date.now() - startTime,
        success: false,
        errorMessage: decision.reason,
        timestamp: new Date().toISOString(),
      });

      throw new BrokerSecurityError(decision.code, decision.reason, decision);
    }

    // Update session activity timestamp
    session.lastActiveAt = Date.now();

    // Prepare abort controller combining caller signal and timeout
    const controller = new AbortController();
    const abortListener = () => controller.abort();

    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", abortListener, { once: true });
      }
    }

    // Check investigation budget and acquire execution slot
    if (this.budgetManager) {
      try {
        this.budgetManager.acquireExecutionSlot(session.incidentId);
      } catch (err: any) {
        const isBudget = err instanceof BudgetExhaustedError;
        const code = isBudget ? "BUDGET_EXHAUSTED" : "CONCURRENCY_LIMIT";
        const reason = err?.message || "Execution limit reached";
        const failedDecision: AuthorizationDecision = {
          allowed: false,
          code: isBudget ? "BUDGET_EXHAUSTED" : "OPERATION_ABORTED",
          reason,
          checkedAt: new Date().toISOString(),
          userAllowed: false,
          agentAllowed: false,
          scopeValid: true,
          toolValid: true,
        };

        this.emitAudit({
          sessionId,
          incidentId: session.incidentId,
          clusterId: session.clusterId,
          namespace: session.namespace,
          toolName: operationRequest.toolName,
          resourceKind: operationRequest.resourceKind,
          verb: operationRequest.verb,
          decision: failedDecision,
          success: false,
          errorMessage: reason,
          timestamp: new Date().toISOString(),
        });

        throw new BrokerSecurityError(code, reason, failedDecision);
      }
    }

    try {
      const result = await executor(agentIdentity, controller.signal);

      // Post-execution check: Did the session get invalidated or revoked during the network call?
      if (!session.isValid) {
        throw new BrokerSecurityError(
          "SESSION_INVALIDATED",
          "Session was invalidated during operation execution. Output discarded.",
        );
      }

      if (this.budgetManager) {
        let bytes = 1024;
        let lines = 1;

        if (typeof result === "string") {
          bytes = Buffer.byteLength(result, "utf8");
          lines = result.split("\n").length;
        } else if (Array.isArray(result)) {
          lines = result.length;
          bytes = Buffer.byteLength(JSON.stringify(result), "utf8");
        } else if (result && typeof result === "object") {
          bytes = Buffer.byteLength(JSON.stringify(result), "utf8");
        }

        this.budgetManager.recordUsage(session.incidentId, {
          k8sRequests: 1,
          logLines: lines,
          bytes,
        });
      }

      this.emitAudit({
        sessionId,
        incidentId: session.incidentId,
        clusterId: session.clusterId,
        namespace: session.namespace,
        toolName: operationRequest.toolName,
        resourceKind: operationRequest.resourceKind,
        verb: operationRequest.verb,
        decision,
        executionDurationMs: Date.now() - startTime,
        success: true,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error: any) {
      this.emitAudit({
        sessionId,
        incidentId: session.incidentId,
        clusterId: session.clusterId,
        namespace: session.namespace,
        toolName: operationRequest.toolName,
        resourceKind: operationRequest.resourceKind,
        verb: operationRequest.verb,
        decision,
        executionDurationMs: Date.now() - startTime,
        success: false,
        errorMessage: error?.message || "Execution failed",
        timestamp: new Date().toISOString(),
      });

      throw error;
    } finally {
      if (this.budgetManager) {
        this.budgetManager.releaseExecutionSlot(session.incidentId);
      }
      if (signal) {
        signal.removeEventListener("abort", abortListener);
      }
    }
  }
}
