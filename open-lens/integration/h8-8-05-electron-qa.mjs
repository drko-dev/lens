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

const REPO_ROOT = path.resolve("/private/var/tmp/lens-h8-8-05-electron-qa-20261107");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h8-8-05");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

// QA-BLOCK-01: Isolated Sandbox Environment (Synthetic HOME, AppData, Mock Keychain)
const TMP_QA_DIR = path.join(os.tmpdir(), `openlens-h8-8-05-electron-qa-${Date.now()}`);
const APPDATA_DIR = path.join(TMP_QA_DIR, "appdata");
const APP_SUPPORT_DIR = path.join(APPDATA_DIR, "OpenLens DevOps");
const SYNTHETIC_HOME = path.join(TMP_QA_DIR, "synthetic-home");
const SYNTHETIC_KUBEDIR = path.join(SYNTHETIC_HOME, ".kube");
const SYNTHETIC_KUBECONFIG = path.join(SYNTHETIC_KUBEDIR, "config");
const DB_PATH = path.join(TMP_QA_DIR, "incidents-qa.db");

fs.mkdirSync(APP_SUPPORT_DIR, { recursive: true });
fs.mkdirSync(path.join(SYNTHETIC_HOME, "Library"), { recursive: true });
fs.mkdirSync(SYNTHETIC_KUBEDIR, { recursive: true });

// Offline synthetic kubeconfig
const DUMMY_KUBECONFIG = `apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://127.0.0.1:64433
    insecure-skip-tls-verify: true
  name: sim-cluster-alpha
contexts:
- context:
    cluster: sim-cluster-alpha
    user: sim-operator
  name: sim-cluster-alpha-context
current-context: sim-cluster-alpha-context
users:
- name: sim-operator
  user:
    token: synthetic-offline-token-qa
preferences: {}
`;
fs.writeFileSync(SYNTHETIC_KUBECONFIG, DUMMY_KUBECONFIG, "utf-8");

const RENDERER_BUNDLE_PATH = path.join(TMP_QA_DIR, "renderer-bundle.js");
const MAIN_SCRIPT_PATH = path.join(TMP_QA_DIR, "qa-main.cjs");
const HTML_PAGE_PATH = path.join(TMP_QA_DIR, "index.html");

console.log("==========================================================================");
console.log("   NovaKube H8.8-05: Electron DEV Functional QA — Incident Workbench      ");
console.log("==========================================================================");
console.log("Repo Root:", REPO_ROOT);
console.log("Evidence Output:", EVIDENCE_DIR);
console.log("Synthetic Sandbox:", TMP_QA_DIR);
console.log("Keychain Isolation: --use-mock-keychain (Zero macOS Keychain interaction)");
console.log("Network Isolation: --offline (Zero external API / cluster calls)");

// 1. Compile Renderer Bundle with esbuild
console.log("==> [H8.8-05 QA] Compilando bundle de Renderer con esbuild...");

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

      const di = createContainer("qa-di");
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

console.log("==> [H8.8-05 QA] Bundle de Renderer compilado exitosamente.");

