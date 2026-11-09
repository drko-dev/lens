/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NonInjectedIncidentWorkbenchPanel } from "../incident-workbench-panel";
import { IncidentStore } from "../incident-store";
import { incidentIpcChannels } from "../../../../common/incident/incident-ipc";
import type { Incident, EvidenceSnippet } from "../../../../common/incident/incident-types";
import type { AiDefaultProviderStatus } from "../../../../common/incident/ai-profile-types";
import type { AiDiagnosisReport, DiagnosisConsentPreview } from "../../../../common/incident/ai-diagnosis-types";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { type DiRender, renderFor } from "../../../../renderer/components/test-utils/renderFor";

/**
 * H8.8-06a QA: the workbench uses the single global default provider. It must not expose a
 * provider or model picker in the ordinary flow, must show the consent destination read-only,
 * must show a banner when the default is unusable, and must flag mock results as DEMO OFFLINE.
 */
describe("H8.8-06a IncidentWorkbenchPanel: global default provider", () => {
  let mockIpc: { invoke: jest.Mock };
  let store: IncidentStore;
  let render: DiRender;
  let defaultStatus: AiDefaultProviderStatus;
  let latestDiagnosis: AiDiagnosisReport | null;

  const incident: Incident = {
    id: "INC-06A-001",
    clusterId: "c-qa",
    namespace: "payments",
    workloadKind: "Deployment",
    workloadName: "checkout-api",
    title: "OOMKilled checkout-api",
    description: "Reinicios por OOM",
    severity: "high",
    status: "INVESTIGANDO",
    isPinned: false,
    createdAt: "2026-11-05T12:00:00Z",
    updatedAt: "2026-11-05T12:00:00Z",
  };

  const evidence: EvidenceSnippet = {
    id: "EVD-06A-01",
    incidentId: incident.id,
    clusterId: "c-qa",
    namespace: "payments",
    type: "pod_logs",
    origin: "kubectl-logs",
    resourceKind: "Pod",
    resourceName: "checkout-api-1",
    sha256Hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    fingerprint: "fp-06a",
    snippetBytes: 64,
    capturedAt: "2026-11-05T12:05:00Z",
    contentSnippet: "OOMKilled exit 137",
  };

  const preview: DiagnosisConsentPreview = {
    incidentId: incident.id,
    title: incident.title,
    clusterId: "c-qa",
    namespace: "payments",
    targetProvider: "mock",
    profileName: "Demo offline (sintético)",
    model: "mock-v1",
    evidencesCount: 1,
    totalBytes: 64,
    evidenceItems: [
      { id: evidence.id, type: "pod_logs", resourceKind: "Pod", resourceName: "checkout-api-1", byteLength: 64, isSanitized: true, redactionsCount: 0 },
    ],
    consentToken: "consent-token-06a-0123456789",
    expiresAt: Date.now() + 300000,
  } as unknown as DiagnosisConsentPreview;

  const report = (provider: string): AiDiagnosisReport => ({
    id: "DIAG-06A",
    incidentId: incident.id,
    profileId: "profile-06a",
    provider,
    model: "mock-v1",
    status: "CONCLUSIVE",
    facts: [],
    hypotheses: [],
    contradictions: [],
    missingInformation: [],
    recommendedNextSteps: [],
    remediationProposal: undefined,
    tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    estimatedCost: 0,
    executedAt: "2026-11-05T12:10:00Z",
  } as unknown as AiDiagnosisReport);

  beforeEach(() => {
    defaultStatus = {
      state: "demo_offline",
      profile: { id: "profile-06a", name: "Demo offline (sintético)", provider: "mock", model: "mock-v1" },
    } as AiDefaultProviderStatus;
    latestDiagnosis = null;

    mockIpc = {
      invoke: jest.fn(async (channel: string) => {
        switch (channel) {
          case incidentIpcChannels.getTimeline:
            return [];
          case incidentIpcChannels.getEvidence:
            return [evidence];
          case incidentIpcChannels.aiGetDefaultProvider:
            return defaultStatus;
          case incidentIpcChannels.aiListProfiles:
            return [];
          case incidentIpcChannels.aiGetLatestDiagnosis:
            return latestDiagnosis;
          case incidentIpcChannels.aiPrepareConsent:
            return preview;
          default:
            return null;
        }
      }),
    };

    store = new IncidentStore(mockIpc as any);
    store.setActiveClusterContext(incident.clusterId);
    store.incidents = [incident];
    store.activeIncidentId = incident.id;
    store.activeIncidentEvidence = [evidence];
    store.aiDefaultStatus = defaultStatus;
    render = renderFor(getDiForUnitTesting());
  });

  const renderPanel = () => render(<NonInjectedIncidentWorkbenchPanel incidentId={incident.id} store={store} />);

  it("has no provider or model <select> in the ordinary workbench flow", async () => {
    const { container } = renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("analyze-ai-btn")).toBeInTheDocument();
    });

    const providerish = Array.from(container.querySelectorAll("select")).filter((el) => {
      const label = el.getAttribute("aria-label") ?? el.closest("div")?.querySelector("label")?.textContent ?? "";
      const options = Array.from(el.querySelectorAll("option")).map((o) => o.textContent ?? "").join(" ");
      return /proveedor|provider|modelo|model/i.test(`${label} ${options}`);
    });

    expect(providerish).toHaveLength(0);
    expect(screen.queryByLabelText(/proveedor|provider|modelo|model/i)).not.toBeInTheDocument();
  });

  it("shows the consent destination as read-only text (profileName, provider, model) with no selectors", async () => {
    renderPanel();

    fireEvent.click(screen.getByTestId("analyze-ai-btn"));
    const modal = await screen.findByTestId("ai-consent-modal");

    const target = modal.querySelector<HTMLElement>('[data-testid="consent-default-target"]');
    expect(target).not.toBeNull();
    expect(target).toHaveTextContent("Demo offline (sintético) — mock/mock-v1");
    expect(modal.querySelectorAll("select")).toHaveLength(0);
    expect(modal.querySelectorAll("input")).toHaveLength(0);
  });

  it("opens the Configuración IA dialog instead of consent when the default is not usable", async () => {
    defaultStatus = { state: "disconnected", profile: { id: "profile-06a", name: "Mock", provider: "mock", model: "mock-v1" } } as AiDefaultProviderStatus;
    store.aiDefaultStatus = defaultStatus;
    renderPanel();

    fireEvent.click(screen.getByTestId("analyze-ai-btn"));

    expect(await screen.findByTestId("ai-provider-config-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("ai-consent-modal")).not.toBeInTheDocument();
    expect(mockIpc.invoke).not.toHaveBeenCalledWith(incidentIpcChannels.aiPrepareConsent, expect.anything());
  });

  it.each([
    ["not_configured", "No configurado"],
    ["configuration_required", "Configuración requerida"],
    ["disconnected", "Desconectado"],
    ["blocked", "Conexión bloqueada"],
  ] as const)("shows the 'Configuración IA' banner when the default state is %s", async (state, label) => {
    defaultStatus = { state } as AiDefaultProviderStatus;
    store.aiDefaultStatus = defaultStatus;
    renderPanel();

    const banner = await screen.findByTestId("ai-default-banner");
    expect(banner).toHaveTextContent(label);
    expect(within(banner).getByRole("button", { name: "Configuración IA" })).toBeInTheDocument();
  });

  it.each(["demo_offline", "available"] as const)("hides the banner when the default state is %s", async (state) => {
    defaultStatus = { state, profile: { id: "profile-06a", name: "P", provider: "mock", model: "mock-v1" } } as AiDefaultProviderStatus;
    store.aiDefaultStatus = defaultStatus;
    renderPanel();

    await waitFor(() => {
      expect(screen.getByTestId("analyze-ai-btn")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("ai-default-banner")).not.toBeInTheDocument();
  });

  it("shows the DEMO OFFLINE badge for a mock diagnosis report", async () => {
    latestDiagnosis = report("mock");
    store.activeDiagnosis = report("mock");
    renderPanel();

    const badge = await screen.findByTestId("demo-offline-badge");
    expect(badge).toHaveTextContent("DEMO OFFLINE");
  });

  it("does not show the DEMO OFFLINE badge for a non-mock diagnosis report", async () => {
    latestDiagnosis = report("openai");
    store.activeDiagnosis = report("openai");
    renderPanel();

    // Positive control: the diagnosis block itself renders, so the badge absence is meaningful.
    expect(await screen.findByText("CONCLUSIVE")).toBeInTheDocument();
    expect(screen.queryByTestId("demo-offline-badge")).not.toBeInTheDocument();
    expect(screen.queryByText(/DEMO OFFLINE/)).not.toBeInTheDocument();
  });
});
