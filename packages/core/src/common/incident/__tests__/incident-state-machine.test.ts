/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { IncidentStateMachine } from "../incident-state-machine";
import type { Incident, IncidentActor, IncidentTransitionRequest } from "../incident-types";

describe("IncidentStateMachine (H8-006)", () => {
  const humanActor: IncidentActor = {
    type: "human",
    id: "user:sre-lead",
    name: "SRE Lead",
  };

  const aiActor: IncidentActor = {
    type: "ai",
    id: "ai:diagnostic-engine",
    name: "AI Diagnostic Engine",
  };

  const systemActor: IncidentActor = {
    type: "system",
    id: "system:local-detector",
    name: "Local Signals Detector",
  };

  const baseIncident: Incident = {
    id: "INC-TEST-001",
    clusterId: "c1",
    namespace: "default",
    title: "Test Incident",
    severity: "high",
    status: "DETECTADO",
    isPinned: false,
    createdAt: "2026-11-05T10:00:00Z",
    updatedAt: "2026-11-05T10:00:00Z",
  };

  describe("Matriz de Transiciones Permitidas", () => {
    it("permite transiciones válidas del flujo principal", () => {
      expect(IncidentStateMachine.isTransitionAllowed("DETECTADO", "INVESTIGANDO")).toBe(true);
      expect(IncidentStateMachine.isTransitionAllowed("INVESTIGANDO", "HIPÓTESIS")).toBe(true);
      expect(IncidentStateMachine.isTransitionAllowed("HIPÓTESIS", "CONFIRMADO")).toBe(true);
      expect(IncidentStateMachine.isTransitionAllowed("CONFIRMADO", "SOLUCIÓN PROPUESTA")).toBe(true);
      expect(IncidentStateMachine.isTransitionAllowed("SOLUCIÓN PROPUESTA", "APROBACIÓN HUMANA")).toBe(true);
      expect(IncidentStateMachine.isTransitionAllowed("APROBACIÓN HUMANA", "VALIDACIÓN")).toBe(true);
      expect(IncidentStateMachine.isTransitionAllowed("VALIDACIÓN", "CERRADO")).toBe(true);
    });

    it("permite flujos alternativos de descarte y reapertura", () => {
      // Falso positivo directo
      expect(IncidentStateMachine.isTransitionAllowed("DETECTADO", "NO CONFIRMADO")).toBe(true);
      expect(IncidentStateMachine.isTransitionAllowed("NO CONFIRMADO", "CERRADO")).toBe(true);

      // Inconcluso por falta de telemetría
      expect(IncidentStateMachine.isTransitionAllowed("INVESTIGANDO", "INCONCLUSO")).toBe(true);
      expect(IncidentStateMachine.isTransitionAllowed("INCONCLUSO", "INVESTIGANDO")).toBe(true);

      // Reapertura desde CERRADO
      expect(IncidentStateMachine.isTransitionAllowed("CERRADO", "INVESTIGANDO")).toBe(true);
    });

    it("rechaza saltos de estado no autorizados", () => {
      // Intentar saltar de DETECTADO a CONFIRMADO o CERRADO
      expect(IncidentStateMachine.isTransitionAllowed("DETECTADO", "CONFIRMADO")).toBe(false);
      expect(IncidentStateMachine.isTransitionAllowed("DETECTADO", "CERRADO")).toBe(false);
      expect(IncidentStateMachine.isTransitionAllowed("DETECTADO", "SOLUCIÓN PROPUESTA")).toBe(false);

      // Intentar saltar de HIPÓTESIS a CERRADO sin validar
      expect(IncidentStateMachine.isTransitionAllowed("HIPÓTESIS", "CERRADO")).toBe(false);

      // Intentar saltar de CERRADO a estados que no sean INVESTIGANDO
      expect(IncidentStateMachine.isTransitionAllowed("CERRADO", "CONFIRMADO")).toBe(false);
      expect(IncidentStateMachine.isTransitionAllowed("CERRADO", "VALIDACIÓN")).toBe(false);
    });
  });

  describe("Reglas de Negocio y Precondiciones (validateTransition)", () => {
    it("rechaza transición al mismo estado vigente", () => {
      const incident = { ...baseIncident, status: "INVESTIGANDO" as const };
      const req: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "INVESTIGANDO",
        actor: humanActor,
        justification: "Valid justification message",
      };

      expect(() => IncidentStateMachine.validateTransition(incident, req)).toThrow(
        "el incidente ya se encuentra en el estado 'INVESTIGANDO'",
      );
    });

    it("rechaza transición con justificación vacía o menor a 5 caracteres", () => {
      const incident = { ...baseIncident, status: "DETECTADO" as const };
      const req: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "INVESTIGANDO",
        actor: systemActor,
        justification: "ok",
      };

      expect(() => IncidentStateMachine.validateTransition(incident, req)).toThrow(
        "la justificación es obligatoria y debe contener al menos 5 caracteres",
      );
    });

    it("bloquea transición a CONFIRMADO si no se aportan evidencias", () => {
      const incident = { ...baseIncident, status: "INVESTIGANDO" as const };
      const req: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "CONFIRMADO",
        actor: humanActor,
        justification: "Root cause found in memory leak",
        evidenceIds: [], // Sin evidencia
      };

      expect(() => IncidentStateMachine.validateTransition(incident, req)).toThrow(
        "se requiere al menos una evidencia comprobable vinculada al incidente",
      );
    });

    it("permite transición a CONFIRMADO con evidencia válida y justificación", () => {
      const incident = { ...baseIncident, status: "HIPÓTESIS" as const };
      const req: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "CONFIRMADO",
        actor: humanActor,
        justification: "Log snippet proves NPE at startup",
        evidenceIds: ["EVD-1234"],
      };

      expect(() => IncidentStateMachine.validateTransition(incident, req)).not.toThrow();
    });

    it("bloquea APROBACIÓN HUMANA cuando el actor es IA o Sistema", () => {
      const incident = { ...baseIncident, status: "SOLUCIÓN PROPUESTA" as const };
      const reqAi: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "APROBACIÓN HUMANA",
        actor: aiActor,
        justification: "AI recommends approving its own diff",
      };

      expect(() => IncidentStateMachine.validateTransition(incident, reqAi)).toThrow(
        "la IA o el sistema no pueden auto-aprobar soluciones. Se requiere un operador humano.",
      );

      const reqSystem: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "APROBACIÓN HUMANA",
        actor: systemActor,
        justification: "System auto-approval script",
      };

      expect(() => IncidentStateMachine.validateTransition(incident, reqSystem)).toThrow(
        "la IA o el sistema no pueden auto-aprobar soluciones. Se requiere un operador humano.",
      );
    });

    it("permite APROBACIÓN HUMANA cuando el actor es humano", () => {
      const incident = { ...baseIncident, status: "SOLUCIÓN PROPUESTA" as const };
      const req: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "APROBACIÓN HUMANA",
        actor: humanActor,
        justification: "Operator reviewed the suggested resource limits diff and approved",
      };

      expect(() => IncidentStateMachine.validateTransition(incident, req)).not.toThrow();
    });

    it("bloquea cierre autónomo por parte de IA o Sistema", () => {
      const incident = { ...baseIncident, status: "VALIDACIÓN" as const };
      const reqAi: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "CERRADO",
        actor: aiActor,
        justification: "AI claims workload looks healthy",
      };

      expect(() => IncidentStateMachine.validateTransition(incident, reqAi)).toThrow(
        "solo un operador humano puede cerrar incidentes (actor provisto: 'ai')",
      );

      const reqSystem: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "CERRADO",
        actor: systemActor,
        justification: "System auto-close script",
      };

      expect(() => IncidentStateMachine.validateTransition(incident, reqSystem)).toThrow(
        "solo un operador humano puede cerrar incidentes (actor provisto: 'system')",
      );
    });

    it("permite cierre por operador humano desde VALIDACIÓN", () => {
      const incident = { ...baseIncident, status: "VALIDACIÓN" as const };
      const req: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "CERRADO",
        actor: humanActor,
        justification: "Pod restarts ceased for 30 minutes, metric latency nominal.",
      };

      expect(() => IncidentStateMachine.validateTransition(incident, req)).not.toThrow();
    });

    it("controla estrictamente la reapertura desde CERRADO", () => {
      const incident = {
        ...baseIncident,
        status: "CERRADO" as const,
        closedAt: "2026-11-05T10:30:00Z",
      };

      // Rechaza si el actor es IA
      const reqAi: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "INVESTIGANDO",
        actor: aiActor,
        justification: "Reopening automatically",
      };
      expect(() => IncidentStateMachine.validateTransition(incident, reqAi)).toThrow(
        "solo un operador humano puede reabrir un incidente cerrado.",
      );

      // Rechaza si justificación es corta
      const reqShort: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "INVESTIGANDO",
        actor: humanActor,
        justification: "Reopen",
      };
      expect(() => IncidentStateMachine.validateTransition(incident, reqShort)).toThrow(
        "se requiere una justificación sustantiva de al menos 10 caracteres",
      );

      // Permite con humano y justificación completa
      const reqValid: IncidentTransitionRequest = {
        incidentId: incident.id,
        toStatus: "INVESTIGANDO",
        actor: humanActor,
        justification: "CrashLoop reappeared after traffic spike on payment gateway.",
      };
      expect(() => IncidentStateMachine.validateTransition(incident, reqValid)).not.toThrow();
    });
  });
});
