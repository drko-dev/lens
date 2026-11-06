/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import esbuild from "esbuild";
import { _electron as electron } from "playwright";

const REPO_ROOT = path.resolve(".");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h8");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const TMP_DIR = path.join(os.tmpdir(), `openlens-h8-5-smoke-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

const RENDERER_BUNDLE_PATH = path.join(TMP_DIR, "renderer-bundle.js");
const MAIN_SCRIPT_PATH = path.join(TMP_DIR, "smoke-main.cjs");
const HTML_PAGE_PATH = path.join(TMP_DIR, "index.html");
const DB_PATH = path.join(TMP_DIR, "incidents.db");

console.log("==> [H8.5 Smoke] Compilando bundle de Renderer con esbuild...");

await esbuild.build({
  stdin: {
    contents: `
      import React from "react";
      import ReactDOM from "react-dom";
      import { createContainer, getInjectable } from "@ogre-tools/injectable";
      import { DiContextProvider, registerInjectableReact } from "@ogre-tools/injectable-react";
      import { loggerInjectionToken } from "@openlens/logger";
      import { NonInjectedIncidentListView } from "./packages/core/src/features/incident-workbench/renderer/incident-list-view";
      import { IncidentStore } from "./packages/core/src/features/incident-workbench/renderer/incident-store";
      import { ipcRenderer } from "electron";

      const di = createContainer("smoke-di");
      registerInjectableReact(di);
      di.register(getInjectable({
        id: "logger",
        instantiate: () => ({
          warn: () => {},
          error: () => {},
          info: () => {},
          debug: () => {},
        }),
        injectionToken: loggerInjectionToken,
      }));
      const store = new IncidentStore(ipcRenderer);

      window.__INCIDENT_STORE__ = store;

      ReactDOM.render(
        <DiContextProvider value={{ di }}>
          <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
            <NonInjectedIncidentListView store={store} />
          </div>
        </DiContextProvider>,
        document.getElementById("root")
      );
    `,
    resolveDir: REPO_ROOT,
    loader: "tsx",
  },
  outfile: RENDERER_BUNDLE_PATH,
  bundle: true,
  format: "cjs",
  platform: "node",
  external: ["electron"],
  loader: { ".svg": "text" },
  plugins: [
    {
      name: "css-stub",
      setup(build) {
        build.onResolve({ filter: /\.s?css$/ }, args => ({ path: args.path, namespace: "css-stub" }));
        build.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({
          contents: "const p = new Proxy({}, { get: (t, prop) => prop }); export default p;",
          loader: "js",
        }));
      },
    },
  ],
});

console.log("==> [H8.5 Smoke] Bundle de Renderer generado exitosamente.");

