/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IncidentRepository } from "../incident-storage/incident-repository";
import type {
  LocalScannerSignal,
  ScannerAlertActionPayload,
  ScannerAlertActionResult,
} from "../../common/incident/local-scanner-types";
import type { IncidentStatus } from "../../common/incident/incident-types";

interface SignalTrackEntry {
  incidentId: string;
  fingerprint: string;
  firstSeenAt: number;
  lastSeenAt: number;
  occurrences: number;
  snoozedUntil?: number;
}

export interface IngestSignalResult {
  incidentId: string;
  isNewIncident: boolean;
  isDeduplicated: boolean;
  isSnoozed: boolean;
  occurrences: number;
}

const OPEN_STATUSES: IncidentStatus[] = [
  "DETECTADO",
  "INVESTIGANDO",
  "HIPÓTESIS",
  "CONFIRMADO",
  "SOLUCIÓN PROPUESTA",
  "APROBACIÓN HUMANA",
  "VALIDACIÓN",
];

export class IncidentDeduplicator {
  private readonly trackedSignals = new Map<string, SignalTrackEntry>();
  private readonly defaultCooldownMs: number;

  constructor(
    private readonly incidentRepo: IncidentRepository,
    cooldownPeriodMs: number = 5 * 60 * 1000, // 5 minutes default cooldown
  ) {
    this.defaultCooldownMs = cooldownPeriodMs;
  }

  /**
   * Processes a detected signal: deduplicates against open incidents,
   * respects cooldown/snooze, or creates a new incident atomically.
   */
  public async ingestSignal(signal: LocalScannerSignal, cooldownMs?: number): Promise<IngestSignalResult> {
    const effectiveCooldown = cooldownMs ?? this.defaultCooldownMs;
    const now = Date.now();
    const fingerprint = signal.fingerprint;

    const existingTrack = this.trackedSignals.get(fingerprint);

    // 1. Check if snoozed
    if (existingTrack && existingTrack.snoozedUntil && existingTrack.snoozedUntil > now) {
      existingTrack.occurrences++;
      existingTrack.lastSeenAt = now;
      return {
        incidentId: existingTrack.incidentId,
        isNewIncident: false,
        isDeduplicated: true,
        isSnoozed: true,
        occurrences: existingTrack.occurrences,
      };
    }

    // 2. Check in SQLite if the tracked incident is still open or if an open incident exists for this resource
    let activeIncidentId: string | null = null;

    if (existingTrack) {
      const inc = this.incidentRepo.getIncidentById(existingTrack.incidentId);
      if (inc && OPEN_STATUSES.includes(inc.status)) {
        activeIncidentId = inc.id;
      } else {
        // Incident was closed or dismissed, remove stale track
        this.trackedSignals.delete(fingerprint);
      }
    }

    if (!activeIncidentId) {
      // Search open incidents in repository matching cluster, namespace and workload
      const openIncidents = this.incidentRepo
        .listIncidents({
          clusterId: signal.clusterId,
          namespace: signal.namespace,
        })
        .filter(inc => OPEN_STATUSES.includes(inc.status));

      const matched = openIncidents.find(
        i =>
          i.workloadKind?.toLowerCase() === signal.resourceKind.toLowerCase() &&
          i.workloadName?.toLowerCase() === signal.resourceName.toLowerCase(),
      );

      if (matched) {
        activeIncidentId = matched.id;
      }
    }

    // 3. Deduplication branch: update existing incident atomically
    if (activeIncidentId) {
      const track = this.trackedSignals.get(fingerprint) ?? {
        incidentId: activeIncidentId,
        fingerprint,
        firstSeenAt: now,
        lastSeenAt: now,
        occurrences: 1,
      };

      track.occurrences++;
      track.lastSeenAt = now;
      this.trackedSignals.set(fingerprint, track);

      // Append atomic timeline entry for the recurring signal
      this.incidentRepo.addTimelineEntry({
        incidentId: activeIncidentId,
        authorType: "system",
        authorName: "Local Incident Scanner",
        message: `Señal recurrente detectada (${signal.signalType}): ${signal.title}. Ocurrencias registradas: ${track.occurrences}.`,
        metadata: {
          fingerprint,
          signalType: signal.signalType,
          occurrences: track.occurrences,
          lastSeenAt: new Date(now).toISOString(),
          rawMetadata: signal.rawMetadata,
        },
      });

      // Update incident metadata timestamp
      this.incidentRepo.updateIncidentMetadata(activeIncidentId, {});

      return {
        incidentId: activeIncidentId,
        isNewIncident: false,
        isDeduplicated: true,
        isSnoozed: false,
        occurrences: track.occurrences,
      };
    }

    // 4. Creation branch: create a new incident in DETECTADO status
    const createdIncident = this.incidentRepo.createIncident({
      clusterId: signal.clusterId,
      namespace: signal.namespace,
      workloadKind: signal.resourceKind,
      workloadName: signal.resourceName,
      title: signal.title,
      description: signal.message,
      severity: signal.severity,
      creator: {
        type: "system",
        id: "local-scanner",
        name: "Local Incident Scanner",
      },
      initialMessage: `Incidente detectado automáticamente por escáner local (${signal.signalType}). Señal inicial registrada.`,
    });

    // Record fingerprint in initial timeline
    this.incidentRepo.addTimelineEntry({
      incidentId: createdIncident.id,
      authorType: "system",
      authorName: "Local Incident Scanner",
      message: `Huella determinística registrada: ${fingerprint}`,
      metadata: {
        fingerprint,
        signalType: signal.signalType,
        occurrences: 1,
        rawMetadata: signal.rawMetadata,
      },
    });

    this.trackedSignals.set(fingerprint, {
      incidentId: createdIncident.id,
      fingerprint,
      firstSeenAt: now,
      lastSeenAt: now,
      occurrences: 1,
    });

    return {
      incidentId: createdIncident.id,
      isNewIncident: true,
      isDeduplicated: false,
      isSnoozed: false,
      occurrences: 1,
    };
  }

