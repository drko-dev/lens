/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NonInjectedIncidentListView } from "../incident-list-view";
import { IncidentStore } from "../incident-store";
import { incidentIpcChannels } from "../../../../common/incident/incident-ipc";
import type { AiDefaultProviderStatus, AiDefaultProviderState } from "../../../../common/incident/ai-profile-types";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { type DiRender, renderFor } from "../../../../renderer/components/test-utils/renderFor";

/**
 * H8.8-06a QA: the "Configuración IA" entry point and its status chip on the incident list,
 * with zero incidents, plus the dialog's modal semantics and keyboard dismissal.
 */
describe("H8.8-06a IncidentListView: Configuración IA entry point with zero incidents", () => {
  let mockIpc: { invoke: jest.Mock };
  let store: IncidentStore;
  let render: DiRender;
  let defaultStatus: AiDefaultProviderStatus;

  beforeEach(() => {
    defaultStatus = { state: "not_configured" };
    mockIpc = {
      invoke: jest.fn(async (channel: string) => {
        switch (channel) {
          case incidentIpcChannels.list:
            return [];
          case incidentIpcChannels.aiGetDefaultProvider:
            return defaultStatus;
          case incidentIpcChannels.aiListProfiles:
            return [];
          default:
            return null;
        }
      }),
    };

    store = new IncidentStore(mockIpc as any);
    store.setActiveClusterContext("minikube-dev");
    store.incidents = [];
    render = renderFor(getDiForUnitTesting());
  });

  it("shows the Configuración IA button even when there are zero incidents", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    expect(store.incidents).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Configuración IA" })).toBeInTheDocument();
    expect(screen.getByTestId("open-ai-config-btn")).toBeInTheDocument();
  });

  it("opens a modal dialog with role=dialog and aria-modal when the button is clicked", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("open-ai-config-btn"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("Proveedor predeterminado")).toBeInTheDocument();
  });

  it("closes the dialog when Escape is pressed inside it", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    fireEvent.click(screen.getByTestId("open-ai-config-btn"));
    const dialog = await screen.findByRole("dialog");

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes the dialog with its close button", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    fireEvent.click(screen.getByTestId("open-ai-config-btn"));
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar configuración IA" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it.each<[AiDefaultProviderState, string]>([
    ["not_configured", "No configurado"],
    ["demo_offline", "Demo offline"],
    ["blocked", "Conexión bloqueada"],
    ["disconnected", "Desconectado"],
    ["available", "Disponible"],
    ["configuration_required", "Configuración requerida"],
  ])("renders the status chip for state %s as '%s'", async (state, label) => {
    store.aiDefaultStatus = { state } as AiDefaultProviderStatus;
    render(<NonInjectedIncidentListView store={store} />);

    expect(screen.getByTestId("ai-default-status-chip")).toHaveTextContent(label);
  });

  it.each<AiDefaultProviderState>([
    "not_configured",
    "demo_offline",
    "blocked",
    "disconnected",
    "configuration_required",
  ])("never renders the word 'Conectado' for state %s", async (state) => {
    store.aiDefaultStatus = { state } as AiDefaultProviderStatus;
    render(<NonInjectedIncidentListView store={store} />);

    expect(screen.getByTestId("incident-list-view").textContent).not.toMatch(/\bConectado\b/);
  });

  it("renders 'Disponible' rather than 'Conectado' for the available state", async () => {
    store.aiDefaultStatus = { state: "available" } as AiDefaultProviderStatus;
    render(<NonInjectedIncidentListView store={store} />);

    const chip = screen.getByTestId("ai-default-status-chip");
    expect(chip).toHaveTextContent("Disponible");
    expect(chip.textContent).not.toMatch(/Conectado/);
  });

  it("reflects a status loaded from the backend once the dialog refreshes it", async () => {
    render(<NonInjectedIncidentListView store={store} />);

    expect(screen.getByTestId("ai-default-status-chip")).toHaveTextContent("No configurado");

    defaultStatus = { state: "demo_offline", profile: { id: "p-demo", name: "Demo", provider: "mock", model: "mock-v1" } } as any;
    fireEvent.click(screen.getByTestId("open-ai-config-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("ai-default-status-chip")).toHaveTextContent("Demo offline");
    });
  });
});
