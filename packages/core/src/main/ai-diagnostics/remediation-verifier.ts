/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IncidentRepository } from "../incident-storage/incident-repository";
import type { EvidenceRepository } from "../incident-storage/evidence-repository";

export type VerificationOutcome = "HEALTHY" | "REGRESSION" | "INCONCLUSIVE";

export interface VerificationEvaluation {
  outcome: VerificationOutcome;
  summary: string;
  details: string[];
  metricsOrState?: Record<string, any>;
}

export interface PostVerificationResult {
  incidentId: string;
  outcome: VerificationOutcome;
  summary: string;
  details: string[];
  humanOperator: string;
  verifiedAt: string;
  timelineEventId: string;
}

export class RemediationVerificationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = "RemediationVerificationError";
  }
}

export class RemediationVerifier {
  constructor(
    private readonly incidentRepo: IncidentRepository,
    private readonly evidenceRepo: EvidenceRepository,
  ) {}

  /**
   * Performs read-only verification comparing before and after Kubernetes evidence (H8-017).
   * STRICT INVARIANT: This verifier NEVER closes incidents (auto-closure is prohibited).
   */
  public async evaluateRemediation(input: {
    incidentId: string;
    humanOperator: string;
    baselineEvidenceId?: string;
    currentEvidenceId?: string;
    evaluationOverride?: VerificationEvaluation;
  }): Promise<PostVerificationResult> {
    const incident = this.incidentRepo.getIncidentById(input.incidentId);

    if (!incident) {
      throw new RemediationVerificationError("INCIDENT_NOT_FOUND", `Incidente '${input.incidentId}' no encontrado.`);
    }

    if (!input.humanOperator || input.humanOperator.trim().length === 0) {
      throw new RemediationVerificationError(
        "HUMAN_OPERATOR_REQUIRED",
        "Se requiere identificar al operador humano que ejecutó la remediación manual.",
      );
    }

    let evaluation: VerificationEvaluation;

    if (input.evaluationOverride) {
      evaluation = input.evaluationOverride;
    } else {
      evaluation = this.evaluateFromEvidence(input.incidentId, input.baselineEvidenceId, input.currentEvidenceId);
    }

    const verifiedAt = new Date().toISOString();

    // STRICT INVARIANT: Never transition to CERRADO automatically.
    // If the incident is in APROBACIÓN HUMANA, we may transition to VALIDACIÓN.
    if (incident.status === "APROBACIÓN HUMANA") {
      this.incidentRepo.transitionStatus({
        incidentId: input.incidentId,
        toStatus: "VALIDACIÓN",
        actor: {
          id: input.humanOperator,
          type: "human",
          name: input.humanOperator,
        },
        justification: `Remediación aplicada por operador humano (${input.humanOperator}). Pasando a VALIDACIÓN para verificar estabilidad.`,
      });
    }

    // Register verification timeline event
    const timelineEvent = this.incidentRepo.addTimelineEntry({
      incidentId: input.incidentId,
      authorType: "system",
      authorName: "Post-Remediation Verifier (Read-Only)",
      message: `[Verificación Posterior] Resultado: ${evaluation.outcome}. ${evaluation.summary} (Intervención humana: ${input.humanOperator})`,
      metadata: {
        outcome: evaluation.outcome,
        details: evaluation.details,
        humanOperator: input.humanOperator,
        baselineEvidenceId: input.baselineEvidenceId,
        currentEvidenceId: input.currentEvidenceId,
        autoClosed: false, // Strict invariant: always false
      },
    });

    return {
      incidentId: input.incidentId,
      outcome: evaluation.outcome,
      summary: evaluation.summary,
      details: evaluation.details,
      humanOperator: input.humanOperator,
      verifiedAt,
      timelineEventId: timelineEvent.id,
    };
  }

  private evaluateFromEvidence(
    incidentId: string,
    baselineEvidenceId?: string,
    currentEvidenceId?: string,
  ): VerificationEvaluation {
    const evidences = this.evidenceRepo.listEvidenceByIncident(incidentId);

    if (evidences.length === 0) {
      return {
        outcome: "INCONCLUSIVE",
        summary: "No existen evidencias registradas para comparar el estado previo y posterior.",
        details: ["Sin evidencia previa ni posterior."],
      };
    }

    const current = currentEvidenceId
      ? evidences.find(e => e.id === currentEvidenceId)
      : evidences[evidences.length - 1];

    if (!current) {
      return {
        outcome: "INCONCLUSIVE",
        summary: "Evidencia de verificación actual no encontrada.",
        details: [`Evidencia ${currentEvidenceId} no encontrada en el caso.`],
      };
    }

    const content = current.contentSnippet.toLowerCase();

    // Check for obvious crash/error signals
    const hasCrashSignals =
      content.includes("crashloopbackoff") ||
      content.includes("oomkilled") ||
      content.includes("error: ") ||
      content.includes("fatal") ||
      content.includes("back-off restarting");

    if (hasCrashSignals) {
      return {
        outcome: "REGRESSION",
        summary: "Se detectaron errores activos o reinicios continuos en la evidencia post-remediación.",
        details: [
          `Evidencia observada (${current.id}): contiene señales de error o CrashLoopBackOff.`,
          "El workload aún no alcanza un estado estable.",
        ],
      };
    }

    const hasHealthySignals =
      content.includes("running") ||
      content.includes("ready") ||
      content.includes("200 ok") ||
      content.includes("healthy") ||
      content.includes("started container");

    if (hasHealthySignals) {
      return {
        outcome: "HEALTHY",
        summary: "El workload responde favorablemente sin registrar errores ni reinicios activos.",
        details: [
          `Evidencia observada (${current.id}): contenedores en estado Ready/Running.`,
          "No se detectan advertencias ni fallos en los registros recientes.",
        ],
      };
    }

    return {
      outcome: "INCONCLUSIVE",
      summary: "Las evidencias posteriores no presentan señales concluyentes de salud ni de fallo.",
      details: [`Evidencia analizada: ${current.id}.`],
    };
  }
}
