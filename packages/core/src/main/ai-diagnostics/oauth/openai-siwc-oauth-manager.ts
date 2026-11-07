/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import http from "http";
import {
  OPENAI_SIWC_ISSUER,
  OPENAI_SIWC_MODELS_ENDPOINT,
  OPENAI_SIWC_RESPONSES_ENDPOINT,
  REQUIRED_OPENAI_SIWC_SCOPES,
  type AiProviderProfile,
  type OpenAiModelDescriptor,
} from "../../../common/incident/ai-profile-types";
import type { AiProfileManager } from "../ai-profile-manager";
import { AiDiagnosisSecurityError } from "../ai-diagnosis-errors";
import type { SecureAiTransport } from "../transport/ai-transport-types";

export { OPENAI_SIWC_ISSUER };
export const OPENAI_SIWC_AUTHORIZE_ENDPOINT = `${OPENAI_SIWC_ISSUER}/oauth/authorize`;
export const OPENAI_SIWC_TOKEN_ENDPOINT = `${OPENAI_SIWC_ISSUER}/oauth/token`;
export const OPENAI_SIWC_REVOKE_ENDPOINT = `${OPENAI_SIWC_ISSUER}/oauth/revoke`;
export const OPENAI_SIWC_JWKS_ENDPOINT = `${OPENAI_SIWC_ISSUER}/.well-known/jwks.json`;

export const DYNAMIC_AGENT_CLIENT_ID = "dynamic_agent_client";
export const NOVAKUBE_AGENT_NAME_HINT = "NovaKube";
export const OAUTH_CALLBACK_PATH = "/oauth/callback";

const ALLOWED_CALLBACK_QUERY_KEYS = new Set([
  "code",
  "state",
  "error",
  "error_description",
  "scope",
  "iss",
  "client_id",
]);

const ALLOWED_JWT_ALGS = new Set(["RS256", "ES256"]);

export type BrowserLauncher = (authorizationUrl: string) => Promise<void> | void;

export interface OpenAiOAuthCredentialBundle {
  accessToken: string;
  refreshToken?: string;
  idToken: string;
  tokenType: string;
  expiresAt: number; // Epoch ms
  scopes: string[];
  subject: string;
  clientId: string;
  extAgentHostId: string;
  updatedAt: number;
}

export interface OpenAiJwk {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

export interface OpenAiJwksDocument {
  keys: OpenAiJwk[];
}

export interface VerifiedIdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat?: number;
  nonce?: string;
  scp?: string[] | string;
  permissions?: string[];
  scope?: string;
}

export interface PendingOAuthSessionHandle {
  sessionId: string;
  authorizationUrl: string;
  redirectUri: string;
  loopbackPort: number;
  state: string;
  nonce: string;
  extAgentHostId: string;
  clientId: string;
  waitForCompletion: () => Promise<AiProviderProfile>;
  cancel: () => void;
}

interface InternalPendingSession {
  sessionId: string;
  profileId?: string;
  profileName: string;
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  nonce: string;
  redirectUri: string;
  loopbackPort: number;
  extAgentHostId: string;
  clientId: string;
  createdAt: number;
  expiresAt: number;
  server?: http.Server;
  resolveCompletion: (profile: AiProviderProfile) => void;
  rejectCompletion: (err: Error) => void;
  completed: boolean;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export class OpenAiSiwcOAuthManager {
  private readonly pendingSessions = new Map<string, InternalPendingSession>();
  private readonly refreshMutex = new Map<string, Promise<string>>();
  private cachedJwks?: { doc: OpenAiJwksDocument; fetchedAt: number };
  private readonly jwksCacheTtlMs: number;
  private readonly sessionTimeoutMs: number;
  private readonly clockFn: () => number;
  private browserLauncher: BrowserLauncher;
  private onAccountChanged?: (profileId: string, previousSub: string, newSub: string) => void;
  private onSessionRevoked?: (profileId: string) => void;

  constructor(
    private readonly profileManager: AiProfileManager,
    private readonly transport: SecureAiTransport,
    options?: {
      browserLauncher?: BrowserLauncher;
      jwksCacheTtlMs?: number;
      sessionTimeoutMs?: number;
      clockFn?: () => number;
      onAccountChanged?: (profileId: string, previousSub: string, newSub: string) => void;
      onSessionRevoked?: (profileId: string) => void;
    },
  ) {
    this.jwksCacheTtlMs = options?.jwksCacheTtlMs ?? 5 * 60 * 1000;
    this.sessionTimeoutMs = options?.sessionTimeoutMs ?? 3 * 60 * 1000;
    this.clockFn = options?.clockFn ?? (() => Date.now());
    this.onAccountChanged = options?.onAccountChanged;
    this.onSessionRevoked = options?.onSessionRevoked;
    this.browserLauncher =
      options?.browserLauncher ??
      (async (authUrl: string) => {
        this.validateAuthorizationUrlBeforeLaunch(authUrl);
        if (process.env.JEST_WORKER_ID || process.env.NODE_ENV === "test") {
          // Never open a real system browser during automated tests
          return;
        }
        const { shell } = await import("electron");
        await shell.openExternal(authUrl);
      });
  }

  public setLifecycleCallbacks(callbacks: {
    onAccountChanged?: (profileId: string, previousSub: string, newSub: string) => void;
    onSessionRevoked?: (profileId: string) => void;
  }): void {
    if (callbacks.onAccountChanged) {
      this.onAccountChanged = callbacks.onAccountChanged;
    }
    if (callbacks.onSessionRevoked) {
      this.onSessionRevoked = callbacks.onSessionRevoked;
    }
  }

  public setBrowserLauncher(launcher: BrowserLauncher): void {
    this.browserLauncher = launcher;
  }

  public dispose(): void {
    for (const [, pending] of this.pendingSessions.entries()) {
      pending.completed = true;
      if (pending.server) {
        try {
          pending.server.close();
        } catch {
          // Ignore close error
        }
      }
    }
    this.pendingSessions.clear();
  }

  public validateAuthorizationUrlBeforeLaunch(authUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(authUrl);
    } catch {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_AUTH_URL",
        "La URL de autorización OAuth de OpenAI tiene un formato inválido.",
      );
    }

