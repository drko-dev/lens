/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import type {
  K8sEventObject,
  K8sPodObject,
  K8sSnapshot,
  K8sWorkloadObject,
  SnapshotAllowedResourceKind,
  SnapshotAllowedVerb,
  SnapshotSource,
  SnapshotSourceEnvelope,
  SnapshotSourceRequest,
  SyntheticScenarioId,
} from "../../common/incident/local-scanner-types";
import { validateK8sSnapshot } from "../incident-storage/incident-ipc-validator";
import {
  SnapshotAuthorizationGate,
  SnapshotSourceSecurityError,
  type SnapshotAuthorizationGateOptions,
  type SnapshotRbacCheckParams,
} from "./snapshot-source";

export interface SimulatedForbiddenRule {
  clusterId?: string;
  namespace?: string;
  username?: string;
  resourceKind?: SnapshotAllowedResourceKind;
  verb?: SnapshotAllowedVerb;
}

export interface FakeK8sSnapshotSourceOptions extends SnapshotAuthorizationGateOptions {
  defaultReferenceTimestampMs?: number;
  simulatedDelayMs?: number;
}

const DEFAULT_REFERENCE_TIMESTAMP_MS = Date.parse("2026-11-07T12:00:00.000Z");

export class FakeK8sSnapshotSource implements SnapshotSource {
  public readonly sourceId = "fake-k8s-snapshot-source";
  public readonly isOfflineSynthetic = true;

  private readonly customSnapshots = new Map<string, K8sSnapshot>();
  private readonly forbiddenRules: SimulatedForbiddenRule[] = [];
  private readonly authGate: SnapshotAuthorizationGate;
  private simulatedDelayMs: number;
  private readonly defaultReferenceTimestampMs: number;

  constructor(options: FakeK8sSnapshotSourceOptions = {}) {
    this.defaultReferenceTimestampMs = options.defaultReferenceTimestampMs ?? DEFAULT_REFERENCE_TIMESTAMP_MS;
    this.simulatedDelayMs = options.simulatedDelayMs ?? 0;

    this.authGate = new SnapshotAuthorizationGate({
      ...options,
      rbacEvaluator: async (params: SnapshotRbacCheckParams) => {
        if (this.matchesForbiddenRule(params)) {
          return false;
        }
        if (options.rbacEvaluator) {
          return options.rbacEvaluator(params);
        }
        return true;
      },
    });
  }

  private makeScopeKey(clusterId: string, namespace: string): string {
    return `${clusterId.trim()}::${namespace.trim()}`;
  }

  private matchesForbiddenRule(params: SnapshotRbacCheckParams): boolean {
    return this.forbiddenRules.some(rule => {
      if (rule.clusterId && rule.clusterId !== params.clusterId) return false;
      if (rule.namespace && rule.namespace !== params.namespace) return false;
      if (rule.username && rule.username !== params.user.username) return false;
      if (rule.resourceKind && rule.resourceKind !== params.resourceKind) return false;
      if (rule.verb && rule.verb !== params.verb) return false;
      return true;
    });
  }

  public addSimulatedForbiddenRule(rule: SimulatedForbiddenRule): void {
    this.forbiddenRules.push({ ...rule });
  }

  public clearSimulatedForbiddenRules(): void {
    this.forbiddenRules.length = 0;
  }

  public setSimulatedDelayMs(delayMs: number): void {
    if (typeof delayMs !== "number" || delayMs < 0 || delayMs > 30000) {
      throw new Error("ValidationError: simulatedDelayMs must be a number between 0 and 30000.");
    }
    this.simulatedDelayMs = delayMs;
  }

  /**
   * Registers a custom synthetic snapshot strictly bound to (clusterId, namespace).
   * Validates structure and rejects any forbidden resource kinds (e.g., Secrets).
   */
  public registerScopedSnapshot(clusterId: string, namespace: string, snapshot: K8sSnapshot): void {
    if (!clusterId?.trim() || !namespace?.trim()) {
      throw new SnapshotSourceSecurityError(
        "CLUSTER_SCOPE_VIOLATION",
        "clusterId and namespace are required to register a scoped snapshot.",
        403,
      );
    }

    const validated = validateK8sSnapshot(snapshot);
    const cloned = JSON.parse(JSON.stringify(validated)) as K8sSnapshot;
    this.customSnapshots.set(this.makeScopeKey(clusterId, namespace), cloned);
  }

  public clearScopedSnapshots(): void {
    this.customSnapshots.clear();
  }

