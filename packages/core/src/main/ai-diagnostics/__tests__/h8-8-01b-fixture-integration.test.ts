/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { EvidenceRepository } from "../../incident-storage/evidence-repository";
import { SecureCredentialVault } from "../secure-credential-vault";
import { AiProfileManager } from "../ai-profile-manager";
import { AiDiagnosisRepository } from "../ai-diagnosis-repository";
import { AiBudgetTracker } from "../ai-budget-tracker";
import { AiDiagnosisEngine, AiDiagnosisSecurityError } from "../ai-diagnosis-engine";
import { MockAiTransport } from "../transport/mock-ai-transport";
import { DefaultSecureAiTransport } from "../transport/secure-ai-transport";
import {
  TransportHttpError,
  TransportPayloadValidationError,
  TransportTimeoutError,
  TransportAbortError,
  RealTransportDisabledError,
} from "../transport/ai-transport-errors";
import { FixtureAiProviderAdapter } from "../providers/fixture-ai-provider-adapter";
import {
  FIXTURE_CONCLUSIVE_JSON,
  FIXTURE_INCONCLUSIVE_JSON,
  FIXTURE_HALLUCINATED_CITATION_JSON,
  FIXTURE_MALFORMED_JSON,
  FIXTURE_EXCESSIVE_TOKEN_JSON,
} from "../fixtures";

