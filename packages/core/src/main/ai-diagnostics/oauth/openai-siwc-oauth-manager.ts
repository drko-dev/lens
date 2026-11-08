/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import http from "http";
import type { Socket } from "net";
import {
  OPENAI_SIWC_DISCOVERY_ENDPOINT,
  OPENAI_SIWC_ISSUER,
  OPENAI_SIWC_MODELS_ENDPOINT,
  OPENAI_SIWC_RESOURCE_URI,
  OPENAI_SIWC_RESPONSES_ENDPOINT,
  REQUIRED_OPENAI_SIWC_SCOPES,
  type AiProviderProfile,
  type OpenAiModelDescriptor,
} from "../../../common/incident/ai-profile-types";
import type { AiProfileManager } from "../ai-profile-manager";
import { AiDiagnosisSecurityError } from "../ai-diagnosis-errors";
import type { SecureAiTransport } from "../transport/ai-transport-types";

export {
  OPENAI_SIWC_DISCOVERY_ENDPOINT,
  OPENAI_SIWC_ISSUER,
  OPENAI_SIWC_RESOURCE_URI,
};

export const OPENAI_SIWC_AUTHORIZE_ENDPOINT = `${OPENAI_SIWC_ISSUER}/api/accounts/authorize`;
export const OPENAI_SIWC_TOKEN_ENDPOINT = `${OPENAI_SIWC_ISSUER}/api/accounts/oauth/token`;
export const OPENAI_SIWC_REVOKE_ENDPOINT = `${OPENAI_SIWC_ISSUER}/api/accounts/oauth/revoke`;
export const OPENAI_SIWC_JWKS_ENDPOINT = `${OPENAI_SIWC_ISSUER}/.well-known/jwks.json`;

export const DYNAMIC_AGENT_CLIENT_ID = "dynamic_agent_client";
export const NOVAKUBE_AGENT_NAME_HINT = "NovaKube";
export const OAUTH_CALLBACK_PATH = "/oauth/callback";
export const PENDING_OPENAI_MODEL_SELECTION = "pending_model_selection";

const OAIAPP_CLIENT_ID_REGEX = /^oaiapp_[A-Za-z0-9_-]{3,128}$/;

export function isValidOaiAppClientId(clientId: unknown): clientId is string {
  return typeof clientId === "string" && OAIAPP_CLIENT_ID_REGEX.test(clientId);
}

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

export interface OpenAiOidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  jwks_uri?: string;
  revocation_endpoint?: string;
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

type PendingSessionPhase =
  | "waiting_callback"
  | "exchanging_code"
  | "committing"
  | "completed"
  | "terminated";

interface AccountSessionHint {
  clientId: string;
  extAgentHostId: string;
  idTokenHint?: string;
}

interface InternalPendingSession {
  sessionId: string;
  profileId?: string;
  profileName: string;
  allowAccountOverwrite: boolean;
  expectedClientId?: string;
  expectedSubject?: string;
  idTokenHint?: string;
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
  activeSockets: Set<Socket>;
  timeoutTimer?: ReturnType<typeof setTimeout>;
  abortSignal?: AbortSignal;
  abortListener?: () => void;
  inFlightAbortController: AbortController;
  initialRevocationEpoch: number;
  phase: PendingSessionPhase;
  terminationError?: Error;
  resolveCompletion: (profile: AiProviderProfile) => void;
  rejectCompletion: (err: Error) => void;
  finalize: (
    err?: Error,
    profile?: AiProviderProfile,
    options?: { destroySocketsImmediately?: boolean },
  ) => void;
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

/**
 * Parses and validates the official Sign in with ChatGPT `/v1/models` catalog response:
 * - Reads `models[]`.
 * - Requires `slug`, `display_name`, and `visibility` on every catalog item.
 * - Filters strictly by `visibility === "list"`.
 * - Preserves server order.
 * - Rejects malformed catalogs.
 */
export function parseOfficialOpenAiModelsCatalog(payload: unknown): OpenAiModelDescriptor[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new AiDiagnosisSecurityError(
      "ERR_PAYLOAD_VALIDATION",
      "La respuesta de '/v1/models' de OpenAI no es un objeto JSON válido.",
    );
  }

  const rawModels = (payload as Record<string, unknown>).models;
  if (!Array.isArray(rawModels)) {
    throw new AiDiagnosisSecurityError(
      "ERR_PAYLOAD_VALIDATION",
      "El catálogo de '/v1/models' de OpenAI está malformado: se requiere el arreglo oficial 'models[]'.",
    );
  }

  const eligibleModels: OpenAiModelDescriptor[] = [];

  for (const rawEntry of rawModels) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        "El catálogo de '/v1/models' contiene un elemento que no es un objeto válido.",
      );
    }

    const entry = rawEntry as Record<string, unknown>;
    const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
    const displayName = typeof entry.display_name === "string" ? entry.display_name.trim() : "";
    const visibility = typeof entry.visibility === "string" ? entry.visibility.trim() : "";

    if (!slug || !displayName || !visibility) {
      throw new AiDiagnosisSecurityError(
        "ERR_PAYLOAD_VALIDATION",
        "Entrada malformada en 'models[]': cada modelo debe incluir 'slug', 'display_name' y 'visibility' no vacíos.",
      );
    }

    if (visibility !== "list") {
      continue;
    }

    if (
      Array.isArray(entry.supported_endpoints) &&
      !entry.supported_endpoints.includes("/v1/responses") &&
      !entry.supported_endpoints.includes("responses")
    ) {
      continue;
    }

    eligibleModels.push({
      id: slug,
      slug,
      displayName,
      visibility: "list",
      supportedEndpoints: Array.isArray(entry.supported_endpoints)
        ? entry.supported_endpoints.filter((e): e is string => typeof e === "string")
        : undefined,
    });
  }

  return eligibleModels;
}

export class OpenAiSiwcOAuthManager {
  private readonly pendingSessions = new Map<string, InternalPendingSession>();
  private readonly terminatedSessionErrors = new Map<string, Error>();
  private readonly disconnectingProfiles = new Set<string>();
  private readonly revocationEpochs = new Map<string, number>();
  private readonly revokedReasonByProfile = new Map<string, string>();
  private readonly accountSessionHintsByProfile = new Map<string, AccountSessionHint>();
  private readonly refreshMutex = new Map<string, Promise<string>>();
  private readonly validatedModelsByProfile = new Map<string, OpenAiModelDescriptor[]>();
  private cachedJwks?: { doc: OpenAiJwksDocument; fetchedAt: number };
  private cachedDiscovery?: { doc: OpenAiOidcDiscoveryDocument; fetchedAt: number };
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

  public getPendingSessionsCount(): number {
    return this.pendingSessions.size;
  }

  public isExternalNetworkAvailable(): boolean {
    if (typeof this.transport.isExternalNetworkEnabled === "function") {
      return this.transport.isExternalNetworkEnabled();
    }
    return true;
  }

  public dispose(): void {
    const sessions = Array.from(this.pendingSessions.values());
    for (const pending of sessions) {
      pending.finalize(
        new AiDiagnosisSecurityError(
          "ERR_ABORTED",
          "Flujo OAuth cancelado por cierre de ventana o aplicación.",
        ),
      );
    }
    this.pendingSessions.clear();
  }

  private isProfileRevokedOrDisconnecting(profileId: string, initialEpoch: number): boolean {
    return (
      this.disconnectingProfiles.has(profileId) ||
      (this.revocationEpochs.get(profileId) ?? 0) !== initialEpoch
    );
  }

