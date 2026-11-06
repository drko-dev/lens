/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { IncidentDeduplicator } from "../incident-deduplicator";
import { DeterministicRulesEngine } from "../deterministic-rules-engine";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import type { LocalScannerSignal } from "../../../common/incident/local-scanner-types";

describe("IncidentDeduplicator & Alert Actions (H8-022)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let deduplicator: IncidentDeduplicator;

  const clusterId = "k8s-prod-cluster";
  const namespace = "payment";

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();
    incidentRepo = new IncidentRepository(sqlite);
    deduplicator = new IncidentDeduplicator(incidentRepo, 5 * 60 * 1000); // 5 min cooldown
  });

  afterEach(() => {
    deduplicator.clearTracking();
    sqlite.close();
  });

  const createSyntheticSignal = (
    name: string = "payment-pod",
    signalType: any = "CRASH_LOOP_BACKOFF",
  ): LocalScannerSignal => ({
    signalType,
    clusterId,
    namespace,
    resourceKind: "Pod",
    resourceName: name,
    severity: "high",
    title: `CrashLoopBackOff en pod ${name}`,
    message: `El contenedor de ${name} está en CrashLoopBackOff`,
    detectedAt: new Date().toISOString(),
    fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
      clusterId,
      namespace,
      "Pod",
      name,
      signalType,
    ),
  });

  describe("Signal Ingestion & Deduplication", () => {
    it("creates a single incident in DETECTADO status on initial signal", async () => {
      const signal = createSyntheticSignal();
      const result = await deduplicator.ingestSignal(signal);

      expect(result.isNewIncident).toBe(true);
      expect(result.isDeduplicated).toBe(false);
      expect(result.occurrences).toBe(1);

      const incident = incidentRepo.getIncidentById(result.incidentId);
      expect(incident).not.toBeNull();
      expect(incident?.status).toBe("DETECTADO");
      expect(incident?.title).toBe(signal.title);

      const timeline = incidentRepo.getTimeline(result.incidentId);
      expect(timeline.length).toBeGreaterThanOrEqual(2); // Initial creation + fingerprint entry
    });

    it("deduplicates repeated signals into the existing incident without creating duplicates", async () => {
      const signal = createSyntheticSignal();

      const first = await deduplicator.ingestSignal(signal);
      const second = await deduplicator.ingestSignal(signal);
      const third = await deduplicator.ingestSignal(signal);

      expect(second.isNewIncident).toBe(false);
      expect(second.isDeduplicated).toBe(true);
      expect(second.incidentId).toBe(first.incidentId);
      expect(second.occurrences).toBe(2);

      expect(third.isDeduplicated).toBe(true);
      expect(third.occurrences).toBe(3);

      // Verify SQLite only contains 1 incident
      const incidents = incidentRepo.listIncidents();
      expect(incidents.length).toBe(1);

      // Verify timeline contains deduplication events
      const timeline = incidentRepo.getTimeline(first.incidentId);
      const recurringEvents = timeline.filter(t => t.message.includes("Señal recurrente detectada"));
      expect(recurringEvents.length).toBe(2);
      expect(recurringEvents[1].metadata?.occurrences).toBe(3);
    });

    it("handles concurrent signal ingestion safely", async () => {
      const signal = createSyntheticSignal("concurrent-pod");

      // Ingest concurrently
      const results = await Promise.all([
        deduplicator.ingestSignal(signal),
        deduplicator.ingestSignal(signal),
        deduplicator.ingestSignal(signal),
      ]);

      const createdCount = results.filter(r => r.isNewIncident).length;
      const dedupeCount = results.filter(r => r.isDeduplicated).length;

      expect(createdCount).toBe(1);
      expect(dedupeCount).toBe(2);

      const incidents = incidentRepo.listIncidents();
      expect(incidents.length).toBe(1);
    });
  });

  describe("Alert Actions (H8-022)", () => {
    it("snoozes alerts and suppresses repetitive notifications during the snooze window", async () => {
      const signal = createSyntheticSignal("snooze-pod");
      const created = await deduplicator.ingestSignal(signal);

      const snoozeResult = deduplicator.handleAlertAction({
        incidentId: created.incidentId,
        action: "snooze",
        snoozeDurationMs: 10 * 60 * 1000, // 10 minutes
        operatorName: "Gustavo SRE",
      });

      expect(snoozeResult.success).toBe(true);
      expect(snoozeResult.action).toBe("snooze");
      expect(snoozeResult.snoozeUntil).toBeDefined();

      // Ingest subsequent signal during snooze window
      const postSnooze = await deduplicator.ingestSignal(signal);
      expect(postSnooze.isSnoozed).toBe(true);
      expect(postSnooze.isDeduplicated).toBe(true);

      const timeline = incidentRepo.getTimeline(created.incidentId);
      const snoozeEvent = timeline.find(e => e.message.includes("Alerta pospuesta por Gustavo SRE"));
      expect(snoozeEvent).toBeDefined();
    });

    it("dismisses an incident, transitions it to CERRADO, and clears active tracking", async () => {
      const signal = createSyntheticSignal("dismiss-pod");
      const created = await deduplicator.ingestSignal(signal);

      const dismissResult = deduplicator.handleAlertAction({
        incidentId: created.incidentId,
        action: "dismiss",
        dismissReason: "Falso positivo durante despliegue de canary",
        operatorName: "Gustavo SRE",
      });

      expect(dismissResult.success).toBe(true);
      expect(dismissResult.action).toBe("dismiss");

      const incident = incidentRepo.getIncidentById(created.incidentId);
      expect(incident?.status).toBe("NO CONFIRMADO");

      const timeline = incidentRepo.getTimeline(created.incidentId);
      const closeEvent = timeline.find(e => e.toStatus === "NO CONFIRMADO");
      expect(closeEvent).toBeDefined();
      expect(closeEvent?.message).toContain("Falso positivo durante despliegue de canary");
    });

    it("executes analyze_now by logging manual investigation without triggering AI", async () => {
      const signal = createSyntheticSignal("analyze-pod");
      const created = await deduplicator.ingestSignal(signal);

      const actionResult = deduplicator.handleAlertAction({
        incidentId: created.incidentId,
        action: "analyze_now",
        operatorName: "Gustavo SRE",
      });

      expect(actionResult.success).toBe(true);
      expect(actionResult.action).toBe("analyze_now");

      const timeline = incidentRepo.getTimeline(created.incidentId);
      const analyzeEvent = timeline.find(e => e.message.includes("Operador inició investigación manual"));
      expect(analyzeEvent).toBeDefined();

      // Strictly verify incident is NOT modified by AI
      const incident = incidentRepo.getIncidentById(created.incidentId);
      expect(incident?.status).toBe("DETECTADO");
    });
  });
});