describe("H8.8-01b: End-to-End AI Diagnosis Integration with Mock Transport & Fixtures", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let vault: SecureCredentialVault;
  let profileManager: AiProfileManager;
  let diagnosisRepo: AiDiagnosisRepository;
  let budgetTracker: AiBudgetTracker;
  let mockTransport: MockAiTransport;
  let fixtureAdapter: FixtureAiProviderAdapter;
  let engine: AiDiagnosisEngine;

  let testIncidentId: string;
  let testProfileId: string;

  beforeEach(async () => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();

    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
    vault = new SecureCredentialVault();
    profileManager = new AiProfileManager(sqlite, vault);
    diagnosisRepo = new AiDiagnosisRepository(sqlite);
    budgetTracker = new AiBudgetTracker(diagnosisRepo);

    mockTransport = new MockAiTransport();
    fixtureAdapter = new FixtureAiProviderAdapter(mockTransport, {
      endpoint: "https://synthetic-ai.local/v1/diagnose",
      provider: "mock",
      model: "mock-fixture-model-v1",
    });

    engine = new AiDiagnosisEngine(
      incidentRepo,
      evidenceRepo,
      profileManager,
      diagnosisRepo,
      budgetTracker,
      { consentTtlMs: 5000, defaultTimeoutMs: 2000, transport: mockTransport },
    );
    engine.setMockAdapterOverride(fixtureAdapter);

    // Create realistic incident in test database
    const incident = incidentRepo.createIncident({
      clusterId: "c-prod-us-east-1",
      namespace: "payments",
      workloadKind: "Deployment",
      workloadName: "payment-gateway",
      title: "CrashLoopBackOff in payment-gateway",
      severity: "high",
      creator: { id: "devops-lead", type: "human", name: "Lead SRE" },
    });
    testIncidentId = incident.id;

    // Create active AI Profile
    const profile = await profileManager.createProfile({
      name: "Mock AI Profile",
      provider: "mock",
      model: "mock-fixture-model-v1",
      endpoint: "https://synthetic-ai.local/v1/diagnose",
      apiKey: "sk-mock-synthetic-key",
      maxTokensPerRequest: 2048,
      maxRequestsPerIncident: 5,
      estimatedCostPer1kTokens: 0.002,
    });
    testProfileId = profile.id;

    // Ingest primary and secondary evidence matching fixture citations
    evidenceRepo.ingestEvidence({
      id: "evd-pod-logs-001",
      incidentId: testIncidentId,
      clusterId: "c-prod-us-east-1",
      namespace: "payments",
      type: "pod_logs",
      origin: "kubectl-logs",
      resourceKind: "Pod",
      resourceName: "payment-gateway-7f89d",
      rawContent: "2026-11-05T12:00:00Z Container terminated with exit code 137 OOMKilled",
    });

    evidenceRepo.ingestEvidence({
      id: "evd-pod-describe-002",
      incidentId: testIncidentId,
      clusterId: "c-prod-us-east-1",
      namespace: "payments",
      type: "resource_manifest",
      origin: "kubectl-describe",
      resourceKind: "Pod",
      resourceName: "payment-gateway-7f89d",
      rawContent: "Limits: memory: 256Mi\nRequests: memory: 128Mi",
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("1. Consent Enforcement & Lifecycle", () => {
    it("completes full diagnosis when valid consent token is provided with matching evidence", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        body: FIXTURE_CONCLUSIVE_JSON,
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      expect(preview.consentToken).toBeDefined();
      expect(preview.evidencesCount).toBe(2);

      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(report.status).toBe("CONCLUSIVE");
      expect(report.facts.length).toBe(2);
      expect(report.hypotheses.length).toBe(1);
      expect(report.hypotheses[0].confidence).toBe(0.95);
      expect(report.remediationProposal?.requiresHumanApproval).toBe(true);
      expect(report.remediationProposal?.isApplied).toBe(false);

      // Verify report persisted in SQLite
      const stored = diagnosisRepo.getDiagnosisById(report.id);
      expect(stored).toBeDefined();
      expect(stored?.status).toBe("CONCLUSIVE");

      // Verify transport was called exactly once with POST
      expect(mockTransport.recordedRequests.length).toBe(1);
      expect(mockTransport.recordedRequests[0].method).toBe("POST");
    });

    it("rejects execution without consent token before invoking transport", async () => {
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, "invalid-token-12345"),
      ).rejects.toThrow(AiDiagnosisSecurityError);

      expect(mockTransport.recordedRequests.length).toBe(0);
    });

    it("rejects second attempt with reused single-use consent token", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        body: FIXTURE_CONCLUSIVE_JSON,
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      // Replay attempt
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(AiDiagnosisSecurityError);

      expect(mockTransport.recordedRequests.length).toBe(1);
    });

    it("rejects execution when evidence is added or modified after consent preview", async () => {
      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      // Tamper / add new evidence post-consent
      evidenceRepo.ingestEvidence({
        id: "evd-tampered-003",
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "k8s_event",
        origin: "kubectl-events",
        rawContent: "BackOff restarting failed container",
      });

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_EVIDENCE_MISMATCH/);

      expect(mockTransport.recordedRequests.length).toBe(0);
    });

    it("rejects execution when profile configuration is altered after consent preview", async () => {
      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      // Alter profile model
      await profileManager.updateProfile(testProfileId, {
        model: "tampered-different-model-v2",
      });

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_PROFILE_ALTERED/);

      expect(mockTransport.recordedRequests.length).toBe(0);
    });
  });

  describe("2. Grounding, Citations & Status Preservation", () => {
    it("preserves CONCLUSIVE status and marks citations as verified when citations match evidence", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        body: FIXTURE_CONCLUSIVE_JSON,
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(report.status).toBe("CONCLUSIVE");
      expect(report.facts[0].citation?.verified).toBe(true);
      expect(report.facts[1].citation?.verified).toBe(true);
      expect(report.hypotheses[0].citationIds).toEqual([
        "evd-pod-logs-001",
        "evd-pod-describe-002",
      ]);
    });

    it("downgrades diagnosis to INCONCLUSO when model hallucinates citations not in evidence repo", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        body: FIXTURE_HALLUCINATED_CITATION_JSON,
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      // Model claimed CONCLUSIVE, but citation EVD-NON-EXISTENT-HALLUCINATED-9999 was invented
      expect(report.status).toBe("INCONCLUSO");
      expect(report.inconclusiveReason).toContain("las citas generadas por el modelo no tienen correspondencia");
      expect(report.facts[0].citation?.verified).toBe(false);
      expect(report.hypotheses[0].citationIds).toHaveLength(0);
    });

    it("preserves INCONCLUSO status when response fixture is inconclusive", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        body: FIXTURE_INCONCLUSIVE_JSON,
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(report.status).toBe("INCONCLUSO");
      expect(report.inconclusiveReason).toContain("Insufficient or conflicting evidence");
      expect(report.missingInformation.length).toBeGreaterThan(0);
    });
  });

  describe("3. Payload Validation & Error Handling", () => {
    it("handles malformed JSON responses cleanly without crashing", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        body: FIXTURE_MALFORMED_JSON,
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(TransportPayloadValidationError);
    });

    it.each([401, 403, 429, 500, 503])(
      "propagates typed TransportHttpError on HTTP %i error",
      async (status) => {
        mockTransport.setDefaultResponse({
          status,
          statusText: `Error-${status}`,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: `Mock HTTP ${status}` }),
        });

        const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

        const errorPromise = engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);
        await expect(errorPromise).rejects.toThrow(TransportHttpError);
      },
    );
  });

  describe("4. Operational Invariants & Safeguards", () => {
    it("aborts execution immediately when AbortSignal is triggered", async () => {
      mockTransport.setGlobalDelay(200);

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const abortController = new AbortController();

      setTimeout(() => abortController.abort(), 20);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken, {
          signal: abortController.signal,
        }),
      ).rejects.toThrow(TransportAbortError);
    });

    it("times out promptly when transport exceeds timeoutMs deadline", async () => {
      mockTransport.setGlobalDelay(300);

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken, {
          timeoutMs: 50,
        }),
      ).rejects.toThrow(TransportTimeoutError);
    });

    it("rejects diagnosis when token budget is exceeded by model response", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        body: FIXTURE_EXCESSIVE_TOKEN_JSON,
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(/TOKEN_BUDGET_EXCEEDED/);
    });

    it("never retries POST requests on transient 429 errors", async () => {
      mockTransport.setDefaultResponse({
        status: 429,
        statusText: "Too Many Requests",
        headers: { "retry-after": "1" },
        body: JSON.stringify({ error: "Rate limit reached" }),
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(TransportHttpError);

      expect(mockTransport.recordedRequests.length).toBe(1);
    });

    it("fails closed when real network engine is used in offline environment", async () => {
      const realTransport = new DefaultSecureAiTransport({
        allowSyntheticLocal: false,
      });

      const offlineAdapter = new FixtureAiProviderAdapter(realTransport, {
        endpoint: "https://api.openai.com/v1/chat/completions",
        provider: "mock",
      });

      const offlineEngine = new AiDiagnosisEngine(
        incidentRepo,
        evidenceRepo,
        profileManager,
        diagnosisRepo,
        budgetTracker,
        { transport: realTransport },
      );
      offlineEngine.setMockAdapterOverride(offlineAdapter);

      const preview = await offlineEngine.prepareConsentPreview(testIncidentId, testProfileId);

      await expect(
        offlineEngine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(RealTransportDisabledError);
    });

    it("strictly forbids automated execution of remediation proposals", async () => {
      mockTransport.setDefaultResponse({
        status: 200,
        headers: { "content-type": "application/json" },
        body: FIXTURE_CONCLUSIVE_JSON,
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(report.remediationProposal).toBeDefined();
      expect(report.remediationProposal?.requiresHumanApproval).toBe(true);
      expect(report.remediationProposal?.isApplied).toBe(false);
      expect(report.remediationProposal?.suggestedYamlDiff).toContain("deployment.yaml");
    });
  });
});