  private async enforceRevokedProfileState(
    profileId: string,
    extraCredentialRefs?: ReadonlyArray<string | undefined>,
  ): Promise<void> {
    this.validatedModelsByProfile.delete(profileId);
    const existingHint = this.accountSessionHintsByProfile.get(profileId);
    if (existingHint && isValidOaiAppClientId(existingHint.clientId)) {
      this.accountSessionHintsByProfile.set(profileId, {
        clientId: existingHint.clientId,
        extAgentHostId: existingHint.extAgentHostId,
        idTokenHint: undefined,
      });
    } else {
      this.accountSessionHintsByProfile.delete(profileId);
    }

    const revokedReason =
      this.revokedReasonByProfile.get(profileId) ||
      "Cuenta de ChatGPT desconectada y credenciales locales eliminadas.";

    await this.profileManager.enforceRevokedState(profileId, revokedReason, extraCredentialRefs);
    this.onSessionRevoked?.(profileId);
  }

  private async compensateCreatedProfile(
    createdProfileId: string | undefined,
    preCommitProfileIds: ReadonlySet<string>,
    expectedSubject: string,
    expectedClientId: string,
  ): Promise<void> {
    if (createdProfileId) {
      this.validatedModelsByProfile.delete(createdProfileId);
      this.accountSessionHintsByProfile.delete(createdProfileId);
      await this.profileManager.deleteProfile(createdProfileId);
    }

    const allProfiles = await this.profileManager.listProfiles();
    for (const p of allProfiles) {
      if (
        p.id !== createdProfileId &&
        !preCommitProfileIds.has(p.id) &&
        p.provider === "openai" &&
        p.authMode === "oauth_siwc" &&
        p.oauthSubject === expectedSubject &&
        p.oauthClientId === expectedClientId
      ) {
        this.validatedModelsByProfile.delete(p.id);
        this.accountSessionHintsByProfile.delete(p.id);
        await this.profileManager.deleteProfile(p.id);
      }
    }
  }

  private async compensateAbortedCommit(params: {
    createdProfileId: string | undefined;
    preCommitProfileIds: ReadonlySet<string>;
    expectedSubject: string;
    expectedClientId: string;
    mutatedExistingProfile: boolean;
    existingProfileToUpdate: AiProviderProfile | undefined;
    previousProfileSnapshot: AiProviderProfile | undefined;
    previousRawCredential: string | undefined;
    rotatedCredentialRef: string | undefined;
    previousValidatedModels: OpenAiModelDescriptor[] | undefined;
    previousSessionHint: AccountSessionHint | undefined;
    initialRevocationEpoch: number;
  }): Promise<void> {
    if (!params.existingProfileToUpdate) {
      await this.compensateCreatedProfile(
        params.createdProfileId,
        params.preCommitProfileIds,
        params.expectedSubject,
        params.expectedClientId,
      );
      return;
    }

    const profileId = params.existingProfileToUpdate.id;
    const candidateRefs = [
      params.existingProfileToUpdate.credentialRef,
      params.previousProfileSnapshot?.credentialRef,
      params.rotatedCredentialRef,
    ];

    const wasRevoked =
      this.isProfileRevokedOrDisconnecting(profileId, params.initialRevocationEpoch) ||
      (params.previousProfileSnapshot?.status !== "revoked" &&
        this.profileManager.isProfileRevoked(profileId));

    // R3-01: A requested or completed disconnection ALWAYS prevails over rollback.
    // Never restore previous credentials or reactivate a profile whose revocation epoch changed.
    if (wasRevoked) {
      await this.enforceRevokedProfileState(profileId, candidateRefs);
      return;
    }

    if (params.mutatedExistingProfile && params.previousProfileSnapshot) {
      try {
        await this.profileManager.restoreProfileSnapshot(
          params.previousProfileSnapshot,
          params.previousRawCredential,
        );

        // Re-verify immediately after rollback in case disconnectAndRevoke raced with restoreProfileSnapshot
        if (
          this.isProfileRevokedOrDisconnecting(profileId, params.initialRevocationEpoch) ||
          (params.previousProfileSnapshot.status !== "revoked" &&
            this.profileManager.isProfileRevoked(profileId))
        ) {
          await this.enforceRevokedProfileState(profileId, candidateRefs);
          return;
        }

        if (params.previousValidatedModels) {
          this.validatedModelsByProfile.set(profileId, params.previousValidatedModels);
        } else {
          this.validatedModelsByProfile.delete(profileId);
        }
        if (params.previousSessionHint) {
          this.accountSessionHintsByProfile.set(profileId, params.previousSessionHint);
        } else {
          this.accountSessionHintsByProfile.delete(profileId);
        }
      } catch (rollbackErr) {
        // R3-01: Never hide compensation errors or leave unverified/orphaned credentials active
        await this.enforceRevokedProfileState(profileId, candidateRefs);
        if (!this.isProfileRevokedOrDisconnecting(profileId, params.initialRevocationEpoch)) {
          throw rollbackErr;
        }
      }
    }
  }

  private assertSessionActive(pending: InternalPendingSession): void {
    if (pending.terminationError) {
      throw pending.terminationError;
    }

    if (pending.abortSignal?.aborted) {
      const abortErr = new AiDiagnosisSecurityError(
        "ERR_ABORTED",
        "Flujo OAuth cancelado por el usuario.",
      );
      pending.finalize(abortErr, undefined, { destroySocketsImmediately: false });
      throw pending.terminationError ?? abortErr;
    }

    if (
      pending.profileId &&
      (this.disconnectingProfiles.has(pending.profileId) ||
        (this.revocationEpochs.get(pending.profileId) ?? 0) !== pending.initialRevocationEpoch)
    ) {
      const revokeErr = new AiDiagnosisSecurityError(
        "ERR_ABORTED",
        "Flujo OAuth cancelado porque el perfil fue desconectado o revocado.",
      );
      pending.finalize(revokeErr, undefined, { destroySocketsImmediately: false });
      throw pending.terminationError ?? revokeErr;
    }

    if (this.clockFn() > pending.expiresAt) {
      const timeoutErr = new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_SESSION_TIMEOUT",
        "La sesión temporal de autorización OAuth expiró.",
      );
      pending.finalize(timeoutErr, undefined, { destroySocketsImmediately: false });
      throw pending.terminationError ?? timeoutErr;
    }

