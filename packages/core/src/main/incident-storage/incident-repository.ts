/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type { SqliteClient } from "./sqlite-client";

export type IncidentSeverity = "critical" | "high" | "medium" | "low" | "info";

export type IncidentStatus =
  | "DETECTADO"
  | "INVESTIGANDO"
  | "HIPÓTESIS"
  | "CONFIRMADO"
  | "SOLUCIÓN PROPUESTA"
  | "APROBACIÓN HUMANA"
  | "VALIDACIÓN"
  | "CERRADO"
  | "NO CONFIRMADO"
  | "INCONCLUSO";

export interface Incident {
  id: string;
  clusterId: string;
  namespace: string;
  workloadKind?: string;
  workloadName?: string;
  title: string;
  description?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface TimelineEvent {
  id: string;
  incidentId: string;
  timestamp: string;
  authorType: "human" | "system" | "ai";
  authorName: string;
  fromStatus?: IncidentStatus;
  toStatus?: IncidentStatus;
  message: string;
  metadata?: Record<string, any>;
}

export type EvidenceType =
  | "pod_logs"
  | "k8s_event"
  | "resource_manifest"
  | "cost_estimate"
  | "user_context_metadata";

export interface EvidenceSnippet {
  id: string;
  incidentId: string;
  type: EvidenceType;
  origin: string;
  clusterId: string;
  namespace: string;
  resourceUid?: string;
  capturedAt: string;
  contentSnippet: string;
  metadata?: Record<string, any>;
}

export interface NewIncidentInput {
  id?: string;
  clusterId: string;
  namespace: string;
  workloadKind?: string;
  workloadName?: string;
  title: string;
  description?: string;
  severity: IncidentSeverity;
  status?: IncidentStatus;
  isPinned?: boolean;
}

export interface UpdateIncidentInput {
  title?: string;
  description?: string;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  isPinned?: boolean;
  closedAt?: string | null;
}

export interface IncidentFilter {
  clusterId?: string;
  namespace?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  isPinned?: boolean;
  limit?: number;
  offset?: number;
}

export interface NewTimelineEventInput {
  id?: string;
  incidentId: string;
  authorType: "human" | "system" | "ai";
  authorName: string;
  fromStatus?: IncidentStatus;
  toStatus?: IncidentStatus;
  message: string;
  metadata?: Record<string, any>;
}

export interface NewEvidenceInput {
  id?: string;
  incidentId: string;
  type: EvidenceType;
  origin: string;
  clusterId: string;
  namespace: string;
  resourceUid?: string;
  contentSnippet: string;
  metadata?: Record<string, any>;
}

export class IncidentRepository {
  constructor(private readonly sqlite: SqliteClient) {}

