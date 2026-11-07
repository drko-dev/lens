/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import http from "http";
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
import {
  DefaultSecureAiTransport,
} from "../transport/secure-ai-transport";
import {
  TransportAbortError,
  TransportHttpError,
} from "../transport/ai-transport-errors";
import {
  DYNAMIC_AGENT_CLIENT_ID,
  OPENAI_SIWC_ISSUER,
  OPENAI_SIWC_JWKS_ENDPOINT,
  OPENAI_SIWC_REVOKE_ENDPOINT,
  OPENAI_SIWC_TOKEN_ENDPOINT,
  OpenAiSiwcOAuthManager,
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
  calculateDeepSeekCostUsd,
} from "../providers/deepseek-ai-provider-adapter";

describe("H8.8-03: Official OpenAI ChatGPT OAuth (SIWC) & DeepSeek Responses API (100% Offline)", () => {
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

  describe("1. H8.8-03a: Official OpenAI Sign in with ChatGPT (OAuth, PKCE, JWKS, Models & Streaming)", () => {
    it("completes full OAuth flow over 127.0.0.1 loopback, validates JWKS ID token & permissions, lists models, and streams /v1/responses", async () => {
      // 1. Verify stable ext_agent_host_id per installation
      const hostId1 = profileManager.getOrCreateInstallationHostId();
      const hostId2 = profileManager.getOrCreateInstallationHostId();
      expect(hostId1).toMatch(/^urn:uuid:[0-9a-f-]{36}$/i);
      expect(hostId2).toBe(hostId1);

      // 2. Start OAuth flow with real 127.0.0.1 loopback listener
      const session = await oauthManager.startSignInWithChatGpt({
        profileName: "OpenAI — ChatGPT OAuth",
        listenOnLoopback: true,
      });

      expect(launchedUrls).toHaveLength(1);
      const authUrl = new URL(launchedUrls[0]);
      expect(authUrl.origin).toBe(OPENAI_SIWC_ISSUER);
      expect(authUrl.pathname).toBe("/oauth/authorize");
      expect(authUrl.searchParams.get("client_id")).toBe(DYNAMIC_AGENT_CLIENT_ID);
      expect(authUrl.searchParams.get("agent_name_hint")).toBe("NovaKube");
      expect(authUrl.searchParams.get("ext_agent_host_id")).toBe(hostId1);
      expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
      expect(authUrl.searchParams.get("state")).toBe(session.state);
      expect(authUrl.searchParams.get("nonce")).toBe(session.nonce);
      expect(authUrl.searchParams.get("redirect_uri")).toBe(
        `http://127.0.0.1:${session.loopbackPort}/oauth/callback`,
      );

      let capturedTokenRequestBody = "";
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        req => {
          capturedTokenRequestBody = req.body || "";
          const params = new URLSearchParams(capturedTokenRequestBody);
          // Verify PKCE S256 challenge matches code_verifier
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
            scp: ["openid", "profile", "resource.invoke", "chatgpt.tokens.use.direct"],
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

      // Deliver callback over real loopback HTTP 127.0.0.1 listener
      const callbackUrl = `${session.redirectUri}?code=auth_code_valid_987654&state=${encodeURIComponent(session.state)}`;
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
      expect(profileManager.getDynamicClientId()).toBe("oaiapp_novakube_dyn_123");

      // Verify SQLite never stores raw OAuth tokens
      const rawRow = sqlite
        .getDb()
        .prepare("SELECT * FROM ai_profiles WHERE id = ?")
        .get(connectedProfile.id);
      expect(JSON.stringify(rawRow)).not.toContain("at_siwc_valid_token_001");
      expect(JSON.stringify(rawRow)).not.toContain("rt_siwc_initial_001");

      // 3. Query official /v1/models endpoint
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_MODELS_ENDPOINT && req.method === "GET",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            data: [
              { id: "gpt-5-codex-mini", object: "model", visibility: "list" },
              { id: "gpt-internal-hidden", object: "model", visibility: "hidden" },
              { id: "gpt-4o", object: "model", visibility: "list" },
            ],
          }),
        }),
        "models-list",
      );

      const models = await oauthManager.fetchAvailableModels(connectedProfile.id);
      expect(models.map(m => m.id)).toEqual(["gpt-5-codex-mini", "gpt-4o"]);

      // 4. Execute diagnosis via /v1/responses enforcing store: false and stream: true
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
      expect(capturedResponsesBody?.store).toBe(false);
      expect(capturedResponsesBody?.stream).toBe(true);
      expect(capturedResponsesBody?.tool_choice).toBe("none");
      expect(report.status).toBe("CONCLUSIVE");
      expect(report.provider).toBe("openai");
      expect(report.tokenUsage).toEqual({
        promptTokens: 320,
        completionTokens: 180,
        totalTokens: 500,
      });
      expect(report.remediationProposal?.requiresHumanApproval).toBe(true);
      expect(report.remediationProposal?.isApplied).toBe(false);
    });

    it("handles consent rejected in OAuth callback and marks missing mandatory scopes as 'sin_permiso' (unavailable)", async () => {
      // Case A: User rejects consent in browser (error=access_denied)
      const rejectedSession = await oauthManager.startSignInWithChatGpt({
        listenOnLoopback: false,
      });

      await expect(
        oauthManager.handleCallbackUrl(
          rejectedSession.sessionId,
          `${rejectedSession.redirectUri}?error=access_denied&state=${encodeURIComponent(rejectedSession.state)}`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_CONSENT_REJECTED/);

      // Case B: OAuth succeeds but lacks 'chatgpt.tokens.use.direct'
      const missingScopeSession = await oauthManager.startSignInWithChatGpt({
        listenOnLoopback: false,
      });

      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => {
          const idToken = signTestIdToken({
            iss: OPENAI_SIWC_ISSUER,
            sub: "user-no-direct-tokens",
            aud: DYNAMIC_AGENT_CLIENT_ID,
            exp: Math.floor(currentClockMs / 1000) + 3600,
            nonce: missingScopeSession.nonce,
            scp: ["openid", "profile", "resource.invoke"], // Missing chatgpt.tokens.use.direct
          });
          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              access_token: "at_missing_scope",
              id_token: idToken,
              expires_in: 3600,
              scope: "openid profile resource.invoke",
            }),
          };
        },
        "token-missing-scope",
      );

      const limitedProfile = await oauthManager.handleCallbackUrl(
        missingScopeSession.sessionId,
        `${missingScopeSession.redirectUri}?code=code_limited_12345&state=${encodeURIComponent(missingScopeSession.state)}`,
      );

      expect(limitedProfile.availabilityStatus).toBe("sin_permiso");
      expect(limitedProfile.unavailableReason).toContain("chatgpt.tokens.use.direct");

      // Engine must refuse consent preview and execution when availabilityStatus is sin_permiso
      await expect(
        engine.prepareConsentPreview(testIncidentId, limitedProfile.id),
      ).rejects.toThrow(/OPENAI_OAUTH_PERMISSION_DENIED/);
    });

    it("serializes concurrent token refreshes, rotates refresh_token safely, and detects account change ('sub' mismatch)", async () => {
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
              aud: DYNAMIC_AGENT_CLIENT_ID,
              exp: Math.floor(currentClockMs / 1000) + 60,
              nonce: session.nonce,
              scp: ["resource.invoke", "chatgpt.tokens.use.direct"],
            }),
            expires_in: 60,
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
        "initial-short-token",
      );

      const profile = await oauthManager.handleCallbackUrl(
        session.sessionId,
        `${session.redirectUri}?code=code_short_12345&state=${encodeURIComponent(session.state)}`,
      );

      // Advance clock past expiration
      currentClockMs += 120_000;

      let refreshCallCount = 0;
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        req => {
          refreshCallCount++;
          const params = new URLSearchParams(req.body || "");
          expect(params.get("grant_type")).toBe("refresh_token");
          expect(params.get("refresh_token")).toBe("rt_gen_1");

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
                aud: DYNAMIC_AGENT_CLIENT_ID,
                exp: Math.floor(currentClockMs / 1000) + 3600,
                scp: ["resource.invoke", "chatgpt.tokens.use.direct"],
              }),
              expires_in: 3600,
              scope: "openid resource.invoke chatgpt.tokens.use.direct",
            }),
          };
        },
        "serialized-refresh",
      );

      // Trigger 3 concurrent token requests; mutex must serialize into 1 HTTP refresh call
      const [tok1, tok2, tok3] = await Promise.all([
        oauthManager.ensureValidAccessToken(profile.id),
        oauthManager.ensureValidAccessToken(profile.id),
        oauthManager.ensureValidAccessToken(profile.id),
      ]);

      expect(refreshCallCount).toBe(1);
      expect(tok1).toBe("at_refreshed_gen_2");
      expect(tok2).toBe("at_refreshed_gen_2");
      expect(tok3).toBe("at_refreshed_gen_2");

      // Verify rotated refresh token is persisted in vault
      const storedBundle = JSON.parse(await profileManager.getApiKeyForProfile(profile.id));
      expect(storedBundle.refreshToken).toBe("rt_rotated_gen_2");

      // Now prepare a consent token for user-original-sub, then simulate an account switch ('sub' mismatch) during next refresh
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
              aud: DYNAMIC_AGENT_CLIENT_ID,
              exp: Math.floor(currentClockMs / 1000) + 3600,
              scp: ["resource.invoke", "chatgpt.tokens.use.direct"],
            }),
            expires_in: 3600,
          }),
        }),
        "account-switch-refresh",
      );

      await expect(oauthManager.ensureValidAccessToken(profile.id)).rejects.toThrow(
        /OPENAI_OAUTH_ACCOUNT_CHANGED/,
      );

      // Pending consent token for that profile must have been automatically revoked
      await expect(
        engine.executeDiagnosis(testIncidentId, profile.id, preview.consentToken),
      ).rejects.toThrow(/INVALID_CONSENT_TOKEN/);
    });

    it("rejects malicious callbacks, wrong state, wrong nonce, and invalid JWT signatures/claims", async () => {
      // 1. Malicious callback path or unexpected query parameter
      const s1 = await oauthManager.startSignInWithChatGpt({ listenOnLoopback: false });
      await expect(
        oauthManager.handleCallbackUrl(
          s1.sessionId,
          `http://127.0.0.1:${s1.loopbackPort}/evil/path?code=12345678&state=${s1.state}`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_CALLBACK_MALICIOUS/);

      const s2 = await oauthManager.startSignInWithChatGpt({ listenOnLoopback: false });
      await expect(
        oauthManager.handleCallbackUrl(
          s2.sessionId,
          `${s2.redirectUri}?code=12345678&state=${s2.state}&evil_param=1`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_CALLBACK_MALICIOUS/);

      // 2. Wrong state
      const s3 = await oauthManager.startSignInWithChatGpt({ listenOnLoopback: false });
      await expect(
        oauthManager.handleCallbackUrl(
          s3.sessionId,
          `${s3.redirectUri}?code=12345678&state=wrong_state_value`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_STATE_MISMATCH/);

      // 3. Wrong nonce in ID token
      const s4 = await oauthManager.startSignInWithChatGpt({ listenOnLoopback: false });
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_TOKEN_ENDPOINT && req.method === "POST",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: "at_bad_nonce",
            id_token: signTestIdToken({
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-1",
              aud: DYNAMIC_AGENT_CLIENT_ID,
              exp: Math.floor(currentClockMs / 1000) + 3600,
              nonce: "mismatched_nonce_value",
              scp: ["resource.invoke", "chatgpt.tokens.use.direct"],
            }),
          }),
        }),
        "bad-nonce-route",
      );

      await expect(
        oauthManager.handleCallbackUrl(
          s4.sessionId,
          `${s4.redirectUri}?code=code_12345678&state=${s4.state}`,
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_NONCE_MISMATCH/);

      // 4. Tampered JWT signature / alg:none / wrong issuer
      await expect(
        oauthManager.verifyIdTokenCryptographically(
          signTestIdToken(
            {
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-1",
              aud: DYNAMIC_AGENT_CLIENT_ID,
              exp: Math.floor(currentClockMs / 1000) + 3600,
            },
            { tamperSignature: true },
          ),
          { expectedAud: [DYNAMIC_AGENT_CLIENT_ID] },
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_INVALID_JWT/);

      await expect(
        oauthManager.verifyIdTokenCryptographically(
          signTestIdToken(
            {
              iss: OPENAI_SIWC_ISSUER,
              sub: "user-1",
              aud: DYNAMIC_AGENT_CLIENT_ID,
              exp: Math.floor(currentClockMs / 1000) + 3600,
            },
            { alg: "none" },
          ),
          { expectedAud: [DYNAMIC_AGENT_CLIENT_ID] },
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_INVALID_JWT/);

      await expect(
        oauthManager.verifyIdTokenCryptographically(
          signTestIdToken({
            iss: "https://evil-issuer.example.com",
            sub: "user-1",
            aud: DYNAMIC_AGENT_CLIENT_ID,
            exp: Math.floor(currentClockMs / 1000) + 3600,
          }),
          { expectedAud: [DYNAMIC_AGENT_CLIENT_ID] },
        ),
      ).rejects.toThrow(/OPENAI_OAUTH_INVALID_JWT/);
    });

    it("handles unavailable models, incomplete SSE streams, ChatGPT quota exhaustion, and disconnect/revocation", async () => {
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
              aud: DYNAMIC_AGENT_CLIENT_ID,
              exp: Math.floor(currentClockMs / 1000) + 3600,
              nonce: session.nonce,
              scp: ["resource.invoke", "chatgpt.tokens.use.direct"],
            }),
            expires_in: 3600,
            scope: "openid resource.invoke chatgpt.tokens.use.direct",
          }),
        }),
      );

      const profile = await oauthManager.handleCallbackUrl(
        session.sessionId,
        `${session.redirectUri}?code=code_full_test_123&state=${session.state}`,
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

      // Verify zero requests were sent to DeepSeek (zero automatic failover!)
      expect(
        mockTransport.recordedRequests.some(r => r.provider === "deepseek" || r.endpoint.includes("deepseek")),
      ).toBe(false);
      expect(deepseekProfile.id).toBeDefined();

      // 3. Models endpoint returns zero eligible models
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_MODELS_ENDPOINT && req.method === "GET",
        () => ({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            data: [{ id: "internal-only", object: "model", visibility: "hidden" }],
          }),
        }),
      );

      await expect(oauthManager.fetchAvailableModels(profile.id)).rejects.toThrow(
        /OPENAI_MODELS_UNAVAILABLE/,
      );
      const updatedAfterNoModels = await profileManager.getProfile(profile.id);
      expect(updatedAfterNoModels?.availabilityStatus).toBe("no_models_available");

      // 4. Disconnect account, revoke session, and wipe vault credentials
      let revokeCalled = false;
      mockTransport.registerRoute(
        req => req.endpoint === OPENAI_SIWC_REVOKE_ENDPOINT && req.method === "POST",
        () => {
          revokeCalled = true;
          return { status: 200, body: "{}" };
        },
      );

      const disconnected = await oauthManager.disconnectAndRevoke(profile.id);
      expect(revokeCalled).toBe(true);
      expect(disconnected.status).toBe("revoked");
      expect(disconnected.availabilityStatus).toBe("disconnected");
      expect(vault.hasCredential(profile.credentialRef)).toBe(false);
    });
  });

  describe("2. H8.8-03b: DeepSeek API Adapter, Token Accounting, Pricing Bands & Error Handling", () => {
    it("executes DeepSeek diagnosis on exclusive endpoint, accounts for input/cache/output/reasoning tokens, and calculates cost", async () => {
      // Rejects non-exclusive DeepSeek endpoint
      expect(() =>
        validateAiEndpoint("https://api.deepseek.com/v1/chat/completions", "deepseek"),
      ).toThrow(SsrfSecurityError);

      const dsProfile = await profileManager.createProfile({
        name: "DeepSeek Reasoner Pro",
        provider: "deepseek",
        model: "deepseek-v4-pro",
        endpoint: DEEPSEEK_EXCLUSIVE_ENDPOINT,
        apiKey: "sk-deepseek-secret-prod-key-123456",
      });

      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT && req.method === "POST",
        req => {
          const bodyObj = JSON.parse(req.body || "{}");
          expect(bodyObj.model).toBe("deepseek-v4-pro");
          expect(bodyObj.tools).toBeUndefined();

          return {
            status: 200,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id: "ds-resp-001",
              output_text: buildValidDiagnosisJson(testEvidenceId),
              usage: {
                input_tokens: 2000,
                prompt_cache_hit_tokens: 1500,
                prompt_cache_miss_tokens: 500,
                output_tokens: 1000,
                output_tokens_details: {
                  reasoning_tokens: 600,
                },
                total_tokens: 3000,
              },
            }),
          };
        },
      );

      const preview = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      const report = await engine.executeDiagnosis(
        testIncidentId,
        dsProfile.id,
        preview.consentToken,
      );

      expect(report.status).toBe("CONCLUSIVE");
      expect(report.provider).toBe("deepseek");
      expect(report.model).toBe("deepseek-v4-pro");
      expect(report.tokenUsage).toEqual({
        promptTokens: 2000,
        completionTokens: 1000,
        totalTokens: 3000,
      });
      expect(report.tokenUsageDetails).toBeDefined();
      expect(report.tokenUsageDetails?.promptCacheHitTokens).toBe(1500);
      expect(report.tokenUsageDetails?.promptCacheMissTokens).toBe(500);
      expect(report.tokenUsageDetails?.reasoningTokens).toBe(600);
      expect(report.estimatedCost).toBeGreaterThan(0);

      // Verify standard vs off-peak pricing differentiation
      const standardCost = calculateDeepSeekCostUsd(
        {
          promptTokens: 1_000_000,
          promptCacheHitTokens: 500_000,
          promptCacheMissTokens: 500_000,
          completionTokens: 500_000,
          reasoningTokens: 200_000,
          totalTokens: 1_500_000,
          pricingBandUsed: "standard",
        },
        {
          currency: "USD",
          standard: {
            inputCacheHitPer1M: 0.07,
            inputCacheMissPer1M: 0.27,
            outputPer1M: 1.10,
            reasoningOutputPer1M: 1.10,
          },
          offPeakDiscount: {
            inputCacheHitPer1M: 0.035,
            inputCacheMissPer1M: 0.135,
            outputPer1M: 0.55,
            reasoningOutputPer1M: 0.55,
          },
          enableOffPeakBand: true,
        },
        Date.UTC(2026, 10, 7, 12, 0, 0), // 12:00 UTC -> Standard band
      );

      const offPeakCost = calculateDeepSeekCostUsd(
        {
          promptTokens: 1_000_000,
          promptCacheHitTokens: 500_000,
          promptCacheMissTokens: 500_000,
          completionTokens: 500_000,
          reasoningTokens: 200_000,
          totalTokens: 1_500_000,
          pricingBandUsed: "off_peak",
        },
        {
          currency: "USD",
          standard: {
            inputCacheHitPer1M: 0.07,
            inputCacheMissPer1M: 0.27,
            outputPer1M: 1.10,
            reasoningOutputPer1M: 1.10,
          },
          offPeakDiscount: {
            inputCacheHitPer1M: 0.035,
            inputCacheMissPer1M: 0.135,
            outputPer1M: 0.55,
            reasoningOutputPer1M: 0.55,
          },
          enableOffPeakBand: true,
        },
        Date.UTC(2026, 10, 7, 18, 0, 0), // 18:00 UTC -> Off-peak band
      );

      expect(standardCost.bandUsed).toBe("standard");
      expect(offPeakCost.bandUsed).toBe("off_peak");
      expect(offPeakCost.costUsd).toBeCloseTo(standardCost.costUsd / 2, 5);
    });

    it.each([401, 429, 500] as const)(
      "handles DeepSeek HTTP %i with zero automatic POST retries and safe reservation failure accounting",
      async httpStatus => {
        const dsProfile = await profileManager.createProfile({
          name: `DeepSeek ${httpStatus}`,
          provider: "deepseek",
          model: "deepseek-flash",
          endpoint: DEEPSEEK_EXCLUSIVE_ENDPOINT,
          apiKey: "sk-deepseek-key-test",
        });

        let postAttempts = 0;
        mockTransport.registerRoute(
          req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT && req.method === "POST",
          () => {
            postAttempts++;
            return {
              status: httpStatus,
              statusText: `HTTP ${httpStatus}`,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ error: { message: `Simulated ${httpStatus} failure` } }),
            };
          },
        );

        const preview = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
        await expect(
          engine.executeDiagnosis(testIncidentId, dsProfile.id, preview.consentToken),
        ).rejects.toThrow(TransportHttpError);

        // Strictly 1 POST attempt (zero automatic retries)
        expect(postAttempts).toBe(1);

        const reservation = diagnosisRepo.getReservationByOperationId(preview.operationId!);
        expect(reservation?.status).toBe("FAILED_DISPATCHED");
      },
    );
  });

  describe("3. Security Invariants: Redirects, Malformed Payloads, Hallucinations, Secret Reflection, Cancellations & Zero External Network", () => {
    it("blocks insecure redirects (to http://, 127.0.0.1, or metadata IPs) and blocks loopback inference endpoints", async () => {
      // Loopback 127.0.0.1 is strictly forbidden for AI inference endpoints
      expect(() => validateAiEndpoint("https://127.0.0.1:8080/v1/responses")).toThrow(
        SsrfSecurityError,
      );

      const dsProfile = await profileManager.createProfile({
        name: "DeepSeek Redirect Test",
        provider: "deepseek",
        model: "deepseek-flash",
        endpoint: DEEPSEEK_EXCLUSIVE_ENDPOINT,
        apiKey: "sk-deepseek-redirect",
      });

      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT,
        () => ({
          status: 302,
          statusText: "Found",
          headers: {
            location: "http://127.0.0.1:9999/steal-token",
          },
        }),
      );

      const preview = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      await expect(
        engine.executeDiagnosis(testIncidentId, dsProfile.id, preview.consentToken),
      ).rejects.toThrow();
    });

    it("rejects malformed payloads, invented citations, and reflected secrets in provider responses", async () => {
      const dsProfile = await profileManager.createProfile({
        name: "DeepSeek Validation Test",
        provider: "deepseek",
        model: "deepseek-flash",
        endpoint: DEEPSEEK_EXCLUSIVE_ENDPOINT,
        apiKey: "sk-deepseek-validation",
      });

      // 1. Malformed JSON payload
      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT,
        () => ({
          status: 200,
          body: "{ malformed_json: ",
        }),
      );
      const p1 = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      await expect(
        engine.executeDiagnosis(testIncidentId, dsProfile.id, p1.consentToken),
      ).rejects.toThrow(/ERR_PAYLOAD_VALIDATION/);

      // 2. Invented citations (evidenceId does not exist in incident)
      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT,
        () => ({
          status: 200,
          body: buildValidDiagnosisJson("EVID-INVENTED-HALLUCINATED-999"),
        }),
      );
      const p2 = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      await expect(
        engine.executeDiagnosis(testIncidentId, dsProfile.id, p2.consentToken),
      ).rejects.toThrow(/citas a evidencias inexistentes o inventadas/);

      // 3. Reflected secrets in model output
      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT,
        () => ({
          status: 200,
          body: buildValidDiagnosisJson(testEvidenceId, {
            recommendedNextSteps: [
              "Use password: leaked_production_secret_value_999 to authenticate",
            ],
          }),
        }),
      );
      const p3 = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      await expect(
        engine.executeDiagnosis(testIncidentId, dsProfile.id, p3.consentToken),
      ).rejects.toThrow(/secretos o credenciales reflejadas/);
    });

    it("supports abort/cancellation and guarantees zero real external network requests by default", async () => {
      const dsProfile = await profileManager.createProfile({
        name: "DeepSeek Cancel Test",
        provider: "deepseek",
        model: "deepseek-flash",
        endpoint: DEEPSEEK_EXCLUSIVE_ENDPOINT,
        apiKey: "sk-deepseek-cancel",
      });

      mockTransport.registerRoute(
        req => req.endpoint === DEEPSEEK_EXCLUSIVE_ENDPOINT,
        () => ({
          status: 200,
          delayMs: 200,
          body: buildValidDiagnosisJson(testEvidenceId),
        }),
      );

      const preview = await engine.prepareConsentPreview(testIncidentId, dsProfile.id);
      const abortCtrl = new AbortController();
      setTimeout(() => abortCtrl.abort(), 20);

      await expect(
        engine.executeDiagnosis(testIncidentId, dsProfile.id, preview.consentToken, {
          signal: abortCtrl.signal,
        }),
      ).rejects.toThrow(TransportAbortError);

      // Verify DisabledRealNetworkEngine remains the default and blocks any external network call
      const realDisabledTransport = new DefaultSecureAiTransport();
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
});