// Generar HTML con estilos completos Midnight Graphite para la vista e IA
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>OpenLens DevOps — H8.5 Escáner Local & Deduplicación</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&family=Material+Icons&display=swap" rel="stylesheet">
  <style>
    :root {
      --mainBackground: #0e131b;
      --surface-raised: #161e2a;
      --border-default: #243142;
      --border-focus: #3b82f6;
      --textColorPrimary: #e2e8f0;
      --textColorSecondary: #94a3b8;
      --font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    * { box-sizing: border-box; }
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: var(--mainBackground);
      color: var(--textColorPrimary);
      font-family: var(--font-family);
      overflow: hidden;
    }
    #root { width: 100%; height: 100%; }

    /* Estilos inline para componentes con CSS Modules mockeados en esbuild */
    .container {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      padding: 16px 24px;
      overflow-y: auto;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .titleArea { display: flex; align-items: center; gap: 12px; }
    .title { font-size: 20px; font-weight: 600; margin: 0; color: #f8fafc; }
    .actions { display: flex; align-items: center; gap: 8px; }
    .btnPrimary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background-color: #3b82f6;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .btnSecondary {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background-color: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .scannerBar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      margin-bottom: 16px;
      background-color: #161e2a;
      border: 1px solid #243142;
      border-radius: 8px;
      font-size: 13px;
    }
    .scannerBadge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .scannerOff {
      background-color: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
      border: 1px solid #334155;
    }
    .scannerOn {
      background-color: rgba(52, 211, 153, 0.15);
      color: #34d399;
      border: 1px solid rgba(52, 211, 153, 0.4);
    }
    .btnActionSmall {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      background-color: #1e293b;
      color: #cbd5e1;
      border: 1px solid #334155;
    }
    .statsRow {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .statCard {
      background-color: #161e2a;
      border: 1px solid #243142;
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .statValue { font-size: 20px; font-weight: 700; color: #f8fafc; }
    .statLabel { font-size: 11px; color: #94a3b8; }
    .incidentTable {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .incidentTable th, .incidentTable td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid #243142;
    }
    .incidentTable th {
      color: #94a3b8;
      font-weight: 500;
      font-size: 11px;
      text-transform: uppercase;
    }
    .severityBadge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .critical { background-color: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
    .high { background-color: rgba(249, 115, 22, 0.2); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.4); }
    .medium { background-color: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.4); }
    .statusBadge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      background-color: #1e293b;
      color: #60a5fa;
      border: 1px solid #334155;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${RENDERER_BUNDLE_PATH}"></script>
</body>
</html>`;

fs.writeFileSync(HTML_PAGE_PATH, HTML_CONTENT);

// Generar script de proceso Main para Electron con DI real
const MAIN_SCRIPT_CONTENT = `
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

const { SqliteClient } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/sqlite-client.ts")}");
const { ALL_MIGRATIONS } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/migrations/index.ts")}");
const { IncidentRepository } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/incident-repository.ts")}");
const { EvidenceRepository } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/evidence-repository.ts")}");
const { IncidentPurger } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/incident-purger.ts")}");
const { IncidentConfirmationManager } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/incident-confirmation-manager.ts")}");
const { SecureCredentialVault, SqliteCredentialStorage } = require("${path.join(REPO_ROOT, "packages/core/src/main/ai-diagnostics/secure-credential-vault.ts")}");
const { AiProfileManager } = require("${path.join(REPO_ROOT, "packages/core/src/main/ai-diagnostics/ai-profile-manager.ts")}");
const { AiBudgetTracker } = require("${path.join(REPO_ROOT, "packages/core/src/main/ai-diagnostics/ai-budget-tracker.ts")}");
const { AiDiagnosisRepository } = require("${path.join(REPO_ROOT, "packages/core/src/main/ai-diagnostics/ai-diagnosis-repository.ts")}");
const { RemediationVerifier } = require("${path.join(REPO_ROOT, "packages/core/src/main/ai-diagnostics/remediation-verifier.ts")}");
const { EphemeralContextManager } = require("${path.join(REPO_ROOT, "packages/core/src/main/ai-diagnostics/ephemeral-context-manager.ts")}");
const { AiDiagnosisEngine } = require("${path.join(REPO_ROOT, "packages/core/src/main/ai-diagnostics/ai-diagnosis-engine.ts")}");
const { LocalIncidentScanner } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-scanner/local-incident-scanner.ts")}");
const { registerIncidentIpcHandlers } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/setup-incident-ipc.injectable.ts")}");

const dbPath = "${DB_PATH}";
const sqlite = new SqliteClient({
  dbPath,
  migrations: ALL_MIGRATIONS,
});
sqlite.init();

const incidentRepo = new IncidentRepository(sqlite);
const evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
const purger = new IncidentPurger(sqlite);
const confirmationManager = new IncidentConfirmationManager(incidentRepo);

const vaultStorage = new SqliteCredentialStorage(sqlite);
const vault = new SecureCredentialVault({
  storage: vaultStorage,
  allowSoftwareFallbackInTests: true,
});
const diagnosisRepo = new AiDiagnosisRepository(sqlite);
const budgetTracker = new AiBudgetTracker(diagnosisRepo);
const profileManager = new AiProfileManager(sqlite, vault, budgetTracker);
const remediationVerifier = new RemediationVerifier(incidentRepo, evidenceRepo, diagnosisRepo);
const contextManager = new EphemeralContextManager();

const diagnosisEngine = new AiDiagnosisEngine(
  incidentRepo,
  evidenceRepo,
  profileManager,
  diagnosisRepo,
  budgetTracker,
  contextManager,
  {
    consentTtlMs: 5 * 60 * 1000,
    defaultTimeoutMs: 15 * 1000,
  }
);

// H8.5: Local Incident Scanner instance
const scanner = new LocalIncidentScanner(incidentRepo);

