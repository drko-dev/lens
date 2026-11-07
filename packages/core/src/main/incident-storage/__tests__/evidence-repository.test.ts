/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../sqlite-client";
import { ALL_MIGRATIONS } from "../migrations";
import { IncidentRepository } from "../incident-repository";
import { EvidenceRepository } from "../evidence-repository";
import type { IncidentActor } from "../../../common/incident/incident-types";

describe("EvidenceRepository (H8-008)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;

  const testActor: IncidentActor = {
    type: "human",
    id: "user:sre",
    name: "SRE Operator",
  };

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();
    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo, {
      maxQuotaBytes: 128 * 1024, // 128 KiB de cuota de prueba
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("Ingesta, Sanitización y Persistencia", () => {
    it("ingesta y sanitiza logs de Pod eliminando credenciales antes de persistir", () => {
      const incident = incidentRepo.createIncident({
        clusterId: "cluster-alpha",
        namespace: "production",
        title: "Auth failure in gateway",
        severity: "high",
        creator: testActor,
      });

      const rawLog = "2026-11-05 [ERROR] Failed login for user: Authorization: Bearer secret-token-xyz-123456";
      const result = evidenceRepo.ingestEvidence({
        incidentId: incident.id,
        type: "pod_logs",
        origin: "kubetail-stream",
        clusterId: "cluster-alpha",
        namespace: "production",
        resourceKind: "Pod",
        resourceName: "gateway-pod-7b",
        rawContent: rawLog,
      });

      expect(result.isDuplicate).toBe(false);
      expect(result.evidence.id).toMatch(/^EVD-/);
      expect(result.evidence.contentSnippet).toContain("Bearer [REDACTED_TOKEN]");
      expect(result.evidence.contentSnippet).not.toContain("secret-token-xyz-123456");
      expect(result.evidence.sha256Hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.evidence.snippetBytes).toBeGreaterThan(0);

      // Verificar persistencia directa en SQLite
      const retrieved = evidenceRepo.getEvidenceById(result.evidence.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.contentSnippet).toBe(result.evidence.contentSnippet);
    });

    it("bloquea la ingesta de recursos prohibidos (Secrets) arrojando error de seguridad", () => {
      const incident = incidentRepo.createIncident({
        clusterId: "c1",
        namespace: "default",
        title: "Test Forbidden",
        severity: "medium",
        creator: testActor,
      });

      expect(() => {
        evidenceRepo.ingestEvidence({
          incidentId: incident.id,
          type: "resource_manifest",
          origin: "k8s-api",
          clusterId: "c1",
          namespace: "default",
          resourceKind: "Secret",
          resourceName: "db-passwords",
          rawContent: "apiVersion: v1\nkind: Secret\ndata:\n  pwd: abc",
        });
      }).toThrow("está estrictamente prohibido como evidencia de diagnóstico");
    });
  });

  describe("Deduplicación y Versionado", () => {
    it("deduplica evidencias idénticas devolviendo la existente con isDuplicate=true", () => {
      const incident = incidentRepo.createIncident({
        clusterId: "c1",
        namespace: "default",
        title: "Deduplication Test",
        severity: "medium",
        creator: testActor,
      });

      const payload = {
        incidentId: incident.id,
        type: "k8s_event" as const,
        origin: "k8s-api",
        clusterId: "c1",
        namespace: "default",
        resourceKind: "Pod",
        resourceName: "auth-pod-1",
        resourceVersion: "12345",
        rawContent: "Warning: BackOff restarting failed container",
      };

      const first = evidenceRepo.ingestEvidence(payload);

      expect(first.isDuplicate).toBe(false);

      // Segunda ingesta del contenido idéntico
      const second = evidenceRepo.ingestEvidence(payload);

      expect(second.isDuplicate).toBe(true);
      expect(second.evidence.id).toBe(first.evidence.id); // Reutiliza ID existente
      expect(second.evidence.fingerprint).toBe(first.evidence.fingerprint);

      // Verificar que solo existe un registro en SQLite
      const list = evidenceRepo.listEvidenceByIncident(incident.id);

      expect(list).toHaveLength(1);
    });

    it("crea una nueva evidencia cuando cambia el resourceVersion o el contenido", () => {
      const incident = incidentRepo.createIncident({
        clusterId: "c1",
        namespace: "default",
        title: "Versioning Test",
        severity: "medium",
        creator: testActor,
      });

      const basePayload = {
        incidentId: incident.id,
        type: "k8s_event" as const,
        origin: "k8s-api",
        clusterId: "c1",
        namespace: "default",
        resourceKind: "Pod",
        resourceName: "auth-pod-1",
        rawContent: "Warning: BackOff restarting container",
      };

      const v1 = evidenceRepo.ingestEvidence({
        ...basePayload,
        resourceVersion: "1001",
      });

      const v2 = evidenceRepo.ingestEvidence({
        ...basePayload,
        resourceVersion: "1002", // Nueva versión
      });

      expect(v1.isDuplicate).toBe(false);
      expect(v2.isDuplicate).toBe(false);
      expect(v1.evidence.id).not.toBe(v2.evidence.id);

      const list = evidenceRepo.listEvidenceByIncident(incident.id);

      expect(list).toHaveLength(2);
      expect(list[0].resourceVersion).toBe("1001");
      expect(list[1].resourceVersion).toBe("1002");
    });
  });

  describe("Aislamiento entre Clústeres y Namespaces", () => {
    it("bloquea evidencia con clusterId incompatible con el incidente", () => {
      const incident = incidentRepo.createIncident({
        clusterId: "cluster-A",
        namespace: "prod",
        title: "Isolation Test",
        severity: "high",
        creator: testActor,
      });

      expect(() => {
        evidenceRepo.ingestEvidence({
          incidentId: incident.id,
          type: "pod_logs",
          origin: "stream",
          clusterId: "cluster-B", // Discordancia de clúster
          namespace: "prod",
          rawContent: "Some log line",
        });
      }).toThrow("el clúster de la evidencia ('cluster-B') no coincide con el clúster del caso ('cluster-A')");
    });

    it("bloquea evidencia con namespace incompatible cuando el recurso no es cluster-scoped", () => {
      const incident = incidentRepo.createIncident({
        clusterId: "cluster-A",
        namespace: "payment-ns",
        title: "Namespace Isolation Test",
        severity: "high",
        creator: testActor,
      });

      expect(() => {
        evidenceRepo.ingestEvidence({
          incidentId: incident.id,
          type: "pod_logs",
          origin: "stream",
          clusterId: "cluster-A",
          namespace: "billing-ns", // Discordancia de namespace
          resourceKind: "Pod",
          rawContent: "Some log line",
        });
      }).toThrow("el namespace de la evidencia ('billing-ns') no coincide con el namespace del caso ('payment-ns')");
    });

    it("permite recursos cluster-scoped como Node aunque el namespace difiera", () => {
      const incident = incidentRepo.createIncident({
        clusterId: "cluster-A",
        namespace: "payment-ns",
        title: "Node Evidence Test",
        severity: "high",
        creator: testActor,
      });

      const nodeEvidence = evidenceRepo.ingestEvidence({
        incidentId: incident.id,
        type: "k8s_event",
        origin: "k8s-api",
        clusterId: "cluster-A",
        namespace: "default",
        resourceKind: "Node", // Cluster-scoped
        resourceName: "node-worker-1",
        rawContent: "NodeMemoryPressure True",
      });

      expect(nodeEvidence.evidence.resourceKind).toBe("Node");
    });
  });

  describe("Cuota Acumulada de Evidencias", () => {
    it("rechaza ingesta si la cuota total acumulada del incidente es superada", () => {
      const smallQuotaRepo = new EvidenceRepository(sqlite, incidentRepo, {
        maxQuotaBytes: 1024, // 1 KiB de cuota total
      });

      const incident = incidentRepo.createIncident({
        clusterId: "c1",
        namespace: "default",
        title: "Quota Test",
        severity: "low",
        creator: testActor,
      });

      // Primer fragmento de 600 bytes
      smallQuotaRepo.ingestEvidence({
        incidentId: incident.id,
        type: "pod_logs",
        origin: "stream",
        clusterId: "c1",
        namespace: "default",
        rawContent: "X".repeat(600),
      });

      // Segundo fragmento de 600 bytes -> 1200 > 1024 bytes -> debe fallar
      expect(() => {
        smallQuotaRepo.ingestEvidence({
          incidentId: incident.id,
          type: "pod_logs",
          origin: "stream",
          clusterId: "c1",
          namespace: "default",
          resourceName: "diff",
          rawContent: "Y".repeat(600),
        });
      }).toThrow("Se ha superado la cuota máxima de evidencias para este caso");
    });
  });

  describe("Archivos de Contexto Técnico Efímeros (Agregar Contexto)", () => {
    it("persiste solo metadatos y resumen sanitizado, nunca el cuerpo original del archivo", () => {
      const incident = incidentRepo.createIncident({
        clusterId: "c1",
        namespace: "default",
        title: "Ephemeral Context Test",
        severity: "medium",
        creator: testActor,
      });

      const result = evidenceRepo.ingestUserContextMetadata({
        incidentId: incident.id,
        clusterId: "c1",
        namespace: "default",
        filename: "Dockerfile",
        fileType: "dockerfile",
        sha256Hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        userDeclaredVersion: "v1.2.0-rc",
        sanitizedFindingsSummary: "Identified non-root USER node, ENTRYPOINT runs node server.js with Bearer tokenXYZ987",
        metadata: { lineCount: 42 },
      });

      expect(result.evidence.type).toBe("user_context_metadata");
      expect(result.evidence.contentSnippet).toContain("Contexto técnico aportado manualmente: Dockerfile");
      expect(result.evidence.contentSnippet).toContain("Bearer [REDACTED_TOKEN]"); // Sanitizado
      expect(result.evidence.contentSnippet).not.toContain("tokenXYZ987");
      expect(result.evidence.metadata?.filename).toBe("Dockerfile");
      expect(result.evidence.metadata?.userDeclaredVersion).toBe("v1.2.0-rc");
    });
  });

  describe("Integración con Máquina de Estados (H8-006)", () => {
    it("permite confirmar un incidente con evidencia ingestada y deduplicada", () => {
      const incident = incidentRepo.createIncident({
        clusterId: "c1",
        namespace: "prod",
        title: "State Machine Integration",
        severity: "critical",
        creator: testActor,
      });

      const ingested = evidenceRepo.ingestEvidence({
        incidentId: incident.id,
        type: "pod_logs",
        origin: "kubetail",
        clusterId: "c1",
        namespace: "prod",
        rawContent: "OutOfMemoryKilled process 1234",
      });

      incidentRepo.transitionStatus({
        incidentId: incident.id,
        toStatus: "INVESTIGANDO",
        actor: testActor,
        justification: "Investigating pod logs",
      });

      const confirmed = incidentRepo.transitionStatus({
        incidentId: incident.id,
        toStatus: "CONFIRMADO",
        actor: testActor,
        justification: "OOMKilled log line proves root cause",
        evidenceIds: [ingested.evidence.id],
      });

      expect(confirmed.incident.status).toBe("CONFIRMADO");
      expect(confirmed.timelineEvent.metadata?.evidenceIds).toContain(ingested.evidence.id);
    });
  });
});
