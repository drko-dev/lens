/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "node:crypto";
import type { SqliteClient } from "./sqlite-client";
import type {
  IncidentRetentionPolicy,
  ManualPurgeRequest,
  PurgeAuditEntry,
  PurgeExecutionResult,
  PurgePreviewResult,
  UpdateRetentionPolicyInput,
} from "../../common/incident/incident-types";

export class IncidentPurger {
  private isPurging = false;

  constructor(private readonly sqlite: SqliteClient) {}

  /**
   * Retrieves the current retention policy from SQLite storage.
   */
  public getRetentionPolicy(): IncidentRetentionPolicy {
    const db = this.sqlite.getDb();
    const row = db.prepare("SELECT * FROM incident_retention_policy WHERE id = 'default'").get() as any;

    if (!row) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO incident_retention_policy (id, enabled, strategy, retention_days, protect_pinned, purge_closed_only, updated_at)
        VALUES ('default', 0, 'manual', 90, 1, 1, ?)
      `).run(now);

      return {
        id: "default",
        enabled: false,
        strategy: "manual",
        retentionDays: 90,
        protectPinned: true,
        purgeClosedOnly: true,
        evidenceRetentionDays: null,
        lastEvaluatedAt: null,
        updatedAt: now,
      };
    }

    return {
      id: "default",
      enabled: Boolean(row.enabled),
      strategy: row.strategy,
      retentionDays: row.retention_days,
      protectPinned: Boolean(row.protect_pinned),
      purgeClosedOnly: Boolean(row.purge_closed_only),
      evidenceRetentionDays: row.evidence_retention_days ?? null,
      lastEvaluatedAt: row.last_evaluated_at ?? null,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Updates the retention policy in SQLite storage.
   * Safety invariant: protectPinned is strictly kept true.
   */
  public setRetentionPolicy(input: UpdateRetentionPolicyInput): IncidentRetentionPolicy {
    const current = this.getRetentionPolicy();
    const updated: IncidentRetentionPolicy = {
      ...current,
      enabled: input.enabled !== undefined ? input.enabled : current.enabled,
      strategy: input.strategy !== undefined ? input.strategy : current.strategy,
      retentionDays: input.retentionDays !== undefined ? Math.max(1, input.retentionDays) : current.retentionDays,
      protectPinned: true, // Invariant: pinned incidents are always protected
      purgeClosedOnly: input.purgeClosedOnly !== undefined ? input.purgeClosedOnly : current.purgeClosedOnly,
      evidenceRetentionDays: input.evidenceRetentionDays !== undefined ? input.evidenceRetentionDays : current.evidenceRetentionDays,
      updatedAt: new Date().toISOString(),
    };

    const db = this.sqlite.getDb();
    db.prepare(`
      UPDATE incident_retention_policy
      SET enabled = ?, strategy = ?, retention_days = ?, protect_pinned = ?, purge_closed_only = ?, evidence_retention_days = ?, updated_at = ?
      WHERE id = 'default'
    `).run(
      updated.enabled ? 1 : 0,
      updated.strategy,
      updated.retentionDays,
      1,
      updated.purgeClosedOnly ? 1 : 0,
      updated.evidenceRetentionDays,
      updated.updatedAt,
    );

    return updated;
  }

  /**
   * Previews candidates for purging according to the policy without modifying any records.
   */
  public previewPurge(policyOverride?: Partial<IncidentRetentionPolicy>): PurgePreviewResult {
    const active = this.getRetentionPolicy();
    const policy: IncidentRetentionPolicy = {
      ...active,
      ...policyOverride,
      protectPinned: true, // Invariant
    };

    const db = this.sqlite.getDb();

    // Protected pinned incidents count
    const protectedRow = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE is_pinned = 1").get() as any;
    const protectedIncidentCount = protectedRow?.count || 0;

    // If manual or disabled without override forcing evaluation
    if (policy.strategy === "manual" && !policy.enabled && !policyOverride?.enabled) {
      return {
        policy,
        candidateIncidentCount: 0,
        protectedIncidentCount,
        candidateEvidenceCount: 0,
        candidateReclaimableBytes: 0,
        candidateIncidentIds: [],
        candidateEvidenceIds: [],
      };
    }

    const cutoffMs = Date.now() - policy.retentionDays * 86400 * 1000;
    const cutoffDate = new Date(cutoffMs).toISOString();

    let candidateIncidentsQuery = "SELECT id FROM incidents WHERE is_pinned = 0";
    const incidentParams: any[] = [];

    if (policy.purgeClosedOnly) {
      candidateIncidentsQuery += " AND status = 'CERRADO' AND COALESCE(closed_at, updated_at) < ?";
      incidentParams.push(cutoffDate);
    } else {
      candidateIncidentsQuery += " AND updated_at < ?";
      incidentParams.push(cutoffDate);
    }

    const candidateRows = db.prepare(candidateIncidentsQuery).all(...incidentParams) as { id: string }[];
    const candidateIncidentIds = candidateRows.map(r => r.id);

    let candidateEvidenceCount = 0;
    let candidateReclaimableBytes = 0;

    if (candidateIncidentIds.length > 0) {
      const placeholders = candidateIncidentIds.map(() => "?").join(",");
      const evStats = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(snippet_bytes), 0) as totalBytes
        FROM incident_evidence
        WHERE incident_id IN (${placeholders})
      `).get(...candidateIncidentIds) as any;