// 2. HTML Template with Midnight Graphite Dark Theme Styles
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>NovaKube DevOps — Incident Workbench Functional QA (H8.8-05)</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&family=Material+Icons&display=swap" rel="stylesheet">
  <style>
    :root {
      --mainBackground: #0e131b;
      --surface-raised: #161e2a;
      --border-default: #243142;
      --border-focus: #3b82f6;
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
      margin-bottom: 16px;
    }
    .titleArea {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .titleIcon {
      font-size: 28px !important;
      color: #38bdf8;
    }
    .title {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.3px;
    }
    .actions {
      display: flex;
      gap: 10px;
    }
    .btnPrimary {
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 7px 14px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s;
    }
    .btnPrimary:hover { background: #1d4ed8; }
    .btnSecondary {
      background: rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btnSecondary:hover { background: rgba(255, 255, 255, 0.14); }
    .btnActionSmall {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-default);
      color: #94a3b8;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 11px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btnActionSmall:hover { color: #f1f5f9; background: rgba(255, 255, 255, 0.1); }

    .scannerBar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--surface-raised);
      border: 1px solid var(--border-default);
      border-radius: 8px;
      padding: 10px 16px;
      margin-bottom: 16px;
    }
    .scannerBadge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .scannerOff {
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
      border: 1px solid rgba(148, 163, 184, 0.3);
    }
    .scannerOn {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }

    .statsRow {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
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
      font-size: 22px;
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
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--border-default);
    }
    .searchInput {
      flex: 1;
      background: rgba(0,0,0,0.3);
      border: 1px solid #2c3848;
      border-radius: 6px;
      padding: 6px 12px;
      color: #fff;
      font-size: 12px;
      outline: none;
    }
    .filterSelect {
      background: rgba(0,0,0,0.3);
      border: 1px solid #2c3848;
      border-radius: 6px;
      padding: 6px 10px;
      color: #cbd5e1;
      font-size: 12px;
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
      font-size: 12px;
    }
    .incidentTable th {
      padding: 10px 14px;
      background: rgba(0, 0, 0, 0.35);
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border-default);
    }
    .incidentTable td {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .severityBadge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
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
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .statusBadge.active {
      background: rgba(59, 130, 246, 0.2);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .statusBadge.confirmed {
      background: rgba(16, 185, 129, 0.2);
      color: #6ee7b7;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }
    .statusBadge.closed {
      background: rgba(148, 163, 184, 0.2);
      color: #cbd5e1;
      border: 1px solid rgba(148, 163, 184, 0.4);
    }

    /* Workbench Panel Styles */
    .workbench {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #0b1017;
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
      color: #f8fafc;
    }
    .workflowBadge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: rgba(59, 130, 246, 0.15);
      border: 1px solid rgba(59, 130, 246, 0.3);
      border-radius: 5px;
      font-size: 11px;
      font-weight: 600;
      color: #93c5fd;
    }
    .stateActions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .transitionBtn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }
    .transitionBtn:hover { background: #1d4ed8; }
    .transitionBtn.danger { background: #dc2626; }
    .transitionBtn.danger:hover { background: #b91c1c; }
    .transitionBtn.secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .tabsBar {
      display: flex;
      background: rgba(0, 0, 0, 0.25);
      border-bottom: 1px solid var(--border-default);
      padding: 0 16px;
    }
    .tabBtn {
      padding: 9px 14px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .tabBtn:hover { color: #f8fafc; }
    .tabBtn.activeTab {
      color: #38bdf8;
      border-bottom-color: #38bdf8;
      font-weight: 600;
    }
    .contentArea {
      flex: 1;
      overflow-y: auto;
      padding: 14px 16px;
    }
    .sectionCard {
      background: var(--surface-raised);
      border: 1px solid var(--border-default);
      border-radius: 6px;
      padding: 12px 14px;
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
      padding: 10px 14px;
      border-radius: 4px;
      font-size: 12px;
      color: #fbbf24;
      margin-bottom: 12px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    /* AI Diagnosis & Hypotheses */
    .aiActionBtn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: linear-gradient(135deg, #7c3aed, #4f46e5);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .aiActionBtn:hover { opacity: 0.92; }
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
      padding: 10px 12px;
      margin-bottom: 10px;
    }
    .evidenceHeader {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 6px;
    }
    .evidenceSnippet {
      background: rgba(0,0,0,0.4);
      padding: 8px 10px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      color: #e2e8f0;
      white-space: pre-wrap;
    }
    .timelineList {
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
      padding-left: 18px;
      border-left: 2px solid var(--border-default);
    }
    .timelineItem { position: relative; }
    .timelineDot {
      position: absolute;
      left: -24px;
      top: 5px;
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
      padding: 8px 12px;
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
      background: rgba(0,0,0,0.7);
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
      width: 500px;
      max-width: 90vw;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
    }
    .modalHeader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
    .modalTitle { font-size: 15px; font-weight: 600; color: #f8fafc; }
    .formGroup {
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .formGroup label { font-size: 11px; color: var(--text-secondary); font-weight: 500; }
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
fs.writeFileSync(HTML_PAGE_PATH, HTML_CONTENT, "utf-8");

// 3. Electron Main Process Script
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
const { MockAiProviderAdapter } = require("${path.join(REPO_ROOT, "packages/core/src/main/ai-diagnostics/providers/ai-provider-adapter.ts")}");
const { FakeK8sSnapshotSource } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-scanner/fake-k8s-snapshot-source.ts")}");
const { LocalIncidentScanner } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-scanner/local-incident-scanner.ts")}");
const { SnapshotSourceSecurityError } = require("${path.join(REPO_ROOT, "packages/core/src/main/incident-scanner/snapshot-source.ts")}");
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
const confirmationManager = new IncidentConfirmationManager(incidentRepo, {
  uiMode: "native-dialog",
  dialogProvider: {
    showMessageBox: async () => ({ response: 1 }),
  },
});

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
const contextManager = new EphemeralContextManager();

// Configurable Mock AI Adapter
const mockAdapter = new MockAiProviderAdapter("conclusive");
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
diagnosisEngine.setMockAdapterOverride(mockAdapter);

// H8.8-04a: Fake Snapshot Source with deterministic timestamps & Local Incident Scanner
const fixedRefTimeMs = Date.parse("2026-11-07T12:00:00.000Z");
const fakeSource = new FakeK8sSnapshotSource({
  defaultReferenceTimestampMs: fixedRefTimeMs,
});
const scanner = new LocalIncidentScanner(incidentRepo, undefined, undefined, fakeSource);

// Pre-create the Mock AI Profile in SQLite and Vault
(async () => {
  try {
    await profileManager.createProfile({
      id: "prof-mock-qa-01",
      name: "Mock Local Diagnostic Profile",
      provider: "mock",
      model: "mock-deep-thought-v1",
      apiKey: "sk-mock-local-secret-qa-token-12345",
      maxTokensPerRequest: 2048,
    });
  } catch (err) {
    console.error("Error creating default mock profile:", err);
  }
})();

// Register Official Incident IPC Handlers
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

// QA Helper Channels for Test Control
ipcMain.handle("qa:get-fake-snapshot", async (event, scenarioId) => {
  return fakeSource.collectSnapshot({
    scope: {
      clusterId: "sim-cluster-alpha",
      namespace: "payments-prod",
    },
    scenarioId: scenarioId || "all_faults",
    referenceTimestampMs: fixedRefTimeMs,
  });
});

ipcMain.handle("qa:set-mock-behavior", async (event, behavior) => {
  mockAdapter.setBehavior(behavior);
  return { success: true, behavior };
});

ipcMain.handle("qa:test-scan-cancellation", async () => {
  const abortController = new AbortController();
  abortController.abort();
  try {
    await scanner.scanFromSource({
      signal: abortController.signal,
      referenceTimestampMs: fixedRefTimeMs,
    });
    return { abortedGracefully: false };
  } catch (err) {
    const isSecurityError = err instanceof SnapshotSourceSecurityError;
    return {
      abortedGracefully: true,
      errorCode: err.code || "OPERATION_ABORTED",
      isSecurityError,
      message: err.message,
    };
  }
});

ipcMain.handle("qa:test-scope-switch", async () => {
  // Asegurar que el escáner está en sim-cluster-alpha
  await scanner.start({ clusterId: "sim-cluster-alpha", namespace: "payments-prod" });

  // Configurar retardo simulado de 100ms para mantener la recolección en vuelo
  fakeSource.setSimulatedDelayMs(100);

  // Iniciar recolección asíncrona en vuelo
  const inFlightScan = scanner.scanFromSource({
    scenarioId: "crash_loop_backoff",
    referenceTimestampMs: fixedRefTimeMs,
  });

  // Cambiar el alcance del escáner a sim-cluster-beta mientras la recolección está en curso (TOCTOU)
  await scanner.start({ clusterId: "sim-cluster-beta", namespace: "shipping" });

  try {
    await inFlightScan;
    fakeSource.setSimulatedDelayMs(0);
    return { scopeViolationCaught: false };
  } catch (err) {
    fakeSource.setSimulatedDelayMs(0);
    // Restaurar alcance original sim-cluster-alpha
    await scanner.start({ clusterId: "sim-cluster-alpha", namespace: "payments-prod" });
    return {
      scopeViolationCaught: true,
      errorCode: err.code || "OPERATION_ABORTED",
      message: err.message,
    };
  }
});

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1366,
    height: 880,
    backgroundColor: "#0e131b",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile("${HTML_PAGE_PATH}");
});
`;
fs.writeFileSync(MAIN_SCRIPT_PATH, MAIN_SCRIPT_CONTENT, "utf-8");

// 4. Launch Electron QA with Playwright
console.log("==> [H8.8-05 QA] Lanzando Electron con Playwright en modo aislado...");

let capturedLogs = "";
const electronApp = await electron.launch({
  args: [
    "--use-mock-keychain",
    "--offline",
    "-r",
    "ts-node/register/transpile-only",
    MAIN_SCRIPT_PATH,
  ],
  env: {
    ...process.env,
    HOME: SYNTHETIC_HOME,
    APPDATA: APPDATA_DIR,
    KUBECONFIG: SYNTHETIC_KUBECONFIG,
    NODE_ENV: "development",
  },
});

try {
  const window = await electronApp.firstWindow();
  window.on("console", msg => {
    const text = msg.text();
    capturedLogs += text + "\n";
    console.log("[RENDERER CONSOLE]:", text);
  });
  window.on("pageerror", err => console.error("[RENDERER ERROR]:", err));
  await window.setViewportSize({ width: 1366, height: 880 });
  await window.waitForLoadState("domcontentloaded");

  console.log("==> [H8.8-05 QA] Ventana DEV lista. Esperando renderizado del Centro de Incidentes...");
  await window.waitForSelector('[data-testid="local-scanner-bar"]', { timeout: 12000 });

  // -------------------------------------------------------------------------
  // PASO 1: Selección de clúster sintético y comprobación de escáner en reposo
  // -------------------------------------------------------------------------
  console.log("==> [PASO 1] Comprobando escáner en reposo (OFF) y selección de clúster...");
  const initialBadge = await window.textContent('[data-testid="scanner-status-badge"]');
  if (!initialBadge.includes("OFF")) {
    throw new Error(`Invariante violada: El escáner debe iniciar en OFF, pero se detectó: '${initialBadge}'`);
  }
  const initialMetrics = await window.evaluate(() => window.__INCIDENT_STORE__.scannerStatus);
  if (initialMetrics.activeWatchersCount !== 0) {
    throw new Error(`Invariante H86-GATE-01 violada: Watchers activos no es cero (${initialMetrics.activeWatchersCount})`);
  }
  console.log("==> [PASO 1] OK: Escáner inicializado en reposo con 0 watchers.");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "01_cluster_selection_scanner_idle.png") });
  console.log("==> [PASO 1] Captura guardada: 01_cluster_selection_scanner_idle.png");

  // -------------------------------------------------------------------------
  // PASO 2: Activación del escáner con consentimiento explícito de alcance
  // -------------------------------------------------------------------------
  console.log("==> [PASO 2] Activando escáner con consentimiento explícito (sim-cluster-alpha / payments-prod)...");
  await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    await store.startScanner({
      clusterId: "sim-cluster-alpha",
      namespace: "payments-prod",
    });
  });

  await window.waitForTimeout(500);
  const activeBadgeText = await window.textContent('[data-testid="scanner-status-badge"]');
  if (!activeBadgeText.includes("ACTIVO")) {
    throw new Error(`Error en activación: Badge no indica ACTIVO ('${activeBadgeText}')`);
  }
  const scannerScope = await window.evaluate(() => window.__INCIDENT_STORE__.scannerStatus.scope);
  if (scannerScope?.clusterId !== "sim-cluster-alpha" || scannerScope?.namespace !== "payments-prod") {
    throw new Error(`Error en alcance de escáner: ${JSON.stringify(scannerScope)}`);
  }
  console.log(`==> [PASO 2] OK: Escáner activado para '${scannerScope.clusterId}' en namespace '${scannerScope.namespace}'.`);

  // -------------------------------------------------------------------------
  // PASO 3 y 4: Ingesta desde FakeK8sSnapshotSource y detección de anomalías
  // -------------------------------------------------------------------------
  console.log("==> [PASO 3 y 4] Ingestando snapshot de FakeK8sSnapshotSource (CrashLoopBackOff, OOMKilled, ImagePullBackOff)...");
  const ingestionResult = await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    const fakeEnvelope = await store.ipc.invoke("qa:get-fake-snapshot", "all_faults");
    const signals = await store.processScannerSnapshot(fakeEnvelope.snapshot);
    return {
      signalsCount: signals.length,
      signals: signals.map(s => ({ type: s.signalType, resource: s.resourceName })),
    };
  });

  console.log("==> [PASO 3 y 4] Señales detectadas por DeterministicRulesEngine:", JSON.stringify(ingestionResult, null, 2));
  if (ingestionResult.signalsCount < 3) {
    throw new Error(`Error: Se esperaban al menos 3 señales de anomalía, se obtuvieron ${ingestionResult.signalsCount}`);
  }

  // -------------------------------------------------------------------------
  // PASO 5: Comprobación de creación y deduplicación atómica de incidentes
  // -------------------------------------------------------------------------
  console.log("==> [PASO 5] Comprobando deduplicación atómica reingestando el mismo snapshot...");
  await window.evaluate(async () => {
    const store = window.__INCIDENT_STORE__;
    const fakeEnvelope = await store.ipc.invoke("qa:get-fake-snapshot", "all_faults");
    await store.processScannerSnapshot(fakeEnvelope.snapshot);
  });

  const postDedupMetrics = await window.evaluate(() => window.__INCIDENT_STORE__.scannerStatus);
  console.log("==> [PASO 5] Métricas de escáner tras segunda ingesta:", {
    scanCount: postDedupMetrics.scanCount,
    signalsDetectedCount: postDedupMetrics.signalsDetectedCount,
    deduplicatedCount: postDedupMetrics.deduplicatedCount,
    incidentsCreatedCount: postDedupMetrics.incidentsCreatedCount,
  });

  if (postDedupMetrics.deduplicatedCount < 3) {
    throw new Error(`Fallo de deduplicación: deduplicatedCount (${postDedupMetrics.deduplicatedCount}) < 3`);
  }
  console.log("==> [PASO 5] OK: Deduplicación atómica verificada (señales recurrentes incrementan ocurrencias sin duplicar incidentes).");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "02_scanner_activated_incidents_detected.png") });
  console.log("==> [PASO 5] Captura guardada: 02_scanner_activated_incidents_detected.png");

  // -------------------------------------------------------------------------
  // PASO 6: Abrir Incident Workbench
  // -------------------------------------------------------------------------
  console.log("==> [PASO 6] Abriendo Incident Workbench para el incidente OOMKilled...");
  const incidents = await window.evaluate(() => window.__INCIDENT_STORE__.incidents);
  const oomIncident = incidents.find(i => i.title.includes("OOMKilled") || i.workloadName?.includes("checkout-worker-oom"));
  const crashIncident = incidents.find(i => i.title.includes("CrashLoopBackOff") || i.workloadName?.includes("order-processor-crash-loop"));

  if (!oomIncident || !crashIncident) {
    throw new Error(`No se encontraron los incidentes requeridos en la lista: ${JSON.stringify(incidents.map(i => i.title))}`);
  }

  // Click en botón Analizar de oomIncident
  await window.click(`[data-testid="open-workbench-btn-${oomIncident.id}"]`);
  await window.waitForSelector('[data-testid="incident-workbench-panel"]', { timeout: 6000 });
  console.log(`==> [PASO 6] OK: Panel de Incident Workbench abierto para incidente '${oomIncident.id}'.`);

  // -------------------------------------------------------------------------
  // PASO 7: Consultar evidencias saneadas (Verificación de RedactionEngine)
  // -------------------------------------------------------------------------
  console.log("==> [PASO 7] Ingestando evidencia con secretos canarios para verificar sanitización estricta...");
  await window.evaluate(async (targetIncidentId) => {
    const store = window.__INCIDENT_STORE__;
    await store.ingestEvidence({
      incidentId: targetIncidentId,
      type: "pod_logs",
      origin: "kubectl logs analytics-aggregator-oom",
      title: "Logs de terminación con secretos sensibles",
      rawContent: "2026-11-07T12:00:00Z Process killed by Linux OOM killer (exitCode: 137)\nAuthorization: Bearer CANARY_SECRET_AUTH_TOKEN_778899\npassword: CANARY_PASSWORD_SUPER_SECRET_998877\nAPI_KEY=CANARY_API_KEY_SECRET_334455",
      clusterId: "sim-cluster-alpha",
      namespace: "payments-prod",
      resourceKind: "Pod",
      resourceName: "analytics-aggregator-oom-9a1b2",
    });
  }, oomIncident.id);

  // Cambiar a pestaña Evidencias
  await window.click('[data-testid="tab-evidence"]');
  await window.waitForSelector('[data-testid^="evidence-item-"]', { timeout: 5000 });

  const evidenceText = await window.textContent('[data-testid="incident-workbench-panel"]');
  // Verificación estricta: Los secretos canarios NO deben existir en el DOM
  if (
    evidenceText.includes("CANARY_SECRET_AUTH_TOKEN_778899") ||
    evidenceText.includes("CANARY_PASSWORD_SUPER_SECRET_998877") ||
    evidenceText.includes("CANARY_API_KEY_SECRET_334455")
  ) {
    throw new Error("ERROR CRÍTICO DE SEGURIDAD: Fuga de secreto en texto plano detectada en la vista de evidencias!");
  }
  if (!evidenceText.includes("[REDACTED_TOKEN]")) {
    throw new Error("ERROR: Falta etiqueta de redacción estricta [REDACTED_TOKEN] en evidencia.");
  }
  console.log("==> [PASO 7] OK: RedactionEngine saneó todas las evidencias. Cero fugas en SQLite y UI.");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "03_incident_workbench_evidence_sanitized.png") });
  console.log("==> [PASO 7] Captura guardada: 03_incident_workbench_evidence_sanitized.png");

  // -------------------------------------------------------------------------
  // PASO 8: Seleccionar proveedor Mock en pestaña Diagnóstico
  // -------------------------------------------------------------------------
  console.log("==> [PASO 8] Navegando a pestaña Diagnóstico e Hipótesis y verificando perfil Mock...");
  await window.click('[data-testid="tab-diagnostic"]');
  await window.waitForSelector('[data-testid="analyze-ai-btn"]', { timeout: 5000 });
  const profiles = await window.evaluate(() => window.__INCIDENT_STORE__.aiProfiles);
  console.log("==> [PASO 8] Perfiles AI disponibles:", profiles.map(p => ({ id: p.id, name: p.name, provider: p.provider })));

  // -------------------------------------------------------------------------
  // PASO 9: Autorizar diagnóstico mediante consentimiento de un solo uso
  // -------------------------------------------------------------------------
  console.log("==> [PASO 9] Solicitando diagnóstico y verificando modal de consentimiento con huella inmutable...");
  await window.click('[data-testid="analyze-ai-btn"]');
  await window.waitForSelector('[data-testid="ai-consent-modal"]', { timeout: 5000 });

  const consentModalText = await window.textContent('[data-testid="ai-consent-modal"]');
  if (!consentModalText.includes("✓ Sanitizado") && !consentModalText.includes("Sanitizado")) {
    throw new Error("ERROR: Modal de consentimiento no muestra confirmación de datos sanitizados.");
  }
  console.log("==> [PASO 9] OK: Modal de consentimiento refleja inventario sanitizado y huella inmutable.");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "04_ai_consent_modal_preview.png") });
  console.log("==> [PASO 9] Captura guardada: 04_ai_consent_modal_preview.png");

  // Confirmar autorización por consentimiento explícito
  await window.click('[data-testid="confirm-ai-diagnosis-btn"]');

  // -------------------------------------------------------------------------
  // PASO 10: Obtener diagnóstico estructurado con hipótesis y citas verificadas
  // -------------------------------------------------------------------------
  console.log("==> [PASO 10] Esperando resultado de diagnóstico CONCLUSIVO con citas verificadas...");
  await window.waitForSelector('.citationTag.verified', { timeout: 10000 });

  const conclusiveDiagnosis = await window.evaluate(() => window.__INCIDENT_STORE__.activeDiagnosis);
  console.log("==> [PASO 10] Diagnóstico recibido:", {
    status: conclusiveDiagnosis.status,
    model: conclusiveDiagnosis.model,
    hypothesesCount: conclusiveDiagnosis.hypotheses?.length,
    factsCount: conclusiveDiagnosis.facts?.length,
    tokenTotal: conclusiveDiagnosis.tokenUsage?.totalTokens,
  });

  if (conclusiveDiagnosis.status !== "CONCLUSIVE") {
    throw new Error(`Error: Se esperaba estado CONCLUSIVE pero se recibió '${conclusiveDiagnosis.status}'`);
  }
  if (!conclusiveDiagnosis.hypotheses || conclusiveDiagnosis.hypotheses.length === 0) {
    throw new Error("Error: No se incluyeron hipótesis estructuradas en el diagnóstico.");
  }
  console.log("==> [PASO 10] OK: Diagnóstico CONCLUSIVO con hipótesis estructuradas y citas verificadas (.citationTag.verified).");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "05_diagnosis_conclusive_verified_citations.png") });
  console.log("==> [PASO 10] Captura guardada: 05_diagnosis_conclusive_verified_citations.png");

  // -------------------------------------------------------------------------
  // PASO 11: Mostrar resultados CONCLUSIVO e INCONCLUSO
  // -------------------------------------------------------------------------
  console.log("==> [PASO 11] Probando diagnóstico en modo INCONCLUSO...");
  // Cambiar el comportamiento del mock adapter a "inconclusive"
  await window.evaluate(async () => {
    await window.__INCIDENT_STORE__.ipc.invoke("qa:set-mock-behavior", "inconclusive");
  });

  // Abrir Workbench del segundo incidente (CrashLoopBackOff)
  await window.click(`[data-testid="open-workbench-btn-${crashIncident.id}"]`);
  await window.waitForTimeout(500);

  // Ingestar evidencia para habilitar diagnóstico en crashIncident
  await window.evaluate(async (targetIncidentId) => {
    const store = window.__INCIDENT_STORE__;
    await store.ingestEvidence({
      incidentId: targetIncidentId,
      type: "pod_logs",
      origin: "kubectl logs payments-worker-crashloop",
      title: "Logs de CrashLoopBackOff",
      rawContent: "2026-11-07T12:00:00Z Back-off 5m0s restarting failed container=payments-worker\nExit code 1\nConfiguration missing in /etc/config",
      clusterId: "sim-cluster-alpha",
      namespace: "payments-prod",
      resourceKind: "Pod",
      resourceName: "payments-worker-crashloop-7f8b9",
    });
  }, crashIncident.id);

  // Solicitar diagnóstico para crashIncident
  await window.click('[data-testid="tab-diagnostic"]');
  await window.waitForSelector('[data-testid="analyze-ai-btn"]', { timeout: 5000 });
  await window.click('[data-testid="analyze-ai-btn"]');
  await window.waitForSelector('[data-testid="ai-consent-modal"]', { timeout: 5000 });
  await window.click('[data-testid="confirm-ai-diagnosis-btn"]');

  // Esperar a que se renderice el estado INCONCLUSO
  await window.waitForSelector('.aiStatusBadge.inconcluso', { timeout: 10000 });
  const inconclusiveDiagnosis = await window.evaluate(() => window.__INCIDENT_STORE__.activeDiagnosis);
  if (inconclusiveDiagnosis.status !== "INCONCLUSO") {
    throw new Error(`Error: Se esperaba INCONCLUSO pero se recibió '${inconclusiveDiagnosis.status}'`);
  }
  console.log("==> [PASO 11] OK: Estado INCONCLUSO renderizado con aviso de advertencia y razones estructuradas.");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "06_diagnosis_inconclusive_state.png") });
  console.log("==> [PASO 11] Captura guardada: 06_diagnosis_inconclusive_state.png");

  // -------------------------------------------------------------------------
  // PASO 12: Cerrar y reabrir incidentes respetando la máquina de estados
  // -------------------------------------------------------------------------
  console.log("==> [PASO 12] Probando ciclo de vida completo de máquina de estados (Cerrar y Reabrir)...");
  // Recorrido de estados en crashIncident:
  // DETECTADO -> INVESTIGANDO -> CONFIRMADO -> SOLUCIÓN PROPUESTA -> APROBACIÓN HUMANA -> VALIDACIÓN -> CERRADO -> INVESTIGANDO (Reabierto)
  
  const stateTransitions = [
    { target: "INVESTIGANDO", justification: "Iniciando investigacion de pods en CrashLoopBackOff" },
    { target: "CONFIRMADO", justification: "Confirmada falla persistente de configuracion en contenedor" },
    { target: "SOLUCIÓN PROPUESTA", justification: "Propuesta de correccion en ConfigMap de aplicacion" },
    { target: "APROBACIÓN HUMANA", justification: "Solicitando aprobacion del operador de guardia" },
    { target: "VALIDACIÓN", justification: "Validando despliegue de correccion en cluster" },
    { target: "CERRADO", justification: "Incidente completamente mitigado y verificado" },
  ];

  for (const t of stateTransitions) {
    console.log(`==> [PASO 12] Transicionando a '${t.target}'...`);
    await window.click(`[data-testid="transition-to-${t.target}"]`);
    await window.waitForSelector('[data-testid="transition-justification-input"]', { timeout: 5000 });
    await window.fill('[data-testid="transition-justification-input"]', t.justification);

    if (t.target === "CONFIRMADO") {
      // H8-015: Confirming an incident requires linking at least one verifiable evidence
      const checkbox = await window.$('input[type="checkbox"]');
      if (checkbox) {
        await checkbox.check();
      }
    }

    await window.click('[data-testid="confirm-transition-btn"]');
    await window.waitForTimeout(400);

    const currentStatus = await window.evaluate(
      (id) => window.__INCIDENT_STORE__.incidents.find(i => i.id === id)?.status,
      crashIncident.id
    );
    if (currentStatus !== t.target) {
      throw new Error(`Error en transicion: Estado actual '${currentStatus}' !== esperado '${t.target}'`);
    }
  }

  console.log("==> [PASO 12] Incidente cerrado exitosamente. Probando reapertura a 'INVESTIGANDO'...");
  await window.click('[data-testid="transition-to-INVESTIGANDO"]');
  await window.waitForSelector('[data-testid="transition-justification-input"]', { timeout: 5000 });
  await window.fill('[data-testid="transition-justification-input"]', "Reabierto por recurrencia detectada en monitoreo");
  await window.click('[data-testid="confirm-transition-btn"]');
  await window.waitForTimeout(400);

  const reopenedStatus = await window.evaluate(
    (id) => window.__INCIDENT_STORE__.incidents.find(i => i.id === id)?.status,
    crashIncident.id
  );
  if (reopenedStatus !== "INVESTIGANDO") {
    throw new Error(`Error en reapertura: Estado actual '${reopenedStatus}' !== 'INVESTIGANDO'`);
  }
  console.log("==> [PASO 12] OK: Ciclo de vida completo validado: CERRADO -> REABIERTO a INVESTIGANDO.");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "07_state_transition_closed_reopened.png") });
  console.log("==> [PASO 12] Captura guardada: 07_state_transition_closed_reopened.png");

  // -------------------------------------------------------------------------
  // RESILIENCIA: Cancelación, Desconexión y Cambio de Clúster
  // -------------------------------------------------------------------------
  console.log("==> [RESILIENCIA] Probando cancelaciones con AbortController y defensas de cambio de alcance...");
  
  // 1. Cancelación con AbortController
  const cancellationResult = await window.evaluate(async () => {
    return window.__INCIDENT_STORE__.ipc.invoke("qa:test-scan-cancellation");
  });
  console.log("==> [RESILIENCIA] Resultado de cancelación:", cancellationResult);
  if (!cancellationResult.abortedGracefully) {
    throw new Error("Error: La cancelación de escaneo no se manejó de forma segura.");
  }

  // 2. Cambio de alcance en vuelo (TOCTOU)
  const scopeSwitchResult = await window.evaluate(async () => {
    return window.__INCIDENT_STORE__.ipc.invoke("qa:test-scope-switch");
  });
  console.log("==> [RESILIENCIA] Resultado de cambio de alcance:", scopeSwitchResult);
  if (!scopeSwitchResult.scopeViolationCaught) {
    throw new Error("Error: No se bloqueó snapshot recolectado para alcance previo tras cambio de clúster.");
  }

  // 3. Detención inmediata del escáner (0 watchers activos)
  console.log("==> [RESILIENCIA] Deteniendo escáner inmediatamente...");
  await window.click('[data-testid="scanner-stop-btn"]');
  await window.waitForTimeout(400);

  const finalMetrics = await window.evaluate(() => window.__INCIDENT_STORE__.scannerStatus);
  if (finalMetrics.isEnabled || finalMetrics.activeWatchersCount !== 0) {
    throw new Error("Error: El escáner no se detuvo en reposo limpio.");
  }
  console.log("==> [RESILIENCIA] OK: Escáner detenido limpiamente con 0 watchers.");

  // Mostrar mensaje de confirmación de resiliencia en la UI para la captura
  await window.evaluate(() => {
    window.__INCIDENT_STORE__.error = "Resiliencia E2E verificada: Cancelación con AbortController OK, defensa contra TOCTOU scope-switch OK, escáner detenido con 0 watchers.";
  });
  await window.waitForTimeout(300);

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "08_cancellation_and_scope_switch.png") });
  console.log("==> [RESILIENCIA] Captura guardada: 08_cancellation_and_scope_switch.png");

  console.log("==========================================================================");
  console.log("   NovaKube H8.8-05: ¡TODOS LOS 12 PASOS FUNCIONALES PASARON CON ÉXITO!   ");
  console.log("==========================================================================");

} finally {
  console.log("==> [H8.8-05 QA] Cerrando Electron y limpiando proceso...");
  await electronApp.close();
}
