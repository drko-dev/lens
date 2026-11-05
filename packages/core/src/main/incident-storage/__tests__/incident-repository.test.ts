/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../sqlite-client";
import { ALL_MIGRATIONS } from "../migrations";
import { IncidentRepository } from "../incident-repository";

describe("IncidentRepository (H8-005)", () => {
  let sqlite: SqliteClient;
  let repo: IncidentRepository;

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();
    repo = new IncidentRepository(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("Incident CRUD", () => {
    it("creates and retrieves an incident by ID", () => {
      const created = repo.createIncident({
        clusterId: "cluster-alpha",
        namespace: "production",
        workloadKind: "Deployment",
        workloadName: "payment-api",
        title: "CrashLoopBackOff in payment pods",
        description: "Pods restarting with OOMKilled code 137",
        severity: "critical",
        status: "DETECTADO",
        isPinned: true,
      });

      expect(created.id).toMatch(/^INC-/);
      expect(created.clusterId).toBe("cluster-alpha");
      expect(created.namespace).toBe("production");
      expect(created.severity).toBe("critical");
      expect(created.status).toBe("DETECTADO");
      expect(created.isPinned).toBe(true);

      const fetched = repo.getIncidentById(created.id);

      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe("CrashLoopBackOff in payment pods");
      expect(fetched?.workloadName).toBe("payment-api");
    });

    it("returns null for non-existent incident ID", () => {
      expect(repo.getIncidentById("INC-NONEXISTENT")).toBeNull();
    });

    it("updates incident fields and timestamps", () => {
      const created = repo.createIncident({
        clusterId: "cluster-1",
        namespace: "default",
        title: "Initial Title",
        severity: "low",
      });

      const updated = repo.updateIncident(created.id, {
        title: "Updated Title",
        severity: "high",
        status: "INVESTIGANDO",
        isPinned: true,
      });

      expect(updated.title).toBe("Updated Title");
      expect(updated.severity).toBe("high");
      expect(updated.status).toBe("INVESTIGANDO");
      expect(updated.isPinned).toBe(true);
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.createdAt).getTime());
    });

    it("deletes an incident and cascades deletion to timeline and evidence", () => {
      const incident = repo.createIncident({
        clusterId: "c1",
        namespace: "ns1",
        title: "Incident with Cascade",
        severity: "medium",
      });

      repo.addTimelineEvent({
        incidentId: incident.id,
        authorType: "human",
        authorName: "admin",
        message: "Investigating issue",
      });

      repo.addEvidence({
        incidentId: incident.id,
        type: "pod_logs",
        origin: "kubectl",
        clusterId: "c1",
        namespace: "ns1",
        contentSnippet: "Error: out of memory",
      });

      expect(repo.getTimelineEvents(incident.id)).toHaveLength(1);
      expect(repo.getEvidenceByIncident(incident.id)).toHaveLength(1);

      const deleted = repo.deleteIncident(incident.id);

      expect(deleted).toBe(true);
      expect(repo.getIncidentById(incident.id)).toBeNull();

      // Check cascade deletion via foreign keys
      expect(repo.getTimelineEvents(incident.id)).toHaveLength(0);
      expect(repo.getEvidenceByIncident(incident.id)).toHaveLength(0);
    });

    it("lists incidents with filters and prioritizes pinned incidents", () => {
      repo.createIncident({
        clusterId: "c1",
        namespace: "ns-a",
        title: "Unpinned 1",
        severity: "low",
        isPinned: false,
      });
      repo.createIncident({
        clusterId: "c1",
        namespace: "ns-a",
        title: "Pinned Critical",
        severity: "critical",
        isPinned: true,
      });
      repo.createIncident({
        clusterId: "c2",
        namespace: "ns-b",
        title: "Other Cluster",
        severity: "high",
        isPinned: false,
      });

      const all = repo.listIncidents();

      expect(all).toHaveLength(3);
      // Pinned must be first
      expect(all[0].title).toBe("Pinned Critical");

      // Filter by cluster
      const c1Incidents = repo.listIncidents({ clusterId: "c1" });

      expect(c1Incidents).toHaveLength(2);

      // Filter by severity
      const criticalIncidents = repo.listIncidents({ severity: "critical" });

      expect(criticalIncidents).toHaveLength(1);
      expect(criticalIncidents[0].title).toBe("Pinned Critical");
    });
  });

  describe("Timeline and Evidence", () => {
    it("adds and retrieves timeline events in chronological order", () => {
      const incident = repo.createIncident({
        clusterId: "c1",
        namespace: "default",
        title: "Timeline Test",
        severity: "medium",
      });

      repo.addTimelineEvent({
        incidentId: incident.id,
        authorType: "system",
        authorName: "local-detector",
        fromStatus: undefined,
        toStatus: "DETECTADO",
        message: "CrashLoopBackOff detected on pod auth-7b",
      });

      repo.addTimelineEvent({
        incidentId: incident.id,
        authorType: "human",
        authorName: "sre-lead",
        fromStatus: "DETECTADO",
        toStatus: "INVESTIGANDO",
        message: "Operator assigned to investigate",
        metadata: { ticketId: "DEV-1234" },
      });

      const timeline = repo.getTimelineEvents(incident.id);

      expect(timeline).toHaveLength(2);
      expect(timeline[0].toStatus).toBe("DETECTADO");
      expect(timeline[1].toStatus).toBe("INVESTIGANDO");
      expect(timeline[1].metadata?.ticketId).toBe("DEV-1234");
    });

    it("adds and retrieves evidence snippets without storing raw secrets", () => {
      const incident = repo.createIncident({
        clusterId: "c1",
        namespace: "default",
        title: "Evidence Test",
        severity: "high",
      });

      const evidence = repo.addEvidence({
        incidentId: incident.id,
        type: "pod_logs",
        origin: "kubetail-stream",
        clusterId: "c1",
        namespace: "default",
        resourceUid: "pod-uid-99",
        contentSnippet: "2026-11-05 [FATAL] Database connection failed [REDACTED_PASSWORD]",
        metadata: { container: "backend", tailLines: 50 },
      });

      expect(evidence.id).toMatch(/^EVD-/);
      expect(evidence.contentSnippet).toContain("[REDACTED_PASSWORD]");

      const retrieved = repo.getEvidenceByIncident(incident.id);

      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].type).toBe("pod_logs");
      expect(retrieved[0].metadata?.container).toBe("backend");
    });
  });
});
