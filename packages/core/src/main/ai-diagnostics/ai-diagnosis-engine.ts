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
  type MockAiProviderAdapter,
  createAiProviderAdapter,
} from "./providers/ai-provider-adapter";
import type { AiProviderType } from "../../common/incident/ai-profile-types";

import type { EphemeralContextManager } from "./ephemeral-context-manager";
import type { EphemeralContextPreviewItem } from "../../common/incident/ephemeral-context-types";

export class AiDiagnosisSecurityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "AiDiagnosisSecurityError";
  }
}

interface EphemeralConsent {
  token: string;
  incidentId: string;
  profileId: string;
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
}

export class AiDiagnosisEngine {
  private readonly consentTokens = new Map<string, EphemeralConsent>();
  private readonly consentTtlMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly ephemeralContextManager?: EphemeralContextManager;
  private mockAdapterOverride?: MockAiProviderAdapter;

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
  }

  public setMockAdapterOverride(mock: MockAiProviderAdapter | undefined): void {
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

    // In H8.3.1: external providers must be disabled unless mock is used or mock override is set
    if (profile.provider !== "mock" && !this.mockAdapterOverride) {
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

    const consentToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + this.consentTtlMs;

    // Inmovilizar metadatos inmutables vinculados al token
    this.consentTokens.set(consentToken, {
      token: consentToken,
      incidentId,
      profileId,
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
      title: incident.title,
      targetProvider: profile.provider,
      model: profile.model,
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
   * Executes AI diagnostic inference with consent enforcement, immutable evidence re-validation,
   * strict citation verification, budget limits, and strict read-only invariants (H8-015 .. H8.3.1).
   */
  public async executeDiagnosis(
    incidentId: string,
    profileId: string,
    consentToken: string,
    options?: { timeoutMs?: number; signal?: AbortSignal },
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

      if (profile.provider !== "mock" && !this.mockAdapterOverride) {
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

      // 4. Verify Request Budget (H8-018)
      const budgetCheck = this.budgetTracker.checkRequestBudget(incidentId, profile);

      if (!budgetCheck.allowed) {
        throw new AiDiagnosisSecurityError("BUDGET_EXCEEDED", budgetCheck.reason || "Límite presupuestario superado.");
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

      // 6. Invoke Adapter
      const adapter: AiProviderAdapter = createAiProviderAdapter(profile, this.mockAdapterOverride);
      const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

      const rawResult = await adapter.generateDiagnosis(
        { incident, evidences: currentEvidences, manualContexts },
        {
          maxTokens: profile.maxTokensPerRequest,
          timeoutMs,
          signal: options?.signal,
        },
      );

      // 7. Token Budget Check (H8-018)
      const tokenCheck = this.budgetTracker.validateTokenBudget(rawResult.tokenUsage.totalTokens, profile);

      if (!tokenCheck.allowed) {
        throw new AiDiagnosisSecurityError("TOKEN_BUDGET_EXCEEDED", tokenCheck.reason || "Límite de tokens excedido.");
      }

      // 8. Strict Citation Verification: Evidence ID, Excerpt Content, and Resource Alignment (H8.3.1 Gate Item 5 & H8.4)
      const evidenceMap = new Map(currentEvidences.map(e => [e.id, e]));
      const manualContextMap = new Map(manualContexts.map(m => [m.id, m]));
      let hallucinatedCitationsCount = 0;
      const verifiedEvidenceIds = new Set<string>();

      const verifiedFacts: AiDiagnosisFact[] = rawResult.facts.map(f => {
        if (!f.citation) {
          return { text: f.text };
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
          text: f.text,
          citation: {
            evidenceId: cit.evidenceId,
            excerpt: matchedManual ? undefined : cit.excerpt,
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
          title: h.title,
          confidence,
          rationale: h.rationale,
          citationIds: verifiedCits,
        };
      });

      // If all hypotheses lack verified evidentiary grounding and status was CONCLUSIVE, downgrade to INCONCLUSO
      let finalStatus = rawResult.status;
      let inconclusiveReason = rawResult.inconclusiveReason;

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
          title: rawResult.remediationProposal.title,
          problemSummary: rawResult.remediationProposal.problemSummary,
          suggestedYamlDiff: rawResult.remediationProposal.suggestedYamlDiff,
          suggestedConfigDescription: rawResult.remediationProposal.suggestedConfigDescription,
          preconditions: rawResult.remediationProposal.preconditions ?? [],
          risksAndImpact: rawResult.remediationProposal.risksAndImpact,
          validationSteps: rawResult.remediationProposal.validationSteps ?? [],
          rollbackProcedure: rawResult.remediationProposal.rollbackProcedure,
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
        contradictions: rawResult.contradictions,
        missingInformation: rawResult.missingInformation,
        recommendedNextSteps: rawResult.recommendedNextSteps,
        remediationProposal,
        tokenUsage: rawResult.tokenUsage,
        estimatedCost,
        executedAt,
      };

      // 11. Persist Report & Timeline Event
      this.diagnosisRepo.saveDiagnosis(report);

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
    } finally {
      // Securely zero out raw Buffers in RAM post-diagnosis (H8-020 Lifecycle requirement)
      this.ephemeralContextManager?.purgeRawBuffers(incidentId);
    }
  }
}
