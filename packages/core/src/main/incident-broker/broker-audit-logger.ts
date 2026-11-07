/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type { SqliteClient } from "../incident-storage/sqlite-client";
import type { OperationAuditRecord } from "./incident-broker-service";

export interface StoredAuditLog {
  id: string;
  sessionId: string;
  incidentId: string;
  clusterId: string;
  namespace: string;
  toolName: string;
  resourceKind: string;
  verb: string;
  decisionCode: string;
  decisionAllowed: boolean;
  reason?: string;
  executionDurationMs?: number;
  success: boolean;
  errorMessage?: string;
  timestamp: string;
}

export class BrokerAuditLogger {
  constructor(private readonly sqlite: SqliteClient) {}

  public recordAudit(record: OperationAuditRecord): void {
    const id = `audit-${crypto.randomUUID()}`;

    // Sanitizar campos libres para garantizar cero filtración de secretos
    const sanitizedReason = record.decision.reason
      ? record.decision.reason.replace(/(?:Bearer\s+|token=)[A-Za-z0-9\-._~+/]+=*/gi, "[REDACTED]")
      : null;

    const sanitizedError = record.errorMessage
      ? record.errorMessage.replace(/(?:Bearer\s+|token=)[A-Za-z0-9\-._~+/]+=*/gi, "[REDACTED]")
      : null;

    const db = this.sqlite.getDb();
    const stmt = db.prepare(`
      INSERT INTO broker_audit_log (
        id, session_id, incident_id, cluster_id, namespace,
        tool_name, resource_kind, verb, decision_code, decision_allowed,
        reason, execution_duration_ms, success, error_message, timestamp
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      id,
      record.sessionId,
      record.incidentId,
      record.clusterId,
      record.namespace,
      record.toolName,
      record.resourceKind,
      record.verb,
      record.decision.code,
      record.decision.allowed ? 1 : 0,
      sanitizedReason,
      record.executionDurationMs ?? null,
      record.success ? 1 : 0,
      sanitizedError,
      record.timestamp,
    );
  }

  public getAuditLogsForIncident(incidentId: string): StoredAuditLog[] {
    const db = this.sqlite.getDb();
    const stmt = db.prepare(`
      SELECT
        id, session_id as sessionId, incident_id as incidentId,
        cluster_id as clusterId, namespace, tool_name as toolName,
        resource_kind as resourceKind, verb, decision_code as decisionCode,
        decision_allowed as decisionAllowed, reason,
        execution_duration_ms as executionDurationMs, success,
        error_message as errorMessage, timestamp
      FROM broker_audit_log
      WHERE incident_id = ?
      ORDER BY timestamp ASC, rowid ASC
    `);

    const rows = stmt.all(incidentId) as any[];

    return rows.map(r => ({
      ...r,
      decisionAllowed: Boolean(r.decisionAllowed),
      success: Boolean(r.success),
    }));
  }
}
