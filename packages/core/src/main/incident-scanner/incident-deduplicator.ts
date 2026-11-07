/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IncidentRepository } from "../incident-storage/incident-repository";
import { EvidenceSanitizer } from "../incident-storage/evidence-sanitizer";
import type {
  LocalScannerSignal,
  ScannerAlertActionPayload,
  ScannerAlertActionResult,
} from "../../common/incident/local-scanner-types";
import type { IncidentActor, IncidentStatus } from "../../common/incident/incident-types";

interface SignalTrackEntry {
  incidentId: string;
  fingerprint: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastTimelineAt?: number;
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
   * Sanitizes arbitrary metadata objects recursively, redacting credentials
   * and dropping prototype pollution vectors.
   */
  private sanitizeMetadata(obj: any): any {
    if (!obj || typeof obj !== "object") {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeMetadata(item));
    }
    const clean: Record<string, any> = {};
    const sensitiveKeyPatterns = ["password", "passwd", "pwd", "token", "secret", "apikey", "credential", "authorization"];
    for (const [key, value] of Object.entries(obj)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }
      const isKeySensitive = sensitiveKeyPatterns.some(pat => key.toLowerCase().includes(pat));
      if (typeof value === "string") {
        if (isKeySensitive) {
          clean[key] = "[REDACTED_TOKEN]";
        } else {
          clean[key] = EvidenceSanitizer.sanitize(value).sanitizedContent;
        }
      } else if (typeof value === "object" && value !== null) {
        clean[key] = this.sanitizeMetadata(value);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }

