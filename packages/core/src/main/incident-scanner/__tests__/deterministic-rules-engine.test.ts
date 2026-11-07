/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { DeterministicRulesEngine } from "../deterministic-rules-engine";
import type {
  K8sEventObject,
  K8sNodeObject,
  K8sPodObject,
  K8sWorkloadObject,
} from "../../../common/incident/local-scanner-types";

describe("DeterministicRulesEngine (H8-021)", () => {
  let engine: DeterministicRulesEngine;
  const clusterId = "test-cluster";
  const namespace = "production";

  beforeEach(() => {
    engine = new DeterministicRulesEngine();
  });

  describe("Pod Signal Evaluation", () => {
    it("detects CrashLoopBackOff when container waiting reason is CrashLoopBackOff", () => {
      const pod: K8sPodObject = {
        kind: "Pod",
        metadata: { name: "payment-api-abc", namespace, uid: "uid-pod-1" },
        status: {
          containerStatuses: [
            {
              name: "payment-container",
              ready: false,
              restartCount: 8,
              state: {
                waiting: {
                  reason: "CrashLoopBackOff",
                  message: "Back-off 5m0s restarting failed container",
                },
              },
            },
          ],
        },
      };

      const signals = engine.evaluatePod(pod, { clusterId, scopeNamespace: namespace });
      expect(signals.length).toBe(1);
      expect(signals[0].signalType).toBe("CRASH_LOOP_BACKOFF");
      expect(signals[0].severity).toBe("high");
      expect(signals[0].resourceName).toBe("payment-api-abc");
      expect(signals[0].message).toContain("CrashLoopBackOff");
    });

    it("detects ImagePullBackOff and ErrImagePull", () => {
      const pod: K8sPodObject = {
        kind: "Pod",
        metadata: { name: "auth-service-xyz", namespace, uid: "uid-pod-2" },
        status: {
          containerStatuses: [
            {
              name: "auth-container",
              ready: false,
              restartCount: 0,
              state: {
                waiting: {
                  reason: "ImagePullBackOff",
                  message: "Back-off pulling image auth:v2.1",
                },
              },
            },
          ],
        },
      };

      const signals = engine.evaluatePod(pod, { clusterId, scopeNamespace: namespace });
      expect(signals.length).toBe(1);
      expect(signals[0].signalType).toBe("IMAGE_PULL_BACKOFF");
      expect(signals[0].severity).toBe("high");
    });

    it("detects OOMKilled from current terminated state or lastState (exit code 137)", () => {
      const pod: K8sPodObject = {
        kind: "Pod",
        metadata: { name: "worker-oom-123", namespace, uid: "uid-pod-3" },
        status: {
          containerStatuses: [
            {
              name: "worker",
              ready: false,
              restartCount: 1,
              lastState: {
                terminated: {
                  reason: "OOMKilled",
                  exitCode: 137,
                },
              },
            },
          ],
        },
      };

      const signals = engine.evaluatePod(pod, { clusterId, scopeNamespace: namespace });
      expect(signals.length).toBe(1);
      expect(signals[0].signalType).toBe("OOM_KILLED");
      expect(signals[0].severity).toBe("critical");
      expect(signals[0].title).toContain("OOMKilled");
    });

    it("detects abnormal restarts when restartCount exceeds threshold", () => {
      const pod: K8sPodObject = {
        kind: "Pod",
        metadata: { name: "flaky-service", namespace, uid: "uid-pod-4" },
        status: {
          containerStatuses: [
            {
              name: "app",
              ready: true,
              restartCount: 6,
              state: { running: {} },
            },
          ],
        },
      };

      const signals = engine.evaluatePod(pod, {
        clusterId,
        scopeNamespace: namespace,
        options: { restartThreshold: 3 },
      });

      expect(signals.length).toBe(1);
      expect(signals[0].signalType).toBe("ABNORMAL_RESTARTS");
      expect(signals[0].severity).toBe("high"); // > 5 restarts
    });
  });

  describe("Node Signal Evaluation", () => {
    it("detects NotReady node condition with critical severity", () => {
      const node: K8sNodeObject = {
        kind: "Node",
        metadata: { name: "k8s-node-worker-01", uid: "uid-node-1" },
        status: {
          conditions: [
            {
              type: "Ready",
              status: "False",
              reason: "KubeletNotReady",
              message: "container runtime is down",
            },
          ],
        },
      };

      const signals = engine.evaluateNode(node, { clusterId });
      expect(signals.length).toBe(1);
      expect(signals[0].signalType).toBe("NODE_NOT_READY");
      expect(signals[0].severity).toBe("critical");
      expect(signals[0].resourceName).toBe("k8s-node-worker-01");
    });

    it("ignores healthy nodes with Ready=True", () => {
      const node: K8sNodeObject = {
        kind: "Node",
        metadata: { name: "k8s-node-worker-02" },
        status: {
          conditions: [{ type: "Ready", status: "True" }],
        },
      };

      const signals = engine.evaluateNode(node, { clusterId });
      expect(signals.length).toBe(0);
    });
  });

  describe("Workload Rollout Evaluation", () => {
    it("detects degraded deployment rollout when availableReplicas is 0", () => {
      const deployment: K8sWorkloadObject = {
        kind: "Deployment",
        metadata: { name: "frontend", namespace },
        spec: { replicas: 3 },
        status: {
          replicas: 3,
          availableReplicas: 0,
          readyReplicas: 0,
        },
      };

      const signals = engine.evaluateWorkload(deployment, { clusterId, scopeNamespace: namespace });
      expect(signals.length).toBe(1);
      expect(signals[0].signalType).toBe("ROLLOUT_DEGRADED");
      expect(signals[0].severity).toBe("high");
    });

    it("detects ProgressDeadlineExceeded in deployment conditions", () => {
      const deployment: K8sWorkloadObject = {
        kind: "Deployment",
        metadata: { name: "billing-service", namespace },
        spec: { replicas: 2 },
        status: {
          replicas: 2,
          availableReplicas: 1,
          conditions: [
            {
              type: "Progressing",
              status: "False",
              reason: "ProgressDeadlineExceeded",
              message: "ReplicaSet timed out progressing",
            },
          ],
        },
      };

      const signals = engine.evaluateWorkload(deployment, { clusterId, scopeNamespace: namespace });
      expect(signals.length).toBe(1);
      expect(signals[0].signalType).toBe("ROLLOUT_DEGRADED");
      expect(signals[0].message).toContain("ProgressDeadlineExceeded");
    });
  });

  describe("Warning Event Evaluation", () => {
    it("detects critical Warning events like FailedScheduling and Unhealthy", () => {
      const event: K8sEventObject = {
        kind: "Event",
        metadata: { name: "ev-1", namespace },
        type: "Warning",
        reason: "FailedScheduling",
        message: "0/3 nodes are available: 3 Insufficient memory",
        involvedObject: { kind: "Pod", name: "large-batch-job", namespace },
      };

      const signal = engine.evaluateEvent(event, { clusterId, scopeNamespace: namespace });
      expect(signal).not.toBeNull();
      expect(signal?.signalType).toBe("WARNING_EVENT");
      expect(signal?.severity).toBe("high");
    });

    it("ignores Normal type events", () => {
      const event: K8sEventObject = {
        kind: "Event",
        metadata: { name: "ev-2", namespace },
        type: "Normal",
        reason: "Scheduled",
        message: "Successfully assigned default/mypod to node-1",
        involvedObject: { kind: "Pod", name: "mypod", namespace },
      };

      const signal = engine.evaluateEvent(event, { clusterId, scopeNamespace: namespace });
      expect(signal).toBeNull();
    });
  });

  describe("Deterministic Fingerprint Generation", () => {
    it("produces identical SHA-256 hashes for identical inputs regardless of execution order", () => {
      const fp1 = DeterministicRulesEngine.computeSignalFingerprint(
        "cluster-prod",
        "default",
        "Pod",
        "order-api",
        "CRASH_LOOP_BACKOFF",
      );

      const fp2 = DeterministicRulesEngine.computeSignalFingerprint(
        "cluster-prod",
        "default",
        "Pod",
        "order-api",
        "CRASH_LOOP_BACKOFF",
      );

      expect(fp1).toBe(fp2);
      expect(fp1.length).toBe(64); // SHA-256 hex string
    });

    it("produces distinct fingerprints across different clusters or signal types", () => {
      const fpClusterA = DeterministicRulesEngine.computeSignalFingerprint(
        "cluster-a",
        "default",
        "Pod",
        "order-api",
        "CRASH_LOOP_BACKOFF",
      );

      const fpClusterB = DeterministicRulesEngine.computeSignalFingerprint(
        "cluster-b",
        "default",
        "Pod",
        "order-api",
        "CRASH_LOOP_BACKOFF",
      );

      const fpDifferentSignal = DeterministicRulesEngine.computeSignalFingerprint(
        "cluster-a",
        "default",
        "Pod",
        "order-api",
        "OOM_KILLED",
      );

      expect(fpClusterA).not.toBe(fpClusterB);
      expect(fpClusterA).not.toBe(fpDifferentSignal);
    });

    it("produces distinct fingerprints when resourceUid changes (e.g. Pod recreated) (H86-GATE-03)", () => {
      const fpPodOriginal = DeterministicRulesEngine.computeSignalFingerprint(
        "cluster-prod",
        "default",
        "Pod",
        "order-api",
        "CRASH_LOOP_BACKOFF",
        "uid-pod-orig-1234",
      );

      const fpPodRecreated = DeterministicRulesEngine.computeSignalFingerprint(
        "cluster-prod",
        "default",
        "Pod",
        "order-api",
        "CRASH_LOOP_BACKOFF",
        "uid-pod-new-5678",
      );

      expect(fpPodOriginal).not.toBe(fpPodRecreated);
      expect(fpPodOriginal.length).toBe(64);
      expect(fpPodRecreated.length).toBe(64);
    });
  });
});
