/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "node:crypto";
import type {
  K8sEventObject,
  K8sNodeObject,
  K8sPodObject,
  K8sSnapshot,
  K8sWorkloadObject,
  LocalScannerOptions,
  LocalScannerSignal,
  ScannerSignalType,
} from "../../common/incident/local-scanner-types";

export interface RuleEvaluationContext {
  clusterId: string;
  scopeNamespace?: string;
  options?: LocalScannerOptions;
  referenceTimestampMs?: number;
}

const DEFAULT_MAX_EVENT_AGE_MS = 30 * 60 * 1000; // 30 minutes

export class DeterministicRulesEngine {
  /**
   * Generates a stable deterministic fingerprint for a signal.
   * SHA-256 hash of: clusterId:namespace:resourceKind:resourceName:signalType
   */
  public static computeSignalFingerprint(
    clusterId: string,
    namespace: string,
    resourceKind: string,
    resourceName: string,
    signalType: ScannerSignalType,
    resourceUid?: string,
  ): string {
    const uidPart = resourceUid ? `:${resourceUid}` : "";
    const canonical = `${clusterId}:${namespace.toLowerCase()}:${resourceKind.toLowerCase()}:${resourceName.toLowerCase()}:${signalType}${uidPart}`;
    return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  }

  /**
   * Normalizes, filters obsolete events, sorts out-of-order events chronologically,
   * and consolidates duplicate events within a snapshot.
   */
  private normalizeEvents(events: K8sEventObject[], context: RuleEvaluationContext): K8sEventObject[] {
    const refTimeMs = context.referenceTimestampMs ?? Date.now();
    const maxEventAgeMs = context.options?.maxEventAgeMs ?? DEFAULT_MAX_EVENT_AGE_MS;

    interface IndexedEvent {
      event: K8sEventObject;
      timestampMs: number | null;
      originalIndex: number;
    }

    const candidates: IndexedEvent[] = [];

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const evNamespace = ev.involvedObject?.namespace ?? ev.metadata?.namespace;
      if (context.scopeNamespace && evNamespace && evNamespace !== context.scopeNamespace) {
        continue;
      }

      const rawTs = ev.lastTimestamp ?? ev.metadata?.creationTimestamp;
      let timestampMs: number | null = null;
      if (rawTs !== undefined) {
        if (typeof rawTs !== "string" || !rawTs.trim()) {
          continue;
        }
        const parsed = Date.parse(rawTs);
        if (Number.isNaN(parsed)) {
          continue;
        }
        if (refTimeMs - parsed > maxEventAgeMs) {
          // Stale / obsolete event beyond maxEventAgeMs window
          continue;
        }
        timestampMs = parsed;
      }

      candidates.push({
        event: ev,
        timestampMs,
        originalIndex: i,
      });
    }

    // Sort chronologically (ascending) so out-of-order events are processed deterministically
    candidates.sort((a, b) => {
      if (a.timestampMs !== null && b.timestampMs !== null && a.timestampMs !== b.timestampMs) {
        return a.timestampMs - b.timestampMs;
      }
      if (a.timestampMs !== null && b.timestampMs === null) {
        return -1;
      }
      if (a.timestampMs === null && b.timestampMs !== null) {
        return 1;
      }
      const keyA = `${a.event.metadata?.uid ?? ""}:${a.event.metadata?.name ?? ""}:${a.originalIndex}`;
      const keyB = `${b.event.metadata?.uid ?? ""}:${b.event.metadata?.name ?? ""}:${b.originalIndex}`;
      return keyA.localeCompare(keyB);
    });

    // Deduplicate repeated events within the same snapshot while preserving chronological order
    const consolidatedMap = new Map<string, K8sEventObject>();

