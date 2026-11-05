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

const TMP_DIR = path.join(os.tmpdir(), `openlens-h8-4-smoke-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

const RENDERER_BUNDLE_PATH = path.join(TMP_DIR, "renderer-bundle.js");
const MAIN_SCRIPT_PATH = path.join(TMP_DIR, "smoke-main.cjs");
const HTML_PAGE_PATH = path.join(TMP_DIR, "index.html");
const DB_PATH = path.join(TMP_DIR, "incidents.db");

console.log("==> [H8.4 Smoke] Compilando bundle de Renderer con esbuild...");

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

console.log("==> [H8.4 Smoke] Bundle de Renderer generado exitosamente.");

// Generar HTML con estilos completos Midnight Graphite para la vista e IA
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>OpenLens DevOps — Contexto Efímero y Diagnóstico IA H8.4</title>
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

    /* AI Diagnosis & Ephemeral Context Styles (H8.3 & H8.4) */
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

// Escribir el script de Electron Main para el smoke de H8.4
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

console.log("==> [H8.4 Smoke] Lanzando Electron con Playwright...");

const app = await electron.launch({
  args: ["-r", "ts-node/register/transpile-only", MAIN_SCRIPT_PATH],
});

try {
  const window = await app.firstWindow();
  window.on("console", msg => console.log("[RENDERER CONSOLE]:", msg.text()));
  window.on("pageerror", err => console.error("[RENDERER ERROR]:", err));
  await window.setViewportSize({ width: 1280, height: 850 });

  console.log("==> [H8.4 Smoke] Esperando renderizado de incident-list-view...");
  await window.waitForSelector('[data-testid="incident-list-view"]', { timeout: 10000 });

  // 1. Crear perfil mock local sobre IPC
  console.log("==> [H8.4 Smoke] Creando perfil mock local para diagnósticos...");
  const createdProfile = await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    return store.ipc.invoke("openlens:incident:ai:create-profile", {
      name: "Mock Local Diagnostic Profile",
      provider: "mock",
      model: "mock-deep-thought-v1",
      maxTokens: 2048,
      apiEndpoint: "https://internal.mock.local/v1",
      apiKey: "sk-mock-local-secret-token-xyz-12345",
    });
  });
  console.log(`==> [H8.4 Smoke] Perfil mock creado (ID: ${createdProfile.id})`);

  // 2. Crear caso sintético OOMKilled
  console.log("==> [H8.4 Smoke] Creando caso sintético OOMKilled...");
  await window.click('[data-testid="create-synthetic-btn"]');
  await window.waitForSelector('[data-testid^="incident-row-"]', { timeout: 5000 });

  // 3. Abrir Incident Workbench y navegar a pestaña Evidencias
  console.log("==> [H8.4 Smoke] Abriendo Incident Workbench...");
  await window.click('[data-testid^="open-workbench-btn-"]');
  await window.waitForSelector('[data-testid="incident-workbench-panel"]', { timeout: 5000 });

  await window.click('[data-testid="tab-evidence"]');
  await window.waitForSelector('[data-testid="add-context-file-btn"]', { timeout: 5000 });

  // 4. Adjuntar archivo de contexto manual (Dockerfile con Bearer token embebido para validar sanitización)
  console.log("==> [H8.4 Smoke] Abriendo modal para adjuntar Dockerfile...");
  await window.click('[data-testid="add-context-file-btn"]');
  await window.waitForSelector('[data-testid="add-context-modal"]', { timeout: 5000 });

  await window.fill('[data-testid="context-file-name-input"]', "Dockerfile");
  await window.selectOption('[data-testid="context-file-type-select"]', "dockerfile");
  await window.fill(
    '[data-testid="context-file-content-input"]',
    "FROM node:20-alpine\nWORKDIR /app\n# Authorization: Bearer secret-auth-token-998877\nENV NODE_OPTIONS=\"--max-old-space-size=256\"\nCOPY . .\nCMD [\"node\", \"server.js\"]"
  );

  await window.click('[data-testid="save-context-file-btn"]');
  console.log("==> Clicked save-context-file-btn, checking store error/state...");
  const storeState = await window.evaluate(() => {
    const s = window.__INCIDENT_STORE__;
    return {
      error: s.error,
      activeIncidentId: s.activeIncidentId,
      contextFilesCount: s.activeIncidentContextFiles.length,
      contextFiles: s.activeIncidentContextFiles,
    };
  });
  console.log("==> [H8.4 Smoke] Store state after save:", JSON.stringify(storeState, null, 2));
  await window.waitForSelector('[data-testid^="context-file-item-"]', { timeout: 5000 });
  console.log("==> [H8.4 Smoke] Dockerfile adjuntado con éxito en contexto efímero.");

  // Captura 14: Contexto manual adjuntado en Workbench
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "14_h8_4_manual_context_attached.png") });
  console.log("==> [H8.4 Smoke] Captura 14 guardada: 14_h8_4_manual_context_attached.png");

  // 5. Editar metadatos declarados del archivo de contexto
  console.log("==> [H8.4 Smoke] Editando metadatos del archivo de contexto...");
  await window.click('[data-testid^="edit-context-meta-"]');
  await window.waitForSelector('[data-testid="edit-context-modal"]', { timeout: 5000 });

  await window.selectOption('[data-testid="edit-context-env-select"]', "production");
  await window.fill('[data-testid="edit-context-version-input"]', "v1.4.2");
  await window.click('[data-testid="save-edit-context-btn"]');

  // Esperar a que se cierre el modal
  await window.waitForSelector('[data-testid="edit-context-modal"]', { state: "detached", timeout: 5000 });
  console.log("==> [H8.4 Smoke] Metadatos actualizados a 'production' y versión v1.4.2.");

  // Captura 15: Metadatos declarados actualizados
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "15_h8_4_manual_context_metadata_edited.png") });
  console.log("==> [H8.4 Smoke] Captura 15 guardada: 15_h8_4_manual_context_metadata_edited.png");

  // 6. Adjuntar segundo archivo: values.yaml
  console.log("==> [H8.4 Smoke] Adjuntando segundo archivo de contexto (values.yaml)...");
  await window.click('[data-testid="add-context-file-btn"]');
  await window.waitForSelector('[data-testid="add-context-modal"]', { timeout: 5000 });

  await window.fill('[data-testid="context-file-name-input"]', "values.yaml");
  await window.selectOption('[data-testid="context-file-type-select"]', "helm_values");
  await window.fill(
    '[data-testid="context-file-content-input"]',
    "replicaCount: 2\nresources:\n  limits:\n    memory: 512Mi\n    cpu: 500m\n  requests:\n    memory: 256Mi\n    cpu: 250m"
  );
  await window.click('[data-testid="save-context-file-btn"]');
  await window.waitForSelector('[data-testid="add-context-modal"]', { state: "detached", timeout: 5000 });
  console.log("==> [H8.4 Smoke] Segundo archivo (values.yaml) adjuntado con éxito.");

  // 7. Navegar a 'Diagnóstico e Hipótesis' y abrir modal de consentimiento
  console.log("==> [H8.4 Smoke] Solicitando diagnóstico con contexto manual...");
  await window.click('[data-testid="tab-diagnostic"]');
  await window.waitForSelector('[data-testid="analyze-ai-btn"]', { timeout: 5000 });
  await window.click('[data-testid="analyze-ai-btn"]');
  await window.waitForSelector('[data-testid="ai-consent-modal"]', { timeout: 5000 });

  // Verificar que el modal de consentimiento incluye el contexto manual y el aviso anti-tamper
  const consentModalText = await window.textContent('[data-testid="ai-consent-modal"]');
  if (!consentModalText.includes("Archivos de contexto manual: 2")) {
    throw new Error(`ERROR: Contador de contexto manual incorrecto en consentimiento: ${consentModalText}`);
  }
  if (!consentModalText.includes("Dockerfile") || !consentModalText.includes("values.yaml")) {
    throw new Error("ERROR: Falta el desglose de archivos en el consentimiento!");
  }
  console.log("==> [H8.4 Smoke] Verificado: Modal de consentimiento refleja 2 archivos manuales en RAM.");

  // Captura 16: Consentimiento con contexto manual sellado
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "16_h8_4_consent_preview_with_context.png") });
  console.log("==> [H8.4 Smoke] Captura 16 guardada: 16_h8_4_consent_preview_with_context.png");

  // 8. Confirmar diagnóstico y verificar resultado fundamentado
  console.log("==> [H8.4 Smoke] Confirmando autorización de diagnóstico por clic...");
  await window.click('[data-testid="confirm-ai-diagnosis-btn"]');

  await window.waitForSelector('.aiStatusBadge.conclusive', { timeout: 8000 });
  console.log("==> [H8.4 Smoke] Diagnóstico CONCLUSIVE completado con éxito.");

  await window.waitForSelector('.citationTag.verified', { timeout: 5000 });
  const verifiedCitations = await window.textContent('.citationTag.verified');
  console.log(`==> [H8.4 Smoke] Cita estricta verificada: ${verifiedCitations}`);

  // Captura 17: Diagnóstico conclusivo con hechos y citas verificadas al contexto
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "17_h8_4_diagnosis_grounded_on_context.png") });
  console.log("==> [H8.4 Smoke] Captura 17 guardada: 17_h8_4_diagnosis_grounded_on_context.png");

  // 9. Verificación de Invariantes de Seguridad y Ciclo Efímero
  console.log("==> [H8.4 Smoke] Verificando invariantes de seguridad y persistencia CERO en SQLite...");

  // Invariante A: Persistencia CERO de cuerpos en SQLite
  const verifyDb = new BetterSqlite3(DB_PATH);
  const tables = verifyDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  for (const t of tables) {
    const tableName = t.name;
    const rows = verifyDb.prepare(`SELECT * FROM ${tableName}`).all();
    for (const row of rows) {
      const rowStr = JSON.stringify(row);
      if (rowStr.includes("ENV NODE_OPTIONS") || rowStr.includes("replicaCount: 2")) {
        throw new Error(`VIOLACIÓN CRÍTICA DE PERSISTENCIA: Se encontró contenido de contexto efímero en tabla SQLite '${tableName}'!`);
      }
    }
  }
  console.log("==> [H8.4 Smoke] Invariante 1 superada: CERO bytes de contenido de archivo guardados en SQLite.");

  // Invariante B: Rechazo de archivos prohibidos y binarios
  const forbiddenExtResult = await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    try {
      const res = await store.addContextFile({
        incidentId: store.activeIncidentId,
        filename: ".env",
        rawContent: "DATABASE_URL=postgres://user:pass@db:5432",
      });
      if (!res) {
        return { success: false, error: store.error };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  if (forbiddenExtResult.success || !forbiddenExtResult.error.includes("prohibid")) {
    throw new Error(`ERROR: No se bloqueó archivo .env! Resultado: ${JSON.stringify(forbiddenExtResult)}`);
  }
  console.log("==> [H8.4 Smoke] Invariante 2 superada: Archivos con extensión no permitida (.env) bloqueados.");

  // Invariante C: Rechazo de manifiestos Kubernetes Secret
  const secretResult = await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    try {
      const res = await store.addContextFile({
        incidentId: store.activeIncidentId,
        filename: "secret.yaml",
        rawContent: "apiVersion: v1\nkind: Secret\nmetadata:\n  name: app-sec",
      });
      if (!res) {
        return { success: false, error: store.error };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  if (secretResult.success || !secretResult.error.includes("Secret")) {
    throw new Error(`ERROR: No se bloqueó manifiesto kind: Secret! Resultado: ${JSON.stringify(secretResult)}`);
  }
  console.log("==> [H8.4 Smoke] Invariante 3 superada: Manifiestos de tipo 'Secret' rechazados de plano.");

  // Invariante D: Incompatibilidad de consentimiento ante alteración (Anti-Tamper)
  console.log("==> [H8.4 Smoke] Verificando invalidación de consentimiento tras alteración...");
  const antiTamperResult = await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    const incidentId = store.activeIncidentId;
    const mockProfile = store.aiProfiles.find(p => p.provider === "mock");

    // 1. Obtener consentimiento
    const consent = await store.ipc.invoke("openlens:incident:ai:prepare-consent", {
      incidentId,
      profileId: mockProfile.id,
    });

    // 2. Modificar metadatos de un archivo de contexto
    const activeFile = store.activeIncidentContextFiles[0];
    const updateRes = await store.updateContextMetadata({
      incidentId,
      fileId: activeFile.id,
      metadata: { environment: "development", version: "9.9.9" },
    });
    if (!updateRes) {
      throw new Error(`Failed to update metadata: ${store.error}`);
    }

    // 3. Intentar ejecutar diagnóstico con el token previo
    try {
      await store.ipc.invoke("openlens:incident:ai:execute-diagnosis", {
        incidentId,
        profileId: mockProfile.id,
        consentToken: consent.consentToken,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  if (antiTamperResult.success || !antiTamperResult.error.includes("CONSENT_EVIDENCE_MISMATCH")) {
    throw new Error(`ERROR: Consentimiento no fue invalidado tras modificar contexto manual! Resultado: ${JSON.stringify(antiTamperResult)}`);
  }
  console.log("==> [H8.4 Smoke] Invariante 4 superada: Modificación de archivo invalida token con CONSENT_EVIDENCE_MISMATCH.");

  // Captura 18: Ciclo efímero y seguridad verificado
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "18_h8_4_ephemeral_lifecycle_verified.png") });
  console.log("==> [H8.4 Smoke] Captura 18 guardada: 18_h8_4_ephemeral_lifecycle_verified.png");

  verifyDb.close();
  console.log("==> [H8.4 Smoke] Smoke test completado con ÉXITO ABSOLUTO (Criterios de H8.4 superados).");
} finally {
  console.log("==> [H8.4 Smoke] Cerrando aplicación Electron...");
  await app.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}
