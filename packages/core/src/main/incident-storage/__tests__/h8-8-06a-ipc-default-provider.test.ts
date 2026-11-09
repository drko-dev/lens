/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../sqlite-client";
import { ALL_MIGRATIONS } from "../migrations";
import { IncidentRepository } from "../incident-repository";
import { EvidenceRepository } from "../evidence-repository";
import { registerIncidentIpcHandlers } from "../setup-incident-ipc.injectable";
import { incidentIpcChannels } from "../../../common/incident/incident-ipc";
import { AiProfileManager } from "../../ai-diagnostics/ai-profile-manager";
import { AiDiagnosisRepository } from "../../ai-diagnostics/ai-diagnosis-repository";
import { AiBudgetTracker } from "../../ai-diagnostics/ai-budget-tracker";
import { AiDiagnosisEngine } from "../../ai-diagnostics/ai-diagnosis-engine";
import { AiDefaultProfileService } from "../../ai-diagnostics/ai-default-profile-service";
import { MockAiProviderAdapter } from "../../ai-diagnostics/providers/ai-provider-adapter";
import { RemediationVerifier } from "../../ai-diagnostics/remediation-verifier";
import { SecureCredentialVault } from "../../ai-diagnostics/secure-credential-vault";
import { DefaultSecureAiTransport } from "../../ai-diagnostics/transport/secure-ai-transport";

/**
 * H8.8-06a QA: adversarial IPC surface for the single global default AI provider,
 * secret hygiene of renderer-facing responses and logs, and the synthetic OOM flow.
 * Everything is driven through the registered IPC handlers (FakeIpcMain), like ai-ipc.test.ts.
 */

class FakeIpcMain {
  public readonly handlers = new Map<string, (event: any, ...args: any[]) => any>();

  public handle(channel: string, listener: (event: any, ...args: any[]) => any): void {
    this.handlers.set(channel, listener);
  }

  public async invoke(channel: string, event: any, ...args: any[]): Promise<any> {
    const handler = this.handlers.get(channel);

    if (!handler) {
      throw new Error(`No handler registered for channel '${channel}'`);
    }

    return handler(event, ...args);
  }
}

const authorizedEvent = (): any => ({
  sender: { id: 1, isDestroyed: () => false },
  senderFrame: { url: "http://localhost:9191/index.html", parent: null, isDestroyed: () => false },
});

const foreignEvent = (): any => ({
  sender: { id: 2, isDestroyed: () => false },
  senderFrame: { url: "http://evil.example.com/x.html", parent: null, isDestroyed: () => false },
});

