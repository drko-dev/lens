/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { NonInjectedIncidentWorkbenchPanel } from "../incident-workbench-panel";
import { IncidentStore } from "../incident-store";
import type { Incident, TimelineEvent, EvidenceSnippet } from "../../../../common/incident/incident-types";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { type DiRender, renderFor } from "../../../../renderer/components/test-utils/renderFor";

describe("IncidentWorkbenchPanel (H8-007)", () => {
  let mockIpc: { invoke: jest.Mock };
  let store: IncidentStore;
  let render: DiRender;

  const mockIncident: Incident = {
    id: "INC-100",
    clusterId: "c-prod",
    namespace: "payments",
    workloadKind: "Pod",
    workloadName: "pay-api",
    title: "Latencia elevada y reinicios continuos",
    description: "Servicio responde con HTTP 504",
    severity: "critical",
    status: "DETECTADO",
    isPinned: false,
    createdAt: "2026-11-05T10:00:00Z",
    updatedAt: "2026-11-05T10:00:00Z",
  };

  const mockTimelineEvent: TimelineEvent = {
    id: "EVT-100",
    incidentId: "INC-100",
    timestamp: "2026-11-05T10:00:00Z",
    authorType: "system",
    authorName: "alertmanager",
    fromStatus: undefined,
    toStatus: "DETECTADO",
    message: "Alerta crítica disparada",
  };

  const mockEvidence: EvidenceSnippet = {
    id: "EVD-100",
    incidentId: "INC-100",
    type: "pod_logs",
    origin: "kubectl logs",
    clusterId: "c-prod",
    namespace: "payments",
    capturedAt: "2026-11-05T10:00:00Z",
    contentSnippet: "Database connection timeout after 30000ms",
    sha256Hash: "abcd1234efgh5678",
    snippetBytes: 41,
    fingerprint: "fp-100",
  };

  beforeEach(() => {
    mockIpc = {
      invoke: jest.fn(async (channel: string, ...args: any[]) => {
        if (channel.includes("get-timeline")) return [mockTimelineEvent];
        if (channel.includes("get-evidence")) return [mockEvidence];
        if (channel.includes("transition")) {
          return {
            incident: { ...mockIncident, status: args[0].toStatus },
            timelineEvent: {
              id: "EVT-101",
              incidentId: mockIncident.id,
              timestamp: "2026-11-05T10:05:00Z",
              authorType: "human",
              authorName: "operator",
              fromStatus: mockIncident.status,
              toStatus: args[0].toStatus,
              message: args[0].reason,
            },
          };
        }
        if (channel.includes("ingest-evidence")) {
          return {
            evidence: mockEvidence,
            isDuplicate: false,
          };
        }

        return null;
      }),
    };

    store = new IncidentStore(mockIpc);
    const di = getDiForUnitTesting();
    render = renderFor(di);
  });

  it("renders empty state when no incident is active", () => {
    render(<NonInjectedIncidentWorkbenchPanel store={store} />);

    expect(screen.getByTestId("incident-workbench-empty")).toBeInTheDocument();
    expect(screen.getByText("Ningún incidente seleccionado para diagnóstico.")).toBeInTheDocument();
  });

  it("renders incident details, badges, and tabs when active incident exists", async () => {
    store.incidents = [mockIncident];
    store.activeIncidentId = mockIncident.id;
    store.activeIncidentTimeline = [mockTimelineEvent];
    store.activeIncidentEvidence = [mockEvidence];

    render(<NonInjectedIncidentWorkbenchPanel store={store} />);

    expect(screen.getByTestId("incident-workbench-panel")).toBeInTheDocument();
    expect(screen.getByText("INC-100")).toBeInTheDocument();
    expect(screen.getByText("Latencia elevada y reinicios continuos")).toBeInTheDocument();
    expect(screen.getByText("DETECTADO")).toBeInTheDocument();
  });

  it("switches tabs between Diagnostic, Evidence, and Timeline", async () => {
    store.incidents = [mockIncident];
    store.activeIncidentId = mockIncident.id;
    store.activeIncidentTimeline = [mockTimelineEvent];
    store.activeIncidentEvidence = [mockEvidence];

    render(<NonInjectedIncidentWorkbenchPanel store={store} />);

    // Default tab is diagnostic
    expect(screen.getByText("Descripción del Incidente")).toBeInTheDocument();

    // Switch to Evidence
    fireEvent.click(screen.getByTestId("tab-evidence"));
    expect(screen.getByText(/Fragmentos de telemetría y observaciones/)).toBeInTheDocument();
    expect(screen.getByText("Database connection timeout after 30000ms")).toBeInTheDocument();

    // Switch to Timeline
    fireEvent.click(screen.getByTestId("tab-timeline"));
    expect(screen.getByText("alertmanager (system)")).toBeInTheDocument();
    expect(screen.getByText("Alerta crítica disparada")).toBeInTheDocument();
  });

  it("opens transition modal, validates justification, and executes transition", async () => {
    store.incidents = [mockIncident];
    store.activeIncidentId = mockIncident.id;
    store.activeIncidentTimeline = [mockTimelineEvent];
    store.activeIncidentEvidence = [mockEvidence];

    render(<NonInjectedIncidentWorkbenchPanel store={store} />);

    // Click transition button to INVESTIGANDO
    const transitionBtn = screen.getByTestId("transition-to-INVESTIGANDO");
    fireEvent.click(transitionBtn);

    expect(screen.getByText("Transición a INVESTIGANDO")).toBeInTheDocument();

    // Confirm button is disabled when justification is empty
    const confirmBtn = screen.getByTestId("confirm-transition-btn");
    expect(confirmBtn).toBeDisabled();

    // Enter valid justification
    const input = screen.getByTestId("transition-justification-input");
    fireEvent.change(input, { target: { value: "Revisando métricas de latencia de red" } });

    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockIpc.invoke).toHaveBeenCalled();
    });
  });
});
