/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type { IncidentRepository } from "../incident-storage/incident-repository";
import type { EvidenceRepository } from "../incident-storage/evidence-repository";
import type { AiProfileManager } from "./ai-profile-manager";
import type { AiDiagnosisRepository } from "./ai-diagnosis-repository";
import type { AiBudgetTracker } from "./ai-budget-tracker";
import type { EvidenceSnippet } from "../../common/incident/incident-types";
import type {
  AiDiagnosisReport,
  DiagnosisConsentPreview,
  AiDiagnosisFact,
  AiDiagnosisHypothesis,
  AiRemediationProposal,
} from "../../common/incident/ai-diagnosis-types";
import {
  type AiProviderAdapter,
  createAiProviderAdapter,
} from "./providers/ai-provider-adapter";
import {
  DEEPSEEK_EXCLUSIVE_ENDPOINT,
  type AiProfile,
  type AiProviderType,
  type DeepSeekModelId,
  type DeepSeekPricingConfig,
} from "../../common/incident/ai-profile-types";

import type { EphemeralContextManager } from "./ephemeral-context-manager";
import type { EphemeralContextPreviewItem } from "../../common/incident/ephemeral-context-types";
import { EvidenceSanitizer } from "../incident-storage/evidence-sanitizer";

import type { SecureAiTransport } from "./transport/ai-transport-types";
import type { OpenAiSiwcOAuthManager } from "./oauth/openai-siwc-oauth-manager";
import { AiDiagnosisSecurityError } from "./ai-diagnosis-errors";
export { AiDiagnosisSecurityError } from "./ai-diagnosis-errors";

interface EphemeralConsent {
  token: string;
  incidentId: string;
  clusterId: string;
  namespace: string;
  profileId: string;
  operationId: string;
  issuedAt: number;
  expiresAt: number;
  evidenceIds: string[];
  evidenceFingerprintHash: string;
  provider: AiProviderType;
  model: string;
  endpoint: string;
  oauthSubject?: string;
  totalBytes: number;
  maxTokens: number;
}

export interface DiagnosisEngineOptions {
  consentTtlMs?: number;
  defaultTimeoutMs?: number;
  transport?: SecureAiTransport;
  oauthManager?: OpenAiSiwcOAuthManager;
  deepseekPricing?: Partial<Record<DeepSeekModelId, DeepSeekPricingConfig>>;
}

const SAFE_IDENTIFIER_REGEX = /^[A-Za-z0-9_\-:]{1,64}$/;

function isSafeIdentifier(id: unknown): id is string {
  return typeof id === "string" && SAFE_IDENTIFIER_REGEX.test(id);
}

export class AiDiagnosisEngine {
  private readonly consentTokens = new Map<string, EphemeralConsent>();
  private readonly activeAbortControllers = new Map<string, Set<AbortController>>();
  private readonly consentTtlMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly ephemeralContextManager?: EphemeralContextManager;
  private readonly transport?: SecureAiTransport;
  private oauthManager?: OpenAiSiwcOAuthManager;
  private deepseekPricing?: Partial<Record<DeepSeekModelId, DeepSeekPricingConfig>>;
  private mockAdapterOverride?: AiProviderAdapter;

  constructor(
    private readonly incidentRepo: IncidentRepository,
    private readonly evidenceRepo: EvidenceRepository,
    private readonly profileManager: AiProfileManager,
    private readonly diagnosisRepo: AiDiagnosisRepository,
    private readonly budgetTracker: AiBudgetTracker,
    optionsOrContextManager?: DiagnosisEngineOptions | EphemeralContextManager,
    maybeOptions?: DiagnosisEngineOptions,
  ) {
    let options: DiagnosisEngineOptions | undefined;

    if (optionsOrContextManager && typeof (optionsOrContextManager as any).computeContextFingerprint === "function") {
      this.ephemeralContextManager = optionsOrContextManager as EphemeralContextManager;
      options = maybeOptions;
    } else {
      options = optionsOrContextManager as DiagnosisEngineOptions | undefined;
    }

    this.consentTtlMs = options?.consentTtlMs ?? 5 * 60 * 1000; // 5 minutes default
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 15 * 1000; // 15 seconds default
    this.transport = options?.transport;
    this.deepseekPricing = options?.deepseekPricing;

    if (options?.oauthManager) {
      this.setOAuthManager(options.oauthManager);
    }
  }

  public setOAuthManager(oauthManager: OpenAiSiwcOAuthManager | undefined): void {
    this.oauthManager = oauthManager;
    if (this.oauthManager) {
      this.oauthManager.setLifecycleCallbacks({
        onAccountChanged: (profileId: string) => {
          this.revokeConsentsForProfile(profileId);
        },
        onSessionRevoked: (profileId: string) => {
          this.revokeConsentsForProfile(profileId);
        },
      });
    }
  }

  public getOAuthManager(): OpenAiSiwcOAuthManager | undefined {
    return this.oauthManager;
  }

  public setDeepSeekPricing(pricing: Partial<Record<DeepSeekModelId, DeepSeekPricingConfig>>): void {
    this.deepseekPricing = pricing;
  }

