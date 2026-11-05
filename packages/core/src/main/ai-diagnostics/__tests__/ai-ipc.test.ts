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
      throw new Error(`No handler registered for channel '${channel}'`);
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

describe("AI IPC Handlers & Input Validation (H8.3)", () => {
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
  let fakeIpc: FakeIpcMain;
  let cleanupIpc: () => void;

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
    );
    engine.setMockAdapterOverride(mockAdapter);

    fakeIpc = new FakeIpcMain();

    cleanupIpc = registerIncidentIpcHandlers(
      incidentRepo,
      evidenceRepo,
      undefined,
      undefined,
      {
        profileManager,
        diagnosisEngine: engine,
        remediationVerifier: verifier,
        diagnosisRepo,
      },
      fakeIpc as any,
    );

    const incident = incidentRepo.createIncident({
      clusterId: "c-test-cluster",
      namespace: "default",
      workloadKind: "Pod",
      workloadName: "frontend",
      title: "Crash on frontend",
      severity: "medium",
      creator: { id: "admin", type: "human", name: "Admin" },
    });
    testIncidentId = incident.id;

    const profile = await profileManager.createProfile({
      name: "Mock Fast",
      provider: "mock",
      model: "mock-v1",
      endpoint: "https://api.openai.com/v1",
      apiKey: "sk-test",
    });
    testProfileId = profile.id;
  });

  afterEach(() => {
    cleanupIpc();
    sqlite.close();
  });

  it("lists profiles over IPC with authorized sender", async () => {
    const event = createAuthorizedEvent();
    const profiles = await fakeIpc.invoke(incidentIpcChannels.aiListProfiles, event);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].id).toBe(testProfileId);
    expect(profiles[0].name).toBe("Mock Fast");
  });

  it("prepares consent preview and executes diagnosis over IPC", async () => {
    evidenceRepo.ingestEvidence({
      incidentId: testIncidentId,
      clusterId: "c-test-cluster",
      namespace: "default",
      type: "pod_logs",
      origin: "kubectl",
      rawContent: "Panic: out of memory",
    });

    const event = createAuthorizedEvent();

    // 1. Prepare consent
    const preview = await fakeIpc.invoke(incidentIpcChannels.aiPrepareConsent, event, {
      incidentId: testIncidentId,
      profileId: testProfileId,
    });

    expect(preview.incidentId).toBe(testIncidentId);
    expect(preview.consentToken).toBeDefined();

    // 2. Execute diagnosis
    const report = await fakeIpc.invoke(incidentIpcChannels.aiExecuteDiagnosis, event, {
      incidentId: testIncidentId,
      profileId: testProfileId,
      consentToken: preview.consentToken,
    });

    expect(report.status).toBe("CONCLUSIVE");
    expect(report.hypotheses.length).toBeGreaterThan(0);

    // 3. Query diagnosis history over IPC
    const diagnoses = await fakeIpc.invoke(incidentIpcChannels.aiListDiagnoses, event, testIncidentId);
    expect(diagnoses).toHaveLength(1);
    expect(diagnoses[0].id).toBe(report.id);

    const latest = await fakeIpc.invoke(incidentIpcChannels.aiGetLatestDiagnosis, event, testIncidentId);
    expect(latest?.id).toBe(report.id);
  });

  it("evaluates remediation over IPC", async () => {
    const evidence = evidenceRepo.ingestEvidence({
      incidentId: testIncidentId,
      clusterId: "c-test-cluster",
      namespace: "default",
      type: "pod_logs",
      origin: "kubectl",
      rawContent: "Started container. Listening on 8080. Ready.",
    });

    const event = createAuthorizedEvent();
    const result = await fakeIpc.invoke(incidentIpcChannels.aiVerifyRemediation, event, {
      incidentId: testIncidentId,
      humanOperator: "Gustavo Marcon",
      currentEvidenceId: evidence.evidence.id,
    });

    expect(result.outcome).toBe("HEALTHY");
    expect(result.humanOperator).toBe("Gustavo Marcon");
  });

  it("rejects calls with unauthorized sender frame origins", async () => {
    const maliciousEvent = {
      sender: { id: 2, isDestroyed: () => false },
      senderFrame: {
        url: "http://evil-attacker.com/exploit.html",
        parent: null,
        isDestroyed: () => false,
      },
    };

    await expect(
      fakeIpc.invoke(incidentIpcChannels.aiListProfiles, maliciousEvent),
    ).rejects.toThrow(/SecurityError/);
  });
});
