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

const TMP_DIR = path.join(os.tmpdir(), `openlens-h8-smoke-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

const RENDERER_BUNDLE_PATH = path.join(TMP_DIR, "renderer-bundle.js");
const MAIN_SCRIPT_PATH = path.join(TMP_DIR, "smoke-main.cjs");
const HTML_PAGE_PATH = path.join(TMP_DIR, "index.html");
const DB_PATH = path.join(TMP_DIR, "incidents.db");

console.log("==> [H8-007 Smoke] Compilando bundle de Renderer con esbuild...");

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

console.log("==> [H8-007 Smoke] Bundle generado exitosamente.");

// Generar HTML con estilos completos Midnight Graphite
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>OpenLens DevOps — Centro de Incidentes (H8-007)</title>
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

    /* Clases de estilos mapeadas desde CSS Modules */
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
    .sectionTitle {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
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
    }
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

// Escribir el script de Electron Main
const MAIN_SCRIPT_CONTENT = `
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { SqliteClient } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/sqlite-client.ts")}");
const { ALL_MIGRATIONS } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/migrations/index.ts")}");
const { IncidentRepository } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/incident-repository.ts")}");
const { EvidenceRepository } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/evidence-repository.ts")}");
const { IncidentPurger } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/incident-purger.ts")}");
const { IncidentConfirmationManager } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-storage/incident-confirmation-manager.ts")}");
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

registerIncidentIpcHandlers(incidentRepo, evidenceRepo, purger, confirmationManager, ipcMain);

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
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

console.log("==> [H8-007 Smoke] Iniciando Electron con Playwright...");

const app = await electron.launch({
  args: ["-r", "ts-node/register/transpile-only", MAIN_SCRIPT_PATH],
});

const window = await app.firstWindow();
window.on("console", msg => console.log("[RENDERER CONSOLE]:", msg.text()));
window.on("pageerror", err => console.error("[RENDERER ERROR]:", err));
await window.setViewportSize({ width: 1280, height: 820 });

console.log("==> [H8-007 Smoke] Ventana abierta. Esperando renderizado...");
await window.waitForSelector('[data-testid="incident-list-view"]', { timeout: 10000 });

// Paso 1: Captura inicial
await window.screenshot({ path: path.join(EVIDENCE_DIR, "01_incident_center_initial.png") });
console.log("==> [H8-007 Smoke] Captura 1 guardada: 01_incident_center_initial.png");

// Paso 2: Crear caso sintético OOMKilled
console.log("==> [H8-007 Smoke] Creando caso sintético OOM...");
await window.click('[data-testid="create-synthetic-btn"]');
await window.waitForSelector('[data-testid^="incident-row-"]', { timeout: 5000 });

await window.screenshot({ path: path.join(EVIDENCE_DIR, "02_synthetic_incident_created.png") });
console.log("==> [H8-007 Smoke] Captura 2 guardada: 02_synthetic_incident_created.png");

// Paso 3: Abrir Workbench y verificar evidencias sanitizadas
console.log("==> [H8-007 Smoke] Abriendo Incident Workbench...");
await window.click('[data-testid^="open-workbench-btn-"]');
await window.waitForSelector('[data-testid="incident-workbench-panel"]', { timeout: 5000 });

// Cambiar a pestaña Evidencias
await window.click('[data-testid="tab-evidence"]');
await window.waitForSelector('[data-testid^="evidence-item-"]', { timeout: 5000 });

// Verificar que la credencial fue sanitizada
const evidenceText = await window.textContent('[data-testid^="evidence-item-"]');
if (evidenceText.includes("my-secret-session-token")) {
  throw new Error("ERROR CRÍTICO: La credencial sensible se filtró en la evidencia visual!");
}
if (!evidenceText.includes("[REDACTED_TOKEN]")) {
  throw new Error("ERROR: No se encontró la etiqueta de redacción [REDACTED_TOKEN]");
}

await window.screenshot({ path: path.join(EVIDENCE_DIR, "03_workbench_evidence_sanitized.png") });
console.log("==> [H8-007 Smoke] Captura 3 guardada: 03_workbench_evidence_sanitized.png");

// Paso 4: Transición de estado a INVESTIGANDO y verificar timeline
console.log("==> [H8-007 Smoke] Ejecutando transición de estado a INVESTIGANDO...");
await window.click('[data-testid="transition-to-INVESTIGANDO"]');
await window.waitForSelector('[data-testid="transition-justification-input"]', { timeout: 5000 });

await window.fill('[data-testid="transition-justification-input"]', "Investigando pico de memoria y consumo de heap en contenedor payment-service");
await window.click('[data-testid="confirm-transition-btn"]');

// Esperar que el modal cierre y cambie el estado en el header
await window.waitForSelector('.workflowBadge:has-text("INVESTIGANDO")', { timeout: 5000 });

// Cambiar a pestaña Timeline
await window.click('[data-testid="tab-timeline"]');
await window.waitForSelector('[data-testid^="timeline-event-"]', { timeout: 5000 });