    if (pending.completed || pending.phase === "terminated" || !this.pendingSessions.has(pending.sessionId)) {
      const invalidErr = new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_SESSION_INVALID",
        "La sesión de autorización OAuth ya no está activa.",
      );
      pending.finalize(invalidErr, undefined, { destroySocketsImmediately: false });
      throw pending.terminationError ?? invalidErr;
    }
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
      parsed.pathname !== "/api/accounts/authorize" ||
      parsed.searchParams.get("resource") !== OPENAI_SIWC_RESOURCE_URI
    ) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_AUTH_URL",
        `Solo se autoriza abrir el endpoint oficial '${OPENAI_SIWC_AUTHORIZE_ENDPOINT}' con resource='${OPENAI_SIWC_RESOURCE_URI}' en el navegador del sistema.`,
      );
    }
  }

  /**
   * Starts an official OpenAI Sign in with ChatGPT (SIWC) browser OAuth flow:
   * - Immediately fails closed if external network transport is disabled (`DisabledRealNetworkEngine`).
   * - Generates PKCE S256 (code_verifier + code_challenge), state, and OIDC nonce.
   * - Includes `resource=https://api.openai.com/v1` and `ext_agent_host_id`.
   * - Uses account-specific `oaiapp_*` client ID when re-authorizing an existing profile, or `dynamic_agent_client` for initial registration.
   * - Includes `agent_name_hint` exclusively on initial registration; omits it on reauthorization and includes `id_token_hint` when available.
   * - Enforces an active session timer that rejects `waitForCompletion()`, closes the `127.0.0.1` listener, and releases all listeners on timeout.
   */
  public async startSignInWithChatGpt(options?: {
    profileId?: string;
    profileName?: string;
    allowAccountOverwrite?: boolean;
    idTokenHint?: string;
    signal?: AbortSignal;
    listenOnLoopback?: boolean;
  }): Promise<PendingOAuthSessionHandle> {
    if (options?.signal?.aborted) {
      throw new AiDiagnosisSecurityError("ERR_ABORTED", "Inicio de sesión OAuth cancelado antes de comenzar.");
    }

    // R1-03: Fail closed immediately when real external network is disabled so UI never hangs waiting for a callback
    if (!this.isExternalNetworkAvailable()) {
      throw new AiDiagnosisSecurityError(
        "EXTERNAL_PROVIDER_DISABLED",
        "Conexión con ChatGPT no disponible: el transporte de red externa está deshabilitado (DisabledRealNetworkEngine activo) hasta autorización explícita.",
      );
    }

    let expectedClientId: string | undefined;
    let expectedSubject: string | undefined;
    let accountExtAgentHostId: string | undefined;
    let idTokenHint = options?.idTokenHint?.trim() || undefined;

    if (options?.profileId) {
      if (this.disconnectingProfiles.has(options.profileId)) {
        throw new AiDiagnosisSecurityError(
          "PROFILE_INACTIVE",
          "El perfil se encuentra en proceso de desconexión; no se puede iniciar OAuth.",
        );
      }

      const existingProfile = await this.profileManager.getProfile(options.profileId);
      if (!existingProfile) {
        throw new AiDiagnosisSecurityError(
          "PROFILE_NOT_FOUND",
          `El perfil '${options.profileId}' no existe.`,
        );
      }

      const hint = this.accountSessionHintsByProfile.get(existingProfile.id);
      let existingBundle: OpenAiOAuthCredentialBundle | undefined;
      try {
        const rawSecret = await this.profileManager.tryGetRawCredential(existingProfile.id);
        if (rawSecret) {
          existingBundle = JSON.parse(rawSecret) as OpenAiOAuthCredentialBundle;
        }
      } catch {
        existingBundle = undefined;
      }

      const candidateClientId =
        existingProfile.oauthClientId || existingBundle?.clientId || hint?.clientId;
      if (candidateClientId) {
        if (!isValidOaiAppClientId(candidateClientId)) {
          throw new AiDiagnosisSecurityError(
            "OPENAI_OAUTH_INVALID_CLIENT_ID",
            `El perfil '${existingProfile.name}' contiene un oauthClientId inválido. Se requiere formato 'oaiapp_*'.`,
          );
        }
        expectedClientId = candidateClientId;
      }

      expectedSubject = existingProfile.oauthSubject || existingBundle?.subject;
      accountExtAgentHostId = existingBundle?.extAgentHostId || hint?.extAgentHostId;
      if (!idTokenHint) {
        const storedIdToken = existingBundle?.idToken || hint?.idTokenHint;
        if (typeof storedIdToken === "string" && storedIdToken.trim().length > 0) {
          idTokenHint = storedIdToken.trim();
        }
      }
    }

    const extAgentHostId =
      accountExtAgentHostId || this.profileManager.getOrCreateInstallationHostId();
    // Initial registration uses dynamic_agent_client; re-authorization of an account uses its specific oaiapp_* client_id
    const clientId = expectedClientId ?? DYNAMIC_AGENT_CLIENT_ID;
    const isReauthorization = Boolean(expectedClientId);

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
    const activeSockets = new Set<Socket>();
    let server: http.Server | undefined;
    let loopbackPort = 0;

    if (shouldListen) {
      const listenerResult = await this.createLoopbackServer(sessionId, activeSockets);
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
    authUrlObj.searchParams.set("resource", OPENAI_SIWC_RESOURCE_URI);
    authUrlObj.searchParams.set("state", state);
    authUrlObj.searchParams.set("nonce", nonce);
    authUrlObj.searchParams.set("code_challenge", codeChallenge);
    authUrlObj.searchParams.set("code_challenge_method", "S256");
    authUrlObj.searchParams.set("ext_agent_host_id", extAgentHostId);

    // R2-03: agent_name_hint is sent EXCLUSIVELY on initial registration; omit on reauthorization with oaiapp_*
    if (!isReauthorization) {
      authUrlObj.searchParams.set("agent_name_hint", NOVAKUBE_AGENT_NAME_HINT);
    } else if (idTokenHint) {
      // R2-03: Preserve id_token_hint for reauthorization when available (without substituting identity validation)
      authUrlObj.searchParams.set("id_token_hint", idTokenHint);
    }

    const authorizationUrl = authUrlObj.toString();
    const now = this.clockFn();
    const inFlightAbortController = new AbortController();
    const initialRevocationEpoch = options?.profileId
      ? (this.revocationEpochs.get(options.profileId) ?? 0)
      : 0;

    const pending: InternalPendingSession = {
      sessionId,
      profileId: options?.profileId,
      profileName: options?.profileName?.trim() || "OpenAI — ChatGPT OAuth",
      allowAccountOverwrite: options?.allowAccountOverwrite === true,
      expectedClientId,
      expectedSubject,
      idTokenHint,
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
      activeSockets,
      inFlightAbortController,
      initialRevocationEpoch,
      phase: "waiting_callback",
      resolveCompletion,
      rejectCompletion,
      finalize: () => {},
      completed: false,
    };

    const finalizeSession = (
      err?: Error,
      profile?: AiProviderProfile,
      finalizeOptions?: { destroySocketsImmediately?: boolean },
    ) => {
      if (pending.completed) {
        return;
      }

      let finalError = err;
      if (!finalError && profile) {
        if (pending.terminationError) {
          finalError = pending.terminationError;
        } else if (pending.abortSignal?.aborted) {
          finalError = new AiDiagnosisSecurityError(
            "ERR_ABORTED",
            "Flujo OAuth cancelado por el usuario.",
          );
        } else if (
          pending.profileId &&
          (this.disconnectingProfiles.has(pending.profileId) ||
            (this.revocationEpochs.get(pending.profileId) ?? 0) !== pending.initialRevocationEpoch)
        ) {
          finalError = new AiDiagnosisSecurityError(
            "ERR_ABORTED",
            "Flujo OAuth cancelado porque el perfil fue desconectado o revocado.",
          );
        } else if (this.clockFn() > pending.expiresAt) {
          finalError = new AiDiagnosisSecurityError(
            "OPENAI_OAUTH_SESSION_TIMEOUT",
            "La sesión temporal de autorización OAuth expiró.",
          );
        }
      }

      pending.completed = true;
      this.pendingSessions.delete(sessionId);

      if (finalError) {
        pending.phase = "terminated";
        pending.terminationError = finalError;
        this.terminatedSessionErrors.set(sessionId, finalError);
        try {
          pending.inFlightAbortController.abort(finalError);
        } catch {
          // Ignore abort controller errors
        }
      } else {
        pending.phase = "completed";
        this.terminatedSessionErrors.delete(sessionId);
      }

      if (pending.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
        pending.timeoutTimer = undefined;
      }

      if (pending.abortSignal && pending.abortListener) {
        try {
          pending.abortSignal.removeEventListener("abort", pending.abortListener);
        } catch {
          // Ignore listener removal errors
        }
        pending.abortListener = undefined;
        pending.abortSignal = undefined;
      }

      if (pending.server) {
        const srv = pending.server;
        pending.server = undefined;
        if (finalizeOptions?.destroySocketsImmediately !== false) {
          for (const sock of pending.activeSockets) {
            try {
              sock.destroy();
            } catch {
              // Ignore socket destroy error
            }
          }
          pending.activeSockets.clear();
        }
        try {
          srv.close();
        } catch {
          // Ignore close error
        }
      }

      const resolveFn = pending.resolveCompletion;
      const rejectFn = pending.rejectCompletion;
      pending.resolveCompletion = () => {};
      pending.rejectCompletion = () => {};

      if (finalError) {
        rejectFn(finalError);
      } else if (profile) {
        resolveFn(profile);
      }
    };

    pending.finalize = finalizeSession;
    this.pendingSessions.set(sessionId, pending);

    // R1-04 & R2-01: Real expiration timer that aborts in-flight requests, rejects waitForCompletion(), closes 127.0.0.1 listener, and prevents late persistence
    pending.timeoutTimer = setTimeout(() => {
      finalizeSession(
        new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_SESSION_TIMEOUT",
          `La sesión de autorización OAuth expiró tras ${this.sessionTimeoutMs}ms sin recibir el callback del navegador.`,
        ),
      );
    }, this.sessionTimeoutMs);

    if (options?.signal) {
      const onAbort = () => {
        finalizeSession(
          new AiDiagnosisSecurityError("ERR_ABORTED", "Flujo OAuth cancelado por el usuario."),
        );
      };
      pending.abortSignal = options.signal;
      pending.abortListener = onAbort;
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    // Launch system browser
    try {
      this.validateAuthorizationUrlBeforeLaunch(authorizationUrl);
      await this.browserLauncher(authorizationUrl);
    } catch (err) {
      finalizeSession(err instanceof Error ? err : new Error(String(err)));
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
        finalizeSession(
          new AiDiagnosisSecurityError("ERR_ABORTED", "Flujo OAuth cancelado explícitamente."),
        ),
    };
  }

  /**
   * Creates a temporary HTTP server bound strictly to `127.0.0.1:0` for the OAuth callback.
   */
  private createLoopbackServer(
    sessionId: string,
    activeSockets: Set<Socket>,
  ): Promise<{ server: http.Server; port: number }> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        const remoteAddr = req.socket.remoteAddress || "";
        if (remoteAddr !== "127.0.0.1" && remoteAddr !== "::ffff:127.0.0.1") {
          res.writeHead(403, {
            "Content-Type": "text/plain; charset=utf-8",
            Connection: "close",
          });
          res.end("Forbidden: Loopback 127.0.0.1 required.");
          return;
        }

        const pending = this.pendingSessions.get(sessionId);
        if (!pending || pending.completed) {
          res.writeHead(410, {
            "Content-Type": "text/plain; charset=utf-8",
            Connection: "close",
          });
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
        } catch {
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

      server.on("connection", (socket: Socket) => {
        activeSockets.add(socket);
        socket.on("close", () => {
          activeSockets.delete(socket);
        });
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
   * exchanges the authorization code with PKCE `code_verifier` and `resource=https://api.openai.com/v1`,
   * enforces issued `oaiapp_*` client IDs (rejecting initial callbacks that omit `client_id`),
   * verifies the ID token via JWKS BEFORE touching credentials, revalidates session liveness after every
   * asynchronous boundary with full rollback compensation if cancelled/expired mid-commit,
   * enforces mandatory permissions (`resource.invoke` and `chatgpt.tokens.use.direct`) strictly from
   * server-granted token scopes, and prevents overwriting an existing profile with a different account.
   */
  public async handleCallbackUrl(sessionId: string, callbackUrl: string): Promise<AiProviderProfile> {
    const pending = this.pendingSessions.get(sessionId);
    if (!pending) {
      const priorTerminationErr = this.terminatedSessionErrors.get(sessionId);
      if (priorTerminationErr) {
        throw priorTerminationErr;
      }
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_SESSION_INVALID",
        "La sesión de autorización OAuth no existe o ya fue consumida.",
      );
    }

    try {
      this.assertSessionActive(pending);

      if (pending.phase !== "waiting_callback") {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_SESSION_INVALID",
          "La sesión de autorización OAuth ya está siendo procesada o fue consumida.",
        );
      }
      pending.phase = "exchanging_code";

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
      let tokenExchangeClientId: string;

      if (pending.expectedClientId) {
        // R1-01 & R2-02: Reauthorization reuses registered oaiapp_* client_id when callback omits client_id,
        // and rejects any callback client_id that does not match the registered oaiapp_* client_id.
        if (callbackClientId !== null && callbackClientId !== pending.expectedClientId) {
          throw new AiDiagnosisSecurityError(
            "OPENAI_OAUTH_CALLBACK_MALICIOUS",
            `El callback de reautorización incluyó un client_id ('${callbackClientId}') que no coincide con el client_id registrado de la cuenta ('${pending.expectedClientId}').`,
          );
        }
        tokenExchangeClientId = pending.expectedClientId;
      } else {
        // R2-02: Initial registration MUST contain an issued oaiapp_* client_id in the callback.
        // Never exchange an authorization code using dynamic_agent_client or rely on the token server to supply it.
        if (!callbackClientId || !isValidOaiAppClientId(callbackClientId)) {
          throw new AiDiagnosisSecurityError(
            "OPENAI_OAUTH_INVALID_CLIENT_ID",
            `El callback de registro inicial debe incluir un client_id emitido con formato 'oaiapp_*' (recibido: '${callbackClientId ?? "ausente"}'). No se permite realizar intercambio de tokens con '${DYNAMIC_AGENT_CLIENT_ID}'.`,
          );
        }
        tokenExchangeClientId = callbackClientId;
      }

      this.assertSessionActive(pending);

      // Exchange authorization code for tokens using PKCE code_verifier and resource=https://api.openai.com/v1
      const tokenParams = new URLSearchParams();
      tokenParams.set("grant_type", "authorization_code");
      tokenParams.set("code", code);
      tokenParams.set("redirect_uri", pending.redirectUri);
      tokenParams.set("client_id", tokenExchangeClientId);
      tokenParams.set("code_verifier", pending.codeVerifier);
      tokenParams.set("resource", OPENAI_SIWC_RESOURCE_URI);
      tokenParams.set("ext_agent_host_id", pending.extAgentHostId);
      if (!pending.expectedClientId) {
        tokenParams.set("agent_name_hint", NOVAKUBE_AGENT_NAME_HINT);
      }

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
        signal: pending.inFlightAbortController.signal,
      });

      // R2-01: Revalidate session liveness immediately after async token exchange
      this.assertSessionActive(pending);

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
      const tokenResponseClientId =
        typeof rawTokenJson.client_id === "string" && rawTokenJson.client_id.trim().length > 0
          ? rawTokenJson.client_id.trim()
          : undefined;

      if (!accessToken || !idToken) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_INVALID_TOKEN_RESPONSE",
          "La respuesta del servidor OAuth no incluyó 'access_token' e 'id_token' obligatorios.",
        );
      }

      let assignedClientId: string;
      if (pending.expectedClientId) {
        if (tokenResponseClientId && tokenResponseClientId !== pending.expectedClientId) {
          throw new AiDiagnosisSecurityError(
            "OPENAI_OAUTH_INVALID_CLIENT_ID",
            "El servidor de tokens devolvió un client_id distinto al registrado para esta cuenta.",
          );
        }
        assignedClientId = pending.expectedClientId;
      } else {
        if (
          callbackClientId &&
          tokenResponseClientId &&
          callbackClientId !== tokenResponseClientId
        ) {
          throw new AiDiagnosisSecurityError(
            "OPENAI_OAUTH_INVALID_CLIENT_ID",
            "El client_id del callback no coincide con el client_id devuelto por el endpoint de tokens.",
          );
        }
        assignedClientId = callbackClientId!;
      }

      // R1-01 & R2-02: Require issued oaiapp_* client ID and NEVER persist dynamic_agent_client
      if (!isValidOaiAppClientId(assignedClientId)) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_INVALID_CLIENT_ID",
          `Se requiere un client_id emitido con prefijo 'oaiapp_*' (recibido: '${assignedClientId || "ninguno"}'). No se admite '${DYNAMIC_AGENT_CLIENT_ID}' como identidad persistente.`,
        );
      }

      // R1-01 & R2-03: Cryptographically validate ID token via JWKS BEFORE touching any profile or credentials
      // (even when id_token_hint was supplied on reauthorization, full identity validation is mandatory).
      const verifiedClaims = await this.verifyIdTokenCryptographically(
        idToken,
        {
          expectedAud: [assignedClientId],
          expectedNonce: pending.nonce,
        },
        pending.inFlightAbortController.signal,
      );

      // R2-01: Revalidate session liveness immediately after async JWKS / ID token verification
      this.assertSessionActive(pending);

      // R1-01: Extract ONLY the scopes effectively granted by the token server (no permissive union with JWT claims)
      const grantedScopes = this.extractGrantedScopes(rawTokenJson.scope);
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

      let availabilityStatus: AiProviderProfile["availabilityStatus"] = hasRequiredPermissions
        ? "available"
        : "sin_permiso";
      let unavailableReason: string | undefined = hasRequiredPermissions
        ? undefined
        : "La cuenta o workspace de ChatGPT no otorgó los permisos obligatorios 'resource.invoke' y 'chatgpt.tokens.use.direct'. Proveedor no disponible.";

      let existingProfileToUpdate: AiProviderProfile | undefined;
      let previousProfileSnapshot: AiProviderProfile | undefined;
      let previousRawCredential: string | undefined;

      if (pending.profileId) {
        const existing = await this.profileManager.getProfile(pending.profileId);
        this.assertSessionActive(pending);

        if (!existing) {
          throw new AiDiagnosisSecurityError(
            "PROFILE_NOT_FOUND",
            `AI Profile '${pending.profileId}' not found.`,
          );
        }

        // R1-01: Validate identity BEFORE replacing credentials; refuse to overwrite a profile with a different account without explicit user selection
        if (existing.oauthSubject && existing.oauthSubject !== verifiedClaims.sub) {
          if (!pending.allowAccountOverwrite) {
            throw new AiDiagnosisSecurityError(
              "OPENAI_OAUTH_ACCOUNT_CHANGED",
              `El perfil '${existing.name}' pertenece a la cuenta '${existing.oauthSubject}', pero se autenticó una cuenta diferente ('${verifiedClaims.sub}'). No se sobrescribe el perfil existente sin selección explícita del usuario.`,
            );
          }
          this.onAccountChanged?.(existing.id, existing.oauthSubject, verifiedClaims.sub);
        }

        if (
          existing.oauthClientId &&
          existing.oauthClientId !== assignedClientId &&
          !pending.allowAccountOverwrite
        ) {
          throw new AiDiagnosisSecurityError(
            "OPENAI_OAUTH_INVALID_CLIENT_ID",
            `El client_id '${assignedClientId}' no coincide con el client_id '${existing.oauthClientId}' conservado para el perfil '${existing.name}'.`,
          );
        }

        previousProfileSnapshot = {
          ...existing,
          oauthScopes: existing.oauthScopes ? [...existing.oauthScopes] : undefined,
        };
        previousRawCredential = await this.profileManager.tryGetRawCredential(existing.id);
        this.assertSessionActive(pending);

        existingProfileToUpdate = existing;
      }

      // R1-02: Never choose 'gpt-4o' or any hardcoded model after login without validating it against the official '/v1/models' catalog
      let selectedModelSlug = PENDING_OPENAI_MODEL_SELECTION;
      let discoveredModels: OpenAiModelDescriptor[] | undefined;

      if (hasRequiredPermissions) {
        const discoveryAttempt = await this.tryFetchModelsWithAccessToken(
          accessToken,
          pending.inFlightAbortController.signal,
        );
        // R2-01: Revalidate session liveness immediately after async model discovery
        this.assertSessionActive(pending);

        if (discoveryAttempt.status === "ok") {
          discoveredModels = discoveryAttempt.models;
          if (discoveredModels.length === 0) {
            availabilityStatus = "no_models_available";
            unavailableReason =
              "El endpoint oficial '/v1/models' no devolvió modelos con visibility='list' habilitados para esta cuenta de ChatGPT.";
          } else {
            const candidateExistingModel = existingProfileToUpdate?.model;
            const existingStillValid =
              candidateExistingModel &&
              candidateExistingModel !== PENDING_OPENAI_MODEL_SELECTION &&
              discoveredModels.some(m => m.slug === candidateExistingModel);
            selectedModelSlug = existingStillValid
              ? candidateExistingModel!
              : discoveredModels[0].slug;
          }
        }
      }

      // R2-01 & R3-02: Coordinated commit with rollback/compensation if cancelled, expired, or disposed during storage.
      // R3-02: Keep pending.timeoutTimer active across the entire commit phase so a delayed/hung storage operation
      // still rejects waitForCompletion() promptly, closes the 127.0.0.1 listener, and releases pendingSessions.
      this.assertSessionActive(pending);
      pending.phase = "committing";

      const previousValidatedModels = existingProfileToUpdate
        ? this.validatedModelsByProfile.get(existingProfileToUpdate.id)
        : undefined;
      const previousSessionHint = existingProfileToUpdate
        ? this.accountSessionHintsByProfile.get(existingProfileToUpdate.id)
        : undefined;
      const preCommitProfileIds = existingProfileToUpdate
        ? new Set<string>()
        : new Set((await this.profileManager.listProfiles()).map(p => p.id));

      this.assertSessionActive(pending);

      let profile: AiProviderProfile;
      let createdProfileId: string | undefined;
      let rotatedCredentialRef: string | undefined;
      let mutatedExistingProfile = false;

      try {
        if (existingProfileToUpdate) {
          mutatedExistingProfile = true;
          rotatedCredentialRef = await this.profileManager.storeOrRotateCredential(
            existingProfileToUpdate.id,
            JSON.stringify(credentialBundle),
          );
          this.assertSessionActive(pending);

          profile = await this.profileManager.updateProfile(existingProfileToUpdate.id, {
            status: "active",
            model: selectedModelSlug,
            authMode: "oauth_siwc",
            endpoint: OPENAI_SIWC_RESPONSES_ENDPOINT,
            oauthSubject: verifiedClaims.sub,
            oauthClientId: assignedClientId,
            oauthScopes: grantedScopes,
            oauthExpiresAt: expiresAt,
            availabilityStatus,
            unavailableReason: unavailableReason ?? null,
          });
          this.assertSessionActive(pending);
        } else {
          const created = await this.profileManager.createProfile({
            name: pending.profileName,
            provider: "openai",
            model: selectedModelSlug,
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
          createdProfileId = created.id;
          this.assertSessionActive(pending);
          profile = created;
        }
      } catch (commitErr) {
        // R2-01, R3-01 & R3-02: Compensate / rollback any partial or completed vault/SQLite mutations,
        // ensuring that a requested or completed disconnection/revocation ALWAYS prevails over rollback.
        await this.compensateAbortedCommit({
          createdProfileId,
          preCommitProfileIds,
          expectedSubject: verifiedClaims.sub,
          expectedClientId: assignedClientId,
          mutatedExistingProfile,
          existingProfileToUpdate,
          previousProfileSnapshot,
          previousRawCredential,
          rotatedCredentialRef,
          previousValidatedModels,
          previousSessionHint,
          initialRevocationEpoch: pending.initialRevocationEpoch,
        });
        throw pending.terminationError ?? commitErr;
      }

      if (discoveredModels && discoveredModels.length > 0) {
        this.validatedModelsByProfile.set(profile.id, discoveredModels);
      } else {
        this.validatedModelsByProfile.delete(profile.id);
      }

      this.accountSessionHintsByProfile.set(profile.id, {
        clientId: assignedClientId,
        extAgentHostId: pending.extAgentHostId,
        idTokenHint: idToken,
      });

      pending.finalize(undefined, profile, { destroySocketsImmediately: false });
      if (pending.terminationError) {
        // If finalize detected a last-nanosecond timeout/abort/revocation, compensate immediately
        await this.compensateAbortedCommit({
          createdProfileId,
          preCommitProfileIds,
          expectedSubject: verifiedClaims.sub,
          expectedClientId: assignedClientId,
          mutatedExistingProfile,
          existingProfileToUpdate,
          previousProfileSnapshot,
          previousRawCredential,
          rotatedCredentialRef,
          previousValidatedModels,
          previousSessionHint,
          initialRevocationEpoch: pending.initialRevocationEpoch,
        });
        throw pending.terminationError;
      }

      return profile;
    } catch (err) {
      const errorObj =
        pending.terminationError ?? (err instanceof Error ? err : new Error(String(err)));
      pending.finalize(errorObj, undefined, { destroySocketsImmediately: false });
      throw pending.terminationError ?? errorObj;
    }
  }

  private async tryFetchModelsWithAccessToken(
    accessToken: string,
    signal?: AbortSignal,
  ): Promise<{ status: "ok"; models: OpenAiModelDescriptor[] } | { status: "unavailable" }> {
    try {
      const resp = await this.transport.execute({
        provider: "openai",
        endpoint: OPENAI_SIWC_MODELS_ENDPOINT,
        method: "GET",
        headers: {
          authorization: `Bearer ${accessToken}`,
          accept: "application/json",
        },
        timeoutMs: 10_000,
        signal,
      });

      const rawPayload = resp.json<unknown>();
      if (
        !rawPayload ||
        typeof rawPayload !== "object" ||
        Array.isArray(rawPayload) ||
        !Array.isArray((rawPayload as Record<string, unknown>).models)
      ) {
        return { status: "unavailable" };
      }

      const models = parseOfficialOpenAiModelsCatalog(rawPayload);
      return { status: "ok", models };
    } catch {
      return { status: "unavailable" };
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
    signal?: AbortSignal,
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

    const jwks = await this.getJwks(false, signal);
    let matchingKey = this.findMatchingJwk(jwks, kid, alg);

    if (!matchingKey) {
      // Refresh JWKS once in case keys rotated
      const refreshedJwks = await this.getJwks(true, signal);
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

    // Verify Audience (strictly against expected oaiapp_* client ID; never dynamic_agent_client)
    const allowedAud = expectations.expectedAud.filter(a => isValidOaiAppClientId(a));
    const audList = Array.isArray(claims.aud)
      ? claims.aud.filter((a): a is string => typeof a === "string")
      : typeof claims.aud === "string"
        ? [claims.aud]
        : [];

    const validAud = allowedAud.length > 0 && audList.some(aud => allowedAud.includes(aud));
    if (!validAud) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_JWT",
        "El claim 'aud' del ID token no coincide con el client_id 'oaiapp_*' emitido para esta cuenta.",
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

  private async getJwks(forceRefresh: boolean, signal?: AbortSignal): Promise<OpenAiJwksDocument> {
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
      signal,
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

  /**
   * Resolves the OAuth revocation endpoint via OIDC Discovery (`/.well-known/openid-configuration`),
   * enforcing that the discovered endpoint is HTTPS on `https://auth.openai.com`.
   */
  public async resolveRevocationEndpoint(forceRefresh = false): Promise<string> {
    const now = this.clockFn();
    if (
      !forceRefresh &&
      this.cachedDiscovery &&
      now - this.cachedDiscovery.fetchedAt < this.jwksCacheTtlMs &&
      typeof this.cachedDiscovery.doc.revocation_endpoint === "string"
    ) {
      return this.cachedDiscovery.doc.revocation_endpoint;
    }

    const resp = await this.transport.execute({
      provider: "openai",
      endpoint: OPENAI_SIWC_DISCOVERY_ENDPOINT,
      method: "GET",
      headers: {
        accept: "application/json",
      },
      timeoutMs: 10_000,
    });

    const doc = resp.json<OpenAiOidcDiscoveryDocument>();
    if (!doc || typeof doc !== "object" || doc.issuer !== OPENAI_SIWC_ISSUER) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_SESSION_INVALID",
        "El documento OIDC Discovery de OpenAI es inválido o su issuer no coincide con 'https://auth.openai.com'.",
      );
    }

    if (typeof doc.revocation_endpoint !== "string" || doc.revocation_endpoint.trim().length === 0) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_SESSION_INVALID",
        "El documento OIDC Discovery de OpenAI no contiene un 'revocation_endpoint' válido.",
      );
    }

    let parsedRevoke: URL;
    try {
      parsedRevoke = new URL(doc.revocation_endpoint);
    } catch {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_SESSION_INVALID",
        "El 'revocation_endpoint' anunciado en OIDC Discovery tiene un formato de URL inválido.",
      );
    }

    if (parsedRevoke.protocol !== "https:" || parsedRevoke.origin !== OPENAI_SIWC_ISSUER) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_SESSION_INVALID",
        `El 'revocation_endpoint' de OIDC Discovery debe pertenecer a '${OPENAI_SIWC_ISSUER}'.`,
      );
    }

    this.cachedDiscovery = { doc, fetchedAt: now };
    return parsedRevoke.toString();
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

  /**
   * R1-01: Extracts ONLY the scopes effectively granted by the OAuth token response (`scope` field),
   * never widening permissions through a permissive union with ID token claims.
   */
  public extractGrantedScopes(tokenResponseScope: unknown): string[] {
    if (typeof tokenResponseScope !== "string" || tokenResponseScope.trim().length === 0) {
      return [];
    }

    const scopeSet = new Set<string>();
    for (const s of tokenResponseScope.split(/\s+/)) {
      const trimmed = s.trim();
      if (trimmed) {
        scopeSet.add(trimmed);
      }
    }

    return Array.from(scopeSet);
  }

  public hasMandatorySiwcPermissions(scopes: readonly string[]): boolean {
    return REQUIRED_OPENAI_SIWC_SCOPES.every(reqScope => scopes.includes(reqScope));
  }

  /**
   * Returns a valid `access_token` for the OpenAI OAuth profile, performing a serialized
   * token refresh if expired or expiring within 30 seconds, including `resource=https://api.openai.com/v1`,
   * preserving the account-specific `oaiapp_*` client ID, and verifying identity BEFORE replacing credentials.
   */
  public async ensureValidAccessToken(profileId: string): Promise<string> {
    if (this.disconnectingProfiles.has(profileId)) {
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        "La cuenta de ChatGPT se encuentra en proceso de desconexión; inferencia bloqueada.",
      );
    }

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
    const initialRevocationEpoch = this.revocationEpochs.get(profileId) ?? 0;
    if (this.isProfileRevokedOrDisconnecting(profileId, initialRevocationEpoch)) {
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        "La cuenta de ChatGPT se encuentra en proceso de desconexión; inferencia bloqueada.",
      );
    }

    const profile = await this.profileManager.getProfile(profileId);
    if (!profile) {
      throw new AiDiagnosisSecurityError("PROFILE_INACTIVE", `El perfil '${profileId}' no existe.`);
    }

    if (
      profile.status !== "active" ||
      this.isProfileRevokedOrDisconnecting(profileId, initialRevocationEpoch)
    ) {
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

    // R1-01: Enforce account-specific oaiapp_* client ID
    const clientId = profile.oauthClientId || bundle.clientId;
    if (!isValidOaiAppClientId(clientId)) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_CLIENT_ID",
        "El perfil OAuth carece de un client_id específico de cuenta con formato 'oaiapp_*'.",
      );
    }

    if (profile.oauthClientId && bundle.clientId && profile.oauthClientId !== bundle.clientId) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_CLIENT_ID",
        "Discrepancia de client_id entre el perfil y el almacén cifrado de credenciales.",
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

    const refreshParams = new URLSearchParams();
    refreshParams.set("grant_type", "refresh_token");
    refreshParams.set("refresh_token", bundle.refreshToken);
    refreshParams.set("client_id", clientId);
    refreshParams.set("resource", OPENAI_SIWC_RESOURCE_URI);
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
    } catch {
      if (this.isProfileRevokedOrDisconnecting(profileId, initialRevocationEpoch)) {
        await this.enforceRevokedProfileState(profileId, [profile.credentialRef]);
        throw new AiDiagnosisSecurityError(
          "PROFILE_INACTIVE",
          "La cuenta de ChatGPT fue desconectada durante la renovación; inferencia bloqueada.",
        );
      }
      await this.profileManager.updateProfile(profileId, {
        availabilityStatus: "expired",
        unavailableReason: "Fallo al renovar el token OAuth de ChatGPT.",
      });
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_TOKEN_EXPIRED",
        "No se pudo renovar el token OAuth de ChatGPT. Inicie sesión nuevamente.",
      );
    }

    if (
      this.isProfileRevokedOrDisconnecting(profileId, initialRevocationEpoch) ||
      this.profileManager.isProfileRevoked(profileId)
    ) {
      await this.enforceRevokedProfileState(profileId, [profile.credentialRef]);
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        "La cuenta de ChatGPT fue desconectada durante la renovación; inferencia bloqueada.",
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

    if (
      typeof rawRefresh.client_id === "string" &&
      rawRefresh.client_id.trim().length > 0 &&
      rawRefresh.client_id.trim() !== clientId
    ) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_OAUTH_INVALID_CLIENT_ID",
        "El servidor devolvió un client_id distinto durante la renovación del token.",
      );
    }

    let verifiedSub = bundle.subject;
    let updatedScopes = bundle.scopes;

    if (typeof rawRefresh.id_token === "string" && rawRefresh.id_token.trim().length > 0) {
      const claims = await this.verifyIdTokenCryptographically(newIdToken, {
        expectedAud: [clientId],
      });
      verifiedSub = claims.sub;
    }

    if (
      this.isProfileRevokedOrDisconnecting(profileId, initialRevocationEpoch) ||
      this.profileManager.isProfileRevoked(profileId)
    ) {
      await this.enforceRevokedProfileState(profileId, [profile.credentialRef]);
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        "La cuenta de ChatGPT fue desconectada durante la renovación; inferencia bloqueada.",
      );
    }

    if (typeof rawRefresh.scope === "string") {
      // R1-01: Use only the scopes granted by the token server (no union with claims)
      updatedScopes = this.extractGrantedScopes(rawRefresh.scope);
    }

    if (typeof rawRefresh.sub === "string" && rawRefresh.sub.trim().length > 0) {
      verifiedSub = rawRefresh.sub.trim();
    }

    // R1-01: Validate identity BEFORE replacing credentials in vault
    const expectedProfileSub = profile.oauthSubject || bundle.subject;
    if (expectedProfileSub && verifiedSub !== expectedProfileSub) {
      this.onAccountChanged?.(profileId, expectedProfileSub, verifiedSub);
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
      clientId,
      updatedAt: this.clockFn(),
    };

    const rotatedRef = await this.profileManager.storeOrRotateCredential(
      profileId,
      JSON.stringify(updatedBundle),
    );
    if (
      this.isProfileRevokedOrDisconnecting(profileId, initialRevocationEpoch) ||
      this.profileManager.isProfileRevoked(profileId)
    ) {
      await this.enforceRevokedProfileState(profileId, [profile.credentialRef, rotatedRef]);
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        "La cuenta de ChatGPT fue desconectada durante la renovación; inferencia bloqueada.",
      );
    }

    await this.profileManager.updateProfile(profileId, {
      oauthSubject: verifiedSub,
      oauthClientId: clientId,
      oauthScopes: updatedScopes,
      oauthExpiresAt: newExpiresAt,
      availabilityStatus: "available",
      unavailableReason: null,
    });
    if (
      this.isProfileRevokedOrDisconnecting(profileId, initialRevocationEpoch) ||
      this.profileManager.isProfileRevoked(profileId)
    ) {
      await this.enforceRevokedProfileState(profileId, [profile.credentialRef, rotatedRef]);
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        "La cuenta de ChatGPT fue desconectada durante la renovación; inferencia bloqueada.",
      );
    }

    this.accountSessionHintsByProfile.set(profileId, {
      clientId,
      extAgentHostId,
      idTokenHint: newIdToken,
    });

    return newAccessToken;
  }

  /**
   * Disconnects the OpenAI OAuth account:
   * - Immediately blocks inference (`disconnectingProfiles`), increments `revocationEpochs`, terminates any pending
   *   OAuth sessions for the profile, invalidates active consent tokens, and purges local vault credentials (`SecureCredentialVault`).
   * - Resolves the revocation endpoint via OIDC Discovery and sends `token_type_hint=refresh_token` when revoking a refresh token.
   * - If remote revocation fails or cannot be confirmed, keeps local credentials safely purged and explicitly reports that remote revocation could not be confirmed.
   */
  public async disconnectAndRevoke(profileId: string): Promise<AiProviderProfile> {
    this.disconnectingProfiles.add(profileId);
    this.revocationEpochs.set(profileId, (this.revocationEpochs.get(profileId) ?? 0) + 1);

    for (const pending of Array.from(this.pendingSessions.values())) {
      if (pending.profileId === profileId) {
        pending.finalize(
          new AiDiagnosisSecurityError(
            "ERR_ABORTED",
            "Flujo OAuth cancelado por desconexión y revocación del perfil.",
          ),
        );
      }
    }

    try {
      const profile = await this.profileManager.getProfile(profileId);
      if (!profile) {
        throw new Error(`AI Profile '${profileId}' not found.`);
      }

      let tokenToRevoke: string | undefined;
      let tokenTypeHint: "refresh_token" | "access_token" | undefined;
      let clientId = profile.oauthClientId;
      let extAgentHostId = this.accountSessionHintsByProfile.get(profileId)?.extAgentHostId;

      try {
        const rawSecret = await this.profileManager.tryGetRawCredential(profileId);
        if (rawSecret) {
          const bundle = JSON.parse(rawSecret) as OpenAiOAuthCredentialBundle;
          if (bundle.refreshToken && bundle.refreshToken.trim().length > 0) {
            tokenToRevoke = bundle.refreshToken.trim();
            tokenTypeHint = "refresh_token";
          } else if (bundle.accessToken && bundle.accessToken.trim().length > 0) {
            tokenToRevoke = bundle.accessToken.trim();
            tokenTypeHint = "access_token";
          }
          if (!clientId && bundle.clientId) {
            clientId = bundle.clientId;
          }
          if (bundle.extAgentHostId) {
            extAgentHostId = bundle.extAgentHostId;
          }
        }
      } catch {
        // Proceed with local purge even if vault decryption fails
      }

      // Preserve account clientId & extAgentHostId if valid, while clearing idTokenHint upon sign-out
      if (isValidOaiAppClientId(clientId)) {
        this.accountSessionHintsByProfile.set(profileId, {
          clientId,
          extAgentHostId: extAgentHostId || this.profileManager.getOrCreateInstallationHostId(),
          idTokenHint: undefined,
        });
      } else {
        this.accountSessionHintsByProfile.delete(profileId);
      }

      // Immediately purge local credentials and mark profile revoked BEFORE awaiting remote revocation so inference is blocked throughout
      const interimReason = "Desconectando cuenta de ChatGPT y revocando sesión...";
      this.revokedReasonByProfile.set(profileId, interimReason);
      this.validatedModelsByProfile.delete(profileId);
      await this.profileManager.enforceRevokedState(profileId, interimReason, [profile.credentialRef]);
      this.onSessionRevoked?.(profileId);

      let remoteRevocationConfirmed = false;
      if (tokenToRevoke && isValidOaiAppClientId(clientId)) {
        try {
          const revocationEndpoint = await this.resolveRevocationEndpoint();
          const revokeParams = new URLSearchParams();
          revokeParams.set("token", tokenToRevoke);
          revokeParams.set("client_id", clientId);
          if (tokenTypeHint === "refresh_token") {
            revokeParams.set("token_type_hint", "refresh_token");
          } else if (tokenTypeHint === "access_token") {
            revokeParams.set("token_type_hint", "access_token");
          }

          const revokeResp = await this.transport.execute({
            provider: "openai",
            endpoint: revocationEndpoint,
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              accept: "application/json",
            },
            body: revokeParams.toString(),
            timeoutMs: 10_000,
            maxRetries: 0,
          });

          if (revokeResp.status >= 200 && revokeResp.status < 300) {
            remoteRevocationConfirmed = true;
          }
        } catch {
          remoteRevocationConfirmed = false;
        }
      }

      const finalReason = remoteRevocationConfirmed
        ? "Cuenta de ChatGPT desconectada y credenciales locales eliminadas."
        : "Cuenta de ChatGPT desconectada y credenciales locales eliminadas de forma segura. Advertencia: la revocación remota no pudo confirmarse.";

      this.revokedReasonByProfile.set(profileId, finalReason);
      await this.profileManager.enforceRevokedState(profileId, finalReason, [profile.credentialRef]);
      const updated = (await this.profileManager.getProfile(profileId))!;

      return {
        ...updated,
        remoteRevocationConfirmed,
      };
    } finally {
      this.disconnectingProfiles.delete(profileId);
    }
  }

  /**
   * Queries the official OpenAI models endpoint (`GET https://api.openai.com/v1/models`)
   * using the authorized OAuth access token.
   * - Parses `models[]` (`slug`, `display_name`, `visibility`).
   * - Strictly filters `visibility === "list"`.
   * - Preserves server order.
   * - Rejects malformed catalogs.
   */
  public async fetchAvailableModels(profileId: string): Promise<OpenAiModelDescriptor[]> {
    if (this.disconnectingProfiles.has(profileId)) {
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        "La cuenta de ChatGPT se encuentra en proceso de desconexión; inferencia bloqueada.",
      );
    }

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

    const payload = resp.json<unknown>();
    const eligibleModels = parseOfficialOpenAiModelsCatalog(payload);

    if (eligibleModels.length === 0) {
      this.validatedModelsByProfile.delete(profileId);
      await this.profileManager.updateProfile(profileId, {
        availabilityStatus: "no_models_available",
        unavailableReason:
          "El endpoint oficial '/v1/models' no devolvió modelos compatibles con visibility='list' para esta cuenta de ChatGPT.",
      });
      throw new AiDiagnosisSecurityError(
        "OPENAI_MODELS_UNAVAILABLE",
        "No hay modelos disponibles para la cuenta de ChatGPT autorizada.",
      );
    }

    this.validatedModelsByProfile.set(profileId, eligibleModels);

    const profile = await this.profileManager.getProfile(profileId);
    if (profile) {
      const currentModelValid =
        profile.model !== PENDING_OPENAI_MODEL_SELECTION &&
        eligibleModels.some(m => m.slug === profile.model);
      await this.profileManager.updateProfile(profileId, {
        model: currentModelValid ? profile.model : eligibleModels[0].slug,
        availabilityStatus: "available",
        unavailableReason: null,
      });
    }

    return eligibleModels;
  }

  /**
   * Ensures that a profile's selected model has been validated against the official `/v1/models`
   * catalog (`models[]` with `visibility === "list"`) and returns the validated `slug` for inference.
   */
  public async ensureValidatedModelForProfile(
    profileId: string,
    requestedModel?: string,
  ): Promise<string> {
    if (this.disconnectingProfiles.has(profileId)) {
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        "La cuenta de ChatGPT se encuentra en proceso de desconexión; inferencia bloqueada.",
      );
    }

    let catalog = this.validatedModelsByProfile.get(profileId);
    if (!catalog || catalog.length === 0) {
      catalog = await this.fetchAvailableModels(profileId);
    }

    const profile = await this.profileManager.getProfile(profileId);
    const effectiveModel =
      requestedModel && requestedModel !== PENDING_OPENAI_MODEL_SELECTION
        ? requestedModel
        : profile?.model;

    if (!effectiveModel || effectiveModel === PENDING_OPENAI_MODEL_SELECTION) {
      const firstSlug = catalog[0].slug;
      await this.profileManager.updateProfile(profileId, {
        model: firstSlug,
      });
      return firstSlug;
    }

    const matched = catalog.find(m => m.slug === effectiveModel);
    if (!matched) {
      throw new AiDiagnosisSecurityError(
        "OPENAI_MODELS_UNAVAILABLE",
        `El modelo '${effectiveModel}' no figura en el catálogo oficial de modelos habilitados ('visibility === "list"') para esta cuenta de ChatGPT.`,
      );
    }

    return matched.slug;
  }
}
