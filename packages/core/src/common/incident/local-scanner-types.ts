/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type { IncidentSeverity } from "./incident-types";

export type ScannerSignalType =
  | "CRASH_LOOP_BACKOFF"
  | "IMAGE_PULL_BACKOFF"
  | "OOM_KILLED"
  | "ABNORMAL_RESTARTS"
  | "NODE_NOT_READY"
  | "ROLLOUT_DEGRADED"
  | "WARNING_EVENT";

export interface LocalScannerScope {
  clusterId: string;
  namespace?: string;
  resourceKind?: string;
  resourceName?: string;
}

export interface LocalScannerOptions {
  scanIntervalMs?: number; // default: 10000ms, min: 1000ms, max: 60000ms
  cooldownPeriodMs?: number; // default: 300000ms (5m), min: 5000ms
  restartThreshold?: number; // default: 3 restarts
  restartWindowMs?: number; // default: 600000ms (10m)
}

export interface LocalScannerSignal {
  signalType: ScannerSignalType;
  clusterId: string;
  namespace: string;
  resourceKind: string;
  resourceName: string;
  resourceUid?: string;
  severity: IncidentSeverity;
  title: string;
  message: string;
  detectedAt: string;
  fingerprint: string;
  rawMetadata?: Record<string, any>;
}

export interface LocalScannerStatus {
  isEnabled: boolean;
  scope?: LocalScannerScope;
  sourceType?: "synthetic_feed" | "k8s_watcher";
  isSyntheticDemo?: boolean;
  startedAt?: string;
  stoppedAt?: string;
  lastScanAt?: string;
  scanCount: number;
  activeWatchersCount: number;
  signalsDetectedCount: number;
  deduplicatedCount: number;
  incidentsCreatedCount: number;
  dismissedCount: number;
  snoozedCount: number;
  lastError?: string;
}

export type ScannerAlertActionType = "analyze_now" | "snooze" | "dismiss";

export interface ScannerAlertActionPayload {
  incidentId: string;
  action: ScannerAlertActionType;
  snoozeDurationMs?: number; // e.g. 15m (900000ms), 1h (3600000ms)
  dismissReason?: string;
  operatorName?: string;
}

export interface ScannerAlertActionResult {
  success: boolean;
  incidentId: string;
  action: ScannerAlertActionType;
  message: string;
  snoozeUntil?: string;
}

// Lightweight Kubernetes object representations for deterministic local scanning
export interface K8sContainerStateWaiting {
  reason: string;
  message?: string;
}

export interface K8sContainerStateTerminated {
  reason?: string;
  exitCode: number;
  message?: string;
  finishedAt?: string;
}

export interface K8sContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  state?: {
    waiting?: K8sContainerStateWaiting;
    terminated?: K8sContainerStateTerminated;
    running?: { startedAt?: string };
  };
  lastState?: {
    terminated?: K8sContainerStateTerminated;
    waiting?: K8sContainerStateWaiting;
  };
}

export interface K8sPodObject {
  kind: "Pod";
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
  };
  status?: {
    phase?: string;
    containerStatuses?: K8sContainerStatus[];
    initContainerStatuses?: K8sContainerStatus[];
  };
}

export interface K8sNodeCondition {
  type: string;
  status: "True" | "False" | "Unknown";
  reason?: string;
  message?: string;
}

export interface K8sNodeObject {
  kind: "Node";
  metadata: {
    name: string;
    uid?: string;
    labels?: Record<string, string>;
  };
  status?: {
    conditions?: K8sNodeCondition[];
  };
}

export interface K8sWorkloadObject {
  kind: "Deployment" | "StatefulSet" | "DaemonSet";
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    generation?: number;
  };
  spec?: {
    replicas?: number;
  };
  status?: {
    observedGeneration?: number;
    replicas?: number;
    readyReplicas?: number;
    availableReplicas?: number;
    updatedReplicas?: number;
    conditions?: Array<{
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }>;
  };
}

export interface K8sEventObject {
  kind: "Event";
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
  };
  type: "Normal" | "Warning" | string;
  reason: string;
  message: string;
  involvedObject: {
    kind: string;
    name: string;
    namespace?: string;
    uid?: string;
  };
  count?: number;
  lastTimestamp?: string;
}

export interface K8sSnapshot {
  pods?: K8sPodObject[];
  nodes?: K8sNodeObject[];
  workloads?: K8sWorkloadObject[];
  events?: K8sEventObject[];
}