await window.screenshot({ path: path.join(EVIDENCE_DIR, "04_workbench_state_transition_and_timeline.png") });
console.log("==> [H8-007 Smoke] Captura 4 guardada: 04_workbench_state_transition_and_timeline.png");

// Paso 5: Abrir modal de configuración de retención (H8-009)
console.log("==> [H8-009 Smoke] Abriendo modal de Configuración de Retención...");
await window.click('[data-testid="open-retention-modal-btn"]');
await window.waitForSelector('[data-testid="incident-retention-preference"]', { timeout: 5000 });

await window.screenshot({ path: path.join(EVIDENCE_DIR, "05_retention_preference_initial.png") });
console.log("==> [H8-009 Smoke] Captura 5 guardada: 05_retention_preference_initial.png");

// Paso 6: Configurar política a 30 días con auto-purga y guardar
console.log("==> [H8-009 Smoke] Configurando retención a 30 días...");
await window.click('[data-testid="retention-opt-30"]');
await window.click('[data-testid="enable-purge-toggle"]');
await window.click('[data-testid="save-retention-policy-btn"]');
await window.waitForSelector('[data-testid="save-success-msg"]', { timeout: 5000 });

await window.screenshot({ path: path.join(EVIDENCE_DIR, "06_retention_preference_configured.png") });
console.log("==> [H8-009 Smoke] Captura 6 guardada: 06_retention_preference_configured.png");

await window.click('[data-testid="close-retention-modal-btn"]');

// Paso 7: Avance de estados hacia SOLUCIÓN PROPUESTA y prueba de Confirmación Privilegiada interactiva (H8.1.1)
console.log("==> [H8.1.1 Smoke] Avanzando caso a HIPÓTESIS...");
await window.click('[data-testid="transition-to-HIPÓTESIS"]');
await window.waitForSelector('[data-testid="transition-justification-input"]', { timeout: 5000 });
await window.fill('[data-testid="transition-justification-input"]', "Hipótesis sustentada en límites cgroup y cgroup OOM counter");
await window.click('[data-testid="confirm-transition-btn"]');
await window.waitForSelector('.workflowBadge:has-text("HIPÓTESIS")', { timeout: 5000 });

console.log("==> [H8.1.1 Smoke] Avanzando caso a CONFIRMADO (con evidencia existente)...");
await window.click('[data-testid="transition-to-CONFIRMADO"]');
await window.waitForSelector('[data-testid="transition-justification-input"]', { timeout: 5000 });
await window.fill('[data-testid="transition-justification-input"]', "Confirmado fehacientemente con evidencia de crashlog");
await window.click('input[type="checkbox"]');
await window.click('[data-testid="confirm-transition-btn"]');
await window.waitForSelector('.workflowBadge:has-text("CONFIRMADO")', { timeout: 5000 });

console.log("==> [H8.1.1 Smoke] Avanzando caso a SOLUCIÓN PROPUESTA...");
await window.click('[data-testid="transition-to-SOLUCIÓN PROPUESTA"]');
await window.waitForSelector('[data-testid="transition-justification-input"]', { timeout: 5000 });
await window.fill('[data-testid="transition-justification-input"]', "Aumento de límites de memoria a 2Gi");
await window.click('[data-testid="confirm-transition-btn"]');
await window.waitForSelector('.workflowBadge:has-text("SOLUCIÓN PROPUESTA")', { timeout: 5000 });

// Inyectar título con payload malicioso XSS para verificar inmunidad (SEC-H8-02)
console.log("==> [H8.1.1 Smoke] Inyectando título con payload malicioso XSS...");
const activeId = await window.evaluate(async () => {
  const store = window.__INCIDENT_STORE__;
  const id = store.activeIncidentId;
  const updated = await store.ipc.invoke("openlens:incident:update", id, {
    title: 'CrashLoop <script>window.__xss_title = true;</script><img src=x onerror="window.__xss_img = true">',
  });
  const inc = store.incidents.find(i => i.id === id);
  if (inc) inc.title = updated.title;
  return id;
});

// Paso 7.1: Solicitar APROBACIÓN HUMANA y verificar Cancelación/Rechazo
console.log("==> [H8.1.1 Smoke] Solicitando APROBACIÓN HUMANA (Prueba de Cancelación)...");
const modalPromise1 = app.waitForEvent("window", { timeout: 10000 });
await window.click('[data-testid="transition-to-APROBACIÓN HUMANA"]');
await window.waitForSelector('[data-testid="transition-justification-input"]', { timeout: 5000 });
await window.fill('[data-testid="transition-justification-input"]', 'Justificación con XSS <script>window.__xss_just = true;</script>');
await window.click('[data-testid="confirm-transition-btn"]');

const modalWin1 = await modalPromise1;
await modalWin1.waitForSelector('[data-testid="modal-title"]', { timeout: 5000 });

// Verificar que NO se ejecutó ningún script malicioso (SEC-H8-02)
const xssTitle = await modalWin1.evaluate(() => window.__xss_title);
const xssImg = await modalWin1.evaluate(() => window.__xss_img);
const xssJust = await modalWin1.evaluate(() => window.__xss_just);

