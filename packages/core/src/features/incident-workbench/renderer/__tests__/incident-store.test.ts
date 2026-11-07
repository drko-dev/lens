/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { IncidentStore } from "../incident-store";
import { incidentIpcChannels } from "../../../../common/incident/incident-ipc";
import type { Incident, TimelineEvent, EvidenceSnippet } from "../../../../common/incident/incident-types";

describe("IncidentStore (H8-007)", () => {
  let mockIpc: { invoke: jest.Mock };
  let store: IncidentStore;

  const mockIncident: Incident = {
    id: "INC-001",
    clusterId: "c1",
    namespace: "prod",
    workloadKind: "Pod",
    workloadName: "api-gateway",
    title: "CrashLoopBackOff en API Gateway",
    description: "Memoria saturada por OOMKilled",
    severity: "critical",
    status: "DETECTADO",
    isPinned: false,
    createdAt: "2026-11-05T10:00:00Z",
    updatedAt: "2026-11-05T10:00:00Z",
  };

  const mockTimelineEvent: TimelineEvent = {
    id: "EVT-1",
    incidentId: "INC-001",
    timestamp: "2026-11-05T10:00:00Z",
    authorType: "system",
    authorName: "prometheus",
    fromStatus: undefined,
    toStatus: "DETECTADO",
    message: "Incidente detectado automáticamente",
  };

  const mockEvidence: EvidenceSnippet = {
    id: "EVD-1",
    incidentId: "INC-001",
    type: "pod_logs",
    origin: "kubectl logs",
    clusterId: "c1",
    namespace: "prod",
    capturedAt: "2026-11-05T10:00:00Z",
    contentSnippet: "Killed process 1234 (node) total-vm:2048MB",
    sha256Hash: "hash123",
    snippetBytes: 42,
    fingerprint: "fp123",
  };

  beforeEach(() => {
    mockIpc = {
      invoke: jest.fn(async (channel: string, ...args: any[]) => {
        switch (channel) {
          case incidentIpcChannels.list:
            return [mockIncident];
          case incidentIpcChannels.getTimeline:
            return [mockTimelineEvent];
          case incidentIpcChannels.getEvidence:
            return [mockEvidence];
          case incidentIpcChannels.create:
            return {
              ...mockIncident,
              id: "INC-002",
              title: args[0].title,
            };
          case incidentIpcChannels.transition:
            return {
              incident: { ...mockIncident, status: args[0].toStatus },
              timelineEvent: {
                id: "EVT-2",
                incidentId: mockIncident.id,
                timestamp: "2026-11-05T10:05:00Z",
                authorType: args[0].actor.type,
                authorName: args[0].actor.name,
                fromStatus: mockIncident.status,
                toStatus: args[0].toStatus,
                message: args[0].reason,
              },
            };
          case incidentIpcChannels.update:
            return { ...mockIncident, ...args[1] };
          case incidentIpcChannels.getRetentionPolicy:
            return {
              id: "default",
              enabled: false,
              strategy: "manual",
              retentionDays: 90,
              protectPinned: true,
              purgeClosedOnly: true,
              evidenceRetentionDays: null,
              lastEvaluatedAt: null,
              updatedAt: "2026-11-05T10:00:00Z",
            };
          case incidentIpcChannels.setRetentionPolicy:
            return {
              id: "default",
              enabled: args[0].enabled ?? false,
              strategy: args[0].strategy ?? "manual",
              retentionDays: args[0].retentionDays ?? 90,
              protectPinned: args[0].protectPinned ?? true,
              purgeClosedOnly: args[0].purgeClosedOnly ?? true,
              evidenceRetentionDays: args[0].evidenceRetentionDays ?? null,
              lastEvaluatedAt: null,
              updatedAt: "2026-11-05T10:01:00Z",
            };
          case incidentIpcChannels.previewPurge:
            return {
              policy: {
                id: "default",
                enabled: true,
                strategy: "days",
                retentionDays: 30,
                protectPinned: true,
                purgeClosedOnly: true,
                updatedAt: "2026-11-05T10:01:00Z",
              },
              candidateIncidentCount: 1,
              protectedIncidentCount: 0,
              candidateEvidenceCount: 2,
              candidateReclaimableBytes: 4096,
              candidateIncidentIds: ["INC-001"],
              candidateEvidenceIds: [],
            };
          case incidentIpcChannels.executePurge:
          case incidentIpcChannels.executeManualPurge:
          case incidentIpcChannels.executeAutomaticPurge:
            return {
              success: true,
              deletedIncidentCount: 1,
              deletedTimelineCount: 1,
              deletedEvidenceCount: 2,
              reclaimedBytes: 4096,
              executedAt: "2026-11-05T10:02:00Z",
            };
          default:
            return null;
        }
      }),
    };

    store = new IncidentStore(mockIpc);
  });

  it("loads incidents and computes stats accurately", async () => {
    await store.loadIncidents();

    expect(store.incidents).toHaveLength(1);
    expect(store.stats.total).toBe(1);
    expect(store.stats.critical).toBe(1);
    expect(store.stats.active).toBe(1);
  });

  it("filters incidents by search query, status, severity and namespace", async () => {
    await store.loadIncidents();

    store.setSearchQuery("Gateway");
    expect(store.filteredIncidents).toHaveLength(1);

    store.setSearchQuery("non-existent");
    expect(store.filteredIncidents).toHaveLength(0);

    store.setSearchQuery("");
    store.setStatusFilter("CERRADO");
    expect(store.filteredIncidents).toHaveLength(0);

    store.setStatusFilter("DETECTADO");
    expect(store.filteredIncidents).toHaveLength(1);

    store.setSeverityFilter("low");
    expect(store.filteredIncidents).toHaveLength(0);

    store.setSeverityFilter("critical");
    expect(store.filteredIncidents).toHaveLength(1);
  });

  it("selects an incident and retrieves timeline and evidence in parallel", async () => {
    await store.loadIncidents();
    await store.selectIncident("INC-001");

    expect(store.activeIncidentId).toBe("INC-001");
    expect(store.activeIncident?.title).toBe("CrashLoopBackOff en API Gateway");
    expect(store.activeIncidentTimeline).toHaveLength(1);
    expect(store.activeIncidentEvidence).toHaveLength(1);
  });

  it("creates a new incident, prepends it and selects it", async () => {
    const created = await store.createIncident({
      title: "Nuevo Incidente Manual",
      clusterId: "c1",
      namespace: "default",
      severity: "medium",
    });

    expect(created?.id).toBe("INC-002");
    expect(store.incidents[0].id).toBe("INC-002");
    expect(store.activeIncidentId).toBe("INC-002");
  });

  it("executes status transition and updates timeline reactively", async () => {
    await store.loadIncidents();
    await store.selectIncident("INC-001");

    const success = await store.transitionStatus({
      toStatus: "INVESTIGANDO",
      reason: "Iniciando análisis de telemetría",
      actor: { type: "human", name: "operator" },
    });

    expect(success).toBe(true);
    expect(store.activeIncident?.status).toBe("INVESTIGANDO");
    expect(store.activeIncidentTimeline).toHaveLength(2);
    expect(store.activeIncidentTimeline[1].toStatus).toBe("INVESTIGANDO");
  });

  it("toggles incident pin state", async () => {
    await store.loadIncidents();
    await store.togglePin("INC-001");

    expect(mockIpc.invoke).toHaveBeenCalledWith(
      incidentIpcChannels.update,
      "INC-001",
      { isPinned: true },
    );
    expect(store.incidents[0].isPinned).toBe(true);
  });

  it("loads, updates retention policy and triggers purge preview and execution", async () => {
    const policy = await store.loadRetentionPolicy();
    expect(policy?.enabled).toBe(false);
    expect(policy?.strategy).toBe("manual");
    expect(store.retentionPolicy?.enabled).toBe(false);

    const saved = await store.saveRetentionPolicy({
      enabled: true,
      strategy: "days",
      retentionDays: 30,
    });
    expect(saved?.enabled).toBe(true);
    expect(saved?.retentionDays).toBe(30);
    expect(store.retentionPolicy?.retentionDays).toBe(30);

    const preview = await store.previewPurge();
    expect(preview?.candidateIncidentCount).toBe(1);
    expect(store.purgePreview?.candidateReclaimableBytes).toBe(4096);

    const execResult = await store.executeManualPurge(["INC-001"]);
    expect(execResult?.success).toBe(true);
    expect(execResult?.deletedIncidentCount).toBe(1);
  });
});
