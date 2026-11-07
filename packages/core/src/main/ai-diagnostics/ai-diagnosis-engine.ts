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
import type { AiProviderType } from "../../common/incident/ai-profile-types";

import type { EphemeralContextManager } from "./ephemeral-context-manager";
import type { EphemeralContextPreviewItem } from "../../common/incident/ephemeral-context-types";
import { EvidenceSanitizer } from "../incident-storage/evidence-sanitizer";

import type { SecureAiTransport } from "./transport/ai-transport-types";
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
  totalBytes: number;
  maxTokens: number;
}

export interface DiagnosisEngineOptions {
  consentTtlMs?: number;
  defaultTimeoutMs?: number;
  transport?: SecureAiTransport;
}

export class AiDiagnosisEngine {
  private readonly consentTokens = new Map<string, EphemeralConsent>();
  private readonly activeAbortControllers = new Map<string, Set<AbortController>>();
  private readonly consentTtlMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly ephemeralContextManager?: EphemeralContextManager;
  private readonly transport?: SecureAiTransport;
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
  }

  public setMockAdapterOverride(mock: AiProviderAdapter | undefined): void {
    this.mockAdapterOverride = mock;
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

    // In H8.3.1 / H8.8-01b R1: external providers must remain disabled with zero override bypasses
    if (profile.provider !== "mock") {
      throw new AiDiagnosisSecurityError(
        "EXTERNAL_PROVIDER_DISABLED",
        `El proveedor externo '${profile.provider}' está deshabilitado en este hito. Utilice el perfil 'mock' para diagnósticos locales.`,
      );
    }

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

      // In H8.8-01b R1: external providers must remain disabled with zero override bypasses
      if (profile.provider !== "mock") {
        throw new AiDiagnosisSecurityError(
          "EXTERNAL_PROVIDER_DISABLED",
          `El proveedor externo '${profile.provider}' está deshabilitado en este hito. Utilice el perfil 'mock' para diagnósticos locales.`,
        );
      }

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
          options.signal.addEventListener("abort", () => abortController?.abort(), { once: true });
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

      // Evidence Minimization & Redaction Defense-in-Depth (H8.8-02-02)
      // 1. Exclude forbidden kinds (Secret, ServiceAccount)
      const sanitizedEvidences = currentEvidences.filter(e => {
        if (!e.resourceKind) return true;
        const k = e.resourceKind.toLowerCase().trim();
        return !["secret", "serviceaccount", "secrets", "serviceaccounts"].includes(k);
      });

      // 2. Cap count at 50
      const MAX_EVIDENCE_COUNT = 50;
      const cappedEvidences = sanitizedEvidences.slice(0, MAX_EVIDENCE_COUNT);

      // 3. Cap total evidence payload size at 192 KiB (196,608 bytes)
      const MAX_PAYLOAD_BYTES = 192 * 1024;
      let accumulatedBytes = 0;
      const boundedEvidences: EvidenceSnippet[] = [];

      for (const ev of cappedEvidences) {
        const bytes = ev.snippetBytes || Buffer.byteLength(ev.contentSnippet, "utf8");
        if (accumulatedBytes + bytes <= MAX_PAYLOAD_BYTES) {
          boundedEvidences.push(ev);
          accumulatedBytes += bytes;
        } else {
          const remaining = MAX_PAYLOAD_BYTES - accumulatedBytes;
          if (remaining > 100) {
            const truncatedSnippet = ev.contentSnippet.slice(0, remaining - 20) + "\n[PAYLOAD_TRUNCATED]";
            boundedEvidences.push({
              ...ev,
              contentSnippet: truncatedSnippet,
              snippetBytes: Buffer.byteLength(truncatedSnippet, "utf8"),
            });
            accumulatedBytes = MAX_PAYLOAD_BYTES;
          }
          break;
        }
      }

      // 6. Invoke Adapter
      const adapter: AiProviderAdapter = createAiProviderAdapter(
        profile,
        this.mockAdapterOverride,
        this.transport,
      );
      const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

      // Mark dispatched before adapter / network invocation
      wasDispatched = true;
      this.budgetTracker.markDispatched(operationId);

      const rawResult = await adapter.generateDiagnosis(
        { incident, evidences: boundedEvidences, manualContexts },
        {
          maxTokens: profile.maxTokensPerRequest,
          timeoutMs,
          signal: abortController.signal,
        },
      );

      // 7. Token Budget Check (H8-018)
      const tokenCheck = this.budgetTracker.validateTokenBudget(rawResult.tokenUsage.totalTokens, profile);

      if (!tokenCheck.allowed) {
        throw new AiDiagnosisSecurityError("TOKEN_BUDGET_EXCEEDED", tokenCheck.reason || "Límite de tokens excedido.");
      }

      // 8. Strict Citation Verification: Evidence ID, Excerpt Content, and Resource Alignment (H8.3.1 Gate Item 5 & H8.4)
      const evidenceMap = new Map(boundedEvidences.map(e => [e.id, e]));
      const manualContextMap = new Map(manualContexts.map(m => [m.id, m]));
      let hallucinatedCitationsCount = 0;
      const verifiedEvidenceIds = new Set<string>();

      const verifiedFacts: AiDiagnosisFact[] = rawResult.facts.map(f => {
        const sanitizedFactText = this.sanitizeOutputText(f.text);
        if (!f.citation) {
          return { text: sanitizedFactText };
        }

        const cit = f.citation;
        const matchedEvidence = evidenceMap.get(cit.evidenceId);
        const matchedManual = manualContextMap.get(cit.evidenceId);
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
            kindMatches = cit.resourceKind.toLowerCase() === matchedEvidence.resourceKind.toLowerCase();
          }

          let nameMatches = true;
          if (cit.resourceName && matchedEvidence.resourceName) {
            nameMatches = cit.resourceName.toLowerCase() === matchedEvidence.resourceName.toLowerCase();
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

        // Ephemeral manual context must NEVER persist raw content/excerpts to SQLite/report storage (H8-020)
        return {
          text: sanitizedFactText,
          citation: {
            evidenceId: cit.evidenceId,
            excerpt: matchedManual ? undefined : (cit.excerpt ? this.sanitizeOutputText(cit.excerpt) : undefined),
            resourceKind: cit.resourceKind,
            resourceName: cit.resourceName,
            verified: isValid,
          },
        };
      });

      const verifiedHypotheses: AiDiagnosisHypothesis[] = rawResult.hypotheses.map(h => {
        const verifiedCits = h.citationIds.filter(id => verifiedEvidenceIds.has(id));
        const unverifiedCount = h.citationIds.length - verifiedCits.length;

        if (unverifiedCount > 0) {
          hallucinatedCitationsCount += unverifiedCount;
        }

        // Penalize confidence if citations were hallucinated or absent
        const confidenceMultiplier = unverifiedCount > 0 && verifiedCits.length === 0 ? 0.2 : 1.0;
        const confidence = Math.max(0.1, Math.min(1.0, h.confidence * confidenceMultiplier));

        return {
          id: h.id,
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

      // 9. Reversible Remediation Proposal Invariant (H8-016)
      let remediationProposal: AiRemediationProposal | undefined;

      if (rawResult.remediationProposal) {
        remediationProposal = {
          id: rawResult.remediationProposal.id || `REM-${crypto.randomUUID()}`,
          title: this.sanitizeOutputText(rawResult.remediationProposal.title),
          problemSummary: this.sanitizeOutputText(rawResult.remediationProposal.problemSummary),
          suggestedYamlDiff: rawResult.remediationProposal.suggestedYamlDiff
            ? this.sanitizeOutputText(rawResult.remediationProposal.suggestedYamlDiff)
            : undefined,
          suggestedConfigDescription: rawResult.remediationProposal.suggestedConfigDescription
            ? this.sanitizeOutputText(rawResult.remediationProposal.suggestedConfigDescription)
            : undefined,
          preconditions: (rawResult.remediationProposal.preconditions ?? []).map(p => this.sanitizeOutputText(p)),
          risksAndImpact: this.sanitizeOutputText(rawResult.remediationProposal.risksAndImpact),
          validationSteps: (rawResult.remediationProposal.validationSteps ?? []).map(v => this.sanitizeOutputText(v)),
          rollbackProcedure: this.sanitizeOutputText(rawResult.remediationProposal.rollbackProcedure),
          // STRICT INVARIANTS: AI NEVER executes, applies, or bypasses human approval
          requiresHumanApproval: true,
          isApplied: false,
        };
      }

      // 10. Cost Estimation
      const estimatedCost = this.budgetTracker.calculateEstimatedCost(
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
        estimatedCost,
        executedAt,
      };

      // 11. Persist Report & Mark Budget Completed
      this.diagnosisRepo.saveDiagnosis(report);
      this.budgetTracker.markCompleted(operationId, report.tokenUsage, estimatedCost, diagnosisId);

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
          err instanceof Error ? err.message : String(err),
          wasDispatched,
        );
      }
      throw err;
    } finally {
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
