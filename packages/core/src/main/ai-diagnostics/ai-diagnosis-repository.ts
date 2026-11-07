/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { SqliteClient } from "../incident-storage/sqlite-client";
import type {
  AiDiagnosisReport,
  AiBudgetReservation,
  AiReservationStatus,
} from "../../common/incident/ai-diagnosis-types";
import { isSafeAiFailureCode } from "./ai-diagnosis-errors";

export class AiDiagnosisRepository {
  constructor(public readonly sqlite: SqliteClient) {}

  public saveDiagnosis(report: AiDiagnosisReport): void {
    const db = this.sqlite.getDb();
    const stmt = db.prepare(`
      INSERT INTO ai_diagnoses (
        id, incident_id, profile_id, status, report_json,
        prompt_tokens, completion_tokens, total_tokens, estimated_cost, executed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      report.id,
      report.incidentId,
      report.profileId,
      report.status,
      JSON.stringify(report),
      report.tokenUsage.promptTokens,
      report.tokenUsage.completionTokens,
      report.tokenUsage.totalTokens,
      report.estimatedCost,
      report.executedAt,
    );
  }

  public getDiagnosisById(id: string): AiDiagnosisReport | null {
    const db = this.sqlite.getDb();
    const row = db.prepare("SELECT report_json FROM ai_diagnoses WHERE id = ?").get(id) as any;

    if (!row) return null;
    return JSON.parse(row.report_json) as AiDiagnosisReport;
  }

  public listDiagnosesByIncident(incidentId: string): AiDiagnosisReport[] {
    const db = this.sqlite.getDb();
    const rows = db
      .prepare("SELECT report_json FROM ai_diagnoses WHERE incident_id = ? ORDER BY executed_at DESC")
      .all(incidentId) as any[];

    return rows.map(r => JSON.parse(r.report_json) as AiDiagnosisReport);
  }

  public getLatestDiagnosis(incidentId: string): AiDiagnosisReport | null {
    const db = this.sqlite.getDb();
    const row = db
      .prepare("SELECT report_json FROM ai_diagnoses WHERE incident_id = ? ORDER BY executed_at DESC LIMIT 1")
      .get(incidentId) as any;

    if (!row) return null;
    return JSON.parse(row.report_json) as AiDiagnosisReport;
  }

  public countDiagnosesByIncident(incidentId: string): number {
    const db = this.sqlite.getDb();
    const row = db
      .prepare("SELECT COUNT(*) as count FROM ai_diagnoses WHERE incident_id = ?")
      .get(incidentId) as any;

    return row?.count ?? 0;
  }

  public getTotalCostByIncident(incidentId: string): number {
    const db = this.sqlite.getDb();
    const row = db
      .prepare("SELECT COALESCE(SUM(estimated_cost), 0.0) as totalCost FROM ai_diagnoses WHERE incident_id = ?")
      .get(incidentId) as any;

    return row?.totalCost ?? 0.0;
  }

  // --- H8.8-02: Atomic Request Budget Reservations ---

  public createReservation(params: {
    id: string;
    operationId: string;
    incidentId: string;
    profileId: string;
    clusterId: string;
    namespace: string;
  }): AiBudgetReservation {
    const db = this.sqlite.getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO ai_budget_reservations (
        id, operation_id, incident_id, profile_id, cluster_id, namespace,
        status, prompt_tokens, completion_tokens, total_tokens, estimated_cost,
        error_message, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'RESERVED', 0, 0, 0, 0.0, NULL, ?, ?)
    `);

    stmt.run(
      params.id,
      params.operationId,
      params.incidentId,
      params.profileId,
      params.clusterId,
      params.namespace,
      now,
      now,
    );

    return {
      id: params.id,
      operationId: params.operationId,
      incidentId: params.incidentId,
      profileId: params.profileId,
      clusterId: params.clusterId,
      namespace: params.namespace,
      status: "RESERVED",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCost: 0.0,
      createdAt: now,
      updatedAt: now,
    };
  }

  public updateReservationStatus(
    operationId: string,
    status: AiReservationStatus,
    details?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      estimatedCost?: number;
      diagnosisId?: string;
      errorMessage?: string;
    },
  ): void {
    const db = this.sqlite.getDb();
    const now = new Date().toISOString();
    let sanitizedError: string | null = null;
    if (details?.errorMessage !== undefined && details.errorMessage !== null) {
      sanitizedError = isSafeAiFailureCode(details.errorMessage)
        ? details.errorMessage
        : "ERR_UNKNOWN";
    }

    const stmt = db.prepare(`
      UPDATE ai_budget_reservations
      SET status = ?,
          prompt_tokens = COALESCE(?, prompt_tokens),
          completion_tokens = COALESCE(?, completion_tokens),
          total_tokens = COALESCE(?, total_tokens),
          estimated_cost = COALESCE(?, estimated_cost),
          diagnosis_id = COALESCE(?, diagnosis_id),
          error_message = COALESCE(?, error_message),
          updated_at = ?
      WHERE operation_id = ?
    `);

    stmt.run(
      status,
      details?.promptTokens ?? null,
      details?.completionTokens ?? null,
      details?.totalTokens ?? null,
      details?.estimatedCost ?? null,
      details?.diagnosisId ?? null,
      sanitizedError,
      now,
      operationId,
    );
  }

  public getReservationByOperationId(operationId: string): AiBudgetReservation | null {
    const db = this.sqlite.getDb();
    const row = db
      .prepare("SELECT * FROM ai_budget_reservations WHERE operation_id = ?")
      .get(operationId) as any;

    if (!row) return null;
    return {
      id: row.id,
      operationId: row.operation_id,
      incidentId: row.incident_id,
      profileId: row.profile_id,
      clusterId: row.cluster_id,
      namespace: row.namespace,
      status: row.status as AiReservationStatus,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      estimatedCost: row.estimated_cost,
      diagnosisId: row.diagnosis_id ?? undefined,
      errorMessage: row.error_message ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public countActiveAndConsumedBudget(incidentId: string): number {
    const db = this.sqlite.getDb();
    const resRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM ai_budget_reservations
      WHERE incident_id = ?
        AND status IN ('RESERVED', 'DISPATCHED', 'COMPLETED', 'FAILED_DISPATCHED')
    `).get(incidentId) as any;

    const reservationCount = resRow?.count ?? 0;

    const legacyRow = db.prepare(`
      SELECT COUNT(*) as count
      FROM ai_diagnoses
      WHERE incident_id = ?
        AND id NOT IN (SELECT COALESCE(diagnosis_id, '') FROM ai_budget_reservations WHERE incident_id = ?)
    `).get(incidentId, incidentId) as any;

    const legacyCount = legacyRow?.count ?? 0;

    return reservationCount + legacyCount;
  }

  public listReservationsByIncident(incidentId: string): AiBudgetReservation[] {
    const db = this.sqlite.getDb();
    const rows = db
      .prepare("SELECT * FROM ai_budget_reservations WHERE incident_id = ? ORDER BY created_at DESC")
      .all(incidentId) as any[];

    return rows.map((row) => ({
      id: row.id,
      operationId: row.operation_id,
      incidentId: row.incident_id,
      profileId: row.profile_id,
      clusterId: row.cluster_id,
      namespace: row.namespace,
      status: row.status as AiReservationStatus,
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
      estimatedCost: row.estimated_cost,
      diagnosisId: row.diagnosis_id ?? undefined,
      errorMessage: row.error_message ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}
