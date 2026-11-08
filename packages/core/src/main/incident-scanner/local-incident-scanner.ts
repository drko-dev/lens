/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { DeterministicRulesEngine } from "./deterministic-rules-engine";
import { IncidentDeduplicator } from "./incident-deduplicator";
import { SnapshotSourceSecurityError } from "./snapshot-source";
import { validateK8sSnapshot } from "../incident-storage/incident-ipc-validator";
import type { IncidentRepository } from "../incident-storage/incident-repository";
import type {
  K8sSnapshot,
  LocalScannerOptions,
  LocalScannerScope,
  LocalScannerSignal,
  LocalScannerStatus,
  ScannerAlertActionPayload,
  ScannerAlertActionResult,
  SnapshotSource,
  SnapshotUserSubject,
  SyntheticScenarioId,
} from "../../common/incident/local-scanner-types";

export interface ProcessSnapshotOptions {
  signal?: AbortSignal;
  referenceTimestampMs?: number;
}

export interface ScanFromSourceOptions {
  source?: SnapshotSource;
  targetClusterId?: string;
  targetNamespace?: string;
  user?: SnapshotUserSubject;
  scenarioId?: SyntheticScenarioId;
  requestedResources?: string[];
  requestedVerb?: string;
  requestedSubresource?: string;
  referenceTimestampMs?: number;
  signal?: AbortSignal;
}

export class LocalIncidentScanner {
  // CRITICAL INVARIANT: Disabled by default
  private isEnabled = false;
  private currentScope?: LocalScannerScope;
  private currentOptions: LocalScannerOptions = {
    scanIntervalMs: 10000,
    cooldownPeriodMs: 5 * 60 * 1000,
    restartThreshold: 3,
    restartWindowMs: 10 * 60 * 1000,
    maxEventAgeMs: 30 * 60 * 1000,
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
  private scopeGeneration = 0;

  private scanIntervalTimer?: NodeJS.Timeout;
  private readonly rulesEngine: DeterministicRulesEngine;
  private readonly deduplicator: IncidentDeduplicator;

  private readonly fakeSource?: SnapshotSource;
  private readonly realSource?: SnapshotSource;
  private activeSource?: SnapshotSource;
  private authorizedRealClusterId?: string;
  private authorizedRealNamespace?: string;
  private authorizedRealUser?: SnapshotUserSubject;

  constructor(
    incidentRepo: IncidentRepository,
    rulesEngine?: DeterministicRulesEngine,
    deduplicator?: IncidentDeduplicator,
    fakeSourceOrSource?: SnapshotSource,
    realSource?: SnapshotSource,
  ) {
    this.rulesEngine = rulesEngine ?? new DeterministicRulesEngine();
    this.deduplicator = deduplicator ?? new IncidentDeduplicator(incidentRepo);
    this.fakeSource = fakeSourceOrSource;
    this.realSource = realSource;
    this.activeSource = fakeSourceOrSource;
  }

  public setSnapshotSource(source: SnapshotSource): void {
    this.activeSource = source;
  }

  public getSnapshotSource(): SnapshotSource | undefined {
    return this.activeSource;
  }

  public getFakeSnapshotSource(): SnapshotSource | undefined {
    return this.fakeSource;
  }

  public getRealSnapshotSource(): SnapshotSource | undefined {
    return this.realSource;
  }

  public getActiveSourceMode(): "fake" | "real" {
    return this.activeSource === this.realSource && Boolean(this.authorizedRealClusterId) ? "real" : "fake";
  }

  /**
   * Explicitly authorizes and activates the real Kubernetes snapshot source.
   * Requires explicit operator consent and authentic user identity from Main.
   */
  public enableRealK8sSnapshotSource(params: {
    clusterId: string;
    namespace?: string;
    user: SnapshotUserSubject;
    hasExplicitConsent: boolean;
  }): void {
    if (!params.hasExplicitConsent) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Explicit operator consent is required to activate live Kubernetes cluster scanning.",
        403,
      );
    }
    if (!params.user?.isAuthenticated || !params.user.username) {
      throw new SnapshotSourceSecurityError(
        "MISSING_USER_IDENTITY",
        "Authenticated operator identity from Main is required to activate live Kubernetes cluster scanning.",
        401,
      );
    }
    const targetCluster = (params.clusterId || "").trim();
    if (!targetCluster) {
      throw new SnapshotSourceSecurityError(
        "CLUSTER_SCOPE_VIOLATION",
        "A non-empty clusterId is required to authorize live cluster scanning.",
        400,
      );
    }
    if (!this.realSource) {
      throw new SnapshotSourceSecurityError(
        "REAL_K8S_CONNECTIVITY_DISABLED",
        "Real Kubernetes snapshot source is not configured or available.",
        503,
      );
    }

