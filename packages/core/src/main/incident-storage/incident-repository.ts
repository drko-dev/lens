/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type { SqliteClient } from "./sqlite-client";
import { EvidenceSanitizer } from "./evidence-sanitizer";
import {
  IncidentStateMachine,
} from "../../common/incident/incident-state-machine";
import type {
  Incident,
  IncidentStatus,
  IncidentFilter,
  CreateIncidentInput,
  UpdateIncidentMetadataInput,
  IncidentTransitionRequest,
  TimelineEvent,
  EvidenceSnippet,
  NewEvidenceInput,
} from "../../common/incident/incident-types";

export type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  IncidentActorType,
  IncidentActor,
  TimelineEvent,
  EvidenceSnippet,
  EvidenceType,
  CreateIncidentInput,
  UpdateIncidentMetadataInput,
  IncidentFilter,
  IncidentTransitionRequest,
  NewEvidenceInput,
} from "../../common/incident/incident-types";

export class IncidentRepository {
  constructor(private readonly sqlite: SqliteClient) {}

  public getSqlite(): SqliteClient {
    return this.sqlite;
  }

  public transaction<T>(fn: () => T): T {
    return this.sqlite.transaction(fn);
  }

  public findOpenIncidentByFingerprint(fingerprint: string): Incident | null {
    if (!fingerprint) return null;
    const db = this.sqlite.getDb();

    // Primary: Consult indexed fingerprint column in incidents table
    const indexedStmt = db.prepare(`
      SELECT * FROM incidents
      WHERE fingerprint = ?
        AND status NOT IN ('CERRADO', 'NO CONFIRMADO', 'INCONCLUSO')
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const indexedRow = indexedStmt.get(fingerprint);
    if (indexedRow) {
      return this.mapIncidentRow(indexedRow);
    }

    // Secondary fallback: Legacy query for incidents recorded prior to migration 008
    const legacyStmt = db.prepare(`
      SELECT i.* FROM incidents i
      JOIN incident_timeline t ON i.id = t.incident_id
      WHERE t.metadata_json LIKE ?
        AND i.status NOT IN ('CERRADO', 'NO CONFIRMADO', 'INCONCLUSO')
      ORDER BY i.created_at DESC
      LIMIT 1
    `);
    const row = legacyStmt.get(`%"fingerprint":"${fingerprint}"%`);
    return row ? this.mapIncidentRow(row) : null;
  }

  public findOpenIncidentByResource(
    clusterId: string,
    namespace: string,
    workloadKind?: string,
    workloadName?: string,
  ): Incident | null {
    const db = this.sqlite.getDb();
    let query = `
      SELECT * FROM incidents
      WHERE cluster_id = ?
        AND namespace = ?
        AND status NOT IN ('CERRADO', 'NO CONFIRMADO', 'INCONCLUSO')
    `;
    const params: any[] = [clusterId, namespace];
    if (workloadKind) {
      query += ` AND LOWER(workload_kind) = LOWER(?)`;
      params.push(workloadKind);
    }
    if (workloadName) {
      query += ` AND LOWER(workload_name) = LOWER(?)`;
      params.push(workloadName);
    }
    query += ` ORDER BY created_at DESC LIMIT 1`;
    const stmt = db.prepare(query);
    const row = stmt.get(...params);
    return row ? this.mapIncidentRow(row) : null;
  }

  /**
   * Creates a new incident. All incidents are strictly initialized with status "DETECTADO"
   * and record an initial creation event in the timeline within the same atomic transaction.
   */
  public createIncident(input: CreateIncidentInput): Incident {
    return this.sqlite.transaction(() => {
      const db = this.sqlite.getDb();
      const now = new Date().toISOString();
      const id = input.id ?? `INC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const status = "DETECTADO";
      const isPinned = input.isPinned ? 1 : 0;
      const creator = input.creator ?? { type: "human" as const, name: "local-operator", id: "local-operator" };

      const incidentStmt = db.prepare(`
        INSERT INTO incidents (
          id, cluster_id, namespace, workload_kind, workload_name,
          title, description, severity, status, is_pinned,
          created_at, updated_at, closed_at,
          fingerprint, resource_uid, signal_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      incidentStmt.run(
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
        input.fingerprint ?? "",
        input.resourceUid ?? null,
        input.signalType ?? null,
      );

      // Inserción atómica del evento inicial en timeline
      const timelineId = `EVT-${crypto.randomUUID()}`;
      const initialMessage = input.initialMessage ?? `Incidente detectado: ${input.title}`;
      const timelineStmt = db.prepare(`
        INSERT INTO incident_timeline (
          id, incident_id, timestamp, author_type, author_name,
          from_status, to_status, message, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      timelineStmt.run(
        timelineId,
        id,
        now,
        creator.type,
        creator.name,
        null,
        status,
        initialMessage,
        JSON.stringify({ actorId: creator.id ?? "local-operator" }),
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
        fingerprint: input.fingerprint ?? undefined,
        resourceUid: input.resourceUid ?? undefined,
        signalType: input.signalType ?? undefined,
      };
    });
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

  /**
   * Updates non-status metadata (title, description, severity, isPinned).
   * Status modifications are prohibited here and MUST go through `transitionStatus`.
   */
  public updateIncidentMetadata(id: string, update: UpdateIncidentMetadataInput): Incident {
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

    if (update.isPinned !== undefined) {
      fields.push("is_pinned = ?");
      values.push(update.isPinned ? 1 : 0);
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push("updated_at = ?");
    values.push(now);

    values.push(id);

    const query = `UPDATE incidents SET ${fields.join(", ")} WHERE id = ?`;

    db.prepare(query).run(...values);

    return this.getIncidentById(id)!;
  }

  public updateIncident(id: string, update: UpdateIncidentMetadataInput): Incident {
    return this.updateIncidentMetadata(id, update);
  }

  /**
   * Performs an atomic state transition:
   * 1. Retrieves current incident state.
   * 2. Validates transition rules and preconditions.
   * 3. Verifies evidence IDs exist in SQLite and belong to this incident.
   * 4. Updates incident status and closed_at.
   * 5. Appends timeline event.
   * Both writes commit atomically or rollback completely on error.
   */
  public transitionStatus(request: IncidentTransitionRequest): {
    incident: Incident;
    timelineEvent: TimelineEvent;
  } {
    return this.sqlite.transaction(() => {
      const db = this.sqlite.getDb();
      const existing = this.getIncidentById(request.incidentId);

      if (!existing) {
        throw new Error(`Incidente con id '${request.incidentId}' no encontrado.`);
      }

      // Validación de máquina de estados y reglas de negocio
      IncidentStateMachine.validateTransition(existing, request);

      // Verificación de evidencias reales en SQLite
      if (request.evidenceIds && request.evidenceIds.length > 0) {
        const placeholders = request.evidenceIds.map(() => "?").join(", ");
        const checkStmt = db.prepare(`
          SELECT id FROM incident_evidence
          WHERE incident_id = ? AND id IN (${placeholders})
        `);
        const foundRows = checkStmt.all(request.incidentId, ...request.evidenceIds) as { id: string }[];
        const foundIds = new Set(foundRows.map(r => r.id));

        const missing = request.evidenceIds.filter(id => !foundIds.has(id));

        if (missing.length > 0) {
          throw new Error(
            `Evidencia no válida o perteneciente a otro incidente: [${missing.join(", ")}].`,
          );
        }
      }

      const now = new Date().toISOString();
      let closedAt = existing.closedAt ?? null;

      if (request.toStatus === "CERRADO") {
        closedAt = now;
      } else if (existing.status === "CERRADO") {
        closedAt = null; // Reabierto
      }

      // Actualizar incidente
      const updateStmt = db.prepare(`
        UPDATE incidents
        SET status = ?, closed_at = ?, updated_at = ?
        WHERE id = ?
      `);

      updateStmt.run(request.toStatus, closedAt, now, request.incidentId);

      // Registrar evento de timeline
      const timelineId = `EVT-${crypto.randomUUID()}`;
      const metadataJson = JSON.stringify({
        actorId: request.actor.id,
        evidenceIds: request.evidenceIds ?? [],
        ...request.actor.metadata,
        ...request.metadata,
      });

      const timelineStmt = db.prepare(`
        INSERT INTO incident_timeline (
          id, incident_id, timestamp, author_type, author_name,
          from_status, to_status, message, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      timelineStmt.run(
        timelineId,
        request.incidentId,
        now,
        request.actor.type,
        request.actor.name,
        existing.status,
        request.toStatus,
        request.justification,
        metadataJson,
      );

      const updatedIncident: Incident = {
        ...existing,
        status: request.toStatus,
        closedAt: closedAt ?? undefined,
        updatedAt: now,
      };

      const timelineEvent: TimelineEvent = {
        id: timelineId,
        incidentId: request.incidentId,
        timestamp: now,
        authorType: request.actor.type,
        authorName: request.actor.name,
        fromStatus: existing.status,
        toStatus: request.toStatus,
        message: request.justification,
        metadata: JSON.parse(metadataJson),
      };

      return { incident: updatedIncident, timelineEvent };
    });
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

  public getTimeline(incidentId: string): TimelineEvent[] {
    return this.getTimelineEvents(incidentId);
  }

  public addTimelineEntry(input: {
    incidentId: string;
    authorType: "human" | "system" | "ai";
    authorName: string;
    message: string;
    fromStatus?: IncidentStatus;
    toStatus?: IncidentStatus;
    metadata?: Record<string, any>;
  }): TimelineEvent {
    const db = this.sqlite.getDb();
    const id = `EVT-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    db.prepare(`
      INSERT INTO incident_timeline (
        id, incident_id, timestamp, author_type, author_name,
        from_status, to_status, message, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
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

  public addEvidence(input: NewEvidenceInput): EvidenceSnippet {
    const db = this.sqlite.getDb();
    const id = input.id ?? `EVD-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    const sanitization = EvidenceSanitizer.sanitize(input.contentSnippet, input.resourceKind);
    const fingerprint = crypto
      .createHash("sha256")
      .update(
        `${input.incidentId}:${input.type}:${input.origin}:${input.resourceKind || ""}:${input.resourceName || ""}:${input.resourceVersion || ""}:${sanitization.sha256Hash}`,
      )
      .digest("hex");

    const stmt = db.prepare(`
      INSERT INTO incident_evidence (
        id, incident_id, type, origin, cluster_id, namespace,
        resource_kind, resource_name, resource_uid, resource_version,
        captured_at, content_snippet, sha256_hash, fingerprint,
        snippet_bytes, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.incidentId,
      input.type,
      input.origin,
      input.clusterId,
      input.namespace,
      input.resourceKind ?? null,
      input.resourceName ?? null,
      input.resourceUid ?? null,
      input.resourceVersion ?? null,
      now,
      sanitization.sanitizedContent,
      sanitization.sha256Hash,
      fingerprint,
      sanitization.byteLength,
      metadataJson,
    );

    return {
      id,
      incidentId: input.incidentId,
      type: input.type,
      origin: input.origin,
      clusterId: input.clusterId,
      namespace: input.namespace,
      resourceKind: input.resourceKind,
      resourceName: input.resourceName,
      resourceUid: input.resourceUid,
      resourceVersion: input.resourceVersion,
      sha256Hash: sanitization.sha256Hash,
      fingerprint,
      snippetBytes: sanitization.byteLength,
      capturedAt: now,
      contentSnippet: sanitization.sanitizedContent,
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
      resourceKind: r.resource_kind ?? undefined,
      resourceName: r.resource_name ?? undefined,
      resourceUid: r.resource_uid ?? undefined,
      resourceVersion: r.resource_version ?? undefined,
      sha256Hash: r.sha256_hash,
      fingerprint: r.fingerprint,
      snippetBytes: r.snippet_bytes,
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
      fingerprint: row.fingerprint ?? undefined,
      resourceUid: row.resource_uid ?? undefined,
      signalType: row.signal_type ?? undefined,
    };
  }
}
