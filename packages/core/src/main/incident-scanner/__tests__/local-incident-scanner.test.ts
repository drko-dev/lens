/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { LocalIncidentScanner } from "../local-incident-scanner";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import type { K8sSnapshot } from "../../../common/incident/local-scanner-types";

describe("LocalIncidentScanner Lifecycle & Scoping (H8-021)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let scanner: LocalIncidentScanner;

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();
    incidentRepo = new IncidentRepository(sqlite);
    scanner = new LocalIncidentScanner(incidentRepo);
  });

  afterEach(() => {
    scanner.dispose();
    sqlite.close();
  });

  describe("Default State & Opt-in Activation", () => {
    it("is strictly OFF by default on initialization", () => {
      const status = scanner.getStatus();
      expect(status.isEnabled).toBe(false);
      expect(status.activeWatchersCount).toBe(0);
      expect(status.scanCount).toBe(0);
      expect(status.signalsDetectedCount).toBe(0);
      expect(status.scope).toBeUndefined();
    });

    it("activates explicitly with required clusterId scope", async () => {
      const status = await scanner.start({
        clusterId: "cluster-staging",
        namespace: "auth-system",
      });

      expect(status.isEnabled).toBe(true);
      expect(status.activeWatchersCount).toBe(0); // H86-GATE-01: Zero real watchers in MVP DEMO
      expect(status.sourceType).toBe("synthetic_feed");
      expect(status.isSyntheticDemo).toBe(true);
      expect(status.scope?.clusterId).toBe("cluster-staging");
      expect(status.scope?.namespace).toBe("auth-system");
      expect(status.startedAt).toBeDefined();
    });

    it("fails closed if clusterId is missing on start", async () => {
      await expect(scanner.start({ clusterId: "" })).rejects.toThrow(/clusterId is required/);
      expect(scanner.getStatus().isEnabled).toBe(false);
    });

    it("stops immediately and resets active watchers count to 0", async () => {
      await scanner.start({ clusterId: "test-cluster" });
      expect(scanner.getStatus().isEnabled).toBe(true);

      const stoppedStatus = await scanner.stop();
      expect(stoppedStatus.isEnabled).toBe(false);
      expect(stoppedStatus.activeWatchersCount).toBe(0);
      expect(stoppedStatus.stoppedAt).toBeDefined();
    });

    it("does not duplicate watchers or schedulers when started multiple times", async () => {
      await scanner.start({ clusterId: "test-cluster", namespace: "ns-1" });
      await scanner.start({ clusterId: "test-cluster", namespace: "ns-2" });

      const status = scanner.getStatus();
      expect(status.activeWatchersCount).toBe(0);
      expect(status.scope?.namespace).toBe("ns-2");
    });
  });

  describe("Snapshot Processing & Scope Filtering", () => {
    it("fails closed when processing snapshot if scanner is stopped", async () => {
      const snapshot: K8sSnapshot = {
        pods: [
          {
            kind: "Pod",
            metadata: { name: "test-pod", namespace: "default" },
            status: {
              containerStatuses: [
                {
                  name: "c1",
                  ready: false,
                  restartCount: 5,
                  state: { waiting: { reason: "CrashLoopBackOff" } },
                },
              ],
            },
          },
        ],
      };

      await expect(scanner.processSnapshot(snapshot)).rejects.toThrow(/stopped or disabled/);
    });

    it("filters out resources outside the authorized scope namespace", async () => {
      await scanner.start({
        clusterId: "minikube-dev",
        namespace: "billing",
      });

      const snapshot: K8sSnapshot = {
        pods: [
          {
            kind: "Pod",
            metadata: { name: "pod-in-scope", namespace: "billing" },
            status: {
              containerStatuses: [
                {
                  name: "billing-c",
                  ready: false,
                  restartCount: 2,
                  state: { waiting: { reason: "CrashLoopBackOff" } },
                },
              ],
            },
          },
          {
            kind: "Pod",
            metadata: { name: "pod-outside-scope", namespace: "kube-system" },
            status: {
              containerStatuses: [
                {
                  name: "kube-c",
                  ready: false,
                  restartCount: 2,
                  state: { waiting: { reason: "CrashLoopBackOff" } },
                },
              ],
            },
          },
        ],
      };

      const signals = await scanner.processSnapshot(snapshot);
      expect(signals.length).toBe(1);
      expect(signals[0].resourceName).toBe("pod-in-scope");

      const status = scanner.getStatus();
      expect(status.signalsDetectedCount).toBe(1);
      expect(status.incidentsCreatedCount).toBe(1);
      expect(status.scanCount).toBe(1);
    });

    it("enforces resourceKind filter when specified in scope", async () => {
      await scanner.start({
        clusterId: "minikube-dev",
        resourceKind: "Deployment",
      });

      const snapshot: K8sSnapshot = {
        pods: [
          {
            kind: "Pod",
            metadata: { name: "my-pod", namespace: "default" },
            status: {
              containerStatuses: [
                {
                  name: "c1",
                  ready: false,
                  restartCount: 2,
                  state: { waiting: { reason: "CrashLoopBackOff" } },
                },
              ],
            },
          },
        ],
        workloads: [
          {
            kind: "Deployment",
            metadata: { name: "my-deploy", namespace: "default" },
            spec: { replicas: 3 },
            status: { replicas: 3, availableReplicas: 0 },
          },
        ],
      };

      await scanner.processSnapshot(snapshot);

      const status = scanner.getStatus();
      // Only the Deployment should result in an incident
      expect(status.incidentsCreatedCount).toBe(1);
      const incidents = incidentRepo.listIncidents();
      expect(incidents.length).toBe(1);
      expect(incidents[0].workloadKind).toBe("Deployment");
    });
  });

  describe("Resource Cleanup on Disposal", () => {
    it("guarantees clean disposal without leaving active watchers or intervals", async () => {
      await scanner.start({ clusterId: "test-cluster" });
      scanner.dispose();

      const status = scanner.getStatus();
      expect(status.isEnabled).toBe(false);
      expect(status.activeWatchersCount).toBe(0);
      expect(status.stoppedAt).toBeDefined();
    });
  });
});