function createFixture() {
  const sqlite = new SqliteClient({ dbPath: ":memory:", migrations: ALL_MIGRATIONS });
  sqlite.init();

  const incidentRepo = new IncidentRepository(sqlite);
  const evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
  const profileManager = new AiProfileManager(sqlite, new SecureCredentialVault());
  const diagnosisRepo = new AiDiagnosisRepository(sqlite);
  const budgetTracker = new AiBudgetTracker(diagnosisRepo);
  const remediationVerifier = new RemediationVerifier(incidentRepo, evidenceRepo);

  // Real network engine is replaced by a spy: any dispatch is a test failure.
  const dispatch = jest.fn(async () => {
    throw new Error("real network engine must not be reached in H8.8-06a");
  });
  const transport = new DefaultSecureAiTransport({ engine: { dispatch } as any });

  const engine = new AiDiagnosisEngine(
    incidentRepo,
    evidenceRepo,
    profileManager,
    diagnosisRepo,
    budgetTracker,
    { transport },
  );
  const adapter = new MockAiProviderAdapter();
  const adapterSpy = jest.spyOn(adapter, "generateDiagnosis");
  engine.setMockAdapterOverride(adapter);

  const defaultProfileService = new AiDefaultProfileService(sqlite, profileManager, transport, engine);
  const fakeIpc = new FakeIpcMain();
  const cleanupIpc = registerIncidentIpcHandlers(
    incidentRepo,
    evidenceRepo,
    undefined,
    undefined,
    {
      profileManager,
      diagnosisEngine: engine,
      remediationVerifier,
      diagnosisRepo,
      defaultProfileService,
    },
    fakeIpc as any,
  );

  const invoke = (channel: string, ...args: any[]) => fakeIpc.invoke(channel, authorizedEvent(), ...args);

  const seedIncident = (clusterId: string, namespace: string, title = "OOMKilled checkout-api") =>
    incidentRepo.createIncident({
      clusterId,
      namespace,
      workloadKind: "Deployment",
      workloadName: "checkout-api",
      title,
      severity: "high",
      creator: { id: "qa", type: "human", name: "QA" },
    });

  const seedOomEvidence = (incidentId: string, clusterId: string, namespace: string) =>
    evidenceRepo.ingestEvidence({
      incidentId,
      clusterId,
      namespace,
      type: "pod_logs",
      origin: "kubectl",
      rawContent: "Last State: Terminated Reason: OOMKilled Exit Code: 137. fatal error: runtime: out of memory",
    });

  const mockProfile = (name: string) =>
    profileManager.createProfile({
      name,
      provider: "mock",
      model: "mock-v1",
      apiKey: `sk-qa-${name}-secret`,
    } as any);

  return {
    sqlite,
    incidentRepo,
    evidenceRepo,
    profileManager,
    engine,
    adapterSpy,
    dispatch,
    transport,
    defaultProfileService,
    fakeIpc,
    invoke,
    seedIncident,
    seedOomEvidence,
    mockProfile,
    cleanup: () => {
      cleanupIpc();
      sqlite.close();
    },
  };
}

