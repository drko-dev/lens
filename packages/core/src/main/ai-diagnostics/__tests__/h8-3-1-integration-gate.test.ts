/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { EvidenceRepository } from "../../incident-storage/evidence-repository";
import {
  SecureCredentialVault,
  SoftwareAesGcmBackend,
  SafeStorageBackend,
} from "../secure-credential-vault";
import { AiProfileManager } from "../ai-profile-manager";
import { AiDiagnosisRepository } from "../ai-diagnosis-repository";
import { AiBudgetTracker } from "../ai-budget-tracker";
import { AiDiagnosisEngine } from "../ai-diagnosis-engine";
import { MockAiProviderAdapter } from "../providers/ai-provider-adapter";
import { registerIncidentIpcHandlers } from "../../incident-storage/setup-incident-ipc.injectable";
import { incidentIpcChannels } from "../../../common/incident/incident-ipc";

class MockIpc {
  public readonly handlers = new Map<string, (event: any, ...args: any[]) => Promise<any> | any>();

  public handle(channel: string, listener: (event: any, ...args: any[]) => Promise<any> | any): void {
    this.handlers.set(channel, listener);
  }

  public removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  public async invoke(channel: string, event: any, ...args: any[]): Promise<any> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`Handler not found for channel '${channel}'`);
    }
    return handler(event, ...args);
  }
}

function createAuthorizedEvent(): any {
  return {
    sender: {
      id: 1,
      isDestroyed: () => false,
    },
    senderFrame: {
      url: "http://localhost:9191/index.html",
      parent: null,
      isDestroyed: () => false,
    },
  };
}