  public setMockAdapterOverride(mock: AiProviderAdapter | undefined): void {
    this.mockAdapterOverride = mock;
  }

  private validateProviderEligibility(profile: AiProfile): void {
    if (profile.provider === "mock") {
      return;
    }

    // Anthropic and Gemini remain disabled in H8.8-03
    if (profile.provider === "anthropic" || profile.provider === "gemini") {
      throw new AiDiagnosisSecurityError(
        "EXTERNAL_PROVIDER_DISABLED",
        `El proveedor externo '${profile.provider}' permanece deshabilitado en H8.8-03. Utilice OpenAI (ChatGPT OAuth), DeepSeek (API key) o Mock.`,
      );
    }

    if (profile.provider === "openai") {
      // OpenAI via API key is NOT allowed as the primary mechanism; must be Sign in with ChatGPT (OAuth)
      if (profile.authMode !== "oauth_siwc" || !this.oauthManager || !this.transport) {
        throw new AiDiagnosisSecurityError(
          "EXTERNAL_PROVIDER_DISABLED",
          "El acceso directo a OpenAI por API key está deshabilitado. Debe conectar su cuenta mediante Sign in with ChatGPT (OAuth oficial).",
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
            "No hay modelos disponibles para la cuenta de ChatGPT autorizada.",
        );
      }

      if (
        profile.availabilityStatus === "disconnected" ||
        profile.availabilityStatus === "expired"
      ) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_SESSION_INVALID",
          profile.unavailableReason ||
            "La sesión OAuth de ChatGPT no está activa o ha expirado.",
        );
      }

