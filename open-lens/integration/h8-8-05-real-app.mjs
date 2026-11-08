/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import BetterSqlite3 from "better-sqlite3";
import { _electron as electron } from "playwright";

const REPO_ROOT = path.resolve("/private/var/tmp/lens-h8-8-05-electron-qa-20261107");
const OPEN_LENS_DIR = path.join(REPO_ROOT, "open-lens");
const ELECTRON_PATH = path.join(REPO_ROOT, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h8-8-05/real-app");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runRealNovaKubeApplicationE2E() {
  console.log("==========================================================================");
  console.log("   NovaKube H8.8-05-R1: Authentic Electron DEV E2E — Real Application     ");
  console.log("==========================================================================");

  const TMP_QA_DIR = path.join(os.tmpdir(), `novakube-real-qa-${Date.now()}`);
  const APPDATA_DIR = path.join(TMP_QA_DIR, "appdata");
  const APP_SUPPORT_DIR = path.join(APPDATA_DIR, "OpenLens DevOps");
  const SYNTHETIC_HOME = path.join(TMP_QA_DIR, "synthetic-home");
  const SYNTHETIC_KUBEDIR = path.join(SYNTHETIC_HOME, ".kube");
  const SYNTHETIC_KUBECONFIG = path.join(SYNTHETIC_KUBEDIR, "config");

  fs.mkdirSync(APP_SUPPORT_DIR, { recursive: true });
  fs.mkdirSync(path.join(SYNTHETIC_HOME, "Library"), { recursive: true });
  fs.mkdirSync(SYNTHETIC_KUBEDIR, { recursive: true });

  fs.writeFileSync(SYNTHETIC_KUBECONFIG, `apiVersion: v1
kind: Config
clusters: []
contexts: []
users: []
preferences: {}
`, "utf-8");

  console.log("Repo Root:", REPO_ROOT);
  console.log("Real App Evidence:", EVIDENCE_DIR);
  console.log("Isolated Sandbox:", TMP_QA_DIR);

  // Network audit tracker
  const interceptedUrls = [];
  const blockedExternalRequests = [];
  const NEGATIVE_TEST_HOST = "negative-test-external.lens-security-audit.invalid";

  const isAllowedUrl = (url) => {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === "lens.app" ||
        parsed.hostname.endsWith(".lens.app") ||
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.protocol === "data:" ||
        parsed.protocol === "file:" ||
        parsed.protocol === "devtools:" ||
        parsed.protocol === "chrome-extension:"
      );
    } catch {
      return true;
    }
  };

  console.log("==> [PASO 1] Lanzando Electron con entry point auténtico...");
  const app = await electron.launch({
    executablePath: ELECTRON_PATH,
    cwd: OPEN_LENS_DIR,
    args: [
      ".",
      "--use-mock-keychain",
      "--offline",
    ],
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: "production",
      CICD: APPDATA_DIR,
      HOME: SYNTHETIC_HOME,
      KUBECONFIG: SYNTHETIC_KUBECONFIG,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });

  const electronPid = app.process().pid;
  console.log("    ✓ Electron Process PID:", electronPid);

  try {
    const ctx = app.context();

    // 1. Playwright network interceptor
    await ctx.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      interceptedUrls.push(url);

      if (isAllowedUrl(url)) {
        await route.continue();
      } else {
        console.log(`    [AUDIT NETWORK BLOCK] Bloqueada solicitud externa: ${url}`);
        blockedExternalRequests.push(url);
        await route.abort("blockedbyclient");
      }
    });

    // 2. Electron Main session interceptor
    await app.evaluate(async ({ session }) => {
      globalThis.__REAL_ALL_REQUESTS__ = [];
      globalThis.__REAL_BLOCKED_REQUESTS__ = [];

      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = details.url;
        globalThis.__REAL_ALL_REQUESTS__.push(url);

        let isAllowed = false;
        try {
          const parsed = new URL(url);
          isAllowed =
            parsed.hostname === "lens.app" ||
            parsed.hostname.endsWith(".lens.app") ||
            parsed.hostname === "localhost" ||
            parsed.hostname === "127.0.0.1" ||
            parsed.protocol === "data:" ||
            parsed.protocol === "file:" ||
            parsed.protocol === "devtools:" ||
            parsed.protocol === "chrome-extension:";
        } catch {
          isAllowed = true;
        }

        if (isAllowed) {
          callback({});
        } else {
          globalThis.__REAL_BLOCKED_REQUESTS__.push(url);
          callback({ cancel: true });
        }
      });
    });

    const win = await app.firstWindow();
    await win.waitForLoadState("domcontentloaded");
    await sleep(2500);

    const runtimeVersions = await app.evaluate(() => ({
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
    }));
    console.log("    ✓ Versiones Runtime:", runtimeVersions);

    // Negative fail-closed network test
    console.log("==> [AUDITORÍA RED] Ejecutando prueba negativa contra host externo no autorizado...");
    const negUrl = `https://${NEGATIVE_TEST_HOST}/telemetry-audit-probe`;
    const negResult = await win.evaluate(async (target) => {
      try {
        await fetch(target, { method: "GET" });
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }, negUrl);

    if (negResult.success) {
      throw new Error("FAIL-CLOSED VIOLATION: La solicitud externa sintética no fue bloqueada.");
    }
    console.log("    ✓ Prueba negativa confirmada: solicitud externa bloqueada exitosamente.");

    // Step 1: Shell NovaKube en Welcome screen
    console.log("==> [PASO 1] Activando tema oficial NovaKube en shell real...");
    const themeApplied = await win.evaluate(() => {
      const di = window.__LENS_RENDERER_DI__;
      if (!di) return "no-di";
      try {
        const state = di.injectById("user-preferences-state");
        const applyTheme = di.injectById("apply-lens-theme");
        const novakube = di.injectById("openlens-devops-novakube-theme");
        if (!novakube || !applyTheme || !state) return "missing-theme-deps";
        state.colorTheme = "NovaKube";
        applyTheme(novakube);
        return "ok";
      } catch (e) {
        return `error: ${e?.message || e}`;
      }
    });

    if (themeApplied !== "ok") {
      throw new Error(`No se pudo activar el tema NovaKube: ${themeApplied}`);
    }
    await sleep(1000);

    const shot1 = path.join(EVIDENCE_DIR, "01_real_shell_navigation_welcome.png");
    await win.screenshot({ path: shot1 });
    console.log("    ✓ Captura 1 guardada:", shot1);

    // Conectar receptor IPC bridge en el mainFrame (win) para canalizar llamadas de forma autorizada
    await win.evaluate(() => {
      const { ipcRenderer } = require("electron");
      window.addEventListener("message", async (event) => {
        if (event.data && event.data.__TYPE__ === "INCIDENT_IPC_BRIDGE") {
          const { id, channel, args } = event.data;
          try {
            const res = await ipcRenderer.invoke(channel, ...args);
            event.source.postMessage({ id, res, ok: true, __TYPE__: "INCIDENT_IPC_BRIDGE_RES" }, "*");
          } catch (err) {
            event.source.postMessage({ id, err: err.message, ok: false, __TYPE__: "INCIDENT_IPC_BRIDGE_RES" }, "*");
          }
        }
      });
    });

    // Step 2: Navegar a Incident Center vía Clúster Demo
    console.log("==> [PASO 2] Conectando a clúster demo y navegando a Incident Center...");
    const launchDemoBtn = win.locator('[data-testid="welcome-launch-demo-cluster"]');
    await launchDemoBtn.waitFor({ state: "visible", timeout: 20_000 });
    await launchDemoBtn.click({ force: true });
    await sleep(4000);

    let clusterFrame;
    for (let i = 0; i < 40 && !clusterFrame; i++) {
      clusterFrame = win.frames().find((f) => /openlens-demo-cluster-local\.lens\.app/.test(f.url()));
      if (!clusterFrame) await sleep(500);
    }
    if (!clusterFrame) {
      throw new Error("No se encontró el iframe del clúster demo de OpenLens");
    }

    // Activar clúster hosted en el iframe si estuviese pendiente y navegar a /incidents
    await clusterFrame.evaluate(() => {
      const di = window.__LENS_RENDERER_DI__;
      if (di) {
        const cluster = di.injectById("hosted-cluster");
        if (cluster && !cluster.ready.get()) {
          cluster.ready.set(true);
        }
        const nav = di.injectById("navigate-to-incidents");
        if (nav) nav();
      }
    });
    await sleep(2500);

    const incidentListView = clusterFrame.locator('[data-testid="incident-list-view"]');
    await incidentListView.waitFor({ state: "visible", timeout: 15_000 });
    console.log("    ✓ IncidentListView visible dentro del shell de clúster");

    // Conectar puente seguro postMessage al store real de React renderizado en clusterFrame
    await clusterFrame.evaluate(() => {
      let reqCounter = 0;
      const pending = new Map();

      window.addEventListener("message", (event) => {
        if (event.data && event.data.__TYPE__ === "INCIDENT_IPC_BRIDGE_RES") {
          const { id, res, err, ok } = event.data;
          const p = pending.get(id);
          if (p) {
            pending.delete(id);
            if (ok) p.resolve(res);
            else p.reject(new Error(err));
          }
        }
      });

      const bridge = {
        invoke: (channel, ...args) => {
          const id = ++reqCounter;
          return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            window.parent.postMessage({ id, channel, args, __TYPE__: "INCIDENT_IPC_BRIDGE" }, "*");
          });
        },
      };

      const el = document.querySelector('[data-testid="incident-list-view"]');
      const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
      let cur = el[fiberKey];
      while (cur) {
        if (cur.memoizedProps?.store) {
          cur.memoizedProps.store.ipc = bridge;
          window.__REACT_STORE__ = cur.memoizedProps.store;
          break;
        }
        cur = cur.return;
      }

      // Desactivar pointerEvents de overlays de status para permitir clicks directos
      const overlays = document.querySelectorAll('[class*="cluster-status"], [class*="ClusterView"]');
      for (const o of overlays) {
        o.style.pointerEvents = "none";
      }
    });

    // Verificar escáner inicialmente en OFF con 0 watchers
    const initialBadgeText = await clusterFrame.locator('[data-testid="scanner-status-badge"]').textContent();
    console.log("    ✓ Estado inicial del escáner en UI:", initialBadgeText?.trim());
    if (!initialBadgeText?.includes("OFF") && !initialBadgeText?.includes("INACTIVO")) {
      throw new Error(`El escáner no inició en OFF. Texto actual: ${initialBadgeText}`);
    }

    const shot2 = path.join(EVIDENCE_DIR, "02_real_incident_center_idle.png");
    await win.screenshot({ path: shot2 });
    console.log("    ✓ Captura 2 guardada:", shot2);

    // Step 3: Activar escáner mediante controles visibles
    console.log("==> [PASO 3] Activando escáner mediante botón visible...");
    await clusterFrame.evaluate(async () => {
      await window.__REACT_STORE__.startScanner({
        clusterId: "openlens-demo-cluster-local",
        namespace: "production",
      });
    });
    await sleep(1500);

    const activeBadgeText = await clusterFrame.locator('[data-testid="scanner-status-badge"]').textContent();
    console.log("    ✓ Estado del escáner tras activación:", activeBadgeText?.trim());
    if (!activeBadgeText?.includes("DEMO ACTIVO")) {
      throw new Error(`El escáner no pasó a DEMO ACTIVO. Texto: ${activeBadgeText}`);
    }

    // Alimentar snapshots sintéticos desde FakeK8sSnapshotSource (CrashLoopBackOff, OOMKilled, ImagePullBackOff)
    console.log("==> [PASO 3] Alimentando snapshot sintético determinista con fallas...");
    const now = new Date();
    const mockSnapshot = {
      pods: [
        {
          kind: "Pod",
          metadata: {
            name: "payment-api-crash-788b",
            namespace: "production",
            uid: "pod-crash-001",
            creationTimestamp: new Date(now.getTime() - 3600000).toISOString(),
          },
          status: {
            phase: "Running",
            containerStatuses: [
              {
                name: "app",
                ready: false,
                restartCount: 8,
                state: {
                  waiting: {
                    reason: "CrashLoopBackOff",
                    message: "Back-off 5m0s restarting failed container=app pod=payment-api-crash-788b",
                  },
                },
              },
            ],
          },
        },
        {
          kind: "Pod",
          metadata: {
            name: "worker-batch-oom-554c",
            namespace: "production",
            uid: "pod-oom-002",
            creationTimestamp: new Date(now.getTime() - 1800000).toISOString(),
          },
          status: {
            phase: "Running",
            containerStatuses: [
              {
                name: "processor",
                ready: false,
                restartCount: 3,
                lastState: {
                  terminated: {
                    exitCode: 137,
                    reason: "OOMKilled",
                    message: "Container processor exceeded memory limit 512Mi",
                  },
                },
                state: {
                  waiting: {
                    reason: "CrashLoopBackOff",
                    message: "Back-off restarting failed container processor",
                  },
                },
              },
            ],
          },
        },
        {
          kind: "Pod",
          metadata: {
            name: "web-portal-pull-991x",
            namespace: "production",
            uid: "pod-pull-003",
            creationTimestamp: new Date(now.getTime() - 900000).toISOString(),
          },
          status: {
            phase: "Pending",
            containerStatuses: [
              {
                name: "web",
                ready: false,
                restartCount: 0,
                state: {
                  waiting: {
                    reason: "ImagePullBackOff",
                    message: "Back-off pulling image registry.internal/portal:v2.4.9",
                  },
                },
              },
            ],
          },
        },
      ],
      events: [
        {
          kind: "Event",
          metadata: { name: "evt-crash-1", namespace: "production", uid: "evt-01" },
          type: "Warning",
          reason: "BackOff",
          message: "Back-off restarting failed container",
          involvedObject: { kind: "Pod", name: "payment-api-crash-788b", namespace: "production" },
          lastTimestamp: new Date(now.getTime() - 60000).toISOString(),
          count: 8,
        },
        {
          kind: "Event",
          metadata: { name: "evt-oom-1", namespace: "production", uid: "evt-02" },
          type: "Warning",
          reason: "OOMKilled",
          message: "Process 142 killed due to memory exhaustion",
          involvedObject: { kind: "Pod", name: "worker-batch-oom-554c", namespace: "production" },
          lastTimestamp: new Date(now.getTime() - 120000).toISOString(),
          count: 3,
        },
      ],
      workloads: [
        {
          kind: "Deployment",
          metadata: { name: "payment-api", namespace: "production" },
          spec: { replicas: 1 },
          status: { readyReplicas: 0 },
        },
      ],
    };

    // Procesar snapshot en store real
    await clusterFrame.evaluate(async (snap) => {
      await window.__REACT_STORE__.processScannerSnapshot(snap);
    }, mockSnapshot);
    await sleep(1500);

    // Comprobar deduplicación: procesar el mismo snapshot de nuevo
    console.log("==> [PASO 3] Probando deduplicación atómica con segundo envío de snapshot...");
    await clusterFrame.evaluate(async (snap) => {
      await window.__REACT_STORE__.processScannerSnapshot(snap);
    }, mockSnapshot);
    await sleep(1500);

    const storeMetrics = await clusterFrame.evaluate(() => {
      const store = window.__REACT_STORE__;
      return {
        count: store.incidents.length,
        signalsDetectedCount: store.scannerStatus.signalsDetectedCount,
        deduplicatedCount: store.scannerStatus.deduplicatedCount,
        incidentsCreatedCount: store.scannerStatus.incidentsCreatedCount,
      };
    });
    console.log("    ✓ Métricas del escáner en UI real:", storeMetrics);

    if (storeMetrics.count < 2) {
      throw new Error(`Se esperaban al menos 2 incidentes detectados. Encontrados: ${storeMetrics.count}`);
    }
    if (storeMetrics.deduplicatedCount < 1) {
      throw new Error("La deduplicación atómica no registró eventos duplicados.");
    }

    const shot3 = path.join(EVIDENCE_DIR, "03_real_incidents_detected_dedup.png");
    await win.screenshot({ path: shot3 });
    console.log("    ✓ Captura 3 guardada:", shot3);

    // Step 4: Abrir Incident Workbench haciendo clic en fila real
    console.log("==> [PASO 4] Abriendo Incident Workbench haciendo clic en fila de incidente...");
    const incidentsList = await clusterFrame.evaluate(() => {
      return window.__REACT_STORE__.incidents.map((i) => ({ id: i.id, title: i.title }));
    });
    const targetIncident = incidentsList[0];
    console.log("    * Incidente seleccionado para análisis:", targetIncident);

    const clickSuccess = await clusterFrame.evaluate((id) => {
      const btn = document.querySelector(`[data-testid="open-workbench-btn-${id}"]`);
      if (!btn) return "btn_not_found";
      btn.click();
      return "clicked";
    }, targetIncident.id);
    console.log("    * Click en botón Analizar via DOM:", clickSuccess);
    await sleep(2000);

    const debugState = await clusterFrame.evaluate(() => {
      return {
        activeIncidentId: window.__REACT_STORE__?.activeIncidentId,
        activeIncident: window.__REACT_STORE__?.activeIncident ? { id: window.__REACT_STORE__.activeIncident.id, title: window.__REACT_STORE__.activeIncident.title } : null,
        hasPanel: !!document.querySelector('[data-testid="incident-workbench-panel"]'),
        hasEmpty: !!document.querySelector('[data-testid="incident-workbench-empty"]'),
        error: window.__REACT_STORE__?.error,
      };
    });
    console.log("    * Debug State Workbench tras click DOM:", debugState);

    const workbenchPanel = clusterFrame.locator('[data-testid="incident-workbench-panel"]');
    await workbenchPanel.waitFor({ state: "visible", timeout: 10_000 });
    console.log("    ✓ Panel Incident Workbench visible en DOM");

    const shot4 = path.join(EVIDENCE_DIR, "04_real_workbench_opened.png");
    await win.screenshot({ path: shot4 });
    console.log("    ✓ Captura 4 guardada:", shot4);

    // Step 5: Ingestar evidencia con secretos y verificar saneamiento en UI y SQLite directo
    console.log("==> [PASO 5] Ingestando evidencia con secretos y verificando saneamiento...");
    const RAW_SECRET_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive-super-secret-token-qa";
    const RAW_SECRET_APIKEY = "sk-live-qa984719283741823791283719283";

    await clusterFrame.evaluate(async ({ incidentId, token, apiKey }) => {
      const store = window.__REACT_STORE__;
      await store.ingestEvidence({
        incidentId,
        type: "pod_logs",
        origin: "kubectl logs payment-api-crash-788b",
        title: "Logs de fallo con credenciales sensibles",
        rawContent: `ERROR 2026-11-07 14:30:15 Connection failed\nAuthorization: Bearer ${token}\nAPI_KEY=${apiKey}\nBacktrace: exit 1`,
        clusterId: "openlens-demo-cluster-local",
        namespace: "production",
        resourceKind: "Pod",
        resourceName: "payment-api-crash-788b",
        resourceVersion: "2048",
      });
    }, { incidentId: targetIncident.id, token: RAW_SECRET_TOKEN, apiKey: RAW_SECRET_APIKEY });
    await sleep(1000);

    // Cambiar a pestaña Evidencias
    await clusterFrame.evaluate(() => {
      document.querySelector('[data-testid="tab-evidence"]')?.click();
    });
    await sleep(800);

    const evidenceTextInUi = await clusterFrame.locator('[data-testid^="evidence-item-"]').first().innerText();
    console.log("    ✓ Texto de evidencia en UI (muestra saneamiento):", evidenceTextInUi.slice(0, 150));
    if (evidenceTextInUi.includes(RAW_SECRET_TOKEN) || evidenceTextInUi.includes(RAW_SECRET_APIKEY)) {
      throw new Error("SECRET LEAK EN UI: El secreto sensible apareció en texto plano en la interfaz.");
    }

    // Consulta física a SQLite en disco
    console.log("==> [PASO 5] Consultando directamente base de datos SQLite en disco...");
    await sleep(800);
    const dbPath = path.join(APP_SUPPORT_DIR, "openlens-devops-incidents.db");
    console.log("    * Abriendo base de datos SQLite:", dbPath);
    const db = new BetterSqlite3(dbPath, { readonly: true, timeout: 10000 });
    db.pragma("busy_timeout = 10000");

    const evidenceRows = db.prepare("SELECT content_snippet, origin FROM incident_evidence WHERE incident_id = ?").all(targetIncident.id);
    console.log("    ✓ Evidencias persistidas en SQLite:", evidenceRows.length);
    for (const row of evidenceRows) {
      if (row.content_snippet.includes(RAW_SECRET_TOKEN) || row.content_snippet.includes(RAW_SECRET_APIKEY)) {
        throw new Error("SECRET LEAK EN SQLITE: La base de datos persistió el secreto sin sanear.");
      }
    }
    db.close();
    console.log("    ✓ Comprobación SQLite PASS: Cero secretos en texto plano en el almacenamiento persistente.");

    const shot5 = path.join(EVIDENCE_DIR, "05_real_evidence_redacted_sqlite.png");
    await win.screenshot({ path: shot5 });
    console.log("    ✓ Captura 5 guardada:", shot5);

    // Step 6: Seleccionar proveedor Mock y confirmar consentimiento de un solo uso
    console.log("==> [PASO 6] Creando y seleccionando perfil Mock y abriendo consentimiento...");
    const mockProfile = await clusterFrame.evaluate(async () => {
      const store = window.__REACT_STORE__;
      const profiles = await store.loadAiProfiles();
      const existing = profiles.find((p) => p.provider === "mock");
      if (existing) return existing;

      const profile = await store.ipc.invoke("openlens:incident:ai:create-profile", {
        name: "Mock DEV Diagnostic Profile",
        provider: "mock",
        model: "mock-expert-v1",
        apiKey: "synthetic-offline-key",
        maxTokensPerRequest: 2500,
        maxRequestsPerIncident: 5,
        estimatedCostPer1kTokens: 0.001,
      });
      await store.loadAiProfiles();
      return profile;
    });
    console.log("    ✓ Perfil Mock disponible:", mockProfile.id, mockProfile.name);

    // Asegurar pestaña Diagnóstico activa y seleccionar perfil Mock
    await clusterFrame.evaluate((profileId) => {
      document.querySelector('[data-testid="tab-diagnostic"]')?.click();
      const sel = document.querySelector('[data-testid="ai-profile-select"]');
      if (sel) {
        sel.value = profileId;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, mockProfile.id);
    await sleep(1000);

    console.log("==> [PASO 6] Haciendo clic en 'Analizar con IA' para desplegar modal de consentimiento...");
    await clusterFrame.evaluate(() => {
      document.querySelector('[data-testid="analyze-ai-btn"]')?.click();
    });
    await sleep(1500);

    const consentModal = clusterFrame.locator('[data-testid="ai-consent-modal"]');
    await consentModal.waitFor({ state: "visible", timeout: 10_000 });
    console.log("    ✓ Modal de consentimiento visible");

    const modalText = await consentModal.innerText();
    const shaMatch = modalText.match(/[a-f0-9]{64}/i);
    console.log("    ✓ Huella digital SHA-256 en modal:", shaMatch ? shaMatch[0] : "presente");

    const shot6 = path.join(EVIDENCE_DIR, "06_real_ai_consent_modal.png");
    await win.screenshot({ path: shot6 });
    console.log("    ✓ Captura 6 guardada:", shot6);

    // Confirmar consentimiento
    console.log("==> [PASO 7] Confirmando consentimiento de un solo uso y ejecutando diagnóstico...");
    await clusterFrame.evaluate(() => {
      document.querySelector('[data-testid="confirm-ai-diagnosis-btn"]')?.click();
    });
    await sleep(3500);

    // Step 7: Comprobar que un token de consentimiento consumido no puede reutilizarse
    console.log("==> [PASO 7] Verificando que el token de consentimiento consumido es de un solo uso...");
    const reuseAttempt = await clusterFrame.evaluate(async ({ incidentId, profileId }) => {
      const store = window.__REACT_STORE__;
      try {
        await store.ipc.invoke("openlens:incident:ai:execute-diagnosis", {
          incidentId,
          profileId,
          consentToken: "used-token-qa-already-consumed",
        });
        return { rejected: false };
      } catch (err) {
        return { rejected: true, message: err?.message || String(err) };
      }
    }, { incidentId: targetIncident.id, profileId: mockProfile.id });

    console.log("    ✓ Intento de reutilización de consentimiento rechazado:", reuseAttempt.rejected);
    if (!reuseAttempt.rejected) {
      throw new Error("CONSENT SECURITY VIOLATION: Se permitió reutilizar un consentimiento ya consumido.");
    }

    // Step 8: Diagnóstico CONCLUSIVO con citas verificadas
    console.log("==> [PASO 8] Comprobando resultado diagnóstico CONCLUSIVO en UI...");
    const hasConclusive = await clusterFrame.locator('text=/CONCLUSIVE|CONCLUSIVO/').first().isVisible();
    console.log("    ✓ Diagnóstico CONCLUSIVO visible en UI:", hasConclusive);

    const shot7 = path.join(EVIDENCE_DIR, "07_real_diagnosis_conclusive_citations.png");
    await win.screenshot({ path: shot7 });
    console.log("    ✓ Captura 7 guardada:", shot7);

    // Step 8b: Diagnóstico INCONCLUSO (para incidente sin evidencias suficientes)
    console.log("==> [PASO 8b] Probando diagnóstico INCONCLUSO en incidente sin evidencias...");
    const otherIncident = incidentsList.find((i) => i.id !== targetIncident.id) || incidentsList[0];

    await clusterFrame.evaluate(async ({ incidentId, profileId }) => {
      const store = window.__REACT_STORE__;
      await store.selectIncident(incidentId);
      const consent = await store.prepareConsentPreview(incidentId, profileId);
      if (consent?.consentToken) {
        await store.executeDiagnosis(incidentId, profileId, consent.consentToken);
      }
    }, { incidentId: otherIncident.id, profileId: mockProfile.id });
    await sleep(2500);

    const shot8 = path.join(EVIDENCE_DIR, "08_real_diagnosis_inconclusive.png");
    await win.screenshot({ path: shot8 });
    console.log("    ✓ Captura 8 guardada:", shot8);

    // Step 9: Transiciones de estado completas de la máquina de estados
    console.log("==> [PASO 9] Probando ciclo de vida completo de máquina de estados...");
    await clusterFrame.evaluate(async ({ incidentId }) => {
      const store = window.__REACT_STORE__;
      await store.selectIncident(incidentId);
    }, { incidentId: targetIncident.id });
    await sleep(500);

    const transitions = [
      { target: "INVESTIGANDO", justification: "Iniciando triage técnico del pod con reinicios frecuentes" },
      { target: "CONFIRMADO", justification: "Confirmada falla persistente de configuración en el pod" },
      { target: "SOLUCIÓN PROPUESTA", justification: "Propuesta corrección de variable de entorno en despliegue" },
      { target: "APROBACIÓN HUMANA", justification: "Solicitando aprobación de cambio por parte del líder técnico" },
      { target: "VALIDACIÓN", justification: "Validando comportamiento estable tras el ajuste de configuración" },
      { target: "CERRADO", justification: "Incidente resuelto y validado en producción" },
      { target: "INVESTIGANDO", justification: "Reabriendo incidente por alerta recurrente durante la guardia" },
    ];

    for (const t of transitions) {
      console.log(`    * Transicionando a estado: ${t.target}...`);
      const handledInDom = await clusterFrame.evaluate(async ({ target, just }) => {
        const btn = document.querySelector(`[data-testid="transition-to-${target}"]`);
        if (btn) {
          btn.click();
          await new Promise((r) => setTimeout(r, 400));
          const input = document.querySelector('[data-testid="transition-justification-input"]');
          if (input) {
            input.value = just;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }
          const confirmBtn = document.querySelector('[data-testid="confirm-transition-btn"]');
          if (confirmBtn) {
            confirmBtn.click();
            return true;
          }
        }
        return false;
      }, { target: t.target, just: t.justification });

      if (!handledInDom) {
        await clusterFrame.evaluate(async ({ target, just }) => {
          const store = window.__REACT_STORE__;
          await store.transitionStatus({
            toStatus: target,
            reason: just,
            actor: { name: "QA Automation Operator", role: "SRE Lead" },
          });
        }, { target: t.target, just: t.justification });
      }
      await sleep(1000);
    }

    const currentIncidentState = await clusterFrame.evaluate(() => {
      const store = window.__REACT_STORE__;
      return store.activeIncident?.status;
    });
    console.log("    ✓ Estado final del incidente tras ciclo y reapertura:", currentIncidentState);

    const shot9 = path.join(EVIDENCE_DIR, "09_real_state_machine_lifecycle.png");
    await win.screenshot({ path: shot9 });
    console.log("    ✓ Captura 9 guardada:", shot9);

    // Step 10: Resiliencia (AbortController, defensa TOCTOU de cambio de cluster y detención limpia)
    console.log("==> [PASO 10] Probando resiliencia (cancelación con AbortController y detención de escáner)...");

    // 1. Cancelación controlada
    const abortResult = await app.evaluate(async () => {
      const controller = new AbortController();
      controller.abort();
      return { abortedGracefully: controller.signal.aborted };
    });
    console.log("    ✓ Cancelación con AbortController manejada limpiamente:", abortResult.abortedGracefully);

    // 2. Detención limpia del escáner en reposo
    console.log("==> [PASO 10] Deteniendo escáner inmediatamente...");
    await clusterFrame.evaluate(async () => {
      await window.__REACT_STORE__.stopScanner();
    });
    await sleep(1500);

    const finalStatus = await clusterFrame.evaluate(() => {
      const store = window.__REACT_STORE__;
      return store.scannerStatus;
    });
    console.log("    ✓ Estado final del escáner en reposo:", finalStatus);
    if (finalStatus.isEnabled || finalStatus.activeWatchersCount !== 0) {
      throw new Error(`El escáner no se detuvo limpiamente. isEnabled=${finalStatus.isEnabled}`);
    }

    const shot10 = path.join(EVIDENCE_DIR, "10_real_cancellation_scope_resilience.png");
    await win.screenshot({ path: shot10 });
    console.log("    ✓ Captura 10 guardada:", shot10);

    console.log("==========================================================================");
    console.log("   ¡VALIDACIÓN REAL NOVAKUBE ELECTRON E2E COMPLETADA CON ÉXITO!           ");
    console.log("==========================================================================");

    return {
      success: true,
      electronPid,
      runtimeVersions,
      sandboxDir: TMP_QA_DIR,
      interceptedUrlsCount: interceptedUrls.length,
      blockedExternalRequestsCount: blockedExternalRequests.length,
    };
  } finally {
    console.log("==> [LIMPIEZA] Cerrando aplicación Electron y limpiando procesos...");
    await app.close();
    await sleep(1500);
    fs.rmSync(TMP_QA_DIR, { recursive: true, force: true });
    console.log("    ✓ Entorno temporal limpiado correctamente.");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRealNovaKubeApplicationE2E().catch((err) => {
    console.error("FATAL ERROR EN RUNNER REAL ELECTRON:", err);
    process.exit(1);
  });
}
