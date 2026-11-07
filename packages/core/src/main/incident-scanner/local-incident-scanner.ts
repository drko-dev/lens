/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { DeterministicRulesEngine } from "./deterministic-rules-engine";
import { IncidentDeduplicator } from "./incident-deduplicator";
import type { IncidentRepository } from "../incident-storage/incident-repository";
import type {
  K8sSnapshot,
  LocalScannerOptions,
  LocalScannerScope,
  LocalScannerSignal,
  LocalScannerStatus,
  ScannerAlertActionPayload,
  ScannerAlertActionResult,
} from "../../common/incident/local-scanner-types";

export class LocalIncidentScanner {
  // CRITICAL INVARIANT: Disabled by default
  private isEnabled = false;
  private currentScope?: LocalScannerScope;
  private currentOptions: LocalScannerOptions = {
    scanIntervalMs: 10000,
    cooldownPeriodMs: 5 * 60 * 1000,
    restartThreshold: 3,
    restartWindowMs: 10 * 60 * 1000,
  };

  private startedAt?: string;
  private stoppedAt?: string;
  private lastScanAt?: string;
  private scanCount = 0;
  private activeWatchersCount = 0;
  private signalsDetectedCount = 0;
  private deduplicatedCount = 0;
  private incidentsCreatedCount = 0;
  private dismissedCount = 0;
  private snoozedCount = 0;
  private lastError?: string;

  private scanIntervalTimer?: NodeJS.Timeout;
  private readonly rulesEngine: DeterministicRulesEngine;
  private readonly deduplicator: IncidentDeduplicator;

  constructor(
    incidentRepo: IncidentRepository,
    rulesEngine?: DeterministicRulesEngine,
    deduplicator?: IncidentDeduplicator,
  ) {
    this.rulesEngine = rulesEngine ?? new DeterministicRulesEngine();
    this.deduplicator = deduplicator ?? new IncidentDeduplicator(incidentRepo);
  }

  /**
   * Returns current status of the scanner.
   */
  public getStatus(): LocalScannerStatus {
    return {
      isEnabled: this.isEnabled,
      scope: this.currentScope ? { ...this.currentScope } : undefined,
      sourceType: "synthetic_feed",
      isSyntheticDemo: true,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastScanAt: this.lastScanAt,
      scanCount: this.scanCount,
      activeWatchersCount: this.activeWatchersCount, // CRITICAL H86-GATE-01: Zero real watchers; purely synthetic feed in MVP DEMO
      signalsDetectedCount: this.signalsDetectedCount,
      deduplicatedCount: this.deduplicatedCount,
      incidentsCreatedCount: this.incidentsCreatedCount,
      dismissedCount: this.dismissedCount,
      snoozedCount: this.snoozedCount,
      lastError: this.lastError,
    };
  }

  /**
   * Explicit opt-in activation of the scanner for a given scope.
   */
  public async start(scope: LocalScannerScope, options?: LocalScannerOptions): Promise<LocalScannerStatus> {
    if (!scope.clusterId || scope.clusterId.trim().length === 0) {
      throw new Error("clusterId is required to start local incident scanner");
    }

    // Stop existing scheduler if running to prevent duplicated watchers/schedulers
    this.stopScheduler();

    this.currentScope = { ...scope };
    if (options) {
      this.currentOptions = {
        ...this.currentOptions,
        ...options,
      };
    }

    this.isEnabled = true;
    this.startedAt = new Date().toISOString();
    this.stoppedAt = undefined;
    this.lastError = undefined;
    this.activeWatchersCount = 0; // H86-GATE-01: No fake watcher metrics

    return this.getStatus();
  }

  /**
   * Explicit stop: immediately stops all timers, watchers, and scanning activity.
   */
  public async stop(): Promise<LocalScannerStatus> {
    this.stopScheduler();
    this.isEnabled = false;
    this.activeWatchersCount = 0;
    this.stoppedAt = new Date().toISOString();
    return this.getStatus();
  }

  /**
   * Ingests and processes a Kubernetes snapshot deterministically.
   * Can be called periodically or triggered by synthetic test feeds.
   */
  public async processSnapshot(snapshot: K8sSnapshot): Promise<LocalScannerSignal[]> {
    if (!this.isEnabled || !this.currentScope) {
      throw new Error("Local incident scanner is stopped or disabled. Cannot process snapshot.");
    }

    try {
      this.scanCount++;
      this.lastScanAt = new Date().toISOString();

      const signals = this.rulesEngine.evaluateSnapshot(snapshot, {
        clusterId: this.currentScope.clusterId,
        scopeNamespace: this.currentScope.namespace,
        options: this.currentOptions,
      });

      this.signalsDetectedCount += signals.length;

      for (const signal of signals) {
        // Enforce resourceKind filter if specified in scope
        if (this.currentScope.resourceKind && signal.resourceKind.toLowerCase() !== this.currentScope.resourceKind.toLowerCase()) {
          continue;
        }

        // Enforce resourceName filter if specified in scope
        if (this.currentScope.resourceName && signal.resourceName.toLowerCase() !== this.currentScope.resourceName.toLowerCase()) {
          continue;
        }

        const result = await this.deduplicator.ingestSignal(signal, this.currentOptions.cooldownPeriodMs);

        if (result.isNewIncident) {
          this.incidentsCreatedCount++;
        } else if (result.isDeduplicated) {
          this.deduplicatedCount++;
          if (result.isSnoozed) {
            this.snoozedCount++;
          }
        }
      }

      return signals;
    } catch (err: any) {
      this.lastError = err?.message || String(err);
      throw err;
    }
  }

  /**
   * Dispatches user alert actions (analyze_now, snooze, dismiss).
   * STRICT SAFETY INVARIANT: None of these trigger AI or mutate Kubernetes.
   */
  public handleAlertAction(payload: ScannerAlertActionPayload): ScannerAlertActionResult {
    const result = this.deduplicator.handleAlertAction(payload);
    if (payload.action === "dismiss") {
      this.dismissedCount++;
    } else if (payload.action === "snooze") {
      this.snoozedCount++;
    }
    return result;
  }

  /**
   * Stops any background interval timer and cleans up references.
   */
  private stopScheduler(): void {
    if (this.scanIntervalTimer) {
      clearInterval(this.scanIntervalTimer);
      this.scanIntervalTimer = undefined;
    }
  }

  /**
   * Complete tear-down for app shutdown, cluster switch, or test disposal.
   * Guarantees 0 lingering intervals, timers, or watchers.
   */
  public dispose(): void {
    this.stopScheduler();
    this.isEnabled = false;
    this.activeWatchersCount = 0;
    this.stoppedAt = new Date().toISOString();
    this.deduplicator.clearTracking();
  }
}
