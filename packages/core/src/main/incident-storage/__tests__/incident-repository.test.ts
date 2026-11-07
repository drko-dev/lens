/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../sqlite-client";
import { ALL_MIGRATIONS } from "../migrations";
import { IncidentRepository } from "../incident-repository";
import type { IncidentActor } from "../../../common/incident/incident-types";

describe("IncidentRepository (H8-005 & H8-006)", () => {
  let sqlite: SqliteClient;
  let repo: IncidentRepository;

  const humanOperator: IncidentActor = {
    type: "human",
    id: "user:sre-lead",
    name: "SRE Lead",
  };

  const systemDetector: IncidentActor = {
    type: "system",
    id: "system:local-detector",
    name: "Local Signals Detector",
  };

  const aiAssistant: IncidentActor = {
    type: "ai",
    id: "ai:diagnostic-engine",
    name: "AI Diagnostic Engine",
  };

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

  describe("Incident Creation & Metadata Updates", () => {
    it("creates an incident strictly with status DETECTADO and registers initial timeline event atomically", () => {
      const created = repo.createIncident({
        clusterId: "cluster-alpha",
        namespace: "production",
        workloadKind: "Deployment",
        workloadName: "payment-api",
        title: "CrashLoopBackOff in payment pods",
        description: "Pods restarting with OOMKilled code 137",
        severity: "critical",
        isPinned: true,
        creator: systemDetector,
        initialMessage: "OOMKilled detected by local monitor",
      });

      expect(created.id).toMatch(/^INC-/);
      expect(created.status).toBe("DETECTADO"); // Strict default
      expect(created.isPinned).toBe(true);

      // Verify initial timeline was created in the same atomic transaction
      const timeline = repo.getTimelineEvents(created.id);

      expect(timeline).toHaveLength(1);
      expect(timeline[0].authorType).toBe("system");
      expect(timeline[0].toStatus).toBe("DETECTADO");
      expect(timeline[0].message).toBe("OOMKilled detected by local monitor");
    });

    it("updates non-status metadata without altering status or closedAt", () => {
      const created = repo.createIncident({
        clusterId: "cluster-1",
        namespace: "default",
        title: "Initial Title",
        severity: "low",
        creator: humanOperator,
      });

      const updated = repo.updateIncidentMetadata(created.id, {
        title: "Updated Title",
        description: "Added description",
        severity: "high",
        isPinned: true,
      });

      expect(updated.title).toBe("Updated Title");
      expect(updated.description).toBe("Added description");
      expect(updated.severity).toBe("high");
      expect(updated.status).toBe("DETECTADO"); // Status untouched
      expect(updated.isPinned).toBe(true);
    });
  });

  describe("Atomic State Transitions (H8-006)", () => {
    it("executes valid state transitions updating both incident status and timeline atomically", () => {
      const incident = repo.createIncident({
        clusterId: "c1",
        namespace: "prod",
        title: "Database latency spike",
        severity: "high",
        creator: systemDetector,
      });

      // 1. DETECTADO -> INVESTIGANDO
      const step1 = repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "INVESTIGANDO",
        actor: humanOperator,
        justification: "Operator acknowledging alert and opening investigation",
      });

      expect(step1.incident.status).toBe("INVESTIGANDO");
      expect(step1.timelineEvent.fromStatus).toBe("DETECTADO");
      expect(step1.timelineEvent.toStatus).toBe("INVESTIGANDO");

      // 2. INVESTIGANDO -> HIPÓTESIS
      const step2 = repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "HIPÓTESIS",
        actor: aiAssistant,
        justification: "Hypothesis: connection pool exhausted by unindexed query",
      });

      expect(step2.incident.status).toBe("HIPÓTESIS");
      expect(step2.timelineEvent.authorType).toBe("ai");

      // Verify timeline count
      const timeline = repo.getTimelineEvents(incident.id);

      expect(timeline).toHaveLength(3); // Creation + Step 1 + Step 2
    });

    it("enforces evidence verification when transitioning to CONFIRMADO", () => {
      const incident = repo.createIncident({
        clusterId: "c1",
        namespace: "prod",
        title: "Memory leak",
        severity: "high",
        creator: humanOperator,
      });

      repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "INVESTIGANDO",
        actor: humanOperator,
        justification: "Starting memory profiler",
      });

      // Attempt CONFIRMADO with no evidence -> Must throw
      expect(() => {
        repo.transitionStatus({
          incidentId: incident.id,
          toStatus: "CONFIRMADO",
          actor: humanOperator,
          justification: "Confirming without evidence",
          evidenceIds: [],
        });
      }).toThrow("se requiere al menos una evidencia comprobable vinculada al incidente");

      // Attempt CONFIRMADO with fake evidence ID -> Must throw and rollback
      expect(() => {
        repo.transitionStatus({
          incidentId: incident.id,
          toStatus: "CONFIRMADO",
          actor: humanOperator,
          justification: "Confirming with fake evidence",
          evidenceIds: ["EVD-FAKE-NONEXISTENT"],
        });
      }).toThrow("Evidencia no válida o perteneciente a otro incidente: [EVD-FAKE-NONEXISTENT]");

      // Add real evidence to incident
      const evidence = repo.addEvidence({
        incidentId: incident.id,
        type: "pod_logs",
        origin: "kubetail",
        clusterId: "c1",
        namespace: "prod",
        contentSnippet: "OutOfMemoryError: Java heap space",
      });

      // Now transition with valid evidence succeeds
      const confirmed = repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "CONFIRMADO",
        actor: humanOperator,
        justification: "OOM heap dump log confirms memory leak in JVM",
        evidenceIds: [evidence.id],
      });

      expect(confirmed.incident.status).toBe("CONFIRMADO");
      expect(confirmed.timelineEvent.metadata?.evidenceIds).toContain(evidence.id);
    });

    it("rejects evidence belonging to another incident", () => {
      const incidentA = repo.createIncident({
        clusterId: "c1",
        namespace: "ns",
        title: "Incident A",
        severity: "medium",
        creator: humanOperator,
      });

      const incidentB = repo.createIncident({
        clusterId: "c1",
        namespace: "ns",
        title: "Incident B",
        severity: "medium",
        creator: humanOperator,
      });

      // Add evidence to Incident B
      const evidenceOfB = repo.addEvidence({
        incidentId: incidentB.id,
        type: "k8s_event",
        origin: "k8s",
        clusterId: "c1",
        namespace: "ns",
        contentSnippet: "BackOff restarting failed container",
      });

      repo.transitionStatus({
        incidentId: incidentA.id,
        toStatus: "INVESTIGANDO",
        actor: humanOperator,
        justification: "Investigating Incident A",
      });

      // Attempt to confirm Incident A using evidence belonging to Incident B
      expect(() => {
        repo.transitionStatus({
          incidentId: incidentA.id,
          toStatus: "CONFIRMADO",
          actor: humanOperator,
          justification: "Trying to use Incident B evidence",
          evidenceIds: [evidenceOfB.id],
        });
      }).toThrow(`Evidencia no válida o perteneciente a otro incidente: [${evidenceOfB.id}]`);

      // Verify Incident A remains in INVESTIGANDO and no timeline was written
      const fetchedA = repo.getIncidentById(incidentA.id);

      expect(fetchedA?.status).toBe("INVESTIGANDO");
      expect(repo.getTimelineEvents(incidentA.id)).toHaveLength(2); // Creation + INVESTIGANDO
    });

    it("enforces human-only approval and prevents AI self-approval", () => {
      const incident = repo.createIncident({
        clusterId: "c1",
        namespace: "ns",
        title: "Fix proposal test",
        severity: "medium",
        creator: humanOperator,
      });

      const evidence = repo.addEvidence({
        incidentId: incident.id,
        type: "resource_manifest",
        origin: "kubectl",
        clusterId: "c1",
        namespace: "ns",
        contentSnippet: "memory limit: 128Mi",
      });

      repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "INVESTIGANDO",
        actor: humanOperator,
        justification: "Investigating",
      });

      repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "CONFIRMADO",
        actor: humanOperator,
        justification: "Confirmed via resource limit",
        evidenceIds: [evidence.id],
      });

      repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "SOLUCIÓN PROPUESTA",
        actor: aiAssistant,
        justification: "AI proposed memory limit increase to 512Mi",
      });

      // AI attempting APROBACIÓN HUMANA -> Must throw
      expect(() => {
        repo.transitionStatus({
          incidentId: incident.id,
          toStatus: "APROBACIÓN HUMANA",
          actor: aiAssistant,
          justification: "AI attempting self approval",
        });
      }).toThrow("la IA o el sistema no pueden auto-aprobar soluciones. Se requiere un operador humano.");

      // Human operator approving -> Succeeds
      const approved = repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "APROBACIÓN HUMANA",
        actor: humanOperator,
        justification: "Operator inspected diff and verified quota availability",
      });

      expect(approved.incident.status).toBe("APROBACIÓN HUMANA");
    });

    it("handles closing and explicit reopening with closedAt tracking", () => {
      const incident = repo.createIncident({
        clusterId: "c1",
        namespace: "ns",
        title: "Lifecycle close/reopen",
        severity: "low",
        creator: humanOperator,
      });

      // Fast-track false positive: DETECTADO -> NO CONFIRMADO -> CERRADO
      repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "NO CONFIRMADO",
        actor: humanOperator,
        justification: "False alarm: transient network glitch during rolling update",
      });

      const closed = repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "CERRADO",
        actor: humanOperator,
        justification: "Closing verified false positive",
      });

      expect(closed.incident.status).toBe("CERRADO");
      expect(closed.incident.closedAt).toBeDefined();

      // Attempt reopening by AI -> Must throw
      expect(() => {
        repo.transitionStatus({
          incidentId: incident.id,
          toStatus: "INVESTIGANDO",
          actor: aiAssistant,
          justification: "AI reopening automatically",
        });
      }).toThrow("solo un operador humano puede reabrir un incidente cerrado.");

      // Attempt reopening with short justification -> Must throw
      expect(() => {
        repo.transitionStatus({
          incidentId: incident.id,
          toStatus: "INVESTIGANDO",
          actor: humanOperator,
          justification: "Reopen",
        });
      }).toThrow("se requiere una justificación sustantiva de al menos 10 caracteres");

      // Reopening by human with substantive justification -> Succeeds
      const reopened = repo.transitionStatus({
        incidentId: incident.id,
        toStatus: "INVESTIGANDO",
        actor: humanOperator,
        justification: "Issue recurred during high load test, reopening case.",
      });

      expect(reopened.incident.status).toBe("INVESTIGANDO");
      expect(reopened.incident.closedAt).toBeUndefined(); // Cleared on reopen!

      const timeline = repo.getTimelineEvents(incident.id);
      const lastEvent = timeline[timeline.length - 1];

      expect(lastEvent.fromStatus).toBe("CERRADO");
      expect(lastEvent.toStatus).toBe("INVESTIGANDO");
      expect(lastEvent.authorName).toBe("SRE Lead");
    });

    it("guarantees complete rollback if any step in transition fails", () => {
      const incident = repo.createIncident({
        clusterId: "c1",
        namespace: "ns",
        title: "Rollback test",
        severity: "medium",
        creator: humanOperator,
      });

      // Attempt invalid transition jump DETECTADO -> VALIDACIÓN
      expect(() => {
        repo.transitionStatus({
          incidentId: incident.id,
          toStatus: "VALIDACIÓN",
          actor: humanOperator,
          justification: "Invalid jump",
        });
      }).toThrow();

      // Check that incident status is STILL DETECTADO and NO extra timeline event was committed
      const fetched = repo.getIncidentById(incident.id);

      expect(fetched?.status).toBe("DETECTADO");

      const timeline = repo.getTimelineEvents(incident.id);

      expect(timeline).toHaveLength(1); // Only initial creation event
    });
  });

  describe("Filtering & Pinning", () => {
    it("lists incidents prioritising pinned items and respecting status filters", () => {
      const inc1 = repo.createIncident({
        clusterId: "c1",
        namespace: "ns-a",
        title: "Inc 1",
        severity: "low",
        isPinned: false,
        creator: humanOperator,
      });

      const inc2 = repo.createIncident({
        clusterId: "c1",
        namespace: "ns-a",
        title: "Inc 2 Pinned",
        severity: "critical",
        isPinned: true,
        creator: humanOperator,
      });

      repo.transitionStatus({
        incidentId: inc1.id,
        toStatus: "INVESTIGANDO",
        actor: humanOperator,
        justification: "Start investigating 1",
      });

      const investigatingList = repo.listIncidents({ status: "INVESTIGANDO" });

      expect(investigatingList).toHaveLength(1);
      expect(investigatingList[0].id).toBe(inc1.id);

      const all = repo.listIncidents();

      expect(all[0].id).toBe(inc2.id); // Pinned first
    });
  });
});
