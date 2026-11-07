/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type { SqliteClient } from "./sqlite-client";
import type { IncidentRepository } from "./incident-repository";
import {
  EvidenceSanitizer,
  EvidenceSecurityError,
} from "./evidence-sanitizer";
import type {
  EvidenceSnippet,
  IngestEvidenceInput,
  IngestEvidenceResult,
  UserContextMetadataInput,
} from "../../common/incident/incident-types";

export const DEFAULT_INCIDENT_MAX_QUOTA_BYTES = 512 * 1024; // 512 KiB por caso

export class EvidenceRepository {
  private readonly maxQuotaBytes: number;

  constructor(
    private readonly sqlite: SqliteClient,
    private readonly incidentRepo: IncidentRepository,
    options?: { maxQuotaBytes?: number },
  ) {
    this.maxQuotaBytes = options?.maxQuotaBytes ?? DEFAULT_INCIDENT_MAX_QUOTA_BYTES;
  }

  /**
   * Sanitizes, checks isolation, deduplicates by stable fingerprint and stores evidence.
   */
  public ingestEvidence(input: IngestEvidenceInput): IngestEvidenceResult {
    return this.sqlite.transaction(() => {
      const db = this.sqlite.getDb();
      const incident = this.incidentRepo.getIncidentById(input.incidentId);

      if (!incident) {
        throw new EvidenceSecurityError("INCIDENT_NOT_FOUND", `Incidente con ID '${input.incidentId}' no encontrado.`);
      }

      // 1. Verificación estricta de aislamiento de Clúster y Namespace
      if (incident.clusterId !== input.clusterId) {
        throw new EvidenceSecurityError(
          "ISOLATION_VIOLATION",
          `Violación de aislamiento: el clúster de la evidencia ('${input.clusterId}') no coincide con el clúster del caso ('${incident.clusterId}').`,
        );
      }

      const isClusterScopedKind = ["node", "nodes", "clusterrole", "persistentvolume"].includes(
        (input.resourceKind || "").toLowerCase().trim(),
      );

      if (!isClusterScopedKind && incident.namespace !== input.namespace) {
        throw new EvidenceSecurityError(
          "ISOLATION_VIOLATION",
          `Violación de aislamiento: el namespace de la evidencia ('${input.namespace}') no coincide con el namespace del caso ('${incident.namespace}').`,
        );
      }

      // 2. Sanitización y límite de 64 KiB
      const sanitization = EvidenceSanitizer.sanitize(input.rawContent, input.resourceKind);

      // 3. Generación de Fingerprint determinístico para deduplicación
      const normalizedKind = (input.resourceKind || "").toLowerCase().trim();
      const normalizedName = (input.resourceName || "").toLowerCase().trim();
      const normalizedVersion = (input.resourceVersion || "").trim();

      const fingerprint = crypto
        .createHash("sha256")
        .update(
          `${input.incidentId}:${input.type}:${input.origin}:${normalizedKind}:${normalizedName}:${normalizedVersion}:${sanitization.sha256Hash}`,
        )
        .digest("hex");

      // 4. Comprobación de deduplicación
      const existingRow = db
        .prepare("SELECT * FROM incident_evidence WHERE incident_id = ? AND fingerprint = ?")
        .get(input.incidentId, fingerprint) as any;

      if (existingRow) {
        return {
          evidence: this.mapRowToEvidence(existingRow),
          isDuplicate: true,
        };
      }

      // 5. Control de cuota acumulada por incidente
      const currentQuotaRow = db
        .prepare("SELECT COALESCE(SUM(snippet_bytes), 0) as totalBytes FROM incident_evidence WHERE incident_id = ?")
        .get(input.incidentId) as any;

      const totalBytes = (currentQuotaRow?.totalBytes || 0) + sanitization.byteLength;

      if (totalBytes > this.maxQuotaBytes) {
        throw new EvidenceSecurityError(
          "INCIDENT_QUOTA_EXCEEDED",
          `Se ha superado la cuota máxima de evidencias para este caso (${totalBytes} > ${this.maxQuotaBytes} bytes).`,
        );
      }

      // 6. Inserción persistente
      const id = input.id ?? `EVD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const now = new Date().toISOString();
      const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

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
        evidence: {
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
        },
        isDuplicate: false,
      };
    });
  }

  /**
   * Specifically ingests manual technical context metadata (Dockerfile, values.yaml, etc.).
   * Strictly avoids storing the original raw body, saving only metadata and sanitized summary.
   */
  public ingestUserContextMetadata(input: UserContextMetadataInput): IngestEvidenceResult {
    // Sanitizar resumen de hallazgos
    const summary = input.sanitizedFindingsSummary || input.contextSummary || "";
    const summarySanitization = EvidenceSanitizer.sanitize(summary);

    const safeMetadata = {
      filename: input.filename || input.fileName || "unknown",
      fileType: input.fileType ?? "other",
      sha256Hash: input.sha256Hash || input.sha256 || "",
      userDeclaredVersion: input.userDeclaredVersion ?? "unspecified",
      analysisDate: new Date().toISOString(),
      ...input.metadata,
    };

    const incident = this.incidentRepo.getIncidentById(input.incidentId);

    return this.ingestEvidence({
      id: input.id,
      incidentId: input.incidentId,
      type: "user_context_metadata",
      origin: "user-context",
      clusterId: input.clusterId ?? incident?.clusterId ?? "",
      namespace: input.namespace ?? incident?.namespace ?? "",
      resourceName: input.filename,
      rawContent: `Contexto técnico aportado manualmente: ${input.filename} (${input.fileType})\nSHA-256: ${input.sha256Hash}\nHallazgos:\n${summarySanitization.sanitizedContent}`,
      metadata: safeMetadata,
    });
  }

  public getEvidenceById(id: string): EvidenceSnippet | null {
    const db = this.sqlite.getDb();
    const row = db.prepare("SELECT * FROM incident_evidence WHERE id = ?").get(id) as any;

    if (!row) return null;

    return this.mapRowToEvidence(row);
  }

  public listEvidenceByIncident(incidentId: string): EvidenceSnippet[] {
    const db = this.sqlite.getDb();
    const rows = db
      .prepare("SELECT * FROM incident_evidence WHERE incident_id = ? ORDER BY captured_at ASC")
      .all(incidentId) as any[];

    return rows.map(r => this.mapRowToEvidence(r));
  }

  public getIncidentEvidenceTotalBytes(incidentId: string): number {
    const db = this.sqlite.getDb();
    const row = db
      .prepare("SELECT COALESCE(SUM(snippet_bytes), 0) as totalBytes FROM incident_evidence WHERE incident_id = ?")
      .get(incidentId) as any;

    return row?.totalBytes || 0;
  }

  public deleteEvidence(id: string): boolean {
    const db = this.sqlite.getDb();
    const info = db.prepare("DELETE FROM incident_evidence WHERE id = ?").run(id);

    return info.changes > 0;
  }

  private mapRowToEvidence(row: any): EvidenceSnippet {
    return {
      id: row.id,
      incidentId: row.incident_id,
      type: row.type,
      origin: row.origin,
      clusterId: row.cluster_id,
      namespace: row.namespace,
      resourceKind: row.resource_kind ?? undefined,
      resourceName: row.resource_name ?? undefined,
      resourceUid: row.resource_uid ?? undefined,
      resourceVersion: row.resource_version ?? undefined,
      sha256Hash: row.sha256_hash,
      fingerprint: row.fingerprint,
      snippetBytes: row.snippet_bytes,
      capturedAt: row.captured_at,
      contentSnippet: row.content_snippet,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }
}
