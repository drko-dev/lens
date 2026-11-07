/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { SqliteClient } from "../sqlite-client";
import { ALL_MIGRATIONS } from "../migrations";
import { IncidentRepository } from "../incident-repository";
import { EvidenceRepository } from "../evidence-repository";
import { IncidentConfirmationManager } from "../incident-confirmation-manager";

describe("IncidentConfirmationManager (H8.1.1: Secure Human Confirmation & Gate Remediation)", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let evidenceRepo: EvidenceRepository;
  let confirmationManager: IncidentConfirmationManager;

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();

    incidentRepo = new IncidentRepository(sqlite);
    evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
    confirmationManager = new IncidentConfirmationManager(incidentRepo);
  });

  afterEach(() => {
    sqlite.close();
  });

  function setupConfirmedIncident() {
    const incident = incidentRepo.createIncident({
      title: "CrashLoopBackOff in payment gateway",
      clusterId: "c-prod-1",
      namespace: "payments",
      severity: "critical",
      creator: { type: "human", name: "oncall-lead" },
    });

    const ev = evidenceRepo.ingestEvidence({
      incidentId: incident.id,
      type: "k8s_event",
      origin: "kubectl get events",
      title: "OOMKilled Event",
      rawContent: "Pod payment-gw-123 killed by OOMKiller",
      clusterId: "c-prod-1",
      namespace: "payments",
    });

    incidentRepo.transitionStatus({
      incidentId: incident.id,
      toStatus: "INVESTIGANDO",
      actor: { type: "human", name: "oncall-lead" },
      justification: "Iniciando triage formal del crashloop",
    });

    incidentRepo.transitionStatus({
      incidentId: incident.id,
      toStatus: "HIPÓTESIS",
      actor: { type: "human", name: "oncall-lead" },
      metadata: { hypothesis: "OOMKilled due to JVM heap cap" },
      justification: "Hipótesis sustentada en límites de cgroup",
    });

    incidentRepo.transitionStatus({
      incidentId: incident.id,
      toStatus: "CONFIRMADO",
      actor: { type: "human", name: "oncall-lead" },
      evidenceIds: [ev.evidence.id],
      justification: "Confirmado fehacientemente vía métricas cgroup",
    });

    incidentRepo.transitionStatus({
      incidentId: incident.id,
      toStatus: "SOLUCIÓN PROPUESTA",
      actor: { type: "human", name: "oncall-lead" },
      metadata: { proposedSolution: "Increase memory limit from 1Gi to 2Gi" },
      justification: "Aumento de memoria de pods a 2Gi",
    });

    return incident;
  }

  it("creates ephemeral token, validates status, and resolves privileged transition on APPROVED without persisting token in timeline", async () => {
    const incident = setupConfirmedIncident();

    // Request privileged transition to APROBACIÓN HUMANA
    const requestPromise = confirmationManager.requestPrivilegedTransition({
      incidentId: incident.id,
      toStatus: "APROBACIÓN HUMANA",
      justification: "Verificación de impacto y rollback antes de aplicar el patch",
    });

    // Inspect pending tokens inside manager
    const pendingMap = (confirmationManager as any).pending as Map<string, any>;
    expect(pendingMap.size).toBe(1);

    const [token, pendingItem] = Array.from(pendingMap.entries())[0];
    expect(token).toBeDefined();
    expect(pendingItem.incidentId).toBe(incident.id);
    expect(pendingItem.toStatus).toBe("APROBACIÓN HUMANA");
    expect(pendingItem.expiresAt).toBeGreaterThan(Date.now());

    // Submit approval
    const result = await confirmationManager.submitConfirmationForTesting(token, "APPROVED");

    expect(result.incident.status).toBe("APROBACIÓN HUMANA");
    expect(result.timelineEvent.authorName).toBe("verified-operator");
    expect(result.timelineEvent.metadata?.verifiedVia).toBe("isolated-modal-interactive-consent");

    // SEC-H8-05: Sensitive authorization token must NOT be persisted in timeline metadata
    expect(result.timelineEvent.metadata?.confirmationToken).toBeUndefined();
    expect(result.timelineEvent.metadata?.auditReference).toMatch(/^audit-conf-/);

    // Verify token was single-use and consumed
    expect(pendingMap.size).toBe(0);

    const finalIncident = incidentRepo.getIncidentById(incident.id);
    expect(finalIncident?.status).toBe("APROBACIÓN HUMANA");

    // The original promise resolves with the same result
    const awaitedResult = await requestPromise;
    expect(awaitedResult.incident.status).toBe("APROBACIÓN HUMANA");
  });

  it("handles operator rejection correctly by failing the promise and leaving incident state untouched", async () => {
    const incident = setupConfirmedIncident();

    const requestPromise = confirmationManager.requestPrivilegedTransition({
      incidentId: incident.id,
      toStatus: "APROBACIÓN HUMANA",
      justification: "Propuesta de cambio rechazada por el operador",
    });

    const pendingMap = (confirmationManager as any).pending as Map<string, any>;
    const [token] = Array.from(pendingMap.entries())[0];

    await expect(
      confirmationManager.submitConfirmationForTesting(token, "REJECTED"),
    ).rejects.toThrow(/el operador rechazó la confirmación/);

    await expect(requestPromise).rejects.toThrow(/el operador rechazó la confirmación/);

    // State is still SOLUCIÓN PROPUESTA
    const currentIncident = incidentRepo.getIncidentById(incident.id);
    expect(currentIncident?.status).toBe("SOLUCIÓN PROPUESTA");
  });

  it("strictly validates decision at runtime, rejecting invalid or arbitrary values (SEC-H8-04)", async () => {
    const incident = setupConfirmedIncident();

    confirmationManager.requestPrivilegedTransition({
      incidentId: incident.id,
      toStatus: "APROBACIÓN HUMANA",
      justification: "Prueba de validación estricta de decision",
    });

    const pendingMap = (confirmationManager as any).pending as Map<string, any>;
    const [token] = Array.from(pendingMap.entries())[0];

    await expect(
      (confirmationManager as any).processConfirmationResponse(token, "MAYBE"),
    ).rejects.toThrow(/Decision must be strictly 'APPROVED' or 'REJECTED'/);

    await expect(
      (confirmationManager as any).processConfirmationResponse(token, ""),
    ).rejects.toThrow(/Decision must be strictly 'APPROVED' or 'REJECTED'/);

    await expect(
      (confirmationManager as any).processConfirmationResponse(token, 1234),
    ).rejects.toThrow(/Decision must be strictly 'APPROVED' or 'REJECTED'/);

    await expect(
      (confirmationManager as any).processConfirmationResponse(token, null),
    ).rejects.toThrow(/Decision must be strictly 'APPROVED' or 'REJECTED'/);
  });

  it("prevents single-use tokens from being consumed more than once (replay protection)", async () => {
    const incident = setupConfirmedIncident();

    const promise = confirmationManager.requestPrivilegedTransition({
      incidentId: incident.id,
      toStatus: "APROBACIÓN HUMANA",
      justification: "Justificación de prueba válida",
    });

    const pendingMap = (confirmationManager as any).pending as Map<string, any>;
    const [token] = Array.from(pendingMap.entries())[0];

    // First consumption succeeds
    await confirmationManager.submitConfirmationForTesting(token, "APPROVED");
    await promise;

    // Second consumption must fail immediately
    await expect(
      confirmationManager.submitConfirmationForTesting(token, "APPROVED"),
    ).rejects.toThrow(/SecurityError: Confirmation token not found or already consumed/);
  });

  it("rejects expired confirmation tokens after 60s TTL", async () => {
    const incident = setupConfirmedIncident();

    const requestPromise = confirmationManager.requestPrivilegedTransition({
      incidentId: incident.id,
      toStatus: "APROBACIÓN HUMANA",
      justification: "Valid human justification",
    });
    // Attach silent rejection handler to prevent unhandled rejection during expiration test
    requestPromise.catch(() => {});

    const pendingMap = (confirmationManager as any).pending as Map<string, any>;
    const [token, item] = Array.from(pendingMap.entries())[0];

    // Simulate expiration
    item.expiresAt = Date.now() - 1000;

    await expect(
      confirmationManager.submitConfirmationForTesting(token, "APPROVED"),
    ).rejects.toThrow(/SecurityError: Confirmation token has expired/);
  });

  it("rejects promises if SQLite transaction fails, guaranteeing no hung promises (SEC-H8-05)", async () => {
    const incident = setupConfirmedIncident();

    const promise = confirmationManager.requestPrivilegedTransition({
      incidentId: incident.id,
      toStatus: "APROBACIÓN HUMANA",
      justification: "Prueba de error en SQLite",
    });

    const pendingMap = (confirmationManager as any).pending as Map<string, any>;
    const [token] = Array.from(pendingMap.entries())[0];

    // Simulate an unexpected SQLite error during transition
    jest.spyOn(incidentRepo, "transitionStatus").mockImplementationOnce(() => {
      throw new Error("SqliteError: disk I/O error or constraint violation");
    });

    await expect(
      confirmationManager.submitConfirmationForTesting(token, "APPROVED"),
    ).rejects.toThrow("SqliteError: disk I/O error or constraint violation");

    // The caller's promise must also be rejected cleanly
    await expect(promise).rejects.toThrow("SqliteError: disk I/O error or constraint violation");
  });

  it("enforces state machine validation before issuing confirmation tokens", async () => {
    const incident = incidentRepo.createIncident({
      title: "Invalid jump test",
      clusterId: "c1",
      namespace: "default",
      severity: "low",
      creator: { type: "human", name: "tester" },
    });

    // Incident is in 'DETECTADO'. Cannot jump to 'APROBACIÓN HUMANA' or 'CERRADO' directly.
    await expect(
      confirmationManager.requestPrivilegedTransition({
        incidentId: incident.id,
        toStatus: "APROBACIÓN HUMANA",
        justification: "Premature transition attempt",
      }),
    ).rejects.toThrow(/Transición denegada/);

    await expect(
      confirmationManager.requestPrivilegedTransition({
        incidentId: incident.id,
        toStatus: "CERRADO",
        justification: "Premature close attempt",
      }),
    ).rejects.toThrow(/Transición denegada/);
  });

  it("supports native dialog confirmation mode when configured (uiMode: 'native-dialog')", async () => {
    const mockShowMessageBox = jest.fn().mockResolvedValue({
      response: 1,
      checkboxChecked: false,
    });

    const nativeManager = new IncidentConfirmationManager(incidentRepo, {
      uiMode: "native-dialog",
      dialogProvider: { showMessageBox: mockShowMessageBox },
    });
    const incident = setupConfirmedIncident();

    const result = await nativeManager.requestPrivilegedTransition({
      incidentId: incident.id,
      toStatus: "APROBACIÓN HUMANA",
      justification: "Aprobación autorizada mediante diálogo nativo OS",
    });

    expect(mockShowMessageBox).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        type: "warning",
        buttons: ["Cancelar", "Autorizar Transición"],
        title: expect.stringContaining("OpenLens DevOps"),
      }),
    );
    expect(result.incident.status).toBe("APROBACIÓN HUMANA");
  });
});
