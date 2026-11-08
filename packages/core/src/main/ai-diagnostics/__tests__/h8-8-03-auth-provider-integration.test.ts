/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import http from "http";
import { createContainer } from "@ogre-tools/injectable";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { EvidenceRepository } from "../../incident-storage/evidence-repository";
import { SecureCredentialVault, SoftwareAesGcmBackend } from "../secure-credential-vault";
import { AiProfileManager } from "../ai-profile-manager";
import { AiDiagnosisRepository } from "../ai-diagnosis-repository";
import { AiBudgetTracker } from "../ai-budget-tracker";
import { AiDiagnosisEngine } from "../ai-diagnosis-engine";
import { MockAiTransport } from "../transport/mock-ai-transport";
import { DefaultSecureAiTransport } from "../transport/secure-ai-transport";
import type { SecureAiTransport } from "../transport/ai-transport-types";
import {
  TransportAbortError,
  TransportHttpError,
} from "../transport/ai-transport-errors";
import {
  DYNAMIC_AGENT_CLIENT_ID,
  OPENAI_SIWC_AUTHORIZE_ENDPOINT,
  OPENAI_SIWC_DISCOVERY_ENDPOINT,
  OPENAI_SIWC_ISSUER,
  OPENAI_SIWC_JWKS_ENDPOINT,
  OPENAI_SIWC_RESOURCE_URI,
  OPENAI_SIWC_REVOKE_ENDPOINT,
  OPENAI_SIWC_TOKEN_ENDPOINT,
  PENDING_OPENAI_MODEL_SELECTION,
  OpenAiSiwcOAuthManager,
  parseOfficialOpenAiModelsCatalog,
  type OpenAiJwk,
} from "../oauth/openai-siwc-oauth-manager";
import {
  DEEPSEEK_EXCLUSIVE_ENDPOINT,
  OPENAI_SIWC_MODELS_ENDPOINT,
  OPENAI_SIWC_RESPONSES_ENDPOINT,
  SsrfSecurityError,
  validateAiEndpoint,
} from "../../../common/incident/ai-profile-types";
import {
  DEFAULT_DEEPSEEK_PRICING,
  DeepSeekAiProviderAdapter,
  calculateDeepSeekCostUsd,
  estimateConservativePreDispatchDeepSeekMaxCostUsd,
  isDeepSeekOffPeakUtc,
  isDeepSeekPeakUtc,
} from "../providers/deepseek-ai-provider-adapter";
import sqliteClientInjectable from "../../incident-storage/sqlite-client.injectable";
import incidentRepositoryInjectable from "../../incident-storage/incident-repository.injectable";
import evidenceRepositoryInjectable from "../../incident-storage/evidence-repository.injectable";
import incidentPurgerInjectable from "../../incident-storage/incident-purger.injectable";
import incidentConfirmationManagerInjectable from "../../incident-storage/incident-confirmation-manager.injectable";
import secureCredentialVaultInjectable from "../secure-credential-vault.injectable";
import aiProfileManagerInjectable from "../ai-profile-manager.injectable";
import aiDiagnosisRepositoryInjectable from "../ai-diagnosis-repository.injectable";
import aiBudgetTrackerInjectable from "../ai-budget-tracker.injectable";
import ephemeralContextManagerInjectable from "../ephemeral-context-manager.injectable";
import secureAiTransportInjectable from "../transport/secure-ai-transport.injectable";
import openAiSiwcOAuthManagerInjectable from "../oauth/openai-siwc-oauth-manager.injectable";
import aiDiagnosisEngineInjectable from "../ai-diagnosis-engine.injectable";
import remediationVerifierInjectable from "../remediation-verifier.injectable";
import localIncidentScannerInjectable from "../../incident-scanner/local-incident-scanner.injectable";
import setupIncidentIpcInjectable from "../../incident-storage/setup-incident-ipc.injectable";
import { incidentIpcChannels } from "../../../common/incident/incident-ipc";
import { IncidentStore } from "../../../features/incident-workbench/renderer/incident-store";