describe("H8.3.1 Integration Gate: DI, Persistent Vault, Immutable Consent & Strict Citations", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let vault: SecureCredentialVault;
  let profileManager: AiProfileManager;
  let diagnosisRepo: AiDiagnosisRepository;
  let budgetTracker: AiBudgetTracker;
  let engine: AiDiagnosisEngine;
  let mockAdapter: MockAiProviderAdapter;

  let testIncidentId: string;
  let mockProfileId: string;

  beforeEach(async () => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();

    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);

    // Initialize vault with SQLite persistent storage and deterministic software backend for testing
    vault = new SecureCredentialVault({
      sqlite,
      backend: new SoftwareAesGcmBackend(Buffer.alloc(32, 7)),
    });

    profileManager = new AiProfileManager(sqlite, vault);
    diagnosisRepo = new AiDiagnosisRepository(sqlite);
    budgetTracker = new AiBudgetTracker(diagnosisRepo);

    mockAdapter = new MockAiProviderAdapter();
    engine = new AiDiagnosisEngine(
      incidentRepo,
      evidenceRepo,
      profileManager,
      diagnosisRepo,
      budgetTracker,
    );
    engine.setMockAdapterOverride(mockAdapter);

    const incident = incidentRepo.createIncident({
      clusterId: "c-prod-aws",
      namespace: "checkout",
      workloadKind: "Deployment",
      workloadName: "cart-service",
      title: "Cart service pod failure",
      severity: "high",
      creator: { id: "devops-engineer", type: "human", name: "DevOps Engineer" },
    });
    testIncidentId = incident.id;

    const profile = await profileManager.createProfile({
      name: "Mock Local Diagnostic",
      provider: "mock",
      model: "mock-diagnostics-v1",
      endpoint: "https://synthetic-ai.local/v1",
      apiKey: "sk-mock-key-testing",
    });
    mockProfileId = profile.id;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("Item 1 & 2: Persistent OS-Encrypted Vault & Restart Recovery", () => {
    it("persists encrypted credential in SQLite table and successfully recovers it across vault restarts", async () => {
      // 1. Create a profile storing a secret key
      const profile = await profileManager.createProfile({
        name: "Restart Recovery Profile",
        provider: "mock",
        model: "mock-model",
        apiKey: "sk-FAKE_TEST_ONLY_NOT_A_REAL_KEY_0004",
      });

      // 2. Verify raw SQLite contains ciphertext in ai_vault_credentials, but NOT plaintext
      const db = sqlite.getDb();
      const rawRow = db
        .prepare("SELECT * FROM ai_vault_credentials WHERE credential_ref = ?")
        .get(profile.credentialRef) as any;

      expect(rawRow).toBeDefined();
      expect(rawRow.credential_ref).toBe(profile.credentialRef);
      expect(Buffer.isBuffer(rawRow.ciphertext)).toBe(true);

      // Raw DB record must NOT contain plaintext key anywhere
      const rawDbDump = JSON.stringify(rawRow);
      expect(rawDbDump).not.toContain("sk-FAKE_TEST_ONLY_NOT_A_REAL_KEY_0004");

      // 3. Simulate process restart by creating a brand new vault and profile manager sharing same SQLite
      const newVault = new SecureCredentialVault({
        sqlite,
        backend: new SoftwareAesGcmBackend(Buffer.alloc(32, 7)),
      });
      const newProfileManager = new AiProfileManager(sqlite, newVault);

      // Decrypt through the new manager
      const recoveredKey = await newProfileManager.getApiKeyForProfile(profile.id);
      expect(recoveredKey).toBe("sk-FAKE_TEST_ONLY_NOT_A_REAL_KEY_0004");
    });

    it("fails closed in production environment if OS safeStorage is unavailable", () => {
      const origEnv = process.env.NODE_ENV;
      const origWorkerId = process.env.JEST_WORKER_ID;
      try {
        delete (process.env as any).NODE_ENV;
        delete (process.env as any).JEST_WORKER_ID;

        // safeStorage mock where isEncryptionAvailable returns false
        const fakeUnavailableSafeStorage = {
          isEncryptionAvailable: () => false,
        };

        expect(() => {
          new SecureCredentialVault({
            backend: new SafeStorageBackend(fakeUnavailableSafeStorage),
            allowSoftwareFallbackInTests: false,
          });
        }).not.toThrow(); // passing explicit backend doesn't throw in constructor, but calling encrypt fails:

        const vaultWithUnavailableBackend = new SecureCredentialVault({
          backend: new SafeStorageBackend(fakeUnavailableSafeStorage),
        });

        expect(vaultWithUnavailableBackend.storeCredential("test-key")).rejects.toThrow(
          /Electron safeStorage is not available/,
        );
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.JEST_WORKER_ID = origWorkerId;
      }
    });
  });

  describe("Item 3: Disabled External Providers in H8.3.1 Gate", () => {
    it("refuses to prepare consent or execute diagnosis for external providers without mock override", async () => {
      // Create external profile (e.g. OpenAI)
      const openaiProfile = await profileManager.createProfile({
        name: "OpenAI GPT-4",
        provider: "openai",
        model: "gpt-4o",
        apiKey: "sk-test-external",
      });

      // Clear mock override on engine to test production gate behavior
      engine.setMockAdapterOverride(undefined);

      await expect(
        engine.prepareConsentPreview(testIncidentId, openaiProfile.id),
      ).rejects.toThrow(/EXTERNAL_PROVIDER_DISABLED/);
    });
  });

  describe("Item 4: Immutable Evidence Fingerprint & Tamper-Proof Consent Binding", () => {
    it("seals evidence fingerprint into consent token and invalidates execution if evidences change", async () => {
      // 1. Ingest initial evidence
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-aws",
        namespace: "checkout",
        type: "pod_logs",
        origin: "kubectl",
        rawContent: "Error: connection reset by peer",
      });

      // 2. Generate consent preview
      const preview = await engine.prepareConsentPreview(testIncidentId, mockProfileId);
      expect(preview.consentToken).toBeDefined();

      // 3. TAMPER: Ingest a new evidence into the incident AFTER consent was generated
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-aws",
        namespace: "checkout",
        type: "k8s_event",
        origin: "k8s",
        rawContent: "Warning FailedScheduling 0/10 nodes available",
      });

      // 4. Execution with the previous token MUST fail with CONSENT_EVIDENCE_MISMATCH
      await expect(
        engine.executeDiagnosis(testIncidentId, mockProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_EVIDENCE_MISMATCH/);
    });

    it("invalidates consent if profile parameters (endpoint/model) were altered after consent", async () => {
      evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-aws",
        namespace: "checkout",
        type: "pod_logs",
        origin: "kubectl",
        rawContent: "Disk full error on volume /data",
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, mockProfileId);

      // TAMPER: Update profile model before execution
      await profileManager.updateProfile(mockProfileId, {
        model: "tampered-model-v2",
      });

      await expect(
        engine.executeDiagnosis(testIncidentId, mockProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_PROFILE_ALTERED/);
    });
  });

  describe("Item 5: Strict Citation Content & Alignment Verification", () => {
    it("flags citation as unverified if the excerpt text does not exist in the actual evidence content", async () => {
      const ev = evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-aws",
        namespace: "checkout",
        type: "pod_logs",
        origin: "kubectl",
        rawContent: "2026-11-05T12:00:00Z Connection refused to postgres:5432 after 5 attempts",
      });

      // Simulate model returning valid evidence ID, but hallucinating the quote excerpt
      mockAdapter.setBehavior("custom", {
        status: "CONCLUSIVE",
        facts: [
          {
            text: "El pod terminó por OOMKilled",
            citation: {
              evidenceId: ev.evidence.id, // Valid ID
              excerpt: "Container terminated with exit code 137 OOMKilled", // Hallucinated quote not in rawContent!
            },
          },
        ],
        hypotheses: [
          {
            id: "hyp-oom",
            title: "Memoria insuficiente",
            confidence: 0.9,
            rationale: "Fallo de memoria",
            citationIds: [ev.evidence.id],
          },
        ],
        contradictions: [],
        missingInformation: [],
        recommendedNextSteps: [],
        tokenUsage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, mockProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, mockProfileId, preview.consentToken);

      // Fact citation must be flagged unverified because excerpt does not match content
      expect(report.facts[0].citation?.verified).toBe(false);

      // Report status must be downgraded to INCONCLUSO because citations lack grounding
      expect(report.status).toBe("INCONCLUSO");
      expect(report.inconclusiveReason).toContain("degradado a INCONCLUSO");
    });

    it("verifies citation when evidenceId and excerpt text strictly match evidence content", async () => {
      const ev = evidenceRepo.ingestEvidence({
        incidentId: testIncidentId,
        clusterId: "c-prod-aws",
        namespace: "checkout",
        type: "pod_logs",
        origin: "kubectl",
        rawContent: "2026-11-05T12:00:00Z Connection refused to postgres:5432 after 5 attempts",
      });

      mockAdapter.setBehavior("custom", {
        status: "CONCLUSIVE",
        facts: [
          {
            text: "Fallo de conexión a base de datos",
            citation: {
              evidenceId: ev.evidence.id,
              excerpt: "Connection refused to postgres:5432", // Real substring in content!
            },
          },
        ],
        hypotheses: [
          {
            id: "hyp-db",
            title: "Inaccesibilidad de Postgres",
            confidence: 0.95,
            rationale: "Registros muestran conexión rechazada",
            citationIds: [ev.evidence.id],
          },
        ],
        contradictions: [],
        missingInformation: [],
        recommendedNextSteps: ["Verificar pod de postgres"],
        tokenUsage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
      });

      const preview = await engine.prepareConsentPreview(testIncidentId, mockProfileId);
      const report = await engine.executeDiagnosis(testIncidentId, mockProfileId, preview.consentToken);

      expect(report.status).toBe("CONCLUSIVE");
      expect(report.facts[0].citation?.verified).toBe(true);
      expect(report.hypotheses[0].citationIds).toContain(ev.evidence.id);
    });
  });

  describe("Item 1: End-to-End IPC Registration & Profile Lifecycle Handlers", () => {
    it("handles create, update, list, and delete profile over secure IPC", async () => {
      const fakeIpc = new MockIpc();
      const cleanup = registerIncidentIpcHandlers(
        incidentRepo,
        evidenceRepo,
        undefined,
        undefined,
        {
          profileManager,
          diagnosisEngine: engine,
          diagnosisRepo,
        },
        fakeIpc as any,
      );

      const event = createAuthorizedEvent();

      // 1. Create Profile over IPC
      const created = await fakeIpc.invoke(incidentIpcChannels.aiCreateProfile, event, {
        name: "Test IPC Profile",
        provider: "mock",
        model: "mock-v2",
        apiKey: "sk-ipc-key-secret",
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe("Test IPC Profile");

      // 2. List Profiles over IPC
      const list = await fakeIpc.invoke(incidentIpcChannels.aiListProfiles, event);
      expect(list.some((p: any) => p.id === created.id)).toBe(true);

      // 3. Update Profile over IPC
      const updated = await fakeIpc.invoke(incidentIpcChannels.aiUpdateProfile, event, created.id, {
        name: "Updated IPC Profile",
      });
      expect(updated.name).toBe("Updated IPC Profile");

      // 4. Delete Profile over IPC
      const delResult = await fakeIpc.invoke(incidentIpcChannels.aiDeleteProfile, event, created.id);
      expect(delResult.success).toBe(true);

      const listAfter = await fakeIpc.invoke(incidentIpcChannels.aiListProfiles, event);
      expect(listAfter.some((p: any) => p.id === created.id)).toBe(false);

      cleanup();
    });
  });
});
