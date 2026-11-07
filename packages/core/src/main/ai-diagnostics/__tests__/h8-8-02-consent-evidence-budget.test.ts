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
import { FixtureAiProviderAdapter } from "../providers/fixture-ai-provider-adapter";
import { EphemeralContextManager } from "../ephemeral-context-manager";
import {
  FIXTURE_CONCLUSIVE_JSON,
} from "../fixtures";

describe("H8.8-02: Consent Scope, Evidence Privacy & Concurrency Budget", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let vault: SecureCredentialVault;
  let profileManager: AiProfileManager;
  let diagnosisRepo: AiDiagnosisRepository;
  let budgetTracker: AiBudgetTracker;
  let mockTransport: MockAiTransport;
  let fixtureAdapter: FixtureAiProviderAdapter;
  let contextManager: EphemeralContextManager;
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
    contextManager = new EphemeralContextManager({ enableAutoCleanup: false });

    mockTransport = new MockAiTransport();
    mockTransport.setDefaultResponse({
      status: 200,
      headers: { "content-type": "application/json" },
      body: FIXTURE_CONCLUSIVE_JSON,
    });

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
      contextManager,
      { consentTtlMs: 5000, defaultTimeoutMs: 2000, transport: mockTransport },
    );
    engine.setMockAdapterOverride(fixtureAdapter);

    // Seed realistic incident in test database
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

    // Seed active AI Profile
    const profile = await profileManager.createProfile({
      name: "Mock AI Profile",
      provider: "mock",
      model: "mock-fixture-model-v1",
      endpoint: "https://synthetic-ai.local/v1/diagnose",
      apiKey: "sk-mock-synthetic-key",
      maxTokensPerRequest: 2048,
      maxRequestsPerIncident: 3,
      estimatedCostPer1kTokens: 0.002,
    });
    testProfileId = profile.id;
  });

  afterEach(() => {
    contextManager.dispose();
  });

  describe("1. Consent & Immutable Execution Scope (H8.8-02-01)", () => {
    it("enriches consent preview with immutable cluster, namespace, operationId and issuedAt", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout at line 42",
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      expect(preview.incidentId).toBe(testIncidentId);
      expect(preview.clusterId).toBe("c-prod-us-east-1");
      expect(preview.namespace).toBe("payments");
      expect(preview.targetProvider).toBe("mock");
      expect(preview.model).toBe("mock-fixture-model-v1");
      expect(preview.endpoint).toBe("https://synthetic-ai.local/v1/diagnose");
      expect(preview.operationId).toMatch(/^OP-/);
      expect(preview.issuedAt).toBeGreaterThan(0);
      expect(preview.consentToken).toBeDefined();
      expect(preview.expiresAt).toBeGreaterThan(Date.now());
    });

    it("rejects execution when consent token is invalid or nonexistent", async () => {
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, "invalid-token-12345"),
      ).rejects.toThrow(AiDiagnosisSecurityError);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, "invalid-token-12345"),
      ).rejects.toThrow("Token de consentimiento no válido o inexistente");
    });

    it("enforces single-use consumption of consent tokens", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout at line 42",
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      // First execution succeeds
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);
      expect(report.id).toBeDefined();

      // Second execution with same token must fail
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(/Token de consentimiento no válido o inexistente/);
    });

    it("prevents double-execution race condition when same consent token is called concurrently", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout at line 42",
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      // Launch 2 concurrent executions with the same token
      const results = await Promise.allSettled([
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain("Token de consentimiento no válido o inexistente");
    });

    it("rejects execution if consent token has expired", async () => {
      const shortEngine = new AiDiagnosisEngine(
        incidentRepo,
        evidenceRepo,
        profileManager,
        diagnosisRepo,
        budgetTracker,
        contextManager,
        { consentTtlMs: 20, defaultTimeoutMs: 2000, transport: mockTransport },
      );
      shortEngine.setMockAdapterOverride(fixtureAdapter);

      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout at line 42",
      });

      const preview = await shortEngine.prepareConsentPreview(testIncidentId, testProfileId);

      // Wait 30ms for token to expire
      await new Promise((resolve) => setTimeout(resolve, 35));

      await expect(
        shortEngine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow("El token de consentimiento ha expirado");
    });

    it("rejects preview and execution when incident is CERRADO or NO CONFIRMADO", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout at line 42",
      });

      const db = sqlite.getDb();
      db.prepare("UPDATE incidents SET status = 'CERRADO', closed_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        testIncidentId,
      );

      await expect(
        engine.prepareConsentPreview(testIncidentId, testProfileId),
      ).rejects.toThrow(/INCIDENT_CLOSED/);

      // Now create another active incident, generate preview, then close it before execution
      const activeInc = incidentRepo.createIncident({
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        workloadKind: "Deployment",
        workloadName: "worker-svc",
        title: "Active Incident",
        severity: "medium",
        creator: { id: "devops-lead", type: "human", name: "Lead SRE" },
      });
      evidenceRepo.ingestEvidence({
        incidentId: activeInc.id,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: Worker timeout",
      });

      const preview = await engine.prepareConsentPreview(activeInc.id, testProfileId);

      // Close the incident before execution
      db.prepare("UPDATE incidents SET status = 'NO CONFIRMADO' WHERE id = ?").run(activeInc.id);

      await expect(
        engine.executeDiagnosis(activeInc.id, testProfileId, preview.consentToken),
      ).rejects.toThrow(/INCIDENT_CLOSED/);
    });

    it("rejects execution if clusterId or namespace has been altered or mismatches consent", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout at line 42",
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      // Mutate incident namespace directly in database to simulate tampered scope
      const db = sqlite.getDb();
      db.prepare("UPDATE incidents SET namespace = 'tampered-namespace' WHERE id = ?").run(testIncidentId);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_SCOPE_MISMATCH/);
    });

    it("supports granular explicit consent revocation (single, incident, and cluster)", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout at line 42",
      });

      // 1. Single token revocation
      const p1 = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const revoked = engine.revokeConsent(p1.consentToken);
      expect(revoked).toBe(true);
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, p1.consentToken),
      ).rejects.toThrow(/Token de consentimiento no válido o inexistente/);

      // 2. Incident-scoped revocation
      const p2 = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const countIncident = engine.revokeConsentsForIncident(testIncidentId);
      expect(countIncident).toBeGreaterThanOrEqual(1);
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, p2.consentToken),
      ).rejects.toThrow(/Token de consentimiento no válido o inexistente/);

      // 3. Cluster-scoped revocation
      const p3 = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const countCluster = engine.revokeConsentsForCluster("c-prod-us-east-1");
      expect(countCluster).toBeGreaterThanOrEqual(1);
      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, p3.consentToken),
      ).rejects.toThrow(/Token de consentimiento no válido o inexistente/);
    });

    it("cancels in-flight diagnosis executions cleanly via cancelPendingDiagnoses", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout at line 42",
      });

      mockTransport.registerRoute(() => true, async () => {
        // Simulate slow response
        await new Promise((resolve) => setTimeout(resolve, 300));
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: FIXTURE_CONCLUSIVE_JSON,
        };
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      const executionPromise = engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      // Cancel immediately
      setTimeout(() => {
        engine.cancelPendingDiagnoses(testIncidentId);
      }, 20);

      await expect(executionPromise).rejects.toThrow();
    });
  });

  describe("2. Privacy, Minimization & Output Sanitization (H8.8-02-02 & H8.8-02-03)", () => {
    it("excludes Kubernetes Secret and ServiceAccount kinds from transport payload", async () => {
      // Ingest ordinary evidence
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        resourceKind: "Pod",
        resourceName: "payment-gateway-xyz",
        rawContent: "Error: Connection timeout",
      });

      // Insert forbidden kind directly into database to simulate legacy/bypassed record
      const db = sqlite.getDb();
      db.prepare(`
        INSERT INTO incident_evidence (id, incident_id, cluster_id, namespace, type, origin, resource_kind, resource_name, content_snippet, snippet_bytes, sha256_hash, captured_at)
        VALUES ('EVD-FORBIDDEN-SECRET', ?, 'c-prod-us-east-1', 'payments', 'resource_manifest', 'k8s', 'Secret', 'db-password-secret', 'password: supersecretpassword', 30, 'fakehash', ?)
      `).run(testIncidentId, new Date().toISOString());

      let capturedPayload: any;
      mockTransport.registerRoute(() => true, async (req) => {
        capturedPayload = JSON.parse(req.body ?? "{}");
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: FIXTURE_CONCLUSIVE_JSON,
        };
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(capturedPayload).toBeDefined();
      const dispatchedKinds = capturedPayload.evidences.map((e: any) => e.resourceKind);
      expect(dispatchedKinds).not.toContain("Secret");
      expect(dispatchedKinds).not.toContain("ServiceAccount");
    });

    it("bounds evidence count to maximum 50 and payload bytes to 192 KiB", async () => {
      // Ingest 60 small evidences
      for (let i = 0; i < 60; i++) {
        evidenceRepo.ingestEvidence({
          incidentId: testIncidentId,
          clusterId: "c-prod-us-east-1",
          namespace: "payments",
          type: "pod_logs",
          origin: "k8s",
          resourceKind: "Pod",
          resourceName: `pod-${i}`,
          rawContent: `Log line evidence entry number ${i}`,
        });
      }

      let capturedPayload: any;
      mockTransport.registerRoute(() => true, async (req) => {
        capturedPayload = JSON.parse(req.body ?? "{}");
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: FIXTURE_CONCLUSIVE_JSON,
        };
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(capturedPayload.evidences.length).toBeLessThanOrEqual(50);
      const totalBytes = capturedPayload.evidences.reduce(
        (acc: number, e: any) => acc + Buffer.byteLength(e.contentSnippet, "utf8"),
        0,
      );
      expect(totalBytes).toBeLessThanOrEqual(192 * 1024);
    });

    it("sanitizes reflected credentials and tokens in AI model output before SQLite persistence and IPC", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        resourceKind: "Pod",
        resourceName: "pod-1",
        rawContent: "Log line with safe info",
      });

      // Model returns a response that reflects/leaks a Bearer token and an AWS Secret Key
      const leakyModelOutput = JSON.stringify({
        status: "CONCLUSIVE",
        facts: [
          {
            text: "Detected secret Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ae75hg2ff in logs",
          },
        ],
        hypotheses: [
          {
            id: "hypo-1",
            title: "Database credential leak with apiKey: AKIAIOSFODNN7EXAMPLE",
            confidence: 0.9,
            rationale: "password: my-super-secret-password-12345",
            citationIds: [],
          },
        ],
        contradictions: ["Leaked secret: ghp_111122223333444455556666777788889999"],
        missingInformation: [],
        recommendedNextSteps: ["Rotate token Bearer eyJhbGciOiJIUzI1NiJ9.e30.signature"],
        remediationProposal: {
          id: "rem-1",
          title: "Fix secret leak",
          problemSummary: "Leaked apiKey: AKIAIOSFODNN7EXAMPLE in deployment",
          suggestedYamlDiff: "env:\n  - name: DB_PASS\n    value: my-super-secret-password-12345",
          suggestedConfigDescription: "Remove leaked password: my-super-secret-password-12345",
          preconditions: [],
          risksAndImpact: "Low",
          validationSteps: [],
          rollbackProcedure: "Revert",
          requiresHumanApproval: true,
          isApplied: false,
        },
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      mockTransport.registerRoute(() => true, async () => ({
        status: 200,
        headers: { "content-type": "application/json" },
        body: leakyModelOutput,
      }));

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      // Verify returned report has NO raw Bearer token, password, or AWS key
      const reportJson = JSON.stringify(report);
      expect(reportJson).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ae75hg2ff");
      expect(reportJson).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(reportJson).not.toContain("ghp_111122223333444455556666777788889999");
      expect(reportJson).toContain("[REDACTED_");

      // Verify SQLite ai_diagnoses table contains strictly sanitized text
      const db = sqlite.getDb();
      const savedRow = db.prepare("SELECT report_json FROM ai_diagnoses WHERE id = ?").get(report.id) as any;
      expect(savedRow.report_json).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ae75hg2ff");
      expect(savedRow.report_json).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(savedRow.report_json).not.toContain("ghp_111122223333444455556666777788889999");
    });

    it("purges RAM buffers and sanitized contents of ephemeral manual context post-diagnosis", async () => {
      await contextManager.addFile(testIncidentId, {
        incidentId: testIncidentId,
        filename: "Dockerfile",
        rawContent: "FROM node:20\nENV SECRET_KEY=sensitive-data-xyz",
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(report.id).toBeDefined();

      // Verify raw RAM buffer was zeroed out
      const files = contextManager.listFiles(testIncidentId);
      expect(files).toHaveLength(1);
      expect(files[0].isPurged).toBe(true);

      // Verify active files for diagnosis returns empty (destroyed)
      expect(contextManager.getFilesForDiagnosis(testIncidentId)).toHaveLength(0);
    });
  });

  describe("3. Atomic Budget Reservation & Concurrency Control (H8.8-02-04)", () => {
    it("handles 2 concurrent execution requests when exactly 1 slot remains (atomic race check)", async () => {
      // Set maxRequestsPerIncident to 1
      await profileManager.updateProfile(testProfileId, {
        maxRequestsPerIncident: 1,
      });

      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB timeout",
      });

      const preview1 = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const preview2 = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      // Add a slight mock delay to ensure both executions are truly in-flight
      mockTransport.registerRoute(() => true, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: FIXTURE_CONCLUSIVE_JSON,
        };
      });

      const [res1, res2] = await Promise.allSettled([
        engine.executeDiagnosis(testIncidentId, testProfileId, preview1.consentToken),
        engine.executeDiagnosis(testIncidentId, testProfileId, preview2.consentToken),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled");
      const rejected = [res1, res2].filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason.message).toContain("Límite presupuestario alcanzado");

      // Verify SQLite ai_budget_reservations table has exactly 1 completed reservation
      const reservations = diagnosisRepo.listReservationsByIncident(testIncidentId);
      const completedRes = reservations.filter((r) => r.status === "COMPLETED");
      expect(completedRes).toHaveLength(1);
    });

    it("rejects duplicate operationId immediately with DUPLICATE_OPERATION_ID", async () => {
      const profile = await profileManager.getProfile(testProfileId);

      budgetTracker.reserveBudget({
        incidentId: testIncidentId,
        profile: profile!,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        operationId: "OP-DUPLICATE-TEST",
      });

      expect(() => {
        budgetTracker.reserveBudget({
          incidentId: testIncidentId,
          profile: profile!,
          clusterId: "c-prod-us-east-1",
          namespace: "payments",
          operationId: "OP-DUPLICATE-TEST",
        });
      }).toThrow(AiDiagnosisSecurityError);

      expect(() => {
        budgetTracker.reserveBudget({
          incidentId: testIncidentId,
          profile: profile!,
          clusterId: "c-prod-us-east-1",
          namespace: "payments",
          operationId: "OP-DUPLICATE-TEST",
        });
      }).toThrow("DUPLICATE_OPERATION_ID");
    });

    it("marks dispatched request that times out / fails as FAILED_DISPATCHED (consumed against quota)", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout",
      });

      // Transport throws network error
      mockTransport.registerRoute(() => true, async () => {
        throw new Error("ETIMEDOUT: Connection to mock provider timed out");
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow("ETIMEDOUT");

      // Check reservation status
      const reservations = diagnosisRepo.listReservationsByIncident(testIncidentId);
      expect(reservations).toHaveLength(1);
      expect(reservations[0].status).toBe("FAILED_DISPATCHED");
      expect(reservations[0].errorMessage).toContain("ETIMEDOUT");

      // It must count as consumed against quota
      expect(diagnosisRepo.countActiveAndConsumedBudget(testIncidentId)).toBe(1);
    });

    it("marks pre-dispatch validation failure as CANCELLED_BEFORE_DISPATCH (unconsumed against quota)", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout",
      });

      // Mutate evidence hash by injecting additional evidence directly
      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      const db = sqlite.getDb();
      db.prepare(`
        INSERT INTO incident_evidence (id, incident_id, cluster_id, namespace, type, origin, content_snippet, snippet_bytes, sha256_hash, captured_at)
        VALUES ('EVD-TAMPER-2', ?, 'c-prod-us-east-1', 'payments', 'pod_logs', 'k8s', 'Tamper snippet', 14, 'fakehash', ?)
      `).run(testIncidentId, new Date().toISOString());

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_EVIDENCE_MISMATCH/);

      // Pre-dispatch error failed before reservation was created
      expect(diagnosisRepo.countActiveAndConsumedBudget(testIncidentId)).toBe(0);
    });

    it("marks HTTP 429 / 500 error after dispatch as FAILED_DISPATCHED", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB timeout",
      });

      mockTransport.registerRoute(() => true, async () => {
        return {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "5" },
          body: JSON.stringify({ error: "Rate limit exceeded" }),
        };
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow();

      const reservations = diagnosisRepo.listReservationsByIncident(testIncidentId);
      expect(reservations).toHaveLength(1);
      expect(reservations[0].status).toBe("FAILED_DISPATCHED");
      expect(diagnosisRepo.countActiveAndConsumedBudget(testIncidentId)).toBe(1);
    });

    it("rejects responses exceeding maxTokensPerRequest with TOKEN_BUDGET_EXCEEDED", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-us-east-1",
        namespace: "payments",
        type: "pod_logs",
        origin: "k8s",
        rawContent: "Error: DB connection timeout",
      });

      const excessiveTokensOutput = JSON.stringify({
        status: "CONCLUSIVE",
        facts: [{ text: "Valid fact" }],
        hypotheses: [
          {
            id: "hypo-1",
            title: "Hypothesis",
            confidence: 0.8,
            rationale: "Rationale",
            citationIds: [],
          },
        ],
        contradictions: [],
        missingInformation: [],
        recommendedNextSteps: [],
        tokenUsage: {
          promptTokens: 10000,
          completionTokens: 5000,
          totalTokens: 15000, // Profile max is 2048
        },
      });

      mockTransport.registerRoute(() => true, async () => ({
        status: 200,
        headers: { "content-type": "application/json" },
        body: excessiveTokensOutput,
      }));

      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);

      await expect(
        engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken),
      ).rejects.toThrow(/TOKEN_BUDGET_EXCEEDED/);
    });

    it("validates token counts strictly rejecting negative, NaN and non-numeric tokens", () => {
      const profile = {
        id: "p-test",
        name: "Test Profile",
        maxTokensPerRequest: 1000,
      } as any;

      expect(budgetTracker.validateTokenBudget(-1, profile).allowed).toBe(false);
      expect(budgetTracker.validateTokenBudget(NaN, profile).allowed).toBe(false);
      expect(budgetTracker.validateTokenBudget("100" as any, profile).allowed).toBe(false);
      expect(budgetTracker.validateTokenBudget(500, profile).allowed).toBe(true);
      expect(budgetTracker.validateTokenBudget(1500, profile).allowed).toBe(false);
    });
  });

  describe("4. Operational Invariants & External Provider Lockdown", () => {
    it("strictly blocks external providers (OpenAI, Anthropic, Gemini) with EXTERNAL_PROVIDER_DISABLED", async () => {
      const extProviders = ["openai", "anthropic", "gemini"] as const;

      for (const provider of extProviders) {
        const extProfile = await profileManager.createProfile({
          name: `Real ${provider} Profile`,
          provider,
          model: `${provider}-test-model`,
          endpoint: `https://api.${provider}.com/v1`,
          apiKey: `sk-${provider}-test-key`,
        });

        await expect(
          engine.prepareConsentPreview(testIncidentId, extProfile.id),
        ).rejects.toThrow(/EXTERNAL_PROVIDER_DISABLED/);
      }
    });

    it("fails closed with INCONCLUSO when incident has zero evidence and zero manual context", async () => {
      // No evidence in repository
      const preview = await engine.prepareConsentPreview(testIncidentId, testProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, testProfileId, preview.consentToken);

      expect(report.status).toBe("INCONCLUSO");
      expect(report.inconclusiveReason).toContain("No hay evidencias recolectadas ni contexto manual aportado");
      expect(report.tokenUsage.totalTokens).toBe(0);
      expect(report.estimatedCost).toBe(0.0);

      // Verify reservation was completed with 0 tokens
      const reservations = diagnosisRepo.listReservationsByIncident(testIncidentId);
      expect(reservations[0].status).toBe("COMPLETED");
      expect(reservations[0].totalTokens).toBe(0);
    });
  });
});