describe("H8.8-03 & R1: Official OpenAI ChatGPT OAuth (SIWC) & DeepSeek Responses API (100% Offline)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let vault: SecureCredentialVault;
  let profileManager: AiProfileManager;
  let diagnosisRepo: AiDiagnosisRepository;
  let budgetTracker: AiBudgetTracker;
  let mockTransport: MockAiTransport;
  let oauthManager: OpenAiSiwcOAuthManager;
  let engine: AiDiagnosisEngine;

  let rsaPrivateKey: crypto.KeyObject;
  let rsaPublicJwk: OpenAiJwk;
  const testKid = "openai-siwc-key-2026-01";
  let currentClockMs = 1_762_550_000_000;

  let testIncidentId: string;
  let testEvidenceId: string;
  let launchedUrls: string[];

  beforeAll(() => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    rsaPrivateKey = privateKey;
    const exportedJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    rsaPublicJwk = {
      kty: "RSA",
      kid: testKid,
      use: "sig",
      alg: "RS256",
      n: exportedJwk.n as string,
      e: exportedJwk.e as string,
    };
  });

  function signTestIdToken(
    claims: Record<string, unknown>,
    options?: { alg?: string; kid?: string; tamperSignature?: boolean },
  ): string {
    const alg = options?.alg ?? "RS256";
    const header = {
      alg,
      typ: "JWT",
      kid: options?.kid ?? testKid,
    };
    const encodedHeader = Buffer.from(JSON.stringify(header), "utf8").toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    if (alg === "none") {
      return `${signingInput}.unverified`;
    }

    const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput, "ascii"), rsaPrivateKey);
    if (options?.tamperSignature) {
      sig[0] ^= 0xff;
    }
    return `${signingInput}.${sig.toString("base64url")}`;
  }

  function buildValidDiagnosisJson(evidenceId: string, overrides?: Record<string, unknown>): string {
    return JSON.stringify({
      status: "CONCLUSIVE",
      facts: [
        {
          text: "El contenedor api-server experimentó OOMKilled por límite de memoria insuficiente.",
          citation: {
            evidenceId,
            excerpt: "OOMKilled: container exceeded memory limit 256Mi",
            resourceKind: "Pod",
            resourceName: "api-server-7b9f",
          },
        },
      ],
      hypotheses: [
        {
          id: "hyp-oom-limit",
          title: "Límite de memoria de 256Mi insuficiente para pico de carga",
          confidence: 0.94,
          rationale: "La evidencia confirma terminación por OOMKilled en el contenedor principal.",
          citationIds: [evidenceId],
        },
      ],
      contradictions: [],
      missingInformation: [],
      recommendedNextSteps: ["Incrementar resources.limits.memory a 512Mi"],
      remediationProposal: {
        id: "rem-increase-mem",
        title: "Incrementar límite de memoria del Deployment",
        problemSummary: "Evitar reinicios por OOMKilled aumentando el límite de memoria.",
        suggestedYamlDiff: "- memory: 256Mi\n+ memory: 512Mi",
        preconditions: ["Verificar capacidad disponible en el nodo"],
        risksAndImpact: "Reinicio rolling de los pods del deployment.",
        validationSteps: ["Confirmar ausencia de eventos OOMKilled tras el rollout"],
        rollbackProcedure: "kubectl rollout undo deployment/api-server",
      },
      tokenUsage: {
        promptTokens: 320,
        completionTokens: 180,
        totalTokens: 500,
      },
      ...overrides,
    });
  }

  function buildOpenAiSseStream(
    diagnosisJson: string,
    usage = { input_tokens: 320, output_tokens: 180, total_tokens: 500 },
  ): string {
    const mid = Math.floor(diagnosisJson.length / 2);
    const part1 = diagnosisJson.slice(0, mid);
    const part2 = diagnosisJson.slice(mid);

    return [
      `event: response.created`,
      `data: ${JSON.stringify({ type: "response.created", response: { id: "resp_siwc_001", status: "in_progress" } })}`,
      ``,
      `event: response.output_text.delta`,
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: part1 })}`,
      ``,
      `event: response.output_text.delta`,
      `data: ${JSON.stringify({ type: "response.output_text.delta", delta: part2 })}`,
      ``,
      `event: response.output_text.done`,
      `data: ${JSON.stringify({ type: "response.output_text.done", text: diagnosisJson })}`,
      ``,
      `event: response.completed`,
      `data: ${JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_siwc_001",
          status: "completed",
          usage,
        },
      })}`,
      ``,
    ].join("\n");
  }

  beforeEach(() => {
    currentClockMs = 1_762_550_000_000;
    launchedUrls = [];

    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();

    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
    vault = new SecureCredentialVault(new SoftwareAesGcmBackend());
    profileManager = new AiProfileManager(sqlite, vault);
    diagnosisRepo = new AiDiagnosisRepository(sqlite);
    budgetTracker = new AiBudgetTracker(diagnosisRepo);
    mockTransport = new MockAiTransport();

    // Register default JWKS endpoint on MockAiTransport
    mockTransport.registerRoute(
      req => req.endpoint === OPENAI_SIWC_JWKS_ENDPOINT && req.method === "GET",
      () => ({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keys: [rsaPublicJwk] }),
      }),
      "jwks-default",
    );

    // Register default OIDC Discovery endpoint on MockAiTransport
    mockTransport.registerRoute(
      req => req.endpoint === OPENAI_SIWC_DISCOVERY_ENDPOINT && req.method === "GET",
      () => ({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          issuer: OPENAI_SIWC_ISSUER,
          authorization_endpoint: OPENAI_SIWC_AUTHORIZE_ENDPOINT,
          token_endpoint: OPENAI_SIWC_TOKEN_ENDPOINT,
          jwks_uri: OPENAI_SIWC_JWKS_ENDPOINT,
          revocation_endpoint: OPENAI_SIWC_REVOKE_ENDPOINT,
        }),
      }),
      "oidc-discovery-default",
    );

    // Register default official '/v1/models' catalog (models[] with slug, display_name, visibility)
    mockTransport.registerRoute(
      req => req.endpoint === OPENAI_SIWC_MODELS_ENDPOINT && req.method === "GET",
      () => ({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          models: [
            {
              slug: "gpt-5-codex-mini",
              display_name: "GPT-5 Codex Mini",
              visibility: "list",
            },
            {
              slug: "gpt-internal-hidden",
              display_name: "Internal Hidden Model",
              visibility: "hidden",
            },
            {
              slug: "o3-mini-high",
              display_name: "o3-mini (High Reasoning)",
              visibility: "list",
            },
          ],
        }),
      }),
      "models-official-default",
    );

    oauthManager = new OpenAiSiwcOAuthManager(profileManager, mockTransport, {
      clockFn: () => currentClockMs,
      browserLauncher: async (authUrl: string) => {
        launchedUrls.push(authUrl);
      },
    });

    engine = new AiDiagnosisEngine(
      incidentRepo,
      evidenceRepo,
      profileManager,
      diagnosisRepo,
      budgetTracker,
      {
        transport: mockTransport,
        oauthManager,
      },
    );

    const incident = incidentRepo.createIncident({
      clusterId: "cluster-prod-eu",
      namespace: "payments",
      workloadKind: "Pod",
      workloadName: "api-server-7b9f",
      title: "Pod api-server-7b9f crashing with OOMKilled",
      severity: "high",
      creator: { id: "sre-1", type: "human", name: "SRE Operator" },
    });
    testIncidentId = incident.id;

    const ingested = evidenceRepo.ingestEvidence({
      incidentId: testIncidentId,
      clusterId: "cluster-prod-eu",
      namespace: "payments",
      type: "pod_logs",
      origin: "kubectl",
      resourceKind: "Pod",
      resourceName: "api-server-7b9f",
      rawContent: "2026-11-07T18:00:00Z ERROR OOMKilled: container exceeded memory limit 256Mi",
    });
    testEvidenceId = ingested.evidence.id;
  });

  afterEach(() => {
    oauthManager.dispose();
    sqlite.close();
  });

  describe("1. H8.8-03a & R1-01/R1-02: Official OpenAI Sign in with ChatGPT (Endpoints, Resource, oaiapp_*, Models & Streaming)", () => {
    it("completes full OAuth flow over 127.0.0.1 loopback using /api/accounts/authorize, /api/accounts/oauth/token, resource=https://api.openai.com/v1, oaiapp_* client_id, official models[] catalog, and /v1/responses SSE", async () => {
      const hostId1 = profileManager.getOrCreateInstallationHostId();
      const hostId2 = profileManager.getOrCreateInstallationHostId();
      expect(hostId1).toMatch(/^urn:uuid:[0-9a-f-]{36}$/i);
      expect(hostId2).toBe(hostId1);

      const session = await oauthManager.startSignInWithChatGpt({
        profileName: "OpenAI — ChatGPT OAuth",
        listenOnLoopback: true,
      });

      expect(launchedUrls).toHaveLength(1);
      const authUrl = new URL(launchedUrls[0]);
      expect(authUrl.origin).toBe(OPENAI_SIWC_ISSUER);
      expect(authUrl.pathname).toBe("/api/accounts/authorize");
      expect(authUrl.searchParams.get("client_id")).toBe(DYNAMIC_AGENT_CLIENT_ID);
      expect(authUrl.searchParams.get("resource")).toBe(OPENAI_SIWC_RESOURCE_URI);
      expect(authUrl.searchParams.get("agent_name_hint")).toBe("NovaKube");
      expect(authUrl.searchParams.get("ext_agent_host_id")).toBe(hostId1);
      expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(authUrl.searchParams.get("state")).toBe(session.state);
      expect(authUrl.searchParams.get("nonce")).toBe(session.nonce);
      expect(authUrl.searchParams.get("redirect_uri")).toBe(
        `http://127.0.0.1:${session.loopbackPort}/oauth/callback`,
      );

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        req => {
          const params = new URLSearchParams(req.body || "");
          expect(params.get("resource")).toBe(OPENAI_SIWC_RESOURCE_URI);
          expect(params.get("client_id")).toBe("oaiapp_novakube_dyn_123");

          const verifier = params.get("code_verifier")!;
          const recomputedChallenge = crypto
            .createHash("sha256")
            .update(verifier, "ascii")
            .digest("base64url");
          expect(recomputedChallenge).toBe(authUrl.searchParams.get("code_challenge"));

          const idToken = signTestIdToken({
            iss: OPENAI_SIWC_ISSUER,
            sub: "user-chatgpt-plus-001",
            aud: "oaiapp_novakube_dyn_123",
            exp: Math.floor(currentClockMs / 1000) + 3600,
            iat: Math.floor(currentClockMs / 1000),
            nonce: session.nonce,
          });

          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: "at_siwc_valid_token_001",
              refresh_token: "rt_siwc_initial_001",
              id_token: idToken,
              token_type: "Bearer",
              expires_in: 3600,
              client_id: "oaiapp_novakube_dyn_123",
              scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            }),
          };
        },
        "token-exchange-success",
      );

      // Deliver callback over real loopback HTTP 127.0.0.1 listener including issued client_id=oaiapp_*
      const callbackUrl = `${session.redirectUri}?code=auth_code_valid_987654&state=${encodeURIComponent(session.state)}&client_id=oaiapp_novakube_dyn_123`;
      await new Promise<void>((resolve, reject) => {
        http
          .get(callbackUrl, res => {
            expect(res.statusCode).toBe(200);
            res.resume();
            res.on("end", () => resolve());
          })
          .on("error", reject);
      });

      const connectedProfile = await session.waitForCompletion();
      expect(connectedProfile.provider).toBe("openai");
      expect(connectedProfile.authMode).toBe("oauth_siwc");
      expect(connectedProfile.availabilityStatus).toBe("available");
      expect(connectedProfile.oauthSubject).toBe("user-chatgpt-plus-001");
      expect(connectedProfile.oauthClientId).toBe("oaiapp_novakube_dyn_123");
      // R1-02: Selected model after login comes from official models[] catalog (never hardcoded gpt-4o)
      expect(connectedProfile.model).toBe("gpt-5-codex-mini");

      // Verify SQLite never stores raw OAuth tokens
      const rawRow = sqlite
        .getDb()
        .prepare("SELECT * FROM ai_profiles WHERE id = ?")
        .get(connectedProfile.id);
      expect(JSON.stringify(rawRow)).not.toContain("at_siwc_valid_token_001");
      expect(JSON.stringify(rawRow)).not.toContain("rt_siwc_initial_001");

      // Query official /v1/models endpoint and verify slug, displayName, visibility==='list', and server order preservation
      const models = await oauthManager.fetchAvailableModels(connectedProfile.id);
      expect(models).toEqual([
        {
          id: "gpt-5-codex-mini",
          slug: "gpt-5-codex-mini",
          displayName: "GPT-5 Codex Mini",
          visibility: "list",
          supportedEndpoints: undefined,
        },
        {
          id: "o3-mini-high",
          slug: "o3-mini-high",
          displayName: "o3-mini (High Reasoning)",
          visibility: "list",
          supportedEndpoints: undefined,
        },
      ]);

      // Execute diagnosis via /v1/responses enforcing store: false, stream: true, and slug as model ID
      let capturedResponsesBody: Record<string, unknown> | undefined;
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_RESPONSES_ENDPOINT && req.method === "POST",
        req => {
          capturedResponsesBody = JSON.parse(req.body || "{}");
          return {
            status: 200,
            headers: { "content-type": "text/event-stream" },
            streamChunks: [buildOpenAiSseStream(buildValidDiagnosisJson(testEvidenceId))],
          };
        },
        "openai-responses-sse",
      );

      const preview = await engine.prepareConsentPreview(testIncidentId, connectedProfile.id);
      const report = await engine.executeDiagnosis(
        testIncidentId,
        connectedProfile.id,
        preview.consentToken,
      );

      expect(capturedResponsesBody).toBeDefined();
      expect(capturedResponsesBody?.model).toBe("gpt-5-codex-mini");
      expect(capturedResponsesBody?.store).toBe(false);
      expect(capturedResponsesBody?.stream).toBe(true);
      expect(capturedResponsesBody?.tool_choice).toBe("none");
      expect(report.status).toBe("CONCLUSIVE");
      expect(report.provider).toBe("openai");
      expect(report.model).toBe("gpt-5-codex-mini");
    });

    it("R1-01: enforces oaiapp_* on initial registration, rejects dynamic_agent_client as persistent identity, rejects arbitrary client_ids on reauthorization, and preserves account-specific client_id without overwriting different accounts", async () => {
      // 1. Rejects initial registration when server returns dynamic_agent_client instead of oaiapp_*
      const badInitSession = await oauthManager.startSignInWithChatGpt({ listenOnLoopback: false });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_bad_client",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-1",
              aud: DYNAMIC_AGENT_CLIENT_ID,
              exp: Math.floor(currentClockMs / 1000) + 3600,
              nonce: badInitSession.nonce,
            }),
            client_id: DYNAMIC_AGENT_CLIENT_ID,
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
      );

      await expect(
        oauthManager.handleCallbackUrl(
          badInitSession.sessionId,
          `${badInitSession.redirectUri}?code=code_bad_init_12345&state=${badInitSession.state}`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_INVALID_CLIENT_ID/);

      // 2. Register Account A with oaiapp_account_A and Account B with oaiapp_account_B
      const sessionA = await oauthManager.startSignInWithChatGpt({
        profileName: "Account A",
        listenOnLoopback: false,
      });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_account_A_original",
            refresh_token: "rt_account_A_original",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "sub-account-A",
              aud: "oaiapp_account_A",
              exp: Math.floor(currentClockMs / 1000) + 3600,
              nonce: sessionA.nonce,
            }),
            client_id: "oaiapp_account_A",
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
      );
      const profileA = await oauthManager.handleCallbackUrl(
        sessionA.sessionId,
        `${sessionA.redirectUri}?code=code_account_A_123&state=${sessionA.state}&client_id=oaiapp_account_A`,
      );

      const sessionB = await oauthManager.startSignInWithChatGpt({
        profileName: "Account B",
        listenOnLoopback: false,
      });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_account_B_original",
            refresh_token: "rt_account_B_original",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "sub-account-B",
              aud: "oaiapp_account_B",
              exp: Math.floor(currentClockMs / 1000) + 3600,
              nonce: sessionB.nonce,
            }),
            client_id: "oaiapp_account_B",
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
      );
      const profileB = await oauthManager.handleCallbackUrl(
        sessionB.sessionId,
        `${sessionB.redirectUri}?code=code_account_B_123&state=${sessionB.state}&client_id=oaiapp_account_B`,
      );

      // Each account preserves its own specific client_id
      expect(profileA.oauthClientId).toBe("oaiapp_account_A");
      expect(profileB.oauthClientId).toBe("oaiapp_account_B");

      // 3. Reauthorizing Profile A uses oaiapp_account_A and rejects arbitrary client_id in callback
      const reauthA1 = await oauthManager.startSignInWithChatGpt({
        profileId: profileA.id,
        listenOnLoopback: false,
      });
      expect(new URL(reauthA1.authorizationUrl).searchParams.get("client_id")).toBe(
        "oaiapp_account_A",
      );

      await expect(
        oauthManager.handleCallbackUrl(
          reauthA1.sessionId,
          `${reauthA1.redirectUri}?code=code_reauth_12345&state=${reauthA1.state}&client_id=oaiapp_arbitrary_attacker`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_CALLBACK_MALICIOUS/);

      // 4. Reauthorizing Profile A with a different account ('sub-account-B') without explicit selection is rejected BEFORE replacing credentials
      const reauthA2 = await oauthManager.startSignInWithChatGpt({
        profileId: profileA.id,
        listenOnLoopback: false,
      });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_intruder_attempt",
            refresh_token: "rt_intruder_attempt",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "sub-account-B", // Different account!
              aud: "oaiapp_account_A",
              exp: Math.floor(currentClockMs / 1000) + 3600,
              nonce: reauthA2.nonce,
            }),
            client_id: "oaiapp_account_A",
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
      );

      await expect(
        oauthManager.handleCallbackUrl(
          reauthA2.sessionId,
          `${reauthA2.redirectUri}?code=code_reauth_diff_sub&state=${reauthA2.state}`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_ACCOUNT_CHANGED/);

      // Verify Profile A's vault credentials and subject were NOT overwritten
      const preservedBundleA = JSON.parse(await profileManager.getApiKeyForProfile(profileA.id));
      expect(preservedBundleA.accessToken).toBe("at_account_A_original");
      expect(preservedBundleA.subject).toBe("sub-account-A");
    });

    it("R1-01: uses only server-granted token scopes (never widening via ID token claims)", async () => {
      const session = await oauthManager.startSignInWithChatGpt({
        listenOnLoopback: false,
      });

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => {
          // ID token claims include chatgpt.tokens.use.direct in scp/permissions,
          // BUT the OAuth token response 'scope' did NOT grant chatgpt.tokens.use.direct!
          const idToken = signTestIdToken({
            iss: OPENAI_SIWC_ISSUER,
            sub: "user-claims-widening-test",
            aud: "oaiapp_scope_test_01",
            exp: Math.floor(currentClockMs / 1000) + 3600,
            nonce: session.nonce,
            scp: ["openid", "profile", "resource.invoke", "chatgpt.tokens.use.direct"],
            permissions: ["resource.invoke", "chatgpt.tokens.use.direct"],
          });
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: "at_narrow_scope",
              id_token: idToken,
              expires_in: 3600,
              client_id: "oaiapp_scope_test_01",
              scope: "openid profile resource.invoke", // Missing chatgpt.tokens.use.direct
            }),
          };
        },
        "token-narrow-scope",
      );

      const limitedProfile = await oauthManager.handleCallbackUrl(
        session.sessionId,
        `${session.redirectUri}?code=code_narrow_12345&state=${encodeURIComponent(session.state)}&client_id=oaiapp_scope_test_01`,
      );

      expect(limitedProfile.availabilityStatus).toBe("sin_permiso");
      expect(limitedProfile.oauthScopes).toEqual(["openid", "profile", "resource.invoke"]);

      await expect(
        engine.prepareConsentPreview(testIncidentId, limitedProfile.id),
      ).rejects.toThrow(/OPENAI_OAUTH_PERMISSION_DENIED/);
    });

    it("R1-02: parses official models[] catalog strictly, preserves server order, rejects malformed catalogs, and blocks unvalidated hardcoded models", async () => {
      // 1. Direct parser verification of official structure and order preservation
      const parsed = parseOfficialOpenAiModelsCatalog({
        models: [
          { slug: "o4-mini", display_name: "o4-mini", visibility: "list" },
          { slug: "internal-hidden", display_name: "Hidden", visibility: "hidden" },
          { slug: "gpt-5-codex", display_name: "GPT-5 Codex", visibility: "list" },
          { slug: "gpt-4.1-mini", display_name: "GPT-4.1 Mini", visibility: "list" },
        ],
      });

      expect(parsed.map(m => m.slug)).toEqual(["o4-mini", "gpt-5-codex", "gpt-4.1-mini"]);
      expect(parsed.map(m => m.displayName)).toEqual(["o4-mini", "GPT-5 Codex", "GPT-4.1 Mini"]);

      // 2. Rejects malformed catalogs (legacy data[] without models[], or missing display_name/slug/visibility)
      expect(() =>
        parseOfficialOpenAiModelsCatalog({
          data: [{ id: "gpt-4o", object: "model", visibility: "list" }],
        }),
      ).toThrow(/ERR_PAYLOAD_VALIDATION/);

      expect(() =>
        parseOfficialOpenAiModelsCatalog({
          models: [{ slug: "gpt-5-codex", visibility: "list" }], // missing display_name
        }),
      ).toThrow(/ERR_PAYLOAD_VALIDATION/);

      // 3. Login when /v1/models is not yet available sets PENDING_OPENAI_MODEL_SELECTION (never hardcoded gpt-4o)
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_MODELS_ENDPOINT && req.method === "GET",
        () => ({
          status: 503,
          body: "Unavailable during login",
        }),
        "models-unavailable-at-login",
      );

      const s = await oauthManager.startSignInWithChatGpt({ listenOnLoopback: false });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_model_test",
            refresh_token: "rt_model_test",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-model-test",
              aud: "oaiapp_model_test",
              exp: Math.floor(currentClockMs / 1000) + 3600,
              nonce: s.nonce,
            }),
            client_id: "oaiapp_model_test",
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
      );

      const profile = await oauthManager.handleCallbackUrl(
        s.sessionId,
        `${s.redirectUri}?code=code_model_test_123&state=${s.state}&client_id=oaiapp_model_test`,
      );
      expect(profile.model).toBe(PENDING_OPENAI_MODEL_SELECTION);
      expect(profile.model).not.toBe("gpt-4o");

      // Now restore official /v1/models catalog where 'gpt-4o' is NOT in the list
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_MODELS_ENDPOINT && req.method === "GET",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            models: [
              { slug: "gpt-5-codex-mini", display_name: "GPT-5 Codex Mini", visibility: "list" },
            ],
          }),
        }),
      );

      // If someone manually forces 'gpt-4o' on the profile, prepareConsentPreview rejects it because 'gpt-4o' is not in models[]
      await profileManager.updateProfile(profile.id, { model: "gpt-4o" });
      await expect(engine.prepareConsentPreview(testIncidentId, profile.id)).rejects.toThrow(
        /OPENAI_MODELS_UNAVAILABLE/,
      );
    });

    it("serializes concurrent token refreshes with resource=https://api.openai.com/v1, rotates refresh_token safely, and detects account change ('sub' mismatch)", async () => {
      const session = await oauthManager.startSignInWithChatGpt({ listenOnLoopback: false });

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_short_lived",
            refresh_token: "rt_gen_1",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-original-sub",
              aud: "oaiapp_refresh_client_01",
              exp: Math.floor(currentClockMs / 1000) + 60,
              nonce: session.nonce,
            }),
            expires_in: 60,
            client_id: "oaiapp_refresh_client_01",
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
        "initial-short-token",
      );

      const profile = await oauthManager.handleCallbackUrl(
        session.sessionId,
        `${session.redirectUri}?code=code_short_12345&state=${encodeURIComponent(session.state)}&client_id=oaiapp_refresh_client_01`,
      );

      currentClockMs += 120_000;

      let refreshCallCount = 0;
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        req => {
          refreshCallCount++;
          const params = new URLSearchParams(req.body || "");
          expect(params.get("grant_type")).toBe("refresh_token");
          expect(params.get("refresh_token")).toBe("rt_gen_1");
          expect(params.get("client_id")).toBe("oaiapp_refresh_client_01");
          expect(params.get("resource")).toBe(OPENAI_SIWC_RESOURCE_URI);

          return {
            status: 200,
            delayMs: 25,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: "at_refreshed_gen_2",
              refresh_token: "rt_rotated_gen_2",
              id_token: signTestIdToken({
                iss: OPENAI_SIWC_ISSUER,
                sub: "user-original-sub",
                aud: "oaiapp_refresh_client_01",
                exp: Math.floor(currentClockMs / 1000) + 3600,
              }),
              expires_in: 3600,
              scope: "openid resource.invoke chatgpt.tokens.use.direct",
            }),
          };
        },
        "serialized-refresh",
      );

      const [tok1, tok2, tok3] = await Promise.all([
        oauthManager.ensureValidAccessToken(profile.id),
        oauthManager.ensureValidAccessToken(profile.id),
        oauthManager.ensureValidAccessToken(profile.id),
      ]);

      expect(refreshCallCount).toBe(1);
      expect(tok1).toBe("at_refreshed_gen_2");
      expect(tok2).toBe("at_refreshed_gen_2");
      expect(tok3).toBe("at_refreshed_gen_2");

      const storedBundle = JSON.parse(await profileManager.getApiKeyForProfile(profile.id));
      expect(storedBundle.refreshToken).toBe("rt_rotated_gen_2");
      expect(storedBundle.clientId).toBe("oaiapp_refresh_client_01");

      // Prepare consent token, then simulate an account switch ('sub' mismatch) during next refresh
      const preview = await engine.prepareConsentPreview(testIncidentId, profile.id);
      currentClockMs += 4_000_000;

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_different_user",
            refresh_token: "rt_different_user",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-INTRUDER-DIFFERENT-ACCOUNT",
              aud: "oaiapp_refresh_client_01",
              exp: Math.floor(currentClockMs / 1000) + 3600,
            }),
            expires_in: 3600,
          }),
        }),
        "account-switch-refresh",
      );

      await expect(oauthManager.ensureValidAccessToken(profile.id)).rejects.toThrow(
        /OPENAI_OAUTH_ACCOUNT_CHANGED/,
      );

      await expect(
        engine.executeDiagnosis(testIncidentId, profile.id, preview.consentToken),
      ).rejects.toThrow(/INVALID_CONSENT_TOKEN/);
    });

    it("resolves revocation endpoint via OIDC Discovery, handles incomplete SSE streams, and never fails over to DeepSeek on ChatGPT quota exhaustion", async () => {
      const session = await oauthManager.startSignInWithChatGpt({ listenOnLoopback: false });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_full_test",
            refresh_token: "rt_full_test",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-full-test",
              aud: "oaiapp_full_test_01",
              exp: Math.floor(currentClockMs / 1000) + 3600,
              nonce: session.nonce,
            }),
            expires_in: 3600,
            client_id: "oaiapp_full_test_01",
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
      );

      const profile = await oauthManager.handleCallbackUrl(
        session.sessionId,
        `${session.redirectUri}?code=code_full_test_123&state=${session.state}&client_id=oaiapp_full_test_01`,
      );

      // 1. Incomplete SSE stream (stream ends without response.completed)
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_RESPONSES_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "text/event-stream" },
          streamChunks: [
            `event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"{\\"status\\":\\"CONCLUSIVE\\"}"}\n\n`,
          ],
        }),
      );

      const p1 = await engine.prepareConsentPreview(testIncidentId, profile.id);
      await expect(
        engine.executeDiagnosis(testIncidentId, profile.id, p1.consentToken),
      ).rejects.toThrow(/OPENAI_RESPONSE_INCOMPLETE/);

      // 2. ChatGPT Quota Exhausted (NEVER auto-switches to DeepSeek even when DeepSeek profile exists!)
      const deepseekProfile = await profileManager.createProfile({
        name: "DeepSeek Backup",
        provider: "deepseek",
        model: "deepseek-flash",
        endpoint: DEEPSEEK_EXCLUSIVE_ENDPOINT,
        apiKey: "sk-deepseek-valid-key-9999",
      });

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_RESPONSES_ENDPOINT && req.method === "POST",
        () => ({
          status: 429,
          statusText: "Too Many Requests",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            error: {
              code: "insufficient_quota",
              message: "You have exceeded your ChatGPT plan usage limit.",
            },
          }),
        }),
      );

      mockTransport.clearHistory();
      const p2 = await engine.prepareConsentPreview(testIncidentId, profile.id);
      await expect(
        engine.executeDiagnosis(testIncidentId, profile.id, p2.consentToken),
      ).rejects.toThrow(/CHATGPT_QUOTA_EXHAUSTED/);

      expect(
        mockTransport.recordedRequests.some(r => r.provider === "deepseek" || r.endpoint.includes("deepseek")),
      ).toBe(false);
      expect(deepseekProfile.id).toBeDefined();

      // 3. Disconnect account resolving revocation endpoint via OIDC Discovery
      const discoveredRevokeUrl = "https://auth.openai.com/api/accounts/oauth/revoke-discovered";
      let discoveryQueried = false;
      let revokedAtDiscoveredEndpoint = false;

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_DISCOVERY_ENDPOINT && req.method === "GET",
        () => {
          discoveryQueried = true;
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              issuer: OPENAI_SIWC_ISSUER,
              revocation_endpoint: discoveredRevokeUrl,
            }),
          };
        },
      );

      mockTransport.registerRoute(
        req => req.endpoint === discoveredRevokeUrl && req.method === "POST",
        req => {
          const params = new URLSearchParams(req.body || "");
          expect(params.get("client_id")).toBe("oaiapp_full_test_01");
          expect(params.get("token")).toBe("rt_full_test");
          expect(params.get("token_type_hint")).toBe("refresh_token");
          revokedAtDiscoveredEndpoint = true;
          return { status: 200, body: "{}" };
        },
      );

      const disconnected = await oauthManager.disconnectAndRevoke(profile.id);
      expect(discoveryQueried).toBe(true);
      expect(revokedAtDiscoveredEndpoint).toBe(true);
      expect(disconnected.status).toBe("revoked");
      expect(disconnected.availabilityStatus).toBe("disconnected");
      expect(disconnected.remoteRevocationConfirmed).toBe(true);
      expect(vault.hasCredential(profile.credentialRef)).toBe(false);
    });

    it("R2-02: rejects initial callback missing issued oaiapp_* client_id immediately with zero token exchanges and zero persisted profiles, while allowing reauthorization callback that omits client_id", async () => {
      mockTransport.clearHistory();
      const initSession = await oauthManager.startSignInWithChatGpt({ listenOnLoopback: false });

      // 1. Initial callback with valid state & code, but WITHOUT client_id
      await expect(
        oauthManager.handleCallbackUrl(
          initSession.sessionId,
          `${initSession.redirectUri}?code=code_missing_client_id_12345&state=${encodeURIComponent(initSession.state)}`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_INVALID_CLIENT_ID/);

      // Zero token exchanges and zero persisted profiles
      expect(
        mockTransport.recordedRequests.filter(r => r.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT),
      ).toHaveLength(0);
      expect(await profileManager.listProfiles()).toHaveLength(0);

      // 2. Initial callback with client_id=dynamic_agent_client is also rejected before token exchange
      const initSessionDyn = await oauthManager.startSignInWithChatGpt({ listenOnLoopback: false });
      await expect(
        oauthManager.handleCallbackUrl(
          initSessionDyn.sessionId,
          `${initSessionDyn.redirectUri}?code=code_dyn_client_id_12345&state=${encodeURIComponent(initSessionDyn.state)}&client_id=${DYNAMIC_AGENT_CLIENT_ID}`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_INVALID_CLIENT_ID/);

      expect(
        mockTransport.recordedRequests.filter(r => r.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT),
      ).toHaveLength(0);
      expect(await profileManager.listProfiles()).toHaveLength(0);

      // 3. Register valid account with oaiapp_reauth_compat_01, then reauthorize with callback that omits client_id
      const validInitSession = await oauthManager.startSignInWithChatGpt({
        profileName: "Reauth Compatible Account",
        listenOnLoopback: false,
      });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        req => {
          const params = new URLSearchParams(req.body || "");
          expect(params.get("client_id")).toBe("oaiapp_reauth_compat_01");
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: "at_reauth_v1",
              refresh_token: "rt_reauth_v1",
              id_token: signTestIdToken({
                iss: OPENAI_SIWC_ISSUER,
                sub: "sub-reauth-user-01",
                aud: "oaiapp_reauth_compat_01",
                exp: Math.floor(currentClockMs / 1000) + 3600,
                nonce: validInitSession.nonce,
              }),
              client_id: "oaiapp_reauth_compat_01",
              scope: "openid resource.invoke chatgpt.tokens.use.direct",
            }),
          };
        },
      );

      const registeredProfile = await oauthManager.handleCallbackUrl(
        validInitSession.sessionId,
        `${validInitSession.redirectUri}?code=code_valid_init_001&state=${encodeURIComponent(validInitSession.state)}&client_id=oaiapp_reauth_compat_01`,
      );
      expect(registeredProfile.oauthClientId).toBe("oaiapp_reauth_compat_01");

      const reauthSession = await oauthManager.startSignInWithChatGpt({
        profileId: registeredProfile.id,
        listenOnLoopback: false,
      });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        req => {
          const params = new URLSearchParams(req.body || "");
          expect(params.get("client_id")).toBe("oaiapp_reauth_compat_01");
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: "at_reauth_v2",
              refresh_token: "rt_reauth_v2",
              id_token: signTestIdToken({
                iss: OPENAI_SIWC_ISSUER,
                sub: "sub-reauth-user-01",
                aud: "oaiapp_reauth_compat_01",
                exp: Math.floor(currentClockMs / 1000) + 3600,
                nonce: reauthSession.nonce,
              }),
              scope: "openid resource.invoke chatgpt.tokens.use.direct",
            }),
          };
        },
      );

      // Reauthorization callback omits client_id and succeeds using the stored oaiapp_reauth_compat_01
      const reauthorizedProfile = await oauthManager.handleCallbackUrl(
        reauthSession.sessionId,
        `${reauthSession.redirectUri}?code=code_reauth_omitted_cid&state=${encodeURIComponent(reauthSession.state)}`,
      );
      expect(reauthorizedProfile.oauthClientId).toBe("oaiapp_reauth_compat_01");
    });

    it("R2-03: enforces official protocol on reauthorization (omits agent_name_hint, reuses client_id/ext_agent_host_id, includes id_token_hint without bypassing identity validation) and revocation (token_type_hint=refresh_token, unconfirmed remote revocation handling, and inference blocking during disconnect)", async () => {
      // 1. Initial registration includes agent_name_hint and omits id_token_hint
      const initSession = await oauthManager.startSignInWithChatGpt({
        profileName: "Protocol Compliance Account",
        listenOnLoopback: false,
      });
      const initAuthUrl = new URL(initSession.authorizationUrl);
      expect(initAuthUrl.searchParams.get("client_id")).toBe(DYNAMIC_AGENT_CLIENT_ID);
      expect(initAuthUrl.searchParams.get("agent_name_hint")).toBe("NovaKube");
      expect(initAuthUrl.searchParams.has("id_token_hint")).toBe(false);

      const initialIdToken = signTestIdToken({
        iss: OPENAI_SIWC_ISSUER,
        sub: "sub-protocol-user-01",
        aud: "oaiapp_protocol_01",
        exp: Math.floor(currentClockMs / 1000) + 3600,
        nonce: initSession.nonce,
      });

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        req => {
          const params = new URLSearchParams(req.body || "");
          expect(params.get("agent_name_hint")).toBe("NovaKube");
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: "at_protocol_v1",
              refresh_token: "rt_protocol_v1",
              id_token: initialIdToken,
              client_id: "oaiapp_protocol_01",
              scope: "openid resource.invoke chatgpt.tokens.use.direct",
            }),
          };
        },
      );

      const profile = await oauthManager.handleCallbackUrl(
        initSession.sessionId,
        `${initSession.redirectUri}?code=code_protocol_init_01&state=${encodeURIComponent(initSession.state)}&client_id=oaiapp_protocol_01`,
      );

      // 2. Reauthorization omits agent_name_hint, reuses client_id & ext_agent_host_id, and includes id_token_hint
      const reauthSession = await oauthManager.startSignInWithChatGpt({
        profileId: profile.id,
        listenOnLoopback: false,
      });
      const reauthUrl = new URL(reauthSession.authorizationUrl);
      expect(reauthUrl.searchParams.get("client_id")).toBe("oaiapp_protocol_01");
      expect(reauthUrl.searchParams.get("ext_agent_host_id")).toBe(initSession.extAgentHostId);
      expect(reauthUrl.searchParams.has("agent_name_hint")).toBe(false);
      expect(reauthUrl.searchParams.get("id_token_hint")).toBe(initialIdToken);

      // Verify id_token_hint does NOT substitute identity validation (different 'sub' is still rejected!)
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        req => {
          const params = new URLSearchParams(req.body || "");
          expect(params.has("agent_name_hint")).toBe(false);
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: "at_protocol_impostor",
              refresh_token: "rt_protocol_impostor",
              id_token: signTestIdToken({
                iss: OPENAI_SIWC_ISSUER,
                sub: "sub-impostor-despite-hint",
                aud: "oaiapp_protocol_01",
                exp: Math.floor(currentClockMs / 1000) + 3600,
                nonce: reauthSession.nonce,
              }),
              scope: "openid resource.invoke chatgpt.tokens.use.direct",
            }),
          };
        },
      );

      await expect(
        oauthManager.handleCallbackUrl(
          reauthSession.sessionId,
          `${reauthSession.redirectUri}?code=code_protocol_reauth_bad&state=${encodeURIComponent(reauthSession.state)}`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_ACCOUNT_CHANGED/);

      // 3. During disconnectAndRevoke, inference is blocked while remote revocation is in flight,
      // and if remote revocation fails, local credentials are safely purged and unconfirmed remote revocation is reported
      let releaseRevoke!: () => void;
      const revokeBarrier = new Promise<void>(resolve => {
        releaseRevoke = resolve;
      });
      let capturedRevokeBody = "";

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_REVOKE_ENDPOINT && req.method === "POST",
        async req => {
          capturedRevokeBody = req.body || "";
          await revokeBarrier;
          return {
            status: 503,
            statusText: "Service Unavailable",
            body: "Remote revocation service down",
          };
        },
        "revoke-delayed-failure",
      );

      const disconnectPromise = oauthManager.disconnectAndRevoke(profile.id);

      // Wait a microtask so disconnectAndRevoke is waiting on revokeBarrier
      await new Promise(resolve => setImmediate(resolve));

      // Inference / token access MUST be blocked while disconnection is in progress
      await expect(oauthManager.ensureValidAccessToken(profile.id)).rejects.toThrow(
        /PROFILE_INACTIVE/,
      );
      await expect(engine.prepareConsentPreview(testIncidentId, profile.id)).rejects.toThrow(
        /PROFILE_INACTIVE/,
      );
      expect(vault.hasCredential(profile.credentialRef)).toBe(false);

      // Now let the remote revocation fail with 503
      releaseRevoke();
      const disconnectedProfile = await disconnectPromise;

      const revokeParams = new URLSearchParams(capturedRevokeBody);
      expect(revokeParams.get("token")).toBe("rt_protocol_v1");
      expect(revokeParams.get("token_type_hint")).toBe("refresh_token");
      expect(revokeParams.get("client_id")).toBe("oaiapp_protocol_01");

      expect(disconnectedProfile.status).toBe("revoked");
      expect(disconnectedProfile.availabilityStatus).toBe("disconnected");
      expect(disconnectedProfile.remoteRevocationConfirmed).toBe(false);
      expect(disconnectedProfile.unavailableReason).toContain(
        "la revocación remota no pudo confirmarse",
      );
      expect(vault.hasCredential(profile.credentialRef)).toBe(false);
    });
  });

  describe("2. R1-03 & R1-04: Production DI/IPC Wiring, Fail-Closed Network State, and Real Session Timeout & Cleanup", () => {
    it("R1-03: wires OpenAiSiwcOAuthManager via Electron DI, shares the exact instance between 'Continuar con ChatGPT' IPC and AiDiagnosisEngine, and fails closed immediately while DisabledRealNetworkEngine is active", async () => {
      const di = createContainer("main-di-r1-03-test");
      const diSqlite = new SqliteClient({
        dbPath: ":memory:",
        migrations: ALL_MIGRATIONS,
      });
      diSqlite.init();

      try {
        di.register(
          sqliteClientInjectable,
          incidentRepositoryInjectable,
          evidenceRepositoryInjectable,
          incidentPurgerInjectable,
          incidentConfirmationManagerInjectable,
          secureCredentialVaultInjectable,
          aiProfileManagerInjectable,
          aiDiagnosisRepositoryInjectable,
          aiBudgetTrackerInjectable,
          ephemeralContextManagerInjectable,
          secureAiTransportInjectable,
          openAiSiwcOAuthManagerInjectable,
          aiDiagnosisEngineInjectable,
          remediationVerifierInjectable,
          localIncidentScannerInjectable,
          setupIncidentIpcInjectable,
        );

        di.override(sqliteClientInjectable, () => diSqlite);
        di.override(
          secureCredentialVaultInjectable,
          () => new SecureCredentialVault(new SoftwareAesGcmBackend()),
        );

        const registeredHandlers = new Map<string, (event: any, ...args: any[]) => Promise<any>>();
        const fakeIpcRegistrar = {
          handle: (channel: string, listener: (event: any, ...args: any[]) => Promise<any>) => {
            registeredHandlers.set(channel, listener);
          },
        };

        const injectedOAuthManager = di.inject(openAiSiwcOAuthManagerInjectable);
        const injectedDiagnosisEngine = di.inject(aiDiagnosisEngineInjectable);
        const injectedProfileManager = di.inject(aiProfileManagerInjectable);
        const injectedIncidentRepo = di.inject(incidentRepositoryInjectable);
        const injectedEvidenceRepo = di.inject(evidenceRepositoryInjectable);

        // 1. Verify DI singleton sharing between OAuthManager and AiDiagnosisEngine
        expect(injectedDiagnosisEngine.getOAuthManager()).toBe(injectedOAuthManager);
        expect(injectedOAuthManager.isExternalNetworkAvailable()).toBe(false);

        const { registerIncidentIpcHandlers } = await import(
          "../../incident-storage/setup-incident-ipc.injectable"
        );
        registerIncidentIpcHandlers(
          injectedIncidentRepo,
          injectedEvidenceRepo,
          undefined,
          undefined,
          {
            profileManager: injectedProfileManager,
            diagnosisEngine: injectedDiagnosisEngine,
            oauthManager: injectedOAuthManager,
          },
          fakeIpcRegistrar,
        );

        const validMainEvent = {
          sender: { id: 1, isDestroyed: () => false },
          senderFrame: { url: "file:///index.html", routingId: 1 },
        };

        // 2. Verify 'Continuar con ChatGPT' via IPC fails closed immediately (no hanging session or listener)
        const startHandler = registeredHandlers.get(incidentIpcChannels.aiStartOpenAiOAuthSignIn);
        expect(startHandler).toBeDefined();

        await expect(
          startHandler!(validMainEvent, { profileName: "OpenAI — ChatGPT OAuth" }),
        ).rejects.toThrow(/EXTERNAL_PROVIDER_DISABLED/);

        expect(injectedOAuthManager.getPendingSessionsCount()).toBe(0);

        // 3. Verify Renderer IncidentStore surfaces clear connection-unavailable state
        const store = new IncidentStore({
          invoke: (channel: string, ...args: any[]) => {
            const h = registeredHandlers.get(channel);
            if (!h) throw new Error(`Missing handler for ${channel}`);
            return h(validMainEvent, ...args);
          },
        });

        const signInResult = await store.signInWithChatGpt();
        expect(signInResult).toBeNull();
        expect(store.oauthConnectionError).toContain("EXTERNAL_PROVIDER_DISABLED");
      } finally {
        diSqlite.close();
      }
    });

    it("R1-04: enforces real session timeout when browser never returns callback, closes 127.0.0.1 listener, removes AbortSignal listeners, and cleans up on cancellation or window close", async () => {
      const shortTimeoutManager = new OpenAiSiwcOAuthManager(profileManager, mockTransport, {
        sessionTimeoutMs: 70,
        browserLauncher: async () => {
          // Simulate browser opened by user that NEVER invokes the callback
        },
      });

      const abortController = new AbortController();
      const removeListenerSpy = jest.spyOn(abortController.signal, "removeEventListener");

      const session = await shortTimeoutManager.startSignInWithChatGpt({
        listenOnLoopback: true,
        signal: abortController.signal,
      });

      expect(shortTimeoutManager.getPendingSessionsCount()).toBe(1);
      expect(session.loopbackPort).toBeGreaterThan(0);

      // 1. Wait for real session timer to expire without browser callback
      await expect(session.waitForCompletion()).rejects.toThrow(/OPENAI_OAUTH_SESSION_TIMEOUT/);

      // 2. No pending sessions remain after timeout
      expect(shortTimeoutManager.getPendingSessionsCount()).toBe(0);

      // 3. AbortSignal listener was released
      expect(removeListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));

      // 4. 127.0.0.1 loopback listener is closed (connection refused or immediate error)
      await expect(
        new Promise((resolve, reject) => {
          const req = http.get(
            `http://127.0.0.1:${session.loopbackPort}/oauth/callback?code=late&state=${session.state}`,
            res => {
              res.resume();
              resolve(res.statusCode);
            },
          );
          req.on("error", reject);
        }),
      ).rejects.toThrow();

      // 5. Also verify cleanup on window close / dispose()
      const sessionBeforeClose = await oauthManager.startSignInWithChatGpt({
        listenOnLoopback: true,
      });
      expect(oauthManager.getPendingSessionsCount()).toBe(1);
      oauthManager.dispose();
      await expect(sessionBeforeClose.waitForCompletion()).rejects.toThrow(/ERR_ABORTED/);
      expect(oauthManager.getPendingSessionsCount()).toBe(0);

      shortTimeoutManager.dispose();
    });

    it("R2-01: prevents late OAuth token exchange from persisting credentials or creating/updating profiles after timeout, cancellation, or window close, and rolls back mid-commit mutations", async () => {
      // --- 1. Timeout while token exchange is in flight (exact audit reproduction) ---
      const timeoutR2Manager = new OpenAiSiwcOAuthManager(profileManager, mockTransport, {
        sessionTimeoutMs: 45,
        clockFn: () => currentClockMs,
        browserLauncher: async () => {},
      });

      let releaseTokenExchangeTimeout!: () => void;
      const tokenExchangeTimeoutGate = new Promise<void>(resolve => {
        releaseTokenExchangeTimeout = resolve;
      });

      const timedOutSession = await timeoutR2Manager.startSignInWithChatGpt({
        profileName: "Late Timeout Profile",
        listenOnLoopback: false,
      });

      // Custom transport route that holds token exchange in flight and ignores AbortSignal to simulate a late response arriving after timeout
      const customLateTransport: SecureAiTransport = {
        isExternalNetworkEnabled: () => true,
        execute: async req => {
          if (req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT) {
            await tokenExchangeTimeoutGate;
            const idToken = signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "sub-late-timeout",
              aud: "oaiapp_late_timeout_01",
              exp: Math.floor(currentClockMs / 1000) + 3600,
              nonce: timedOutSession.nonce,
            });
            const body = JSON.stringify({
              access_token: "at_late_after_timeout",
              refresh_token: "rt_late_after_timeout",
              id_token: idToken,
              client_id: "oaiapp_late_timeout_01",
              scope: "openid resource.invoke chatgpt.tokens.use.direct",
            });
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body,
              json: () => JSON.parse(body),
              bytesReceived: body.length,
              timing: { startedAt: "", completedAt: "", durationMs: 50 },
            };
          }
          return mockTransport.execute(req);
        },
      };

      const lateTimeoutOAuth = new OpenAiSiwcOAuthManager(profileManager, customLateTransport, {
        sessionTimeoutMs: 45,
        clockFn: () => currentClockMs,
        browserLauncher: async () => {},
      });

      const sTimeout = await lateTimeoutOAuth.startSignInWithChatGpt({
        profileName: "Late Timeout Profile",
        listenOnLoopback: false,
      });

      // Start callback handling while session is still valid; token exchange remains suspended
      const callbackTimeoutPromise = lateTimeoutOAuth.handleCallbackUrl(
        sTimeout.sessionId,
        `${sTimeout.redirectUri}?code=code_late_timeout_12345&state=${encodeURIComponent(sTimeout.state)}&client_id=oaiapp_late_timeout_01`,
      );

      // Let the session expire and confirm OPENAI_OAUTH_SESSION_TIMEOUT on waitForCompletion()
      currentClockMs += 100;
      await expect(sTimeout.waitForCompletion()).rejects.toThrow(/OPENAI_OAUTH_SESSION_TIMEOUT/);

      // Release the transport response after the timeout has already fired
      releaseTokenExchangeTimeout();

      // Callback MUST also reject with OPENAI_OAUTH_SESSION_TIMEOUT (never succeed)
      await expect(callbackTimeoutPromise).rejects.toThrow(/OPENAI_OAUTH_SESSION_TIMEOUT/);

      // Zero profiles created, zero credentials stored, zero pending sessions
      expect(await profileManager.listProfiles()).toHaveLength(0);
      expect(lateTimeoutOAuth.getPendingSessionsCount()).toBe(0);
      timeoutR2Manager.dispose();
      lateTimeoutOAuth.dispose();

      // --- 2. Cancellation while token exchange is in flight ---
      let releaseTokenExchangeCancel!: () => void;
      const tokenExchangeCancelGate = new Promise<void>(resolve => {
        releaseTokenExchangeCancel = resolve;
      });

      const customCancelTransport: SecureAiTransport = {
        isExternalNetworkEnabled: () => true,
        execute: async req => {
          if (req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT) {
            await tokenExchangeCancelGate;
            const body = JSON.stringify({
              access_token: "at_late_after_cancel",
              refresh_token: "rt_late_after_cancel",
              id_token: signTestIdToken({
                iss: OPENAI_SIWC_ISSUER,
                sub: "sub-late-cancel",
                aud: "oaiapp_late_cancel_01",
                exp: Math.floor(currentClockMs / 1000) + 3600,
                nonce: sCancel.nonce,
              }),
              client_id: "oaiapp_late_cancel_01",
              scope: "openid resource.invoke chatgpt.tokens.use.direct",
            });
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body,
              json: () => JSON.parse(body),
              bytesReceived: body.length,
              timing: { startedAt: "", completedAt: "", durationMs: 20 },
            };
          }
          return mockTransport.execute(req);
        },
      };

      const cancelOAuth = new OpenAiSiwcOAuthManager(profileManager, customCancelTransport, {
        clockFn: () => currentClockMs,
        browserLauncher: async () => {},
      });

      const sCancel = await cancelOAuth.startSignInWithChatGpt({
        profileName: "Late Cancel Profile",
        listenOnLoopback: false,
      });

      const callbackCancelPromise = cancelOAuth.handleCallbackUrl(
        sCancel.sessionId,
        `${sCancel.redirectUri}?code=code_late_cancel_12345&state=${encodeURIComponent(sCancel.state)}&client_id=oaiapp_late_cancel_01`,
      );

      // Cancel session while token exchange is in flight
      sCancel.cancel();
      await expect(sCancel.waitForCompletion()).rejects.toThrow(/ERR_ABORTED/);

      // Release transport response
      releaseTokenExchangeCancel();
      await expect(callbackCancelPromise).rejects.toThrow(/ERR_ABORTED/);
      expect(await profileManager.listProfiles()).toHaveLength(0);
      expect(cancelOAuth.getPendingSessionsCount()).toBe(0);
      cancelOAuth.dispose();

      // --- 3. Window close / dispose() while token exchange is in flight ---
      let releaseTokenExchangeDispose!: () => void;
      const tokenExchangeDisposeGate = new Promise<void>(resolve => {
        releaseTokenExchangeDispose = resolve;
      });

      const customDisposeTransport: SecureAiTransport = {
        isExternalNetworkEnabled: () => true,
        execute: async req => {
          if (req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT) {
            await tokenExchangeDisposeGate;
            const body = JSON.stringify({
              access_token: "at_late_after_dispose",
              refresh_token: "rt_late_after_dispose",
              id_token: signTestIdToken({
                iss: OPENAI_SIWC_ISSUER,
                sub: "sub-late-dispose",
                aud: "oaiapp_late_dispose_01",
                exp: Math.floor(currentClockMs / 1000) + 3600,
                nonce: sDispose.nonce,
              }),
              client_id: "oaiapp_late_dispose_01",
              scope: "openid resource.invoke chatgpt.tokens.use.direct",
            });
            return {
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              body,
              json: () => JSON.parse(body),
              bytesReceived: body.length,
              timing: { startedAt: "", completedAt: "", durationMs: 20 },
            };
          }
          return mockTransport.execute(req);
        },
      };

      const disposeOAuth = new OpenAiSiwcOAuthManager(profileManager, customDisposeTransport, {
        clockFn: () => currentClockMs,
        browserLauncher: async () => {},
      });

      const sDispose = await disposeOAuth.startSignInWithChatGpt({
        profileName: "Late Dispose Profile",
        listenOnLoopback: false,
      });

      const callbackDisposePromise = disposeOAuth.handleCallbackUrl(
        sDispose.sessionId,
        `${sDispose.redirectUri}?code=code_late_dispose_12345&state=${encodeURIComponent(sDispose.state)}&client_id=oaiapp_late_dispose_01`,
      );

      // Close window / dispose manager while token exchange is in flight
      disposeOAuth.dispose();
      await expect(sDispose.waitForCompletion()).rejects.toThrow(/ERR_ABORTED/);

      releaseTokenExchangeDispose();
      await expect(callbackDisposePromise).rejects.toThrow(/ERR_ABORTED/);
      expect(await profileManager.listProfiles()).toHaveLength(0);
      expect(disposeOAuth.getPendingSessionsCount()).toBe(0);

      // --- 4. Mid-commit rollback compensation when cancelled after credential storage begins ---
      // First create a valid existing profile with known credentials
      const seedSession = await oauthManager.startSignInWithChatGpt({
        profileName: "Existing Profile For Rollback",
        listenOnLoopback: false,
      });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_seed_preserved_001",
            refresh_token: "rt_seed_preserved_001",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "sub-seed-preserved",
              aud: "oaiapp_seed_01",
              exp: Math.floor(currentClockMs / 1000) + 3600,
              nonce: seedSession.nonce,
            }),
            client_id: "oaiapp_seed_01",
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
      );
      const existingProfile = await oauthManager.handleCallbackUrl(
        seedSession.sessionId,
        `${seedSession.redirectUri}?code=code_seed_12345&state=${encodeURIComponent(seedSession.state)}&client_id=oaiapp_seed_01`,
      );

      // Now reauthorize existingProfile, and cancel the session INSIDE storeOrRotateCredential (after vault rotation finishes)
      const reauthRollbackSession = await oauthManager.startSignInWithChatGpt({
        profileId: existingProfile.id,
        listenOnLoopback: false,
      });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_uncommitted_new_token",
            refresh_token: "rt_uncommitted_new_token",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "sub-seed-preserved",
              aud: "oaiapp_seed_01",
              exp: Math.floor(currentClockMs / 1000) + 7200,
              nonce: reauthRollbackSession.nonce,
            }),
            client_id: "oaiapp_seed_01",
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
      );

      const origStoreOrRotate = profileManager.storeOrRotateCredential.bind(profileManager);
      const storeSpy = jest
        .spyOn(profileManager, "storeOrRotateCredential")
        .mockImplementationOnce(async (id, secret) => {
          const ref = await origStoreOrRotate(id, secret);
          // Cancel session right after credential was rotated in vault, before updateProfile completes!
          reauthRollbackSession.cancel();
          return ref;
        });

      await expect(
        oauthManager.handleCallbackUrl(
          reauthRollbackSession.sessionId,
          `${reauthRollbackSession.redirectUri}?code=code_rollback_reauth_123&state=${encodeURIComponent(reauthRollbackSession.state)}`,
        ),
      ).rejects.toThrow(/ERR_ABORTED/);

      storeSpy.mockRestore();

      // Verify rollback restored the exact previous credential ('at_seed_preserved_001') without losing it!
      const restoredSecret = JSON.parse(await profileManager.getApiKeyForProfile(existingProfile.id));
      expect(restoredSecret.accessToken).toBe("at_seed_preserved_001");
      expect(restoredSecret.refreshToken).toBe("rt_seed_preserved_001");
    });
  });

  describe("3. H8.8-03b & R1-05: DeepSeek Official Pricing, UTC Peak/Off-Peak Schedule, Holidays & Pre-Dispatch Conservative Guardrails", () => {
    it("R1-05: enforces official DeepSeek pricing per model and UTC peak (Mon-Fri 01:00-04:00 & 06:00-10:00 UTC) vs off-peak schedule, weekends, boundaries, and conservative holiday fallback", () => {
      // 1. Verify official tariff table values
      expect(DEFAULT_DEEPSEEK_PRICING["deepseek-flash"].standard).toEqual({
        inputCacheHitPer1M: 0.006,
        inputCacheMissPer1M: 0.30,
        outputPer1M: 1.20,
        reasoningOutputPer1M: 1.20,
      });
      expect(DEFAULT_DEEPSEEK_PRICING["deepseek-flash"].offPeakDiscount).toEqual({
        inputCacheHitPer1M: 0.003,
        inputCacheMissPer1M: 0.15,
        outputPer1M: 0.60,
        reasoningOutputPer1M: 0.60,
      });
      expect(DEFAULT_DEEPSEEK_PRICING["deepseek-v4-pro"].standard).toEqual({
        inputCacheHitPer1M: 0.044,
        inputCacheMissPer1M: 1.32,
        outputPer1M: 3.96,
        reasoningOutputPer1M: 3.96,
      });
      expect(DEFAULT_DEEPSEEK_PRICING["deepseek-v4-pro"].offPeakDiscount).toEqual({
        inputCacheHitPer1M: 0.022,
        inputCacheMissPer1M: 0.66,
        outputPer1M: 1.98,
        reasoningOutputPer1M: 1.98,
      });

      // 2. Verify exact UTC weekday boundary timestamps (Wednesday 2026-11-04)
      expect(isDeepSeekPeakUtc(Date.UTC(2026, 10, 4, 0, 59, 59, 999))).toBe(false); // 00:59:59.999 UTC -> Valle
      expect(isDeepSeekPeakUtc(Date.UTC(2026, 10, 4, 1, 0, 0, 0))).toBe(true); // 01:00:00.000 UTC -> Pico
      expect(isDeepSeekPeakUtc(Date.UTC(2026, 10, 4, 3, 59, 59, 999))).toBe(true); // 03:59:59.999 UTC -> Pico
      expect(isDeepSeekPeakUtc(Date.UTC(2026, 10, 4, 4, 0, 0, 0))).toBe(false); // 04:00:00.000 UTC -> Valle
      expect(isDeepSeekPeakUtc(Date.UTC(2026, 10, 4, 5, 59, 59, 999))).toBe(false); // 05:59:59.999 UTC -> Valle
      expect(isDeepSeekPeakUtc(Date.UTC(2026, 10, 4, 6, 0, 0, 0))).toBe(true); // 06:00:00.000 UTC -> Pico
      expect(isDeepSeekPeakUtc(Date.UTC(2026, 10, 4, 9, 59, 59, 999))).toBe(true); // 09:59:59.999 UTC -> Pico
      expect(isDeepSeekPeakUtc(Date.UTC(2026, 10, 4, 10, 0, 0, 0))).toBe(false); // 10:00:00.000 UTC -> Valle
      expect(isDeepSeekPeakUtc(Date.UTC(2026, 10, 4, 15, 30, 0, 0))).toBe(false); // 15:30:00.000 UTC -> Valle

      // 3. Verify full weekends (Saturday 2026-11-07 & Sunday 2026-11-08) are ALWAYS off-peak even during 02:00 and 07:30 UTC
      expect(isDeepSeekOffPeakUtc(Date.UTC(2026, 10, 7, 2, 0, 0))).toBe(true);
      expect(isDeepSeekOffPeakUtc(Date.UTC(2026, 10, 7, 7, 30, 0))).toBe(true);
      expect(isDeepSeekOffPeakUtc(Date.UTC(2026, 10, 8, 2, 30, 0))).toBe(true);
      expect(isDeepSeekOffPeakUtc(Date.UTC(2026, 10, 8, 8, 15, 0))).toBe(true);

      // 4. Verify Chinese public holidays & conservative fallback when holiday/tariff info is unverified
      const thursdayOct1PeakHour = Date.UTC(2026, 9, 1, 2, 0, 0); // Thursday 2026-10-01 02:00 UTC
      // Without verified holiday calendar -> conservatively Peak (never underestimates cost)
      expect(isDeepSeekPeakUtc(thursdayOct1PeakHour)).toBe(true);
      // With verified Chinese holiday calendar -> Off-Peak (valle)
      expect(
        isDeepSeekOffPeakUtc(thursdayOct1PeakHour, {
          verifiedChineseHolidaysUtc: new Set(["2026-10-01"]),
        }),
      ).toBe(true);
      // When unverifiedTariffOrHoliday is flagged -> forces conservative Peak even on weekend/holiday
      expect(
        isDeepSeekPeakUtc(Date.UTC(2026, 10, 7, 2, 0, 0), {
          unverifiedTariffOrHoliday: true,
        }),
      ).toBe(true);

      // 5. Verify exact per-model cost calculations (1M cache hit + 1M cache miss + 1M output)
      const sampleUsage = {
        promptTokens: 2_000_000,
        promptCacheHitTokens: 1_000_000,
        promptCacheMissTokens: 1_000_000,
        completionTokens: 1_000_000,
        reasoningTokens: 400_000,
        totalTokens: 3_000_000,
        pricingBandUsed: "standard" as const,
      };

      const wednesdayPeak = Date.UTC(2026, 10, 4, 2, 0, 0); // Wed 02:00 UTC (Peak)
      const wednesdayValle = Date.UTC(2026, 10, 4, 14, 0, 0); // Wed 14:00 UTC (Valle)

      const flashPeak = calculateDeepSeekCostUsd(
        sampleUsage,
        DEFAULT_DEEPSEEK_PRICING["deepseek-flash"],
        wednesdayPeak,
      );
      const flashValle = calculateDeepSeekCostUsd(
        sampleUsage,
        DEFAULT_DEEPSEEK_PRICING["deepseek-flash"],
        wednesdayValle,
      );
      // deepseek-flash Peak: 0.006 + 0.30 + 1.20 = 1.506 USD; Valle: 0.003 + 0.15 + 0.60 = 0.753 USD
      expect(flashPeak.bandUsed).toBe("standard");
      expect(flashPeak.costUsd).toBeCloseTo(1.506, 6);
      expect(flashPeak.isEstimatedReferential).toBe(true);
      expect(flashValle.bandUsed).toBe("off_peak");
      expect(flashValle.costUsd).toBeCloseTo(0.753, 6);

      const proPeak = calculateDeepSeekCostUsd(
        sampleUsage,
        DEFAULT_DEEPSEEK_PRICING["deepseek-v4-pro"],
        wednesdayPeak,
      );
      const proValle = calculateDeepSeekCostUsd(
        sampleUsage,
        DEFAULT_DEEPSEEK_PRICING["deepseek-v4-pro"],
        wednesdayValle,
      );
      // deepseek-v4-pro Peak: 0.044 + 1.32 + 3.96 = 5.324 USD; Valle: 0.022 + 0.66 + 1.98 = 2.662 USD
      expect(proPeak.bandUsed).toBe("standard");
      expect(proPeak.costUsd).toBeCloseTo(5.324, 6);
      expect(proValle.bandUsed).toBe("off_peak");
      expect(proValle.costUsd).toBeCloseTo(2.662, 6);

      // Omitted timestamp conservatively defaults to Peak ('standard') even if usage.pricingBandUsed claimed 'off_peak'
      const unverifiedTimestampCost = calculateDeepSeekCostUsd(
        { ...sampleUsage, pricingBandUsed: "off_peak" },
        DEFAULT_DEEPSEEK_PRICING["deepseek-v4-pro"],
        undefined,
      );
      expect(unverifiedTimestampCost.bandUsed).toBe("standard");
      expect(unverifiedTimestampCost.costUsd).toBeCloseTo(5.324, 6);
    });

    it("executes DeepSeek diagnosis on exclusive endpoint, verifies pre-dispatch conservative upper-bound estimate never underestimates cost, and handles HTTP errors with zero POST retries", async () => {
      expect(() =>
        validateAiEndpoint("https://api.deepseek.com/v1/chat/completions", "deepseek"),
      ).toThrow(SsrfSecurityError);

      const dsProfile = await profileManager.createProfile({
        name: "DeepSeek Reasoner Pro",
        provider: "deepseek",
        model: "deepseek-v4-pro",
        endpoint: DEEPSEEK_EXCLUSIVE_ENDPOINT,
        apiKey: "sk-deepseek-secret-prod-key-123456",
        maxRequestsPerIncident: 2,
      });

      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: "ds-resp-001",
            output_text: buildValidDiagnosisJson(testEvidenceId),
            usage: {
              input_tokens: 400,
              prompt_cache_hit_tokens: 300,
              prompt_cache_miss_tokens: 100,
              output_tokens: 200,
              output_tokens_details: {
                reasoning_tokens: 100,
              },
              total_tokens: 600,
            },
          }),
        }),
      );

      // Verify pre-dispatch conservative upper bound is strictly >= actual post-dispatch cost
      const adapter = new DeepSeekAiProviderAdapter(
        dsProfile,
        profileManager,
        mockTransport,
        {
          clockFn: () => Date.UTC(2026, 10, 4, 2, 0, 0), // Peak Wednesday 02:00 UTC
        },
      );

      const directResult = await adapter.generateDiagnosis(
        {
          incident: incidentRepo.getIncidentById(testIncidentId)!,
          evidences: evidenceRepo.listEvidenceByIncident(testIncidentId),
        },
        {
          maxTokens: 4096,
          timeoutMs: 10_000,
        },
      );

      const preDispatchMax = adapter.getLastPreDispatchConservativeMaxCostUsd()!;
      expect(preDispatchMax).toBeGreaterThan(0);
      expect(preDispatchMax).toBeGreaterThanOrEqual(directResult.calculatedCostUsd);

      // Also verify unknown model conservative estimation falls back to deepseek-v4-pro Peak
      const unknownEst = estimateConservativePreDispatchDeepSeekMaxCostUsd({
        model: "deepseek-unknown-future",
        payloadBytes: 4000,
        maxOutputTokens: 4096,
      });
      const proEst = estimateConservativePreDispatchDeepSeekMaxCostUsd({
        model: "deepseek-v4-pro",
        payloadBytes: 4000,
        maxOutputTokens: 4096,
      });
      expect(unknownEst.conservativeMaxCostUsd).toBe(proEst.conservativeMaxCostUsd);

      // Verify HTTP 429 has zero automatic POST retries
      let postAttempts = 0;
      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT && req.method === "POST",
        () => {
          postAttempts++;
          return {
            status: 429,
            statusText: "Too Many Requests",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ error: { message: "Rate limit" } }),
          };
        },
      );

      const preview = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      await expect(
        engine.executeDiagnosis(testIncidentId, dsProfile.id, preview.consentToken),
      ).rejects.toThrow(TransportHttpError);
      expect(postAttempts).toBe(1);
    });
  });

  describe("4. Security Invariants: Redirects, Malformed Payloads, Hallucinations, Secret Reflection, Cancellations & Zero External Network", () => {
    it("blocks insecure redirects, rejects malformed payloads/invented citations/reflected secrets, and guarantees DisabledRealNetworkEngine blocks external traffic by default", async () => {
      expect(() => validateAiEndpoint("https://127.0.0.1:8080/v1/responses")).toThrow(
        SsrfSecurityError,
      );

      const dsProfile = await profileManager.createProfile({
        name: "DeepSeek Security Test",
        provider: "deepseek",
        model: "deepseek-flash",
        endpoint: DEEPSEEK_EXCLUSIVE_ENDPOINT,
        apiKey: "sk-deepseek-security",
      });

      // 1. Redirect to 127.0.0.1 blocked
      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT,
        () => ({
          status: 302,
          statusText: "Found",
          headers: { location: "http://127.0.0.1:9999/steal-token" },
        }),
      );
      const p1 = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      await expect(
        engine.executeDiagnosis(testIncidentId, dsProfile.id, p1.consentToken),
      ).rejects.toThrow();

      // 2. Invented citations rejected
      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT,
        () => ({
          status: 200,
          body: buildValidDiagnosisJson("EVID-INVENTED-999"),
        }),
      );
      const p2 = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      await expect(
        engine.executeDiagnosis(testIncidentId, dsProfile.id, p2.consentToken),
      ).rejects.toThrow(/citas a evidencias inexistentes o inventadas/);

      // 3. Reflected secrets rejected
      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT,
        () => ({
          status: 200,
          body: buildValidDiagnosisJson(testEvidenceId, {
            recommendedNextSteps: ["Use password: leaked_production_secret_value_999"],
          }),
        }),
      );
      const p3 = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      await expect(
        engine.executeDiagnosis(testIncidentId, dsProfile.id, p3.consentToken),
      ).rejects.toThrow(/secretos o credenciales reflejadas/);

      // 4. Cancellation via AbortSignal
      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT,
        () => ({
          status: 200,
          delayMs: 200,
          body: buildValidDiagnosisJson(testEvidenceId),
        }),
      );
      const p4 = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      const abortCtrl = new AbortController();
      setTimeout(() => abortCtrl.abort(), 20);
      await expect(
        engine.executeDiagnosis(testIncidentId, dsProfile.id, p4.consentToken, {
          signal: abortCtrl.signal,
        }),
      ).rejects.toThrow(TransportAbortError);

      // 5. DefaultSecureAiTransport has DisabledRealNetworkEngine enabled by default
      const realDisabledTransport = new DefaultSecureAiTransport();
      expect(realDisabledTransport.isExternalNetworkEnabled()).toBe(false);
      await expect(
        realDisabledTransport.execute({
          provider: "deepseek",
          endpoint: DEEPSEEK_EXCLUSIVE_ENDPOINT,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          timeoutMs: 5000,
        }),
      ).rejects.toThrow(/Real external network transport for provider 'deepseek' is disabled/);
    });
  });

  // =========================================================================
  // H8.8-03-R3 — Definitive OAuth Concurrency Closure (R3-01 & R3-02)
  // =========================================================================
  describe("H8.8-03-R3 — Definitive OAuth Concurrency: Revocation Precedence & Commit Timeout", () => {
    it("R3-01: completed disconnection NEVER reverts via rollback when storeOrRotateCredential or updateProfile resolves late, while normal cancellation without disconnection preserves previous credentials", async () => {
      let revokedEndpointCalls = 0;
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_REVOKE_ENDPOINT && req.method === "POST",
        () => {
          revokedEndpointCalls++;
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({}),
          };
        },
        "revoke-r3-01",
      );

      const issuedClientId = "oaiapp_r3_01_concurrency_guard";
      const oldAccessToken = "SYNTHETIC_OLD_ACCESS_TOKEN_R3_01_DO_NOT_RESURRECT";
      const oldRefreshToken = "SYNTHETIC_OLD_REFRESH_TOKEN_R3_01_DO_NOT_RESURRECT";
      const newAccessToken = "SYNTHETIC_NEW_ACCESS_TOKEN_R3_01_ABORTED";
      const newRefreshToken = "SYNTHETIC_NEW_REFRESH_TOKEN_R3_01_ABORTED";

      // 1. Create active OAuth profile with old synthetic credentials
      const initSession = await oauthManager.startSignInWithChatGpt({
        profileName: "OpenAI R3-01 Profile",
        listenOnLoopback: false,
      });

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: oldAccessToken,
            refresh_token: oldRefreshToken,
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-openai-r3-01",
              aud: issuedClientId,
              exp: Math.floor(currentClockMs / 1000) + 3600,
              iat: Math.floor(currentClockMs / 1000),
              nonce: initSession.nonce,
            }),
            token_type: "Bearer",
            expires_in: 3600,
            client_id: issuedClientId,
            scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
        "token-r3",
      );

      const activeProfile = await oauthManager.handleCallbackUrl(
        initSession.sessionId,
        `${initSession.redirectUri}?code=valid_code_r3_01_init&state=${encodeURIComponent(initSession.state)}&client_id=${issuedClientId}`,
      );
      expect(activeProfile.status).toBe("active");
      expect(vault.hasCredential(activeProfile.credentialRef)).toBe(true);

      // 2. First verify that cancelling a reauthorization WITHOUT disconnection preserves old credentials intact
      const cancelSession = await oauthManager.startSignInWithChatGpt({
        profileId: activeProfile.id,
        listenOnLoopback: false,
      });

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "SYNTHETIC_CANCELLED_REAUTH_TOKEN",
            refresh_token: "SYNTHETIC_CANCELLED_REFRESH_TOKEN",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-openai-r3-01",
              aud: issuedClientId,
              exp: Math.floor(currentClockMs / 1000) + 3600,
              iat: Math.floor(currentClockMs / 1000),
              nonce: cancelSession.nonce,
            }),
            token_type: "Bearer",
            expires_in: 3600,
            client_id: issuedClientId,
            scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
        "token-r3",
      );

      const originalStoreOrRotate = profileManager.storeOrRotateCredential.bind(profileManager);
      const cancelSpy = jest
        .spyOn(profileManager, "storeOrRotateCredential")
        .mockImplementationOnce(async (id, secret) => {
          const ref = await originalStoreOrRotate(id, secret);
          // Cancel WITHOUT disconnection right after credential rotation
          cancelSession.cancel();
          return ref;
        });

      await expect(
        oauthManager.handleCallbackUrl(
          cancelSession.sessionId,
          `${cancelSession.redirectUri}?code=valid_code_r3_01_cancel&state=${encodeURIComponent(cancelSession.state)}`,
        ),
      ).rejects.toMatchObject({ code: "ERR_ABORTED" });
      cancelSpy.mockRestore();

      const profileAfterBenignCancel = await profileManager.getProfile(activeProfile.id);
      expect(profileAfterBenignCancel?.status).toBe("active");
      expect(await oauthManager.ensureValidAccessToken(activeProfile.id)).toBe(oldAccessToken);

      // 3. Now execute the exact R3-01 audit race:
      //    Start reauthorization -> pause storeOrRotateCredential AFTER rotating -> disconnectAndRevoke to completion -> release storeOrRotateCredential
      const raceSession = await oauthManager.startSignInWithChatGpt({
        profileId: activeProfile.id,
        listenOnLoopback: false,
      });

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-openai-r3-01",
              aud: issuedClientId,
              exp: Math.floor(currentClockMs / 1000) + 3600,
              iat: Math.floor(currentClockMs / 1000),
              nonce: raceSession.nonce,
            }),
            token_type: "Bearer",
            expires_in: 3600,
            client_id: issuedClientId,
            scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
        "token-r3",
      );

      let notifyRotated!: () => void;
      const rotatedBarrier = new Promise<void>(resolve => {
        notifyRotated = resolve;
      });
      let releasePausedStore!: () => void;
      const pauseStoreGate = new Promise<void>(resolve => {
        releasePausedStore = resolve;
      });

      const storeSpy = jest
        .spyOn(profileManager, "storeOrRotateCredential")
        .mockImplementationOnce(async (id, secret) => {
          // Rotate credential in vault first, then pause before returning
          const ref = await originalStoreOrRotate(id, secret);
          notifyRotated();
          await pauseStoreGate;
          return ref;
        });

      const reauthCallbackPromise = oauthManager.handleCallbackUrl(
        raceSession.sessionId,
        `${raceSession.redirectUri}?code=valid_code_r3_01_race&state=${encodeURIComponent(raceSession.state)}`,
      );

      // Wait until storeOrRotateCredential has rotated the secret and is paused
      await rotatedBarrier;

      // 4. Execute disconnectAndRevoke(profileId) until completion while storeOrRotateCredential is paused
      const disconnectedProfile = await oauthManager.disconnectAndRevoke(activeProfile.id);

      // 5. Confirm profile is revoked and local credentials are deleted immediately after disconnectAndRevoke
      expect(disconnectedProfile.status).toBe("revoked");
      expect(disconnectedProfile.availabilityStatus).toBe("disconnected");
      expect(vault.hasCredential(activeProfile.credentialRef)).toBe(false);
      expect(revokedEndpointCalls).toBeGreaterThanOrEqual(1);

      // 6. Release the paused storeOrRotateCredential in the reauthorization flow
      releasePausedStore();

      let reauthError: any;
      try {
        await reauthCallbackPromise;
      } catch (err) {
        reauthError = err;
      }
      storeSpy.mockRestore();

      expect(reauthError).toBeDefined();
      expect(reauthError.code).toBe("ERR_ABORTED");
      // Verify zero secrets in error message
      expect(String(reauthError.message)).not.toContain(oldAccessToken);
      expect(String(reauthError.message)).not.toContain(oldRefreshToken);
      expect(String(reauthError.message)).not.toContain(newAccessToken);
      expect(String(reauthError.message)).not.toContain(newRefreshToken);

      // Verify final state: revocation prevailed, zero resurrected credentials, inference/consent blocked
      const finalProfile = await profileManager.getProfile(activeProfile.id);
      const hasCredentialAfterRace = finalProfile
        ? vault.hasCredential(finalProfile.credentialRef)
        : false;
      const rawCredentialAfterRace = await profileManager.tryGetRawCredential(activeProfile.id);
      const oldSyntheticCredentialResurrected =
        rawCredentialAfterRace !== undefined && rawCredentialAfterRace.includes(oldAccessToken);

      expect({
        reauthOutcome: reauthError.code,
        statusAfterDisconnect: disconnectedProfile.status,
        hasCredentialAfterDisconnect: false,
        finalStatus: finalProfile?.status,
        hasCredentialAfterRace,
        oldSyntheticCredentialResurrected,
      }).toEqual({
        reauthOutcome: "ERR_ABORTED",
        statusAfterDisconnect: "revoked",
        hasCredentialAfterDisconnect: false,
        finalStatus: "revoked",
        hasCredentialAfterRace: false,
        oldSyntheticCredentialResurrected: false,
      });

      expect(oauthManager.getPendingSessionsCount()).toBe(0);
      await expect(oauthManager.ensureValidAccessToken(activeProfile.id)).rejects.toMatchObject({
        code: "PROFILE_INACTIVE",
      });
      await expect(
        engine.prepareConsentPreview(testIncidentId, activeProfile.id),
      ).rejects.toMatchObject({
        code: "PROFILE_INACTIVE",
      });
    });

    it("R3-02: session timeout covers the commit phase (createProfile, storeOrRotateCredential, updateProfile), rejecting waitForCompletion() promptly and rolling back late storage completions", async () => {
      const commitTimeoutOAuthManager = new OpenAiSiwcOAuthManager(profileManager, mockTransport, {
        clockFn: () => currentClockMs,
        sessionTimeoutMs: 90,
        browserLauncher: async () => {},
      });

      const issuedClientId = "oaiapp_r3_02_commit_timeout";

      // --- Case 1: Delayed createProfile (90ms timeout vs 300ms storage pause) ---
      const sessionCreate = await commitTimeoutOAuthManager.startSignInWithChatGpt({
        profileName: "Delayed Create Profile",
        listenOnLoopback: true,
      });

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "SYNTHETIC_R3_02_CREATE_TOKEN",
            refresh_token: "SYNTHETIC_R3_02_CREATE_REFRESH",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-openai-r3-02-create",
              aud: issuedClientId,
              exp: Math.floor(currentClockMs / 1000) + 3600,
              iat: Math.floor(currentClockMs / 1000),
              nonce: sessionCreate.nonce,
            }),
            token_type: "Bearer",
            expires_in: 3600,
            client_id: issuedClientId,
            scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
        "token-r3-02",
      );

      const originalCreateProfile = profileManager.createProfile.bind(profileManager);
      let notifyEnteringCreate!: () => void;
      const enteringCreatePromise = new Promise<void>(resolve => {
        notifyEnteringCreate = resolve;
      });

      const createSpy = jest
        .spyOn(profileManager, "createProfile")
        .mockImplementationOnce(async input => {
          notifyEnteringCreate();
          await new Promise(r => setTimeout(r, 300));
          return originalCreateProfile(input);
        });

      const startTime = Date.now();
      const callbackPromise = commitTimeoutOAuthManager.handleCallbackUrl(
        sessionCreate.sessionId,
        `${sessionCreate.redirectUri}?code=valid_code_r3_02_create&state=${encodeURIComponent(sessionCreate.state)}&client_id=${issuedClientId}`,
      );
      callbackPromise.catch(() => {});

      await enteringCreatePromise;

      // waitForCompletion() MUST reject when the 90ms timer expires, NOT wait 300ms for createProfile!
      await expect(sessionCreate.waitForCompletion()).rejects.toMatchObject({
        code: "OPENAI_OAUTH_SESSION_TIMEOUT",
      });
      const elapsedWaitMs = Date.now() - startTime;
      expect(elapsedWaitMs).toBeLessThan(250);
      expect(commitTimeoutOAuthManager.getPendingSessionsCount()).toBe(0);

      // Loopback listener on 127.0.0.1 must already be closed upon timeout
      await expect(
        new Promise((resolve, reject) => {
          const req = http.get(
            `http://127.0.0.1:${sessionCreate.loopbackPort}/oauth/callback`,
            res => {
              res.resume();
              resolve(res.statusCode);
            },
          );
          req.on("error", reject);
        }),
      ).rejects.toThrow();

      // Now wait for the 300ms delayed createProfile + rollback compensation to finish
      await expect(callbackPromise).rejects.toMatchObject({
        code: "OPENAI_OAUTH_SESSION_TIMEOUT",
      });
      createSpy.mockRestore();

      // Rollback must have deleted the late-created profile and its vault credential
      const profilesAfterDelayedCreate = await profileManager.listProfiles();
      expect(profilesAfterDelayedCreate).toHaveLength(0);
      expect(commitTimeoutOAuthManager.getPendingSessionsCount()).toBe(0);

      // --- Case 2: Delayed storeOrRotateCredential and updateProfile on existing profile ---
      const fastSetupManager = new OpenAiSiwcOAuthManager(profileManager, mockTransport, {
        clockFn: () => currentClockMs,
        sessionTimeoutMs: 5000,
        browserLauncher: async () => {},
      });
      const baseSession = await fastSetupManager.startSignInWithChatGpt({
        profileName: "Existing Profile For R3-02",
        listenOnLoopback: false,
      });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "SYNTHETIC_R3_02_ORIGINAL_TOKEN",
            refresh_token: "SYNTHETIC_R3_02_ORIGINAL_REFRESH",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-openai-r3-02-update",
              aud: issuedClientId,
              exp: Math.floor(currentClockMs / 1000) + 3600,
              iat: Math.floor(currentClockMs / 1000),
              nonce: baseSession.nonce,
            }),
            token_type: "Bearer",
            expires_in: 3600,
            client_id: issuedClientId,
            scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
        "token-r3-02",
      );
      const existingProfile = await fastSetupManager.handleCallbackUrl(
        baseSession.sessionId,
        `${baseSession.redirectUri}?code=valid_code_r3_02_base&state=${encodeURIComponent(baseSession.state)}&client_id=${issuedClientId}`,
      );

      // Delay updateProfile for 300ms on a 90ms session timeout
      const sessionUpdate = await commitTimeoutOAuthManager.startSignInWithChatGpt({
        profileId: existingProfile.id,
        listenOnLoopback: false,
      });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "SYNTHETIC_R3_02_LATE_ROTATED_TOKEN",
            refresh_token: "SYNTHETIC_R3_02_LATE_ROTATED_REFRESH",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-openai-r3-02-update",
              aud: issuedClientId,
              exp: Math.floor(currentClockMs / 1000) + 3600,
              iat: Math.floor(currentClockMs / 1000),
              nonce: sessionUpdate.nonce,
            }),
            token_type: "Bearer",
            expires_in: 3600,
            client_id: issuedClientId,
            scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
        "token-r3-02",
      );

      const originalUpdateProfile = profileManager.updateProfile.bind(profileManager);
      const updateSpy = jest
        .spyOn(profileManager, "updateProfile")
        .mockImplementationOnce(async (id, input) => {
          await new Promise(r => setTimeout(r, 300));
          return originalUpdateProfile(id, input);
        });

      const updateStart = Date.now();
      const updateCallbackPromise = commitTimeoutOAuthManager.handleCallbackUrl(
        sessionUpdate.sessionId,
        `${sessionUpdate.redirectUri}?code=valid_code_r3_02_upd&state=${encodeURIComponent(sessionUpdate.state)}`,
      );
      updateCallbackPromise.catch(() => {});

      await expect(sessionUpdate.waitForCompletion()).rejects.toMatchObject({
        code: "OPENAI_OAUTH_SESSION_TIMEOUT",
      });
      expect(Date.now() - updateStart).toBeLessThan(250);
      expect(commitTimeoutOAuthManager.getPendingSessionsCount()).toBe(0);

      await expect(updateCallbackPromise).rejects.toMatchObject({
        code: "OPENAI_OAUTH_SESSION_TIMEOUT",
      });
      updateSpy.mockRestore();

      // Original credential must be restored intact, not the timed-out rotated token
      expect(await fastSetupManager.ensureValidAccessToken(existingProfile.id)).toBe(
        "SYNTHETIC_R3_02_ORIGINAL_TOKEN",
      );
    });
  });

  // =========================================================================
  // H8.8-03-R4 — Strict Per-Operation Profile Ownership Isolation on Compensation
  // =========================================================================
  describe("H8.8-03-R4 — Strict Per-Operation Profile Ownership Isolation on Compensation", () => {
    it("R4-01: compensation of a cancelled or timed-out OAuth flow deletes ONLY its own profile/credential and NEVER deletes a concurrent valid profile (same account+client_id, different accounts, or same account with different client_ids)", async () => {
      const originalCreateProfile = profileManager.createProfile.bind(profileManager);

      async function runConcurrentIsolationScenario(params: {
        subA: string;
        clientIdA: string;
        subB: string;
        clientIdB: string;
        terminationMode: "cancel" | "timeout";
        label: string;
      }): Promise<void> {
        const scenarioManager = new OpenAiSiwcOAuthManager(profileManager, mockTransport, {
          clockFn: () => currentClockMs,
          sessionTimeoutMs: params.terminationMode === "timeout" ? 80 : 5000,
          browserLauncher: async () => {},
        });

        const sessionA = await scenarioManager.startSignInWithChatGpt({
          profileName: `OAuth-A-${params.label}`,
          listenOnLoopback: false,
        });
        const sessionB = await scenarioManager.startSignInWithChatGpt({
          profileName: `OAuth-B-${params.label}`,
          listenOnLoopback: false,
        });

        const tokenA = `SYNTHETIC_ACCESS_TOKEN_A_${params.label}`;
        const tokenB = `SYNTHETIC_ACCESS_TOKEN_B_${params.label}`;

        mockTransport.registerRoute(
          req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
          req => {
            const bodyParams = new URLSearchParams(req.body || "");
            const code = bodyParams.get("code") || "";
            const isA = code.includes("_session_A_");
            const sub = isA ? params.subA : params.subB;
            const clientId = isA ? params.clientIdA : params.clientIdB;
            const nonce = isA ? sessionA.nonce : sessionB.nonce;
            const accessToken = isA ? tokenA : tokenB;

            return {
              status: 200,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                access_token: accessToken,
                refresh_token: `${accessToken}_REFRESH`,
                id_token: signTestIdToken({
                  iss: OPENAI_SIWC_ISSUER,
                  sub,
                  aud: clientId,
                  exp: Math.floor(currentClockMs / 1000) + 3600,
                  iat: Math.floor(currentClockMs / 1000),
                  nonce,
                }),
                token_type: "Bearer",
                expires_in: 3600,
                client_id: clientId,
                scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
              }),
            };
          },
          "token-r4-isolation",
        );

        let notifyACreatedInStorage!: () => void;
        const aCreatedInStorageGate = new Promise<void>(resolve => {
          notifyACreatedInStorage = resolve;
        });
        let releaseACreate!: () => void;
        const pauseACreateGate = new Promise<void>(resolve => {
          releaseACreate = resolve;
        });

        let createdProfileA: Awaited<ReturnType<typeof originalCreateProfile>> | undefined;

        const createSpy = jest
          .spyOn(profileManager, "createProfile")
          .mockImplementation(async input => {
            if (input.name === `OAuth-A-${params.label}`) {
              createdProfileA = await originalCreateProfile(input);
              notifyACreatedInStorage();
              await pauseACreateGate;
              return createdProfileA;
            }
            return originalCreateProfile(input);
          });

        // 1. Session A begins and pauses inside createProfile (after writing oauth-A to SQLite & vault)
        const callbackAPromise = scenarioManager.handleCallbackUrl(
          sessionA.sessionId,
          `${sessionA.redirectUri}?code=code_session_A_${params.label}&state=${encodeURIComponent(sessionA.state)}&client_id=${params.clientIdA}`,
        );
        callbackAPromise.catch(() => {});

        await aCreatedInStorageGate;
        expect(createdProfileA).toBeDefined();

        // 2. Session B completes normally and persists its profile (oauth-B)
        const profileB = await scenarioManager.handleCallbackUrl(
          sessionB.sessionId,
          `${sessionB.redirectUri}?code=code_session_B_${params.label}&state=${encodeURIComponent(sessionB.state)}&client_id=${params.clientIdB}`,
        );
        expect(profileB.status).toBe("active");
        expect(vault.hasCredential(profileB.credentialRef)).toBe(true);

        // 3. Session A expires or is cancelled while still paused in createProfile
        if (params.terminationMode === "cancel") {
          sessionA.cancel();
          await expect(sessionA.waitForCompletion()).rejects.toMatchObject({
            code: "ERR_ABORTED",
          });
        } else {
          await expect(sessionA.waitForCompletion()).rejects.toMatchObject({
            code: "OPENAI_OAUTH_SESSION_TIMEOUT",
          });
        }

        // 4. Session A completes createProfile late and executes compensation
        releaseACreate();
        await expect(callbackAPromise).rejects.toMatchObject({
          code:
            params.terminationMode === "cancel"
              ? "ERR_ABORTED"
              : "OPENAI_OAUTH_SESSION_TIMEOUT",
        });

        createSpy.mockRestore();

        // Mandatory assertions:
        // - A is NOT persisted and zero credentials of A remain in vault
        expect(await profileManager.getProfile(createdProfileA!.id)).toBeUndefined();
        expect(vault.hasCredential(createdProfileA!.credentialRef)).toBe(false);

        // - B remains active and its encrypted credential in SecureCredentialVault is intact
        const survivingB = await profileManager.getProfile(profileB.id);
        expect(survivingB).toBeDefined();
        expect(survivingB?.status).toBe("active");
        expect(vault.hasCredential(profileB.credentialRef)).toBe(true);
        expect(await scenarioManager.ensureValidAccessToken(profileB.id)).toBe(tokenB);

        // - Zero pending sessions
        expect(scenarioManager.getPendingSessionsCount()).toBe(0);
      }

      // Case 1a: Exact same ChatGPT account and same oaiapp_* client_id (cancelled)
      await runConcurrentIsolationScenario({
        subA: "user-same-account-r4",
        clientIdA: "oaiapp_same_client_r4",
        subB: "user-same-account-r4",
        clientIdB: "oaiapp_same_client_r4",
        terminationMode: "cancel",
        label: "same_sub_same_client_cancel",
      });

      // Case 1b: Exact same ChatGPT account and same oaiapp_* client_id (timed out during commit)
      await runConcurrentIsolationScenario({
        subA: "user-same-account-r4",
        clientIdA: "oaiapp_same_client_r4",
        subB: "user-same-account-r4",
        clientIdB: "oaiapp_same_client_r4",
        terminationMode: "timeout",
        label: "same_sub_same_client_timeout",
      });

      // Case 2: Two different ChatGPT accounts
      await runConcurrentIsolationScenario({
        subA: "user-account-alpha-r4",
        clientIdA: "oaiapp_client_alpha_r4",
        subB: "user-account-beta-r4",
        clientIdB: "oaiapp_client_beta_r4",
        terminationMode: "cancel",
        label: "different_accounts",
      });

      // Case 3: Same ChatGPT account with two different oaiapp_* client IDs
      await runConcurrentIsolationScenario({
        subA: "user-same-account-multi-client-r4",
        clientIdA: "oaiapp_client_one_r4",
        subB: "user-same-account-multi-client-r4",
        clientIdB: "oaiapp_client_two_r4",
        terminationMode: "cancel",
        label: "same_account_different_clients",
      });
    });
  });

  // =========================================================================
  // H8.8-03-R4a — Safe Cleanup Ordering Under Credential Vault Failures
  // =========================================================================
  describe("H8.8-03-R4a — Safe Cleanup Ordering Under Credential Vault Failures", () => {
    it("R4a-01: enforces revoked state before async vault deletion, retains credentialRef on vault failure for retry, propagates vault errors, preserves concurrent sessions, and leaves zero orphaned SQL credentials", async () => {
      // Use SQLite-backed SecureCredentialVault on :memory: SqliteClient so SQL queries inspect ai_vault_credentials directly
      const sqlVault = new SecureCredentialVault({
        backend: new SoftwareAesGcmBackend(),
        sqlite,
      });
      const sqlProfileManager = new AiProfileManager(sqlite, sqlVault);
      const sqlOAuthManager = new OpenAiSiwcOAuthManager(sqlProfileManager, mockTransport, {
        clockFn: () => currentClockMs,
        sessionTimeoutMs: 5000,
        browserLauncher: async () => {},
      });

      const db = sqlite.getDb();
      const countOrphanedVaultRows = (): number => {
        const row = db
          .prepare(
            "SELECT COUNT(*) AS cnt FROM ai_vault_credentials WHERE credential_ref NOT IN (SELECT credential_ref FROM ai_profiles)",
          )
          .get() as { cnt: number };
        return row.cnt;
      };
      const countVaultRowsForRef = (ref: string): number => {
        const row = db
          .prepare("SELECT COUNT(*) AS cnt FROM ai_vault_credentials WHERE credential_ref = ?")
          .get(ref) as { cnt: number };
        return row.cnt;
      };
      const countProfileRowsForId = (id: string): number => {
        const row = db
          .prepare("SELECT COUNT(*) AS cnt FROM ai_profiles WHERE id = ?")
          .get(id) as { cnt: number };
        return row.cnt;
      };

      const issuedClientId = "oaiapp_r4a_vault_ordering";

      const registerTokenForSession = (
        getNonce: () => string,
        sub = "user-r4a",
        clientId = issuedClientId,
        tokenPrefix = "SYNTHETIC_R4A_TOKEN",
      ) => {
        mockTransport.registerRoute(
          req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
          () => ({
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: `${tokenPrefix}_ACCESS`,
              refresh_token: `${tokenPrefix}_REFRESH`,
              id_token: signTestIdToken({
                iss: OPENAI_SIWC_ISSUER,
                sub,
                aud: clientId,
                exp: Math.floor(currentClockMs / 1000) + 3600,
                iat: Math.floor(currentClockMs / 1000),
                nonce: getNonce(),
              }),
              token_type: "Bearer",
              expires_in: 3600,
              client_id: clientId,
              scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            }),
          }),
          "token-r4a",
        );
      };

      // 1. Successful deletion: marks revoked, deletes vault credential, then deletes SQLite row
      const s1 = await sqlOAuthManager.startSignInWithChatGpt({
        profileName: "R4a-Success-Delete",
        listenOnLoopback: false,
      });
      registerTokenForSession(() => s1.nonce, "user-r4a-1", issuedClientId, "SYNTHETIC_R4A_1");
      const p1 = await sqlOAuthManager.handleCallbackUrl(
        s1.sessionId,
        `${s1.redirectUri}?code=code_r4a_1&state=${encodeURIComponent(s1.state)}&client_id=${issuedClientId}`,
      );
      expect(countProfileRowsForId(p1.id)).toBe(1);
      expect(countVaultRowsForRef(p1.credentialRef)).toBe(1);

      await sqlProfileManager.deleteProfile(p1.id);
      expect(countProfileRowsForId(p1.id)).toBe(0);
      expect(countVaultRowsForRef(p1.credentialRef)).toBe(0);
      expect(countOrphanedVaultRows()).toBe(0);

      // 2. Transient vault failure during OAuth cancellation compensation followed by successful retry
      const originalCreate = sqlProfileManager.createProfile.bind(sqlProfileManager);
      const originalDeleteCred = sqlVault.deleteCredential.bind(sqlVault);

      const s2 = await sqlOAuthManager.startSignInWithChatGpt({
        profileName: "R4a-Transient-Vault-Failure",
        listenOnLoopback: false,
      });
      registerTokenForSession(() => s2.nonce, "user-r4a-2", issuedClientId, "SYNTHETIC_R4A_2");

      let transientProfileCreated!: Awaited<ReturnType<typeof originalCreate>>;
      const createS2Spy = jest
        .spyOn(sqlProfileManager, "createProfile")
        .mockImplementationOnce(async input => {
          transientProfileCreated = await originalCreate(input);
          s2.cancel();
          return transientProfileCreated;
        });

      const transientVaultSpy = jest
        .spyOn(sqlVault, "deleteCredential")
        .mockImplementationOnce(async () => {
          throw new Error("SQLITE_VAULT_BUSY_TRANSIENT_FAILURE");
        });

      await expect(
        sqlOAuthManager.handleCallbackUrl(
          s2.sessionId,
          `${s2.redirectUri}?code=code_r4a_2&state=${encodeURIComponent(s2.state)}&client_id=${issuedClientId}`,
        ),
      ).rejects.toThrow("SQLITE_VAULT_BUSY_TRANSIENT_FAILURE");

      createS2Spy.mockRestore();
      transientVaultSpy.mockRestore();

      // Profile MUST be 'revoked' (no inference possible) AND still present in ai_profiles with credential_ref intact
      const revokedS2 = await sqlProfileManager.getProfile(transientProfileCreated.id);
      expect(revokedS2).toBeDefined();
      expect(revokedS2?.status).toBe("revoked");
      expect(revokedS2?.availabilityStatus).toBe("disconnected");
      expect(revokedS2?.credentialRef).toBe(transientProfileCreated.credentialRef);
      expect(countVaultRowsForRef(transientProfileCreated.credentialRef)).toBe(1);
      expect(countOrphanedVaultRows()).toBe(0);
      await expect(
        sqlOAuthManager.ensureValidAccessToken(transientProfileCreated.id),
      ).rejects.toMatchObject({ code: "PROFILE_INACTIVE" });

      // Retry deleteProfile now that transient failure cleared -> succeeds and leaves 0 rows in SQL
      await sqlProfileManager.deleteProfile(transientProfileCreated.id);
      expect(countProfileRowsForId(transientProfileCreated.id)).toBe(0);
      expect(countVaultRowsForRef(transientProfileCreated.credentialRef)).toBe(0);
      expect(countOrphanedVaultRows()).toBe(0);

      // 3. Persistent vault failure: profile stays revoked and retains credentialRef for subsequent purge
      const s3 = await sqlOAuthManager.startSignInWithChatGpt({
        profileName: "R4a-Persistent-Vault-Failure",
        listenOnLoopback: false,
      });
      registerTokenForSession(() => s3.nonce, "user-r4a-3", issuedClientId, "SYNTHETIC_R4A_3");
      const p3 = await sqlOAuthManager.handleCallbackUrl(
        s3.sessionId,
        `${s3.redirectUri}?code=code_r4a_3&state=${encodeURIComponent(s3.state)}&client_id=${issuedClientId}`,
      );

      const persistentSpy = jest
        .spyOn(sqlVault, "deleteCredential")
        .mockImplementation(async () => {
          throw new Error("SQLITE_VAULT_PERSISTENT_IOERR");
        });

      await expect(sqlProfileManager.deleteProfile(p3.id)).rejects.toThrow(
        "SQLITE_VAULT_PERSISTENT_IOERR",
      );
      await expect(sqlProfileManager.deleteProfile(p3.id)).rejects.toThrow(
        "SQLITE_VAULT_PERSISTENT_IOERR",
      );

      const afterPersistentFail = await sqlProfileManager.getProfile(p3.id);
      expect(afterPersistentFail?.status).toBe("revoked");
      expect(afterPersistentFail?.credentialRef).toBe(p3.credentialRef);
      expect(countOrphanedVaultRows()).toBe(0);
      await expect(sqlProfileManager.getApiKeyForProfile(p3.id)).rejects.toThrow(/is 'revoked'/);

      persistentSpy.mockRestore();
      await sqlProfileManager.deleteProfile(p3.id);
      expect(countProfileRowsForId(p3.id)).toBe(0);
      expect(countVaultRowsForRef(p3.credentialRef)).toBe(0);
      expect(countOrphanedVaultRows()).toBe(0);

      // 4. Two concurrent sessions: deletion of A fails in vault while B remains active and intact
      const s4A = await sqlOAuthManager.startSignInWithChatGpt({
        profileName: "R4a-Concurrent-A",
        listenOnLoopback: false,
      });
      const s4B = await sqlOAuthManager.startSignInWithChatGpt({
        profileName: "R4a-Concurrent-B",
        listenOnLoopback: false,
      });

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        req => {
          const bodyParams = new URLSearchParams(req.body || "");
          const isA = (bodyParams.get("code") || "").includes("_4A");
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: isA ? "SYNTHETIC_R4A_4A_TOKEN" : "SYNTHETIC_R4A_4B_TOKEN",
              refresh_token: isA ? "SYNTHETIC_R4A_4A_REFRESH" : "SYNTHETIC_R4A_4B_REFRESH",
              id_token: signTestIdToken({
                iss: OPENAI_SIWC_ISSUER,
                sub: "user-r4a-shared",
                aud: issuedClientId,
                exp: Math.floor(currentClockMs / 1000) + 3600,
                iat: Math.floor(currentClockMs / 1000),
                nonce: isA ? s4A.nonce : s4B.nonce,
              }),
              token_type: "Bearer",
              expires_in: 3600,
              client_id: issuedClientId,
              scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
            }),
          };
        },
        "token-r4a",
      );

      let notify4ACreated!: () => void;
      const gate4ACreated = new Promise<void>(r => {
        notify4ACreated = r;
      });
      let release4A!: () => void;
      const gateRelease4A = new Promise<void>(r => {
        release4A = r;
      });
      let created4A!: Awaited<ReturnType<typeof originalCreate>>;

      const create4Spy = jest
        .spyOn(sqlProfileManager, "createProfile")
        .mockImplementation(async input => {
          if (input.name === "R4a-Concurrent-A") {
            created4A = await originalCreate(input);
            notify4ACreated();
            await gateRelease4A;
            return created4A;
          }
          return originalCreate(input);
        });

      const callback4APromise = sqlOAuthManager.handleCallbackUrl(
        s4A.sessionId,
        `${s4A.redirectUri}?code=code_r4a_4A&state=${encodeURIComponent(s4A.state)}&client_id=${issuedClientId}`,
      );
      callback4APromise.catch(() => {});

      await gate4ACreated;

      const created4B = await sqlOAuthManager.handleCallbackUrl(
        s4B.sessionId,
        `${s4B.redirectUri}?code=code_r4a_4B&state=${encodeURIComponent(s4B.state)}&client_id=${issuedClientId}`,
      );
      expect(created4B.status).toBe("active");

      const selectiveVaultFailSpy = jest
        .spyOn(sqlVault, "deleteCredential")
        .mockImplementation(async ref => {
          if (ref === created4A.credentialRef) {
            throw new Error("VAULT_DELETE_FAILED_FOR_SESSION_A");
          }
          return originalDeleteCred(ref);
        });

      s4A.cancel();
      release4A();

      await expect(callback4APromise).rejects.toThrow("VAULT_DELETE_FAILED_FOR_SESSION_A");
      create4Spy.mockRestore();
      selectiveVaultFailSpy.mockRestore();

      // A is revoked and retains credentialRef; B is active and untouched
      const state4A = await sqlProfileManager.getProfile(created4A.id);
      const state4B = await sqlProfileManager.getProfile(created4B.id);
      expect(state4A?.status).toBe("revoked");
      expect(state4A?.credentialRef).toBe(created4A.credentialRef);
      expect(state4B?.status).toBe("active");
      expect(await sqlOAuthManager.ensureValidAccessToken(created4B.id)).toBe(
        "SYNTHETIC_R4A_4B_TOKEN",
      );
      expect(countOrphanedVaultRows()).toBe(0);

      // Clean up 4A via retry, verify 4B remains intact
      await sqlProfileManager.deleteProfile(created4A.id);
      expect(countProfileRowsForId(created4A.id)).toBe(0);
      expect(countVaultRowsForRef(created4A.credentialRef)).toBe(0);
      expect(countProfileRowsForId(created4B.id)).toBe(1);
      expect(countVaultRowsForRef(created4B.credentialRef)).toBe(1);
      expect(countOrphanedVaultRows()).toBe(0);

      // 5. Timeout during creation + clean SQL verification
      const shortTimeoutManager = new OpenAiSiwcOAuthManager(sqlProfileManager, mockTransport, {
        clockFn: () => currentClockMs,
        sessionTimeoutMs: 70,
        browserLauncher: async () => {},
      });
      const s5 = await shortTimeoutManager.startSignInWithChatGpt({
        profileName: "R4a-Timeout-Create",
        listenOnLoopback: false,
      });
      registerTokenForSession(() => s5.nonce, "user-r4a-5", issuedClientId, "SYNTHETIC_R4A_5");

      let created5Ref = "";
      const create5Spy = jest
        .spyOn(sqlProfileManager, "createProfile")
        .mockImplementationOnce(async input => {
          await new Promise(r => setTimeout(r, 200));
          const created = await originalCreate(input);
          created5Ref = created.credentialRef;
          return created;
        });

      const cb5Promise = shortTimeoutManager.handleCallbackUrl(
        s5.sessionId,
        `${s5.redirectUri}?code=code_r4a_5&state=${encodeURIComponent(s5.state)}&client_id=${issuedClientId}`,
      );
      cb5Promise.catch(() => {});

      await expect(s5.waitForCompletion()).rejects.toMatchObject({
        code: "OPENAI_OAUTH_SESSION_TIMEOUT",
      });
      await expect(cb5Promise).rejects.toMatchObject({
        code: "OPENAI_OAUTH_SESSION_TIMEOUT",
      });
      create5Spy.mockRestore();

      expect(created5Ref).not.toBe("");
      expect(countVaultRowsForRef(created5Ref)).toBe(0);
      expect(countOrphanedVaultRows()).toBe(0);

      // 6. Concurrent revocation with rollback on SQLite-backed vault
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_REVOKE_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
        "revoke-r4a",
      );

      const s6 = await sqlOAuthManager.startSignInWithChatGpt({
        profileId: created4B.id,
        listenOnLoopback: false,
      });
      registerTokenForSession(() => s6.nonce, "user-r4a-shared", issuedClientId, "SYNTHETIC_R4A_6");

      const originalRotate = sqlProfileManager.storeOrRotateCredential.bind(sqlProfileManager);
      let notify6Rotated!: () => void;
      const gate6Rotated = new Promise<void>(r => {
        notify6Rotated = r;
      });
      let release6Rotate!: () => void;
      const gateRelease6Rotate = new Promise<void>(r => {
        release6Rotate = r;
      });

      const rotate6Spy = jest
        .spyOn(sqlProfileManager, "storeOrRotateCredential")
        .mockImplementationOnce(async (id, secret) => {
          const ref = await originalRotate(id, secret);
          notify6Rotated();
          await gateRelease6Rotate;
          return ref;
        });

      const cb6Promise = sqlOAuthManager.handleCallbackUrl(
        s6.sessionId,
        `${s6.redirectUri}?code=code_r4a_6&state=${encodeURIComponent(s6.state)}`,
      );
      cb6Promise.catch(() => {});

      await gate6Rotated;
      await sqlOAuthManager.disconnectAndRevoke(created4B.id);
      release6Rotate();

      await expect(cb6Promise).rejects.toMatchObject({ code: "ERR_ABORTED" });
      rotate6Spy.mockRestore();

      const final4B = await sqlProfileManager.getProfile(created4B.id);
      expect(final4B?.status).toBe("revoked");
      expect(countVaultRowsForRef(created4B.credentialRef)).toBe(0);
      expect(countOrphanedVaultRows()).toBe(0);
    });
  });
});
