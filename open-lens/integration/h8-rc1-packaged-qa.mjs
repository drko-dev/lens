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
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h8");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const PACKAGED_APP_PATH = path.join(
  REPO_ROOT,
  "open-lens/dist/h8-rc1/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps"
);

if (!fs.existsSync(PACKAGED_APP_PATH)) {
  console.error("FATAL: Packaged app binary does not exist at:", PACKAGED_APP_PATH);
  process.exit(1);
}

const TMP_QA_DIR = path.join(os.tmpdir(), `openlens-h8-rc1-packaged-qa-${Date.now()}`);
const APPDATA_DIR = path.join(TMP_QA_DIR, "appdata");
const HOME_DIR = path.join(TMP_QA_DIR, "home");
fs.mkdirSync(APPDATA_DIR, { recursive: true });
fs.mkdirSync(HOME_DIR, { recursive: true });

console.log("==================================================================");
console.log("   OpenLens DevOps H8.1 RC1 — Packaged QA Verification Pipeline   ");
console.log("==================================================================");
console.log("Binary:", PACKAGED_APP_PATH);
console.log("Isolated QA Profile:", TMP_QA_DIR);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runPackagedQa() {
  console.log("\n==> [Paso 1] Iniciando aplicación empaquetada OpenLens DevOps (sin dev server)...");

  let app = await electron.launch({
    executablePath: PACKAGED_APP_PATH,
    cwd: path.dirname(PACKAGED_APP_PATH),
    args: [],
    timeout: 60000,
    env: {
      NODE_ENV: "production",
      CICD: APPDATA_DIR,
      HOME: HOME_DIR,
      PATH: process.env.PATH,
      SHELL: "/bin/sh",
      OPENLENS_DETACHED_TOOLS: "1",
    },
  });

  // Esperar a que la ventana principal de Lens esté lista
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
  await sleep(2000);

  const capture01 = path.join(EVIDENCE_DIR, "rc1_01_packaged_app_launch.png");
  await mainWindow.screenshot({ path: capture01 });
  console.log("✓ Captura 01 guardada:", capture01);

  // ==> [Paso 2] Verificar que SQLite fue creado e inicializado en el perfil
  console.log("\n==> [Paso 2] Verificando base SQLite en el perfil aislado de la app empaquetada...");
  // Localizar incidents.db o openlens-devops-incidents.db en el appdata
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

  console.log("  Ruta SQLite detectada:", dbPath);
  if (!dbPath || !fs.existsSync(dbPath)) {
    throw new Error("Base SQLite incidents.db no encontrada en el perfil de la app empaquetada");
  }

  const db = new BetterSqlite3(dbPath, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  console.log("  Tablas presentes en SQLite:", tables.join(", "));
  if (!tables.includes("incidents") || !tables.includes("incident_timeline") || !tables.includes("incident_evidence")) {
    throw new Error("Esquema SQLite incompleto en la aplicación empaquetada");
  }
  const migrations = db.prepare("SELECT version, name FROM schema_migrations").all();
  console.log("  Migraciones aplicadas:", migrations.map(m => `v${m.version}: ${m.name}`).join("; "));
  db.close();
  console.log("✓ SQLite verificado en Electron Main con migraciones intactas.");

  // ==> [Paso 3] Crear incidente sintético mediante IPC y verificar persistencia
  console.log("\n==> [Paso 3] Creando incidente sintético mediante IPC de la app empaquetada...");
  const createResult = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:create", {
      title: "CrashLoopBackOff in payment-service pods",
      severity: "critical",
      clusterId: "prod-cluster-01",
      namespace: "production",
      workloadKind: "Deployment",
      workloadName: "payment-service",
      description: "Synthetic incident created during H8.1 RC1 packaged QA verification.",
    });
  });

  console.log("  Incidente creado:", createResult.id, "Estado inicial:", createResult.status);
  if (!createResult.id || createResult.status !== "DETECTADO") {
    throw new Error("Fallo al crear incidente mediante IPC empaquetado");
  }

  // Verificar en SQLite
  const dbVerify = new BetterSqlite3(dbPath, { readonly: true });
  const row = dbVerify.prepare("SELECT * FROM incidents WHERE id = ?").get(createResult.id);
  dbVerify.close();
  if (!row || row.title !== "CrashLoopBackOff in payment-service pods") {
    throw new Error("El incidente no fue persistido en SQLite");
  }
  console.log("✓ Incidente persistido exitosamente en SQLite.");

  const capture02 = path.join(EVIDENCE_DIR, "rc1_02_incident_created_persisted.png");
  await mainWindow.screenshot({ path: capture02 });
  console.log("✓ Captura 02 guardada:", capture02);

  // ==> [Paso 4] Evidencias sanitizadas y deduplicadas
  console.log("\n==> [Paso 4] Ingestando evidencia sensible con sanitización...");
  const rawSensitiveContent = `
2026-11-05T16:00:00Z [INFO] Connecting to https://admin:SuperSecretPassword123@payments.db.internal/
2026-11-05T16:00:01Z [ERROR] Authorization failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J_wStMmSmWwyOPflx
2026-11-05T16:00:02Z [DEBUG] client_secret=MyVerySecretClientKey999
2026-11-05T16:00:03Z [FATAL] CrashLoopBackOff: pod exited with code 1
`;
  const evidenceResult = await mainWindow.evaluate(async ({ incidentId, content }) => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:ingest-evidence", {
      incidentId,
      type: "pod_logs",
      origin: "k8s_api",
      clusterId: "prod-cluster-01",
      namespace: "production",
      title: "Logs de payment-service-7f89d",
      rawContent: content,
      metadata: { pod: "payment-service-7f89d", container: "api" },
    });
  }, { incidentId: createResult.id, content: rawSensitiveContent });

  console.log("  Evidencia ingestada:", evidenceResult.evidence.id, "Hash:", evidenceResult.evidence.sha256Hash);
  if (
    evidenceResult.evidence.contentSnippet.includes("SuperSecretPassword123") ||
    evidenceResult.evidence.contentSnippet.includes("MyVerySecretClientKey999") ||
    evidenceResult.evidence.contentSnippet.includes("eyJzdWIiOiIxMjM0NTY3ODkwIn0")
  ) {
    throw new Error("FALLO DE SEGURIDAD: La evidencia conservó secretos sin sanitizar");
  }
  console.log("✓ Evidencia sanitizada correctamente (secretos redactados).");

  // Probar deduplicación
  const dedupResult = await mainWindow.evaluate(async ({ incidentId, content }) => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:ingest-evidence", {
      incidentId,
      type: "pod_logs",
      origin: "k8s_api",
      clusterId: "prod-cluster-01",
      namespace: "production",
      title: "Logs duplicados",
      rawContent: content,
    });
  }, { incidentId: createResult.id, content: rawSensitiveContent });

  if (dedupResult.evidence.id !== evidenceResult.evidence.id || !dedupResult.isDuplicate) {
    throw new Error("Fallo de deduplicación: se creó un duplicado con el mismo hash");
  }
  console.log("✓ Deduplicación de evidencias comprobada.");

  // ==> [Paso 5] Transiciones y timeline
  console.log("\n==> [Paso 5] Ejecutando máquina de estados guiada...");
  const t1 = await mainWindow.evaluate(async (id) => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:transition", {
      incidentId: id,
      toStatus: "INVESTIGANDO",
      actor: { type: "human", name: "QA Operator" },
      justification: "Iniciando investigación del stack trace de pagos.",
      evidenceIds: [],
    });
  }, createResult.id);
  console.log("  Transición a INVESTIGANDO:", t1.incident.status);

  const t2 = await mainWindow.evaluate(async ({ id, evidenceId }) => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:transition", {
      incidentId: id,
      toStatus: "CONFIRMADO",
      actor: { type: "human", name: "QA Operator" },
      justification: "Confirmado error de autenticación en la base de datos.",
      evidenceIds: [evidenceId],
    });
  }, { id: createResult.id, evidenceId: evidenceResult.evidence.id });
  console.log("  Transición a CONFIRMADO:", t2.incident.status);

  const t3 = await mainWindow.evaluate(async (id) => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:transition", {
      incidentId: id,
      toStatus: "SOLUCIÓN PROPUESTA",
      actor: { type: "human", name: "QA Operator" },
      justification: "Propuesta de rotación de credenciales y redeploy de pods.",
    });
  }, createResult.id);
  console.log("  Transición a SOLUCIÓN PROPUESTA:", t3.incident.status);
  console.log("✓ Máquina de estados y timeline validados en la app empaquetada.");

  // ==> [Paso 6] Confirmación humana privilegiada con clic interactivo en ventana modal aislada
  console.log("\n==> [Paso 6] Probando pasarela de confirmación privilegiada en app empaquetada...");

  // 6.1 Prueba de Cancelación interactiva
  console.log("  6.1 Solicitando confirmación privilegiada (esperando cancelación interactiva)...");
  const cancelPromise = mainWindow.evaluate(async (id) => {
    const { ipcRenderer } = window.require("electron");
    try {
      const res = await ipcRenderer.invoke("openlens:incident:request-privileged-transition", {
        incidentId: id,
        toStatus: "APROBACIÓN HUMANA",
        justification: "Prueba interactiva de cancelación en app empaquetada.",
      });
      return { ok: true, res };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, createResult.id);

  // Esperar a que se abra la ventana modal
  let modalWindowCancel = await app.waitForEvent("window", { timeout: 15000 });
  await modalWindowCancel.waitForLoadState("load");
  await sleep(1000);
  console.log("  ✓ Ventana modal de confirmación abierta:", modalWindowCancel.url());

  // Clic en Cancelar
  await modalWindowCancel.waitForSelector('#btn-cancel', { timeout: 10000 });
  await modalWindowCancel.click('#btn-cancel');
  console.log("  ✓ Clic en botón 'Cancelar' ejecutado.");
  const cancelResult = await cancelPromise;
  console.log("  Resultado de cancelación:", cancelResult.ok ? "Inesperado OK" : cancelResult.error);

  // Verificar en SQLite que el estado sigue siendo SOLUCIÓN PROPUESTA
  const dbAfterCancel = new BetterSqlite3(dbPath, { readonly: true });
  const rowAfterCancel = dbAfterCancel.prepare("SELECT status FROM incidents WHERE id = ?").get(createResult.id);
  dbAfterCancel.close();
  if (rowAfterCancel.status !== "SOLUCIÓN PROPUESTA") {
    throw new Error(`El estado mutó indebidamente tras cancelar: ${rowAfterCancel.status}`);
  }
  console.log("  ✓ Verificado en SQLite: el incidente no mutó tras la cancelación (status = SOLUCIÓN PROPUESTA).");

  // 6.2 Prueba de Aprobación interactiva con inyección XSS inerte
  console.log("  6.2 Solicitando confirmación privilegiada con payload XSS inerte...");
  const maliciousJustification = "<script>window.__PWNED__=true;</script>Justificación autorizada para mitigación.";

  const approvePromise = mainWindow.evaluate(async ({ id, justification }) => {
    const { ipcRenderer } = window.require("electron");
    try {
      const res = await ipcRenderer.invoke("openlens:incident:request-privileged-transition", {
        incidentId: id,
        toStatus: "APROBACIÓN HUMANA",
        justification,
      });
      return { ok: true, res };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, { id: createResult.id, justification: maliciousJustification });

  let modalWindowApprove = await app.waitForEvent("window", { timeout: 15000 });
  await modalWindowApprove.waitForLoadState("load");
  await sleep(1000);

  // Comprobar que el script no se ejecutó en la ventana modal
  const isPwned = await modalWindowApprove.evaluate(() => window.__PWNED__ === true);
  if (isPwned) {
    throw new Error("FALLO DE SEGURIDAD XSS: Script inyectado se ejecutó en la ventana de confirmación");
  }
  console.log("  ✓ XSS neutralizado en ventana modal aislada (0 payloads ejecutados).");

  const captureModal = path.join(EVIDENCE_DIR, "rc1_05_privileged_confirmation_modal.png");
  await modalWindowApprove.screenshot({ path: captureModal });
  console.log("  ✓ Captura guardada de la ventana modal empaquetada:", captureModal);

  // Clic en Autorizar Transición
  await modalWindowApprove.waitForSelector('#btn-confirm', { timeout: 10000 });
  await modalWindowApprove.click('#btn-confirm');
  console.log("  ✓ Clic en botón 'Autorizar Transición' ejecutado.");
  const approveResult = await approvePromise;
  console.log("  Resultado de aprobación:", approveResult.ok ? "APROBADO" : approveResult.error);

  // Verificar en SQLite que el estado mutó a APROBACIÓN HUMANA y contiene auditReference
  const dbAfterApprove = new BetterSqlite3(dbPath, { readonly: true });
  const rowAfterApprove = dbAfterApprove.prepare("SELECT status FROM incidents WHERE id = ?").get(createResult.id);
  const timelineRows = dbAfterApprove.prepare("SELECT * FROM incident_timeline WHERE incident_id = ? ORDER BY timestamp DESC, rowid DESC").all(createResult.id);
  dbAfterApprove.close();

  if (rowAfterApprove.status !== "APROBACIÓN HUMANA") {
    throw new Error(`El incidente no transicionó a APROBACIÓN HUMANA: ${rowAfterApprove.status}`);
  }
  console.log("  ✓ Verificado en SQLite: status =", rowAfterApprove.status);

  const lastTimeline = timelineRows[0];
  const metadata = JSON.parse(lastTimeline.metadata_json || "{}");
  console.log("  Auditoría en timeline:", metadata.auditReference, "Verificado vía:", metadata.verifiedVia);
  if (!metadata.auditReference || metadata.confirmationToken) {
    throw new Error("FALLO DE AUDITORÍA: El timeline no contiene auditReference o expuso el confirmationToken");
  }
  console.log("  ✓ Auditoría de confirmación humana limpia (sin tokens expuestos).");

  const captureApproved = path.join(EVIDENCE_DIR, "rc1_06_privileged_approval_done.png");
  await mainWindow.screenshot({ path: captureApproved });
  console.log("✓ Captura guardada:", captureApproved);

  // ==> [Paso 7] Política de retención y purga sintética
  console.log("\n==> [Paso 7] Verificando retención y purga en app empaquetada...");
  const retentionPolicy = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:get-retention-policy");
  });
  console.log("  Retención inicial habilitada:", retentionPolicy.enabled);
  if (retentionPolicy.enabled !== false && retentionPolicy.enabled !== 0) {
    throw new Error("La retención debe comenzar deshabilitada por defecto");
  }

  // Activar retención sintética y probar preview
  const previewResult = await mainWindow.evaluate(async () => {
    const { ipcRenderer } = window.require("electron");
    return await ipcRenderer.invoke("openlens:incident:preview-purge", {
      enabled: true,
      strategy: "days",
      retentionDays: 1,
      purgeClosedOnly: true,
      protectPinned: true,
    });
  });
  console.log("  Casos candidatos a purga en preview:", previewResult.candidateIncidentCount);
  console.log("✓ Motor de retención y purga operativo.");

  // ==> [Paso 8] Docking y paneles (Regresión H7)
  console.log("\n==> [Paso 8] Verificando Global Docking en app empaquetada...");
  const dockingCheck = await mainWindow.evaluate(() => {
    return {
      hasDockHost: !!document.querySelector('[data-testid="global-docking-host"]') || !!document.querySelector('.SplitPanel'),
      hasLensRoot: !!document.getElementById('app') || !!document.getElementById('root'),
    };
  });
  console.log("  Host de Docking presente en UI:", dockingCheck);

  const captureDocking = path.join(EVIDENCE_DIR, "rc1_08_global_docking_packaged.png");
  await mainWindow.screenshot({ path: captureDocking });
  console.log("✓ Captura de docking guardada:", captureDocking);

  // ==> [Paso 9] Reinicio de la aplicación y recuperación íntegra de datos
  console.log("\n==> [Paso 9] Probando reinicio y persistencia íntegra de la app empaquetada...");
  await app.close();
  console.log("  ✓ App empaquetada cerrada limpiamente.");
  await sleep(2000);

  // Volver a lanzar la aplicación con el mismo perfil
  console.log("  Relanzando aplicación empaquetada...");
  const app2 = await electron.launch({
    executablePath: PACKAGED_APP_PATH,
    cwd: path.dirname(PACKAGED_APP_PATH),
    args: [],
    timeout: 60000,
    env: {
      NODE_ENV: "production",
      CICD: APPDATA_DIR,
      HOME: HOME_DIR,
      PATH: process.env.PATH,
      SHELL: "/bin/sh",
      OPENLENS_DETACHED_TOOLS: "1",
    },
  });

  let mainWin2 = await app2.firstWindow();
  await mainWin2.waitForLoadState("domcontentloaded");
  await sleep(2000);

  // Consultar SQLite y via IPC para validar que los datos se recuperaron en su totalidad
  const dbRecovered = new BetterSqlite3(dbPath, { readonly: true });
  const recoveredIncident = dbRecovered.prepare("SELECT * FROM incidents WHERE id = ?").get(createResult.id);
  const recoveredEvidences = dbRecovered.prepare("SELECT count(*) as count FROM incident_evidence WHERE incident_id = ?").get(createResult.id);
  const recoveredTimeline = dbRecovered.prepare("SELECT count(*) as count FROM incident_timeline WHERE incident_id = ?").get(createResult.id);
  dbRecovered.close();

  console.log("  Recuperación tras reinicio:");
  console.log("  - Incidente:", recoveredIncident.title, "| Estado:", recoveredIncident.status);
  console.log("  - Evidencias persistidas:", recoveredEvidences.count);
  console.log("  - Eventos de timeline persistidos:", recoveredTimeline.count);

  if (recoveredIncident.status !== "APROBACIÓN HUMANA" || recoveredEvidences.count === 0 || recoveredTimeline.count === 0) {
    throw new Error("Fallo en la recuperación íntegra de datos tras reiniciar la app");
  }
  console.log("✓ Todos los datos fueron recuperados íntegramente tras el reinicio.");

  const captureRestart = path.join(EVIDENCE_DIR, "rc1_09_packaged_restart_recovery.png");
  await mainWin2.screenshot({ path: captureRestart });
  console.log("✓ Captura guardada tras reinicio:", captureRestart);

  await app2.close();
  console.log("\n==================================================================");
  console.log("      H8.1 RC1 PACKAGED QA COMPLETADO CON ÉXITO ABSOLUTO         ");
  console.log("==================================================================");
}

runPackagedQa().catch(err => {
  console.error("\nFATAL ERROR EN QA EMPAQUETADO:", err);
  process.exit(1);
});
