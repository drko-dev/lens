/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { IncidentStore } from "../incident-store";
import { incidentIpcChannels } from "../../../../common/incident/incident-ipc";
import type { Incident } from "../../../../common/incident/incident-types";

describe("Incident Workbench: Window & Cluster Isolation (H8.8-05-R3)", () => {
  let mockIpc: { invoke: jest.Mock };
  let store: IncidentStore;

  const incidentAlpha: Incident = {
    id: "INC-ALPHA-001",
    clusterId: "cluster-alpha",
    namespace: "production",
    workloadKind: "Deployment",
    workloadName: "checkout-service",
    title: "CrashLoopBackOff en checkout-service",
    severity: "critical",
    status: "INVESTIGANDO",
    isPinned: false,
    createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
  };

  const incidentBeta: Incident = {
    id: "INC-BETA-002",
    clusterId: "cluster-beta",
    namespace: "staging",
    workloadKind: "Pod",
    workloadName: "auth-worker",
    title: "OOMKilled en auth-worker",
    severity: "high",
    status: "DETECTADO",
    isPinned: false,
    createdAt: "2026-11-08T10:05:00Z",
    updatedAt: "2026-11-08T10:05:00Z",
  };

  beforeEach(() => {
    mockIpc = {
      invoke: jest.fn(async (channel: string, ...args: any[]) => {
        switch (channel) {
          case incidentIpcChannels.list: {
            const filter = args[0] || {};
            if (filter.clusterId === "cluster-alpha") {
              return [incidentAlpha];
            }
            if (filter.clusterId === "cluster-beta") {
              return [incidentBeta];
            }
            return [];
          }
          case incidentIpcChannels.getTimeline:
            return [];
          case incidentIpcChannels.getEvidence:
            return [];
          case incidentIpcChannels.contextList:
            return [];
          case incidentIpcChannels.create:
            return {
              id: "INC-NEW-003",
              ...args[0],
              status: "DETECTADO",
              isPinned: false,
              createdAt: "2026-11-08T10:10:00Z",
              updatedAt: "2026-11-08T10:10:00Z",
            };
          case incidentIpcChannels.ingestEvidence:
            return {
              evidenceId: "EVD-NEW-001",
              incidentId: args[0].incidentId,
              isDuplicate: false,
            };
          case incidentIpcChannels.scannerStart:
            return {
              isEnabled: true,
              activeWatchersCount: 1,
              scanCount: 1,
              signalsDetectedCount: 0,
              deduplicatedCount: 0,
              incidentsCreatedCount: 0,
              dismissedCount: 0,
              snoozedCount: 0,
            };
          case incidentIpcChannels.aiPrepareConsent:
            return {
              consentToken: "valid-single-use-token-qa",
              incidentId: args[0].incidentId,
              profileId: args[0].profileId,
              redactedPayloadPreview: "sanitized telemetry",
              expiresAt: new Date(Date.now() + 60000).toISOString(),
            };
          case incidentIpcChannels.aiExecuteDiagnosis:
            return {
              id: "DIAG-001",
              incidentId: args[0].incidentId,
              profileId: args[0].profileId,
              status: "CONCLUSIVO",
              hypotheses: [],
              citations: [],
              verifiedCitationsCount: 0,
              createdAt: new Date().toISOString(),
            };
          default:
            return null;
        }
      }),
    };

    store = new IncidentStore(mockIpc);
  });

  describe("1. Pérdida de Contexto (Context Loss) — Fail-Closed", () => {
    it("denies loadIncidents fail-closed when no cluster context is authorized for window", async () => {
      expect(store.activeClusterId).toBeNull();

      await expect(store.loadIncidents()).rejects.toThrow(
        /SecurityError: No authorized cluster context found for this window.*loadIncidents/,
      );
      expect(store.error).toContain("No authorized cluster context");
      expect(mockIpc.invoke).not.toHaveBeenCalled();
    });

    it("denies createIncident fail-closed when no cluster context exists", async () => {
      await expect(
        store.createIncident({
          title: "Intento sin contexto",
          clusterId: "cluster-alpha",
          namespace: "default",
          severity: "low",
        }),
      ).rejects.toThrow(/SecurityError: No authorized cluster context found for this window.*createIncident/);
      expect(mockIpc.invoke).not.toHaveBeenCalled();
    });

    it("denies ingestEvidence fail-closed when no cluster context exists", async () => {
      await expect(
        store.ingestEvidence({
          incidentId: "INC-ALPHA-001",
          type: "pod_logs",
          origin: "kubectl logs",
          title: "Logs",
          rawContent: "error log",
          clusterId: "cluster-alpha",
          namespace: "default",
        }),
      ).rejects.toThrow(/SecurityError: No authorized cluster context found for this window.*ingestEvidence/);
      expect(mockIpc.invoke).not.toHaveBeenCalled();
    });

    it("denies startScanner fail-closed when no cluster context exists", async () => {
      await expect(
        store.startScanner({
          clusterId: "cluster-alpha",
          namespace: "default",
        }),
      ).rejects.toThrow(/SecurityError: No authorized cluster context found for this window.*startScanner/);
      expect(mockIpc.invoke).not.toHaveBeenCalled();
    });

    it("denies prepareConsentPreview fail-closed when no cluster context exists", async () => {
      await expect(
        store.prepareConsentPreview("INC-ALPHA-001", "mock-profile"),
      ).rejects.toThrow(/SecurityError: No authorized cluster context found for this window.*prepareConsentPreview/);
      expect(mockIpc.invoke).not.toHaveBeenCalled();
    });

    it("denies executeDiagnosis fail-closed when no cluster context exists", async () => {
      await expect(
        store.executeDiagnosis("INC-ALPHA-001", "mock-profile", "token-xyz"),
      ).rejects.toThrow(/SecurityError: No authorized cluster context found for this window.*executeDiagnosis/);
      expect(mockIpc.invoke).not.toHaveBeenCalled();
    });
  });

  describe("2. Suplantación de Cluster (ClusterId Spoofing)", () => {
    beforeEach(() => {
      store.setActiveClusterContext("cluster-alpha", "production");
    });

    it("detects and blocks clusterId mismatch in loadIncidents filter", async () => {
      await expect(
        store.loadIncidents({ clusterId: "cluster-beta" }),
      ).rejects.toThrow(
        /SecurityError: Claimed clusterId 'cluster-beta' does not match active window cluster 'cluster-alpha'. Cross-cluster spoofing detected./,
      );
      expect(mockIpc.invoke).not.toHaveBeenCalled();
    });

    it("detects and blocks clusterId spoofing in createIncident input", async () => {
      await expect(
        store.createIncident({
          title: "Spoofed Incident",
          clusterId: "cluster-beta",
          namespace: "staging",
          severity: "high",
        }),
      ).rejects.toThrow(
        /SecurityError: Claimed clusterId 'cluster-beta' does not match active window cluster 'cluster-alpha'. Cross-cluster spoofing detected./,
      );
      expect(mockIpc.invoke).not.toHaveBeenCalled();
    });

    it("detects and blocks clusterId spoofing in ingestEvidence input", async () => {
      await expect(
        store.ingestEvidence({
          incidentId: "INC-ALPHA-001",
          type: "pod_logs",
          origin: "kubectl logs",
          title: "Malicious Injection",
          rawContent: "payload",
          clusterId: "cluster-rogue-666",
          namespace: "production",
        }),
      ).rejects.toThrow(
        /SecurityError: Claimed clusterId 'cluster-rogue-666' does not match active window cluster 'cluster-alpha'/,
      );
      expect(mockIpc.invoke).not.toHaveBeenCalled();
    });

    it("detects and blocks clusterId spoofing in startScanner scope", async () => {
      await expect(
        store.startScanner({
          clusterId: "cluster-beta",
          namespace: "staging",
        }),
      ).rejects.toThrow(
        /SecurityError: Claimed clusterId 'cluster-beta' does not match active window cluster 'cluster-alpha'/,
      );
      expect(mockIpc.invoke).not.toHaveBeenCalled();
    });
  });

  describe("3. Aislamiento Cross-Cluster y Purga de Estado entre Ventanas", () => {
    it("strictly isolates incidents between clusters and purges cached state on switch", async () => {
      // 1. Authorize window for cluster-alpha
      store.setActiveClusterContext("cluster-alpha");
      await store.loadIncidents();
      expect(store.incidents).toHaveLength(1);
      expect(store.incidents[0].id).toBe("INC-ALPHA-001");

      // Select active incident in cluster-alpha
      await store.selectIncident("INC-ALPHA-001");
      expect(store.activeIncidentId).toBe("INC-ALPHA-001");

      // 2. Switch context to cluster-beta (simulates window context change or navigation)
      store.setActiveClusterContext("cluster-beta");
      expect(store.incidents).toHaveLength(0);
      expect(store.activeIncidentId).toBeNull();
      expect(store.activeIncidentTimeline).toHaveLength(0);
      expect(store.activeIncidentEvidence).toHaveLength(0);

      // 3. Load incidents for cluster-beta
      await store.loadIncidents();
      expect(store.incidents).toHaveLength(1);
      expect(store.incidents[0].id).toBe("INC-BETA-002");
    });

    it("denies selecting an incident that belongs to a different cluster", async () => {
      store.setActiveClusterContext("cluster-alpha");
      await store.loadIncidents();

      // Manually push foreign incident to store simulation
      store.incidents.push(incidentBeta);

      await expect(
        store.selectIncident(incidentBeta.id),
      ).rejects.toThrow(
        /SecurityError: Incident 'INC-BETA-002' does not belong to active cluster 'cluster-alpha'/,
      );
      expect(store.activeIncidentId).toBeNull();
    });
  });

  describe("4. Ámbito de Consentimiento de IA y Ejecución de Diagnósticos", () => {
    beforeEach(() => {
      store.setActiveClusterContext("cluster-alpha");
    });

    it("prevents preparing AI consent preview for cross-cluster incident", async () => {
      store.incidents = [incidentBeta];

      await expect(
        store.prepareConsentPreview(incidentBeta.id, "mock-profile"),
      ).rejects.toThrow(
        /SecurityError: Incident 'INC-BETA-002' belongs to cluster 'cluster-beta' which mismatches active cluster 'cluster-alpha'/,
      );
      expect(mockIpc.invoke).not.toHaveBeenCalledWith(incidentIpcChannels.aiPrepareConsent, expect.anything());
    });

    it("prevents executing AI diagnosis for cross-cluster incident", async () => {
      store.incidents = [incidentBeta];

      await expect(
        store.executeDiagnosis(incidentBeta.id, "mock-profile", "valid-token-xyz"),
      ).rejects.toThrow(
        /SecurityError: Incident 'INC-BETA-002' belongs to cluster 'cluster-beta' which mismatches active cluster 'cluster-alpha'/,
      );
      expect(mockIpc.invoke).not.toHaveBeenCalledWith(incidentIpcChannels.aiExecuteDiagnosis, expect.anything());
    });

    it("permits AI consent preview and diagnosis when incident matches active cluster", async () => {
      store.incidents = [incidentAlpha];
      store.activeIncidentId = incidentAlpha.id;

      const preview = await store.prepareConsentPreview(incidentAlpha.id, "mock-profile");
      expect(preview).toBeDefined();
      expect(preview?.consentToken).toBe("valid-single-use-token-qa");

      const diagnosis = await store.executeDiagnosis(incidentAlpha.id, "mock-profile", preview!.consentToken);
      expect(diagnosis).toBeDefined();
      expect(diagnosis?.status).toBe("CONCLUSIVO");
    });
  });
});