  /**
   * Processes a detected signal: deduplicates against open incidents,
   * respects cooldown/snooze, or creates a new incident atomically inside a SQLite transaction.
   * STRICT SECURITY GATE H86-GATE-03 & H86-GATE-05:
   * - Sanitizes all titles, messages, and metadata before persistence.
   * - Executes atomicity via transaction wrapper.
   * - Employs rate-limiting on timeline volume during cooldown periods.
   */
  public async ingestSignal(signal: LocalScannerSignal, cooldownMs?: number): Promise<IngestSignalResult> {
    const effectiveCooldown = cooldownMs ?? this.defaultCooldownMs;
    const now = Date.now();
    const fingerprint = signal.fingerprint;

    // Sanitize untrusted input fields prior to persistence or matching
    const cleanTitle = EvidenceSanitizer.sanitize(signal.title).sanitizedContent;
    const cleanMessage = EvidenceSanitizer.sanitize(signal.message).sanitizedContent;
    const cleanMetadata = this.sanitizeMetadata(signal.rawMetadata);

    return this.incidentRepo.transaction(() => {
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

      // 2. Check in SQLite if the tracked incident is still open or search by fingerprint / resource
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

      // If not in-memory (e.g. process restart), query open incident by indexed fingerprint in SQLite
      // (RC-RES-01: Removed ambiguous fallback by resource name to prevent cross-signal and recreated pod collisions)
      if (!activeIncidentId) {
        const openByFp = this.incidentRepo.findOpenIncidentByFingerprint(fingerprint);
        if (openByFp && OPEN_STATUSES.includes(openByFp.status)) {
          activeIncidentId = openByFp.id;
        }
      }

      // 3. Deduplication branch: update existing incident atomically
      if (activeIncidentId) {
        const track = this.trackedSignals.get(fingerprint) ?? {
          incidentId: activeIncidentId,
          fingerprint,
          firstSeenAt: now,
          lastSeenAt: now,
          lastTimelineAt: now,
          occurrences: 1,
        };

        track.occurrences++;
        track.lastSeenAt = now;
        this.trackedSignals.set(fingerprint, track);

        // Limit timeline entries: record recurring signal on first duplication or after cooldown interval
        const lastTimeline = track.lastTimelineAt ?? 0;
        const shouldAppendTimeline = track.occurrences === 2 || (now - lastTimeline >= effectiveCooldown);

        if (shouldAppendTimeline) {
          this.incidentRepo.addTimelineEntry({
            incidentId: activeIncidentId,
            authorType: "system",
            authorName: "Local Incident Scanner",
            message: `Señal recurrente detectada (${signal.signalType}): ${cleanTitle}. Ocurrencias consolidadas: ${track.occurrences}.`,
            metadata: {
              fingerprint,
              signalType: signal.signalType,
              occurrences: track.occurrences,
              lastSeenAt: new Date(now).toISOString(),
              rawMetadata: cleanMetadata,
            },
          });
          track.lastTimelineAt = now;
        }

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

      // 4. Creation branch: create a new incident in DETECTADO status with indexed fingerprint
      const createdIncident = this.incidentRepo.createIncident({
        clusterId: signal.clusterId,
        namespace: signal.namespace,
        workloadKind: signal.resourceKind,
        workloadName: signal.resourceName,
        title: cleanTitle,
        description: cleanMessage,
        severity: signal.severity,
        fingerprint,
        resourceUid: signal.resourceUid,
        signalType: signal.signalType,
        creator: {
          type: "system",
          id: "synthetic-feed",
          name: "Synthetic Fixture Ingestion (Renderer Demo)",
        },
        initialMessage: `[DEMO SINTÉTICO] Incidente registrado desde feed sintético local (${signal.signalType}). Señal inicial validada y sanitizada.`,
      });

      // Record sanitized fingerprint in initial timeline
      this.incidentRepo.addTimelineEntry({
        incidentId: createdIncident.id,
        authorType: "system",
        authorName: "Local Incident Scanner (Synthetic Demo)",
        message: `Huella determinística registrada: ${fingerprint}`,
        metadata: {
          fingerprint,
          signalType: signal.signalType,
          resourceUid: signal.resourceUid,
          occurrences: 1,
          rawMetadata: cleanMetadata,
          sourceType: "synthetic_feed",
          isSyntheticDemo: true,
          provenance: "synthetic_renderer_snapshot",
        },
      });

      this.trackedSignals.set(fingerprint, {
        incidentId: createdIncident.id,
        fingerprint,
        firstSeenAt: now,
        lastSeenAt: now,
        lastTimelineAt: now,
        occurrences: 1,
      });

      return {
        incidentId: createdIncident.id,
        isNewIncident: true,
        isDeduplicated: false,
        isSnoozed: false,
        occurrences: 1,
      };
    });
  }

  /**
   * Handles user actions on alerts: analyze_now, snooze, or dismiss.
   * STRICT SAFETY INVARIANT H86-GATE-04:
   * - Dismiss is strictly limited to unconfirmed incidents in DETECTADO status, transitioning to NO CONFIRMADO.
   * - Dismiss CANNOT bypass privileged confirmation to transition to CERRADO.
   * - Operator identity is derived safely on Main; untrusted client names are sanitized and qualified.
   * - Does NOT execute AI or mutate Kubernetes.
   */
  public handleAlertAction(payload: ScannerAlertActionPayload): ScannerAlertActionResult {
    const { incidentId, action, snoozeDurationMs, dismissReason } = payload;
    const incident = this.incidentRepo.getIncidentById(incidentId);

    if (!incident) {
      throw new Error(`Incident with id '${incidentId}' not found`);
    }

    // RC-RES-02: Hardened operator identity derivation on Electron Main.
    // Client-supplied operatorName from Renderer is unverified input and CANNOT be trusted as an authenticated identity.
    // We explicitly record it as an unverified local operator, capturing any claimed name only in audit metadata.
    const rawClaimedName = payload.operatorName?.trim();
    const cleanClaimedName = rawClaimedName
      ? EvidenceSanitizer.sanitize(rawClaimedName).sanitizedContent.slice(0, 100)
      : undefined;

    const unverifiedActor: IncidentActor = {
      type: "human",
      id: "unverified-local-operator",
      name: cleanClaimedName
        ? `Operador Local (No verificado: ${cleanClaimedName})`
        : "Operador Local (No verificado)",
      authorizationContext: {
        role: "operator",
        tokenVerified: false,
      },
    };
    const actorDisplayName = unverifiedActor.name;

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
        authorName: actorDisplayName,
        message: `Alerta pospuesta por ${actorDisplayName} hasta ${snoozeUntil}.`,
        metadata: {
          action: "snooze",
          snoozeDurationMs: duration,
          snoozeUntil,
          actorId: unverifiedActor.id,
          claimedOperatorName: cleanClaimedName,
          isVerifiedIdentity: false,
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
      // H86-GATE-04: Enforce state machine boundaries. Alert dismissal is only permitted for DETECTADO.
      // Transition to CERRADO or privileged closing states requires the H8.1 privileged confirmation gate!
      if (incident.status !== "DETECTADO") {
        throw new Error(
          `Acción rechazada: No se puede descartar un incidente en estado '${incident.status}' mediante acción rápida de alerta. Transición a CERRADO requiere pasarela privilegiada H8.1.`,
        );
      }

      const targetStatus: IncidentStatus = "NO CONFIRMADO";
      const rawReason = dismissReason?.trim() || "Descartado por operador como no accionable o falso positivo";
      const cleanReason = EvidenceSanitizer.sanitize(rawReason)
        .sanitizedContent.slice(0, 500);

      // Transition incident according to state machine to NO CONFIRMADO
      this.incidentRepo.transitionStatus({
        incidentId,
        toStatus: targetStatus,
        actor: unverifiedActor,
        justification: cleanReason,
        metadata: {
          action: "dismiss",
          actorId: unverifiedActor.id,
          claimedOperatorName: cleanClaimedName,
          isVerifiedIdentity: false,
        },
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
        message: `Incidente descartado exitosamente (${targetStatus}): ${cleanReason}`,
      };
    }

    if (action === "analyze_now") {
      // Analyze now selects the incident for human investigation in Workbench.
      // DOES NOT run AI automatically!
      this.incidentRepo.addTimelineEntry({
        incidentId,
        authorType: "human",
        authorName: actorDisplayName,
        message: `${actorDisplayName} inició investigación manual en Incident Workbench.`,
        metadata: {
          action: "analyze_now",
          actorId: unverifiedActor.id,
          claimedOperatorName: cleanClaimedName,
          isVerifiedIdentity: false,
        },
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
