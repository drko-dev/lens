/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { EvidenceRepository } from "../../incident-storage/evidence-repository";
import { SecureCredentialVault } from "../secure-credential-vault";
import { AiProfileManager } from "../ai-profile-manager";
import { AiDefaultProfileService } from "../ai-default-profile-service";
import { AiDiagnosisRepository } from "../ai-diagnosis-repository";
import { AiBudgetTracker } from "../ai-budget-tracker";
import { AiDiagnosisEngine } from "../ai-diagnosis-engine";
import { MockAiProviderAdapter } from "../providers/ai-provider-adapter";
import { DefaultSecureAiTransport } from "../transport/secure-ai-transport";

/**
 * H8.8-06a QA: the global default provider is persisted in SQLite (ai_settings id 'default'),
 * survives a restart on the same DB file, and is shared by every cluster while consent
 * stays bound to the incident's cluster and namespace.
 */
describe("H8.8-06a persistence: global default provider (ai_settings)", () => {
  let dir: string;
  let dbPath: string;
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let manager: AiProfileManager;
  let service: AiDefaultProfileService;
  let engine: AiDiagnosisEngine;
  let transport: DefaultSecureAiTransport;

  const boot = () => {
    sqlite = new SqliteClient({ dbPath, migrations: ALL_MIGRATIONS });
    sqlite.init();
    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
    manager = new AiProfileManager(sqlite, new SecureCredentialVault());
    transport = new DefaultSecureAiTransport();
    engine = new AiDiagnosisEngine(
      incidentRepo,
      evidenceRepo,
      manager,
      new AiDiagnosisRepository(sqlite),
      new AiBudgetTracker(new AiDiagnosisRepository(sqlite)),
      { transport },
    );
    engine.setMockAdapterOverride(new MockAiProviderAdapter());
    service = new AiDefaultProfileService(sqlite, manager, transport, engine);
  };

  const defaultRowCount = (): number =>
    (sqlite.getDb().prepare("SELECT COUNT(*) AS n FROM ai_settings").get() as { n: number }).n;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "h8-8-06a-persist-"));
    dbPath = path.join(dir, "incidents.db");
    boot();
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the default provider after a simulated restart with a fresh SqliteClient and service", async () => {
    const demo = await service.ensureDemoProfile();
    const demoId = demo.profile?.id;

    sqlite.close();
    boot();

    const after = await service.getStatus();
    expect(after.state).toBe("demo_offline");
    expect(after.profile?.id).toBe(demoId);
    expect(after.profile?.name).toBe("Demo offline (sintético)");
  });

  it("keeps a cleared default cleared after restart (not_configured, not a stale id)", async () => {
    const demo = await service.ensureDemoProfile();
    await service.setDefault(null);

    sqlite.close();
    boot();

    expect(demo.profile?.id).toBeDefined();
    expect((await service.getStatus()).state).toBe("not_configured");
  });

  it("stores exactly one global default row no matter how many times it changes", async () => {
    const a = await manager.createProfile({ name: "A", provider: "mock", model: "mock-v1", apiKey: "sk-a-secret-111111" } as any);
    const b = await manager.createProfile({ name: "B", provider: "mock", model: "mock-v1", apiKey: "sk-b-secret-222222" } as any);

    await service.setDefault(a.id);
    await service.setDefault(b.id);
    await service.setDefault(a.id);

    expect(defaultRowCount()).toBe(1);
    expect((await service.getStatus()).profile?.id).toBe(a.id);
  });

  it("applies the same default to incidents in different clusters and namespaces", async () => {
    await service.ensureDemoProfile();
    const defaultId = (await service.getStatus()).profile?.id;
    const incA = incidentRepo.createIncident({
      clusterId: "cluster-east", namespace: "payments", workloadKind: "Pod", workloadName: "api-a",
      title: "OOM east", severity: "high", creator: { id: "qa", type: "human", name: "QA" },
    });
    const incB = incidentRepo.createIncident({
      clusterId: "cluster-west", namespace: "search", workloadKind: "Pod", workloadName: "api-b",
      title: "OOM west", severity: "high", creator: { id: "qa", type: "human", name: "QA" },
    });
    evidenceRepo.ingestEvidence({
      incidentId: incA.id, clusterId: "cluster-east", namespace: "payments", type: "pod_logs", origin: "kubectl",
      rawContent: "OOMKilled 137",
    });
    evidenceRepo.ingestEvidence({
      incidentId: incB.id, clusterId: "cluster-west", namespace: "search", type: "pod_logs", origin: "kubectl",
      rawContent: "OOMKilled 137",
    });

    const prepareSpy = jest.spyOn(engine, "prepareConsentPreview");
    const previewA = await engine.prepareConsentPreview(incA.id, defaultId as string);
    const previewB = await engine.prepareConsentPreview(incB.id, defaultId as string);

    expect(prepareSpy.mock.calls.map(([, pid]) => pid)).toEqual([defaultId, defaultId]);
    expect(previewA.profileName).toBe(previewB.profileName);
    expect(previewA.clusterId).toBe("cluster-east");
    expect(previewA.namespace).toBe("payments");
    expect(previewB.clusterId).toBe("cluster-west");
    expect(previewB.namespace).toBe("search");
    expect(previewA.consentToken).not.toBe(previewB.consentToken);
    expect((await service.getStatus()).profile?.id).toBe(defaultId);
  });

  it("refuses a cluster-east consent token when executed for a cluster-west incident (CONSENT_SCOPE_MISMATCH)", async () => {
    // Note: the engine's first scope check is incidentId equality; cluster binding is only reached
    // through the same incident id, so this asserts the observable refusal, not the cluster branch alone.
    await service.ensureDemoProfile();
    const defaultId = (await service.getStatus()).profile?.id as string;
    const incA = incidentRepo.createIncident({
      clusterId: "cluster-east", namespace: "payments", workloadKind: "Pod", workloadName: "api-a",
      title: "OOM east", severity: "high", creator: { id: "qa", type: "human", name: "QA" },
    });
    const incB = incidentRepo.createIncident({
      clusterId: "cluster-west", namespace: "search", workloadKind: "Pod", workloadName: "api-b",
      title: "OOM west", severity: "high", creator: { id: "qa", type: "human", name: "QA" },
    });
    evidenceRepo.ingestEvidence({
      incidentId: incA.id, clusterId: "cluster-east", namespace: "payments", type: "pod_logs", origin: "kubectl",
      rawContent: "OOMKilled 137",
    });
    const preview = await engine.prepareConsentPreview(incA.id, defaultId);
    const executeSpy = jest.spyOn(engine, "executeDiagnosis");

    await expect(engine.executeDiagnosis(incB.id, defaultId, preview.consentToken)).rejects.toThrow(/CONSENT_SCOPE_MISMATCH/);
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });
});
