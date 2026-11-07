/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { SqliteClient } from "../incident-storage/sqlite-client";
import type { AiDiagnosisReport } from "../../common/incident/ai-diagnosis-types";

export class AiDiagnosisRepository {
  constructor(private readonly sqlite: SqliteClient) {}

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
}