  /**
   * Handles user actions on alerts: analyze_now, snooze, or dismiss.
   * STRICT SAFETY INVARIANT: None of these actions execute AI or mutate Kubernetes.
   */
  public handleAlertAction(payload: ScannerAlertActionPayload): ScannerAlertActionResult {
    const { incidentId, action, snoozeDurationMs, dismissReason, operatorName = "Operador" } = payload;
    const incident = this.incidentRepo.getIncidentById(incidentId);

    if (!incident) {
      throw new Error(`Incident with id '${incidentId}' not found`);
    }

    if (action === "snooze") {
      const duration = snoozeDurationMs && snoozeDurationMs > 0 ? snoozeDurationMs : 15 * 60 * 1000; // default 15m
      const snoozeUntil = new Date(Date.now() + duration).toISOString();

      // Find and update track
      for (const entry of this.trackedSignals.values()) {
        if (entry.incidentId === incidentId) {
          entry.snoozedUntil = Date.now() + duration;
        }
      }

      this.incidentRepo.addTimelineEntry({
        incidentId,
        authorType: "human",
        authorName: operatorName,
        message: `Alerta pospuesta por ${operatorName} hasta ${snoozeUntil}.`,
        metadata: {
          action: "snooze",
          snoozeDurationMs: duration,
          snoozeUntil,
        },
      });

      return {
        success: true,
        incidentId,
        action: "snooze",
        message: `Alerta pospuesta exitosamente hasta ${snoozeUntil}`,
        snoozeUntil,
      };
    }

    if (action === "dismiss") {
      const reason = dismissReason?.trim() || "Descartado por operador como no accionable o falso positivo";
      const targetStatus: IncidentStatus = incident.status === "DETECTADO" ? "NO CONFIRMADO" : "CERRADO";

      // Transition incident according to state machine
      this.incidentRepo.transitionStatus({
        incidentId,
        toStatus: targetStatus,
        actor: {
          type: "human",
          id: "human-operator",
          name: operatorName,
        },
        justification: reason,
        reason,
      });

      // Clear from tracked signals
      for (const [fp, entry] of this.trackedSignals.entries()) {
        if (entry.incidentId === incidentId) {
          this.trackedSignals.delete(fp);
        }
      }

      return {
        success: true,
        incidentId,
        action: "dismiss",
        message: `Incidente descartado exitosamente (${targetStatus}): ${reason}`,
      };
    }

    if (action === "analyze_now") {
      // Analyze now selects the incident for human investigation in Workbench.
      // DOES NOT run AI automatically!
      this.incidentRepo.addTimelineEntry({
        incidentId,
        authorType: "human",
        authorName: operatorName,
        message: `Operador inició investigación manual en Incident Workbench.`,
        metadata: { action: "analyze_now" },
      });

      return {
        success: true,
        incidentId,
        action: "analyze_now",
        message: `Incidente seleccionado para investigación manual en Workbench.`,
      };
    }

    throw new Error(`Acción de alerta no reconocida: '${action}'`);
  }

  /**
   * Resets in-memory tracking state cleanly.
   */
  public clearTracking(): void {
    this.trackedSignals.clear();
  }

  /**
   * Gets current count of active tracked signals.
   */
  public getTrackedCount(): number {
    return this.trackedSignals.size;
  }
}
