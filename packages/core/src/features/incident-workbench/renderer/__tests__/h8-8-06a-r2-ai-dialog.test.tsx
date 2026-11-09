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

import { AiProviderConfigDialog } from "../ai-provider-config-dialog";

/**
 * H8.8-06a-R2: real modal, focus return, focus trap, in-dialog alerts, DEMO badge wrapping.
 */
describe("H8.8-06a-R2 AI provider config dialog", () => {
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

  let backend: AiDefaultProviderStatus;
  let profiles: any[];
  let failChannel: string | null;

  beforeEach(() => {
    backend = { state: "not_configured" } as AiDefaultProviderStatus;
    profiles = [];
    failChannel = null;
    const base = mockIpc.invoke.getMockImplementation() as (c: string, a?: any) => Promise<any>;

    mockIpc.invoke.mockImplementation(async (channel: string, arg?: any) => {
      if (channel === failChannel) throw new Error("boom");
      switch (channel) {
        case incidentIpcChannels.aiGetDefaultProvider:
          return backend;
        case incidentIpcChannels.aiListProfiles:
          return profiles;
        case incidentIpcChannels.aiSetDefaultProvider:
          backend = arg.profileId
            ? ({ state: "demo_offline", profile: profiles.find(p => p.id === arg.profileId) } as AiDefaultProviderStatus)
            : ({ state: "not_configured" } as AiDefaultProviderStatus);
          return backend;
        case incidentIpcChannels.aiCreateProfile:
          profiles = [...profiles, { id: "ds", name: arg.name, provider: arg.provider, model: arg.model, status: "active" }];
          return profiles[profiles.length - 1];
        case incidentIpcChannels.aiEnsureDemoProfile:
          return backend;
        default:
          return base(channel, arg);
      }
    });
  });

  const setDefaultCalls = () => mockIpc.invoke.mock.calls.filter(c => c[0] === incidentIpcChannels.aiSetDefaultProvider);
  const dialog = () => screen.getByRole("dialog");

  describe("workbench entry point", () => {
    it("opens as a real modal rendered with the dialog module classes, and Escape returns focus to the trigger", async () => {
      defaultStatus = { state: "not_configured" } as AiDefaultProviderStatus;
      store.aiDefaultStatus = defaultStatus;
      render(<NonInjectedIncidentWorkbenchPanel incidentId={incident.id} store={store} />);

      const trigger = await screen.findByTestId("ai-default-banner-config-btn");

      trigger.focus();
      fireEvent.click(trigger);

      const backdrop = await screen.findByTestId("ai-provider-config-modal");

      expect(backdrop.className).toContain("modalBackdrop");
      expect(dialog().className).toContain("modalContent");
      // portalled to body: never inline inside the workbench content
      expect(backdrop.parentElement).toBe(document.body);

      fireEvent.keyDown(dialog(), { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it("returns focus to the trigger on the Close button and on backdrop click", async () => {
      defaultStatus = { state: "not_configured" } as AiDefaultProviderStatus;
      store.aiDefaultStatus = defaultStatus;
      render(<NonInjectedIncidentWorkbenchPanel incidentId={incident.id} store={store} />);

      const trigger = await screen.findByTestId("ai-default-banner-config-btn");

      trigger.focus();
      fireEvent.click(trigger);
      fireEvent.click(await screen.findByLabelText("Cerrar configuración IA"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);

      fireEvent.click(trigger);
      fireEvent.mouseDown(await screen.findByTestId("ai-provider-config-modal"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it("keeps the DEMO OFFLINE synthetic legend visible and wrap-safe", async () => {
      defaultStatus = { state: "demo_offline" } as AiDefaultProviderStatus;
      store.aiDefaultStatus = defaultStatus;
      latestDiagnosis = report("mock");
      store.activeDiagnosis = report("mock");
      render(<NonInjectedIncidentWorkbenchPanel incidentId={incident.id} store={store} />);

      const badge = await screen.findByTestId("demo-offline-badge");

      expect(badge).toHaveTextContent("DEMO OFFLINE · resultado sintético, no generado por IA externa");
      expect(badge.style.whiteSpace).toBe("normal");
      expect(badge.title).toContain("no generado por IA externa");
      expect((badge.parentElement as HTMLElement).style.flexWrap).toBe("wrap");
    });
  });

  describe("dialog behaviour (shared by both entry points)", () => {
    const openDialog = () => render(<AiProviderConfigDialog store={store} onClose={() => {}} />);

    it("traps Tab and Shift+Tab inside the dialog", async () => {
      openDialog();

      const focusable = Array.from(dialog().querySelectorAll<HTMLElement>("button:not([disabled]), input, select"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      last.focus();
      fireEvent.keyDown(last, { key: "Tab" });
      expect(document.activeElement).toBe(first);

      first.focus();
      fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);

      // focus that escaped (or sits on the dialog container) is pulled back in
      dialog().focus();
      fireEvent.keyDown(dialog(), { key: "Tab" });
      expect(dialog().contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(dialog());
    });

    it("keeps Escape and Tab working after the focused button unmounts (focus on body)", async () => {
      backend = { state: "demo_offline", profile: { id: "p1", name: "P1", provider: "mock", model: "m" } } as AiDefaultProviderStatus;
      store.aiDefaultStatus = backend;
      const opener = document.createElement("button");

      document.body.appendChild(opener);
      opener.focus();
      openDialog();

      const clear = await screen.findByTestId("clear-default-provider-btn");

      clear.focus();
      fireEvent.click(clear);
      await waitFor(() => expect(screen.queryByTestId("clear-default-provider-btn")).not.toBeInTheDocument());

      // focus was pulled back inside the dialog instead of dropping to BODY
      expect(dialog().contains(document.activeElement)).toBe(true);

      // even with focus explicitly on body, Tab stays inside and Escape closes
      (document.activeElement as HTMLElement).blur();
      expect(document.activeElement).toBe(document.body);
      fireEvent.keyDown(document.body, { key: "Tab" });
      expect(dialog().contains(document.activeElement)).toBe(true);

      (document.activeElement as HTMLElement).blur();
      fireEvent.keyDown(document.body, { key: "Escape" });
      opener.remove();
    });

    it("closes on Escape pressed with focus on body and returns focus to the opener", async () => {
      const opener = document.createElement("button");
      const onClose = jest.fn();

      document.body.appendChild(opener);
      opener.focus();
      const { unmount } = render(<AiProviderConfigDialog store={store} onClose={onClose} />);

      (document.activeElement as HTMLElement).blur();
      expect(document.activeElement).toBe(document.body);
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      unmount();
      expect(document.activeElement).toBe(opener);
      opener.remove();
    });

    it("shows a failed set-default inside the dialog with role=alert, keeps the backend selection, and clears it on retry success", async () => {
      profiles = [{ id: "p1", name: "P1", provider: "mock", model: "m", status: "active" } as any, { id: "p2", name: "P2", provider: "mock", model: "m", status: "active" } as any];
      store.aiProfiles = profiles;
      backend = { state: "demo_offline", profile: profiles[0] } as AiDefaultProviderStatus;
      openDialog();

      const select = () => screen.getByTestId("ai-default-provider-select") as HTMLSelectElement;

      await waitFor(() => expect(select().value).toBe("p1"));
      fireEvent.change(select(), { target: { value: "p2" } });
      failChannel = incidentIpcChannels.aiSetDefaultProvider;
      fireEvent.click(screen.getByTestId("save-default-provider-btn"));

      const alert = await within(dialog()).findByRole("alert");

      expect(alert).toHaveTextContent("boom");
      expect(select().value).toBe("p1");
      expect(screen.getByTestId("ai-default-status-badge")).toHaveTextContent("Demo offline");

      failChannel = null;
      fireEvent.click(screen.getByTestId("save-default-provider-btn"));
      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
      expect(setDefaultCalls()).toHaveLength(2);
    });

    it("shows a failed create-profile inside the dialog, keeps the typed key, and does not look successful", async () => {
      failChannel = incidentIpcChannels.aiCreateProfile;
      openDialog();

      const keyInput = screen.getByTestId("deepseek-api-key-input") as HTMLInputElement;

      fireEvent.change(keyInput, { target: { value: "sk-secret" } });
      fireEvent.click(screen.getByTestId("save-deepseek-profile-btn"));

      expect(await within(dialog()).findByRole("alert")).toHaveTextContent("boom");
      expect(keyInput.value).toBe("sk-secret");
      expect(store.aiProfiles.some(p => p.provider === "deepseek")).toBe(false);
      expect(screen.getByTestId("ai-default-status-badge")).toHaveTextContent("No configurado");

      failChannel = null;
      fireEvent.click(screen.getByTestId("save-deepseek-profile-btn"));
      await waitFor(() => expect(keyInput.value).toBe(""));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows a failed demo-profile creation inside the dialog without a success state", async () => {
      failChannel = incidentIpcChannels.aiEnsureDemoProfile;
      openDialog();
      fireEvent.click(screen.getByTestId("create-demo-profile-btn"));

      expect(await within(dialog()).findByRole("alert")).toHaveTextContent("boom");
      expect(screen.getByTestId("ai-default-status-badge")).toHaveTextContent("No configurado");
      expect((screen.getByTestId("ai-default-provider-select") as HTMLSelectElement).value).toBe("");
    });
  });
});