    for (const item of candidates) {
      const ev = item.event;
      const ns = (ev.involvedObject?.namespace ?? ev.metadata?.namespace ?? "default").toLowerCase();
      const kind = (ev.involvedObject?.kind ?? "").toLowerCase();
      const name = (ev.involvedObject?.name ?? "").toLowerCase();
      const uid = ev.involvedObject?.uid ?? ev.metadata?.uid ?? "";
      const dedupeKey = `${ns}:${kind}:${name}:${uid}:${ev.type}:${ev.reason}:${ev.message}`;

      const existing = consolidatedMap.get(dedupeKey);
      if (!existing) {
        consolidatedMap.set(dedupeKey, {
          ...ev,
          count: ev.count ?? 1,
        });
      } else {
        const prevCount = existing.count ?? 1;
        const currCount = ev.count ?? 1;
        const isExactClone =
          existing.metadata?.uid &&
          ev.metadata?.uid &&
          existing.metadata.uid === ev.metadata.uid &&
          existing.lastTimestamp === ev.lastTimestamp &&
          prevCount === currCount;

        consolidatedMap.set(dedupeKey, {
          ...ev,
          count: isExactClone ? currCount : Math.max(prevCount, currCount) + (prevCount === currCount ? 1 : 0),
          lastTimestamp: ev.lastTimestamp ?? existing.lastTimestamp,
        });
      }
    }

