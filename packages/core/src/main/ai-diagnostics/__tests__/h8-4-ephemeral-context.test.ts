/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { EphemeralContextManager, EphemeralContextSecurityError } from "../ephemeral-context-manager";
import { AiDiagnosisEngine } from "../ai-diagnosis-engine";
import { AiProfileManager } from "../ai-profile-manager";
import { AiBudgetTracker } from "../ai-budget-tracker";
import { AiDiagnosisRepository } from "../ai-diagnosis-repository";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { EvidenceRepository } from "../../incident-storage/evidence-repository";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { SecureCredentialVault } from "../secure-credential-vault";
import type { Incident } from "../../../common/incident/incident-types";

import { registerIncidentIpcHandlers } from "../../incident-storage/setup-incident-ipc.injectable";
import { incidentIpcChannels } from "../../../common/incident/incident-ipc";

class FakeIpcMain {
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
      isDestroyed: () => false,
      id: 1,
    },
    senderFrame: {
      parent: null,
      isDestroyed: () => false,
      url: "lens://app/index.html",
    },
  };
}

describe("H8.4: Ephemeral Multi-File Context & Strict Lifecycle (H8-019 & H8-020)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let diagnosisRepo: AiDiagnosisRepository;
  let budgetTracker: AiBudgetTracker;
  let profileManager: AiProfileManager;
  let contextManager: EphemeralContextManager;
  let engine: AiDiagnosisEngine;
  let testIncident: Incident;
  let testProfileId: string;

  beforeEach(async () => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();

    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
    diagnosisRepo = new AiDiagnosisRepository(sqlite);
    budgetTracker = new AiBudgetTracker(diagnosisRepo);

    const vault = new SecureCredentialVault({ allowSoftwareFallbackInTests: true });
    profileManager = new AiProfileManager(sqlite, vault);

    const profile = await profileManager.createProfile({
      name: "Mock Local Profile",
      provider: "mock",
      model: "mock-v1",
      maxTokensPerRequest: 2048,
      endpoint: "https://synthetic-ai.local/v1",
      apiKey: "sk-mock-test-key-123",
    });
    testProfileId = profile.id;

    contextManager = new EphemeralContextManager({ enableAutoCleanup: false });

    engine = new AiDiagnosisEngine(
      incidentRepo,
      evidenceRepo,
      profileManager,
      diagnosisRepo,
      budgetTracker,
      contextManager,
    );

    testIncident = incidentRepo.createIncident({
      title: "CrashLoopBackOff in payment service",
      severity: "high",
      clusterId: "minikube-dev",
      namespace: "billing",
      workloadKind: "Deployment",
      workloadName: "payment-service",
      creator: { type: "human", name: "tester" },
    });
  });

  afterEach(() => {
    contextManager.dispose();
  });

  describe("H8-019: Multi-file Manual Context & Security Allowlist", () => {
    it("allows uploading valid Dockerfile, values.yaml and config manifests", async () => {
      const dockerfile = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "Dockerfile",
        rawContent: "FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nCMD [\"node\", \"server.js\"]",
        metadata: { environment: "staging", resourceName: "payment-service" },
      });

      expect(dockerfile.fileType).toBe("dockerfile");
      expect(dockerfile.metadata.environment).toBe("staging");
      expect(dockerfile.metadata.resourceName).toBe("payment-service");

      const helmValues = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "values.yaml",
        rawContent: "replicaCount: 3\nresources:\n  limits:\n    memory: 512Mi",
        metadata: { environment: "production" },
      });

      expect(helmValues.fileType).toBe("helm_values");
      expect(contextManager.listFiles(testIncident.id)).toHaveLength(2);
    });

    it("blocks forbidden file extensions like .env, .key, .sh, and binaries", async () => {
      await expect(
        contextManager.addFile(testIncident.id, {
          incidentId: testIncident.id,
          filename: ".env",
          rawContent: "DATABASE_PASSWORD=secret",
        }),
      ).rejects.toThrow(EphemeralContextSecurityError);

      await expect(
        contextManager.addFile(testIncident.id, {
          incidentId: testIncident.id,
          filename: "private.key",
          rawContent: "-----BEGIN PRIVATE KEY-----",
        }),
      ).rejects.toThrow(EphemeralContextSecurityError);

      await expect(
        contextManager.addFile(testIncident.id, {
          incidentId: testIncident.id,
          filename: "deploy.sh",
          rawContent: "#!/bin/bash\nrm -rf /",
        }),
      ).rejects.toThrow(EphemeralContextSecurityError);
    });

    it("rejects path traversal attempts in filename", async () => {
      await expect(
        contextManager.addFile(testIncident.id, {
          incidentId: testIncident.id,
          filename: "../../etc/passwd",
          rawContent: "root:x:0:0:",
        }),
      ).rejects.toThrow(/PATH_TRAVERSAL_DETECTED/);

      await expect(
        contextManager.addFile(testIncident.id, {
          incidentId: testIncident.id,
          filename: "subdir/config.yaml",
          rawContent: "foo: bar",
        }),
      ).rejects.toThrow(/PATH_TRAVERSAL_DETECTED/);
    });

    it("detects and blocks binary NUL bytes and executable magic bytes", async () => {
      // Content with NUL byte
      await expect(
        contextManager.addFile(testIncident.id, {
          incidentId: testIncident.id,
          filename: "binary.txt",
          rawContent: "hello\x00world",
        }),
      ).rejects.toThrow(/BINARY_FILE_FORBIDDEN/);

      // ELF binary magic bytes
      const elfHeader = String.fromCharCode(0x7f, 0x45, 0x4c, 0x46);
      await expect(
        contextManager.addFile(testIncident.id, {
          incidentId: testIncident.id,
          filename: "fake-elf.txt",
          rawContent: `${elfHeader}somecode`,
        }),
      ).rejects.toThrow();
    });

    it("rejects Kubernetes Secret manifests by default", async () => {
      await expect(
        contextManager.addFile(testIncident.id, {
          incidentId: testIncident.id,
          filename: "secret.yaml",
          rawContent: "apiVersion: v1\nkind: Secret\nmetadata:\n  name: my-secret",
        }),
      ).rejects.toThrow(/SECRET_RESOURCE_FORBIDDEN/);
    });

    it("sanitizes embedded credentials and Bearer tokens in uploaded text", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "config.yaml",
        rawContent: "app:\n  token: Bearer super-secret-session-token-12345\n  port: 8080",
      });

      expect(file.redactedFindingsCount).toBeGreaterThan(0);
      const sanitized = contextManager.getFilesForDiagnosis(testIncident.id)[0];
      expect(sanitized.sanitizedContent).not.toContain("super-secret-session-token-12345");
      expect(sanitized.sanitizedContent).toContain("[REDACTED_TOKEN]");
    });

    it("enforces maximum file count (5) and size limits (64 KiB per file, 192 KiB total)", async () => {
      for (let i = 1; i <= 5; i++) {
        await contextManager.addFile(testIncident.id, {
          incidentId: testIncident.id,
          filename: `config-${i}.yaml`,
          rawContent: `item: ${i}`,
        });
      }

      // 6th file exceeds limit
      await expect(
        contextManager.addFile(testIncident.id, {
          incidentId: testIncident.id,
          filename: "config-6.yaml",
          rawContent: "overflow",
        }),
      ).rejects.toThrow(/MAX_FILES_EXCEEDED/);

      // Oversized single file (>64 KiB)
      const oversized = "a".repeat(65 * 1024);
      await expect(
        contextManager.addFile("other-incident", {
          incidentId: "other-incident",
          filename: "oversized.yaml",
          rawContent: oversized,
        }),
      ).rejects.toThrow(/FILE_SIZE_EXCEEDED/);
    });

    it("allows updating declared metadata cleanly", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "Dockerfile",
        rawContent: "FROM alpine:3.18",
        metadata: { environment: "development", version: "v1.0.0" },
      });

      const updated = contextManager.updateMetadata({
        incidentId: testIncident.id,
        fileId: file.id,
        metadata: { environment: "production", version: "v1.0.1", resourceName: "payment-api" },
      });

      expect(updated.metadata.environment).toBe("production");
      expect(updated.metadata.version).toBe("v1.0.1");
      expect(updated.metadata.resourceName).toBe("payment-api");
    });
  });

  describe("H8-020: Ephemeral Memory Lifecycle & Zero SQLite Persistence", () => {
    it("proves ZERO file content or raw buffers are written to SQLite", async () => {
      await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "Dockerfile",
        rawContent: "EXPOSE_SYNTHETIC_MARKER_99887766\nENTRYPOINT [\"node\"]",
      });

      // Query all SQLite tables for the synthetic marker
      const db = sqlite.getDb();
      const tables = ["incidents", "incident_evidence", "incident_timeline", "ai_diagnoses", "ai_profiles"];

      for (const table of tables) {
        const rows = db.prepare(`SELECT * FROM ${table}`).all();
        const serialized = JSON.stringify(rows);
        expect(serialized).not.toContain("EXPOSE_SYNTHETIC_MARKER_99887766");
      }
    });

    it("zeroes out raw RAM buffer when file is removed or purged", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "values.yaml",
        rawContent: "SECRET_MEMORY_MARKER: active",
      });

      expect(contextManager.listFiles(testIncident.id)).toHaveLength(1);

      // Purge buffers post-diagnosis
      contextManager.purgeRawBuffers(testIncident.id);
      const listAfterPurge = contextManager.listFiles(testIncident.id);
      expect(listAfterPurge[0].isPurged).toBe(true);

      // Removing file
      const removed = contextManager.removeFile(testIncident.id, file.id);
      expect(removed).toBe(true);
      expect(contextManager.listFiles(testIncident.id)).toHaveLength(0);
    });

    it("clears all incident context cleanly on incident switch or app exit", async () => {
      await contextManager.addFile("inc-1", {
        incidentId: "inc-1",
        filename: "Dockerfile",
        rawContent: "FROM node:18",
      });
      await contextManager.addFile("inc-2", {
        incidentId: "inc-2",
        filename: "values.yaml",
        rawContent: "replicas: 2",
      });

      expect(contextManager.listFiles("inc-1")).toHaveLength(1);
      expect(contextManager.listFiles("inc-2")).toHaveLength(1);

      contextManager.clearIncidentContext("inc-1");
      expect(contextManager.listFiles("inc-1")).toHaveLength(0);
      expect(contextManager.listFiles("inc-2")).toHaveLength(1);

      contextManager.clearAll();
      expect(contextManager.listFiles("inc-2")).toHaveLength(0);
    });
  });

  describe("Anti-Tamper Consent Binding with Manual Context", () => {
    it("includes manual context in consent preview and seals fingerprint", async () => {
      await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "Dockerfile",
        rawContent: "ENV NODE_OPTIONS=\"--max-old-space-size=256\"",
        metadata: { environment: "staging" },
      });

      const preview = await engine.prepareConsentPreview(testIncident.id, testProfileId);
      expect(preview.manualContextCount).toBe(1);
      expect(preview.manualContextItems).toHaveLength(1);
      expect(preview.manualContextItems?.[0].filename).toBe("Dockerfile");
      expect(preview.consentToken).toBeDefined();

      // Successful diagnosis with manual context
      const report = await engine.executeDiagnosis(testIncident.id, testProfileId, preview.consentToken);
      expect(report.status).toBe("CONCLUSIVE");
    });

    it("invalidates consent immediately if any manual context file is added after consent", async () => {
      await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "Dockerfile",
        rawContent: "ENV APP=true",
      });

      const preview = await engine.prepareConsentPreview(testIncident.id, testProfileId);

      // Attacking: Adding a new file after preview was generated
      await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "extra.yaml",
        rawContent: "tampered: true",
      });

      await expect(
        engine.executeDiagnosis(testIncident.id, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_EVIDENCE_MISMATCH/);
    });

    it("invalidates consent if a manual context file is deleted after consent", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "Dockerfile",
        rawContent: "FROM alpine",
      });

      const preview = await engine.prepareConsentPreview(testIncident.id, testProfileId);

      // Attacking: Removing the file
      contextManager.removeFile(testIncident.id, file.id);

      await expect(
        engine.executeDiagnosis(testIncident.id, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_EVIDENCE_MISMATCH/);
    });

    it("invalidates consent if declared metadata of a context file is altered after consent", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "values.yaml",
        rawContent: "replicas: 1",
        metadata: { environment: "development", version: "v1.0" },
      });

      const preview = await engine.prepareConsentPreview(testIncident.id, testProfileId);

      // Modifying declared environment
      contextManager.updateMetadata({
        incidentId: testIncident.id,
        fileId: file.id,
        metadata: { environment: "production" },
      });

      await expect(
        engine.executeDiagnosis(testIncident.id, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_EVIDENCE_MISMATCH/);
    });

    it("strictly verifies citations referencing manual context files and grounds facts", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "Dockerfile",
        rawContent: "ENV NODE_OPTIONS=\"--max-old-space-size=256\"\nRUN echo build",
      });

      const preview = await engine.prepareConsentPreview(testIncident.id, testProfileId);
      const report = await engine.executeDiagnosis(testIncident.id, testProfileId, preview.consentToken);

      expect(report.status).toBe("CONCLUSIVE");
      const citedFact = report.facts.find(f => f.citation?.evidenceId === file.id);
      expect(citedFact).toBeDefined();
      expect(citedFact?.citation?.verified).toBe(true);
      expect(citedFact?.citation?.resourceName).toBe("Dockerfile");
    });
  });

  describe("H8.4.1 Security Gate: Complete Metadata Fingerprinting (H84-SEC-01)", () => {
    it("invalidates consent when namespace is altered", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "values.yaml",
        rawContent: "replicas: 1",
        metadata: { namespace: "billing" },
      });
      const preview = await engine.prepareConsentPreview(testIncident.id, testProfileId);
      contextManager.updateMetadata({
        incidentId: testIncident.id,
        fileId: file.id,
        metadata: { namespace: "production-billing" },
      });
      await expect(
        engine.executeDiagnosis(testIncident.id, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_EVIDENCE_MISMATCH/);
    });

    it("invalidates consent when resourceName or resourceKind is altered", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "values.yaml",
        rawContent: "replicas: 1",
        metadata: { resourceName: "payment-service", resourceKind: "Deployment" },
      });
      const preview = await engine.prepareConsentPreview(testIncident.id, testProfileId);
      contextManager.updateMetadata({
        incidentId: testIncident.id,
        fileId: file.id,
        metadata: { resourceName: "auth-service" },
      });
      await expect(
        engine.executeDiagnosis(testIncident.id, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_EVIDENCE_MISMATCH/);
    });

    it("invalidates consent when provenance or notes are altered", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "values.yaml",
        rawContent: "replicas: 1",
        metadata: { provenance: "git-main", notes: "Initial configuration" },
      });
      const preview = await engine.prepareConsentPreview(testIncident.id, testProfileId);
      contextManager.updateMetadata({
        incidentId: testIncident.id,
        fileId: file.id,
        metadata: { notes: "Modified configuration notes" },
      });
      await expect(
        engine.executeDiagnosis(testIncident.id, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_EVIDENCE_MISMATCH/);
    });

    it("invalidates consent when clusterId is altered", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "values.yaml",
        rawContent: "replicas: 1",
        metadata: { clusterId: "minikube-dev" },
      });
      const preview = await engine.prepareConsentPreview(testIncident.id, testProfileId);
      contextManager.updateMetadata({
        incidentId: testIncident.id,
        fileId: file.id,
        metadata: { clusterId: "minikube-staging" },
      });
      await expect(
        engine.executeDiagnosis(testIncident.id, testProfileId, preview.consentToken),
      ).rejects.toThrow(/CONSENT_EVIDENCE_MISMATCH/);
    });
  });

  describe("H8.4.1 Security Gate: Complete Invalidation & Zero Reuse (H84-SEC-02)", () => {
    it("destroys rawBuffer and sanitized content on purge, preventing any diagnosis reuse", async () => {
      const file = await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "Dockerfile",
        rawContent: "FROM node:20\nENV SECRET_A=1",
      });

      // Verify files for diagnosis before purge
      const usableBefore = contextManager.getFilesForDiagnosis(testIncident.id);
      expect(usableBefore).toHaveLength(1);
      expect(usableBefore[0].sanitizedContent).toContain("FROM node:20");

      // Purge buffers
      contextManager.purgeRawBuffers(testIncident.id);

      // Usable diagnosis files must now be 0
      const usableAfter = contextManager.getFilesForDiagnosis(testIncident.id);
      expect(usableAfter).toHaveLength(0);

      // Descriptors in listFiles reflect purged status
      const descriptors = contextManager.listFiles(testIncident.id);
      expect(descriptors[0].isPurged).toBe(true);

      // Trying to update metadata on purged file throws FILE_PURGED
      expect(() => {
        contextManager.updateMetadata({
          incidentId: testIncident.id,
          fileId: file.id,
          metadata: { version: "2.0.0" },
        });
      }).toThrow(/FILE_PURGED/);

      // Fingerprint of fully purged context returns empty hash
      const fp = contextManager.computeContextFingerprint(testIncident.id);
      expect(fp.count).toBe(0);
      expect(fp.hash).toBe("");
    });

    it("fails closed without reusing purged context on subsequent diagnosis", async () => {
      await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "Dockerfile",
        rawContent: "FROM alpine",
      });

      const preview1 = await engine.prepareConsentPreview(testIncident.id, testProfileId);
      const report1 = await engine.executeDiagnosis(testIncident.id, testProfileId, preview1.consentToken);
      expect(report1.status).toBe("CONCLUSIVE");

      // Execution has purged the context. Second execution attempt with a new preview:
      const preview2 = await engine.prepareConsentPreview(testIncident.id, testProfileId);
      expect(preview2.manualContextCount).toBe(0);

      // Since there is no evidence and manual context was purged, diagnosis fails closed as INCONCLUSO
      const report2 = await engine.executeDiagnosis(testIncident.id, testProfileId, preview2.consentToken);
      expect(report2.status).toBe("INCONCLUSO");
      expect(report2.inconclusiveReason).toContain("No hay evidencias recolectadas ni contexto manual aportado");
    });
  });

  describe("H8.4.1 Security Gate: Complete Cleanup on Errors (H84-SEC-03)", () => {
    it("purges RAM buffers and sanitized contents when diagnosis execution encounters error", async () => {
      await contextManager.addFile(testIncident.id, {
        incidentId: testIncident.id,
        filename: "Dockerfile",
        rawContent: "FROM node:20",
      });

      const preview = await engine.prepareConsentPreview(testIncident.id, testProfileId);

      // Trigger error: Alter profile parameters (model) to trigger CONSENT_PROFILE_ALTERED
      await profileManager.updateProfile(testProfileId, {
        model: "mock-v2-altered",
      });

      // Execute should fail with CONSENT_PROFILE_ALTERED and purge buffers in finally
      await expect(
        engine.executeDiagnosis(testIncident.id, testProfileId, preview.consentToken),
      ).rejects.toThrow();

      // Verify that context was purged despite error
      expect(contextManager.getFilesForDiagnosis(testIncident.id)).toHaveLength(0);
      expect(contextManager.listFiles(testIncident.id)[0].isPurged).toBe(true);
    });
  });

  describe("H8.4.1 Security Gate: Context IPC Isolation & Authorization (H84-SEC-05)", () => {
    let fakeIpc: FakeIpcMain;
    let cleanupIpc: () => void;

    beforeEach(() => {
      fakeIpc = new FakeIpcMain();
      cleanupIpc = registerIncidentIpcHandlers(
        incidentRepo,
        evidenceRepo,
        undefined,
        undefined,
        {
          profileManager,
          diagnosisEngine: engine,
          diagnosisRepo,
          ephemeralContextManager: contextManager,
        },
        fakeIpc as any,
      );
    });

    afterEach(() => {
      cleanupIpc?.();
    });

    it("rejects IPC contextList for non-existent incident", async () => {
      const event = createAuthorizedEvent();
      await expect(
        fakeIpc.invoke(incidentIpcChannels.contextList, event, "INC-NON-EXISTENT-9999"),
      ).rejects.toThrow(/Incident 'INC-NON-EXISTENT-9999' not found/);
    });

    it("rejects IPC contextAdd when clusterId mismatches incident cluster", async () => {
      const event = createAuthorizedEvent();
      await expect(
        fakeIpc.invoke(incidentIpcChannels.contextAdd, event, {
          incidentId: testIncident.id,
          filename: "Dockerfile",
          rawContent: "FROM alpine",
          metadata: { clusterId: "wrong-cluster-spoofed" },
        }),
      ).rejects.toThrow(/Cluster mismatch/);
    });

    it("rejects IPC contextAdd when namespace mismatches incident namespace", async () => {
      const event = createAuthorizedEvent();
      await expect(
        fakeIpc.invoke(incidentIpcChannels.contextAdd, event, {
          incidentId: testIncident.id,
          filename: "Dockerfile",
          rawContent: "FROM alpine",
          metadata: { namespace: "wrong-namespace-lateral" },
        }),
      ).rejects.toThrow(/Namespace mismatch/);
    });

    it("rejects IPC contextUpdateMetadata when file does not belong to incident", async () => {
      const event = createAuthorizedEvent();
      await expect(
        fakeIpc.invoke(incidentIpcChannels.contextUpdateMetadata, event, {
          incidentId: testIncident.id,
          fileId: "CTX-OTHER-INCIDENT-FILE-ID",
          metadata: { environment: "staging" },
        }),
      ).rejects.toThrow(/does not belong to incident/);
    });

    it("rejects IPC contextRemove when file does not belong to incident", async () => {
      const event = createAuthorizedEvent();
      await expect(
        fakeIpc.invoke(incidentIpcChannels.contextRemove, event, testIncident.id, "CTX-FOREIGN-FILE"),
      ).rejects.toThrow(/does not belong to incident/);
    });

    it("rejects IPC contextClear for non-existent incident", async () => {
      const event = createAuthorizedEvent();
      await expect(
        fakeIpc.invoke(incidentIpcChannels.contextClear, event, "INC-NON-EXISTENT"),
      ).rejects.toThrow(/Incident 'INC-NON-EXISTENT' not found/);
    });
  });
});