      return;
    }

    if (profile.provider === "deepseek") {
      if (!this.transport) {
        throw new AiDiagnosisSecurityError(
          "EXTERNAL_PROVIDER_DISABLED",
          "El proveedor DeepSeek requiere transporte seguro configurado.",
        );
      }

      if (profile.endpoint !== DEEPSEEK_EXCLUSIVE_ENDPOINT) {
        throw new AiDiagnosisSecurityError(
          "ERR_PAYLOAD_VALIDATION",
          `DeepSeek requiere exclusivamente el endpoint '${DEEPSEEK_EXCLUSIVE_ENDPOINT}'.`,
        );
      }

      return;
    }

    throw new AiDiagnosisSecurityError(
      "EXTERNAL_PROVIDER_DISABLED",
      `Proveedor '${profile.provider}' no habilitado.`,
    );
  }

  /**
   * Computes an immutable cryptographic fingerprint across an incident's sanitized evidences
   * and any active ephemeral manual context files (H8.3.1 & H8.4).
   */
  public computeEvidenceFingerprint(evidences: EvidenceSnippet[], incidentId?: string): {
    hash: string;
    ids: string[];
    totalBytes: number;
    manualContextCount: number;
    manualContextBytes: number;
  } {
    const sorted = [...evidences].sort((a, b) => a.id.localeCompare(b.id));
    const hasher = crypto.createHash("sha256");
    let evidenceBytes = 0;

    for (const ev of sorted) {
      const bLen = ev.snippetBytes || Buffer.byteLength(ev.contentSnippet, "utf8");
      evidenceBytes += bLen;
      hasher.update(
        `${ev.id}|${ev.sha256Hash}|${bLen}|${ev.resourceKind ?? ""}|${ev.resourceName ?? ""}|${ev.resourceVersion ?? ""}`,
      );
    }

    const evidenceHash = hasher.digest("hex");
    let manualContextFp = { hash: "", fileIds: [] as string[], totalBytes: 0, count: 0 };

    if (incidentId && this.ephemeralContextManager) {
      manualContextFp = this.ephemeralContextManager.computeContextFingerprint(incidentId);
    }

    const combinedHasher = crypto.createHash("sha256");
    combinedHasher.update(`EVD:${evidenceHash}|CTX:${manualContextFp.hash}`);
    const combinedHash = combinedHasher.digest("hex");

    return {
      hash: combinedHash,
      ids: [...sorted.map(e => e.id), ...manualContextFp.fileIds],
      totalBytes: evidenceBytes + manualContextFp.totalBytes,
      manualContextCount: manualContextFp.count,
      manualContextBytes: manualContextFp.totalBytes,
    };
  }

  /**
   * Generates a preview with evidence inventory, cryptographic fingerprint and ephemeral consent token (H8-015 & H8.3.1).
   */
  public async prepareConsentPreview(
    incidentId: string,
    profileId: string,
  ): Promise<DiagnosisConsentPreview> {
    const incident = this.incidentRepo.getIncidentById(incidentId);

    if (!incident) {
      throw new AiDiagnosisSecurityError("INCIDENT_NOT_FOUND", `Incidente '${incidentId}' no existe.`);
    }

    if (incident.status === "CERRADO" || incident.status === "NO CONFIRMADO") {
      throw new AiDiagnosisSecurityError(
        "INCIDENT_CLOSED",
        `No se puede generar consentimiento para el incidente '${incidentId}' porque se encuentra en estado '${incident.status}'.`,
      );
    }

    const profile = await this.profileManager.getProfile(profileId);

    if (!profile) {
      throw new AiDiagnosisSecurityError("PROFILE_NOT_FOUND", `Perfil IA '${profileId}' no existe.`);
    }

    if (profile.status !== "active") {
      throw new AiDiagnosisSecurityError(
        "PROFILE_INACTIVE",
        `El perfil IA '${profile.name}' no está activo (estado: ${profile.status}).`,
      );
    }

    // H8.8-03: Validate provider eligibility (OpenAI OAuth SIWC, DeepSeek API key, Mock; Anthropic/Gemini disabled)
    this.validateProviderEligibility(profile);

    const evidences = this.evidenceRepo.listEvidenceByIncident(incidentId);
    const fingerprint = this.computeEvidenceFingerprint(evidences, incidentId);

    const evidenceItems = evidences.map(e => {
      const byteLength = e.snippetBytes || Buffer.byteLength(e.contentSnippet, "utf8");
      const redactionMatches = e.contentSnippet.match(/\[REDACTED_[A-Z0-9_]+\]/g) || [];

      return {
        id: e.id,
        type: e.type,
        resourceKind: e.resourceKind,
        resourceName: e.resourceName,
        byteLength,
        isSanitized: true,
        redactionsCount: redactionMatches.length,
      };
    });

    let manualContextItems: EphemeralContextPreviewItem[] = [];
    if (this.ephemeralContextManager) {
      const manualFiles = this.ephemeralContextManager.listFiles(incidentId);
      manualContextItems = manualFiles.map(f => ({
        id: f.id,
        filename: f.filename,
        fileType: f.fileType,
        byteLength: f.byteLength,
        sha256Hash: f.sha256Hash,
        redactedFindingsCount: f.redactedFindingsCount,
        declaredEnvironment: f.metadata.environment,
        declaredResourceName: f.metadata.resourceName,
      }));
    }

    const issuedAt = Date.now();
    const consentToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = issuedAt + this.consentTtlMs;
    const operationId = `OP-${crypto.randomUUID()}`;

    // Inmovilizar metadatos inmutables vinculados al token (H8.8-02-01)
    this.consentTokens.set(consentToken, {
      token: consentToken,
      incidentId,
      clusterId: incident.clusterId,
      namespace: incident.namespace,
      profileId,
      operationId,
      issuedAt,
      expiresAt,
      evidenceIds: fingerprint.ids,
      evidenceFingerprintHash: fingerprint.hash,
      provider: profile.provider,
      model: profile.model,
      endpoint: profile.endpoint,
      oauthSubject: profile.oauthSubject,
      totalBytes: fingerprint.totalBytes,
      maxTokens: profile.maxTokensPerRequest,
    });

    return {
      incidentId,
      clusterId: incident.clusterId,
      namespace: incident.namespace,
      title: incident.title,
      targetProvider: profile.provider,
      model: profile.model,
      endpoint: profile.endpoint,
      operationId,
      issuedAt,
      evidencesCount: evidences.length,
      totalBytes: fingerprint.totalBytes,
      evidenceItems,
      manualContextCount: fingerprint.manualContextCount,
      manualContextBytes: fingerprint.manualContextBytes,
      manualContextItems,
      consentToken,
      expiresAt,
    };
  }

  /**
   * Revokes an active ephemeral consent token immediately.
   */
  public revokeConsent(token: string): boolean {
    return this.consentTokens.delete(token);
  }

  /**
   * Revokes all active ephemeral consent tokens issued for a specific incident.
   */
  public revokeConsentsForIncident(incidentId: string): number {
    let count = 0;
    for (const [token, consent] of this.consentTokens.entries()) {
      if (consent.incidentId === incidentId) {
        this.consentTokens.delete(token);
        count++;
      }
    }
    return count;
  }

  /**
   * Revokes all active ephemeral consent tokens issued for a specific cluster.
   */
  public revokeConsentsForCluster(clusterId: string): number {
    let count = 0;
    for (const [token, consent] of this.consentTokens.entries()) {
      if (consent.clusterId === clusterId) {
        this.consentTokens.delete(token);
        count++;
      }
    }
    return count;
  }

  /**
   * Revokes all active ephemeral consent tokens issued for a specific AI profile
   * (e.g., when an OAuth account is switched or disconnected).
   */
  public revokeConsentsForProfile(profileId: string): number {
    let count = 0;
    for (const [token, consent] of this.consentTokens.entries()) {
      if (consent.profileId === profileId) {
        this.consentTokens.delete(token);
        count++;
      }
    }
    return count;
  }

  /**
   * Aborts and cancels all in-flight AI diagnosis executions for a given incident.
   */
  public cancelPendingDiagnoses(incidentId: string): void {
    const controllers = this.activeAbortControllers.get(incidentId);
    if (controllers) {
      for (const ctrl of controllers) {
        try {
          ctrl.abort();
        } catch {
          // ignore
        }
      }
      controllers.clear();
      this.activeAbortControllers.delete(incidentId);
    }
  }

  /**
   * Strict post-model output sanitization helper.
   * Ensures no model-generated hallucinations or reflections leak credentials,
   * tokens or sensitive keys into the SQLite database or renderer IPC.
   */
  private sanitizeOutputText(input: string): string {
    if (typeof input !== "string" || input.length === 0) {
      return input;
    }
    try {
      return EvidenceSanitizer.sanitize(input).sanitizedContent;
    } catch {
      return "[REDACTED_CONTENT]";
    }
  }

  /**
   * Executes AI diagnostic inference with consent enforcement, immutable evidence re-validation,
   * strict citation verification, budget limits, and strict read-only invariants (H8-015 .. H8.3.1).
   */
  public async executeDiagnosis(
    incidentId: string,
    profileId: string,
    consentToken: string,
    options?: { timeoutMs?: number; signal?: AbortSignal; operationId?: string },
  ): Promise<AiDiagnosisReport> {
    // 1. Verify and consume ephemeral consent token
    const consent = this.consentTokens.get(consentToken);

    if (!consent) {
      throw new AiDiagnosisSecurityError(
        "INVALID_CONSENT_TOKEN",
        "Token de consentimiento no válido o inexistente. Se requiere vista previa de consentimiento previa.",
      );
    }

    this.consentTokens.delete(consentToken); // Single-use consumption

    const operationId = options?.operationId || consent.operationId || `OP-${crypto.randomUUID()}`;
    let wasDispatched = false;
    let reservationCreated = false;
    let abortController: AbortController | undefined;
    let abortListener: (() => void) | undefined;
    let incidentControllers: Set<AbortController> | undefined;

    try {
      if (consent.expiresAt < Date.now()) {
        throw new AiDiagnosisSecurityError(
          "EXPIRED_CONSENT_TOKEN",
          "El token de consentimiento ha expirado. Genere una nueva vista previa antes de ejecutar.",
        );
      }

      if (consent.incidentId !== incidentId || consent.profileId !== profileId) {
        throw new AiDiagnosisSecurityError(
          "CONSENT_SCOPE_MISMATCH",
          "El token de consentimiento no corresponde al caso o perfil solicitado.",
        );
      }

      // 2. Re-verify Incident & Profile Integrity
      const incident = this.incidentRepo.getIncidentById(incidentId);

      if (!incident) {
        throw new AiDiagnosisSecurityError("INCIDENT_NOT_FOUND", `Incidente '${incidentId}' no existe.`);
      }

      if (incident.status === "CERRADO" || incident.status === "NO CONFIRMADO") {
        throw new AiDiagnosisSecurityError(
          "INCIDENT_CLOSED",
          `No se puede ejecutar diagnóstico para el incidente '${incidentId}' porque se encuentra en estado '${incident.status}'.`,
        );
      }

      if (incident.clusterId !== consent.clusterId || incident.namespace !== consent.namespace) {
        throw new AiDiagnosisSecurityError(
          "CONSENT_SCOPE_MISMATCH",
          `El alcance del incidente (${incident.clusterId}/${incident.namespace}) no coincide con el consentimiento (${consent.clusterId}/${consent.namespace}).`,
        );
      }

      const profile = await this.profileManager.getProfile(profileId);

      if (!profile) {
        throw new AiDiagnosisSecurityError("PROFILE_NOT_FOUND", `Perfil IA '${profileId}' no existe.`);
      }

      if (profile.status !== "active") {
        throw new AiDiagnosisSecurityError(
          "PROFILE_INACTIVE",
          `El perfil IA '${profile.name}' no está activo (estado: ${profile.status}).`,
        );
      }

      // Profile parameters must not have changed since consent preview
      if (
        profile.provider !== consent.provider ||
        profile.model !== consent.model ||
        profile.endpoint !== consent.endpoint
      ) {
        throw new AiDiagnosisSecurityError(
          "CONSENT_PROFILE_ALTERED",
          "La configuración del perfil IA (proveedor, modelo o endpoint) fue alterada tras el consentimiento. Se requiere nueva autorización.",
        );
      }

      if (consent.oauthSubject && profile.oauthSubject !== consent.oauthSubject) {
        throw new AiDiagnosisSecurityError(
          "OPENAI_OAUTH_ACCOUNT_CHANGED",
          "La cuenta OAuth de ChatGPT asociada al perfil cambió tras generar el consentimiento. Se requiere nueva autorización explícita.",
        );
      }

      // H8.8-03: Validate provider eligibility and disallow automatic provider failover
      this.validateProviderEligibility(profile);

      // 3. Immutable Evidence & Manual Context Re-Validation (H8.3.1 Gate Item 4 & H8.4)
      const currentEvidences = this.evidenceRepo.listEvidenceByIncident(incidentId);
      const currentFingerprint = this.computeEvidenceFingerprint(currentEvidences, incidentId);

      if (currentFingerprint.hash !== consent.evidenceFingerprintHash) {
        throw new AiDiagnosisSecurityError(
          "CONSENT_EVIDENCE_MISMATCH",
          "El conjunto o contenido de evidencias o contexto manual del caso fue modificado tras generar el consentimiento. Se requiere nueva autorización.",
        );
      }

      // 4. Reserve Budget atomically in SQLite (H8.8-02-04)
      this.budgetTracker.reserveBudget({
        incidentId,
        profile,
        clusterId: incident.clusterId,
        namespace: incident.namespace,
        operationId,
      });
      reservationCreated = true;

      // Setup cancellation / abort controller tracking
      abortController = new AbortController();
      if (options?.signal) {
        if (options.signal.aborted) {
          abortController.abort();
        } else {
          abortListener = () => abortController?.abort();
          options.signal.addEventListener("abort", abortListener, { once: true });
        }
      }
      incidentControllers = this.activeAbortControllers.get(incidentId);
      if (!incidentControllers) {
        incidentControllers = new Set();
        this.activeAbortControllers.set(incidentId, incidentControllers);
      }
      incidentControllers.add(abortController);

      if (abortController.signal.aborted) {
        throw new Error("Diagnosis execution aborted before start");
      }

      const executedAt = new Date().toISOString();
      const diagnosisId = `DIAG-${crypto.randomUUID()}`;
      const manualContexts = this.ephemeralContextManager?.getFilesForDiagnosis(incidentId) || [];

      // 5. Fail-closed: zero evidence AND zero manual context -> immediate INCONCLUSO without calling model (H8-015 & H8.4)
      if (currentEvidences.length === 0 && manualContexts.length === 0) {
        const emptyReport: AiDiagnosisReport = {
          id: diagnosisId,
          incidentId,
          profileId,
          provider: profile.provider,
          model: profile.model,
          status: "INCONCLUSO",
          inconclusiveReason:
            "No hay evidencias recolectadas ni contexto manual aportado para este caso. Se requieren logs, eventos o archivos antes de realizar un diagnóstico.",
          facts: [],
          hypotheses: [],
          contradictions: [],
          missingInformation: ["Logs del pod o contenedor", "Eventos de Kubernetes en el namespace"],
          recommendedNextSteps: [
            "Capturar logs del workload afectado con el broker de evidencias",
            "Ingestar eventos recientes del clúster",
            "Adjuntar archivos de contexto (Dockerfile, values.yaml) en Incident Workbench",
          ],
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          estimatedCost: 0.0,
          executedAt,
        };

        this.diagnosisRepo.saveDiagnosis(emptyReport);
        this.budgetTracker.markCompleted(operationId, emptyReport.tokenUsage, 0.0, diagnosisId);

        this.incidentRepo.addTimelineEntry({
          incidentId,
          authorType: "ai",
          authorName: `AI Diagnostic Engine (${profile.model})`,
          message: "Diagnóstico IA INCONCLUSO: sin evidencias ni contexto técnico en el caso.",
          metadata: {
            diagnosisId,
            status: "INCONCLUSO",
            reason: emptyReport.inconclusiveReason,
          },
        });

        return emptyReport;
      }

      // Evidence Minimization & Redaction Defense-in-Depth (H8.8-02-02 & R1-03)
      // 1. Exclude forbidden kinds (Secret, ServiceAccount)
      const sanitizedEvidences = currentEvidences.filter(e => {
        if (!e.resourceKind) return true;
        const k = e.resourceKind.toLowerCase().trim();
        return !["secret", "serviceaccount", "secrets", "serviceaccounts"].includes(k);
      });

      // 2. Cap count at 50
      const MAX_EVIDENCE_COUNT = 50;
      const cappedEvidences = sanitizedEvidences.slice(0, MAX_EVIDENCE_COUNT);

      // 3. Cap total serialized request payload strictly within 192 KiB (196,608 bytes)
      // Allocate 4 KiB overhead margin for incident metadata, options, and JSON envelope
      const MAX_REQUEST_PAYLOAD_BYTES = 192 * 1024;
      const ENVELOPE_OVERHEAD_MARGIN = 4096;
      let remainingContentBudget = MAX_REQUEST_PAYLOAD_BYTES - ENVELOPE_OVERHEAD_MARGIN;

      // Bound manual contexts (up to 64 KiB or remaining content budget)
      const MAX_MANUAL_CONTEXT_BUDGET = 64 * 1024;
      const boundedManualContexts: typeof manualContexts = [];
      let accumulatedManualBytes = 0;

      for (const m of manualContexts) {
        const mBytes = Buffer.byteLength(m.sanitizedContent, "utf8");
        if (accumulatedManualBytes + mBytes <= MAX_MANUAL_CONTEXT_BUDGET && accumulatedManualBytes + mBytes <= remainingContentBudget) {
          boundedManualContexts.push(m);
          accumulatedManualBytes += mBytes;
        } else {
          const rem = Math.min(MAX_MANUAL_CONTEXT_BUDGET - accumulatedManualBytes, remainingContentBudget - accumulatedManualBytes);
          if (rem > 100) {
            boundedManualContexts.push({
              ...m,
              sanitizedContent: m.sanitizedContent.slice(0, rem - 25) + "\n[CONTEXT_TRUNCATED]",
            });
            accumulatedManualBytes += rem;
          }
          break;
        }
      }
      remainingContentBudget -= accumulatedManualBytes;

      let accumulatedEvidenceBytes = 0;
      const boundedEvidences: EvidenceSnippet[] = [];

      for (const ev of cappedEvidences) {
        const bytes = ev.snippetBytes || Buffer.byteLength(ev.contentSnippet, "utf8");
        if (accumulatedEvidenceBytes + bytes <= remainingContentBudget) {
          boundedEvidences.push(ev);
          accumulatedEvidenceBytes += bytes;
        } else {
          const remaining = remainingContentBudget - accumulatedEvidenceBytes;
          if (remaining > 100) {
            const truncatedSnippet = ev.contentSnippet.slice(0, remaining - 25) + "\n[PAYLOAD_TRUNCATED]";
            boundedEvidences.push({
              ...ev,
              contentSnippet: truncatedSnippet,
              snippetBytes: Buffer.byteLength(truncatedSnippet, "utf8"),
            });
            accumulatedEvidenceBytes = remainingContentBudget;
          }
          break;
        }
      }

      // 6. Invoke Adapter (strictly bound to consented profile; never auto-failover to another provider)
      const adapter: AiProviderAdapter = createAiProviderAdapter(
        profile,
        this.mockAdapterOverride,
        this.transport,
        {
          oauthManager: this.oauthManager,
          profileManager: this.profileManager,
          deepseekPricing: this.deepseekPricing,
        },
      );
      const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

      const rawResult = await adapter.generateDiagnosis(
        { incident, evidences: boundedEvidences, manualContexts: boundedManualContexts },
        {
          maxTokens: profile.maxTokensPerRequest,
          timeoutMs,
          signal: abortController.signal,
          onBeforeDispatch: () => {
            if (abortController?.signal.aborted || options?.signal?.aborted) {
              throw new AiDiagnosisSecurityError("ERR_ABORTED", "Diagnosis execution was cancelled before transport dispatch.");
            }
            const currentInc = this.incidentRepo.getIncidentById(incidentId);
            if (!currentInc || currentInc.status === "CERRADO" || currentInc.status === "NO CONFIRMADO") {
              throw new AiDiagnosisSecurityError("ERR_INCIDENT_CLOSED", `Cannot dispatch diagnosis for incident in status '${currentInc?.status || "NOT_FOUND"}'.`);
            }
            wasDispatched = true;
            this.budgetTracker.markDispatched(operationId);
          },
        },
      );

      // Verify abort signal immediately after adapter execution (protect against uncooperative adapters)
      if (abortController.signal.aborted || options?.signal?.aborted) {
        throw new AiDiagnosisSecurityError("ERR_ABORTED", "Diagnosis execution was aborted/cancelled; discarding late adapter response.");
      }

      // 7. Token Budget Check (H8-018)
      const tokenCheck = this.budgetTracker.validateTokenBudget(rawResult.tokenUsage.totalTokens, profile);

      if (!tokenCheck.allowed) {
        throw new AiDiagnosisSecurityError("TOKEN_BUDGET_EXCEEDED", tokenCheck.reason || "Límite de tokens excedido.");
      }

      // 8. Strict Citation Verification: Evidence ID, Excerpt Content, and Resource Alignment (H8.3.1 Gate Item 5, H8.4 & R1-02)
      const evidenceMap = new Map(boundedEvidences.map(e => [e.id, e]));
      const manualContextMap = new Map(boundedManualContexts.map(m => [m.id, m]));
      let hallucinatedCitationsCount = 0;
      const verifiedEvidenceIds = new Set<string>();

      const verifiedFacts: AiDiagnosisFact[] = rawResult.facts.map(f => {
        const sanitizedFactText = this.sanitizeOutputText(f.text);
        if (!f.citation) {
          return { text: sanitizedFactText };
        }

        const cit = f.citation;
        const matchedEvidence = isSafeIdentifier(cit.evidenceId) ? evidenceMap.get(cit.evidenceId) : undefined;
        const matchedManual = isSafeIdentifier(cit.evidenceId) ? manualContextMap.get(cit.evidenceId) : undefined;
        let isValid = false;

        if (matchedEvidence) {
          let excerptMatches = true;

          if (cit.excerpt && cit.excerpt.trim().length > 0) {
            const normContent = matchedEvidence.contentSnippet.toLowerCase().replace(/\s+/g, " ");
            const normExcerpt = cit.excerpt.toLowerCase().replace(/\s+/g, " ").trim();
            excerptMatches = normContent.includes(normExcerpt);
          }

          let kindMatches = true;
          if (cit.resourceKind && matchedEvidence.resourceKind) {
            const sanitizedCitKind = this.sanitizeOutputText(cit.resourceKind).toLowerCase();
            const sanitizedEvidenceKind = matchedEvidence.resourceKind.toLowerCase();
            kindMatches =
              sanitizedCitKind === sanitizedEvidenceKind ||
              cit.resourceKind.toLowerCase() === sanitizedEvidenceKind;
          }

          let nameMatches = true;
          if (cit.resourceName && matchedEvidence.resourceName) {
            const sanitizedCitName = this.sanitizeOutputText(cit.resourceName).toLowerCase();
            const sanitizedEvidenceName = matchedEvidence.resourceName.toLowerCase();
            nameMatches =
              sanitizedCitName === sanitizedEvidenceName ||
              cit.resourceName.toLowerCase() === sanitizedEvidenceName;
          }

          isValid = excerptMatches && kindMatches && nameMatches;
        } else if (matchedManual) {
          let excerptMatches = true;

          if (cit.excerpt && cit.excerpt.trim().length > 0) {
            const normContent = matchedManual.sanitizedContent.toLowerCase().replace(/\s+/g, " ");
            const normExcerpt = cit.excerpt.toLowerCase().replace(/\s+/g, " ").trim();
            excerptMatches = normContent.includes(normExcerpt);
          }

          isValid = excerptMatches;
        }

        if (!isValid) {
          hallucinatedCitationsCount++;
        } else {
          verifiedEvidenceIds.add(cit.evidenceId);
        }

        if (isValid) {
          if (matchedEvidence) {
            return {
              text: sanitizedFactText,
              citation: {
                evidenceId: matchedEvidence.id,
                excerpt: cit.excerpt ? this.sanitizeOutputText(cit.excerpt) : undefined,
                resourceKind: matchedEvidence.resourceKind ? this.sanitizeOutputText(matchedEvidence.resourceKind) : undefined,
                resourceName: matchedEvidence.resourceName ? this.sanitizeOutputText(matchedEvidence.resourceName) : undefined,
                verified: true,
              },
            };
          } else {
            // Ephemeral manual context must NEVER persist raw content/excerpts to SQLite/report storage (H8-020)
            return {
              text: sanitizedFactText,
              citation: {
                evidenceId: matchedManual!.id,
                excerpt: undefined,
                resourceKind: matchedManual!.metadata?.resourceKind ? this.sanitizeOutputText(matchedManual!.metadata.resourceKind) : "File",
                resourceName: this.sanitizeOutputText(matchedManual!.filename),
                verified: true,
              },
            };
          }
        }

        // Unverified citation: strip model-provided metadata to prevent canary/exfiltration leaks (R1-02)
        return {
          text: sanitizedFactText,
          citation: {
            evidenceId: isSafeIdentifier(cit.evidenceId) ? cit.evidenceId : "unverified-citation",
            excerpt: undefined,
            resourceKind: undefined,
            resourceName: undefined,
            verified: false,
          },
        };
      });

      const verifiedHypotheses: AiDiagnosisHypothesis[] = rawResult.hypotheses.map(h => {
        const verifiedCits = h.citationIds.filter(id => isSafeIdentifier(id) && verifiedEvidenceIds.has(id));
        const unverifiedCount = h.citationIds.length - verifiedCits.length;

        if (unverifiedCount > 0) {
          hallucinatedCitationsCount += unverifiedCount;
        }

        // Penalize confidence if citations were hallucinated or absent
        const confidenceMultiplier = unverifiedCount > 0 && verifiedCits.length === 0 ? 0.2 : 1.0;
        const confidence = Math.max(0.1, Math.min(1.0, h.confidence * confidenceMultiplier));
        const safeHypId = isSafeIdentifier(h.id) ? h.id : `hyp-${crypto.randomUUID()}`;

        return {
          id: safeHypId,
          title: this.sanitizeOutputText(h.title),
          confidence,
          rationale: this.sanitizeOutputText(h.rationale),
          citationIds: verifiedCits,
        };
      });

      // If all hypotheses lack verified evidentiary grounding and status was CONCLUSIVE, downgrade to INCONCLUSO
      let finalStatus = rawResult.status;
      let inconclusiveReason = rawResult.inconclusiveReason ? this.sanitizeOutputText(rawResult.inconclusiveReason) : undefined;

      if (
        finalStatus === "CONCLUSIVE" &&
        (hallucinatedCitationsCount > 0 || verifiedHypotheses.length === 0) &&
        verifiedHypotheses.every(h => h.citationIds.length === 0)
      ) {
        finalStatus = "INCONCLUSO";
        inconclusiveReason =
          "El diagnóstico fue degradado a INCONCLUSO porque las citas generadas por el modelo no tienen correspondencia con las evidencias ni archivos de contexto del caso.";
      }

      // 9. Reversible Remediation Proposal Invariant (H8-016 & R1-02)
      let remediationProposal: AiRemediationProposal | undefined;

      if (rawResult.remediationProposal) {
        const rawRem = rawResult.remediationProposal;
        const safeRemId = isSafeIdentifier(rawRem.id) ? rawRem.id : `REM-${crypto.randomUUID()}`;

        remediationProposal = {
          id: safeRemId,
          title: this.sanitizeOutputText(rawRem.title),
          problemSummary: this.sanitizeOutputText(rawRem.problemSummary),
          suggestedYamlDiff: rawRem.suggestedYamlDiff
            ? this.sanitizeOutputText(rawRem.suggestedYamlDiff)
            : undefined,
          suggestedConfigDescription: rawRem.suggestedConfigDescription
            ? this.sanitizeOutputText(rawRem.suggestedConfigDescription)
            : undefined,
          preconditions: (rawRem.preconditions ?? []).map(p => this.sanitizeOutputText(p)),
          risksAndImpact: this.sanitizeOutputText(rawRem.risksAndImpact),
          validationSteps: (rawRem.validationSteps ?? []).map(v => this.sanitizeOutputText(v)),
          rollbackProcedure: this.sanitizeOutputText(rawRem.rollbackProcedure),
          // STRICT INVARIANTS: AI NEVER executes, applies, or bypasses human approval
          requiresHumanApproval: true,
          isApplied: false,
        };
      }

      // 10. Cost Estimation (prefer adapter-specific tariff calculation such as DeepSeek cache/band pricing when present)
      const estimatedCost =
        typeof rawResult.calculatedCostUsd === "number" && rawResult.calculatedCostUsd > 0
          ? rawResult.calculatedCostUsd
          : this.budgetTracker.calculateEstimatedCost(
              rawResult.tokenUsage.totalTokens,
              profile.estimatedCostPer1kTokens,
            );

      const report: AiDiagnosisReport = {
        id: diagnosisId,
        incidentId,
        profileId,
        provider: profile.provider,
        model: profile.model,
        status: finalStatus,
        inconclusiveReason,
        facts: verifiedFacts,
        hypotheses: verifiedHypotheses,
        contradictions: rawResult.contradictions.map(c => this.sanitizeOutputText(c)),
        missingInformation: rawResult.missingInformation.map(m => this.sanitizeOutputText(m)),
        recommendedNextSteps: rawResult.recommendedNextSteps.map(s => this.sanitizeOutputText(s)),
        remediationProposal,
        tokenUsage: rawResult.tokenUsage,
        tokenUsageDetails: rawResult.tokenUsageDetails,
        estimatedCost,
        executedAt,
      };

      // 11. Atomic Final Validation & Persist Report (R2-03)
      // Execute final state validation and persistence inside a SQLite transaction to prevent TOCTOU races
      this.diagnosisRepo.sqlite.transaction(() => {
        // Re-check abort signal
        if (abortController?.signal.aborted || options?.signal?.aborted) {
          throw new AiDiagnosisSecurityError("ERR_ABORTED", "Diagnosis execution was cancelled before report persistence.");
        }

        // Re-check incident existence and lifecycle state
        const finalInc = this.incidentRepo.getIncidentById(incidentId);
        if (!finalInc) {
          throw new AiDiagnosisSecurityError("INCIDENT_NOT_FOUND", `Incidente '${incidentId}' no existe.`);
        }
        if (finalInc.status === "CERRADO" || finalInc.status === "NO CONFIRMADO") {
          throw new AiDiagnosisSecurityError(
            "INCIDENT_CLOSED",
            `No se puede guardar diagnóstico para el incidente '${incidentId}' porque cambió a estado '${finalInc.status}'.`,
          );
        }

        // Re-check scope integrity
        if (finalInc.clusterId !== consent.clusterId || finalInc.namespace !== consent.namespace) {
          throw new AiDiagnosisSecurityError(
            "CONSENT_SCOPE_MISMATCH",
            `El alcance del incidente (${finalInc.clusterId}/${finalInc.namespace}) ya no coincide con el consentimiento (${consent.clusterId}/${consent.namespace}).`,
          );
        }

        this.diagnosisRepo.saveDiagnosis(report);
        this.budgetTracker.markCompleted(operationId, report.tokenUsage, estimatedCost, diagnosisId);
      });

      const message =
        report.status === "CONCLUSIVE"
          ? `Diagnóstico IA conclusivo: ${report.hypotheses[0]?.title ?? "Causas analizadas"}`
          : `Diagnóstico IA INCONCLUSO: ${report.inconclusiveReason}`;

      this.incidentRepo.addTimelineEntry({
        incidentId,
        authorType: "ai",
        authorName: `AI Diagnostic Engine (${profile.model})`,
        message,
        metadata: {
          diagnosisId,
          status: report.status,
          provider: report.provider,
          model: report.model,
          tokens: report.tokenUsage,
          estimatedCost,
          hallucinatedCitationsCount,
        },
      });

      return report;
    } catch (err: unknown) {
      if (reservationCreated) {
        this.budgetTracker.markFailed(
          operationId,
          err,
          wasDispatched,
        );
      }
      throw err;
    } finally {
      if (options?.signal && abortListener) {
        options.signal.removeEventListener("abort", abortListener);
      }
      if (abortController && incidentControllers) {
        incidentControllers.delete(abortController);
        if (incidentControllers.size === 0) {
          this.activeAbortControllers.delete(incidentId);
        }
      }
      // Securely zero out raw Buffers in RAM post-diagnosis (H8-020 Lifecycle requirement)
      this.ephemeralContextManager?.purgeRawBuffers(incidentId);
    }
  }
}
