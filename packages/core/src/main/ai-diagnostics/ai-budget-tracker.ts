/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import type { AiProfile } from "../../common/incident/ai-profile-types";
import type { AiBudgetReservation, AiReservationStatus } from "../../common/incident/ai-diagnosis-types";
import type { AiDiagnosisRepository } from "./ai-diagnosis-repository";
import { AiDiagnosisSecurityError } from "./ai-diagnosis-errors";

export class AiBudgetTracker {
  constructor(private readonly diagnosisRepo: AiDiagnosisRepository) {}

  /**
   * Atomically checks and reserves a request slot for the incident.
   * Runs in an immediate SQLite transaction to prevent concurrent race conditions.
   */
  public reserveBudget(params: {
    incidentId: string;
    profile: AiProfile;
    clusterId: string;
    namespace: string;
    operationId: string;
  }): AiBudgetReservation {
    if (!params.operationId || typeof params.operationId !== "string" || params.operationId.trim().length === 0) {
      throw new AiDiagnosisSecurityError("INVALID_OPERATION_ID", "operationId es requerido y debe ser no vacío.");
    }

    const opId = params.operationId.trim();

    // Check if operationId is already reserved or used
    const existing = this.diagnosisRepo.getReservationByOperationId(opId);
    if (existing) {
      throw new AiDiagnosisSecurityError(
        "DUPLICATE_OPERATION_ID",
        `La operación '${opId}' ya fue reservada o ejecutada. Se prohíbe el doble consumo accidental de una misma operación.`,
      );
    }

    const db = (this.diagnosisRepo.sqlite as any)?.getDb?.();

    if (db && typeof db.transaction === "function") {
      const runTx = db.transaction(() => {
        const consumedCount = this.diagnosisRepo.countActiveAndConsumedBudget(params.incidentId);
        if (consumedCount >= params.profile.maxRequestsPerIncident) {
          throw new AiDiagnosisSecurityError(
            "BUDGET_EXCEEDED",
            `Límite presupuestario alcanzado: el caso ha consumido o reservado ${consumedCount}/${params.profile.maxRequestsPerIncident} solicitudes permitidas para el perfil '${params.profile.name}'.`,
          );
        }

        const reservationId = `RES-${crypto.randomUUID()}`;
        return this.diagnosisRepo.createReservation({
          id: reservationId,
          operationId: opId,
          incidentId: params.incidentId,
          profileId: params.profile.id,
          clusterId: params.clusterId,
          namespace: params.namespace,
        });
      });

      return runTx();
    }

    // Fallback if sqlite mock without transaction
    const consumedCount = this.diagnosisRepo.countActiveAndConsumedBudget(params.incidentId);
    if (consumedCount >= params.profile.maxRequestsPerIncident) {
      throw new AiDiagnosisSecurityError(
        "BUDGET_EXCEEDED",
        `Límite presupuestario alcanzado: el caso ha consumido o reservado ${consumedCount}/${params.profile.maxRequestsPerIncident} solicitudes permitidas para el perfil '${params.profile.name}'.`,
      );
    }

    const reservationId = `RES-${crypto.randomUUID()}`;
    return this.diagnosisRepo.createReservation({
      id: reservationId,
      operationId: opId,
      incidentId: params.incidentId,
      profileId: params.profile.id,
      clusterId: params.clusterId,
      namespace: params.namespace,
    });
  }

  public markDispatched(operationId: string): void {
    this.diagnosisRepo.updateReservationStatus(operationId, "DISPATCHED");
  }

  public markCompleted(
    operationId: string,
    tokens: { promptTokens: number; completionTokens: number; totalTokens: number },
    estimatedCost: number,
    diagnosisId?: string,
  ): void {
    this.diagnosisRepo.updateReservationStatus(operationId, "COMPLETED", {
      promptTokens: tokens.promptTokens,
      completionTokens: tokens.completionTokens,
      totalTokens: tokens.totalTokens,
      estimatedCost,
      diagnosisId,
    });
  }

  public markFailed(operationId: string, error: string, wasDispatched: boolean): void {
    const status: AiReservationStatus = wasDispatched
      ? "FAILED_DISPATCHED"
      : "CANCELLED_BEFORE_DISPATCH";
    this.diagnosisRepo.updateReservationStatus(operationId, status, {
      errorMessage: error,
    });
  }

  public checkRequestBudget(incidentId: string, profile: AiProfile): { allowed: boolean; reason?: string } {
    const existingCount = this.diagnosisRepo.countActiveAndConsumedBudget(incidentId);

    if (existingCount >= profile.maxRequestsPerIncident) {
      return {
        allowed: false,
        reason: `Límite presupuestario alcanzado: el caso ha consumido o reservado ${existingCount}/${profile.maxRequestsPerIncident} solicitudes permitidas para el perfil '${profile.name}'.`,
      };
    }

    return { allowed: true };
  }

  public validateTokenBudget(totalTokens: number, profile: AiProfile): { allowed: boolean; reason?: string } {
    if (typeof totalTokens !== "number" || isNaN(totalTokens) || totalTokens < 0) {
      return {
        allowed: false,
        reason: "El recuento de tokens debe ser un número entero no negativo.",
      };
    }

    if (totalTokens > profile.maxTokensPerRequest) {
      return {
        allowed: false,
        reason: `Límite de tokens excedido: la respuesta generó ${totalTokens} tokens, superando el límite de ${profile.maxTokensPerRequest} tokens para el perfil '${profile.name}'.`,
      };
    }

    return { allowed: true };
  }

  public calculateEstimatedCost(totalTokens: number, costPer1kTokens?: number): number {
    if (!costPer1kTokens || costPer1kTokens <= 0 || !totalTokens || totalTokens <= 0 || isNaN(totalTokens)) {
      return 0.0;
    }

    const cost = (totalTokens / 1000.0) * costPer1kTokens;
    // Round to 6 decimal places to prevent floating point drift
    return Math.round(cost * 1_000_000) / 1_000_000;
  }
}
