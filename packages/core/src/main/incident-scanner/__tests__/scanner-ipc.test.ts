/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { registerIncidentIpcHandlers } from "../../incident-storage/setup-incident-ipc.injectable";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { EvidenceRepository } from "../../incident-storage/evidence-repository";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { LocalIncidentScanner } from "../local-incident-scanner";
import { incidentIpcChannels } from "../../../common/incident/incident-ipc";

describe("Scanner IPC Handlers & Input Security (H8.5)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let scanner: LocalIncidentScanner;
  let handlers: Map<string, (event: any, ...args: any[]) => Promise<any>>;

  const mockIpc = {
    handle: (channel: string, listener: any) => {
      handlers.set(channel, listener);
    },
    removeHandler: (channel: string) => {
      handlers.delete(channel);
    },
  };

  const validEvent = {
    senderFrame: {
      url: "file:///Applications/OpenLens.app/Contents/Resources/app.asar/index.html",
      parent: null,
    },
    sender: { id: 1 },
  };

  const invalidOriginEvent = {
    senderFrame: {
      url: "http://malicious-website.com/pwn.html",
      parent: null,
    },
    sender: { id: 2 },
  };

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();
    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
    scanner = new LocalIncidentScanner(incidentRepo);
    handlers = new Map();

    registerIncidentIpcHandlers(
      incidentRepo,
      evidenceRepo,
      undefined,
      undefined,
      { scanner },
      mockIpc,
    );
  });

  afterEach(() => {
    scanner.dispose();
    sqlite.close();
  });

  describe("IPC Authorization & Sender Validation", () => {
    it("rejects calls from unauthorized sender origins with SecurityError", async () => {
      const getStatusHandler = handlers.get(incidentIpcChannels.scannerGetStatus);
      expect(getStatusHandler).toBeDefined();

      await expect(getStatusHandler!(invalidOriginEvent)).rejects.toThrow(/SecurityError/);
    });

    it("allows authorized sender frame to retrieve scanner status", async () => {
      const getStatusHandler = handlers.get(incidentIpcChannels.scannerGetStatus);
      const status = await getStatusHandler!(validEvent);

      expect(status.isEnabled).toBe(false);
      expect(status.scanCount).toBe(0);
    });
  });

  describe("Input Schema Validation & Start/Stop IPC", () => {
    it("rejects start input containing unknown or prototype pollution keys", async () => {
      const startHandler = handlers.get(incidentIpcChannels.scannerStart);

      await expect(
        startHandler!(validEvent, {
          scope: { clusterId: "c1", maliciousPayload: true },
        }),
      ).rejects.toThrow(/Unexpected field 'maliciousPayload'/);
    });

    it("rejects start input with invalid options", async () => {
      const startHandler = handlers.get(incidentIpcChannels.scannerStart);

      await expect(
        startHandler!(validEvent, {
          scope: { clusterId: "c1" },
          options: { scanIntervalMs: 50 }, // below min limit of 1000
        }),
      ).rejects.toThrow(/must be a number between 1000 and 60000/);
    });

    it("starts and stops the scanner over IPC with valid inputs", async () => {
      const startHandler = handlers.get(incidentIpcChannels.scannerStart);
      const stopHandler = handlers.get(incidentIpcChannels.scannerStop);

      const startResult = await startHandler!(validEvent, {
        scope: { clusterId: "minikube", namespace: "default" },
      });

      expect(startResult.isEnabled).toBe(true);
      expect(startResult.scope.clusterId).toBe("minikube");

      const stopResult = await stopHandler!(validEvent);
      expect(stopResult.isEnabled).toBe(false);
      expect(stopResult.activeWatchersCount).toBe(0);
    });
  });

  describe("Alert Action & Snapshot Processing over IPC", () => {
    it("processes snapshots and executes alert actions over IPC", async () => {
      const startHandler = handlers.get(incidentIpcChannels.scannerStart);
      const processHandler = handlers.get(incidentIpcChannels.scannerProcessSnapshot);
      const alertHandler = handlers.get(incidentIpcChannels.scannerAlertAction);

      await startHandler!(validEvent, { scope: { clusterId: "prod-cluster" } });

      const signals = await processHandler!(validEvent, {
        pods: [
          {
            kind: "Pod",
            metadata: { name: "crash-pod", namespace: "default" },
            status: {
              containerStatuses: [
                {
                  name: "c1",
                  ready: false,
                  restartCount: 4,
                  state: { waiting: { reason: "CrashLoopBackOff" } },
                },
              ],
            },
          },
        ],
      });

      expect(signals.length).toBe(1);
      const incidents = incidentRepo.listIncidents();
      expect(incidents.length).toBe(1);

      // Execute snooze action over IPC
      const snoozeRes = await alertHandler!(validEvent, {
        incidentId: incidents[0].id,
        action: "snooze",
        snoozeDurationMs: 10 * 60 * 1000,
      });

      expect(snoozeRes.success).toBe(true);
      expect(snoozeRes.action).toBe("snooze");
    });

    it("rejects invalid alert action payloads", async () => {
      const alertHandler = handlers.get(incidentIpcChannels.scannerAlertAction);

      await expect(
        alertHandler!(validEvent, {
          incidentId: "INC-12345678",
          action: "invalid_action_name",
        }),
      ).rejects.toThrow(/'action' must be one of: \[analyze_now, snooze, dismiss\]/);
    });
  });
});
