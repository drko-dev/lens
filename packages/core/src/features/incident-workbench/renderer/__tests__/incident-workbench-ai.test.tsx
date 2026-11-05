/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { NonInjectedIncidentWorkbenchPanel } from "../incident-workbench-panel";
import { IncidentStore } from "../incident-store";
import { incidentIpcChannels } from "../../../../common/incident/incident-ipc";
import type { Incident, EvidenceSnippet } from "../../../../common/incident/incident-types";
import type { AiProviderProfile } from "../../../../common/incident/ai-profile-types";
import type { AiDiagnosisReport, DiagnosisConsentPreview } from "../../../../common/incident/ai-diagnosis-types";
import { getDiForUnitTesting } from "../../../../renderer/getDiForUnitTesting";
import { type DiRender, renderFor } from "../../../../renderer/components/test-utils/renderFor";

describe("IncidentWorkbenchPanel AI Diagnostics & Reversible Remediation (H8.3)", () => {
  let mockIpc: { invoke: jest.Mock };
  let store: IncidentStore;
  let render: DiRender;

  const mockIncident: Incident = {
    id: "INC-AI-TEST-001",
    clusterId: "c-prod-aws",
    namespace: "payments",
    workloadKind: "Deployment",
    workloadName: "checkout-api",
    title: "CrashLoopBackOff in checkout-api",
    description: "Repeated restarts observed on pods in payments namespace",
    severity: "high",
    status: "INVESTIGANDO",
    isPinned: false,
    createdAt: "2026-11-05T12:00:00Z",
    updatedAt: "2026-11-05T12:00:00Z",
  };

  const mockEvidence: EvidenceSnippet = {
    id: "EVD-LOGS-01",
    incidentId: "INC-AI-TEST-001",
    clusterId: "c-prod-aws",
    namespace: "payments",
    type: "pod_logs",
    origin: "kubectl-logs",
    resourceKind: "Pod",
    resourceName: "checkout-api-98f",
    sha256Hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    fingerprint: "fp-123",
    snippetBytes: 256,
    capturedAt: "2026-11-05T12:05:00Z",
    contentSnippet: "fatal error: runtime: out of memory",
  };

  const mockProfile: AiProviderProfile = {
    id: "prof-gpt4",
    name: "Production GPT-4o",
    provider: "openai",
    model: "gpt-4o",
    endpoint: "https://api.openai.com/v1",
    credentialRef: "sec-ref-01",
    status: "active",
    maxTokensPerRequest: 4096,
    maxRequestsPerIncident: 10,
    estimatedCostPer1kTokens: 0.005,
    createdAt: "2026-11-05T10:00:00Z",
    updatedAt: "2026-11-05T10:00:00Z",
  };

  const mockConsentPreview: DiagnosisConsentPreview = {
    incidentId: "INC-AI-TEST-001",
    title: "CrashLoopBackOff in checkout-api",
    targetProvider: "openai",
    model: "gpt-4o",
    evidencesCount: 1,
    totalBytes: 256,
    evidenceItems: [
      {
        id: "EVD-LOGS-01",
        type: "pod_logs",
        resourceKind: "Pod",
        resourceName: "checkout-api-98f",
        byteLength: 256,
        isSanitized: true,
        redactionsCount: 0,
      },
    ],
    consentToken: "fake-consent-token-abcdef123456",
    expiresAt: Date.now() + 300000,
  };

  const mockDiagnosisReport: AiDiagnosisReport = {
    id: "DIAG-001",
    incidentId: "INC-AI-TEST-001",
    profileId: "prof-gpt4",
    provider: "openai",
    model: "gpt-4o",
    status: "CONCLUSIVE",
    facts: [
      {
        text: "El pod checkout-api reportó error fatal out of memory",
        citation: {
          evidenceId: "EVD-LOGS-01",
          excerpt: "fatal error: runtime: out of memory",
          resourceKind: "Pod",
          resourceName: "checkout-api-98f",
          verified: true,
        },
      },
    ],
    hypotheses: [
      {
        id: "hyp-oom",
        title: "Agotamiento de memoria RAM en contenedor",
        confidence: 0.95,
        rationale: "Los registros muestran salida con código OOMKilled",
        citationIds: ["EVD-LOGS-01"],
      },
    ],
    contradictions: [],
    missingInformation: [],
    recommendedNextSteps: ["Incrementar límite de memoria en spec"],
    remediationProposal: {
      id: "REM-001",
      title: "Incrementar memory limits de 512Mi a 1Gi",
      problemSummary: "checkout-api sufre reinicios por límite de memoria insuficiente",
      suggestedYamlDiff: `--- a/deployment.yaml\n+++ b/deployment.yaml\n@@ -25,2 +25,2 @@\n-  memory: "512Mi"\n+  memory: "1Gi"`,
      preconditions: ["Verificar disponibilidad en nodo"],
      risksAndImpact: "Bajo riesgo: reinicio controlado",
      validationSteps: ["Monitorear kubectl get pods durante 60s"],
      rollbackProcedure: "kubectl rollout undo deployment checkout-api",
      requiresHumanApproval: true,
      isApplied: false,
    },
    tokenUsage: {
      promptTokens: 400,
      completionTokens: 250,
      totalTokens: 650,
    },
    estimatedCost: 0.00325,
    executedAt: "2026-11-05T12:10:00Z",
  };

  beforeEach(() => {
    mockIpc = {
      invoke: jest.fn().mockImplementation((channel: string, ...args: any[]) => {
        switch (channel) {
          case incidentIpcChannels.getTimeline:
            return Promise.resolve([]);
          case incidentIpcChannels.getEvidence:
            return Promise.resolve([mockEvidence]);
          case incidentIpcChannels.aiListProfiles:
            return Promise.resolve([mockProfile]);
          case incidentIpcChannels.aiGetLatestDiagnosis:
            return Promise.resolve(null);
          case incidentIpcChannels.aiPrepareConsent:
            return Promise.resolve(mockConsentPreview);
          case incidentIpcChannels.aiExecuteDiagnosis:
            return Promise.resolve(mockDiagnosisReport);
          case incidentIpcChannels.aiVerifyRemediation:
            return Promise.resolve({
              incidentId: "INC-AI-TEST-001",
              outcome: "HEALTHY",
              summary: "Contenedores en estado Ready.",
              humanOperator: "Gustavo Marcon (SRE)",
            });
          default:
            return Promise.resolve(null);
        }
      }),
    };

    store = new IncidentStore(mockIpc as any);
    store.incidents = [mockIncident];
    store.activeIncidentId = mockIncident.id;
    store.activeIncidentEvidence = [mockEvidence];
    store.aiProfiles = [mockProfile];

    const di = getDiForUnitTesting();
    render = renderFor(di);
  });

  it("renders 'Analizar incidente con IA' button when incident has evidence", () => {
    render(<NonInjectedIncidentWorkbenchPanel incidentId={mockIncident.id} store={store} />);

    const analyzeBtn = screen.getByTestId("analyze-ai-btn");
    expect(analyzeBtn).toBeInTheDocument();
    expect(analyzeBtn).not.toBeDisabled();
  });

  it("opens consent preview modal showing sanitized evidence inventory and token notice", async () => {
    render(<NonInjectedIncidentWorkbenchPanel incidentId={mockIncident.id} store={store} />);

    const analyzeBtn = screen.getByTestId("analyze-ai-btn");
    fireEvent.click(analyzeBtn);

    await waitFor(() => {
      expect(screen.getByTestId("ai-consent-modal")).toBeInTheDocument();
    });

    expect(screen.getByText(/Autorización de Inferencia y Envío de Evidencias/i)).toBeInTheDocument();
    expect(screen.getByText(/Evidencias a transmitir:/i)).toBeInTheDocument();
    expect(screen.getByText(/✓ Sanitizado \(256 B\)/i)).toBeInTheDocument();
    expect(screen.getByText(/El token efímero de consentimiento vence en 5 minutos/i)).toBeInTheDocument();
  });

  it("executes diagnosis upon consent confirmation, rendering verified citations and reversible remediation", async () => {
    render(<NonInjectedIncidentWorkbenchPanel incidentId={mockIncident.id} store={store} />);

    // 1. Open consent
    fireEvent.click(screen.getByTestId("analyze-ai-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("ai-consent-modal")).toBeInTheDocument();
    });

    // 2. Confirm consent
    fireEvent.click(screen.getByTestId("confirm-ai-diagnosis-btn"));

    await waitFor(() => {
      expect(mockIpc.invoke).toHaveBeenCalledWith(
        incidentIpcChannels.aiExecuteDiagnosis,
        expect.objectContaining({
          incidentId: mockIncident.id,
          profileId: mockProfile.id,
          consentToken: mockConsentPreview.consentToken,
        }),
      );
    });

    // 3. Verify rendered diagnosis
    await waitFor(() => {
      expect(screen.getByText(/Agotamiento de memoria RAM en contenedor/i)).toBeInTheDocument();
      expect(screen.getByText(/Confianza: 95%/i)).toBeInTheDocument();
      expect(screen.getByText(/Incrementar memory limits de 512Mi a 1Gi/i)).toBeInTheDocument();
      expect(screen.getByText(/EVD-LOGS-01 \(Verificada\)/i)).toBeInTheDocument();
    });

    // 4. Invariant disclaimer must be visible
    expect(
      screen.getByText(/Aviso estricto: Esta remediación requiere aprobación y aplicación manual por un operador humano/i),
    ).toBeInTheDocument();

    // 5. Post-verification button must be available
    expect(screen.getByTestId("verify-remediation-btn")).toBeInTheDocument();
  });

  it("opens post-remediation verification modal and triggers read-only evaluation", async () => {
    store.activeDiagnosis = mockDiagnosisReport;
    render(<NonInjectedIncidentWorkbenchPanel incidentId={mockIncident.id} store={store} />);

    const verifyBtn = screen.getByTestId("verify-remediation-btn");
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByTestId("remediation-verify-modal")).toBeInTheDocument();
    });

    expect(screen.getByText(/Verificación Posterior a Remediación/i)).toBeInTheDocument();
    expect(screen.getByText(/Invariante estricto: Esta verificación nunca cierra el incidente/i)).toBeInTheDocument();

    // Click confirm verify
    fireEvent.click(screen.getByTestId("confirm-verify-btn"));

    await waitFor(() => {
      expect(mockIpc.invoke).toHaveBeenCalledWith(
        incidentIpcChannels.aiVerifyRemediation,
        expect.objectContaining({
          incidentId: mockIncident.id,
          humanOperator: "Gustavo Marcon (SRE)",
        }),
      );
    });
  });
});
