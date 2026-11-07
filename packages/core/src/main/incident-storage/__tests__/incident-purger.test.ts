/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../sqlite-client";
import { ALL_MIGRATIONS } from "../migrations";
import { IncidentRepository } from "../incident-repository";
import { EvidenceRepository } from "../evidence-repository";
import { IncidentPurger } from "../incident-purger";

describe("IncidentPurger (H8-009)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let purger: IncidentPurger;

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();

    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
    purger = new IncidentPurger(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("Initial Configuration & Policy State", () => {
    it("starts strictly with automatic purge disabled and manual strategy by default", () => {
      const policy = purger.getRetentionPolicy();

      expect(policy.enabled).toBe(false);
      expect(policy.strategy).toBe("manual");
      expect(policy.protectPinned).toBe(true);
      expect(policy.purgeClosedOnly).toBe(true);
      expect(policy.lastEvaluatedAt).toBeNull();
    });

    it("persists updated retention policy in SQLite and retrieves it across instances", () => {
      purger.setRetentionPolicy({
        enabled: true,
        strategy: "days",
        retentionDays: 60,
        protectPinned: true,
        purgeClosedOnly: true,
        evidenceRetentionDays: 15,
      });

      const updated = purger.getRetentionPolicy();
      expect(updated.enabled).toBe(true);
      expect(updated.strategy).toBe("days");
      expect(updated.retentionDays).toBe(60);
      expect(updated.evidenceRetentionDays).toBe(15);

      // Verify persistence by querying with a fresh purger instance
      const freshPurger = new IncidentPurger(sqlite);
      const retrieved = freshPurger.getRetentionPolicy();
      expect(retrieved.retentionDays).toBe(60);
      expect(retrieved.evidenceRetentionDays).toBe(15);
      expect(retrieved.enabled).toBe(true);
    });
  });

  describe("Purge Candidate Calculation & Preview", () => {
    it("returns zero candidate incidents when retention is disabled and manual", () => {
      // Create an old incident
      const incident = incidentRepo.createIncident({
        title: "Old incident",
        clusterId: "c1",
        namespace: "default",
        severity: "low",
        creator: { type: "human", name: "tester" },
      });

      // Manually backdate updated_at and status in SQLite
      const db = sqlite.getDb();
      db.prepare("UPDATE incidents SET status = 'CERRADO', closed_at = '2025-01-01T00:00:00Z', updated_at = '2025-01-01T00:00:00Z' WHERE id = ?")
        .run(incident.id);

      const preview = purger.previewPurge();
      expect(preview.candidateIncidentCount).toBe(0);
      expect(preview.candidateIncidentIds).toEqual([]);
    });

    it("identifies expired closed incidents while protecting pinned incidents", () => {
      const db = sqlite.getDb();

      // 1. Expired closed incident (unpinned) -> should be candidate
      const exp1 = incidentRepo.createIncident({
        title: "Expired Closed 1",
        clusterId: "c1",
        namespace: "default",
        severity: "medium",
        creator: { type: "human", name: "tester" },
      });
      db.prepare("UPDATE incidents SET status = 'CERRADO', closed_at = '2025-01-01T00:00:00Z', updated_at = '2025-01-01T00:00:00Z' WHERE id = ?")
        .run(exp1.id);

      // 2. Expired closed incident (PINNED) -> must be protected
      const expPinned = incidentRepo.createIncident({
        title: "Expired Closed Pinned",
        clusterId: "c1",
        namespace: "default",
        severity: "critical",
        creator: { type: "human", name: "tester" },
      });
      db.prepare("UPDATE incidents SET status = 'CERRADO', closed_at = '2025-01-01T00:00:00Z', updated_at = '2025-01-01T00:00:00Z', is_pinned = 1 WHERE id = ?")
        .run(expPinned.id);

      // 3. Expired OPEN incident -> must be protected when purgeClosedOnly is true
      const expOpen = incidentRepo.createIncident({
        title: "Expired Open",
        clusterId: "c1",
        namespace: "default",
        severity: "high",
        creator: { type: "human", name: "tester" },
      });
      db.prepare("UPDATE incidents SET status = 'INVESTIGANDO', updated_at = '2025-01-01T00:00:00Z' WHERE id = ?")
        .run(expOpen.id);

      // 4. Recently closed incident (within retention window) -> not expired
      const recentClosed = incidentRepo.createIncident({
        title: "Recent Closed",
        clusterId: "c1",
        namespace: "default",
        severity: "low",
        creator: { type: "human", name: "tester" },
      });
      const recentDate = new Date(Date.now() - 5 * 86400 * 1000).toISOString();
      db.prepare("UPDATE incidents SET status = 'CERRADO', closed_at = ?, updated_at = ? WHERE id = ?")
        .run(recentDate, recentDate, recentClosed.id);

      // Ingest evidence on exp1 to test reclaimable byte calculations
      evidenceRepo.ingestEvidence({
        incidentId: exp1.id,
        type: "pod_logs",
        origin: "kubectl logs",
        clusterId: "c1",
        namespace: "default",
        rawContent: "Sample pod log output for expiration test",
      });

      // Configure policy: 30 days retention, protect pinned, purge closed only
      purger.setRetentionPolicy({
        enabled: true,
        strategy: "days",
        retentionDays: 30,
        protectPinned: true,
        purgeClosedOnly: true,
      });

      const preview = purger.previewPurge();

      expect(preview.candidateIncidentCount).toBe(1);
      expect(preview.candidateIncidentIds).toEqual([exp1.id]);
      expect(preview.protectedIncidentCount).toBe(1);
      expect(preview.candidateEvidenceCount).toBe(1);
      expect(preview.candidateReclaimableBytes).toBeGreaterThan(0);

      // Verify preview did NOT delete anything
      expect(incidentRepo.getIncidentById(exp1.id)).not.toBeNull();
    });
  });

  describe("Atomic Execution & Foreign Key Cascades", () => {
    it("deletes candidate incidents and cascades to timeline and evidence atomically", () => {
      const db = sqlite.getDb();

      const incident = incidentRepo.createIncident({
        title: "To Be Purged",
        clusterId: "c1",
        namespace: "default",
        severity: "medium",
        creator: { type: "human", name: "tester" },
      });

      evidenceRepo.ingestEvidence({
        incidentId: incident.id,
        type: "pod_logs",
        origin: "kubectl logs",
        clusterId: "c1",
        namespace: "default",
        rawContent: "Log content that will cascade delete",
      });

      db.prepare("UPDATE incidents SET status = 'CERRADO', closed_at = '2024-01-01T00:00:00Z', updated_at = '2024-01-01T00:00:00Z' WHERE id = ?")
        .run(incident.id);

      purger.setRetentionPolicy({
        enabled: true,
        strategy: "days",
        retentionDays: 30,
        protectPinned: true,
        purgeClosedOnly: true,
      });

      const result = purger.executePurge();

      expect(result.success).toBe(true);
      expect(result.deletedIncidentCount).toBe(1);
      expect(result.deletedTimelineCount).toBeGreaterThanOrEqual(1);
      expect(result.deletedEvidenceCount).toBe(1);
      expect(result.reclaimedBytes).toBeGreaterThan(0);

      // Verify incident is gone
      expect(incidentRepo.getIncidentById(incident.id)).toBeNull();

      // Verify cascade deleted timeline and evidence
      const timelines = db.prepare("SELECT * FROM incident_timeline WHERE incident_id = ?").all(incident.id);
      expect(timelines).toHaveLength(0);

      const evidences = db.prepare("SELECT * FROM incident_evidence WHERE incident_id = ?").all(incident.id);
      expect(evidences).toHaveLength(0);

      // Verify audit record exists
      const history = purger.getPurgeHistory(10);
      expect(history).toHaveLength(1);
      expect(history[0].deletedIncidents).toBe(1);
      expect(history[0].status).toBe("SUCCESS");
    });

    it("supports independent evidence retention for older evidences without deleting the incident", () => {
      const db = sqlite.getDb();

      const incident = incidentRepo.createIncident({
        title: "Active Long-running Incident",
        clusterId: "c1",
        namespace: "default",
        severity: "critical",
        creator: { type: "human", name: "tester" },
      });

      // Add old evidence to active incident
      const evResult = evidenceRepo.ingestEvidence({
        incidentId: incident.id,
        type: "pod_logs",
        origin: "kubectl logs",
        clusterId: "c1",
        namespace: "default",
        rawContent: "Old heavy debug log",
      });

      // Backdate evidence captured_at
      db.prepare("UPDATE incident_evidence SET captured_at = '2024-01-01T00:00:00Z' WHERE id = ?")
        .run(evResult.evidence.id);

      // Policy: keep incidents manual/indefinite, but purge evidence older than 30 days
      purger.setRetentionPolicy({
        enabled: true,
        strategy: "manual",
        retentionDays: 365,
        protectPinned: true,
        purgeClosedOnly: true,
        evidenceRetentionDays: 30,
      });

      const preview = purger.previewPurge({ enabled: true });
      expect(preview.candidateIncidentCount).toBe(0); // incident preserved!
      expect(preview.candidateEvidenceIds).toContain(evResult.evidence.id);

      const execResult = purger.executePurge();
      expect(execResult.deletedIncidentCount).toBe(0);
      expect(execResult.deletedEvidenceCount).toBe(1);

      // Incident and timeline still exist intact
      expect(incidentRepo.getIncidentById(incident.id)).not.toBeNull();
      expect(incidentRepo.getTimeline(incident.id).length).toBeGreaterThanOrEqual(1);

      // But evidence is cleaned up
      expect(evidenceRepo.getEvidenceById(evResult.evidence.id)).toBeNull();
    });

    it("prevents concurrent purges using internal mutex", () => {
      (purger as any).isPurging = true;

      expect(() => purger.executePurge()).toThrow(/A purge operation is already in progress/);

      (purger as any).isPurging = false;
    });
  });
});
