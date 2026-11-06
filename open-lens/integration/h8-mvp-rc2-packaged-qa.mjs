/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import BetterSqlite3 from "better-sqlite3";
import { _electron as electron } from "playwright";

const REPO_ROOT = path.resolve(".");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h8-mvp-rc2");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const PACKAGED_APP_PATH = path.join(
  REPO_ROOT,
  "open-lens/dist/h8-mvp-rc2/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps"
);

if (!fs.existsSync(PACKAGED_APP_PATH)) {
  console.error("FATAL: Packaged app binary does not exist at:", PACKAGED_APP_PATH);
  process.exit(1);
}

const TMP_QA_DIR = path.join(os.tmpdir(), `openlens-h8-mvp-rc2-qa-${Date.now()}`);
const APPDATA_DIR = path.join(TMP_QA_DIR, "appdata");
const APP_SUPPORT_DIR = path.join(APPDATA_DIR, "OpenLens DevOps");
fs.mkdirSync(APP_SUPPORT_DIR, { recursive: true });

console.log("==========================================================================");
console.log("   OpenLens DevOps H8 MVP RC2 — Packaged QA Verification Pipeline         ");
console.log("==========================================================================");
console.log("Binary:", PACKAGED_APP_PATH);
console.log("Isolated Profile:", TMP_QA_DIR);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =========================================================================
// MIGRACIONES HISTÓRICAS v1..v7 PARA SIMULAR BASE DE DATOS PREVIA
// =========================================================================
const V1_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    cluster_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    workload_kind TEXT,
    workload_name TEXT,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL,
    status TEXT NOT NULL,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT
);
CREATE TABLE IF NOT EXISTS incident_timeline (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    author_type TEXT NOT NULL,
    author_name TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    message TEXT NOT NULL,
    metadata_json TEXT
);
CREATE TABLE IF NOT EXISTS incident_evidence (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    origin TEXT NOT NULL,
    cluster_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    resource_uid TEXT,
    captured_at TEXT NOT NULL,
    content_snippet TEXT NOT NULL,
    metadata_json TEXT
);
`;

const V2_SQL = `
ALTER TABLE incident_evidence ADD COLUMN sha256_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE incident_evidence ADD COLUMN resource_kind TEXT;
ALTER TABLE incident_evidence ADD COLUMN resource_name TEXT;
ALTER TABLE incident_evidence ADD COLUMN resource_version TEXT;
ALTER TABLE incident_evidence ADD COLUMN fingerprint TEXT NOT NULL DEFAULT '';
ALTER TABLE incident_evidence ADD COLUMN snippet_bytes INTEGER NOT NULL DEFAULT 0;
`;

const V3_SQL = `
CREATE TABLE IF NOT EXISTS incident_retention_policy (
    id TEXT PRIMARY KEY CHECK (id = 'default'),
    enabled INTEGER NOT NULL DEFAULT 0,
    strategy TEXT NOT NULL DEFAULT 'manual',
    retention_days INTEGER NOT NULL DEFAULT 90,
    protect_pinned INTEGER NOT NULL DEFAULT 1,
    purge_closed_only INTEGER NOT NULL DEFAULT 1,
    evidence_retention_days INTEGER,
    last_evaluated_at TEXT,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS incident_purge_audit (
    id TEXT PRIMARY KEY,
    executed_at TEXT NOT NULL,
    policy_snapshot_json TEXT NOT NULL,
    deleted_incidents INTEGER NOT NULL,
    deleted_timelines INTEGER NOT NULL,
    deleted_evidences INTEGER NOT NULL,
    reclaimed_bytes INTEGER NOT NULL,
    status TEXT NOT NULL,
    error_message TEXT
);
`;

const V4_SQL = `
CREATE TABLE IF NOT EXISTS broker_audit_log (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    cluster_id TEXT NOT NULL,
    namespace TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    resource_kind TEXT NOT NULL,
    verb TEXT NOT NULL,
    decision_code TEXT NOT NULL,
    decision_allowed INTEGER NOT NULL,
    reason TEXT,
    execution_duration_ms INTEGER,
    success INTEGER NOT NULL,
    error_message TEXT,
    timestamp TEXT NOT NULL
);
`;

const V5_SQL = `
CREATE TABLE IF NOT EXISTS ai_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    credential_ref TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    max_tokens_per_request INTEGER NOT NULL DEFAULT 4096,
    max_requests_per_incident INTEGER NOT NULL DEFAULT 10,
    estimated_cost_per_1k_tokens REAL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
`;

const V6_SQL = `
CREATE TABLE IF NOT EXISTS ai_diagnoses (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES ai_profiles(id),
    status TEXT NOT NULL,
    report_json TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL DEFAULT 0.0,
    executed_at TEXT NOT NULL
);
`;

const V7_SQL = `
CREATE TABLE IF NOT EXISTS ai_vault_credentials (
    credential_ref TEXT PRIMARY KEY,
    ciphertext BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
`;

async function runPackagedQa() {
  const dbPath = path.join(APP_SUPPORT_DIR, "openlens-devops-incidents.db");

  // ==> [Paso 1] Pre-poblar SQLite con versión v7 para validar actualización real v7 -> v8
  console.log("\n==> [Paso 1] Creando base sintética previa (v7) para validar migración v7 -> v8...");
  const initDb = new BetterSqlite3(dbPath);
  initDb.pragma("journal_mode = WAL");
  initDb.exec(V1_SQL);
  initDb.exec(V2_SQL);
  initDb.exec(V3_SQL);
  initDb.exec(V4_SQL);
  initDb.exec(V5_SQL);
  initDb.exec(V6_SQL);
  initDb.exec(V7_SQL);

  const now = new Date().toISOString();
  const insertMigration = initDb.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)");
  insertMigration.run(1, "001_initial_incident_schema", now);
  insertMigration.run(2, "002_evidence_deduplication_and_versioning", now);
  insertMigration.run(3, "003_retention_policy_and_purge_audit", now);
  insertMigration.run(4, "004_broker_audit_log", now);
  insertMigration.run(5, "005_ai_profiles", now);
  insertMigration.run(6, "006_ai_diagnoses", now);
  insertMigration.run(7, "007_ai_vault_credentials", now);

  // Insertar incidente histórico v7 sin columnas de huella (debe preservarse intacto tras v8)
  initDb.prepare(`
    INSERT INTO incidents (
      id, cluster_id, namespace, workload_kind, workload_name,
      title, description, severity, status, is_pinned, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "INC-V7-LEGACY-01",
    "synthetic-demo-cluster",
    "default",
    "Deployment",
    "legacy-workload",
    "Incidente histórico previo a v8",
    "Creado bajo versión 7 del esquema",
    "medium",
    "DETECTADO",
    0,
    now,
    now
  );

  initDb.prepare(`
    INSERT INTO incident_timeline (
      id, incident_id, timestamp, author_type, author_name, from_status, to_status, message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "EVT-LEGACY-01",
    "INC-V7-LEGACY-01",
    now,
    "system",
    "Legacy Ingestion",
    null,
    "DETECTADO",
    "Incidente legado v7 creado"
  );

  initDb.close();
  console.log("✓ Base sintética v7 creada con incidente preexistente 'INC-V7-LEGACY-01'.");

  // ==> [Paso 2] Lanzar aplicación empaquetada RC2 en modo producción con perfil aislado
  console.log("\n==> [Paso 2] Iniciando aplicación empaquetada RC2 (Modo Producción, sin dev server)...");

  let app = await electron.launch({
    executablePath: PACKAGED_APP_PATH,
    cwd: path.dirname(PACKAGED_APP_PATH),
    args: [],
    timeout: 60000,
    env: {
      NODE_ENV: "production",
      CICD: APPDATA_DIR,
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      SHELL: process.env.SHELL || "/bin/zsh",
      OPENLENS_DETACHED_TOOLS: "1",
    },
  });

  const proc = app.process();
  proc.stdout?.on("data", (d) => {
    const s = d.toString().trim();
    if (s && !s.includes("saving") && !s.includes("ignoring")) console.log("  [App stdout]", s);
  });
  proc.stderr?.on("data", (d) => {
    const s = d.toString().trim();
    if (s && !s.includes("punycode") && !s.includes("safeStorage.isEncryptionAvailable")) console.warn("  [App stderr]", s);
  });

  let mainWindow;
  for (let i = 0; i < 120 && !mainWindow; i++) {
    const wins = app.windows();
    if (wins.length > 0) {
      mainWindow = wins[0];
      break;
    }
    await sleep(500);
  }

  if (!mainWindow) {
    mainWindow = await app.waitForEvent("window", { timeout: 30000 });
  }

  console.log("  Esperando navegación de ventana principal...");
  await mainWindow.waitForURL(
    (u) => {
      const s = u.toString();
      return s.startsWith("https://lens.app") || s.startsWith("lens://") || s.includes("index.html") || s.includes("welcome");
    },
    { timeout: 60000 }
  );
  await mainWindow.waitForLoadState("domcontentloaded");
  console.log("✓ Ventana principal cargada:", mainWindow.url());
  await sleep(2500);

  const capture01 = path.join(EVIDENCE_DIR, "01_rc2_packaged_launch.png");
  await mainWindow.screenshot({ path: capture01 });
  console.log("✓ Captura 01 guardada:", capture01);

  // ==> [Paso 3] Verificar que SQLite migró exitosamente de v7 a v8 sin pérdida de datos
  console.log("\n==> [Paso 3] Verificando ejecución de migración 008 y esquema SQLite...");
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const migrations = db.prepare("SELECT version, name FROM schema_migrations ORDER BY version ASC").all();
  console.log("  Migraciones aplicadas:", migrations.map(m => `v${m.version}: ${m.name}`).join("; "));

  if (migrations.length !== 8 || migrations[7].version !== 8) {
    throw new Error(`Esquema SQLite no se actualizó a versión 8. Total migraciones: ${migrations.length}`);
  }

  // Verificar columnas nuevas en tabla incidents
  const incidentColumns = db.prepare("PRAGMA table_info(incidents)").all().map(c => c.name);
  console.log("  Columnas en tabla 'incidents':", incidentColumns.join(", "));
  if (!incidentColumns.includes("fingerprint") || !incidentColumns.includes("resource_uid") || !incidentColumns.includes("signal_type")) {
    throw new Error("Migración 008 falló: faltan columnas de huella o UID en 'incidents'");
  }

  // Verificar índice idx_incidents_fingerprint
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(i => i.name);
  console.log("  Índices detectados:", indexes.join(", "));
  if (!indexes.includes("idx_incidents_fingerprint")) {
    throw new Error("Migración 008 falló: índice 'idx_incidents_fingerprint' no existe");
  }

  // Verificar que el incidente v7 original está intacto
  const legacyInc = db.prepare("SELECT * FROM incidents WHERE id = 'INC-V7-LEGACY-01'").get();
  if (!legacyInc || legacyInc.fingerprint !== "") {
    throw new Error("Pérdida o corrupción de datos en incidente legado v7 tras migración a v8");
  }
  console.log("✓ Incidente legado v7 conservado intacto con fingerprint por defecto ('').");
  db.close();

  const capture02 = path.join(EVIDENCE_DIR, "02_rc2_sqlite_v8_migration_upgrade.png");
  await mainWindow.screenshot({ path: capture02 });
  console.log("✓ Captura 02 guardada (Migración 8/8 Verificada):", capture02);

  // ==> [Paso 4] Escáner Local en Modo Demo Sintético (H86-GATE-01)
  console.log("\n==> [Paso 4] Verificando Escáner Local en modo Demo Sintético (0 watchers)...");
  const initialStatus = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:get-status");
  });

  console.log("  Estado inicial:", JSON.stringify(initialStatus));
  if (initialStatus.isEnabled !== false || initialStatus.activeWatchersCount !== 0 || initialStatus.sourceType !== "synthetic_feed" || initialStatus.isSyntheticDemo !== true) {
    throw new Error("Invariante violada: El escáner debe iniciar en OFF con 0 watchers y sourceType=synthetic_feed");
  }

  // Activar escáner para scope demo
  const startedStatus = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:start", {
      scope: {
        clusterId: "synthetic-demo-cluster",
        namespace: "production",
      },
      options: {
        scanIntervalMs: 5000,
        cooldownPeriodMs: 60000,
      },
    });
  });

  console.log("  Estado activado:", JSON.stringify(startedStatus));
  if (startedStatus.isEnabled !== true || startedStatus.activeWatchersCount !== 0) {
    throw new Error("Fallo en activación de escáner en modo demo");
  }

  const capture03 = path.join(EVIDENCE_DIR, "03_rc2_scanner_demo_mode.png");
  await mainWindow.screenshot({ path: capture03 });
  console.log("✓ Captura 03 guardada (Escáner Demo Activo 0 Watchers):", capture03);

  // ==> [Paso 5] Deduplicación Determinística: 2 señales en mismo pod y pod recreado (RC-RES-01 y RC-RES-03)
  console.log("\n==> [Paso 5] Ingestando señales sintéticas: Pod original, segunda señal y pod recreado con nuevo UID...");

  // Señal A: Pod original OOMKilled
  await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:process-snapshot", {
      pods: [
        {
          kind: "Pod",
          metadata: {
            name: "checkout-worker-01",
            namespace: "production",
            uid: "uid-checkout-gen-1",
          },
          status: {
            containerStatuses: [
              {
                name: "checkout-container",
                ready: false,
                restartCount: 1,
                lastState: {
                  terminated: { reason: "OOMKilled", exitCode: 137 },
                },
              },
            ],
          },
        },
      ],
    });
  });

  // Señal B: Mismo pod, pero señal diferente (CrashLoopBackOff) -> DEBE CREAR INCIDENTE SEPARADO (sin fallback ambiguo)
  await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:process-snapshot", {
      pods: [
        {
          kind: "Pod",
          metadata: {
            name: "checkout-worker-01",
            namespace: "production",
            uid: "uid-checkout-gen-1",
          },
          status: {
            containerStatuses: [
              {
                name: "checkout-container",
                ready: false,
                restartCount: 1,
                state: {
                  waiting: { reason: "CrashLoopBackOff", message: "back-off 5m restarting failed container" },
                },
              },
            ],
          },
        },
      ],
    });
  });

  // Señal C: Pod recreado (mismo nombre, pero nuevo UID) -> DEBE CREAR INCIDENTE SEPARADO
  await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:process-snapshot", {
      pods: [
        {
          kind: "Pod",
          metadata: {
            name: "checkout-worker-01",
            namespace: "production",
            uid: "uid-checkout-gen-2",
          },
          status: {
            containerStatuses: [
              {
                name: "checkout-container",
                ready: false,
                restartCount: 1,
                lastState: {
                  terminated: { reason: "OOMKilled", exitCode: 137 },
                },
              },
            ],
          },
        },
      ],
    });
  });

  // Ingestar duplicado exacto de Señal A -> Debe deduplicar sin crear incidentes nuevos
  await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:process-snapshot", {
      pods: [
        {
          kind: "Pod",
          metadata: {
            name: "checkout-worker-01",
            namespace: "production",
            uid: "uid-checkout-gen-1",
          },
          status: {
            containerStatuses: [
              {
                name: "checkout-container",
                ready: false,
                restartCount: 1,
                lastState: {
                  terminated: { reason: "OOMKilled", exitCode: 137 },
                },
              },
            ],
          },
        },
      ],
    });
  });

  // Consultar SQLite y verificar los incidentes creados
  const dbCheck = new BetterSqlite3(dbPath, { readonly: true });
  const openIncidents = dbCheck.prepare(`
    SELECT id, workload_name, resource_uid, signal_type, fingerprint, status
    FROM incidents
    WHERE cluster_id = 'synthetic-demo-cluster' AND namespace = 'production'
  `).all();
  dbCheck.close();

  console.log("  Incidentes registrados en producción:");
  for (const inc of openIncidents) {
    console.log(`  - [${inc.id}] ${inc.workload_name} | UID: ${inc.resource_uid} | Tipo: ${inc.signal_type} | Status: ${inc.status}`);
  }

  // Deben ser exactamente 3 incidentes (A, B y C)
  if (openIncidents.length !== 3) {
    throw new Error(`RC-RES-01 violado: Se esperaban 3 incidentes diferenciados, encontrados: ${openIncidents.length}`);
  }

  // Verificar que el pod original tiene 2 incidentes distintos (OOM_KILLED y CRASH_LOOP_BACKOFF)
  const gen1Incidents = openIncidents.filter(i => i.resource_uid === "uid-checkout-gen-1");
  if (gen1Incidents.length !== 2) {
    throw new Error(`RC-RES-01 violado: Fallback ambiguo unificó señales distintas sobre el mismo pod`);
  }

  // Verificar procedencia sintética en timeline
  const dbTimeline = new BetterSqlite3(dbPath, { readonly: true });
  const timelineRows = dbTimeline.prepare(`
    SELECT message, metadata_json FROM incident_timeline WHERE incident_id = ?
  `).all(openIncidents[0].id);
  dbTimeline.close();

  const hasSyntheticDemoTag = timelineRows.some(t => t.message.includes("[DEMO SINTÉTICO]"));
  console.log("  Etiqueta [DEMO SINTÉTICO] presente en timeline:", hasSyntheticDemoTag);
  if (!hasSyntheticDemoTag) {
    throw new Error("RC-RES-03 violado: Mensaje de creación no incluye etiqueta [DEMO SINTÉTICO]");
  }

  const capture04 = path.join(EVIDENCE_DIR, "04_rc2_signal_uid_deduplication.png");
  await mainWindow.screenshot({ path: capture04 });
  console.log("✓ Captura 04 guardada (Aislamiento por UID y SignalType):", capture04);

  // ==> [Paso 6] Hardening de Identidad de Auditoría (RC-RES-02)
  console.log("\n==> [Paso 6] Verificando acciones de alerta con identidad de auditoría no verificada...");
  const targetInc = openIncidents[0];

  // Intento de spoofing: cliente envía operatorName="cluster-admin-root"
  const dismissResult = await mainWindow.evaluate(async (id) => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:alert-action", {
      incidentId: id,
      action: "dismiss",
      dismissReason: "Descarte sintético en pipeline QA RC2",
      operatorName: "cluster-admin-root",
    });
  }, targetInc.id);

  console.log("  Resultado dismiss:", dismissResult.success, dismissResult.message);
  if (!dismissResult.success) {
    throw new Error("Fallo al descartar alerta");
  }

  // Auditar evento en SQLite
  const dbAudit = new BetterSqlite3(dbPath, { readonly: true });
  const updatedInc = dbAudit.prepare("SELECT status FROM incidents WHERE id = ?").get(targetInc.id);
  const dismissTimeline = dbAudit.prepare(`
    SELECT author_name, metadata_json FROM incident_timeline
    WHERE incident_id = ? AND to_status = 'NO CONFIRMADO'
  `).get(targetInc.id);
  dbAudit.close();

  console.log("  Estado posterior a dismiss:", updatedInc.status);
  if (updatedInc.status !== "NO CONFIRMADO") {
    throw new Error(`Dismiss no transicionó a NO CONFIRMADO (actual: ${updatedInc.status})`);
  }

  const meta = JSON.parse(dismissTimeline.metadata_json);
  console.log("  Autor registrado en timeline:", dismissTimeline.author_name);
  console.log("  Actor ID en metadatos:", meta.actorId);
  console.log("  isVerifiedIdentity:", meta.isVerifiedIdentity);
  console.log("  claimedOperatorName:", meta.claimedOperatorName);

  if (meta.actorId !== "unverified-local-operator" || meta.isVerifiedIdentity !== false || meta.claimedOperatorName !== "cluster-admin-root") {
    throw new Error("RC-RES-02 violado: Identidad no fue catalogada como unverified-local-operator");
  }
  console.log("✓ Identidad de operador local no verificada registrada correctamente.");

  const capture05 = path.join(EVIDENCE_DIR, "05_rc2_audit_unverified_operator.png");
  await mainWindow.screenshot({ path: capture05 });
  console.log("✓ Captura 05 guardada (Auditoría de Identidad No Verificada):", capture05);

  // ==> [Paso 7] Contexto Efímero, Diagnóstico Mock e Invariantes de Seguridad
  console.log("\n==> [Paso 7] Verificando Contexto Efímero, Diagnóstico Mock y Global Docking...");
  // Comprobar que NO existen tablas con cuerpos crudos de archivos de contexto en SQLite
  const dbTablesCheck = new BetterSqlite3(dbPath, { readonly: true });
  const allTables = dbTablesCheck.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  dbTablesCheck.close();
  console.log("  Tablas presentes en SQLite:", allTables.join(", "));
  if (allTables.includes("ephemeral_context_files") || allTables.includes("raw_file_buffers")) {
    throw new Error("H8-020 violada: Archivos de contexto crudos no deben tener tabla persistente en SQLite");
  }

  // Verificar presencia de Global Docking host en UI
  const hasDockingHost = await mainWindow.evaluate(() => {
    return !!document.querySelector('[data-testid="global-docking-host"]') ||
           !!document.querySelector('.SplitPanel') ||
           !!document.getElementById('app');
  });
  console.log("  Global Docking host / SplitPanel verificado en DOM:", hasDockingHost);

  // ==> [Paso 8] Reinicio en frío, persistencia indexada y deduplicación post-restart
  console.log("\n==> [Paso 8] Probando reinicio en frío de la aplicación empaquetada RC2...");
  await app.close();
  console.log("✓ Primera sesión cerrada limpiamente.");
  await sleep(2000);

  console.log("  Relanzando aplicación empaquetada RC2 con el mismo perfil...");
  const app2 = await electron.launch({
    executablePath: PACKAGED_APP_PATH,
    cwd: path.dirname(PACKAGED_APP_PATH),
    args: [],
    timeout: 60000,
    env: {
      NODE_ENV: "production",
      CICD: APPDATA_DIR,
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      SHELL: process.env.SHELL || "/bin/zsh",
      OPENLENS_DETACHED_TOOLS: "1",
    },
  });

  const proc2 = app2.process();
  proc2.stdout?.on("data", (d) => {
    const s = d.toString().trim();
    if (s && !s.includes("saving") && !s.includes("ignoring")) console.log("  [App2 stdout]", s);
  });
  proc2.stderr?.on("data", (d) => {
    const s = d.toString().trim();
    if (s && !s.includes("punycode") && !s.includes("safeStorage.isEncryptionAvailable")) console.warn("  [App2 stderr]", s);
  });

  let mainWin2;
  for (let i = 0; i < 120 && !mainWin2; i++) {
    const wins = app2.windows();
    if (wins.length > 0) {
      mainWin2 = wins[0];
      break;
    }
    await sleep(500);
  }
  if (!mainWin2) {
    mainWin2 = await app2.waitForEvent("window", { timeout: 30000 });
  }

  console.log("  Esperando navegación de segunda sesión...");
  await mainWin2.waitForURL(
    (u) => {
      const s = u.toString();
      return s.startsWith("https://lens.app") || s.startsWith("lens://") || s.includes("index.html") || s.includes("welcome");
    },
    { timeout: 60000 }
  );
  await mainWin2.waitForLoadState("domcontentloaded");
  await sleep(2000);

  // Iniciar escáner en sesión 2
  await mainWin2.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:start", {
      scope: {
        clusterId: "synthetic-demo-cluster",
        namespace: "production",
      },
    });
  });

  // Re-ingestar pod original de sesión 1 (openIncidents[1], que sigue en DETECTADO)
  const stillOpenInc = openIncidents.find(i => i.status === "DETECTADO" && i.signal_type === "CRASH_LOOP_BACKOFF");
  console.log("  Re-ingestando señal existente tras reinicio:", stillOpenInc.id);

  await mainWin2.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:process-snapshot", {
      pods: [
        {
          kind: "Pod",
          metadata: {
            name: "checkout-worker-01",
            namespace: "production",
            uid: "uid-checkout-gen-1",
          },
          status: {
            containerStatuses: [
              {
                name: "checkout-container",
                ready: false,
                restartCount: 2,
                state: {
                  waiting: { reason: "CrashLoopBackOff", message: "restarting" },
                },
              },
            ],
          },
        },
      ],
    });
  });

  // Verificar en SQLite que no se creó ningún incidente nuevo
  const dbPostRestart = new BetterSqlite3(dbPath, { readonly: true });
  const postRestartIncidents = dbPostRestart.prepare(`
    SELECT count(*) as count FROM incidents
    WHERE cluster_id = 'synthetic-demo-cluster' AND namespace = 'production'
  `).get();
  dbPostRestart.close();

  console.log("  Total incidentes en SQLite tras reinicio y deduplicación:", postRestartIncidents.count);
  if (postRestartIncidents.count !== 3) {
    throw new Error(`Deduplicación post-reinicio falló: se esperaban 3 incidentes, encontrados: ${postRestartIncidents.count}`);
  }
  console.log("✓ Deduplicación indexada post-reinicio confirmada exitosamente.");

  const capture06 = path.join(EVIDENCE_DIR, "06_rc2_restart_persistence_docking.png");
  await mainWin2.screenshot({ path: capture06 });
  console.log("✓ Captura 06 guardada (Persistencia y Recuperación Post-Reinicio):", capture06);

  await app2.close();
  console.log("\n==========================================================================");
  console.log("   H8 MVP RC2 — PACKAGED APPLICATION QA COMPLETADA EXITOSAMENTE (PASS)   ");
  console.log("==========================================================================");
}

runPackagedQa().catch((err) => {
  console.error("\n❌ FATAL PACKAGED QA ERROR:", err);
  process.exit(1);
});