      candidateEvidenceCount += evStats?.count || 0;
      candidateReclaimableBytes += evStats?.totalBytes || 0;
    }

    // Independent evidence retention
    const candidateEvidenceIds: string[] = [];
    if (policy.evidenceRetentionDays && policy.evidenceRetentionDays > 0) {
      const evCutoffMs = Date.now() - policy.evidenceRetentionDays * 86400 * 1000;
      const evCutoffDate = new Date(evCutoffMs).toISOString();

      let standaloneEvQuery = `
        SELECT e.id, e.snippet_bytes
        FROM incident_evidence e
        JOIN incidents i ON e.incident_id = i.id
        WHERE i.is_pinned = 0 AND e.captured_at < ?
      `;
      const evParams: any[] = [evCutoffDate];

      if (candidateIncidentIds.length > 0) {
        const placeholders = candidateIncidentIds.map(() => "?").join(",");
        standaloneEvQuery += ` AND e.incident_id NOT IN (${placeholders})`;
      }

      const standaloneRows = db.prepare(standaloneEvQuery).all(...evParams) as { id: string; snippet_bytes: number }[];
      for (const row of standaloneRows) {
        candidateEvidenceIds.push(row.id);
        candidateEvidenceCount += 1;
        candidateReclaimableBytes += row.snippet_bytes || 0;
      }
    }

    return {
      policy,
      candidateIncidentCount: candidateIncidentIds.length,
      protectedIncidentCount,
      candidateEvidenceCount,
      candidateReclaimableBytes,
      candidateIncidentIds,
      candidateEvidenceIds,
    };
  }

  /**
   * Executes automatic purge strictly when policy is enabled and strategy is 'days'.
   * Revalidates all candidate criteria directly inside the SQLite transaction (TOCTOU protection).
   */
  public executeAutomaticPurge(): PurgeExecutionResult {
    if (this.isPurging) {
      throw new Error("A purge operation is already in progress.");
    }

    this.isPurging = true;
    const executedAt = new Date().toISOString();

    try {
      const policy = this.getRetentionPolicy();

      // Guard: automatic purge NEVER runs if policy is disabled
      if (!policy.enabled) {
        return {
          success: true,
          deletedIncidentCount: 0,
          deletedTimelineCount: 0,
          deletedEvidenceCount: 0,
          reclaimedBytes: 0,
          executedAt,
        };
      }

      // If manual strategy and no independent evidence retention configured, nothing to do
      if (policy.strategy === "manual" && (!policy.evidenceRetentionDays || policy.evidenceRetentionDays <= 0)) {
        return {
          success: true,
          deletedIncidentCount: 0,
          deletedTimelineCount: 0,
          deletedEvidenceCount: 0,
          reclaimedBytes: 0,
          executedAt,
        };
      }

      const db = this.sqlite.getDb();
      let deletedIncidentCount = 0;
      let deletedTimelineCount = 0;
      let deletedEvidenceCount = 0;
      let reclaimedBytes = 0;

      const purgeTx = db.transaction(() => {
        const candidateIds: string[] = [];

        if (policy.strategy !== "manual") {
          const cutoffMs = Date.now() - policy.retentionDays * 86400 * 1000;
          const cutoffDate = new Date(cutoffMs).toISOString();

          // Revalidate qualifying candidates directly inside the transaction
          let query = "SELECT id FROM incidents WHERE is_pinned = 0";
          const params: any[] = [];

          if (policy.purgeClosedOnly) {
            query += " AND status = 'CERRADO' AND COALESCE(closed_at, updated_at) < ?";
            params.push(cutoffDate);
          } else {
            query += " AND updated_at < ?";
            params.push(cutoffDate);
          }

          const candidateRows = db.prepare(query).all(...params) as { id: string }[];
          candidateIds.push(...candidateRows.map(r => r.id));
        }

        if (candidateIds.length > 0) {
          const placeholders = candidateIds.map(() => "?").join(",");

          const timelineCountRow = db.prepare(`
            SELECT COUNT(*) as count FROM incident_timeline WHERE incident_id IN (${placeholders})
          `).get(...candidateIds) as any;
          deletedTimelineCount = timelineCountRow?.count || 0;

          const evCountRow = db.prepare(`
            SELECT COUNT(*) as count, COALESCE(SUM(snippet_bytes), 0) as totalBytes
            FROM incident_evidence WHERE incident_id IN (${placeholders})
          `).get(...candidateIds) as any;
          deletedEvidenceCount += evCountRow?.count || 0;
          reclaimedBytes += evCountRow?.totalBytes || 0;

          const deleteInfo = db.prepare(`
            DELETE FROM incidents WHERE id IN (${placeholders})
          `).run(...candidateIds);

          deletedIncidentCount = deleteInfo.changes;
        }

        // Standalone evidence retention inside transaction
        if (policy.evidenceRetentionDays && policy.evidenceRetentionDays > 0) {
          const evCutoffMs = Date.now() - policy.evidenceRetentionDays * 86400 * 1000;
          const evCutoffDate = new Date(evCutoffMs).toISOString();

          let standaloneQuery = `
            SELECT e.id, e.snippet_bytes
            FROM incident_evidence e
            JOIN incidents i ON e.incident_id = i.id
            WHERE i.is_pinned = 0 AND e.captured_at < ?
          `;
          const evParams: any[] = [evCutoffDate];

          if (candidateIds.length > 0) {
            const placeholders = candidateIds.map(() => "?").join(",");
            standaloneQuery += ` AND e.incident_id NOT IN (${placeholders})`;
          }

          const standaloneRows = db.prepare(standaloneQuery).all(...evParams) as { id: string; snippet_bytes: number }[];
          const standaloneIds = standaloneRows.map(r => r.id);

          if (standaloneIds.length > 0) {
            const evPlaceholders = standaloneIds.map(() => "?").join(",");
            const evDeleteInfo = db.prepare(`
              DELETE FROM incident_evidence WHERE id IN (${evPlaceholders})
            `).run(...standaloneIds);

            deletedEvidenceCount += evDeleteInfo.changes;
            for (const r of standaloneRows) {
              reclaimedBytes += r.snippet_bytes || 0;
            }
          }
        }

        // Update last_evaluated_at
        db.prepare("UPDATE incident_retention_policy SET last_evaluated_at = ? WHERE id = 'default'").run(executedAt);

        // Record audit entry
        const auditId = `purge-auto-${crypto.randomUUID()}`;
        db.prepare(`
          INSERT INTO incident_purge_audit (
            id, executed_at, policy_snapshot_json, deleted_incidents, deleted_timelines, deleted_evidences, reclaimed_bytes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SUCCESS')
        `).run(
          auditId,
          executedAt,
          JSON.stringify({ ...policy, mode: "AUTOMATIC" }),
          deletedIncidentCount,
          deletedTimelineCount,
          deletedEvidenceCount,
          reclaimedBytes,
        );
      });

      purgeTx();

      return {
        success: true,
        deletedIncidentCount,
        deletedTimelineCount,
        deletedEvidenceCount,
        reclaimedBytes,
        executedAt,
      };
    } catch (err: any) {
      return this.recordPurgeError("AUTOMATIC", executedAt, err);
    } finally {
      this.isPurging = false;
    }
  }

  /**
   * Executes manual purge of specific confirmed candidate incident IDs.
   * Revalidates that each candidate incident is still unpinned and closed inside the transaction.
   */
  public executeManualPurge(request: ManualPurgeRequest): PurgeExecutionResult {
    if (this.isPurging) {
      throw new Error("A purge operation is already in progress.");
    }

    if (!request || !Array.isArray(request.confirmedCandidateIds) || request.confirmedCandidateIds.length === 0) {
      return {
        success: true,
        deletedIncidentCount: 0,
        deletedTimelineCount: 0,
        deletedEvidenceCount: 0,
        reclaimedBytes: 0,
        executedAt: new Date().toISOString(),
      };
    }

    this.isPurging = true;
    const executedAt = new Date().toISOString();

    try {
      const policy = this.getRetentionPolicy();
      const db = this.sqlite.getDb();

      let deletedIncidentCount = 0;
      let deletedTimelineCount = 0;
      let deletedEvidenceCount = 0;
      let reclaimedBytes = 0;

      const purgeTx = db.transaction(() => {
        const placeholders = request.confirmedCandidateIds.map(() => "?").join(",");

        // HARD PROTECTION: Pinned incidents CANNOT be deleted, even if requested in candidate array
        let query = `SELECT id FROM incidents WHERE id IN (${placeholders}) AND is_pinned = 0`;
        const params: any[] = [...request.confirmedCandidateIds];

        if (policy.purgeClosedOnly) {
          query += " AND status = 'CERRADO'";
        }

        const validCandidateRows = db.prepare(query).all(...params) as { id: string }[];
        const validIds = validCandidateRows.map(r => r.id);

        if (validIds.length > 0) {
          const validPlaceholders = validIds.map(() => "?").join(",");

          const timelineCountRow = db.prepare(`
            SELECT COUNT(*) as count FROM incident_timeline WHERE incident_id IN (${validPlaceholders})
          `).get(...validIds) as any;
          deletedTimelineCount = timelineCountRow?.count || 0;

          const evCountRow = db.prepare(`
            SELECT COUNT(*) as count, COALESCE(SUM(snippet_bytes), 0) as totalBytes
            FROM incident_evidence WHERE incident_id IN (${validPlaceholders})
          `).get(...validIds) as any;
          deletedEvidenceCount += evCountRow?.count || 0;
          reclaimedBytes += evCountRow?.totalBytes || 0;

          const deleteInfo = db.prepare(`
            DELETE FROM incidents WHERE id IN (${validPlaceholders})
          `).run(...validIds);

          deletedIncidentCount = deleteInfo.changes;
        }

        // Update last_evaluated_at
        db.prepare("UPDATE incident_retention_policy SET last_evaluated_at = ? WHERE id = 'default'").run(executedAt);

        // Record audit entry
        const auditId = `purge-manual-${crypto.randomUUID()}`;
        db.prepare(`
          INSERT INTO incident_purge_audit (
            id, executed_at, policy_snapshot_json, deleted_incidents, deleted_timelines, deleted_evidences, reclaimed_bytes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SUCCESS')
        `).run(
          auditId,
          executedAt,
          JSON.stringify({ ...policy, mode: "MANUAL", requestedCount: request.confirmedCandidateIds.length }),
          deletedIncidentCount,
          deletedTimelineCount,
          deletedEvidenceCount,
          reclaimedBytes,
        );
      });

      purgeTx();

      return {
        success: true,
        deletedIncidentCount,
        deletedTimelineCount,
        deletedEvidenceCount,
        reclaimedBytes,
        executedAt,
      };
    } catch (err: any) {
      return this.recordPurgeError("MANUAL", executedAt, err);
    } finally {
      this.isPurging = false;
    }
  }

  /**
   * Compatibility alias that maps directly to executeAutomaticPurge.
   * Guarantees no { force: true } parameter can bypass policy.
   */
  public executePurge(): PurgeExecutionResult {
    return this.executeAutomaticPurge();
  }

  private recordPurgeError(mode: string, executedAt: string, err: any): PurgeExecutionResult {
    const db = this.sqlite.getDb();
    try {
      const auditId = `purge-err-${crypto.randomUUID()}`;
      db.prepare(`
        INSERT INTO incident_purge_audit (
          id, executed_at, policy_snapshot_json, deleted_incidents, deleted_timelines, deleted_evidences, reclaimed_bytes, status, error_message
        ) VALUES (?, ?, ?, 0, 0, 0, 0, 'ERROR', ?)
      `).run(auditId, executedAt, JSON.stringify({ mode }), err.message || String(err));
    } catch {
      // Ignored if audit write fails
    }

    return {
      success: false,
      deletedIncidentCount: 0,
      deletedTimelineCount: 0,
      deletedEvidenceCount: 0,
      reclaimedBytes: 0,
      executedAt,
      error: err.message || String(err),
    };
  }

  /**
   * Retrieves recent purge audit entries.
   */
  public getPurgeHistory(limit = 20): PurgeAuditEntry[] {
    const db = this.sqlite.getDb();
    const rows = db.prepare(`
      SELECT * FROM incident_purge_audit
      ORDER BY executed_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(r => ({
      id: r.id,
      executedAt: r.executed_at,
      policySnapshot: JSON.parse(r.policy_snapshot_json || "{}"),
      deletedIncidents: r.deleted_incidents,
      deletedTimelines: r.deleted_timelines,
      deletedEvidences: r.deleted_evidences,
      reclaimedBytes: r.reclaimed_bytes,
      status: r.status,
      errorMessage: r.error_message ?? undefined,
    }));
  }
}
