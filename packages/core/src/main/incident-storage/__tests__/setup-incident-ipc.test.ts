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

describe("Incident IPC Registration (H8-007)", () => {
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

  it("handles create, list, and transition over IPC handlers", async () => {
    registerIncidentIpcHandlers(incidentRepo, evidenceRepo, mockIpc);

    const createHandler = handlers.get(incidentIpcChannels.create)!;
    const listHandler = handlers.get(incidentIpcChannels.list)!;
    const transitionHandler = handlers.get(incidentIpcChannels.transition)!;

    const incident = await createHandler(null, {
      title: "IPC Test Incident",
      clusterId: "c1",
      namespace: "default",
      severity: "high",
    }, { type: "system", name: "test-runner" });

    expect(incident.id).toBeDefined();
    expect(incident.status).toBe("DETECTADO");

    const listed = await listHandler(null);
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
});