  /**
   * Explicitly forbids real or simulated streaming watchers in H8.8-04a.
   */
  public startWatch(): never {
    throw new SnapshotSourceSecurityError(
      "WATCHERS_FORBIDDEN",
      "Real Kubernetes watchers are strictly forbidden in H8.8-04a offline simulation.",
      403,
    );
  }

  /**
   * Collects a deterministic, scope-isolated Kubernetes snapshot without any real cluster or network access.
   */
  public async collectSnapshot(request: SnapshotSourceRequest): Promise<SnapshotSourceEnvelope> {
    const authorized = await this.authGate.authorizeRequest(request);

    if (this.simulatedDelayMs > 0) {
      await this.waitWithAbort(this.simulatedDelayMs, request.signal);
    }

    if (request.signal?.aborted) {
      throw new SnapshotSourceSecurityError(
        "OPERATION_ABORTED",
        "Snapshot collection aborted before payload construction.",
        499,
      );
    }

    const refTimeMs = request.referenceTimestampMs ?? this.defaultReferenceTimestampMs;
    const scopeKey = this.makeScopeKey(authorized.clusterId, authorized.namespace);
    const hasCustomFixture = !request.scenarioId && this.customSnapshots.has(scopeKey);

    let rawSnapshot: K8sSnapshot;
    let resolvedScenarioId: SyntheticScenarioId | "custom_fixture";

    if (hasCustomFixture) {
      rawSnapshot = JSON.parse(JSON.stringify(this.customSnapshots.get(scopeKey)!)) as K8sSnapshot;
      resolvedScenarioId = "custom_fixture";
    } else {
      resolvedScenarioId = request.scenarioId ?? "all_faults";
      rawSnapshot = this.buildScenarioSnapshot(
        resolvedScenarioId,
        authorized.clusterId,
        authorized.namespace,
        refTimeMs,
      );
    }

    const scopedSnapshot = this.filterAndValidateSnapshotForScope(
      rawSnapshot,
      authorized.namespace,
      authorized.resources,
      request.scope.resourceKind,
      request.scope.resourceName,
    );

    if (request.signal?.aborted) {
      throw new SnapshotSourceSecurityError(
        "OPERATION_ABORTED",
        "Snapshot collection aborted after payload validation.",
        499,
      );
    }

    return {
      clusterId: authorized.clusterId,
      namespace: authorized.namespace,
      user: authorized.user,
      sourceType: "fake_k8s_snapshot_source",
      isSyntheticSimulation: true,
      collectedAt: new Date(refTimeMs).toISOString(),
      scenarioId: resolvedScenarioId,
      snapshot: scopedSnapshot,
    };
  }