if (xssTitle === true || xssImg === true || xssJust === true) {
  throw new Error("ERROR CRÍTICO (SEC-H8-02): Payload XSS ejecutado dentro del modal de confirmación!");
}
console.log("==> [H8.1.1 Smoke] Verificación Anti-XSS superada: 0 payloads ejecutados en DOM aislado.");

// Captura del modal de confirmación aislado
await modalWin1.screenshot({ path: path.join(EVIDENCE_DIR, "07_privileged_confirmation_modal.png") });
console.log("==> [H8.1.1 Smoke] Captura 7 guardada: 07_privileged_confirmation_modal.png");

// Operador presiona Cancelar
console.log("==> [H8.1.1 Smoke] Clic interactivo en Cancelar...");
const closePromise1 = modalWin1.waitForEvent("close", { timeout: 5000 });
await modalWin1.click('[data-testid="modal-cancel-btn"]');
await closePromise1;

// Verificar que SQLite conservó estado SOLUCIÓN PROPUESTA
const checkDb = new BetterSqlite3(DB_PATH);
const incidentAfterCancel = checkDb.prepare("SELECT status FROM incidents WHERE id = ?").get(activeId);
if (incidentAfterCancel.status !== "SOLUCIÓN PROPUESTA") {
  throw new Error(`ERROR: El estado cambió a '${incidentAfterCancel.status}' tras rechazar la confirmación!`);
}
console.log("==> [H8.1.1 Smoke] Verificado: Estado intacto en SQLite tras rechazo/cancelación.");

// Paso 7.2: Solicitar APROBACIÓN HUMANA y realizar Aprobación Real por Clic
console.log("==> [H8.1.1 Smoke] Solicitando APROBACIÓN HUMANA (Prueba de Autorización Real)...");
const modalPromise2 = app.waitForEvent("window", { timeout: 10000 });
await window.click('[data-testid="transition-to-APROBACIÓN HUMANA"]');
await window.waitForSelector('[data-testid="transition-justification-input"]', { timeout: 5000 });
await window.fill('[data-testid="transition-justification-input"]', "Autorización formal y consensuada por el Lead DevOps");
await window.click('[data-testid="confirm-transition-btn"]');

const modalWin2 = await modalPromise2;
await modalWin2.waitForSelector('[data-testid="modal-confirm-btn"]', { timeout: 5000 });

// Clic interactivo real en Autorizar Transición
console.log("==> [H8.1.1 Smoke] Clic interactivo en 'Autorizar Transición'...");
const closePromise2 = modalWin2.waitForEvent("close", { timeout: 5000 });
await modalWin2.click('[data-testid="modal-confirm-btn"]');
await closePromise2;

// Esperar que la ventana principal refleje el nuevo estado en el badge
await window.waitForSelector('.workflowBadge:has-text("APROBACIÓN HUMANA")', { timeout: 5000 });
console.log("==> [H8.1.1 Smoke] Transición confirmada en UI principal: APROBACIÓN HUMANA");

await window.screenshot({ path: path.join(EVIDENCE_DIR, "08_privileged_transition_approved.png") });
console.log("==> [H8.1.1 Smoke] Captura 8 guardada: 08_privileged_transition_approved.png");

// Verificar persistencia en SQLite e invariantes de seguridad (SEC-H8-05)
const incidentAfterApprove = checkDb.prepare("SELECT status FROM incidents WHERE id = ?").get(activeId);
if (incidentAfterApprove.status !== "APROBACIÓN HUMANA") {
  throw new Error(`ERROR: SQLite no registró APROBACIÓN HUMANA (estado: '${incidentAfterApprove.status}')!`);
}

const timelineRow = checkDb.prepare(`
  SELECT * FROM incident_timeline WHERE incident_id = ? AND to_status = 'APROBACIÓN HUMANA'
`).get(activeId);

if (!timelineRow) {
  throw new Error("ERROR: No se encontró evento de timeline para APROBACIÓN HUMANA!");
}

const timelineMetadata = JSON.parse(timelineRow.metadata_json);
if (timelineMetadata.confirmationToken) {
  throw new Error("ERROR CRÍTICO (SEC-H8-05): Token de autorización persistido en el timeline!");
}
if (!timelineMetadata.auditReference || !timelineMetadata.auditReference.startsWith("audit-conf-")) {
  throw new Error("ERROR: Falta auditReference válido en metadata del timeline!");
}
if (timelineMetadata.verifiedVia !== "isolated-modal-interactive-consent") {
  throw new Error(`ERROR: Metadato verifiedVia inesperado: '${timelineMetadata.verifiedVia}'`);
}
console.log("==> [H8.1.1 Smoke] Verificado en SQLite: Timeline registrado sin token efímero y con auditReference.");

checkDb.close();

console.log("==> [H8-007 / H8-009 Smoke] Cerrando aplicación Electron...");
await app.close();

// Limpiar archivos temporales
fs.rmSync(TMP_DIR, { recursive: true, force: true });

console.log("==> [H8-007 Smoke] Smoke test completado con éxito absoluto.");