describe("H8.8-06a IPC: single global default AI provider (adversarial)", () => {
  let f: ReturnType<typeof createFixture>;

  beforeEach(() => {
    f = createFixture();
  });

  afterEach(() => {
    f.cleanup();
    jest.restoreAllMocks();
  });

  describe("renderer payloads that try to choose a provider", () => {
    it("rejects prepare-consent when the renderer sends a profileId", async () => {
      const inc = f.seedIncident("c-a", "ns-a");
      const profile = await f.mockProfile("default-a");
      await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: profile.id });
      const prepareSpy = jest.spyOn(f.engine, "prepareConsentPreview");

      await expect(
        f.invoke(incidentIpcChannels.aiPrepareConsent, { incidentId: inc.id, profileId: profile.id }),
      ).rejects.toThrow(/Unexpected field 'profileId'/);
      expect(prepareSpy).not.toHaveBeenCalled();
    });

    it("rejects execute-diagnosis when the renderer sends a profileId", async () => {
      const inc = f.seedIncident("c-a", "ns-a");
      const profile = await f.mockProfile("default-a");
      await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: profile.id });
      f.seedOomEvidence(inc.id, "c-a", "ns-a");
      const preview = await f.invoke(incidentIpcChannels.aiPrepareConsent, { incidentId: inc.id });
      const executeSpy = jest.spyOn(f.engine, "executeDiagnosis");

      await expect(
        f.invoke(incidentIpcChannels.aiExecuteDiagnosis, {
          incidentId: inc.id,
          consentToken: preview.consentToken,
          profileId: profile.id,
        }),
      ).rejects.toThrow(/Unexpected field 'profileId'/);
      expect(executeSpy).not.toHaveBeenCalled();
      expect(f.adapterSpy).not.toHaveBeenCalled();
    });
  });

  describe("set-default input and eligibility", () => {
    let goodId: string;

    beforeEach(async () => {
      goodId = (await f.mockProfile("good-default")).id;
      await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: goodId });
    });

    const expectDefaultUnchanged = async () => {
      const status = await f.invoke(incidentIpcChannels.aiGetDefaultProvider);
      expect(status.state).toBe("demo_offline");
      expect(status.profile?.id).toBe(goodId);
    };

    it("rejects an unknown profile id and keeps the previous default", async () => {
      await expect(
        f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: "profile-does-not-exist" }),
      ).rejects.toThrow(/Profile not found/);
      await expectDefaultUnchanged();
    });

    it("rejects a revoked profile and keeps the previous default", async () => {
      const revoked = await f.mockProfile("revoked-one");
      await f.profileManager.updateProfile(revoked.id, { status: "revoked" } as any);

      await expect(
        f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: revoked.id }),
      ).rejects.toThrow(/must be active/);
      await expectDefaultUnchanged();
    });

    it("rejects a disabled profile and keeps the previous default", async () => {
      const disabled = await f.mockProfile("disabled-one");
      await f.profileManager.updateProfile(disabled.id, { status: "disabled" } as any);

      await expect(
        f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: disabled.id }),
      ).rejects.toThrow(/must be active/);
      await expectDefaultUnchanged();
    });

    it.each(["anthropic", "gemini"] as const)("rejects an %s profile as default", async (provider) => {
      const ineligible = await f.profileManager.createProfile({
        name: `ineligible-${provider}`,
        provider,
        model: "m-1",
        apiKey: "sk-ineligible-secret-123456",
      } as any);

      await expect(
        f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: ineligible.id }),
      ).rejects.toThrow(/not eligible/);
      await expectDefaultUnchanged();
    });

    it("rejects extra keys in the set-default payload", async () => {
      const other = await f.mockProfile("other-one");

      await expect(
        f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: other.id, provider: "openai" }),
      ).rejects.toThrow(/Unexpected field 'provider'/);
      await expectDefaultUnchanged();
    });

    it("rejects set-default from a foreign sender frame without changing the default", async () => {
      const other = await f.mockProfile("other-two");

      await expect(
        f.fakeIpc.invoke(incidentIpcChannels.aiSetDefaultProvider, foreignEvent(), { profileId: other.id }),
      ).rejects.toThrow(/SecurityError/);
      await expectDefaultUnchanged();
    });
  });

  describe("consent token and default lifecycle", () => {
    it("deleted default makes prepare-consent refuse with zero secure-transport calls", async () => {
      const inc = f.seedIncident("c-a", "ns-a");
      const profile = await f.mockProfile("doomed-default");
      await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: profile.id });
      await f.profileManager.deleteProfile(profile.id);
      const isEnabledSpy = jest.spyOn(f.transport, "isExternalNetworkEnabled");

      await expect(
        f.invoke(incidentIpcChannels.aiPrepareConsent, { incidentId: inc.id }),
      ).rejects.toThrow(/not usable \(state: configuration_required\)/);

      expect(f.dispatch).not.toHaveBeenCalled();
      expect(f.adapterSpy).not.toHaveBeenCalled();
      expect(isEnabledSpy).toHaveBeenCalledTimes(0);
    });

    it("changing the default invalidates a consent token issued for the previous default", async () => {
      const inc = f.seedIncident("c-a", "ns-a");
      f.seedOomEvidence(inc.id, "c-a", "ns-a");
      const first = await f.mockProfile("first-default");
      const second = await f.mockProfile("second-default");
      await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: first.id });
      const preview = await f.invoke(incidentIpcChannels.aiPrepareConsent, { incidentId: inc.id });

      await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: second.id });

      await expect(
        f.invoke(incidentIpcChannels.aiExecuteDiagnosis, { incidentId: inc.id, consentToken: preview.consentToken }),
      ).rejects.toThrow(/INVALID_CONSENT_TOKEN/);
      expect(f.adapterSpy).not.toHaveBeenCalled();
    });

    it("issues a separate token per incident and each token is single-use", async () => {
      const incA = f.seedIncident("c-a", "ns-a", "OOM A");
      const incB = f.seedIncident("c-a", "ns-a", "OOM B");
      f.seedOomEvidence(incA.id, "c-a", "ns-a");
      f.seedOomEvidence(incB.id, "c-a", "ns-a");
      await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: (await f.mockProfile("shared-default")).id });

      const tokenA = (await f.invoke(incidentIpcChannels.aiPrepareConsent, { incidentId: incA.id })).consentToken;
      const tokenB = (await f.invoke(incidentIpcChannels.aiPrepareConsent, { incidentId: incB.id })).consentToken;
      expect(tokenA).not.toBe(tokenB);

      const reportB = await f.invoke(incidentIpcChannels.aiExecuteDiagnosis, { incidentId: incB.id, consentToken: tokenB });
      expect(reportB.incidentId).toBe(incB.id);

      await expect(
        f.invoke(incidentIpcChannels.aiExecuteDiagnosis, { incidentId: incB.id, consentToken: tokenB }),
      ).rejects.toThrow(/INVALID_CONSENT_TOKEN/);

      const reportA = await f.invoke(incidentIpcChannels.aiExecuteDiagnosis, { incidentId: incA.id, consentToken: tokenA });
      expect(reportA.incidentId).toBe(incA.id);
      expect(f.adapterSpy).toHaveBeenCalledTimes(2);
    });

    it("does not let a token for incident A diagnose incident B", async () => {
      const incA = f.seedIncident("c-a", "ns-a", "OOM A");
      const incB = f.seedIncident("c-a", "ns-a", "OOM B");
      f.seedOomEvidence(incA.id, "c-a", "ns-a");
      await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: (await f.mockProfile("scope-default")).id });
      const tokenA = (await f.invoke(incidentIpcChannels.aiPrepareConsent, { incidentId: incA.id })).consentToken;

      await expect(
        f.invoke(incidentIpcChannels.aiExecuteDiagnosis, { incidentId: incB.id, consentToken: tokenA }),
      ).rejects.toThrow(/CONSENT_SCOPE_MISMATCH/);
      expect(f.adapterSpy).not.toHaveBeenCalled();
    });

    it("never falls back to another active profile when the default is unusable", async () => {
      const inc = f.seedIncident("c-a", "ns-a");
      const primary = await f.mockProfile("primary-default");
      const backup = await f.mockProfile("backup-active");
      await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: primary.id });
      await f.profileManager.updateProfile(primary.id, { status: "disabled" } as any);
      const prepareSpy = jest.spyOn(f.engine, "prepareConsentPreview");

      const status = await f.invoke(incidentIpcChannels.aiGetDefaultProvider);
      expect(status.state).toBe("configuration_required");
      expect(status.profile).toBeUndefined();

      await expect(
        f.invoke(incidentIpcChannels.aiPrepareConsent, { incidentId: inc.id }),
      ).rejects.toThrow(/not usable/);
      expect(prepareSpy).not.toHaveBeenCalled();
      expect(prepareSpy.mock.calls.some(([, profileId]) => profileId === backup.id)).toBe(false);
    });
  });

  describe("secret hygiene of renderer-facing responses and logs", () => {
    it("get-default and set-default responses and logs never expose credentialRef, apiKey, oauthSubject or the demo marker", async () => {
      const consoleSpies = ["log", "info", "warn", "error", "debug"].map((m) =>
        jest.spyOn(console, m as "log").mockImplementation(() => undefined),
      );
      const createSpy = jest.spyOn(f.profileManager, "createProfile");
      const openAi = await f.profileManager.createProfile({
        name: "OpenAI OAuth",
        provider: "openai",
        model: "gpt-4o",
        apiKey: "sk-live-should-never-leak-998877",
        authMode: "oauth_siwc",
        oauthSubject: "subject-should-never-leak-4455",
      } as any);

      const ensured = await f.invoke(incidentIpcChannels.aiEnsureDemoProfile);
      const demoMarker = (createSpy.mock.calls.map(([input]) => input as any).find((i) => i.provider === "mock"))?.apiKey as string;
      expect(demoMarker).toMatch(/^demo-/);

      const setOpenAi = await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: openAi.id });
      const getOpenAi = await f.invoke(incidentIpcChannels.aiGetDefaultProvider);
      const raw = await f.profileManager.getProfile(openAi.id);
      const forbidden = [
        "credentialRef",
        "apiKey",
        "oauthSubject",
        demoMarker,
        "sk-live-should-never-leak-998877",
        "subject-should-never-leak-4455",
        (raw as any)?.credentialRef,
      ].filter((v): v is string => typeof v === "string" && v.length > 0);

      const serialized = [ensured, setOpenAi, getOpenAi].map((r) => JSON.stringify(r));
      for (const text of serialized) {
        for (const secret of forbidden) {
          expect(text).not.toContain(secret);
        }
      }

      const logged = consoleSpies.flatMap((s) => s.mock.calls.map((args) => args.map(String).join(" ")));
      for (const secret of forbidden) {
        expect(logged.some((line) => line.includes(secret))).toBe(false);
      }
    });
  });

  describe("synthetic OOM flow with the mock profile", () => {
    it("ensures demo profile, sets default, prepares, executes and reports provider mock with zero real network calls", async () => {
      const cluster = "c-synthetic-oom";
      const namespace = "payments";
      const inc = f.seedIncident(cluster, namespace);
      f.seedOomEvidence(inc.id, cluster, namespace);
      const createSpy = jest.spyOn(f.profileManager, "createProfile");
      const isEnabledSpy = jest.spyOn(f.transport, "isExternalNetworkEnabled");

      // Renderer passes no api key: the handler accepts no payload, so an injected key is ignored.
      const ensured = await f.invoke(incidentIpcChannels.aiEnsureDemoProfile, { apiKey: "renderer-supplied-key" });
      expect(ensured.state).toBe("demo_offline");
      expect((createSpy.mock.calls[0]?.[0] as any).apiKey).not.toBe("renderer-supplied-key");

      const set = await f.invoke(incidentIpcChannels.aiSetDefaultProvider, { profileId: ensured.profile.id });
      expect(set.state).toBe("demo_offline");

      const preview = await f.invoke(incidentIpcChannels.aiPrepareConsent, { incidentId: inc.id });
      expect(preview.targetProvider).toBe("mock");
      expect(preview.profileName).toBe("Demo offline (sintético)");

      const report = await f.invoke(incidentIpcChannels.aiExecuteDiagnosis, {
        incidentId: inc.id,
        consentToken: preview.consentToken,
      });

      expect(report.provider).toBe("mock");
      expect(report.incidentId).toBe(inc.id);
      expect(f.adapterSpy).toHaveBeenCalledTimes(1);
      expect(f.dispatch).not.toHaveBeenCalled();
      expect(isEnabledSpy).not.toHaveBeenCalled();
    });

    it("never carries the demo marker into the diagnosis report", async () => {
      const cluster = "c-synthetic-oom";
      const inc = f.seedIncident(cluster, "payments");
      f.seedOomEvidence(inc.id, cluster, "payments");
      const createSpy = jest.spyOn(f.profileManager, "createProfile");
      const ensured = await f.invoke(incidentIpcChannels.aiEnsureDemoProfile);
      const marker = (createSpy.mock.calls[0]?.[0] as any).apiKey as string;
      const preview = await f.invoke(incidentIpcChannels.aiPrepareConsent, { incidentId: inc.id });
      const report = await f.invoke(incidentIpcChannels.aiExecuteDiagnosis, {
        incidentId: inc.id,
        consentToken: preview.consentToken,
      });

      expect(ensured.profile.id).toBeDefined();
      expect(JSON.stringify(report)).not.toContain(marker);
    });
  });
});
