/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import esbuild from "esbuild";
import BetterSqlite3 from "better-sqlite3";
import { _electron as electron } from "playwright";

const REPO_ROOT = path.resolve(".");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h8");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const TMP_DIR = path.join(os.tmpdir(), `openlens-h8-4-1-smoke-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

const RENDERER_BUNDLE_PATH = path.join(TMP_DIR, "renderer-bundle.js");
const MAIN_SCRIPT_PATH = path.join(TMP_DIR, "smoke-main.cjs");
const HTML_PAGE_PATH = path.join(TMP_DIR, "index.html");
const DB_PATH = path.join(TMP_DIR, "incidents.db");

console.log("==> [H8.4.1 Smoke] Compilando bundle de Renderer con esbuild...");

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

console.log("==> [H8.4.1 Smoke] Bundle de Renderer generado exitosamente.");

// Generar HTML con estilos completos Midnight Graphite para la vista e IA
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>OpenLens DevOps — Gate H8.4.1 Contexto Efímero</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&family=Material+Icons&display=swap" rel="stylesheet">
  <style>
    :root {
      --mainBackground: #0e131b;
      --surface-raised: #161e2a;
      --border-default: #243142;
      --textColorPrimary: #e2e8f0;
      --text-secondary: #94a3b8;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Roboto', -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      background-color: var(--mainBackground);
      color: var(--textColorPrimary);
      height: 100vh;
      overflow: hidden;
    }
    .material-icons, .Icon .icon {
      font-family: 'Material Icons';
      font-weight: normal;
      font-style: normal;
      display: inline-block;
      vertical-align: middle;
      line-height: 1;
      text-transform: none;
      letter-spacing: normal;
      word-wrap: normal;
      white-space: nowrap;
      direction: ltr;
    }

    /* Incident List View Styles */
    .container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 16px 20px;
      overflow-y: auto;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
    }
    .titleArea {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .titleIcon {
      font-size: 28px !important;
      color: #f59e0b;
    }
    .title {
      font-size: 20px;
      font-weight: 600;
    }
    .actions {
      display: flex;
      gap: 10px;
    }
    .btnPrimary {
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btnSecondary {
      background: rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .statsRow {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .statCard {
      background: var(--surface-raised);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
    }
    .statValue {
      font-size: 24px;
      font-weight: 700;
      color: #f8fafc;
    }
    .statLabel {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    .filterBar {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      background: var(--surface-raised);
      padding: 10px 14px;
      border-radius: 8px;
    }
    .searchBox {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-default);
      border-radius: 6px;
      padding: 6px 12px;
    }
    .searchBox input {
      background: transparent;
      border: none;
      outline: none;
      color: #fff;
      font-size: 13px;
      width: 100%;
    }
    .tableWrapper {
      flex: 1;
      background: var(--surface-raised);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    .table th {
      background: rgba(0, 0, 0, 0.2);
      padding: 12px 16px;
      font-weight: 600;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-default);
    }
    .table td {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .table tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge.high { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .badge.investigating { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .actionBtn {
      background: none;
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #94a3b8;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
    }
    .actionBtn:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
    }

    /* Workbench Panel Styles */
    .workbenchDrawer {
      position: fixed;
      top: 0;
      right: 0;
      width: 620px;
      height: 100vh;
      background: #111827;
      border-left: 1px solid #374151;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 24px rgba(0,0,0,0.5);
      z-index: 100;
    }
    .workbenchHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      border-bottom: 1px solid var(--border-default);
      background: var(--surface-raised);
    }
    .workbenchTitleArea {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .workbenchTitle {
      font-size: 15px;
      font-weight: 600;
    }
    .iconButton {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border-radius: 4px;
    }
    .iconButton:hover {
      background: rgba(255,255,255,0.1);
      color: #cbd5e1;
    }
    .tabsBar {
      display: flex;
      background: rgba(0,0,0,0.2);
      border-bottom: 1px solid var(--border-default);
      padding: 0 16px;
    }
    .tabBtn {
      padding: 10px 14px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .tabBtn.activeTab {
      color: #60a5fa;
      border-bottom-color: #3b82f6;
    }
    .contentArea {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .sectionCard {
      background: var(--surface-raised);
      border: 1px solid var(--border-default);
      border-radius: 6px;
      padding: 14px;
      margin-bottom: 12px;
    }
    .sectionHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .sectionTitle {
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .calloutWarning {
      background: rgba(245, 158, 11, 0.1);
      border-left: 3px solid #f59e0b;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      color: #fbbf24;
      margin-bottom: 10px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    /* AI Diagnosis & Ephemeral Context Styles */
    .aiActionBtn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      background: linear-gradient(135deg, #7c3aed, #4f46e5);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .aiActionBtn:hover {
      opacity: 0.92;
    }
    .aiActionBtn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .aiStatusBadge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .aiStatusBadge.conclusive {
      background: rgba(16, 185, 129, 0.2);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .aiStatusBadge.inconcluso {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }
    .citationTag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      font-size: 11px;
      font-family: monospace;
      border-radius: 4px;
      margin-left: 6px;
    }
    .citationTag.verified {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .citationTag.unverified {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }

    /* Modal dialogs */
    .modalOverlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(4px);
    }
    .modalContent {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      width: 540px;
      max-width: 90vw;
      max-height: 85vh;
      overflow-y: auto;
      padding: 20px;
      color: #e2e8f0;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .modalHeader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .modalTitle { font-size: 16px; font-weight: 600; }
    .formGroup {
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .formGroup label { font-size: 11px; color: var(--text-secondary); }
    .formGroup input, .formGroup select, .formGroup textarea {
      background: rgba(0,0,0,0.3);
      border: 1px solid #2c3848;
      border-radius: 4px;
      padding: 6px 10px;
      color: #fff;
      font-size: 12px;
      outline: none;
    }
    .formGroup textarea { resize: vertical; min-height: 60px; }
    .modalFooter {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="${RENDERER_BUNDLE_PATH}"></script>
</body>
</html>
`;

fs.writeFileSync(HTML_PAGE_PATH, HTML_CONTENT);

// Escribir el script de Electron Main para el smoke de H8.4.1
const MAIN_SCRIPT_CONTENT = `
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
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
const { registerIncidentIpcHandlers } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/setup-incident-ipc.injectable.ts")}");

const dbPath = "${DB_PATH}";
const sqlite = new SqliteClient({
  dbPath,
  migrations: ALL_MIGRATIONS,
});
sqlite.init();

// Incident Core Services
const incidentRepo = new IncidentRepository(sqlite);
const evidenceRepo = new EvidenceRepository(sqlite, incidentRepo);
const purger = new IncidentPurger(sqlite);
const confirmationManager = new IncidentConfirmationManager(incidentRepo);

// AI Diagnostic Persistent Services
const vaultStorage = new SqliteCredentialStorage(sqlite);
const vault = new SecureCredentialVault({
  storage: vaultStorage,
  allowSoftwareFallbackInTests: true,
});
const diagnosisRepo = new AiDiagnosisRepository(sqlite);
const budgetTracker = new AiBudgetTracker(diagnosisRepo);
const profileManager = new AiProfileManager(sqlite, vault, budgetTracker);
const remediationVerifier = new RemediationVerifier(incidentRepo, evidenceRepo, diagnosisRepo);

// H8.4: Ephemeral Context Manager (Zero SQLite persistence, in-RAM lifecycle)
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

console.log("==> [H8.4.1 Smoke] Lanzando Electron con Playwright...");

const app = await electron.launch({
  args: ["-r", "ts-node/register/transpile-only", MAIN_SCRIPT_PATH],
});

try {
  const window = await app.firstWindow();
  window.on("console", msg => console.log("[RENDERER CONSOLE]:", msg.text()));
  window.on("pageerror", err => console.error("[RENDERER ERROR]:", err));
  await window.setViewportSize({ width: 1280, height: 850 });

  console.log("==> [H8.4.1 Smoke] Esperando renderizado de incident-list-view...");
  await window.waitForSelector('[data-testid="incident-list-view"]', { timeout: 10000 });

  // 1. Crear perfil mock local sobre IPC
  console.log("==> [H8.4.1 Smoke] Creando perfil mock local...");
  const createdProfile = await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    return store.ipc.invoke("openlens:incident:ai:create-profile", {
      name: "Mock Local Diagnostic Profile",
      provider: "mock",
      model: "mock-deep-thought-v1",
      maxTokens: 2048,
      apiEndpoint: "https://internal.mock.local/v1",
      apiKey: "sk-FAKE_TEST_ONLY_NOT_A_REAL_KEY_0002",
    });
  });
  console.log(`==> [H8.4.1 Smoke] Perfil mock creado (ID: ${createdProfile.id})`);

  // 2. Crear Incidente A (payment-service) e Incidente B (auth-service)
  console.log("==> [H8.4.1 Smoke] Creando Incidente A (CrashLoopBackOff)...");
  await window.click('[data-testid="create-synthetic-btn"]');
  await window.waitForSelector('[data-testid^="incident-row-"]', { timeout: 5000 });

  const incidentA = await window.evaluate(() => window.__INCIDENT_STORE__.incidents[0]);
  console.log(`==> [H8.4.1 Smoke] Incidente A creado: ID ${incidentA.id} (${incidentA.title})`);

  console.log("==> [H8.4.1 Smoke] Creando Incidente B (OOMKilled en auth)...");
  const incidentB = await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    return store.createIncident({
      title: "OOMKilled in auth-service",
      severity: "high",
      clusterId: "minikube-dev",
      namespace: "auth",
      workloadKind: "Deployment",
      workloadName: "auth-service",
      creator: { type: "human", name: "operator-tester" },
    });
  });
  console.log(`==> [H8.4.1 Smoke] Incidente B creado: ID ${incidentB.id}`);

  // Captura 19: Aislamiento visual con dos incidentes
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "19_h8_4_1_two_incidents_isolation.png") });
  console.log("==> [H8.4.1 Smoke] Captura 19 guardada: 19_h8_4_1_two_incidents_isolation.png");

  // 3. Abrir Incidente A en Workbench y adjuntar Dockerfile con marcador sintético
  console.log("==> [H8.4.1 Smoke] Abriendo Workbench para Incidente A...");
  await window.evaluate(id => window.__INCIDENT_STORE__.selectIncident(id), incidentA.id);
  await window.waitForSelector('[data-testid="incident-workbench-panel"]', { timeout: 5000 });

  await window.click('[data-testid="tab-evidence"]');
  await window.waitForSelector('[data-testid="add-context-file-btn"]', { timeout: 5000 });

  console.log("==> [H8.4.1 Smoke] Adjuntando Dockerfile a Incidente A...");
  await window.click('[data-testid="add-context-file-btn"]');
  await window.waitForSelector('[data-testid="add-context-modal"]', { timeout: 5000 });

  await window.fill('[data-testid="context-file-name-input"]', "Dockerfile");
  await window.selectOption('[data-testid="context-file-type-select"]', "dockerfile");
  await window.fill(
    '[data-testid="context-file-content-input"]',
    "FROM node:20-alpine\n# SYNTHETIC_MARKER_INCIDENT_A_SECRET_KEY\nWORKDIR /app\nCOPY . .\nCMD [\"node\", \"server.js\"]"
  );
  await window.click('[data-testid="save-context-file-btn"]');
  await window.waitForSelector('[data-testid^="context-file-item-"]', { timeout: 5000 });

  // 4. Verificar H84-SEC-01: Huella completa de metadatos e invalidación
  console.log("==> [H8.4.1 Smoke] Verificando invalidación de consentimiento tras editar metadatos (H84-SEC-01)...");
  const consentA = await window.evaluate(async (pId) => {
    const s = window.__INCIDENT_STORE__;
    return s.ipc.invoke("openlens:incident:ai:prepare-consent", {
      incidentId: s.activeIncidentId,
      profileId: pId,
    });
  }, createdProfile.id);

  // Modificar metadatos (namespace / versión)
  await window.click('[data-testid^="edit-context-meta-"]');
  await window.waitForSelector('[data-testid="edit-context-modal"]', { timeout: 5000 });
  await window.fill('[data-testid="edit-context-version-input"]', "v2.0.0-tampered");
  await window.click('[data-testid="save-edit-context-btn"]');
  await window.waitForSelector('[data-testid="edit-context-modal"]', { state: "detached", timeout: 5000 });

  // Intentar ejecutar diagnóstico con el token previo: DEBE FALLAR con CONSENT_EVIDENCE_MISMATCH
  const tamperExecResult = await window.evaluate(async ({ token, pId }) => {
    const s = window.__INCIDENT_STORE__;
    try {
      await s.ipc.invoke("openlens:incident:ai:execute-diagnosis", {
        incidentId: s.activeIncidentId,
        profileId: pId,
        consentToken: token,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, { token: consentA.consentToken, pId: createdProfile.id });

  if (tamperExecResult.success || !tamperExecResult.error.includes("CONSENT_EVIDENCE_MISMATCH")) {
    throw new Error(`ERROR H84-SEC-01: El cambio de metadatos no invalidó el consentimiento! ${JSON.stringify(tamperExecResult)}`);
  }
  console.log("==> [H8.4.1 Smoke] Superado H84-SEC-01: Edición de versión invalidó inmediatamente el consentimiento.");

  // Captura 20: Incompatibilidad anti-tamper confirmada
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "20_h8_4_1_metadata_tamper_invalidated.png") });
  console.log("==> [H8.4.1 Smoke] Captura 20 guardada: 20_h8_4_1_metadata_tamper_invalidated.png");

  // 5. Verificar H84-SEC-05: Aislamiento y comprobación de permisos de IPC
  console.log("==> [H8.4.1 Smoke] Verificando aislamiento de IPC y rechazo cruzado (H84-SEC-05)...");
  const crossIncidentAttempt = await window.evaluate(async ({ incA, incB }) => {
    const s = window.__INCIDENT_STORE__;
    const fileA = s.activeIncidentContextFiles[0];
    try {
      // Intentar actualizar el archivo de A usando el incidentId de B
      await s.ipc.invoke("openlens:incident:context:update-metadata", {
        incidentId: incB.id,
        fileId: fileA.id,
        metadata: { environment: "staging" },
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, { incA: incidentA, incB: incidentB });

  if (crossIncidentAttempt.success || !crossIncidentAttempt.error.includes("does not belong to incident")) {
    throw new Error(`ERROR H84-SEC-05: Se permitió manipulación cruzada de archivo! ${JSON.stringify(crossIncidentAttempt)}`);
  }
  console.log("==> [H8.4.1 Smoke] Superado H84-SEC-05: Manipulación cruzada entre incidentes bloqueada con SecurityError.");

  // 6. Cambiar a Incidente B (H84-SEC-03: Limpieza y cambio de incidente)
  console.log("==> [H8.4.1 Smoke] Cambiando a Incidente B en Workbench...");
  await window.evaluate(id => window.__INCIDENT_STORE__.selectIncident(id), incidentB.id);

  const contextInB = await window.evaluate(() => window.__INCIDENT_STORE__.activeIncidentContextFiles);
  if (contextInB.length > 0) {
    throw new Error(`ERROR: Fuga de archivos de Incidente A a Incidente B: ${JSON.stringify(contextInB)}`);
  }
  console.log("==> [H8.4.1 Smoke] Verificado: Incidente B inicia con lista limpia de contexto.");

  // Adjuntar values.yaml a Incidente B con marcador sintético B
  console.log("==> [H8.4.1 Smoke] Adjuntando values.yaml a Incidente B...");
  await window.evaluate(async (incId) => {
    const s = window.__INCIDENT_STORE__;
    await s.addContextFile({
      incidentId: incId,
      filename: "values.yaml",
      fileType: "helm_values",
      rawContent: "replicaCount: 2\n# SYNTHETIC_MARKER_INCIDENT_B_DATABASE_URL\nresources:\n  limits:\n    memory: 256Mi",
      metadata: { environment: "staging", namespace: "auth" },
    });
  }, incidentB.id);

  // Ejecutar diagnóstico en Incidente B
  console.log("==> [H8.4.1 Smoke] Solicitando consentimiento y ejecutando diagnóstico en Incidente B...");
  await window.click('[data-testid="tab-diagnostic"]');
  await window.waitForSelector('[data-testid="analyze-ai-btn"]', { timeout: 5000 });
  await window.click('[data-testid="analyze-ai-btn"]');
  await window.waitForSelector('[data-testid="ai-consent-modal"]', { timeout: 5000 });
  await window.click('[data-testid="confirm-ai-diagnosis-btn"]');

  await window.waitForSelector('.aiStatusBadge.conclusive', { timeout: 8000 });
  console.log("==> [H8.4.1 Smoke] Diagnóstico en Incidente B completado exitosamente: CONCLUSIVE.");

  // 7. Verificar H84-SEC-02: Purga total de RAM post-ejecución
  console.log("==> [H8.4.1 Smoke] Verificando H84-SEC-02: Purga total y no-reutilización post-ejecución...");
  const postDiagState = await window.evaluate(async ({ incBId, pId }) => {
    const s = window.__INCIDENT_STORE__;
    // Intentar preparar nuevo consentimiento en B: no debe contener contexto utilizable
    const freshConsent = await s.ipc.invoke("openlens:incident:ai:prepare-consent", {
      incidentId: incBId,
      profileId: pId,
    });
    return {
      manualContextCount: freshConsent.manualContextCount,
      filesInStore: s.activeIncidentContextFiles.map(f => ({ id: f.id, isPurged: f.isPurged })),
    };
  }, { incBId: incidentB.id, pId: createdProfile.id });

  console.log("==> [H8.4.1 Smoke] Estado post-diagnóstico:", JSON.stringify(postDiagState, null, 2));
  if (postDiagState.manualContextCount > 0) {
    throw new Error(`ERROR H84-SEC-02: El contexto consumido sigue disponible para inferencias posteriores!`);
  }
  console.log("==> [H8.4.1 Smoke] Superado H84-SEC-02: Contenido purgado de RAM y no reutilizable.");

  // Captura 21: Purga post-diagnóstico confirmada
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "21_h8_4_1_post_diagnosis_purged_ram.png") });
  console.log("==> [H8.4.1 Smoke] Captura 21 guardada: 21_h8_4_1_post_diagnosis_purged_ram.png");

  // 8. Cerrar panel y deseleccionar incidente
  console.log("==> [H8.4.1 Smoke] Cerrando panel de Workbench (selectIncident(null))...");
  await window.evaluate(() => window.__INCIDENT_STORE__.selectIncident(null));

  // 9. Verificar persistencia CERO de marcadores sintéticos en SQLite
  console.log("==> [H8.4.1 Smoke] Escaneando SQLite para comprobar ausencia total de marcadores sintéticos...");
  const verifyDb = new BetterSqlite3(DB_PATH);
  const tables = verifyDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  for (const t of tables) {
    const tableName = t.name;
    const rows = verifyDb.prepare(`SELECT * FROM ${tableName}`).all();
    for (const row of rows) {
      const rowStr = JSON.stringify(row);
      if (
        rowStr.includes("SYNTHETIC_MARKER_INCIDENT_A") ||
        rowStr.includes("SYNTHETIC_MARKER_INCIDENT_B") ||
        rowStr.includes("FROM node:20-alpine")
      ) {
        throw new Error(`VIOLACIÓN CRÍTICA: Se encontró texto de archivo efímero en tabla SQLite '${tableName}'!`);
      }
    }
  }
  console.log("==> [H8.4.1 Smoke] Invariante de almacenamiento superada: CERO persistencia en SQLite de archivos manuales.");

  // Captura 22: Panel cerrado y SQLite verificado limpio
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "22_h8_4_1_panel_close_and_sqlite_clean.png") });
  console.log("==> [H8.4.1 Smoke] Captura 22 guardada: 22_h8_4_1_panel_close_and_sqlite_clean.png");

  verifyDb.close();
  console.log("==> [H8.4.1 Smoke] Smoke test completado con ÉXITO TOTAL (Todos los criterios de H8.4.1 superados).");
} finally {
  console.log("==> [H8.4.1 Smoke] Cerrando aplicación Electron...");
  await app.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}