    if (
      parsed.protocol !== "https:" ||
      parsed.origin !== OPENAI_SIWC_ISSUER ||
      parsed.pathname !== "/oauth/authorize"
    ) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_AUTH_URL",
        `Solo se autoriza abrir el endpoint oficial '${OPENAI_SIWC_AUTHORIZE_ENDPOINT}' en el navegador del sistema.`,
      );
    }
  }

  /**
   * Starts an official OpenAI Sign in with ChatGPT (SIWC) browser OAuth flow:
   * - Generates PKCE S256 (code_verifier + code_challenge), state, and OIDC nonce.
   * - Uses stable per-installation `ext_agent_host_id` (`urn:uuid:...`) and official dynamic registration (`dynamic_agent_client` / persisted `oaiapp_*`).
   * - Starts a temporary loopback callback listener strictly bound to `127.0.0.1`.
   * - Launches the system default browser with the verified authorization URL.
   */
  public async startSignInWithChatGpt(options?: {
    profileId?: string;
    profileName?: string;
    signal?: AbortSignal;
    listenOnLoopback?: boolean;
  }): Promise<PendingOAuthSessionHandle> {
    if (options?.signal?.aborted) {
      throw new AiDiagnosisSecurityError("ERR_ABORTED", "Inicio de sesión OAuth cancelado antes de comenzar.");
    }

    const extAgentHostId = this.profileManager.getOrCreateInstallationHostId();
    const persistedClientId = this.profileManager.getDynamicClientId();
    const clientId = persistedClientId || DYNAMIC_AGENT_CLIENT_ID;

    // Generate cryptographic PKCE S256, state, and OIDC nonce
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier, "ascii")
      .digest("base64url");
    const state = crypto.randomBytes(32).toString("base64url");
    const nonce = crypto.randomBytes(32).toString("base64url");
    const sessionId = `oauth-sess-${crypto.randomUUID()}`;

    let resolveCompletion!: (profile: AiProviderProfile) => void;
    let rejectCompletion!: (err: Error) => void;

    const completionPromise = new Promise<AiProviderProfile>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });

    // Attach no-op catch to prevent unhandled rejection when caller awaits later or inspects via handleCallbackUrl
    completionPromise.catch(() => {});

    const shouldListen = options?.listenOnLoopback !== false;
    let server: http.Server | undefined;
    let loopbackPort = 0;

    if (shouldListen) {
      const listenerResult = await this.createLoopbackServer(sessionId);
      server = listenerResult.server;
      loopbackPort = listenerResult.port;
    } else {
      loopbackPort = 54321;
    }

    const redirectUri = `http://127.0.0.1:${loopbackPort}${OAUTH_CALLBACK_PATH}`;
    const requestedScopes = [
      "openid",
      "profile",
      "email",
      "offline_access",
      ...REQUIRED_OPENAI_SIWC_SCOPES,
    ].join(" ");

    const authUrlObj = new URL(OPENAI_SIWC_AUTHORIZE_ENDPOINT);
    authUrlObj.searchParams.set("response_type", "code");
    authUrlObj.searchParams.set("client_id", clientId);
    authUrlObj.searchParams.set("redirect_uri", redirectUri);
    authUrlObj.searchParams.set("scope", requestedScopes);
    authUrlObj.searchParams.set("state", state);
    authUrlObj.searchParams.set("nonce", nonce);
    authUrlObj.searchParams.set("code_challenge", codeChallenge);
    authUrlObj.searchParams.set("code_challenge_method", "S256");
    authUrlObj.searchParams.set("ext_agent_host_id", extAgentHostId);
    authUrlObj.searchParams.set("agent_name_hint", NOVAKUBE_AGENT_NAME_HINT);

    const authorizationUrl = authUrlObj.toString();
    const now = this.clockFn();

    const pending: InternalPendingSession = {
      sessionId,
      profileId: options?.profileId,
      profileName: options?.profileName?.trim() || "OpenAI — ChatGPT OAuth",
      codeVerifier,
      codeChallenge,
      state,
      nonce,
      redirectUri,
      loopbackPort,
      extAgentHostId,
      clientId,
      createdAt: now,
      expiresAt: now + this.sessionTimeoutMs,
      server,
      resolveCompletion,
      rejectCompletion,
      completed: false,
    };

    this.pendingSessions.set(sessionId, pending);

    const cleanupSession = (err?: Error) => {
      if (pending.completed) {
        return;
      }
      pending.completed = true;
      this.pendingSessions.delete(sessionId);
      if (pending.server) {
        try {
          pending.server.close();
        } catch {
          // Ignore close error
        }
      }
      if (err) {
        pending.rejectCompletion(err);
      }
    };

    if (options?.signal) {
      options.signal.addEventListener(
        "abort",
        () => {
          cleanupSession(
            new AiDiagnosisSecurityError("ERR_ABORTED", "Flujo OAuth cancelado por el usuario."),
          );
        },
        { once: true },
      );
    }

    // Launch system browser
    try {
      this.validateAuthorizationUrlBeforeLaunch(authorizationUrl);
      await this.browserLauncher(authorizationUrl);
    } catch (err) {
      cleanupSession(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }

    return {
      sessionId,
      authorizationUrl,
      redirectUri,
      loopbackPort,
      state,
      nonce,
      extAgentHostId,
      clientId,
      waitForCompletion: () => completionPromise,
      cancel: () =>
        cleanupSession(
          new AiDiagnosisSecurityError("ERR_ABORTED", "Flujo OAuth cancelado explícitamente."),
        ),
    };
  }

  /**
   * Creates a temporary HTTP server bound strictly to `127.0.0.1:0` for the OAuth callback.
   */
  private createLoopbackServer(sessionId: string): Promise<{ server: http.Server; port: number }> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const remoteAddr = req.socket.remoteAddress || "";
        if (remoteAddr !== "127.0.0.1" && remoteAddr !== "::ffff:127.0.0.1") {
          res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("Forbidden: Loopback 127.0.0.1 required.");
          return;
        }

        const pending = this.pendingSessions.get(sessionId);
        if (!pending || pending.completed) {
          res.writeHead(410, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("OAuth session is no longer active.");
          return;
        }

        try {
          const fullUrl = `http://127.0.0.1:${pending.loopbackPort}${req.url || "/"}`;
          if (req.method !== "GET") {
            throw new AiDiagnosisSecurityError(
              "OPENAI_OAUTH_CALLBACK_MALICIOUS",
              `Método HTTP '${req.method}' no permitido en callback OAuth. Solo se admite GET.`,
            );
          }

          await this.handleCallbackUrl(sessionId, fullUrl);
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            Connection: "close",
          });
          res.end(
            "<!DOCTYPE html><html><body><h2>NovaKube: Autorización completada. Puede cerrar esta ventana.</h2></body></html>",
          );
        } catch (err) {
          res.writeHead(400, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            Connection: "close",
          });
          res.end(
            "<!DOCTYPE html><html><body><h2>NovaKube: Error en la autorización OAuth.</h2></body></html>",
          );
        }
      });

      server.on("error", err => {
        reject(err);
      });

      // Bind EXCLUSIVELY to 127.0.0.1 (never 0.0.0.0 or external interfaces)
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Failed to bind loopback OAuth callback server on 127.0.0.1."));
          return;
        }
        resolve({ server, port: address.port });
      });
    });
  }

  /**
   * Validates and processes the OAuth callback URL (`http://127.0.0.1:<port>/oauth/callback?...`),
   * exchanges the authorization code with PKCE `code_verifier`, verifies the ID token via JWKS,
   * enforces mandatory permissions (`resource.invoke` and `chatgpt.tokens.use.direct`), and stores
   * credentials encrypted in `SecureCredentialVault`.
   */
  public async handleCallbackUrl(sessionId: string, callbackUrl: string): Promise<AiProviderProfile> {
    const pending = this.pendingSessions.get(sessionId);
    if (!pending || pending.completed) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_SESSION_INVALID",
        "La sesión de autorización OAuth no existe o ya fue consumida.",
      );
    }

    const finalizeSession = (err?: Error, profile?: AiProviderProfile) => {
      pending.completed = true;
      this.pendingSessions.delete(sessionId);
      if (pending.server) {
        try {
          pending.server.close();
        } catch {
          // Ignore close error
        }
      }
      if (err) {
        pending.rejectCompletion(err);
      } else if (profile) {
        pending.resolveCompletion(profile);
      }
    };

    try {
      if (this.clockFn() > pending.expiresAt) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_SESSION_INVALID",
          "La sesión temporal de autorización OAuth expiró antes de recibir el callback.",
        );
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(callbackUrl);
      } catch {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_CALLBACK_MALICIOUS",
          "Callback OAuth malformado.",
        );
      }

      // Enforce strict loopback 127.0.0.1 and exact path /oauth/callback
      if (
        parsedUrl.protocol !== "http:" ||
        parsedUrl.hostname !== "127.0.0.1" ||
        Number(parsedUrl.port) !== pending.loopbackPort ||
        parsedUrl.pathname !== OAUTH_CALLBACK_PATH
      ) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_CALLBACK_MALICIOUS",
          "Callback OAuth rechazado: el host, puerto o ruta no coinciden con el listener temporal 127.0.0.1/oauth/callback.",
        );
      }

      // Reject unexpected or duplicate query parameters (HTTP Parameter Pollution defense)
      const seenKeys = new Set<string>();
      for (const [key] of parsedUrl.searchParams.entries()) {
        if (!ALLOWED_CALLBACK_QUERY_KEYS.has(key)) {
          throw new AiDiagnosisSecurityError(
            "OPENAI_OAUTH_CALLBACK_MALICIOUS",
            `Parámetro no autorizado '${key}' detectado en callback OAuth.`,
          );
        }
        if (seenKeys.has(key)) {
          throw new AiDiagnosisSecurityError(
            "OPENAI_OAUTH_CALLBACK_MALICIOUS",
            `Parámetro duplicado '${key}' detectado en callback OAuth.`,
          );
        }
        seenKeys.add(key);
      }

      // Check state first (CSRF defense)
      const receivedState = parsedUrl.searchParams.get("state");
      if (!receivedState || !timingSafeEqualStrings(receivedState, pending.state)) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_STATE_MISMATCH",
          "El parámetro 'state' del callback OAuth es inválido o no coincide con la sesión iniciada.",
        );
      }

      // Check OAuth error (e.g. access_denied / consent rejected)
      const oauthError = parsedUrl.searchParams.get("error");
      if (oauthError) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_CONSENT_REJECTED",
          `El usuario o el servidor OAuth rechazó la autorización ('${oauthError}').`,
        );
      }

      const code = parsedUrl.searchParams.get("code");
      if (!code || code.length < 8 || code.length > 512 || !/^[\x21-\x7E]+$/.test(code)) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_CALLBACK_MALICIOUS",
          "El código de autorización ('code') en el callback OAuth está ausente o es inválido.",
        );
      }

      const callbackClientId = parsedUrl.searchParams.get("client_id");
      const effectiveClientId =
        callbackClientId && callbackClientId.startsWith("oaiapp_")
          ? callbackClientId
          : pending.clientId;

      // Exchange authorization code for tokens using PKCE code_verifier
      const tokenParams = new URLSearchParams();
      tokenParams.set("grant_type", "authorization_code");
      tokenParams.set("code", code);
      tokenParams.set("redirect_uri", pending.redirectUri);
      tokenParams.set("client_id", effectiveClientId);
      tokenParams.set("code_verifier", pending.codeVerifier);
      tokenParams.set("ext_agent_host_id", pending.extAgentHostId);
      tokenParams.set("agent_name_hint", NOVAKUBE_AGENT_NAME_HINT);

      const tokenResp = await this.transport.execute({
        provider: "openai",
        endpoint: OPENAI_SIWC_TOKEN_ENDPOINT,
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: tokenParams.toString(),
        timeoutMs: 15_000,
        maxRetries: 0,
      });

      const rawTokenJson = tokenResp.json<Record<string, unknown>>();
      const accessToken =
        typeof rawTokenJson.access_token === "string" ? rawTokenJson.access_token.trim() : "";
      const idToken =
        typeof rawTokenJson.id_token === "string" ? rawTokenJson.id_token.trim() : "";
      const refreshToken =
        typeof rawTokenJson.refresh_token === "string" && rawTokenJson.refresh_token.trim().length > 0
          ? rawTokenJson.refresh_token.trim()
          : undefined;
      const expiresInSec =
        typeof rawTokenJson.expires_in === "number" && rawTokenJson.expires_in > 0
          ? rawTokenJson.expires_in
          : 3600;
      const assignedClientId =
        typeof rawTokenJson.client_id === "string" && rawTokenJson.client_id.trim().length > 0
          ? rawTokenJson.client_id.trim()
          : effectiveClientId;

      if (!accessToken || !idToken) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_INVALID_TOKEN_RESPONSE",
          "La respuesta del servidor OAuth no incluyó 'access_token' e 'id_token' obligatorios.",
        );
      }

      // Persist dynamically assigned oaiapp_* client_id if returned
      if (assignedClientId && assignedClientId !== DYNAMIC_AGENT_CLIENT_ID) {
        this.profileManager.setDynamicClientId(assignedClientId);
      }

      // Cryptographically validate ID token via JWKS, issuer, audience, expiry, and nonce
      const verifiedClaims = await this.verifyIdTokenCryptographically(idToken, {
        expectedAud: [pending.clientId, assignedClientId, DYNAMIC_AGENT_CLIENT_ID],
        expectedNonce: pending.nonce,
      });

      // Extract granted scopes from token response and/or ID token claims
      const grantedScopes = this.extractGrantedScopes(rawTokenJson.scope, verifiedClaims);
      const hasRequiredPermissions = this.hasMandatorySiwcPermissions(grantedScopes);

      const expiresAt = this.clockFn() + expiresInSec * 1000;
      const credentialBundle: OpenAiOAuthCredentialBundle = {
        accessToken,
        refreshToken,
        idToken,
        tokenType: typeof rawTokenJson.token_type === "string" ? rawTokenJson.token_type : "Bearer",
        expiresAt,
        scopes: grantedScopes,
        subject: verifiedClaims.sub,
        clientId: assignedClientId,
        extAgentHostId: pending.extAgentHostId,
        updatedAt: this.clockFn(),
      };

      const availabilityStatus = hasRequiredPermissions ? "available" : "sin_permiso";
      const unavailableReason = hasRequiredPermissions
        ? undefined
        : "La cuenta o workspace de ChatGPT no otorgó los permisos obligatorios 'resource.invoke' y 'chatgpt.tokens.use.direct'. Proveedor no disponible.";

      let profile: AiProviderProfile;
      if (pending.profileId) {
        const existing = await this.profileManager.getProfile(pending.profileId);
        if (!existing) {
          throw new Error(`AI Profile '${pending.profileId}' not found.`);
        }

        // Detect account switch (different 'sub')
        if (existing.oauthSubject && existing.oauthSubject !== verifiedClaims.sub) {
          this.onAccountChanged?.(existing.id, existing.oauthSubject, verifiedClaims.sub);
        }

        await this.profileManager.storeOrRotateCredential(
          existing.id,
          JSON.stringify(credentialBundle),
        );

        profile = await this.profileManager.updateProfile(existing.id, {
          status: "active",
          authMode: "oauth_siwc",
          endpoint: OPENAI_SIWC_RESPONSES_ENDPOINT,
          oauthSubject: verifiedClaims.sub,
          oauthClientId: assignedClientId,
          oauthScopes: grantedScopes,
          oauthExpiresAt: expiresAt,
          availabilityStatus,
          unavailableReason: unavailableReason ?? null,
        });
      } else {
        profile = await this.profileManager.createProfile({
          name: pending.profileName,
          provider: "openai",
          model: "gpt-4o",
          endpoint: OPENAI_SIWC_RESPONSES_ENDPOINT,
          apiKey: JSON.stringify(credentialBundle),
          authMode: "oauth_siwc",
          oauthSubject: verifiedClaims.sub,
          oauthClientId: assignedClientId,
          oauthScopes: grantedScopes,
          oauthExpiresAt: expiresAt,
          availabilityStatus,
          unavailableReason,
        });
      }

      finalizeSession(undefined, profile);
      return profile;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      finalizeSession(errorObj);
      throw errorObj;
    }
  }

  /**
   * Cryptographically verifies an OpenAI OIDC ID Token (JWT) against the official JWKS,
   * validating signature, algorithm allowlist (`RS256` / `ES256`), `iss`, `aud`, `exp`, `nonce`, and `sub`.
   */
  public async verifyIdTokenCryptographically(
    idToken: string,
    expectations: {
      expectedAud: string[];
      expectedNonce?: string;
    },
  ): Promise<VerifiedIdTokenClaims> {
    if (!idToken || typeof idToken !== "string") {
      throw new AiDiagnosisSecurityError("OPENAI_OAUTH_INVALID_JWT", "El ID token está vacío.");
    }

    const parts = idToken.split(".");
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        "Formato de JWT inválido: el ID token debe constar de 3 segmentos firmados.",
      );
    }

    let header: Record<string, unknown>;
    let claims: Record<string, unknown>;

    try {
      header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
      claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        "No se pudo decodificar el encabezado o payload del ID token.",
      );
    }

    const alg = typeof header.alg === "string" ? header.alg : "";
    const kid = typeof header.kid === "string" ? header.kid : undefined;

    if (!ALLOWED_JWT_ALGS.has(alg)) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        `Algoritmo JWT '${alg}' rechazado. Solo se admiten firmas asimétricas RS256 o ES256.`,
      );
    }

    const jwks = await this.getJwks(false);
    let matchingKey = this.findMatchingJwk(jwks, kid, alg);

    if (!matchingKey) {
      // Refresh JWKS once in case keys rotated
      const refreshedJwks = await this.getJwks(true);
      matchingKey = this.findMatchingJwk(refreshedJwks, kid, alg);
    }

    if (!matchingKey) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        `No se encontró una clave pública JWKS válida para kid='${kid ?? "none"}' y alg='${alg}'.`,
      );
    }

    // Verify cryptographic signature
    let signatureValid = false;
    try {
      const publicKey = crypto.createPublicKey({
        key: matchingKey as any,
        format: "jwk",
      });
      const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, "ascii");
      const signatureBuf = Buffer.from(parts[2], "base64url");

      if (alg === "RS256") {
        signatureValid = crypto.verify("RSA-SHA256", signingInput, publicKey, signatureBuf);
      } else if (alg === "ES256") {
        signatureValid = crypto.verify(
          "sha256",
          signingInput,
          { key: publicKey, dsaEncoding: "ieee-p1363" },
          signatureBuf,
        );
      }
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        "Firma criptográfica del ID token inválida según JWKS oficial.",
      );
    }

    // Verify Issuer
    if (claims.iss !== OPENAI_SIWC_ISSUER) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        `Issuer JWT inválido: se esperaba '${OPENAI_SIWC_ISSUER}'.`,
      );
    }

    // Verify Subject
    if (typeof claims.sub !== "string" || claims.sub.trim().length === 0) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        "El ID token carece del claim obligatorio 'sub'.",
      );
    }

    // Verify Audience
    const audList = Array.isArray(claims.aud)
      ? claims.aud.filter((a): a is string => typeof a === "string")
      : typeof claims.aud === "string"
        ? [claims.aud]
        : [];

    const validAud = audList.some(aud => expectations.expectedAud.includes(aud));
    if (!validAud) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        "El claim 'aud' del ID token no coincide con el client_id registrado de NovaKube.",
      );
    }

    // Verify Expiry
    const nowSec = Math.floor(this.clockFn() / 1000);
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= nowSec) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        "El ID token ha expirado o tiene un claim 'exp' inválido.",
      );
    }

    // Verify Nonce when required
    if (expectations.expectedNonce !== undefined) {
      const tokenNonce = typeof claims.nonce === "string" ? claims.nonce : "";
      if (!tokenNonce || !timingSafeEqualStrings(tokenNonce, expectations.expectedNonce)) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_NONCE_MISMATCH",
          "El claim 'nonce' del ID token no coincide con el nonce criptográfico de la sesión.",
        );
      }
    }

    return {
      iss: claims.iss as string,
      sub: (claims.sub as string).trim(),
      aud: claims.aud as string | string[],
      exp: claims.exp as number,
      iat: typeof claims.iat === "number" ? claims.iat : undefined,
      nonce: typeof claims.nonce === "string" ? claims.nonce : undefined,
      scp: claims.scp as string[] | string | undefined,
      permissions: Array.isArray(claims.permissions)
        ? claims.permissions.filter((p): p is string => typeof p === "string")
        : undefined,
      scope: typeof claims.scope === "string" ? claims.scope : undefined,
    };
  }

  private async getJwks(forceRefresh: boolean): Promise<OpenAiJwksDocument> {
    const now = this.clockFn();
    if (!forceRefresh && this.cachedJwks && now - this.cachedJwks.fetchedAt < this.jwksCacheTtlMs) {
      return this.cachedJwks.doc;
    }

    const resp = await this.transport.execute({
      provider: "openai",
      endpoint: OPENAI_SIWC_JWKS_ENDPOINT,
      method: "GET",
      headers: {
        accept: "application/json",
      },
      timeoutMs: 10_000,
    });

    const doc = resp.json<OpenAiJwksDocument>();
    if (!doc || !Array.isArray(doc.keys) || doc.keys.length === 0) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        "El documento JWKS de OpenAI está vacío o malformado.",
      );
    }

    this.cachedJwks = { doc, fetchedAt: now };
    return doc;
  }

  private findMatchingJwk(
    jwks: OpenAiJwksDocument,
    kid: string | undefined,
    alg: string,
  ): OpenAiJwk | undefined {
    const expectedKty = alg === "RS256" ? "RSA" : "EC";
    return jwks.keys.find(k => {
      if (k.kty !== expectedKty) return false;
      if (k.use && k.use !== "sig") return false;
      if (k.alg && k.alg !== alg) return false;
      if (kid && k.kid && k.kid !== kid) return false;
      return true;
    });
  }

  public extractGrantedScopes(
    tokenResponseScope: unknown,
    claims: VerifiedIdTokenClaims,
  ): string[] {
    const scopeSet = new Set<string>();

    if (typeof tokenResponseScope === "string") {
      for (const s of tokenResponseScope.split(/\s+/)) {
        if (s.trim()) scopeSet.add(s.trim());
      }
    }

    if (typeof claims.scope === "string") {
      for (const s of claims.scope.split(/\s+/)) {
        if (s.trim()) scopeSet.add(s.trim());
      }
    }

    if (Array.isArray(claims.scp)) {
      for (const s of claims.scp) {
        if (typeof s === "string" && s.trim()) scopeSet.add(s.trim());
      }
    } else if (typeof claims.scp === "string") {
      for (const s of claims.scp.split(/\s+/)) {
        if (s.trim()) scopeSet.add(s.trim());
      }
    }

    if (Array.isArray(claims.permissions)) {
      for (const p of claims.permissions) {
        if (typeof p === "string" && p.trim()) scopeSet.add(p.trim());
      }
    }

    return Array.from(scopeSet);
  }

  public hasMandatorySiwcPermissions(scopes: readonly string[]): boolean {
    return REQUIRED_OPENAI_SIWC_SCOPES.every(reqScope => scopes.includes(reqScope));
  }

  /**
   * Returns a valid `access_token` for the OpenAI OAuth profile, performing a serialized
   * token refresh if expired or expiring within 30 seconds, rotating `refresh_token` safely,
   * and verifying that the account (`sub`) and mandatory permissions remain unchanged.
   */
  public async ensureValidAccessToken(profileId: string): Promise<string> {
    const existingRefresh = this.refreshMutex.get(profileId);
    if (existingRefresh) {
      return existingRefresh;
    }

    const promise = this.ensureValidAccessTokenInternal(profileId).finally(() => {
      this.refreshMutex.delete(profileId);
    });

    this.refreshMutex.set(profileId, promise);
    return promise;
  }

  private async ensureValidAccessTokenInternal(profileId: string): Promise<string> {
    const profile = await this.profileManager.getProfile(profileId);
    if (!profile) {
      throw new AiDiagnosisSecurityError("PROFILE_INACTIVE", `El perfil '${profileId}' no existe.`);
    }

    if (profile.status !== "active") {
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        `El perfil '${profile.name}' tiene estado '${profile.status}' y no puede utilizarse.`,
      );
    }

    if (profile.authMode !== "oauth_siwc") {
      throw new AiDiagnosisSecurityError(
        "EXTERNAL_PROVIDER_DISABLED",
        "El perfil OpenAI no está configurado con Sign in with ChatGPT (OAuth).",
      );
    }

    if (profile.availabilityStatus === "sin_permiso") {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_PERMISSION_DENIED",
        profile.unavailableReason ||
          "El proveedor OpenAI está no disponible por falta de permisos ('resource.invoke' y 'chatgpt.tokens.use.direct').",
      );
    }

    if (profile.availabilityStatus === "no_models_available") {
      throw new AiDiagnosisSecurityError(
        "OPENAI_MODELS_UNAVAILABLE",
        profile.unavailableReason ||
          "El proveedor OpenAI no tiene modelos disponibles para esta cuenta o workspace de ChatGPT.",
      );
    }

    let bundle: OpenAiOAuthCredentialBundle;
    try {
      const rawSecret = await this.profileManager.getApiKeyForProfile(profileId);
      bundle = JSON.parse(rawSecret) as OpenAiOAuthCredentialBundle;
    } catch {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_SESSION_INVALID",
        "No se pudieron recuperar las credenciales OAuth cifradas del perfil.",
      );
    }

    if (!this.hasMandatorySiwcPermissions(bundle.scopes || [])) {
      await this.profileManager.updateProfile(profileId, {
        availabilityStatus: "sin_permiso",
        unavailableReason:
          "Permisos obligatorios 'resource.invoke' y 'chatgpt.tokens.use.direct' ausentes.",
      });
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_PERMISSION_DENIED",
        "El token OAuth no posee los permisos obligatorios 'resource.invoke' y 'chatgpt.tokens.use.direct'.",
      );
    }

    const now = this.clockFn();
    // If access token is still valid with >30s buffer, return it directly
    if (bundle.accessToken && bundle.expiresAt > now + 30_000) {
      return bundle.accessToken;
    }

    // Access token is expired or expiring: require refresh_token
    if (!bundle.refreshToken) {
      await this.profileManager.updateProfile(profileId, {
        availabilityStatus: "expired",
        unavailableReason: "El access token expiró y no hay refresh token disponible.",
      });
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_TOKEN_EXPIRED",
        "La sesión OAuth de OpenAI expiró y requiere iniciar sesión nuevamente con ChatGPT.",
      );
    }

    const extAgentHostId =
      bundle.extAgentHostId || this.profileManager.getOrCreateInstallationHostId();
    const clientId =
      bundle.clientId || this.profileManager.getDynamicClientId() || DYNAMIC_AGENT_CLIENT_ID;

    const refreshParams = new URLSearchParams();
    refreshParams.set("grant_type", "refresh_token");
    refreshParams.set("refresh_token", bundle.refreshToken);
    refreshParams.set("client_id", clientId);
    refreshParams.set("ext_agent_host_id", extAgentHostId);

    let refreshResp;
    try {
      refreshResp = await this.transport.execute({
        provider: "openai",
        endpoint: OPENAI_SIWC_TOKEN_ENDPOINT,
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: refreshParams.toString(),
        timeoutMs: 15_000,
        maxRetries: 0,
      });
    } catch (err) {
      await this.profileManager.updateProfile(profileId, {
        availabilityStatus: "expired",
        unavailableReason: "Fallo al renovar el token OAuth de ChatGPT.",
      });
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_TOKEN_EXPIRED",
        "No se pudo renovar el token OAuth de ChatGPT. Inicie sesión nuevamente.",
      );
    }

    const rawRefresh = refreshResp.json<Record<string, unknown>>();
    const newAccessToken =
      typeof rawRefresh.access_token === "string" ? rawRefresh.access_token.trim() : "";
    const rotatedRefreshToken =
      typeof rawRefresh.refresh_token === "string" && rawRefresh.refresh_token.trim().length > 0
        ? rawRefresh.refresh_token.trim()
        : bundle.refreshToken;
    const newIdToken =
      typeof rawRefresh.id_token === "string" && rawRefresh.id_token.trim().length > 0
        ? rawRefresh.id_token.trim()
        : bundle.idToken;
    const expiresInSec =
      typeof rawRefresh.expires_in === "number" && rawRefresh.expires_in > 0
        ? rawRefresh.expires_in
        : 3600;

    if (!newAccessToken) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_TOKEN_EXPIRED",
        "La respuesta de renovación OAuth no devolvió un 'access_token' válido.",
      );
    }

    let verifiedSub = bundle.subject;
    let updatedScopes = bundle.scopes;

    if (typeof rawRefresh.id_token === "string" && rawRefresh.id_token.trim().length > 0) {
      const claims = await this.verifyIdTokenCryptographically(newIdToken, {
        expectedAud: [clientId, DYNAMIC_AGENT_CLIENT_ID],
      });
      verifiedSub = claims.sub;
      const extracted = this.extractGrantedScopes(rawRefresh.scope, claims);
      if (extracted.length > 0) {
        updatedScopes = extracted;
      }
    } else if (typeof rawRefresh.scope === "string" && rawRefresh.scope.trim().length > 0) {
      updatedScopes = rawRefresh.scope
        .split(/\s+/)
        .map(s => s.trim())
        .filter(Boolean);
    }

    if (typeof rawRefresh.sub === "string" && rawRefresh.sub.trim().length > 0) {
      verifiedSub = rawRefresh.sub.trim();
    }

    // Account switch detection during refresh
    if (bundle.subject && verifiedSub !== bundle.subject) {
      this.onAccountChanged?.(profileId, bundle.subject, verifiedSub);
      await this.disconnectAndRevoke(profileId);
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_ACCOUNT_CHANGED",
        "La cuenta de ChatGPT asociada a la sesión cambió durante la renovación ('sub' distinto). Por seguridad se revocó la sesión y se requiere nuevo consentimiento.",
      );
    }

    if (!this.hasMandatorySiwcPermissions(updatedScopes)) {
      await this.profileManager.updateProfile(profileId, {
        availabilityStatus: "sin_permiso",
        unavailableReason:
          "Los permisos 'resource.invoke' y 'chatgpt.tokens.use.direct' fueron revocados en la cuenta.",
      });
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_PERMISSION_DENIED",
        "La cuenta ya no dispone de los permisos obligatorios 'resource.invoke' y 'chatgpt.tokens.use.direct'.",
      );
    }

    const newExpiresAt = this.clockFn() + expiresInSec * 1000;
    const updatedBundle: OpenAiOAuthCredentialBundle = {
      ...bundle,
      accessToken: newAccessToken,
      refreshToken: rotatedRefreshToken,
      idToken: newIdToken,
      expiresAt: newExpiresAt,
      scopes: updatedScopes,
      subject: verifiedSub,
      updatedAt: this.clockFn(),
    };

    await this.profileManager.storeOrRotateCredential(profileId, JSON.stringify(updatedBundle));
    await this.profileManager.updateProfile(profileId, {
      oauthSubject: verifiedSub,
      oauthScopes: updatedScopes,
      oauthExpiresAt: newExpiresAt,
      availabilityStatus: "available",
      unavailableReason: null,
    });

    return newAccessToken;
  }

  /**
   * Disconnects the OpenAI OAuth account, revokes the token remotely at `https://auth.openai.com/oauth/revoke`,
   * and wipes all local credentials from `SecureCredentialVault` and SQLite metadata.
   */
  public async disconnectAndRevoke(profileId: string): Promise<AiProviderProfile> {
    const profile = await this.profileManager.getProfile(profileId);
    if (!profile) {
      throw new Error(`AI Profile '${profileId}' not found.`);
    }

    let tokenToRevoke: string | undefined;
    let clientId = profile.oauthClientId || this.profileManager.getDynamicClientId() || DYNAMIC_AGENT_CLIENT_ID;

    try {
      if (profile.status === "active" && this.profileManager.hasVaultCredential(profile.credentialRef)) {
        const rawSecret = await this.profileManager.getApiKeyForProfile(profileId);
        const bundle = JSON.parse(rawSecret) as OpenAiOAuthCredentialBundle;
        tokenToRevoke = bundle.refreshToken || bundle.accessToken;
        if (bundle.clientId) {
          clientId = bundle.clientId;
        }
      }
    } catch {
      // Proceed with local purge even if vault decryption fails
    }

    if (tokenToRevoke) {
      try {
        const revokeParams = new URLSearchParams();
        revokeParams.set("token", tokenToRevoke);
        revokeParams.set("client_id", clientId);

        await this.transport.execute({
          provider: "openai",
          endpoint: OPENAI_SIWC_REVOKE_ENDPOINT,
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
          body: revokeParams.toString(),
          timeoutMs: 10_000,
          maxRetries: 0,
        });
      } catch {
        // Remote revocation failure must never prevent local credential destruction
      }
    }

    await this.profileManager.purgeProfileCredential(profileId);
    this.onSessionRevoked?.(profileId);

    return this.profileManager.updateProfile(profileId, {
      status: "revoked",
      oauthSubject: null,
      oauthScopes: null,
      oauthExpiresAt: null,
      availabilityStatus: "disconnected",
      unavailableReason: "Cuenta de ChatGPT desconectada y credenciales locales eliminadas.",
    });
  }

  /**
   * Queries the official OpenAI models endpoint (`GET https://api.openai.com/v1/models`)
   * using the authorized OAuth access token. Filters models with `visibility === "list"`
   * (when `visibility` is specified) and never invents model compatibility.
   */
  public async fetchAvailableModels(profileId: string): Promise<OpenAiModelDescriptor[]> {
    const accessToken = await this.ensureValidAccessToken(profileId);

    const resp = await this.transport.execute({
      provider: "openai",
      endpoint: OPENAI_SIWC_MODELS_ENDPOINT,
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
      timeoutMs: 15_000,
    });

    const payload = resp.json<{ data?: unknown[] }>();
    if (!payload || !Array.isArray(payload.data)) {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        "La respuesta de '/v1/models' de OpenAI no contiene un arreglo 'data' válido.",
      );
    }

    const eligibleModels: OpenAiModelDescriptor[] = [];

    for (const rawModel of payload.data) {
      if (!rawModel || typeof rawModel !== "object") continue;
      const m = rawModel as Record<string, unknown>;
      if (typeof m.id !== "string" || m.id.trim().length === 0) continue;

      // Official SIWC models endpoint marks user-selectable models with visibility: "list"
      if (m.visibility !== undefined && m.visibility !== "list") {
        continue;
      }

      if (
        Array.isArray(m.supported_endpoints) &&
        !m.supported_endpoints.includes("/v1/responses") &&
        !m.supported_endpoints.includes("responses")
      ) {
        continue;
      }

      eligibleModels.push({
        id: m.id.trim(),
        object: "model",
        created: typeof m.created === "number" ? m.created : undefined,
        ownedBy: typeof m.owned_by === "string" ? m.owned_by : undefined,
        visibility: typeof m.visibility === "string" ? m.visibility : "list",
        supportedEndpoints: Array.isArray(m.supported_endpoints)
          ? m.supported_endpoints.filter((e): e is string => typeof e === "string")
          : undefined,
      });
    }

    if (eligibleModels.length === 0) {
      await this.profileManager.updateProfile(profileId, {
        availabilityStatus: "no_models_available",
        unavailableReason:
          "El endpoint oficial '/v1/models' no devolvió modelos compatibles habilitados para esta cuenta de ChatGPT.",
      });
      throw new AiDiagnosisSecurityError(
        "OPENAI_MODELS_UNAVAILABLE",
        "No hay modelos disponibles para la cuenta de ChatGPT autorizada.",
      );
    }

    const profile = await this.profileManager.getProfile(profileId);
    if (profile) {
      const currentModelValid = eligibleModels.some(m => m.id === profile.model);
      await this.profileManager.updateProfile(profileId, {
        model: currentModelValid ? profile.model : eligibleModels[0].id,
        availabilityStatus: "available",
        unavailableReason: null,
      });
    }

    return eligibleModels;
  }
}