    if (typeof (this.realSource as any).authorizeLiveCluster === "function") {
      (this.realSource as any).authorizeLiveCluster(targetCluster);
    }

    this.authorizedRealClusterId = targetCluster;
    this.authorizedRealNamespace = params.namespace?.trim();
    this.authorizedRealUser = { ...params.user };
    this.activeSource = this.realSource;
  }

  /**
   * Immediately revokes real cluster authorization and falls back to fake/synthetic source.
   */
  public disableRealK8sSnapshotSource(): void {
    if (this.realSource && typeof (this.realSource as any).revokeLiveAuthorization === "function") {
      (this.realSource as any).revokeLiveAuthorization();
    }
    this.authorizedRealClusterId = undefined;
    this.authorizedRealNamespace = undefined;
    this.authorizedRealUser = undefined;
    this.activeSource = this.fakeSource;
    this.scopeGeneration++;
  }

  /**
   * Returns current status of the scanner.
   */
  public getStatus(): LocalScannerStatus {
    const isReal = this.getActiveSourceMode() === "real";

    return {
      isEnabled: this.isEnabled,
      scope: this.currentScope ? { ...this.currentScope } : undefined,
      sourceType: isReal ? "k8s_watcher" : "synthetic_feed",
      isSyntheticDemo: !isReal,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastScanAt: this.lastScanAt,
      scanCount: this.scanCount,
      activeWatchersCount: this.activeWatchersCount,
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

    // If cluster changed from authorized real session, revoke real authorization and fall back to fake
    if (this.authorizedRealClusterId && this.authorizedRealClusterId !== scope.clusterId.trim()) {
      this.disableRealK8sSnapshotSource();
    }

    // Stop existing scheduler if running to prevent duplicated watchers/schedulers
    this.stopScheduler();
    this.scopeGeneration++;

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
    this.scopeGeneration++;
    this.disableRealK8sSnapshotSource();
    this.isEnabled = false;
    this.activeWatchersCount = 0;
    this.stoppedAt = new Date().toISOString();
    return this.getStatus();
  }

  /**
   * Collects a snapshot from the configured SnapshotSource and processes it deterministically.
   * Enforces scope isolation, size limits, cancellation, and TOCTOU cluster-switch protection.
   */
  public async scanFromSource(options: ScanFromSourceOptions = {}): Promise<LocalScannerSignal[]> {
    if (!this.isEnabled || !this.currentScope) {
      throw new Error("Local incident scanner is stopped or disabled. Cannot process snapshot.");
    }

    const source = options.source ?? this.activeSource;
    if (!source) {
      throw new Error("No SnapshotSource configured for local incident scanner.");
    }

    if (options.signal?.aborted) {
      throw new SnapshotSourceSecurityError(
        "OPERATION_ABORTED",
        "Scan from SnapshotSource aborted before execution.",
        499,
      );
    }

    const capturedGeneration = this.scopeGeneration;
    const capturedScope: LocalScannerScope = { ...this.currentScope };

    try {
      const envelope = await source.collectSnapshot({
        scope: capturedScope,
        targetClusterId: options.targetClusterId,
        targetNamespace: options.targetNamespace ?? this.authorizedRealNamespace,
        user: options.user ?? this.authorizedRealUser,
        scenarioId: options.scenarioId,
        requestedResources: options.requestedResources,
        requestedVerb: options.requestedVerb,
        requestedSubresource: options.requestedSubresource,
        referenceTimestampMs: options.referenceTimestampMs,
        maxEventAgeMs: this.currentOptions.maxEventAgeMs,
        signal: options.signal,
      });

      if (options.signal?.aborted) {
        throw new SnapshotSourceSecurityError(
          "OPERATION_ABORTED",
          "Scan from SnapshotSource aborted after snapshot collection.",
          499,
        );
      }

      if (
        !this.isEnabled ||
        !this.currentScope ||
        this.scopeGeneration !== capturedGeneration ||
        this.currentScope.clusterId !== capturedScope.clusterId ||
        this.currentScope.namespace !== capturedScope.namespace
      ) {
        throw new SnapshotSourceSecurityError(
          "OPERATION_ABORTED",
          "Scanner was stopped, disposed, or switched scope while snapshot collection was in flight.",
          499,
        );
      }

      if (envelope.clusterId !== capturedScope.clusterId) {
        throw new SnapshotSourceSecurityError(
          "CLUSTER_SCOPE_VIOLATION",
          `SnapshotSource returned cluster '${envelope.clusterId}' which does not match active scanner scope '${capturedScope.clusterId}'.`,
          403,
        );
      }

      if (
        capturedScope.namespace &&
        capturedScope.namespace !== "*" &&
        envelope.namespace !== capturedScope.namespace
      ) {
        throw new SnapshotSourceSecurityError(
          "NAMESPACE_SCOPE_VIOLATION",
          `SnapshotSource returned namespace '${envelope.namespace}' which does not match active scanner scope '${capturedScope.namespace}'.`,
          403,
        );
      }

      return await this.processSnapshot(envelope.snapshot, {
        signal: options.signal,
        referenceTimestampMs: options.referenceTimestampMs,
      });
    } catch (err: any) {
      this.lastError = err?.message || String(err);
      throw err;
    }
  }

  /**
   * Ingests and processes a Kubernetes snapshot deterministically.
   * Can be called periodically or triggered by synthetic test feeds.
   */
  public async processSnapshot(
    rawSnapshot: K8sSnapshot,
    options: ProcessSnapshotOptions = {},
  ): Promise<LocalScannerSignal[]> {
    if (!this.isEnabled || !this.currentScope) {
      throw new Error("Local incident scanner is stopped or disabled. Cannot process snapshot.");
    }

    if (options.signal?.aborted) {
      throw new SnapshotSourceSecurityError(
        "OPERATION_ABORTED",
        "Snapshot processing was aborted.",
        499,
      );
    }

    this.scanCount++;
    this.lastScanAt = new Date().toISOString();

    try {
      const snapshot = validateK8sSnapshot(rawSnapshot);

      const signals = this.rulesEngine.evaluateSnapshot(snapshot, {
        clusterId: this.currentScope.clusterId,
        scopeNamespace: this.currentScope.namespace,
        options: this.currentOptions,
        referenceTimestampMs: options.referenceTimestampMs,
      });

      const matchingSignals: LocalScannerSignal[] = [];

      for (const signal of signals) {
        // Enforce resourceKind filter if specified in scope
        if (this.currentScope.resourceKind && signal.resourceKind.toLowerCase() !== this.currentScope.resourceKind.toLowerCase()) {
          continue;
        }

        // Enforce resourceName filter if specified in scope
        if (this.currentScope.resourceName && signal.resourceName.toLowerCase() !== this.currentScope.resourceName.toLowerCase()) {
          continue;
        }

        matchingSignals.push(signal);
      }

      this.signalsDetectedCount += matchingSignals.length;

      for (const signal of matchingSignals) {
        if (options.signal?.aborted) {
          throw new SnapshotSourceSecurityError(
            "OPERATION_ABORTED",
            "Signal deduplication and persistence was aborted.",
            499,
          );
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
    this.scopeGeneration++;
    this.disableRealK8sSnapshotSource();
    this.isEnabled = false;
    this.activeWatchersCount = 0;
    this.stoppedAt = new Date().toISOString();
    this.deduplicator.clearTracking();
  }
}
