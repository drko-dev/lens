/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { LocalIncidentScanner } from "../local-incident-scanner";
import { IncidentDeduplicator } from "../incident-deduplicator";
import { DeterministicRulesEngine } from "../deterministic-rules-engine";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import type { LocalScannerSignal } from "../../../common/incident/local-scanner-types";

describe("H8-025: Resilience, Performance & Resource Control", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let scanner: LocalIncidentScanner;
  let deduplicator: IncidentDeduplicator;

  const clusterId = "resilience-cluster";
  const namespace = "load-testing";

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();
    incidentRepo = new IncidentRepository(sqlite);
    deduplicator = new IncidentDeduplicator(incidentRepo);
    scanner = new LocalIncidentScanner(incidentRepo, undefined, deduplicator);
  });

  afterEach(() => {
    scanner.dispose();
    sqlite.close();
  });

  describe("RES-01: Rapid Start / Stop Cycles & Zero Leaked Handlers", () => {
    it("safely handles 50 rapid start/stop cycles without leaving lingering intervals or duplicate watchers", async () => {
      for (let i = 0; i < 50; i++) {
        await scanner.start({ clusterId, namespace: `ns-${i}` });
        const startedStatus = scanner.getStatus();
        expect(startedStatus.isEnabled).toBe(true);
        expect(startedStatus.activeWatchersCount).toBe(0); // Pure synthetic feed

        await scanner.stop();
        const stoppedStatus = scanner.getStatus();
        expect(stoppedStatus.isEnabled).toBe(false);
      }

      scanner.dispose();
      const finalStatus = scanner.getStatus();
      expect(finalStatus.isEnabled).toBe(false);
      expect(finalStatus.activeWatchersCount).toBe(0);
    });
  });

  describe("RES-02: Burst Performance & Latency Budget (H86-GATE-03)", () => {
    it("processes a burst of 100 signals under 50ms average per signal, consolidating timeline volume", async () => {
      await scanner.start({ clusterId, namespace });

      const signal: LocalScannerSignal = {
        signalType: "CRASH_LOOP_BACKOFF",
        clusterId,
        namespace,
        resourceKind: "Pod",
        resourceName: "burst-pod",
        resourceUid: "uid-burst-1",
        severity: "high",
        title: "CrashLoopBackOff burst",
        message: "Container crashing in rapid loop",
        detectedAt: new Date().toISOString(),
        fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
          clusterId,
          namespace,
          "Pod",
          "burst-pod",
          "CRASH_LOOP_BACKOFF",
          "uid-burst-1",
        ),
      };

      const startTime = Date.now();
      const BURST_COUNT = 100;

      let lastResult: any;
      for (let i = 0; i < BURST_COUNT; i++) {
        lastResult = await deduplicator.ingestSignal(signal, 60000); // 60s cooldown
      }

      const totalElapsedMs = Date.now() - startTime;
      const avgLatencyPerSignal = totalElapsedMs / BURST_COUNT;

      // Ensure latency budget is respected (< 50ms per signal in SQLite transaction)
      expect(avgLatencyPerSignal).toBeLessThan(50);

      // Verify that deduplicator tracked occurrences up to BURST_COUNT
      expect(lastResult.occurrences).toBe(BURST_COUNT);

      // Verify that timeline volume is rate-limited and consolidated
      const incidents = incidentRepo.listIncidents();
      expect(incidents.length).toBe(1);

      const timeline = incidentRepo.getTimeline(incidents[0].id);
      const recurringEntries = timeline.filter(t => t.message.includes("Señal recurrente"));
      expect(recurringEntries.length).toBeLessThanOrEqual(2);
    });
  });

  describe("RES-03: Pod Deletion & Recreation with New Resource UID", () => {
    it("distinguishes resurrected pods with new UIDs, creating separate tracking while preserving deterministic dedupe", async () => {
      const podName = "stateful-app-0";

      // Original Pod with uid-orig-1
      const signalOriginal: LocalScannerSignal = {
        signalType: "OOM_KILLED",
        clusterId,
        namespace,
        resourceKind: "Pod",
        resourceName: podName,
        resourceUid: "uid-orig-1",
        severity: "critical",
        title: `OOMKilled in ${podName}`,
        message: "OOM killed exit code 137",
        detectedAt: new Date().toISOString(),
        fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
          clusterId,
          namespace,
          "Pod",
          podName,
          "OOM_KILLED",
          "uid-orig-1",
        ),
      };

      const resOrig = await deduplicator.ingestSignal(signalOriginal);
      expect(resOrig.isNewIncident).toBe(true);

      // Dismiss the original incident
      deduplicator.handleAlertAction({
        incidentId: resOrig.incidentId,
        action: "dismiss",
        dismissReason: "Original pod deleted by operator",
      });

      // Pod is recreated with a new UID: uid-recreated-2
      const signalRecreated: LocalScannerSignal = {
        signalType: "OOM_KILLED",
        clusterId,
        namespace,
        resourceKind: "Pod",
        resourceName: podName,
        resourceUid: "uid-recreated-2",
        severity: "critical",
        title: `OOMKilled in ${podName}`,
        message: "OOM killed exit code 137",
        detectedAt: new Date().toISOString(),
        fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
          clusterId,
          namespace,
          "Pod",
          podName,
          "OOM_KILLED",
          "uid-recreated-2",
        ),
      };

      // Since the original was dismissed and the new signal has a distinct UID/fingerprint,
      // it must create a new active incident without resurrecting or mutating the closed incident
      const resNew = await deduplicator.ingestSignal(signalRecreated);
      expect(resNew.isNewIncident).toBe(true);
      expect(resNew.incidentId).not.toBe(resOrig.incidentId);

      const all = incidentRepo.listIncidents();
      expect(all.length).toBe(2);

      const oldInc = incidentRepo.getIncidentById(resOrig.incidentId);
      expect(oldInc?.status).toBe("NO CONFIRMADO");

      const newInc = incidentRepo.getIncidentById(resNew.incidentId);
      expect(newInc?.status).toBe("DETECTADO");
    });
  });

  describe("RES-04: Concurrent Actions & Re-entrancy Safety", () => {
    it("handles concurrent snooze, dismiss and signal ingests safely via atomic SQLite transactions", async () => {
      const signal: LocalScannerSignal = {
        signalType: "WARNING_EVENT",
        clusterId,
        namespace,
        resourceKind: "Pod",
        resourceName: "concurrent-worker",
        resourceUid: "uid-worker-c",
        severity: "medium",
        title: "Warning event",
        message: "Back-off restarting failed container",
        detectedAt: new Date().toISOString(),
        fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
          clusterId,
          namespace,
          "Pod",
          "concurrent-worker",
          "WARNING_EVENT",
          "uid-worker-c",
        ),
      };

      const created = await deduplicator.ingestSignal(signal);

      // Concurrently run snooze, ingestSignal, and analyze_now
      await Promise.all([
        deduplicator.ingestSignal(signal),
        Promise.resolve(deduplicator.handleAlertAction({
          incidentId: created.incidentId,
          action: "snooze",
          snoozeDurationMs: 30000,
        })),
        Promise.resolve(deduplicator.handleAlertAction({
          incidentId: created.incidentId,
          action: "analyze_now",
        })),
      ]);

      const incident = incidentRepo.getIncidentById(created.incidentId);
      expect(incident).toBeDefined();

      const timeline = incidentRepo.getTimeline(created.incidentId);
      expect(timeline.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("RES-05: State Persistence Across Cold Starts", () => {
    it("persists deduplication state in SQLite and respects open incidents across new deduplicator instances", async () => {
      const signal: LocalScannerSignal = {
        signalType: "IMAGE_PULL_BACKOFF",
        clusterId,
        namespace,
        resourceKind: "Pod",
        resourceName: "cold-start-pod",
        resourceUid: "uid-cold-1",
        severity: "high",
        title: "ImagePullBackOff",
        message: "Failed to pull image registry.local/app:v1",
        detectedAt: new Date().toISOString(),
        fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
          clusterId,
          namespace,
          "Pod",
          "cold-start-pod",
          "IMAGE_PULL_BACKOFF",
          "uid-cold-1",
        ),
      };

      const first = await deduplicator.ingestSignal(signal);
      expect(first.isNewIncident).toBe(true);

      // Create a brand new deduplicator with empty in-memory tracking
      const freshDeduplicator = new IncidentDeduplicator(incidentRepo);
      expect(freshDeduplicator.getTrackedCount()).toBe(0);

      // Ingest signal into fresh instance
      const second = await freshDeduplicator.ingestSignal(signal);
      expect(second.isNewIncident).toBe(false);
      expect(second.isDeduplicated).toBe(true);
      expect(second.incidentId).toBe(first.incidentId);

      // No duplicated incidents created
      const allIncidents = incidentRepo.listIncidents();
      expect(allIncidents.length).toBe(1);
    });
  });
});
