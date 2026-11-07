/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { AiProfile } from "../../common/incident/ai-profile-types";
import type { AiDiagnosisRepository } from "./ai-diagnosis-repository";

export class AiBudgetTracker {
  constructor(private readonly diagnosisRepo: AiDiagnosisRepository) {}

  public checkRequestBudget(incidentId: string, profile: AiProfile): { allowed: boolean; reason?: string } {
    const existingCount = this.diagnosisRepo.countDiagnosesByIncident(incidentId);

    if (existingCount >= profile.maxRequestsPerIncident) {
      return {
        allowed: false,
        reason: `Límite presupuestario alcanzado: el caso ha consumido ${existingCount}/${profile.maxRequestsPerIncident} solicitudes permitidas para el perfil '${profile.name}'.`,
      };
    }

    return { allowed: true };
  }

  public validateTokenBudget(totalTokens: number, profile: AiProfile): { allowed: boolean; reason?: string } {
    if (totalTokens > profile.maxTokensPerRequest) {
      return {
        allowed: false,
        reason: `Límite de tokens excedido: la respuesta generó ${totalTokens} tokens, superando el límite de ${profile.maxTokensPerRequest} tokens para el perfil '${profile.name}'.`,
      };
    }

    return { allowed: true };
  }

  public calculateEstimatedCost(totalTokens: number, costPer1kTokens?: number): number {
    if (!costPer1kTokens || costPer1kTokens <= 0 || totalTokens <= 0) {
      return 0.0;
    }

    const cost = (totalTokens / 1000.0) * costPer1kTokens;
    // Round to 6 decimal places to prevent floating point drift
    return Math.round(cost * 1_000_000) / 1_000_000;
  }
}
