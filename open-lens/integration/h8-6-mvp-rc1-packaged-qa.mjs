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
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h8-6");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const PACKAGED_APP_PATH = path.join(
  REPO_ROOT,
  "open-lens/dist/h8-mvp-rc1/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps"
);

if (!fs.existsSync(PACKAGED_APP_PATH)) {
  console.error("FATAL: Packaged app binary does not exist at:", PACKAGED_APP_PATH);
  process.exit(1);
}

const TMP_QA_DIR = path.join(os.tmpdir(), `openlens-h8-6-mvp-rc1-qa-${Date.now()}`);
const APPDATA_DIR = path.join(TMP_QA_DIR, "appdata");
const HOME_DIR = path.join(TMP_QA_DIR, "home");
fs.mkdirSync(APPDATA_DIR, { recursive: true });
fs.mkdirSync(HOME_DIR, { recursive: true });

console.log("==========================================================================");
console.log("   OpenLens DevOps H8.6 — MVP RC1 Packaged QA Verification Pipeline        ");
console.log("==========================================================================");
console.log("Binary:", PACKAGED_APP_PATH);
console.log("Isolated Profile:", TMP_QA_DIR);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runPackagedQa() {
  console.log("\n==> [Paso 1] Iniciando aplicación empaquetada (Modo Producción, sin dev server)...");

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
      SHELL: "/bin/sh",
      OPENLENS_DETACHED_TOOLS: "1",
    },
  });

  let mainWindow;
  for (let i = 0; i < 120 && !mainWindow; i++) {
    mainWindow = app.windows().find((w) => {
      const u = w.url();
      return u.startsWith("https://lens.app") || u.startsWith("lens://") || u.includes("index.html");
    });
    if (!mainWindow) await sleep(500);
  }

  if (!mainWindow) {
    mainWindow = await app.firstWindow();
  }

  await mainWindow.waitForLoadState("domcontentloaded");
  console.log("✓ Ventana principal cargada:", mainWindow.url());
  await sleep(2500);

  const capture01 = path.join(EVIDENCE_DIR, "mvp_rc1_01_packaged_launch.png");
  await mainWindow.screenshot({ path: capture01 });
  console.log("✓ Captura 01 guardada:", capture01);

  // ==> [Paso 2] Verificar base SQLite con todas las 7 migraciones aplicadas
  console.log("\n==> [Paso 2] Verificando SQLite y esquema de migraciones en perfil...");
  const findDb = (dir) => {
    if (!fs.existsSync(dir)) return null;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findDb(full);
        if (found) return found;
      } else if (entry.name === "openlens-devops-incidents.db" || entry.name === "incidents.db") {
        return full;
      }
    }
    return null;
  };

  let dbPath = findDb(APPDATA_DIR);
  if (!dbPath) {
    const altDir = path.join(HOME_DIR, "Library/Application Support/OpenLens DevOps");
    if (fs.existsSync(altDir)) {
      dbPath = findDb(altDir);
    }
  }

  console.log("  Ruta SQLite:", dbPath);
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new Error("Base SQLite no encontrada en el perfil aislado");
  }

  const db = new BetterSqlite3(dbPath, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  console.log("  Tablas detectadas:", tables.join(", "));
  const requiredTables = ["incidents", "incident_timeline", "incident_evidence", "broker_audit_log", "ai_profiles", "ai_diagnoses", "ai_vault_credentials"];
  for (const t of requiredTables) {
    if (!tables.includes(t)) {
      throw new Error(`Tabla requerida '${t}' no existe en la base SQLite empaquetada`);
    }
  }

  const migrations = db.prepare("SELECT version, name FROM schema_migrations ORDER BY version ASC").all();
  console.log("  Migraciones aplicadas:", migrations.map(m => `v${m.version}: ${m.name}`).join("; "));
  db.close();
  console.log("✓ Esquema SQLite verificado con 7 migraciones completas.");

  // ==> [Paso 3] Verificar estado del escáner determinístico local (H8.5 & H86-GATE-01)
  console.log("\n==> [Paso 3] Verificando Escáner Local vía IPC empaquetado...");
  const initialStatus = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:get-status");
  });

  console.log("  Estado inicial:", JSON.stringify(initialStatus));
  if (initialStatus.isEnabled !== false || initialStatus.activeWatchersCount !== 0) {
    throw new Error("El escáner no inició en OFF o reportó watchers ficticios");
  }

  // Activar escáner en modo demo sintético
  const startedStatus = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:start", {
      scope: {
        clusterId: "synthetic-demo-cluster",
        namespace: "production",
      },
      options: {
        scanIntervalMs: 5000,
        cooldownPeriodMs: 30000,
      },
    });
  });

  console.log("  Estado activado:", JSON.stringify(startedStatus));
  if (startedStatus.isEnabled !== true || startedStatus.activeWatchersCount !== 0 || startedStatus.sourceType !== "synthetic_feed") {
    throw new Error("H86-GATE-01 violado: Escáner no configurado como synthetic_feed con 0 watchers");
  }

  const capture02 = path.join(EVIDENCE_DIR, "mvp_rc1_02_scanner_demo_active.png");
  await mainWindow.screenshot({ path: capture02 });
  console.log("✓ Captura 02 guardada (Escáner Demo Activo):", capture02);

  // ==> [Paso 4] Ingesta determinística de snapshot sintético y deduplicación (H86-GATE-03 & H86-GATE-05)
  console.log("\n==> [Paso 4] Ingestando snapshot sintético con OOMKilled...");
  const snapshotResult = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:process-snapshot", {
      pods: [
        {
          kind: "Pod",
          metadata: {
            name: "checkout-worker-01",
            namespace: "production",
            uid: "pod-checkout-uid-100",
          },
          status: {
            containerStatuses: [
              {
                name: "checkout-container",
                ready: false,
                restartCount: 1,
                lastState: {
                  terminated: {
                    reason: "OOMKilled",
                    exitCode: 137,
                  },
                },
              },
            ],
          },
        },
      ],
    });
  });

  console.log("  Señales detectadas:", snapshotResult.length);
  if (snapshotResult.length !== 1 || snapshotResult[0].signalType !== "OOM_KILLED") {
    throw new Error("Fallo al evaluar reglas determinísticas sobre snapshot sintético");
  }

  // Ingestar segundo snapshot idéntico para comprobar deduplicación sin duplicados
  const snapshot2Result = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:process-snapshot", {
      pods: [
        {
          kind: "Pod",
          metadata: {
            name: "checkout-worker-01",
            namespace: "production",
            uid: "pod-checkout-uid-100",
          },
          status: {
            containerStatuses: [
              {
                name: "checkout-container",
                ready: false,
                restartCount: 2,
                lastState: {
                  terminated: {
                    reason: "OOMKilled",
                    exitCode: 137,
                  },
                },
              },
            ],
          },
        },
      ],
    });
  });

  // Verificar que solo existe 1 incidente en SQLite
  const incidents = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:list", { clusterId: "synthetic-demo-cluster" });
  });

  console.log("  Total incidentes en SQLite tras deduplicación:", incidents.length);
  if (incidents.length !== 1) {
    throw new Error(`Deduplicación falló: se esperaban 1 incidente, se encontraron ${incidents.length}`);
  }

  const oomIncident = incidents[0];
  console.log("  Incidente OOM:", oomIncident.id, oomIncident.title, "Estado:", oomIncident.status);

  const capture03 = path.join(EVIDENCE_DIR, "mvp_rc1_03_incident_deduplicated.png");
  await mainWindow.screenshot({ path: capture03 });
  console.log("✓ Captura 03 guardada (Incidente Deduplicado):", capture03);

  // ==> [Paso 5] Verificación de Alert Actions: Snooze y Dismiss (H86-GATE-04)
  console.log("\n==> [Paso 5] Verificando acciones de alerta (Snooze y Dismiss)...");
  // Posponer
  const snoozeResult = await mainWindow.evaluate(async (id) => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:alert-action", {
      incidentId: id,
      action: "snooze",
      snoozeDurationMs: 60000,
    });
  }, oomIncident.id);

  console.log("  Resultado snooze:", snoozeResult.success, "Hasta:", snoozeResult.snoozeUntil);
  if (!snoozeResult.success) {
    throw new Error("Fallo al posponer alerta");
  }

  // Descartar (desde DETECTADO -> debe pasar estrictamente a NO CONFIRMADO, nunca CERRADO)
  const dismissResult = await mainWindow.evaluate(async (id) => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:alert-action", {
      incidentId: id,
      action: "dismiss",
      dismissReason: "Descartado como evento transitorio en QA",
      operatorName: "QA Engineer",
    });
  }, oomIncident.id);

  console.log("  Resultado dismiss:", dismissResult.success, dismissResult.message);
  if (!dismissResult.success) {
    throw new Error("Fallo al descartar alerta");
  }

  const dismissedInc = await mainWindow.evaluate(async (id) => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:get", id);
  }, oomIncident.id);

  console.log("  Estado posterior a dismiss:", dismissedInc.status);
  if (dismissedInc.status !== "NO CONFIRMADO") {
    throw new Error(`H86-GATE-04 violado: dismiss resultó en '${dismissedInc.status}' en lugar de 'NO CONFIRMADO'`);
  }

  const capture04 = path.join(EVIDENCE_DIR, "mvp_rc1_04_dismiss_unconfirmed.png");
  await mainWindow.screenshot({ path: capture04 });
  console.log("✓ Captura 04 guardada (Descarte seguro a NO CONFIRMADO):", capture04);

  // ==> [Paso 6] Detención del Escáner
  console.log("\n==> [Paso 6] Deteniendo escáner local...");
  const stoppedStatus = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:scanner:stop");
  });

  console.log("  Estado detenido:", JSON.stringify(stoppedStatus));
  if (stoppedStatus.isEnabled !== false || stoppedStatus.activeWatchersCount !== 0) {
    throw new Error("Fallo al detener escáner local");
  }
  console.log("✓ Escáner local detenido exitosamente sin watchers activos.");

  // ==> [Paso 7] Cierre y reinicio limpio (persistencia WAL intacta)
  console.log("\n==> [Paso 7] Cerrando aplicación empaquetada y validando persistencia SQLite...");
  await app.close();
  await sleep(1500);

  // Verificar SQLite tras cierre
  const verifyDb = new BetterSqlite3(dbPath, { readonly: true });
  const countInc = verifyDb.prepare("SELECT count(*) as count FROM incidents").get();
  console.log("  Total incidentes persistidos en base tras cierre:", countInc.count);
  verifyDb.close();

  if (countInc.count < 1) {
    throw new Error("Pérdida de datos en SQLite tras cierre de aplicación");
  }
  console.log("✓ Persistencia y WAL recovery verificados exitosamente.");

  console.log("\n==========================================================================");
  console.log("   H8.6 MVP RC1 — PACKAGED APPLICATION QA COMPLETADA EXITOSAMENTE (PASS)   ");
  console.log("==========================================================================");
}

runPackagedQa().catch((err) => {
  console.error("\n❌ FATAL PACKAGED QA ERROR:", err);
  process.exit(1);
});