    return Array.from(consolidatedMap.values());
  }

  /**
   * Evaluates a full Kubernetes snapshot deterministically.
   */
  public evaluateSnapshot(snapshot: K8sSnapshot, context: RuleEvaluationContext): LocalScannerSignal[] {
    const signals: LocalScannerSignal[] = [];

    if (snapshot.pods) {
      for (const pod of snapshot.pods) {
        if (context.scopeNamespace && pod.metadata.namespace !== context.scopeNamespace) {
          continue;
        }
        signals.push(...this.evaluatePod(pod, context));
      }
    }

    if (snapshot.nodes) {
      for (const node of snapshot.nodes) {
        signals.push(...this.evaluateNode(node, context));
      }
    }

    if (snapshot.workloads) {
      for (const workload of snapshot.workloads) {
        if (context.scopeNamespace && workload.metadata.namespace !== context.scopeNamespace) {
          continue;
        }
        signals.push(...this.evaluateWorkload(workload, context));
      }
    }

    if (snapshot.events) {
      const normalizedEvents = this.normalizeEvents(snapshot.events, context);
      for (const event of normalizedEvents) {
        const sig = this.evaluateEvent(event, context);
        if (sig) {
          signals.push(sig);
        }
      }
    }

    return signals;
  }

  /**
   * Evaluates a Pod for CrashLoopBackOff, ImagePullBackOff, OOMKilled, and abnormal restarts.
   */
  public evaluatePod(pod: K8sPodObject, context: RuleEvaluationContext): LocalScannerSignal[] {
    const signals: LocalScannerSignal[] = [];
    const clusterId = context.clusterId;
    const namespace = pod.metadata.namespace;
    const podName = pod.metadata.name;
    const now = new Date().toISOString();
    const restartThreshold = context.options?.restartThreshold ?? 3;

    const allContainers = [
      ...(pod.status?.containerStatuses ?? []),
      ...(pod.status?.initContainerStatuses ?? []),
    ];

    for (const container of allContainers) {
      // 1. OOMKilled check (terminated state or lastState)
      const isOomCurrent = container.state?.terminated?.reason === "OOMKilled" || container.state?.terminated?.exitCode === 137;
      const isOomLast = container.lastState?.terminated?.reason === "OOMKilled" || container.lastState?.terminated?.exitCode === 137;

      if (isOomCurrent || isOomLast) {
        const exitCode = container.state?.terminated?.exitCode ?? container.lastState?.terminated?.exitCode ?? 137;
        signals.push({
          signalType: "OOM_KILLED",
          clusterId,
          namespace,
          resourceKind: "Pod",
          resourceName: podName,
          resourceUid: pod.metadata.uid,
          severity: "critical",
          title: `OOMKilled detectado en pod ${podName}`,
          message: `Contenedor '${container.name}' terminado por falta de memoria (código de salida ${exitCode}).`,
          detectedAt: now,
          fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
            clusterId,
            namespace,
            "Pod",
            podName,
            "OOM_KILLED",
            pod.metadata.uid,
          ),
          rawMetadata: {
            containerName: container.name,
            exitCode,
            restartCount: container.restartCount,
          },
        });
      }

      // 2. CrashLoopBackOff check (waiting state)
      const waitingReason = container.state?.waiting?.reason;
      if (waitingReason === "CrashLoopBackOff") {
        signals.push({
          signalType: "CRASH_LOOP_BACKOFF",
          clusterId,
          namespace,
          resourceKind: "Pod",
          resourceName: podName,
          resourceUid: pod.metadata.uid,
          severity: "high",
          title: `CrashLoopBackOff en pod ${podName}`,
          message: `Contenedor '${container.name}' en ciclo constante de reinicios (CrashLoopBackOff). Reinicios: ${container.restartCount}.`,
          detectedAt: now,
          fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
            clusterId,
            namespace,
            "Pod",
            podName,
            "CRASH_LOOP_BACKOFF",
            pod.metadata.uid,
          ),
          rawMetadata: {
            containerName: container.name,
            restartCount: container.restartCount,
            waitingReason,
            waitingMessage: container.state?.waiting?.message,
          },
        });
      }

      // 3. ImagePullBackOff / ErrImagePull check
      if (waitingReason === "ImagePullBackOff" || waitingReason === "ErrImagePull") {
        signals.push({
          signalType: "IMAGE_PULL_BACKOFF",
          clusterId,
          namespace,
          resourceKind: "Pod",
          resourceName: podName,
          resourceUid: pod.metadata.uid,
          severity: "high",
          title: `Fallo al descargar imagen en pod ${podName}`,
          message: `Contenedor '${container.name}' no pudo descargar imagen (${waitingReason}): ${container.state?.waiting?.message ?? "Error de descarga"}.`,
          detectedAt: now,
          fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
            clusterId,
            namespace,
            "Pod",
            podName,
            "IMAGE_PULL_BACKOFF",
            pod.metadata.uid,
          ),
          rawMetadata: {
            containerName: container.name,
            waitingReason,
            waitingMessage: container.state?.waiting?.message,
          },
        });
      }

      // 4. Abnormal restarts threshold check (only if not already flagged as CrashLoopBackOff)
      if (waitingReason !== "CrashLoopBackOff" && container.restartCount >= restartThreshold) {
        signals.push({
          signalType: "ABNORMAL_RESTARTS",
          clusterId,
          namespace,
          resourceKind: "Pod",
          resourceName: podName,
          resourceUid: pod.metadata.uid,
          severity: container.restartCount > 5 ? "high" : "medium",
          title: `Reinicios anómalos (${container.restartCount}) en pod ${podName}`,
          message: `Contenedor '${container.name}' superó el umbral de reinicios (${container.restartCount} >= ${restartThreshold}).`,
          detectedAt: now,
          fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
            clusterId,
            namespace,
            "Pod",
            podName,
            "ABNORMAL_RESTARTS",
            pod.metadata.uid,
          ),
          rawMetadata: {
            containerName: container.name,
            restartCount: container.restartCount,
            threshold: restartThreshold,
          },
        });
      }
    }

    return signals;
  }

  /**
   * Evaluates a Node for NotReady status.
   */
  public evaluateNode(node: K8sNodeObject, context: RuleEvaluationContext): LocalScannerSignal[] {
    const signals: LocalScannerSignal[] = [];
    const clusterId = context.clusterId;
    const nodeName = node.metadata.name;
    const now = new Date().toISOString();

    const readyCond = node.status?.conditions?.find(c => c.type === "Ready");

    if (readyCond && readyCond.status !== "True") {
      signals.push({
        signalType: "NODE_NOT_READY",
        clusterId,
        namespace: "kube-system",
        resourceKind: "Node",
        resourceName: nodeName,
        resourceUid: node.metadata.uid,
        severity: "critical",
        title: `Nodo No Disponible (NotReady): ${nodeName}`,
        message: `El nodo ${nodeName} reporta estado Ready=${readyCond.status}. Razón: ${readyCond.reason ?? "Desconocida"}. Mensaje: ${readyCond.message ?? "Sin mensaje"}.`,
        detectedAt: now,
        fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
          clusterId,
          "kube-system",
          "Node",
          nodeName,
          "NODE_NOT_READY",
          node.metadata.uid,
        ),
        rawMetadata: {
          nodeCondition: readyCond.type,
          conditionStatus: readyCond.status,
          conditionReason: readyCond.reason,
          conditionMessage: readyCond.message,
        },
      });
    }

    return signals;
  }

  /**
   * Evaluates Deployments, StatefulSets, and DaemonSets for degraded rollouts.
   */
  public evaluateWorkload(workload: K8sWorkloadObject, context: RuleEvaluationContext): LocalScannerSignal[] {
    const signals: LocalScannerSignal[] = [];
    const clusterId = context.clusterId;
    const namespace = workload.metadata.namespace;
    const name = workload.metadata.name;
    const kind = workload.kind;
    const now = new Date().toISOString();

    const specReplicas = workload.spec?.replicas ?? 1;
    const availableReplicas = workload.status?.availableReplicas ?? workload.status?.readyReplicas ?? 0;

    // Check ProgressDeadlineExceeded condition
    const progressExceeded = workload.status?.conditions?.some(
      c => c.type === "Progressing" && c.reason === "ProgressDeadlineExceeded",
    );

    if (specReplicas > 0 && (availableReplicas === 0 || progressExceeded)) {
      signals.push({
        signalType: "ROLLOUT_DEGRADED",
        clusterId,
        namespace,
        resourceKind: kind,
        resourceName: name,
        resourceUid: workload.metadata.uid,
        severity: "high",
        title: `Rollout degradado en ${kind}/${name}`,
        message: `El recurso ${kind}/${name} tiene ${availableReplicas}/${specReplicas} réplicas disponibles.${progressExceeded ? " Plazo de despliegue excedido (ProgressDeadlineExceeded)." : ""}`,
        detectedAt: now,
        fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
          clusterId,
          namespace,
          kind,
          name,
          "ROLLOUT_DEGRADED",
          workload.metadata.uid,
        ),
        rawMetadata: {
          specReplicas,
          availableReplicas,
          progressExceeded,
        },
      });
    }

    return signals;
  }

  /**
   * Evaluates Kubernetes Warning events for critical operational issues.
   */
  public evaluateEvent(event: K8sEventObject, context: RuleEvaluationContext): LocalScannerSignal | null {
    if (event.type !== "Warning") {
      return null;
    }

    const rawTs = event.lastTimestamp ?? event.metadata?.creationTimestamp;
    if (rawTs !== undefined) {
      if (typeof rawTs !== "string" || !rawTs.trim()) {
        return null;
      }
      const parsedMs = Date.parse(rawTs);
      if (Number.isNaN(parsedMs)) {
        return null;
      }
      const refTimeMs = context.referenceTimestampMs ?? Date.now();
      const maxEventAgeMs = context.options?.maxEventAgeMs ?? DEFAULT_MAX_EVENT_AGE_MS;
      if (refTimeMs - parsedMs > maxEventAgeMs) {
        return null;
      }
    }

    const clusterId = context.clusterId;
    const namespace = event.involvedObject.namespace ?? event.metadata.namespace ?? "default";
    const resourceKind = event.involvedObject.kind;
    const resourceName = event.involvedObject.name;
    const resourceUid = event.involvedObject.uid ?? event.metadata.uid;
    const now = new Date(context.referenceTimestampMs ?? Date.now()).toISOString();

    const criticalReasons = ["FailedScheduling", "Unhealthy", "FailedMount", "FailedCreate", "FailedSync"];
    const isCriticalReason = criticalReasons.includes(event.reason);

    return {
      signalType: "WARNING_EVENT",
      clusterId,
      namespace,
      resourceKind,
      resourceName,
      resourceUid,
      severity: isCriticalReason ? "high" : "medium",
      title: `Evento Warning en ${resourceKind}/${resourceName}: ${event.reason}`,
      message: event.message,
      detectedAt: now,
      fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
        clusterId,
        namespace,
        resourceKind,
        resourceName,
        "WARNING_EVENT",
        resourceUid,
      ),
      rawMetadata: {
        eventReason: event.reason,
        eventCount: event.count ?? 1,
        lastTimestamp: event.lastTimestamp ?? event.metadata.creationTimestamp,
      },
    };
  }
}
