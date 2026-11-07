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
import { AiDiagnosisEngine } from "../ai-diagnosis-engine";
import { RemediationVerifier } from "../remediation-verifier";
import { MockAiProviderAdapter } from "../providers/ai-provider-adapter";

describe("AI Diagnosis Engine, Reversible Proposals, Post-Verification & Budgets (H8-015 .. H8-018)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let vault: SecureCredentialVault;
  let profileManager: AiProfileManager;
  let diagnosisRepo: AiDiagnosisRepository;
  let budgetTracker: AiBudgetTracker;
  let engine: AiDiagnosisEngine;
  let verifier: RemediationVerifier;
  let mockAdapter: MockAiProviderAdapter;

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
    verifier = new RemediationVerifier(incidentRepo, evidenceRepo);

    mockAdapter = new MockAiProviderAdapter();
    engine = new AiDiagnosisEngine(
      incidentRepo,
      evidenceRepo,
      profileManager,
      diagnosisRepo,
      budgetTracker,
      { consentTtlMs: 2000, defaultTimeoutMs: 1000 },
    );
    engine.setMockAdapterOverride(mockAdapter);

    // Setup base incident
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

    // Setup active AI profile
    const profile = await profileManager.createProfile({
      name: "Standard Diagnostic GPT",
      provider: "mock",
      model: "mock-diagnostic-v1",
      endpoint: "https://api.openai.com/v1",
      apiKey: "sk-mock-key-testing",
      maxTokensPerRequest: 2048,
      maxRequestsPerIncident: 3,
      estimatedCostPer1kTokens: 0.002,
    });
    testProfileId = profile.id;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("H8-015: Explicit Human Consent Preview & Token Verification", () => {
    it("generates consent preview with evidence inventory, sanitized counts and ephemeral token", async () => {
      // Ingest test evidence
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "kubectl-logs",
        resourceKind: "Pod",
        resourceName: "payment-gateway-7f89d",
        rawContent: "2026-11-05T12:00:00Z panic: runtime error: invalid memory address or nil pointer dereference",
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      expect(preview.incidentId).toBe(testIncidentId);
      expect(preview.targetProvider).toBe("mock");
      expect(preview.model).toBe("mock-diagnostic-v1");
      expect(preview.evidencesCount).toBe(1);
      expect(preview.totalBytes).toBeGreaterThan(0);
      expect(preview.evidenceItems).toHaveLength(1);
      expect(preview.evidenceItems[0].isSanitized).toBe(true);
      expect(typeof preview.consentToken).toBe("string");
      expect(preview.consentToken.length).toBe(64); // 32 bytes hex
      expect(preview.expiresAt).toBeGreaterThan(Date.now());
    });

    it("rejects execution with missing or invalid consent token", async () => {
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, "invalid-bogus-token"),
      ).rejects.toThrow(/INVALID_CONSENT_TOKEN/);
    });

    it("enforces single-use consumption of consent tokens to prevent replays", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "k8s_event",
        origin: "k8s-events",
        rawContent: "Warning BackOff Back-off restarting failed container",
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      // First execution succeeds
      const report1 = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);
      expect(report1.status).toBe("CONCLUSIVE");

      // Replay attempt with same token MUST fail
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(/INVALID_CONSENT_TOKEN/);
    });

    it("rejects execution if consent token has expired", async () => {
      const shortEngine = new AiDiagnosisEngine(
        incidentRepo,
        evidenceRepo,
        profileManager,
        diagnosisRepo,
        budgetTracker,
        { consentTtlMs: 10 }, // 10 ms TTL
      );
      shortEngine.setMockAdapterOverride(mockAdapter);

      const preview = await shortEngine.prepareConsentPreview(testIncidentId, testProfileId);
      await new Promise(r => setTimeout(r, 25)); // Wait for expiration

      await expect(
        shortEngine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(/EXPIRED_CONSENT_TOKEN/);
    });
  });

  describe("H8-015: Fail-Closed Invariant & Anti-Hallucination Citation Verification", () => {
    it("fails closed immediately as INCONCLUSO without calling adapter when zero evidences exist", async () => {
      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(report.status).toBe("INCONCLUSO");
      expect(report.inconclusiveReason).toContain("No hay evidencias recolectadas");
      expect(report.tokenUsage.totalTokens).toBe(0);
      expect(report.estimatedCost).toBe(0.0);

      // Timeline must record fail-closed event
      const timeline = incidentRepo.getTimeline(testIncidentId);
      const aiEvent = timeline.find(e => e.authorType === "ai");
      expect(aiEvent).toBeDefined();
      expect(aiEvent?.message).toContain("INCONCLUSO");
    });

    it("verifies citations against real SQLite evidences and flags hallucinated citations", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "kubectl",
        rawContent: "OOMKilled process terminated with signal 9",
      });

      // Configure mock adapter to simulate hallucinated citation
      mockAdapter.setBehavior("hallucinated_citation");

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      // Verify hallucinated citation was flagged as unverified
      const factWithPhantom = report.facts.find(f => f.citation?.evidenceId === "EVD-NON-EXISTENT-HALLUCINATED-9999");
      expect(factWithPhantom).toBeDefined();
      expect(factWithPhantom?.citation?.verified).toBe(false);

      // Because all citations were hallucinated, conclusive status must be downgraded to INCONCLUSO
      expect(report.status).toBe("INCONCLUSO");
      expect(report.inconclusiveReason).toContain("degradado a INCONCLUSO");
    });

    it("accepts valid citations pointing to real evidences and keeps conclusive status", async () => {
      const ingResult = evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "kubectl",
        rawContent: "Connection refused to redis:6379 after 3 retries",
      });

      mockAdapter.setBehavior("conclusive");

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(report.status).toBe("CONCLUSIVE");
      expect(report.hypotheses.length).toBeGreaterThan(0);

      // The fact citing real evidence should be verified: true
      const verifiedFact = report.facts.find(f => f.citation?.evidenceId === ingResult.evidence.id);
      expect(verifiedFact).toBeDefined();
      expect(verifiedFact?.citation?.verified).toBe(true);
    });
  });

  describe("H8-016: Reversible Remediation Proposals & Invariant Enforcement", () => {
    it("strictly enforces requiresHumanApproval=true and isApplied=false on remediation proposals", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "k8s_event",
        origin: "k8s",
        rawContent: "Liveness probe failed: HTTP probe failed with statuscode: 503",
      });

      mockAdapter.setBehavior("conclusive");

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(report.remediationProposal).toBeDefined();
      const proposal = report.remediationProposal!;

      expect(proposal.title).toContain("livenessProbe");
      expect(proposal.suggestedYamlDiff).toBeDefined();
      expect(proposal.preconditions.length).toBeGreaterThan(0);
      expect(proposal.risksAndImpact).toBeDefined();
      expect(proposal.validationSteps.length).toBeGreaterThan(0);
      expect(proposal.rollbackProcedure).toBeDefined();

      // STRICT INVARIANTS: AI NEVER executes or applies
      expect(proposal.requiresHumanApproval).toBe(true);
      expect(proposal.isApplied).toBe(false);
    });
  });

  describe("H8-017: Read-Only Post-Remediation Verification", () => {
    it("evaluates post-remediation evidence, detects healthy state and tags human operator", async () => {
      // Transition incident to APROBACIÓN HUMANA to simulate approved proposal
      incidentRepo.transitionStatus({
        incidentId: testIncidentId,
        toStatus: "INVESTIGANDO",
        actor: { id: "lead-sre", type: "human", name: "Lead SRE" },
        justification: "Iniciando investigación técnica.",
      });
      incidentRepo.transitionStatus({
        incidentId: testIncidentId,
        toStatus: "CONFIRMADO",
        actor: { id: "lead-sre", type: "human", name: "Lead SRE" },
        justification: "Fallo confirmado con evidencias previas.",
        evidenceIds: [
          evidenceRepo.ingestEvidence({
            incidentId: testIncidentId,
            clusterId: "c-prod-us-east-1",
            namespace: "payments",
            type: "k8s_event",
            origin: "k8s",
            rawContent: "CrashLoopBackOff detected on pod",
          }).evidence.id,
        ],
      });
      incidentRepo.transitionStatus({
        incidentId: testIncidentId,
        toStatus: "SOLUCIÓN PROPUESTA",
        actor: { id: "lead-sre", type: "human", name: "Lead SRE" },
        justification: "Propuesta de ajuste de probes y memoria lista.",
      });
      incidentRepo.transitionStatus({
        incidentId: testIncidentId,
        toStatus: "APROBACIÓN HUMANA",
        actor: { id: "lead-sre", type: "human", name: "Lead SRE" },
        justification: "Operador humano aprueba aplicar la remediación.",
      });

      // Human applies fix and ingests healthy post-verification evidence
      const healthyEvidence = evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "kubectl-post-verify",
        rawContent: "Container started. Server listening on port 8080. Health check 200 OK. Ready.",
      });

      const verification = await verifier.evaluateRemediation({
        incidentId: testIncidentId,
        humanOperator: "Gustavo Marcon (SRE)",
        currentEvidenceId: healthyEvidence.evidence.id,
      });

      expect(verification.outcome).toBe("HEALTHY");
      expect(verification.humanOperator).toBe("Gustavo Marcon (SRE)");

      // Incident MUST transition to VALIDACIÓN
      const updatedIncident = incidentRepo.getIncidentById(testIncidentId);
      expect(updatedIncident?.status).toBe("VALIDACIÓN");

      // STRICT INVARIANT: Status is NEVER CERRADO automatically
      expect(updatedIncident?.status).not.toBe("CERRADO");

      // Timeline must record verification
      const timeline = incidentRepo.getTimeline(testIncidentId);
      const verifyEvent = timeline.find(e => e.message.includes("[Verificación Posterior]"));
      expect(verifyEvent).toBeDefined();
      expect(verifyEvent?.metadata?.autoClosed).toBe(false);
    });

    it("detects regression when post-remediation evidence still shows errors or crashes", async () => {
      const regressedEvidence = evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "k8s_event",
        origin: "kubectl",
        rawContent: "Back-off restarting failed container. CrashLoopBackOff error persists.",
      });

      const verification = await verifier.evaluateRemediation({
        incidentId: testIncidentId,
        humanOperator: "SRE On-Call",
        currentEvidenceId: regressedEvidence.evidence.id,
      });

      expect(verification.outcome).toBe("REGRESSION");
      expect(verification.summary).toContain("Se detectaron errores activos");
    });
  });

  describe("H8-018: Budgets, Token Caps, and Timeouts", () => {
    it("halts diagnosis when maximum requests per incident limit is reached", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "k8s_event",
        origin: "k8s",
        rawContent: "Pod restart event",
      });

      // maxRequestsPerIncident is set to 3
      for (let i = 0; i < 3; i++) {
        const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
        await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);
      }

      // 4th execution MUST fail with BUDGET_EXCEEDED
      const preview4 = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview4.consentToken),
      ).rejects.toThrow(/BUDGET_EXCEEDED/);
    });

    it("rejects responses that exceed maxTokensPerRequest", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "k8s_event",
        origin: "k8s",
        rawContent: "Pod restart event",
      });

      mockAdapter.setBehavior("excessive_tokens");

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(/TOKEN_BUDGET_EXCEEDED/);
    });

    it("accurately calculates estimated cost based on token usage", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "k8s_event",
        origin: "k8s",
        rawContent: "Pod restart event",
      });

      mockAdapter.setBehavior("conclusive");

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      // In mock conclusive: totalTokens is 830, costPer1k is 0.002
      // 830 / 1000 * 0.002 = 0.00166 USD
      expect(report.tokenUsage.totalTokens).toBe(830);
      expect(report.estimatedCost).toBeCloseTo(0.00166, 5);
    });

    it("handles timeout and abort signal cleanly", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "k8s_event",
        origin: "k8s",
        rawContent: "Pod restart event",
      });

      mockAdapter.setBehavior("timeout");

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const abortCtrl = new AbortController();

      // Abort after 50ms
      setTimeout(() => abortCtrl.abort(), 50);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken, {
          timeoutMs: 150,
          signal: abortCtrl.signal,
        }),
      ).rejects.toThrow(/aborted/);
    });
  });
});