  public createIncident(input: NewIncidentInput): Incident {
    const db = this.sqlite.getDb();
    const now = new Date().toISOString();
    const id = input.id ?? `INC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const status = input.status ?? "DETECTADO";
    const isPinned = input.isPinned ? 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO incidents (
        id, cluster_id, namespace, workload_kind, workload_name,
        title, description, severity, status, is_pinned,
        created_at, updated_at, closed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.clusterId,
      input.namespace,
      input.workloadKind ?? null,
      input.workloadName ?? null,
      input.title,
      input.description ?? null,
      input.severity,
      status,
      isPinned,
      now,
      now,
      null,
    );

    return {
      id,
      clusterId: input.clusterId,
      namespace: input.namespace,
      workloadKind: input.workloadKind,
      workloadName: input.workloadName,
      title: input.title,
      description: input.description,
      severity: input.severity,
      status,
      isPinned: Boolean(input.isPinned),
      createdAt: now,
      updatedAt: now,
    };
  }

  public getIncidentById(id: string): Incident | null {
    const db = this.sqlite.getDb();
    const stmt = db.prepare("SELECT * FROM incidents WHERE id = ?");
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    return this.mapIncidentRow(row);
  }

  public updateIncident(id: string, update: UpdateIncidentInput): Incident {
    const db = this.sqlite.getDb();
    const existing = this.getIncidentById(id);

    if (!existing) {
      throw new Error(`Incident with id '${id}' not found`);
    }

    const fields: string[] = [];
    const values: any[] = [];
    const now = new Date().toISOString();

    if (update.title !== undefined) {
      fields.push("title = ?");
      values.push(update.title);
    }

    if (update.description !== undefined) {
      fields.push("description = ?");
      values.push(update.description);
    }

    if (update.severity !== undefined) {
      fields.push("severity = ?");
      values.push(update.severity);
    }

    if (update.status !== undefined) {
      fields.push("status = ?");
      values.push(update.status);
    }

    if (update.isPinned !== undefined) {
      fields.push("is_pinned = ?");
      values.push(update.isPinned ? 1 : 0);
    }

    if (update.closedAt !== undefined) {
      fields.push("closed_at = ?");
      values.push(update.closedAt);
    }

    fields.push("updated_at = ?");
    values.push(now);

    values.push(id);

    const query = `UPDATE incidents SET ${fields.join(", ")} WHERE id = ?`;

    db.prepare(query).run(...values);

    return this.getIncidentById(id)!;
  }

  public listIncidents(filter: IncidentFilter = {}): Incident[] {
    const db = this.sqlite.getDb();
    const where: string[] = [];
    const values: any[] = [];

    if (filter.clusterId) {
      where.push("cluster_id = ?");
      values.push(filter.clusterId);
    }

    if (filter.namespace) {
      where.push("namespace = ?");
      values.push(filter.namespace);
    }

    if (filter.status) {
      where.push("status = ?");
      values.push(filter.status);
    }

    if (filter.severity) {
      where.push("severity = ?");
      values.push(filter.severity);
    }

    if (filter.isPinned !== undefined) {
      where.push("is_pinned = ?");
      values.push(filter.isPinned ? 1 : 0);
    }

    let query = "SELECT * FROM incidents";

    if (where.length > 0) {
      query += ` WHERE ${where.join(" AND ")}`;
    }

    query += " ORDER BY is_pinned DESC, updated_at DESC";

    if (filter.limit !== undefined) {
      query += " LIMIT ?";
      values.push(filter.limit);

      if (filter.offset !== undefined) {
        query += " OFFSET ?";
        values.push(filter.offset);
      }
    }

    const rows = db.prepare(query).all(...values) as any[];

    return rows.map(r => this.mapIncidentRow(r));
  }

  public deleteIncident(id: string): boolean {
    const db = this.sqlite.getDb();
    const info = db.prepare("DELETE FROM incidents WHERE id = ?").run(id);

    return info.changes > 0;
  }

  public addTimelineEvent(input: NewTimelineEventInput): TimelineEvent {
    const db = this.sqlite.getDb();
    const id = input.id ?? `EVT-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    const stmt = db.prepare(`
      INSERT INTO incident_timeline (
        id, incident_id, timestamp, author_type, author_name,
        from_status, to_status, message, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.incidentId,
      now,
      input.authorType,
      input.authorName,
      input.fromStatus ?? null,
      input.toStatus ?? null,
      input.message,
      metadataJson,
    );

    return {
      id,
      incidentId: input.incidentId,
      timestamp: now,
      authorType: input.authorType,
      authorName: input.authorName,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      message: input.message,
      metadata: input.metadata,
    };
  }

  public getTimelineEvents(incidentId: string): TimelineEvent[] {
    const db = this.sqlite.getDb();
    const stmt = db.prepare("SELECT * FROM incident_timeline WHERE incident_id = ? ORDER BY timestamp ASC");
    const rows = stmt.all(incidentId) as any[];

    return rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      timestamp: r.timestamp,
      authorType: r.author_type,
      authorName: r.author_name,
      fromStatus: r.from_status ?? undefined,
      toStatus: r.to_status ?? undefined,
      message: r.message,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
    }));
  }

  public addEvidence(input: NewEvidenceInput): EvidenceSnippet {
    const db = this.sqlite.getDb();
    const id = input.id ?? `EVD-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    const stmt = db.prepare(`
      INSERT INTO incident_evidence (
        id, incident_id, type, origin, cluster_id, namespace,
        resource_uid, captured_at, content_snippet, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.incidentId,
      input.type,
      input.origin,
      input.clusterId,
      input.namespace,
      input.resourceUid ?? null,
      now,
      input.contentSnippet,
      metadataJson,
    );

    return {
      id,
      incidentId: input.incidentId,
      type: input.type,
      origin: input.origin,
      clusterId: input.clusterId,
      namespace: input.namespace,
      resourceUid: input.resourceUid,
      capturedAt: now,
      contentSnippet: input.contentSnippet,
      metadata: input.metadata,
    };
  }

  public getEvidenceByIncident(incidentId: string): EvidenceSnippet[] {
    const db = this.sqlite.getDb();
    const stmt = db.prepare("SELECT * FROM incident_evidence WHERE incident_id = ? ORDER BY captured_at ASC");
    const rows = stmt.all(incidentId) as any[];

    return rows.map(r => ({
      id: r.id,
      incidentId: r.incident_id,
      type: r.type,
      origin: r.origin,
      clusterId: r.cluster_id,
      namespace: r.namespace,
      resourceUid: r.resource_uid ?? undefined,
      capturedAt: r.captured_at,
      contentSnippet: r.content_snippet,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
    }));
  }

  private mapIncidentRow(row: any): Incident {
    return {
      id: row.id,
      clusterId: row.cluster_id,
      namespace: row.namespace,
      workloadKind: row.workload_kind ?? undefined,
      workloadName: row.workload_name ?? undefined,
      title: row.title,
      description: row.description ?? undefined,
      severity: row.severity,
      status: row.status,
      isPinned: Boolean(row.is_pinned),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      closedAt: row.closed_at ?? undefined,
    };
  }
}
