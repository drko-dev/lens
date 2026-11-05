/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../sqlite-client";
import { ALL_MIGRATIONS } from "../migrations";
import { IncidentRepository } from "../incident-repository";
import { EvidenceRepository } from "../evidence-repository";
import { registerIncidentIpcHandlers } from "../setup-incident-ipc.injectable";
import { incidentIpcChannels } from "../../../common/incident/incident-ipc";

describe("Incident IPC Registration and Security Hardening (H8.1 Phase 1)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let handlers: Map<string, Function>;
  let mockIpc: { handle: jest.Mock; removeHandler: jest.Mock };

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();

    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);

    handlers = new Map();
    mockIpc = {
      handle: jest.fn((channel: string, handler: Function) => {
        handlers.set(channel, handler);
      }),
      removeHandler: jest.fn((channel: string) => {
        handlers.delete(channel);
      }),
    };
  });

  afterEach(() => {
    sqlite.close();
  });

  it("registers all incident IPC channels and cleans up handlers on disposal", () => {
    const cleanup = registerIncidentIpcHandlers(incidentRepo, evidenceRepo, mockIpc);

    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.list, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.get, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.create, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.update, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.transition, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.getTimeline, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.getEvidence, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.ingestEvidence, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.ingestUserContext, expect.any(Function));

    cleanup();
    expect(mockIpc.removeHandler).toHaveBeenCalledWith(incidentIpcChannels.list);
  });

  it("handles create, list, and transition over IPC handlers for authorized callers", async () => {
    registerIncidentIpcHandlers(incidentRepo, evidenceRepo, mockIpc);

    const createHandler = handlers.get(incidentIpcChannels.create)!;
    const listHandler = handlers.get(incidentIpcChannels.list)!;
    const transitionHandler = handlers.get(incidentIpcChannels.transition)!;

    const incident = await createHandler(null, {
      title: "IPC Test Incident",
      clusterId: "c1",
      namespace: "default",
      severity: "high",
    });

    expect(incident.id).toBeDefined();
    expect(incident.status).toBe("DETECTADO");

    const listed = await listHandler(null, { limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0].title).toBe("IPC Test Incident");

    const result = await transitionHandler(null, {
      incidentId: incident.id,
      toStatus: "INVESTIGANDO",
      actor: { type: "human", name: "devops-engineer" },
      reason: "Iniciando triage mediante IPC",
    });

    expect(result.incident.status).toBe("INVESTIGANDO");
    expect(result.timelineEvent.message).toBe("Iniciando triage mediante IPC");

    const ingestEvidenceHandler = handlers.get(incidentIpcChannels.ingestEvidence)!;
    const getEvidenceHandler = handlers.get(incidentIpcChannels.getEvidence)!;

    await ingestEvidenceHandler(null, {
      incidentId: incident.id,
      type: "pod_logs",
      origin: "kubectl logs",
      title: "Crash log",
      rawContent: "Panic: out of memory",
      clusterId: "c1",
      namespace: "default",
    });

    const evidenceList = await getEvidenceHandler(null, incident.id);
    expect(evidenceList).toHaveLength(1);
    expect(evidenceList[0].type).toBe("pod_logs");
    expect(evidenceList[0].contentSnippet).toContain("Panic: out of memory");
  });

  describe("Security Hardening & Input Sanitization", () => {
    beforeEach(() => {
      registerIncidentIpcHandlers(incidentRepo, evidenceRepo, mockIpc);
    });

    it("rejects IPC calls originating from unauthorized or external frame origins", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const fakeUntrustedEvent = {
        senderFrame: {
          url: "https://malicious-site.attacker.com/exploit.html",
        },
      };

      await expect(listHandler(fakeUntrustedEvent)).rejects.toThrow(/Unauthorized IPC sender frame origin/);
    });

    it("accepts IPC calls originating from authorized frame origins (file:// or localhost)", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const authorizedEvent = {
        senderFrame: {
          url: "file:///Applications/OpenLens.app/Contents/Resources/index.html",
        },
      };

      await expect(listHandler(authorizedEvent)).resolves.toEqual([]);
    });

    it("rejects calls if sender WebContents is marked destroyed", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const destroyedEvent = {
        sender: {
          isDestroyed: () => true,
        },
      };

      await expect(listHandler(destroyedEvent)).rejects.toThrow(/Sender WebContents is destroyed/);
    });

    it("rejects input containing prototype pollution attempts", async () => {
      const createHandler = handlers.get(incidentIpcChannels.create)!;
      const pollutedInput = JSON.parse('{"title":"Polluted","clusterId":"c1","namespace":"default","severity":"high","__proto__":{"polluted":true}}');

      await expect(createHandler(null, pollutedInput)).rejects.toThrow(/Forbidden prototype property/);
    });

    it("rejects input containing unexpected or smuggled fields (strict schema enforcement)", async () => {
      const createHandler = handlers.get(incidentIpcChannels.create)!;

      await expect(
        createHandler(null, {
          title: "Malicious Incident",
          clusterId: "c1",
          namespace: "default",
          severity: "high",
          isAdminOverride: true, // Smuggled unexpected key
        }),
      ).rejects.toThrow(/Unexpected field 'isAdminOverride'/);
    });

    it("rejects pagination limits exceeding maximum bounds or negative offsets", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;

      await expect(listHandler(null, { limit: 500 })).rejects.toThrow(/'limit' must be an integer between 1 and 100/);
      await expect(listHandler(null, { offset: -5 })).rejects.toThrow(/'offset' must be a non-negative integer/);
    });

    it("rejects oversized evidence payloads exceeding 64 KiB", async () => {
      const ingestHandler = handlers.get(incidentIpcChannels.ingestEvidence)!;
      const oversizedRaw = "A".repeat(70000); // 70 KB > 64 KiB

      await expect(
        ingestHandler(null, {
          incidentId: "inc-123",
          type: "pod_logs",
          origin: "kubectl logs",
          clusterId: "c1",
          namespace: "default",
          rawContent: oversizedRaw,
        }),
      ).rejects.toThrow(/Evidence payload exceeds maximum limit of 64 KiB/);
    });

    it("blocks privileged transitions (APROBACIÓN HUMANA and CERRADO) from unverified renderer", async () => {
      const createHandler = handlers.get(incidentIpcChannels.create)!;
      const transitionHandler = handlers.get(incidentIpcChannels.transition)!;

      const incident = await createHandler(null, {
        title: "Privilege test",
        clusterId: "c1",
        namespace: "default",
        severity: "critical",
      });

      // Attempting to jump to APROBACIÓN HUMANA directly from renderer
      await expect(
        transitionHandler(null, {
          incidentId: incident.id,
          toStatus: "APROBACIÓN HUMANA",
          actor: { type: "human", name: "impersonated-operator" },
          justification: "Falsificando aprobación humana desde Renderer",
        }),
      ).rejects.toThrow(/Transición privilegiada a 'APROBACIÓN HUMANA' bloqueada/);

      // Attempting to close directly from renderer
      await expect(
        transitionHandler(null, {
          incidentId: incident.id,
          toStatus: "CERRADO",
          actor: { type: "human", name: "impersonated-operator" },
          justification: "Falsificando cierre de incidente desde Renderer",
        }),
      ).rejects.toThrow(/Transición privilegiada a 'CERRADO' bloqueada/);
    });
  });
});
