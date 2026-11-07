/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { NonInjectedIncidentListView } from "../incident-list-view";
import { IncidentStore } from "../incident-store";
import type { Incident } from "../../../../common/incident/incident-types";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { type DiRender, renderFor } from "../../../../renderer/components/test-utils/renderFor";

describe("IncidentListView (H8-007)", () => {
  let mockIpc: { invoke: jest.Mock };
  let store: IncidentStore;
  let render: DiRender;

  const mockIncident: Incident = {
    id: "INC-200",
    clusterId: "minikube-dev",
    namespace: "billing",
    workloadKind: "Pod",
    workloadName: "payment-api",
    title: "CrashLoopBackOff en payment-api",
    description: "Reinicio continuo por error 137 OOMKilled",
    severity: "critical",
    status: "DETECTADO",
    isPinned: false,
    createdAt: "2026-11-05T10:00:00Z",
    updatedAt: "2026-11-05T10:00:00Z",
  };

  beforeEach(() => {
    mockIpc = {
      invoke: jest.fn(async (channel: string, ...args: any[]) => {
        if (channel.includes("list")) return [mockIncident];
        if (channel.includes("get-timeline")) return [];
        if (channel.includes("get-evidence")) return [];
        if (channel.includes("create")) {
          return {
            id: "INC-201",
            title: args[0].title,
            clusterId: args[0].clusterId,
            namespace: args[0].namespace,
            severity: args[0].severity,
            status: "DETECTADO",
            isPinned: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }
        if (channel.includes("ingest-evidence")) {
          return {
            evidence: { id: "EVD-201" } as any,
            isDuplicate: false,
          };
        }
        if (channel.includes("update")) {
          return { ...mockIncident, ...args[1] };
        }

        return null;
      }),
    };

    store = new IncidentStore(mockIpc);
    const di = getDiForUnitTesting();
    render = renderFor(di);
  });

  it("renders page title, action buttons, and stat cards", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    expect(screen.getByText("Centro de Incidentes Kubernetes")).toBeInTheDocument();
    expect(screen.getByTestId("create-synthetic-btn")).toBeInTheDocument();
    expect(screen.getByTestId("new-incident-btn")).toBeInTheDocument();
    expect(screen.getByText("Total Incidentes")).toBeInTheDocument();
    expect(screen.getByText("Críticos")).toBeInTheDocument();
  });

  it("renders loaded incidents in the data table", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    await waitFor(() => {
      expect(screen.getByText("CrashLoopBackOff en payment-api")).toBeInTheDocument();
      expect(screen.getByText("Pod: payment-api")).toBeInTheDocument();
      expect(screen.getByText("critical")).toBeInTheDocument();
    });
  });

  it("filters incidents dynamically via search input", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    await waitFor(() => {
      expect(screen.getByText("CrashLoopBackOff en payment-api")).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId("incident-search-input");
    fireEvent.change(searchInput, { target: { value: "non-existent" } });

    expect(screen.queryByText("CrashLoopBackOff en payment-api")).not.toBeInTheDocument();
    expect(screen.getByText("No se encontraron incidentes que coincidan con los criterios de búsqueda.")).toBeInTheDocument();
  });

  it("creates synthetic OOM incident upon clicking the quick action button", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    const syntheticBtn = screen.getByTestId("create-synthetic-btn");
    fireEvent.click(syntheticBtn);

    await waitFor(() => {
      expect(mockIpc.invoke).toHaveBeenCalled();
    });
  });

  it("opens inline workbench when clicking Diagnosticar", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    await waitFor(() => {
      expect(screen.getByTestId(`open-workbench-btn-${mockIncident.id}`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`open-workbench-btn-${mockIncident.id}`));

    await waitFor(() => {
      expect(screen.getByTestId("incident-workbench-panel")).toBeInTheDocument();
    });
  });

  it("opens retention configuration modal when clicking Retención button", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    const retentionBtn = screen.getByTestId("open-retention-modal-btn");
    fireEvent.click(retentionBtn);

    await waitFor(() => {
      expect(screen.getByTestId("retention-modal-backdrop")).toBeInTheDocument();
      expect(screen.getByText("Configuración de Retención y Purga de Incidentes")).toBeInTheDocument();
    });

    const closeBtn = screen.getByTestId("close-retention-modal-btn");
    fireEvent.click(closeBtn);

    expect(screen.queryByTestId("retention-modal-backdrop")).not.toBeInTheDocument();
  });
});
