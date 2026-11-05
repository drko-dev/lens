/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { Incident, IncidentStatus, IncidentTransitionRequest } from "./incident-types";

export const ALLOWED_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  DETECTADO: ["INVESTIGANDO", "NO CONFIRMADO", "INCONCLUSO"],
  INVESTIGANDO: ["HIPÓTESIS", "CONFIRMADO", "NO CONFIRMADO", "INCONCLUSO"],
  HIPÓTESIS: ["INVESTIGANDO", "CONFIRMADO", "NO CONFIRMADO", "INCONCLUSO"],
  CONFIRMADO: ["SOLUCIÓN PROPUESTA", "INVESTIGANDO"],
  "SOLUCIÓN PROPUESTA": ["APROBACIÓN HUMANA", "INVESTIGANDO"],
  "APROBACIÓN HUMANA": ["VALIDACIÓN", "INVESTIGANDO"],
  VALIDACIÓN: ["CERRADO", "INVESTIGANDO"],
  "NO CONFIRMADO": ["INVESTIGANDO", "CERRADO"],
  INCONCLUSO: ["INVESTIGANDO", "CERRADO"],
  CERRADO: ["INVESTIGANDO"],
};

export class IncidentStateMachine {
  public static isTransitionAllowed(from: IncidentStatus, to: IncidentStatus): boolean {
    const allowed = ALLOWED_TRANSITIONS[from];

    return Boolean(allowed && allowed.includes(to));
  }

  public static getAllowedNextStates(currentStatus: IncidentStatus): readonly IncidentStatus[] {
    return ALLOWED_TRANSITIONS[currentStatus] ?? [];
  }

  public static validateTransition(current: Incident, request: IncidentTransitionRequest): void {
    const fromStatus = current.status;
    const toStatus = request.toStatus;

    if (fromStatus === toStatus) {
      throw new Error(`Transición inválida: el incidente ya se encuentra en el estado '${fromStatus}'.`);
    }

    if (!this.isTransitionAllowed(fromStatus, toStatus)) {
      throw new Error(
        `Transición denegada: no se permite pasar de '${fromStatus}' a '${toStatus}'. Estados permitidos: [${this.getAllowedNextStates(fromStatus).join(", ")}].`,
      );
    }

    const trimmedJustification = (request.justification || "").trim();

    if (trimmedJustification.length < 5) {
      throw new Error("Transición denegada: la justificación es obligatoria y debe contener al menos 5 caracteres.");
    }

    // Regla de Confirmación: exige evidencias verificables
    if (toStatus === "CONFIRMADO") {
      if (!request.evidenceIds || request.evidenceIds.length === 0) {
        throw new Error("Transición a 'CONFIRMADO' denegada: se requiere al menos una evidencia comprobable vinculada al incidente.");
      }
    }

    // Regla de Responsabilidad Humana: Aprobación
    if (toStatus === "APROBACIÓN HUMANA") {
      if (request.actor.type !== "human") {
        throw new Error("Transición a 'APROBACIÓN HUMANA' denegada: la IA o el sistema no pueden auto-aprobar soluciones. Se requiere un operador humano.");
      }
    }

    // Regla de Cierre: Exclusivamente operadores humanos pueden cerrar incidentes
    if (toStatus === "CERRADO") {
      if (request.actor.type !== "human") {
        throw new Error(`Transición a 'CERRADO' denegada: solo un operador humano puede cerrar incidentes (actor provisto: '${request.actor.type}').`);
      }
    }

    // Regla de Reapertura desde CERRADO
    if (fromStatus === "CERRADO" && toStatus === "INVESTIGANDO") {
      if (request.actor.type !== "human") {
        throw new Error("Reapertura denegada: solo un operador humano puede reabrir un incidente cerrado.");
      }

      if (trimmedJustification.length < 10) {
        throw new Error("Reapertura denegada: se requiere una justificación sustantiva de al menos 10 caracteres explicando el motivo de la reapertura.");
      }
    }

    // Regla para descartes (NO CONFIRMADO / INCONCLUSO)
    if (toStatus === "NO CONFIRMADO" || toStatus === "INCONCLUSO") {
      if (trimmedJustification.length < 10) {
        throw new Error(`Transición a '${toStatus}' denegada: se requiere una justificación detallada de al menos 10 caracteres.`);
      }
    }
  }
}
