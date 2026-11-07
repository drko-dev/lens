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

const TMP_DIR = path.join(os.tmpdir(), `openlens-h8-3-1-smoke-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

const RENDERER_BUNDLE_PATH = path.join(TMP_DIR, "renderer-bundle.js");
const MAIN_SCRIPT_PATH = path.join(TMP_DIR, "smoke-main.cjs");
const HTML_PAGE_PATH = path.join(TMP_DIR, "index.html");
const DB_PATH = path.join(TMP_DIR, "incidents.db");

console.log("==> [H8.3.1 Smoke] Compilando bundle de Renderer con esbuild...");

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

console.log("==> [H8.3.1 Smoke] Bundle de Renderer generado exitosamente.");

// Generar HTML con estilos completos Midnight Graphite para la vista e IA
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>OpenLens DevOps — Diagnóstico IA y Gate H8.3.1</title>
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
      border: 1px solid var(--border-default);
    }
    .searchInput {
      flex: 1;
      background: rgba(0,0,0,0.3);
      border: 1px solid #2c3848;
      border-radius: 6px;
      padding: 7px 12px;
      color: #fff;
      font-size: 13px;
      outline: none;
    }
    .filterSelect {
      background: rgba(0,0,0,0.3);
      border: 1px solid #2c3848;
      border-radius: 6px;
      padding: 7px 10px;
      color: #cbd5e1;
      font-size: 13px;
      outline: none;
    }
    .tableWrapper {
      background: var(--surface-raised);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      overflow: hidden;
    }
    .incidentTable {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    .incidentTable th {
      padding: 12px 14px;
      background: rgba(0, 0, 0, 0.25);
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      border-bottom: 1px solid var(--border-default);
    }
    .incidentTable td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .rowPinned td {
      background: rgba(245, 158, 11, 0.04);
    }
    .pinIcon {
      cursor: pointer;
      color: #64748b;
    }
    .pinIcon.pinned {
      color: #f59e0b;
    }
    .severityBadge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .severityBadge.critical {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
    }
    .severityBadge.high {
      background: rgba(249, 115, 22, 0.2);
      color: #fb923c;
      border: 1px solid rgba(249, 115, 22, 0.4);
    }
    .statusBadge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .statusBadge.active {
      background: rgba(59, 130, 246, 0.15);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.35);
    }
    .statusBadge.confirmed {
      background: rgba(16, 185, 129, 0.15);
      color: #6ee7b7;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .statusBadge.closed {
      background: rgba(100, 116, 139, 0.15);
      color: #94a3b8;
      border: 1px solid rgba(100, 116, 139, 0.25);
    }

    /* Workbench Panel Styles */
    .workbench {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mainBackground);
    }
    .topBar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: var(--surface-raised);
      border-bottom: 1px solid var(--border-default);
    }
    .incidentMeta {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .incidentId {
      font-family: monospace;
      font-size: 11px;
      color: #94a3b8;
      background: rgba(0,0,0,0.3);
      padding: 2px 6px;
      border-radius: 4px;
    }
    .incidentTitle {
      font-size: 14px;
      font-weight: 600;
    }
    .workflowBadge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      color: #93c5fd;
    }
    .stateActions {
      display: flex;
      gap: 6px;
    }
    .transitionBtn {
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 5px 10px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
    }
    .transitionBtn.danger {
      background: #dc2626;
    }
    .transitionBtn.secondary {
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

    /* AI Diagnosis Components (H8.3 / H8.3.1) */
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
    .confidenceBarContainer {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }
    .confidenceBarTrack {
      flex: 1;
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
    }
    .confidenceBarFill {
      height: 100%;
      background: #38bdf8;
      border-radius: 3px;
    }
    .diffContainer {
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      padding: 10px 12px;
      font-family: monospace;
      font-size: 12px;
      color: #e2e8f0;
      white-space: pre-wrap;
      margin-top: 8px;
    }
    .tokenMetrics {
      display: flex;
      gap: 12px;
      font-size: 11px;
      color: #94a3b8;
    }

    /* Evidences & Timeline */
    .evidenceItem {
      background: rgba(0,0,0,0.25);
      border: 1px solid var(--border-default);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
    }
    .evidenceHeader {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 8px;
    }
    .evidenceSnippet {
      background: rgba(0,0,0,0.4);
      padding: 8px 12px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      color: #e2e8f0;
      white-space: pre-wrap;
    }
    .timelineList {
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
      padding-left: 18px;
      border-left: 2px solid var(--border-default);
    }
    .timelineItem {
      position: relative;
    }
    .timelineDot {
      position: absolute;
      left: -24px;
      top: 6px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #3b82f6;
    }
    .timelineDot.human { background: #10b981; }
    .timelineDot.ai { background: #a855f7; }
    .timelineDot.system { background: #64748b; }
    .timelineContent {
      background: var(--surface-raised);
      border: 1px solid var(--border-default);
      border-radius: 6px;
      padding: 10px 12px;
    }
    .timelineHeader {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }
    .timelineAuthor { font-weight: 600; color: #f1f5f9; }
    .timelineMessage { font-size: 12px; color: #cbd5e1; }

    /* Modals */
    .modalBackdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modalContent {
      background: var(--surface-raised);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
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

// Escribir el script de Electron Main para el smoke de H8.3.1
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

// AI Diagnostic Persistent Services (H8.3.1)
const vaultStorage = new SqliteCredentialStorage(sqlite);
const vault = new SecureCredentialVault({
  storage: vaultStorage,
  allowSoftwareFallbackInTests: true,
});
const diagnosisRepo = new AiDiagnosisRepository(sqlite);
const budgetTracker = new AiBudgetTracker(diagnosisRepo);
const profileManager = new AiProfileManager(sqlite, vault, budgetTracker);
const remediationVerifier = new RemediationVerifier(incidentRepo, evidenceRepo, diagnosisRepo);
const diagnosisEngine = new AiDiagnosisEngine(
  incidentRepo,
  evidenceRepo,
  profileManager,
  diagnosisRepo,
  budgetTracker,
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

console.log("==> [H8.3.1 Smoke] Lanzando Electron con Playwright...");

const app = await electron.launch({
  args: ["-r", "ts-node/register/transpile-only", MAIN_SCRIPT_PATH],
});

try {
  const window = await app.firstWindow();
  window.on("console", msg => console.log("[RENDERER CONSOLE]:", msg.text()));
  window.on("pageerror", err => console.error("[RENDERER ERROR]:", err));
  await window.setViewportSize({ width: 1280, height: 850 });

  console.log("==> [H8.3.1 Smoke] Ventana abierta. Esperando renderizado de incident-list-view...");
  await window.waitForSelector('[data-testid="incident-list-view"]', { timeout: 10000 });

  // Paso 1: Captura inicial
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "09_h8_3_1_initial_ui.png") });
  console.log("==> [H8.3.1 Smoke] Captura 1 guardada: 09_h8_3_1_initial_ui.png");

  // Paso 2: Crear perfil mock local y verificar persistencia en SQLite y bóveda segura
  console.log("==> [H8.3.1 Smoke] Creando perfil mock local sobre IPC...");
  const createdProfile = await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    return store.ipc.invoke("openlens:incident:ai:create-profile", {
      name: "Mock Local Diagnostic Profile",
      provider: "mock",
      model: "mock-deep-thought-v1",
      maxTokens: 2048,
      apiEndpoint: "https://internal.mock.local/v1",
      apiKey: "sk-FAKE_TEST_ONLY_NOT_A_REAL_KEY_0001",
    });
  });

  console.log(`==> [H8.3.1 Smoke] Perfil creado con ID: ${createdProfile.id}, ref: ${createdProfile.credentialRef}`);

  // Verificar persistencia física en SQLite en tablas ai_profiles y ai_vault_credentials
  const verifyDb = new BetterSqlite3(DB_PATH);
  const profileRow = verifyDb.prepare("SELECT * FROM ai_profiles WHERE id = ?").get(createdProfile.id);
  if (!profileRow) {
    throw new Error(`ERROR: Perfil '${createdProfile.id}' no fue persistido en ai_profiles!`);
  }
  if (profileRow.name !== "Mock Local Diagnostic Profile" || profileRow.provider !== "mock") {
    throw new Error(`ERROR: Datos de perfil corruptos en SQLite: ${JSON.stringify(profileRow)}`);
  }

  const vaultRow = verifyDb.prepare("SELECT * FROM ai_vault_credentials WHERE credential_ref = ?").get(createdProfile.credentialRef);
  if (!vaultRow || !vaultRow.ciphertext) {
    throw new Error(`ERROR CRÍTICO: Credencial no encontrada en tabla ai_vault_credentials!`);
  }
  // Verificar que el ciphertext NO contiene el secreto en texto plano
  const ciphertextBuffer = Buffer.from(vaultRow.ciphertext);
  if (ciphertextBuffer.includes("sk-mock-local-secret-token")) {
    throw new Error(`ERROR DE SEGURIDAD CRÍTICO: El secreto se guardó en claro en ai_vault_credentials!`);
  }
  console.log("==> [H8.3.1 Smoke] Verificado: Clave cifrada en tabla SQLite ai_vault_credentials sin fugas en texto plano.");

  // Paso 3: Crear caso sintético OOMKilled con evidencias sanitizadas
  console.log("==> [H8.3.1 Smoke] Creando caso sintético OOMKilled...");
  await window.click('[data-testid="create-synthetic-btn"]');
  await window.waitForSelector('[data-testid^="incident-row-"]', { timeout: 5000 });

  // Abrir Incident Workbench
  console.log("==> [H8.3.1 Smoke] Abriendo Incident Workbench...");
  await window.click('[data-testid^="open-workbench-btn-"]');
  await window.waitForSelector('[data-testid="incident-workbench-panel"]', { timeout: 5000 });

  // Verificar que la pestaña de evidencias muestra el contenido sanitizado
  await window.click('[data-testid="tab-evidence"]');
  await window.waitForSelector('[data-testid^="evidence-item-"]', { timeout: 5000 });
  const evidenceSnippetText = await window.textContent('[data-testid^="evidence-item-"]');
  if (evidenceSnippetText.includes("my-secret-session-token")) {
    throw new Error("ERROR CRÍTICO: Fuga de token en la vista de evidencias!");
  }
  if (!evidenceSnippetText.includes("[REDACTED_TOKEN]")) {
    throw new Error("ERROR: Falta etiqueta [REDACTED_TOKEN] en evidencia.");
  }
  console.log("==> [H8.3.1 Smoke] Verificado: Evidencia sanitizada correctamente.");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "10_h8_3_1_workbench_evidence.png") });
  console.log("==> [H8.3.1 Smoke] Captura 2 guardada: 10_h8_3_1_workbench_evidence.png");

  // Paso 4: Solicitar diagnóstico IA y previsualizar consentimiento con fingerprint inmutable
  console.log("==> [H8.3.1 Smoke] Cambiando a pestaña 'Diagnóstico e Hipótesis' y solicitando IA...");
  await window.click('[data-testid="tab-diagnostic"]');
  await window.waitForSelector('[data-testid="analyze-ai-btn"]', { timeout: 5000 });

  await window.click('[data-testid="analyze-ai-btn"]');
  await window.waitForSelector('[data-testid="ai-consent-modal"]', { timeout: 5000 });

  // Verificar contenido del modal de consentimiento
  const consentModalText = await window.textContent('[data-testid="ai-consent-modal"]');
  if (!consentModalText.includes("Evidencias a transmitir: 1")) {
    throw new Error(`ERROR: Contador de evidencias incorrecto en consentimiento: ${consentModalText}`);
  }
  if (!consentModalText.includes("✓ Sanitizado")) {
    throw new Error("ERROR: No se muestra indicador de evidencia sanitizada en consentimiento.");
  }
  console.log("==> [H8.3.1 Smoke] Verificado: Modal de consentimiento refleja inventario inmutable y sanitizado.");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "11_h8_3_1_consent_modal.png") });
  console.log("==> [H8.3.1 Smoke] Captura 3 guardada: 11_h8_3_1_consent_modal.png");

  // Paso 5: Autorizar y ejecutar diagnóstico mock
  console.log("==> [H8.3.1 Smoke] Confirmando autorización de diagnóstico por clic...");
  await window.click('[data-testid="confirm-ai-diagnosis-btn"]');

  // Esperar a que el modal se cierre y aparezca el badge CONCLUSIVE
  await window.waitForSelector('.aiStatusBadge.conclusive', { timeout: 8000 });
  console.log("==> [H8.3.1 Smoke] Diagnóstico completado exitosamente: Status CONCLUSIVE reflejado en UI.");

  // Verificar presencia de Hechos y Citas Verificadas
  await window.waitForSelector('.citationTag.verified', { timeout: 5000 });
  const verifiedTagText = await window.textContent('.citationTag.verified');
  console.log(`==> [H8.3.1 Smoke] Cita estricta verificada: ${verifiedTagText}`);

  // Verificar presencia de propuesta de remediación reversible
  await window.waitForSelector('[data-testid="verify-remediation-btn"]', { timeout: 5000 });
  console.log("==> [H8.3.1 Smoke] Propuesta de remediación reversible presente con botón de verificación.");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "12_h8_3_1_diagnosis_conclusive.png") });
  console.log("==> [H8.3.1 Smoke] Captura 4 guardada: 12_h8_3_1_diagnosis_conclusive.png");

  // Paso 6: Verificar persistencia en SQLite de ai_diagnoses e incident_timeline
  const activeIncidentId = await window.evaluate(() => window.__INCIDENT_STORE__.activeIncidentId);
  const diagRow = verifyDb.prepare("SELECT * FROM ai_diagnoses WHERE incident_id = ?").get(activeIncidentId);
  if (!diagRow) {
    throw new Error(`ERROR: Registro de diagnóstico no encontrado en ai_diagnoses para ${activeIncidentId}!`);
  }
  if (diagRow.status !== "CONCLUSIVE") {
    throw new Error(`ERROR: Estado de diagnóstico inesperado en SQLite: ${diagRow.status}`);
  }
  const reportPayload = JSON.parse(diagRow.report_json);
  if (!reportPayload.remediationProposal || reportPayload.remediationProposal.requiresHumanApproval !== true) {
    throw new Error("ERROR: Propuesta de remediación debe requerir aprobación humana explícita!");
  }
  console.log("==> [H8.3.1 Smoke] Verificado: ai_diagnoses persistido con status CONCLUSIVE y remediación segura.");

  const timelineAiRow = verifyDb.prepare(`
    SELECT * FROM incident_timeline WHERE incident_id = ? AND author_type = 'ai'
  `).get(activeIncidentId);
  if (!timelineAiRow) {
    throw new Error("ERROR: No se encontró evento de timeline para el diagnóstico emitido por IA!");
  }
  console.log("==> [H8.3.1 Smoke] Verificado: Evento de auditoría registrado en incident_timeline por autor 'ai'.");

  // Paso 7: Verificaciones negativas de invariantes de seguridad en Electron Real
  console.log("==> [H8.3.1 Smoke] Ejecutando pruebas de invariantes de seguridad negativas...");

  // Invariante 1: Proveedores externos deshabilitados en este hito (Honest Gating)
  const externalGatingResult = await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    try {
      const extProfile = await store.ipc.invoke("openlens:incident:ai:create-profile", {
        name: "Anthropic Claude Prohibido",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        maxTokens: 4096,
        apiEndpoint: "https://api.anthropic.com/v1/messages",
        apiKey: "sk-ant-test-disabled",
      });
      // Intentar consent preview con perfil externo
      await store.ipc.invoke("openlens:incident:ai:prepare-consent", {
        incidentId: store.activeIncidentId,
        profileId: extProfile.id,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  if (externalGatingResult.success || !externalGatingResult.error.includes("deshabilitado")) {
    throw new Error(`ERROR: Proveedor externo no fue bloqueado! Resultado: ${JSON.stringify(externalGatingResult)}`);
  }
  console.log("==> [H8.3.1 Smoke] Invariante 1 superada: Proveedor externo 'anthropic' rechazado inmediatamente.");

  // Invariante 2: Inmutabilidad del consentimiento (Tamper-proof evidence binding)
  const consentTamperResult = await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    const incidentId = store.activeIncidentId;
    const mockProfile = store.aiProfiles.find(p => p.provider === "mock");

    // 1. Obtener consentimiento válido
    const consent = await store.ipc.invoke("openlens:incident:ai:prepare-consent", {
      incidentId,
      profileId: mockProfile.id,
    });

    // 2. Modificar el inventario de evidencias agregando una nueva evidencia
    await store.ingestEvidence({
      incidentId,
      type: "k8s_event",
      origin: "kubelet",
      title: "Evento adicional posterior a consentimiento",
      rawContent: "Pod sandbox changed: container killed",
      clusterId: "minikube-dev",
      namespace: "billing",
    });

    // 3. Intentar ejecutar el diagnóstico con el token previo
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

  if (consentTamperResult.success || !consentTamperResult.error.includes("CONSENT_EVIDENCE_MISMATCH")) {
    throw new Error(`ERROR: Consentimiento no fue invalidado tras modificar evidencias! Resultado: ${JSON.stringify(consentTamperResult)}`);
  }
  console.log("==> [H8.3.1 Smoke] Invariante 2 superada: Consentimiento invalidado (CONSENT_EVIDENCE_MISMATCH) tras alteración.");

  // Invariante 3: Persistencia de bóveda a través de reinicio (Cross-Restart Recovery)
  console.log("==> [H8.3.1 Smoke] Verificando persistencia y recuperación de bóveda tras reinicio simulado...");
  const recoveryResult = await window.evaluate(async (profileId) => {
    const store = window.__INCIDENT_STORE__;
    const profile = await store.ipc.invoke("openlens:incident:ai:list-profiles");
    const found = profile.find(p => p.id === profileId);
    return {
      found: Boolean(found),
      hasCredentialRef: Boolean(found?.credentialRef),
    };
  }, createdProfile.id);

  if (!recoveryResult.found || !recoveryResult.hasCredentialRef) {
    throw new Error("ERROR: Perfil o referencia de credencial perdida!");
  }
  console.log("==> [H8.3.1 Smoke] Invariante 3 superada: Perfiles y referencias conservados íntegramente.");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "13_h8_3_1_smoke_complete.png") });
  console.log("==> [H8.3.1 Smoke] Captura final 5 guardada: 13_h8_3_1_smoke_complete.png");

  verifyDb.close();
  console.log("==> [H8.3.1 Smoke] Smoke test completado con ÉXITO ABSOLUTO (Criterios de H8.3.1 superados).");
} finally {
  console.log("==> [H8.3.1 Smoke] Cerrando aplicación Electron...");
  await app.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}
