/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../sqlite-client";
import { ALL_MIGRATIONS } from "../migrations";
import { IncidentRepository } from "../incident-repository";
import { EvidenceRepository } from "../evidence-repository";
import { IncidentPurger } from "../incident-purger";
import { IncidentConfirmationManager } from "../incident-confirmation-manager";
import setupIncidentIpcInjectable, { registerIncidentIpcHandlers } from "../setup-incident-ipc.injectable";
import { incidentIpcChannels } from "../../../common/incident/incident-ipc";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";

describe("Incident IPC Registration and Security Hardening (H8.1 Phase 1)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let purger: IncidentPurger;
  let confirmationManager: IncidentConfirmationManager;
  let handlers: Map<string, Function>;
  let mockIpc: { handle: jest.Mock; removeHandler: jest.Mock };

  const validEvent = {
    sender: {
      isDestroyed: () => false,
    },
    senderFrame: {
      parent: null,
      isDestroyed: () => false,
      url: "http://localhost:9191/index.html",
    },
  };

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();

    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
    purger = new IncidentPurger(sqlite);
    confirmationManager = new IncidentConfirmationManager(incidentRepo);

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
    const fakeAiComponents = {
      profileManager: { listProfiles: jest.fn(), createProfile: jest.fn(), updateProfile: jest.fn(), deleteProfile: jest.fn() } as any,
      diagnosisEngine: { prepareConsentPreview: jest.fn(), executeDiagnosis: jest.fn() } as any,
      remediationVerifier: { evaluateRemediation: jest.fn() } as any,
      diagnosisRepo: { listDiagnosesByIncident: jest.fn(), getLatestDiagnosis: jest.fn() } as any,
    };

    const cleanup = registerIncidentIpcHandlers(incidentRepo, evidenceRepo, purger, confirmationManager, fakeAiComponents, mockIpc);

    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.list, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.get, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.create, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.update, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.transition, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.getTimeline, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.getEvidence, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.ingestEvidence, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.ingestUserContext, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.getRetentionPolicy, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.setRetentionPolicy, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.previewPurge, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.executePurge, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.executeManualPurge, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.executeAutomaticPurge, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.getPurgeHistory, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.requestPrivilegedTransition, expect.any(Function));

    // Verify AI channels
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.aiListProfiles, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.aiCreateProfile, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.aiUpdateProfile, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.aiDeleteProfile, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.aiPrepareConsent, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.aiExecuteDiagnosis, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.aiListDiagnoses, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.aiGetLatestDiagnosis, expect.any(Function));
    expect(mockIpc.handle).toHaveBeenCalledWith(incidentIpcChannels.aiVerifyRemediation, expect.any(Function));

    cleanup();
    expect(mockIpc.removeHandler).toHaveBeenCalledWith(incidentIpcChannels.list);
    expect(mockIpc.removeHandler).toHaveBeenCalledWith(incidentIpcChannels.getRetentionPolicy);
    expect(mockIpc.removeHandler).toHaveBeenCalledWith(incidentIpcChannels.aiListProfiles);
    expect(mockIpc.removeHandler).toHaveBeenCalledWith(incidentIpcChannels.aiExecuteDiagnosis);
    expect(mockIpc.removeHandler).toHaveBeenCalledWith(incidentIpcChannels.executeManualPurge);
    expect(mockIpc.removeHandler).toHaveBeenCalledWith(incidentIpcChannels.requestPrivilegedTransition);
  });

  it("handles create, list, and transition over IPC handlers for authorized callers", async () => {
    registerIncidentIpcHandlers(incidentRepo, evidenceRepo, purger, confirmationManager, mockIpc);

    const createHandler = handlers.get(incidentIpcChannels.create)!;
    const listHandler = handlers.get(incidentIpcChannels.list)!;
    const transitionHandler = handlers.get(incidentIpcChannels.transition)!;

    const incident = await createHandler(validEvent, {
      title: "IPC Test Incident",
      clusterId: "c1",
      namespace: "default",
      severity: "high",
    });

    expect(incident.id).toBeDefined();
    expect(incident.status).toBe("DETECTADO");

    const listed = await listHandler(validEvent, { limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0].title).toBe("IPC Test Incident");

    const result = await transitionHandler(validEvent, {
      incidentId: incident.id,
      toStatus: "INVESTIGANDO",
      actor: { type: "human", name: "devops-engineer" },
      reason: "Iniciando triage mediante IPC",
    });

    expect(result.incident.status).toBe("INVESTIGANDO");
    expect(result.timelineEvent.message).toBe("Iniciando triage mediante IPC");

    const ingestEvidenceHandler = handlers.get(incidentIpcChannels.ingestEvidence)!;
    const getEvidenceHandler = handlers.get(incidentIpcChannels.getEvidence)!;

    await ingestEvidenceHandler(validEvent, {
      incidentId: incident.id,
      type: "pod_logs",
      origin: "kubectl logs",
      title: "Crash log",
      rawContent: "Panic: out of memory",
      clusterId: "c1",
      namespace: "default",
    });

    const evidenceList = await getEvidenceHandler(validEvent, incident.id);
    expect(evidenceList).toHaveLength(1);
    expect(evidenceList[0].type).toBe("pod_logs");
    expect(evidenceList[0].contentSnippet).toContain("Panic: out of memory");
  });

  describe("Security Hardening & Input Sanitization", () => {
    beforeEach(() => {
      registerIncidentIpcHandlers(incidentRepo, evidenceRepo, purger, confirmationManager, mockIpc);
    });

    it("rejects IPC calls missing event context or sender", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      await expect(listHandler(null)).rejects.toThrow(/missing valid event context/);
      await expect(listHandler({})).rejects.toThrow(/missing verifiable sender WebContents/);
      await expect(listHandler({ sender: {} })).rejects.toThrow(/missing verifiable senderFrame/);
    });

    it("rejects IPC calls originating from subframes or iframes", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const subframeEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: {
          parent: { id: 1 }, // subframe!
          isDestroyed: () => false,
          url: "http://localhost:9191/iframe.html",
        },
      };

      await expect(listHandler(subframeEvent)).rejects.toThrow(/subframe or iframe is forbidden/);
    });

    it("rejects IPC calls originating from unauthorized or external frame origins", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const fakeUntrustedEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: {
          parent: null,
          isDestroyed: () => false,
          url: "https://malicious-site.attacker.com/exploit.html",
        },
      };

      await expect(listHandler(fakeUntrustedEvent)).rejects.toThrow(/Unauthorized IPC sender frame origin/);
    });

    it("rejects IPC calls from unauthorized localhost ports", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const roguePortEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: {
          parent: null,
          isDestroyed: () => false,
          url: "http://localhost:3000/index.html",
        },
      };

      await expect(listHandler(roguePortEvent)).rejects.toThrow(/Unauthorized localhost port/);
    });

    it("rejects suspicious file:// URLs", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const suspiciousFileEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: {
          parent: null,
          isDestroyed: () => false,
          url: "file:///etc/passwd",
        },
      };

      await expect(listHandler(suspiciousFileEvent)).rejects.toThrow(/Unauthorized file:\/\/ path/);
    });

    it("rejects file:// URLs placed in Downloads or temp directories even if containing project substrings", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const downloadsEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: {
          parent: null,
          isDestroyed: () => false,
          url: "file:///Users/synthetic-test-user/Downloads/lens-v6-ui-corrections/exploit.html",
        },
      };
      const tempEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: {
          parent: null,
          isDestroyed: () => false,
          url: "file:///tmp/openlens/index.html",
        },
      };

      await expect(listHandler(downloadsEvent)).rejects.toThrow(/Unauthorized file:\/\/ path/);
      await expect(listHandler(tempEvent)).rejects.toThrow(/Unauthorized file:\/\/ path/);
    });

    it("rejects lens:// URLs with unauthorized host names", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const rogueLensEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: {
          parent: null,
          isDestroyed: () => false,
          url: "lens://attacker.com/malicious.html",
        },
      };

      await expect(listHandler(rogueLensEvent)).rejects.toThrow(/Unauthorized lens:\/\/ host/);
    });

    it("rejects calls where senderFrame is not the mainFrame", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const nonMainFrame = {
        parent: null,
        isDestroyed: () => false,
        url: "http://localhost:9191/index.html",
      };
      const mainFrame = {
        parent: null,
        isDestroyed: () => false,
        url: "http://localhost:9191/index.html",
      };
      const nonMainFrameEvent = {
        sender: {
          isDestroyed: () => false,
          mainFrame,
        },
        senderFrame: nonMainFrame, // Not the main frame!
      };

      await expect(listHandler(nonMainFrameEvent)).rejects.toThrow(/non-main frame is forbidden/);
    });

    it("rejects confirmation modal frames from invoking general incident IPC handlers", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const modalEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: {
          parent: null,
          isDestroyed: () => false,
          url: "file:///Applications/OpenLens.app/Contents/Resources/confirmation-modal.html",
        },
      };

      await expect(listHandler(modalEvent)).rejects.toThrow(/Confirmation modal frame URL .* is forbidden/);
    });

    it("rejects modal WebContents from requesting privileged transitions", async () => {
      const requestPrivilegedHandler = handlers.get(incidentIpcChannels.requestPrivilegedTransition)!;
      const modalWebContentsId = 999;
      (confirmationManager as any).modalWebContentsIds.add(modalWebContentsId);

      const modalEvent = {
        sender: {
          id: modalWebContentsId,
          isDestroyed: () => false,
        },
        senderFrame: {
          parent: null,
          isDestroyed: () => false,
          url: "http://localhost:9191/index.html",
        },
      };

      await expect(
        requestPrivilegedHandler(modalEvent, {
          incidentId: "inc-1",
          toStatus: "APROBACIÓN HUMANA",
          justification: "Intento de auto-aprobación desde modal",
        }),
      ).rejects.toThrow(/Confirmation modal is forbidden from requesting privileged transitions/);
    });

    it("accepts IPC calls originating from authorized frame origins (file:// or localhost:9191)", async () => {
      const listHandler = handlers.get(incidentIpcChannels.list)!;
      const authorizedEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: {
          parent: null,
          isDestroyed: () => false,
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
        senderFrame: {
          parent: null,
          isDestroyed: () => false,
          url: "http://localhost:9191/index.html",
        },
      };

      await expect(listHandler(destroyedEvent)).rejects.toThrow(/Sender WebContents is destroyed/);
    });

    it("rejects input containing prototype pollution attempts", async () => {
      const createHandler = handlers.get(incidentIpcChannels.create)!;
      const pollutedInput = JSON.parse('{"title":"Polluted","clusterId":"c1","namespace":"default","severity":"high","__proto__":{"polluted":true}}');

      await expect(createHandler(validEvent, pollutedInput)).rejects.toThrow(/Forbidden prototype property/);
    });

    it("rejects input containing unexpected or smuggled fields (strict schema enforcement)", async () => {
      const createHandler = handlers.get(incidentIpcChannels.create)!;

      await expect(
        createHandler(validEvent, {
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

      await expect(listHandler(validEvent, { limit: 500 })).rejects.toThrow(/'limit' must be an integer between 1 and 100/);
      await expect(listHandler(validEvent, { offset: -5 })).rejects.toThrow(/'offset' must be a non-negative integer/);
    });

    it("rejects oversized evidence payloads exceeding 64 KiB", async () => {
      const ingestHandler = handlers.get(incidentIpcChannels.ingestEvidence)!;
      const oversizedRaw = "A".repeat(70000); // 70 KB > 64 KiB

      await expect(
        ingestHandler(validEvent, {
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

      const incident = await createHandler(validEvent, {
        title: "Privilege test",
        clusterId: "c1",
        namespace: "default",
        severity: "critical",
      });

      // Attempting to jump to APROBACIÓN HUMANA directly from renderer
      await expect(
        transitionHandler(validEvent, {
          incidentId: incident.id,
          toStatus: "APROBACIÓN HUMANA",
          actor: { type: "human", name: "impersonated-operator" },
          justification: "Falsificando aprobación humana desde Renderer",
        }),
      ).rejects.toThrow(/Transición privilegiada a 'APROBACIÓN HUMANA' bloqueada/);

      // Attempting to close directly from renderer
      await expect(
        transitionHandler(validEvent, {
          incidentId: incident.id,
          toStatus: "CERRADO",
          actor: { type: "human", name: "impersonated-operator" },
          justification: "Falsificando cierre de incidente desde Renderer",
        }),
      ).rejects.toThrow(/Transición privilegiada a 'CERRADO' bloqueada/);
    });

    it("delegates privileged transition request to IncidentConfirmationManager", async () => {
      const requestPrivilegedHandler = handlers.get(incidentIpcChannels.requestPrivilegedTransition)!;
      const spy = jest.spyOn(confirmationManager, "requestPrivilegedTransition").mockResolvedValueOnce({
        incident: { id: "inc-test", status: "APROBACIÓN HUMANA" } as any,
        timelineEvent: { id: "evt-test" } as any,
      });

      const res = await requestPrivilegedHandler(validEvent, {
        incidentId: "inc-test",
        toStatus: "APROBACIÓN HUMANA",
        justification: "Valid human justification approved",
      });

      expect(spy).toHaveBeenCalled();
      expect(res.incident.status).toBe("APROBACIÓN HUMANA");
      spy.mockRestore();
    });

    it("handles retention policy query, update and preview through secured IPC", async () => {
      const getPolicyHandler = handlers.get(incidentIpcChannels.getRetentionPolicy)!;
      const setPolicyHandler = handlers.get(incidentIpcChannels.setRetentionPolicy)!;
      const previewPurgeHandler = handlers.get(incidentIpcChannels.previewPurge)!;
      const executePurgeHandler = handlers.get(incidentIpcChannels.executePurge)!;
      const executeManualPurgeHandler = handlers.get(incidentIpcChannels.executeManualPurge)!;

      const initialPolicy = await getPolicyHandler(validEvent);
      expect(initialPolicy.enabled).toBe(false);
      expect(initialPolicy.strategy).toBe("manual");

      // Reject invalid retention days
      await expect(
        setPolicyHandler(validEvent, {
          retentionDays: -10,
        }),
      ).rejects.toThrow(/'retentionDays' must be an integer between 1 and 3650 days/);

      // Successfully update retention policy
      const updatedPolicy = await setPolicyHandler(validEvent, {
        enabled: true,
        strategy: "days",
        retentionDays: 45,
        protectPinned: true,
      });
      expect(updatedPolicy.enabled).toBe(true);
      expect(updatedPolicy.retentionDays).toBe(45);

      // Preview purge over IPC
      const preview = await previewPurgeHandler(validEvent);
      expect(preview.candidateIncidentCount).toBe(0);

      // Execute automatic purge over IPC
      const execResult = await executePurgeHandler(validEvent);
      expect(execResult.success).toBe(true);
      expect(execResult.deletedIncidentCount).toBe(0);

      // Execute manual purge over IPC
      const manualResult = await executeManualPurgeHandler(validEvent, {
        confirmedCandidateIds: [],
      });
      expect(manualResult.success).toBe(true);
      expect(manualResult.deletedIncidentCount).toBe(0);
    });
  });

  describe("DI Container Registration (H8.3.1 Gate Item 1)", () => {
    it("bootstraps setupIncidentIpcInjectable through DI container and resolves without errors", () => {
      const di = getDiForUnitTesting();
      const setupIpc = setupIncidentIpcInjectable.instantiate(di);

      expect(setupIpc).toBeDefined();
      expect(typeof setupIpc.run).toBe("function");
    });
  });
});
