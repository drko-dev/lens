/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { IncidentDeduplicator } from "../incident-deduplicator";
import { DeterministicRulesEngine } from "../deterministic-rules-engine";
import { LocalIncidentScanner } from "../local-incident-scanner";
import { IncidentRepository } from "../../incident-storage/incident-repository";
import { SqliteClient } from "../../incident-storage/sqlite-client";
import { ALL_MIGRATIONS } from "../../incident-storage/migrations";
import { validateIpcSender } from "../../incident-storage/incident-ipc-validator";
import type { LocalScannerSignal, K8sSnapshot } from "../../../common/incident/local-scanner-types";

describe("H8.6.1: Post-RC Hardening & Security Audit Remediation", () => {
  let sqlite: SqliteClient;
  let incidentRepo: IncidentRepository;
  let deduplicator: IncidentDeduplicator;
  let scanner: LocalIncidentScanner;

  const clusterId = "synthetic-demo-cluster";
  const namespace = "production";

  beforeEach(() => {
    sqlite = new SqliteClient({
      dbPath: ":memory:",
      migrations: ALL_MIGRATIONS,
    });
    sqlite.init();
    incidentRepo = new IncidentRepository(sqlite);
    deduplicator = new IncidentDeduplicator(incidentRepo, 60000); // 60s cooldown
    scanner = new LocalIncidentScanner(incidentRepo, new DeterministicRulesEngine(), deduplicator);
  });

  afterEach(() => {
    scanner.dispose();
    sqlite.close();
  });

  const createSignal = (
    name: string,
    signalType: any = "OOM_KILLED",
    resourceUid?: string,
  ): LocalScannerSignal => ({
    signalType,
    clusterId,
    namespace,
    resourceKind: "Pod",
    resourceName: name,
    resourceUid,
    severity: "critical",
    title: `${signalType} en pod ${name}`,
    message: `Fallo detectado en ${name}`,
    detectedAt: new Date().toISOString(),
    fingerprint: DeterministicRulesEngine.computeSignalFingerprint(
      clusterId,
      namespace,
      "Pod",
      name,
      signalType,
      resourceUid,
    ),
  });

  // =========================================================================
  // 1. DEDUPLICACIÓN Y AISLAMIENTO DE SEÑAL / UID (RC-RES-01)
  // =========================================================================
  describe("RC-RES-01: Deduplicación, Huella Persistida y Aislamiento por UID", () => {
    it("distingue pods recreados con el mismo nombre pero nuevo resourceUid, creando incidentes separados", async () => {
      const signalOriginal = createSignal("checkout-worker", "OOM_KILLED", "uid-pod-gen-1");
      const signalRecreated = createSignal("checkout-worker", "OOM_KILLED", "uid-pod-gen-2");

      expect(signalOriginal.fingerprint).not.toBe(signalRecreated.fingerprint);

      const res1 = await deduplicator.ingestSignal(signalOriginal);
      const res2 = await deduplicator.ingestSignal(signalRecreated);

      expect(res1.isNewIncident).toBe(true);
      expect(res2.isNewIncident).toBe(true);
      expect(res1.incidentId).not.toBe(res2.incidentId);

      const allIncidents = incidentRepo.listIncidents();
      expect(allIncidents.length).toBe(2);

      const inc1 = incidentRepo.getIncidentById(res1.incidentId);
      const inc2 = incidentRepo.getIncidentById(res2.incidentId);
      expect(inc1?.resourceUid).toBe("uid-pod-gen-1");
      expect(inc2?.resourceUid).toBe("uid-pod-gen-2");
    });

    it("distingue dos tipos de señales distintas sobre el mismo recurso sin agruparlas por fallback ambiguo", async () => {
      const oomSignal = createSignal("payment-service", "OOM_KILLED", "uid-shared-100");
      const crashSignal = createSignal("payment-service", "CRASH_LOOP_BACKOFF", "uid-shared-100");

      expect(oomSignal.fingerprint).not.toBe(crashSignal.fingerprint);

      const resOom = await deduplicator.ingestSignal(oomSignal);
      const resCrash = await deduplicator.ingestSignal(crashSignal);

      expect(resOom.isNewIncident).toBe(true);
      expect(resCrash.isNewIncident).toBe(true);
      expect(resOom.incidentId).not.toBe(resCrash.incidentId);

      const incOom = incidentRepo.getIncidentById(resOom.incidentId);
      const incCrash = incidentRepo.getIncidentById(resCrash.incidentId);
      expect(incOom?.signalType).toBe("OOM_KILLED");
      expect(incCrash?.signalType).toBe("CRASH_LOOP_BACKOFF");

      expect(incidentRepo.listIncidents().length).toBe(2);
    });

    it("persiste fingerprint, resourceUid y signalType en columnas indexadas de SQLite", async () => {
      const signal = createSignal("inventory-api", "OOM_KILLED", "uid-inv-555");
      const res = await deduplicator.ingestSignal(signal);

      const db = sqlite.getDb();
      const row = db.prepare("SELECT fingerprint, resource_uid, signal_type FROM incidents WHERE id = ?").get(res.incidentId) as any;

      expect(row).toBeDefined();
      expect(row.fingerprint).toBe(signal.fingerprint);
      expect(row.resource_uid).toBe("uid-inv-555");
      expect(row.signal_type).toBe("OOM_KILLED");

      // Verify that the index idx_incidents_fingerprint exists in SQLite
      const indexRow = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_incidents_fingerprint'").get();
      expect(indexRow).toBeDefined();

      // Test that findOpenIncidentByFingerprint resolves cleanly using the indexed column
      const found = incidentRepo.findOpenIncidentByFingerprint(signal.fingerprint);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(res.incidentId);
      expect(found?.fingerprint).toBe(signal.fingerprint);
    });

    it("recupera la deduplicación tras reinicio en frío mediante consulta indexada de SQLite", async () => {
      const signal = createSignal("cold-restart-pod", "CRASH_LOOP_BACKOFF", "uid-cold-1");
      const first = await deduplicator.ingestSignal(signal);
      expect(first.isNewIncident).toBe(true);

      // Simular reinicio completo limpiando memoria de deduplicación
      deduplicator.clearTracking();
      expect(deduplicator.getTrackedCount()).toBe(0);

      // Nueva ingesta tras reinicio
      const second = await deduplicator.ingestSignal(signal);

      expect(second.isNewIncident).toBe(false);
      expect(second.isDeduplicated).toBe(true);
      expect(second.incidentId).toBe(first.incidentId);

      // No se creó ningún incidente duplicado
      expect(incidentRepo.listIncidents().length).toBe(1);
    });

    it("soporta alta concurrencia de señales mixtas sin carreras ni colisiones de datos", async () => {
      const sigA = createSignal("worker-a", "OOM_KILLED", "uid-a");
      const sigB = createSignal("worker-b", "CRASH_LOOP_BACKOFF", "uid-b");

      // Ejecutar 16 ingestas concurrentes intercaladas
      const promises = [];
      for (let i = 0; i < 8; i++) {
        promises.push(deduplicator.ingestSignal(sigA, 0));
        promises.push(deduplicator.ingestSignal(sigB, 0));
      }

      const results = await Promise.all(promises);
      expect(results.length).toBe(16);

      // Verificamos que exactamente 2 incidentes fueron creados (uno para A y otro para B)
      const incidents = incidentRepo.listIncidents();
      expect(incidents.length).toBe(2);

      const incA = incidents.find(i => i.resourceUid === "uid-a");
      const incB = incidents.find(i => i.resourceUid === "uid-b");
      expect(incA).toBeDefined();
      expect(incB).toBeDefined();
    });
  });

  // =========================================================================
  // 2. IDENTIDAD DE AUDITORÍA Y NO SUPLANTACIÓN (RC-RES-02)
  // =========================================================================
  describe("RC-RES-02: Identidad de Auditoría y No Suplantación de Renderer", () => {
    it("no acepta operatorName del Renderer como identidad autenticada ni eleva privilegios a authenticated-operator", async () => {
      const signal = createSignal("spoof-test-pod", "OOM_KILLED", "uid-spoof-1");
      const created = await deduplicator.ingestSignal(signal);

      // Intento adversarial de enviar operatorName prestigioso ("cluster-admin")
      const result = deduplicator.handleAlertAction({
        incidentId: created.incidentId,
        action: "dismiss",
        dismissReason: "Descarte rutinario",
        operatorName: "cluster-admin",
      });

      expect(result.success).toBe(true);

      const incident = incidentRepo.getIncidentById(created.incidentId);
      expect(incident?.status).toBe("NO CONFIRMADO");

      // Verificar que el actor registrado en timeline es unverified-local-operator
      const timeline = incidentRepo.getTimeline(created.incidentId);
      const dismissEvent = timeline.find(e => e.toStatus === "NO CONFIRMADO");
      expect(dismissEvent).toBeDefined();

      // No debe ser authenticated-operator
      expect(dismissEvent?.metadata?.actorId).toBe("unverified-local-operator");
      expect(dismissEvent?.metadata?.isVerifiedIdentity).toBe(false);
      expect(dismissEvent?.metadata?.claimedOperatorName).toBe("cluster-admin");
      expect(dismissEvent?.authorName).toContain("No verificado");
    });

    it("registra identidad no verificada en acción snooze sin asumir autenticación humana probada", async () => {
      const signal = createSignal("snooze-test-pod", "OOM_KILLED", "uid-snooze-1");
      const created = await deduplicator.ingestSignal(signal);

      const snoozeResult = deduplicator.handleAlertAction({
        incidentId: created.incidentId,
        action: "snooze",
        snoozeDurationMs: 30000,
        operatorName: "security-auditor-root",
      });

      expect(snoozeResult.success).toBe(true);

      const timeline = incidentRepo.getTimeline(created.incidentId);
      const snoozeEvent = timeline.find(e => e.metadata?.action === "snooze");
      expect(snoozeEvent).toBeDefined();
      expect(snoozeEvent?.metadata?.isVerifiedIdentity).toBe(false);
      expect(snoozeEvent?.metadata?.claimedOperatorName).toBe("security-auditor-root");
      expect(snoozeEvent?.metadata?.actorId).toBe("unverified-local-operator");
      expect(snoozeEvent?.authorName).toContain("No verificado");
    });

    it("registra acción analyze_now con operador local no verificado sin desencadenar llamadas de IA", async () => {
      const signal = createSignal("analyze-test-pod", "OOM_KILLED", "uid-analyze-1");
      const created = await deduplicator.ingestSignal(signal);

      const actionResult = deduplicator.handleAlertAction({
        incidentId: created.incidentId,
        action: "analyze_now",
        operatorName: "devops-engineer",
      });

      expect(actionResult.success).toBe(true);

      const timeline = incidentRepo.getTimeline(created.incidentId);
      const analyzeEvent = timeline.find(e => e.metadata?.action === "analyze_now");
      expect(analyzeEvent).toBeDefined();
      expect(analyzeEvent?.metadata?.isVerifiedIdentity).toBe(false);
      expect(analyzeEvent?.metadata?.claimedOperatorName).toBe("devops-engineer");
      expect(analyzeEvent?.metadata?.actorId).toBe("unverified-local-operator");

      // Estado permanece en DETECTADO sin alteraciones por IA
      const inc = incidentRepo.getIncidentById(created.incidentId);
      expect(inc?.status).toBe("DETECTADO");
    });
  });

  // =========================================================================
  // 3. PROCEDENCIA SINTÉTICA Y AISLAMIENTO DE ALCANCE (RC-RES-03)
  // =========================================================================
  describe("RC-RES-03: Procedencia Sintética y Aislamiento de Alcance", () => {
    it("etiqueta explícitamente los incidentes y eventos con procedencia de demo sintético", async () => {
      const signal = createSignal("provenance-pod", "OOM_KILLED", "uid-prov-1");
      const result = await deduplicator.ingestSignal(signal);

      const timeline = incidentRepo.getTimeline(result.incidentId);
      const initEvent = timeline[0];
      expect(initEvent.message).toContain("[DEMO SINTÉTICO]");

      const fpEvent = timeline.find(e => e.metadata?.provenance);
      expect(fpEvent).toBeDefined();
      expect(fpEvent?.metadata?.sourceType).toBe("synthetic_feed");
      expect(fpEvent?.metadata?.isSyntheticDemo).toBe(true);
      expect(fpEvent?.metadata?.provenance).toBe("synthetic_renderer_snapshot");
    });

    it("aplica aislamiento estricto de namespace rechazando o filtrando recursos fuera del ámbito", async () => {
      await scanner.start({
        clusterId,
        namespace: "production",
      });

      const mixedSnapshot: K8sSnapshot = {
        pods: [
          {
            kind: "Pod",
            metadata: {
              name: "prod-service",
              namespace: "production",
              uid: "uid-prod",
            },
            status: {
              containerStatuses: [
                {
                  name: "c1",
                  ready: false,
                  restartCount: 1,
                  lastState: { terminated: { reason: "OOMKilled", exitCode: 137 } },
                },
              ],
            },
          },
          {
            kind: "Pod",
            metadata: {
              name: "kube-dns-alien",
              namespace: "kube-system",
              uid: "uid-alien",
            },
            status: {
              containerStatuses: [
                {
                  name: "dns",
                  ready: false,
                  restartCount: 1,
                  lastState: { terminated: { reason: "OOMKilled", exitCode: 137 } },
                },
              ],
            },
          },
        ],
      };

      const detected = await scanner.processSnapshot(mixedSnapshot);

      // Solo el pod de production debe generar señal
      expect(detected.length).toBe(1);
      expect(detected[0].resourceName).toBe("prod-service");
      expect(detected[0].namespace).toBe("production");

      const allIncidents = incidentRepo.listIncidents();
      expect(allIncidents.length).toBe(1);
      expect(allIncidents[0].namespace).toBe("production");
    });

    it("valida el frame emisor de IPC y rechaza ventanas ajenas o subframes", () => {
      // Evento nulo
      expect(() => validateIpcSender(null)).toThrow(/SecurityError: IPC invocation missing valid event context/);

      // Subframe / iframe
      const subframeEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: { isDestroyed: () => false, parent: {}, url: "https://lens.app/index.html" },
      };
      expect(() => validateIpcSender(subframeEvent)).toThrow(/SecurityError: IPC invocation from subframe or iframe is forbidden/);

      // Origen no autorizado
      const untrustedOriginEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: { isDestroyed: () => false, parent: null, url: "http://malicious-site.com:8080" },
      };
      expect(() => validateIpcSender(untrustedOriginEvent)).toThrow(/SecurityError: Unauthorized IPC sender frame origin/);

      // Origen de producción válido
      const validEvent = {
        sender: { isDestroyed: () => false },
        senderFrame: { isDestroyed: () => false, parent: null, url: "https://lens.app:54321/workloads" },
      };
      expect(() => validateIpcSender(validEvent)).not.toThrow();
    });
  });
});