  private waitWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(
          new SnapshotSourceSecurityError(
            "OPERATION_ABORTED",
            "Snapshot collection aborted during simulated latency.",
            499,
          ),
        );
        return;
      }

      const timer = setTimeout(() => {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
        resolve();
      }, delayMs);

      const onAbort = () => {
        clearTimeout(timer);
        reject(
          new SnapshotSourceSecurityError(
            "OPERATION_ABORTED",
            "Snapshot collection aborted during simulated latency.",
            499,
          ),
        );
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  private filterAndValidateSnapshotForScope(
    snapshot: K8sSnapshot,
    authorizedNamespace: string,
    authorizedResources: SnapshotAllowedResourceKind[],
    resourceKindFilter?: string,
    resourceNameFilter?: string,
  ): K8sSnapshot {
    const validated = validateK8sSnapshot(snapshot);
    const includePods = authorizedResources.includes("pods");
    const includeDeployments = authorizedResources.includes("deployments");
    const includeStatefulSets = authorizedResources.includes("statefulsets");
    const includeDaemonSets = authorizedResources.includes("daemonsets");
    const includeEvents = authorizedResources.includes("events");
    const includeNodes = authorizedResources.includes("nodes");

    const normalizedKindFilter = resourceKindFilter?.trim().toLowerCase();
    const normalizedNameFilter = resourceNameFilter?.trim().toLowerCase();

    const matchesFilter = (kind: string, name: string): boolean => {
      if (normalizedKindFilter && kind.toLowerCase() !== normalizedKindFilter) {
        return false;
      }
      if (normalizedNameFilter && name.toLowerCase() !== normalizedNameFilter) {
        return false;
      }
      return true;
    };

    const isWorkloadKindAuthorized = (kind: string): boolean => {
      switch (kind) {
        case "Deployment":
          return includeDeployments;
        case "StatefulSet":
          return includeStatefulSets;
        case "DaemonSet":
          return includeDaemonSets;
        default:
          return false;
      }
    };

    const pods = includePods && validated.pods
      ? validated.pods.filter(
          p =>
            p.metadata.namespace === authorizedNamespace &&
            matchesFilter(p.kind, p.metadata.name),
        )
      : [];

    const workloads = validated.workloads
      ? validated.workloads.filter(
          w =>
            isWorkloadKindAuthorized(w.kind) &&
            w.metadata.namespace === authorizedNamespace &&
            matchesFilter(w.kind, w.metadata.name),
        )
      : [];

    const events = includeEvents && validated.events
      ? validated.events.filter(ev => {
          const evNamespace = ev.involvedObject.namespace ?? ev.metadata.namespace;
          if (evNamespace !== authorizedNamespace) {
            return false;
          }
          return matchesFilter(ev.involvedObject.kind, ev.involvedObject.name);
        })
      : [];

    const nodes = includeNodes && validated.nodes
      ? validated.nodes.filter(n => matchesFilter(n.kind, n.metadata.name))
      : undefined;

    const result: K8sSnapshot = {
      pods,
      workloads,
      events,
      ...(nodes ? { nodes } : {}),
    };

    return validateK8sSnapshot(result);
  }

  private buildScenarioSnapshot(
    scenarioId: SyntheticScenarioId,
    clusterId: string,
    namespace: string,
    refTimeMs: number,
  ): K8sSnapshot {
    const isoAt = (offsetMs: number) => new Date(refTimeMs + offsetMs).toISOString();
    const uidPrefix = `${clusterId}-${namespace}`;

    const crashLoopPod: K8sPodObject = {
      kind: "Pod",
      metadata: {
        name: "payments-worker-crashloop-7f8b9",
        namespace,
        uid: `uid-${uidPrefix}-pod-crashloop`,
        creationTimestamp: isoAt(-20 * 60 * 1000),
        labels: { app: "payments-worker", tier: "backend" },
      },
      status: {
        phase: "Running",
        containerStatuses: [
          {
            name: "payments-worker",
            ready: false,
            restartCount: 7,
            state: {
              waiting: {
                reason: "CrashLoopBackOff",
                message: "back-off 5m0s restarting failed container=payments-worker",
              },
            },
            lastState: {
              terminated: {
                reason: "Error",
                exitCode: 1,
                finishedAt: isoAt(-60 * 1000),
              },
            },
          },
        ],
      },
    };

    const imagePullPod: K8sPodObject = {
      kind: "Pod",
      metadata: {
        name: "catalog-sync-imgpull-4c2d1",
        namespace,
        uid: `uid-${uidPrefix}-pod-imgpull`,
        creationTimestamp: isoAt(-15 * 60 * 1000),
        labels: { app: "catalog-sync", tier: "worker" },
      },
      status: {
        phase: "Pending",
        containerStatuses: [
          {
            name: "catalog-sync",
            ready: false,
            restartCount: 0,
            state: {
              waiting: {
                reason: "ImagePullBackOff",
                message: "Back-off pulling image \"registry.internal/catalog-sync:v9.9.9-missing\"",
              },
            },
          },
        ],
      },
    };

    const oomKilledPod: K8sPodObject = {
      kind: "Pod",
      metadata: {
        name: "analytics-aggregator-oom-9a1b2",
        namespace,
        uid: `uid-${uidPrefix}-pod-oom`,
        creationTimestamp: isoAt(-25 * 60 * 1000),
        labels: { app: "analytics-aggregator", tier: "batch" },
      },
      status: {
        phase: "Running",
        containerStatuses: [
          {
            name: "aggregator",
            ready: false,
            restartCount: 2,
            state: {
              running: {
                startedAt: isoAt(-30 * 1000),
              },
            },
            lastState: {
              terminated: {
                reason: "OOMKilled",
                exitCode: 137,
                message: "Container exceeded memory limit (512Mi)",
                finishedAt: isoAt(-45 * 1000),
              },
            },
          },
        ],
      },
    };

    const frequentRestartsPod: K8sPodObject = {
      kind: "Pod",
      metadata: {
        name: "session-cache-restarts-3e4f5",
        namespace,
        uid: `uid-${uidPrefix}-pod-restarts`,
        creationTimestamp: isoAt(-30 * 60 * 1000),
        labels: { app: "session-cache", tier: "cache" },
      },
      status: {
        phase: "Running",
        containerStatuses: [
          {
            name: "redis-proxy",
            ready: true,
            restartCount: 6,
            state: {
              running: {
                startedAt: isoAt(-2 * 60 * 1000),
              },
            },
            lastState: {
              terminated: {
                reason: "Error",
                exitCode: 2,
                finishedAt: isoAt(-3 * 60 * 1000),
              },
            },
          },
        ],
      },
    };

    const pendingPod: K8sPodObject = {
      kind: "Pod",
      metadata: {
        name: "ml-inference-pending-8d7c6",
        namespace,
        uid: `uid-${uidPrefix}-pod-pending`,
        creationTimestamp: isoAt(-12 * 60 * 1000),
        labels: { app: "ml-inference", tier: "compute" },
      },
      status: {
        phase: "Pending",
        containerStatuses: [],
      },
    };

    const pendingDeployment: K8sWorkloadObject = {
      kind: "Deployment",
      metadata: {
        name: "ml-inference",
        namespace,
        uid: `uid-${uidPrefix}-deploy-pending`,
        generation: 3,
      },
      spec: {
        replicas: 2,
      },
      status: {
        observedGeneration: 3,
        replicas: 2,
        readyReplicas: 0,
        availableReplicas: 0,
        updatedReplicas: 2,
        conditions: [
          {
            type: "Progressing",
            status: "False",
            reason: "ProgressDeadlineExceeded",
            message: "ReplicaSet \"ml-inference-8d7c6\" has timed out progressing due to unschedulable pending pods.",
          },
        ],
      },
    };

    const pendingPodEvent: K8sEventObject = {
      kind: "Event",
      metadata: {
        name: "ml-inference-pending-8d7c6.failedscheduling",
        namespace,
        uid: `uid-${uidPrefix}-ev-pending`,
        creationTimestamp: isoAt(-2 * 60 * 1000),
      },
      type: "Warning",
      reason: "FailedScheduling",
      message: "0/4 nodes are available: 4 Insufficientmemory, 2 Insufficient nvidia.com/gpu.",
      involvedObject: {
        kind: "Pod",
        name: pendingPod.metadata.name,
        namespace,
        uid: pendingPod.metadata.uid,
      },
      count: 4,
      lastTimestamp: isoAt(-60 * 1000),
    };

    const readinessPod: K8sPodObject = {
      kind: "Pod",
      metadata: {
        name: "checkout-gateway-unready-5b6a7",
        namespace,
        uid: `uid-${uidPrefix}-pod-readiness`,
        creationTimestamp: isoAt(-10 * 60 * 1000),
        labels: { app: "checkout-gateway", tier: "edge" },
      },
      status: {
        phase: "Running",
        containerStatuses: [
          {
            name: "gateway-http",
            ready: false,
            restartCount: 0,
            state: {
              running: {
                startedAt: isoAt(-9 * 60 * 1000),
              },
            },
          },
        ],
      },
    };

    const readinessDeployment: K8sWorkloadObject = {
      kind: "Deployment",
      metadata: {
        name: "checkout-gateway",
        namespace,
        uid: `uid-${uidPrefix}-deploy-readiness`,
        generation: 5,
      },
      spec: {
        replicas: 3,
      },
      status: {
        observedGeneration: 5,
        replicas: 3,
        readyReplicas: 0,
        availableReplicas: 0,
        updatedReplicas: 3,
        conditions: [
          {
            type: "Progressing",
            status: "False",
            reason: "ProgressDeadlineExceeded",
            message: "ReplicaSet \"checkout-gateway-5b6a7\" timed out waiting for readiness probes.",
          },
        ],
      },
    };

    const readinessEvent: K8sEventObject = {
      kind: "Event",
      metadata: {
        name: "checkout-gateway-unready-5b6a7.unhealthy",
        namespace,
        uid: `uid-${uidPrefix}-ev-readiness`,
        creationTimestamp: isoAt(-3 * 60 * 1000),
      },
      type: "Warning",
      reason: "Unhealthy",
      message: "Readiness probe failed: HTTP probe failed with statuscode: 503",
      involvedObject: {
        kind: "Pod",
        name: readinessPod.metadata.name,
        namespace,
        uid: readinessPod.metadata.uid,
      },
      count: 9,
      lastTimestamp: isoAt(-30 * 1000),
    };

    // Ancient (stale > 30m), duplicate, and out-of-order events
    const staleAncientEvent1: K8sEventObject = {
      kind: "Event",
      metadata: {
        name: "legacy-migration-job.stale-2h",
        namespace,
        uid: `uid-${uidPrefix}-ev-stale-2h`,
        creationTimestamp: isoAt(-2 * 60 * 60 * 1000),
      },
      type: "Warning",
      reason: "FailedMount",
      message: "MountVolume.SetUp failed for volume \"legacy-config\" (resolved 2h ago)",
      involvedObject: {
        kind: "Pod",
        name: "legacy-migration-pod-01",
        namespace,
        uid: `uid-${uidPrefix}-pod-legacy-01`,
      },
      count: 1,
      lastTimestamp: isoAt(-2 * 60 * 60 * 1000),
    };

    const staleAncientEvent2: K8sEventObject = {
      kind: "Event",
      metadata: {
        name: "legacy-migration-job.stale-24h",
        namespace,
        uid: `uid-${uidPrefix}-ev-stale-24h`,
        creationTimestamp: isoAt(-24 * 60 * 60 * 1000),
      },
      type: "Warning",
      reason: "FailedScheduling",
      message: "Historical scheduling warning from 24 hours ago",
      involvedObject: {
        kind: "Pod",
        name: "ancient-batch-pod-00",
        namespace,
        uid: `uid-${uidPrefix}-pod-ancient-00`,
      },
      count: 2,
      lastTimestamp: isoAt(-24 * 60 * 60 * 1000),
    };

    // Out-of-order and duplicate fresh events for the same target pod
    const outOfOrderLatestEvent: K8sEventObject = {
      kind: "Event",
      metadata: {
        name: "order-processor-ev-latest",
        namespace,
        uid: `uid-${uidPrefix}-ev-dup-shared`,
        creationTimestamp: isoAt(-5 * 60 * 1000),
      },
      type: "Warning",
      reason: "Unhealthy",
      message: "Readiness probe failed: dial tcp 10.244.1.45:8080: connect: connection refused",
      involvedObject: {
        kind: "Pod",
        name: "order-processor-7c9d8",
        namespace,
        uid: `uid-${uidPrefix}-pod-order-proc`,
      },
      count: 5,
      lastTimestamp: isoAt(-1 * 60 * 1000), // Newer timestamp placed first (out of order)
    };

    const outOfOrderOlderDuplicateEvent: K8sEventObject = {
      kind: "Event",
      metadata: {
        name: "order-processor-ev-older",
        namespace,
        uid: `uid-${uidPrefix}-ev-dup-shared`,
        creationTimestamp: isoAt(-5 * 60 * 1000),
      },
      type: "Warning",
      reason: "Unhealthy",
      message: "Readiness probe failed: dial tcp 10.244.1.45:8080: connect: connection refused",
      involvedObject: {
        kind: "Pod",
        name: "order-processor-7c9d8",
        namespace,
        uid: `uid-${uidPrefix}-pod-order-proc`,
      },
      count: 2,
      lastTimestamp: isoAt(-4 * 60 * 1000), // Older timestamp placed second
    };

    const exactDuplicateEvent: K8sEventObject = {
      ...outOfOrderLatestEvent,
      metadata: {
        ...outOfOrderLatestEvent.metadata,
        name: "order-processor-ev-dup-copy",
      },
    };

    switch (scenarioId) {
      case "crash_loop_backoff":
        return {
          pods: [crashLoopPod],
          workloads: [],
          events: [],
        };
      case "image_pull_backoff":
        return {
          pods: [imagePullPod],
          workloads: [],
          events: [],
        };
      case "oom_killed":
        return {
          pods: [oomKilledPod],
          workloads: [],
          events: [],
        };
      case "frequent_restarts":
        return {
          pods: [frequentRestartsPod],
          workloads: [],
          events: [],
        };
      case "pending_pods":
        return {
          pods: [pendingPod],
          workloads: [pendingDeployment],
          events: [pendingPodEvent],
        };
      case "readiness_failure":
        return {
          pods: [readinessPod],
          workloads: [readinessDeployment],
          events: [readinessEvent],
        };
      case "event_anomalies":
        return {
          pods: [],
          workloads: [],
          events: [
            staleAncientEvent1,
            outOfOrderLatestEvent,
            staleAncientEvent2,
            outOfOrderOlderDuplicateEvent,
            exactDuplicateEvent,
          ],
        };
      case "all_faults":
      default:
        return {
          pods: [
            crashLoopPod,
            imagePullPod,
            oomKilledPod,
            frequentRestartsPod,
            pendingPod,
            readinessPod,
          ],
          workloads: [
            pendingDeployment,
            readinessDeployment,
          ],
          events: [
            staleAncientEvent1,
            outOfOrderLatestEvent,
            pendingPodEvent,
            staleAncientEvent2,
            outOfOrderOlderDuplicateEvent,
            exactDuplicateEvent,
            readinessEvent,
          ],
        };
    }
  }
}