// Register Complete IPC Handlers via Main Wiring
registerIncidentIpcHandlers(
  incidentRepo,
  evidenceRepo,
  purger,
  confirmationManager,
  {
    profileManager,
    diagnosisEngine,
    remediationVerifier,
    diagnosisRepo,
    ephemeralContextManager: contextManager,
    scanner,
  },
  ipcMain
);

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 850,
    backgroundColor: "#0e131b",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile("${HTML_PAGE_PATH}");
});
`;

fs.writeFileSync(MAIN_SCRIPT_PATH, MAIN_SCRIPT_CONTENT);

console.log("==> [H8.5 Smoke] Lanzando Electron con Playwright...");

const electronApp = await electron.launch({
  args: ["-r", "ts-node/register/transpile-only", MAIN_SCRIPT_PATH],
});

try {
  const window = await electronApp.firstWindow();
  window.on("console", msg => console.log("[RENDERER CONSOLE]:", msg.text()));
  window.on("pageerror", err => console.error("[RENDERER ERROR]:", err));
  await window.setViewportSize({ width: 1280, height: 850 });
  await window.waitForLoadState("domcontentloaded");

  console.log("==> [H8.5 Smoke] Esperando renderizado del Centro de Incidentes...");
  await window.waitForSelector('[data-testid="local-scanner-bar"]', { timeout: 10000 });

  // 1. Verificar estado inicial: Escáner OFF por defecto (H8-021)
  console.log("==> [H8.5 Smoke] Verificando invariante: Escáner OFF por defecto...");
  const initialBadgeText = await window.textContent('[data-testid="scanner-status-badge"]');
  if (!initialBadgeText.includes("OFF")) {
    throw new Error(`Invariante violada: El escáner debe estar OFF por defecto, pero se detectó '${initialBadgeText}'`);
  }
  console.log("==> [H8.5 Smoke] Invariante superada: Escáner inicializado en estado OFF.");

  // Captura 23: Estado inicial OFF
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "23_h8_5_scanner_initial_off.png") });
  console.log("==> [H8.5 Smoke] Captura 23 guardada: 23_h8_5_scanner_initial_off.png");

  // 2. Activación explícita opt-in del escáner (H8-021)
  console.log("==> [H8.5 Smoke] Activando escáner explícitamente (opt-in)...");
  await window.click('[data-testid="scanner-toggle-btn"]');
  await window.waitForSelector('[data-testid="scanner-status-badge"]', { timeout: 5000 });

  const activeBadgeText = await window.textContent('[data-testid="scanner-status-badge"]');
  if (!activeBadgeText.includes("ACTIVO")) {
    throw new Error(`Error: El escáner debió activarse, pero el badge indica '${activeBadgeText}'`);
  }
  console.log("==> [H8.5 Smoke] Escáner activado exitosamente en estado ACTIVO.");

  // Captura 24: Escáner activado con badge de alcance
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "24_h8_5_scanner_activated_scoped.png") });
  console.log("==> [H8.5 Smoke] Captura 24 guardada: 24_h8_5_scanner_activated_scoped.png");

  // 3. Ingesta de snapshot sintético y detección determinística de anomalías (H8-021 & H8-022)
  console.log("==> [H8.5 Smoke] Procesando snapshot con CrashLoopBackOff y OOMKilled...");
  await window.evaluate(async () => {
    const s = window.__INCIDENT_STORE__;
    await s.processScannerSnapshot({
      pods: [
        {
          kind: "Pod",
          metadata: { name: "payment-api-crash", namespace: "billing", uid: "uid-pod-crash" },
          status: {
            containerStatuses: [
              {
                name: "api",
                ready: false,
                restartCount: 7,
                state: { waiting: { reason: "CrashLoopBackOff", message: "Restarting failed pod" } },
              },
            ],
          },
        },
        {
          kind: "Pod",
          metadata: { name: "auth-worker-oom", namespace: "billing", uid: "uid-pod-oom" },
          status: {
            containerStatuses: [
              {
                name: "worker",
                ready: false,
                restartCount: 2,
                lastState: { terminated: { reason: "OOMKilled", exitCode: 137 } },
              },
            ],
          },
        },
      ],
    });
  });

  // Re-procesar el mismo snapshot para demostrar deduplicación atómica (H8-022)
  console.log("==> [H8.5 Smoke] Re-procesando el mismo snapshot para verificar deduplicación...");
  await window.evaluate(async () => {
    const s = window.__INCIDENT_STORE__;
    await s.processScannerSnapshot({
      pods: [
        {
          kind: "Pod",
          metadata: { name: "payment-api-crash", namespace: "billing", uid: "uid-pod-crash" },
          status: {
            containerStatuses: [
              {
                name: "api",
                ready: false,
                restartCount: 8,
                state: { waiting: { reason: "CrashLoopBackOff" } },
              },
            ],
          },
        },
      ],
    });
  });

  const scannerMetrics = await window.evaluate(() => window.__INCIDENT_STORE__.scannerStatus);
  console.log("==> [H8.5 Smoke] Métricas tras detección y deduplicación:", JSON.stringify(scannerMetrics, null, 2));

  if (scannerMetrics.incidentsCreatedCount < 2 || scannerMetrics.deduplicatedCount < 1) {
    throw new Error("Fallo en deduplicación o creación de incidentes por el escáner local.");
  }
  console.log("==> [H8.5 Smoke] Superado H8-022: Deduplicación atómica verificada (2 creados, >= 1 deduplicado).");

  // Captura 25: Incidentes detectados y métricas deduplicadas
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "25_h8_5_scanner_signals_detected_and_deduplicated.png") });
  console.log("==> [H8.5 Smoke] Captura 25 guardada: 25_h8_5_scanner_signals_detected_and_deduplicated.png");

  // 4. Probar Acciones de Alerta del Operador (Analizar ahora, Posponer, Descartar) (H8-022)
  console.log("==> [H8.5 Smoke] Probando acción 'Posponer' (Snooze)...");
  const incidents = await window.evaluate(() => window.__INCIDENT_STORE__.incidents);
  const crashIncident = incidents.find(i => i.title.includes("CrashLoopBackOff"));
  const oomIncident = incidents.find(i => i.title.includes("OOMKilled"));

  if (!crashIncident || !oomIncident) {
    throw new Error("No se encontraron los incidentes requeridos para probar acciones de alerta.");
  }

  // Ejecutar Posponer en crashIncident
  await window.click(`[data-testid="scanner-snooze-btn-${crashIncident.id}"]`);
  console.log("==> [H8.5 Smoke] Acción Posponer ejecutada en incidente", crashIncident.id);

  // Ejecutar Descartar en oomIncident
  console.log("==> [H8.5 Smoke] Probando acción 'Descartar' (Dismiss)...");
  await window.click(`[data-testid="scanner-dismiss-btn-${oomIncident.id}"]`);
  console.log("==> [H8.5 Smoke] Acción Descartar ejecutada en incidente", oomIncident.id);

  // Verificar que el estado cambió a NO CONFIRMADO
  const dismissedInc = await window.evaluate(
    (id) => window.__INCIDENT_STORE__.incidents.find(i => i.id === id),
    oomIncident.id
  );
  if (dismissedInc.status !== "NO CONFIRMADO") {
    throw new Error(`Error: El incidente descartado debía estar en 'NO CONFIRMADO', pero está en '${dismissedInc.status}'`);
  }
  console.log("==> [H8.5 Smoke] Verificado: Incidente descartado pasó a estado 'NO CONFIRMADO'.");

  // 5. Detención inmediata del escáner (H8-021)
  console.log("==> [H8.5 Smoke] Probando botón 'Detener' inmediato...");
  await window.click('[data-testid="scanner-stop-btn"]');
  await window.waitForTimeout(500);

  const finalStatus = await window.evaluate(() => window.__INCIDENT_STORE__.scannerStatus);
  if (finalStatus.isEnabled || finalStatus.activeWatchersCount !== 0) {
    throw new Error("Error: El escáner debió detenerse inmediatamente con 0 watchers.");
  }
  console.log("==> [H8.5 Smoke] Superado H8-021: Detención inmediata limpia y comprobada (0 watchers activos).");

  // Captura 26: Acciones de alerta aplicadas y escáner detenido
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "26_h8_5_scanner_alert_actions_and_stopped.png") });
  console.log("==> [H8.5 Smoke] Captura 26 guardada: 26_h8_5_scanner_alert_actions_and_stopped.png");

  console.log("==> [H8.5 Smoke] Smoke test completado con ÉXITO TOTAL (Criterios H8-021 y H8-022 superados).");
} finally {
  console.log("==> [H8.5 Smoke] Cerrando aplicación Electron...");
  await electronApp.close();
}
