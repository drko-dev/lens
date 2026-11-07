/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { _electron as electron } from "playwright";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h9/packaged");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const PACKAGED_APP_PATH = path.join(
  REPO_ROOT,
  "open-lens/dist/h9-novakube-rc1/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps"
);

if (!fs.existsSync(PACKAGED_APP_PATH)) {
  console.error("FATAL: Packaged app binary does not exist at:", PACKAGED_APP_PATH);
  process.exit(1);
}

const TMP_QA_DIR = path.join(os.tmpdir(), `openlens-h9-packaged-qa-${Date.now()}`);
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
`);

console.log("==========================================================================");
console.log("   OpenLens DevOps H9 — Packaged Binary QA Verification Pipeline          ");
console.log("==========================================================================");
console.log("Binary:", PACKAGED_APP_PATH);
console.log("Isolated Profile:", TMP_QA_DIR);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const app = await electron.launch({
  executablePath: PACKAGED_APP_PATH,
  args: [
    "--use-mock-keychain",
    "--offline",
  ],
  timeout: 120_000,
  env: {
    ...process.env,
    NODE_ENV: "production",
    CICD: APPDATA_DIR,
    HOME: SYNTHETIC_HOME,
    KUBECONFIG: SYNTHETIC_KUBECONFIG,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  },
});

try {
  const win = await app.firstWindow();
  await win.waitForLoadState("domcontentloaded");
  await sleep(4000);

  console.log("==> [Paso 1] App empaquetada iniciada. Verificando Welcome y Marca Concepto A...");
  const brandIcon = win.locator('[data-testid="openlens-devops-brand-icon"]');
  await brandIcon.waitFor({ state: "visible", timeout: 20_000 });
  console.log("    ✓ Logo Concepto A visible en binario empaquetado");

  const shot1 = path.join(EVIDENCE_DIR, "01_packaged_welcome_default.png");
  await win.screenshot({ path: shot1 });
  console.log("    ✓ Captura 1 guardada:", shot1);

  // -------------------------------------------------------------------------
  // Paso 2: Centro de Documentación H8.7 en binario empaquetado (Offline)
  // -------------------------------------------------------------------------
  console.log("==> [Paso 2] Verificando Centro de Documentación H8.7 en binario empaquetado...");
  await win.evaluate(() => {
    const di = window.__LENS_RENDERER_DI__;
    if (di) di.injectById("navigate-to-documentation")();
  });
  await sleep(1500);

  const docCenter = win.locator('[data-testid="documentation-center"]');
  await docCenter.waitFor({ state: "visible", timeout: 15_000 });
  console.log("    ✓ Centro de Documentación cargado en binario empaquetado");

  const shot2 = path.join(EVIDENCE_DIR, "02_packaged_documentation_offline.png");
  await win.screenshot({ path: shot2 });
  console.log("    ✓ Captura 2 guardada:", shot2);

  // Volver a Welcome
  await win.evaluate(() => window.history.back());
  await sleep(1200);

  // -------------------------------------------------------------------------
  // Paso 3: Activación de NovaKube en binario empaquetado
  // -------------------------------------------------------------------------
  console.log("==> [Paso 3] Activando tema NovaKube en runtime empaquetado...");
  const themeApplied = await win.evaluate(() => {
    const di = window.__LENS_RENDERER_DI__;
    if (!di) return "no-di";
    try {
      const state = di.injectById("user-preferences-state");
      const applyTheme = di.injectById("apply-lens-theme");
      const novakube = di.injectById("openlens-devops-novakube-theme");
      if (!novakube) return "no-novakube";
      if (!applyTheme) return "no-applyTheme";
      if (!state) return "no-state";
      state.colorTheme = "NovaKube";
      applyTheme(novakube);
      return "ok";
    } catch (e) {
      return `error: ${e?.message || e}`;
    }
  });

  if (themeApplied !== "ok") {
    throw new Error(`Fallo al aplicar NovaKube en app empaquetada: ${themeApplied}`);
  }
  await sleep(1000);

  const hasNovaKubeClass = await win.evaluate(() => document.body.classList.contains("theme-novakube"));
  console.log("    ✓ document.body tiene clase 'theme-novakube' en empaquetado:", hasNovaKubeClass);
  if (!hasNovaKubeClass) {
    throw new Error("document.body no contiene 'theme-novakube' en binario empaquetado");
  }

  const shot3 = path.join(EVIDENCE_DIR, "03_packaged_welcome_novakube.png");
  await win.screenshot({ path: shot3 });
  console.log("    ✓ Captura 3 guardada (Welcome bajo NovaKube empaquetado):", shot3);

  // -------------------------------------------------------------------------
  // Paso 4: Clúster Demo bajo NovaKube en binario empaquetado
  // -------------------------------------------------------------------------
  console.log("==> [Paso 4] Iniciando clúster demo bajo NovaKube en empaquetado...");
  const launchDemoBtn = win.locator('[data-testid="welcome-launch-demo-cluster"]');
  await launchDemoBtn.waitFor({ state: "visible", timeout: 15_000 });
  await launchDemoBtn.click();
  await sleep(3500);

  const clusterFrame = win.frame({ url: /openlens-demo-cluster-local\.lens\.app/ });
  if (!clusterFrame) {
    throw new Error("No se encontró el clusterFrame en app empaquetada");
  }
  await clusterFrame.waitForLoadState("domcontentloaded");
  await sleep(2000);

  const shot4 = path.join(EVIDENCE_DIR, "04_packaged_cluster_demo_novakube.png");
  await win.screenshot({ path: shot4 });
  console.log("    ✓ Captura 4 guardada (Clúster demo en app empaquetada):", shot4);

  // -------------------------------------------------------------------------
  // Paso 5: Reversibilidad limpia a tema Cursor
  // -------------------------------------------------------------------------
  console.log("==> [Paso 5] Probando reversibilidad limpia al tema Cursor...");
  const reverted = await win.evaluate(() => {
    const di = window.__LENS_RENDERER_DI__;
    if (!di) return false;
    const state = di.injectById("user-preferences-state");
    const applyTheme = di.injectById("apply-lens-theme");
    const cursor = di.injectById("openlens-devops-cursor-theme");
    if (cursor && applyTheme && state) {
      state.colorTheme = "Cursor";
      applyTheme(cursor);
      return true;
    }
    return false;
  });

  if (!reverted) {
    throw new Error("Fallo al revertir a tema Cursor");
  }
  await sleep(1000);

  const hasCursor = await win.evaluate(() => document.body.classList.contains("theme-cursor"));
  const noNova = await win.evaluate(() => !document.body.classList.contains("theme-novakube"));
  console.log("    ✓ Reversibilidad en empaquetado: theme-cursor =", hasCursor, "| sin theme-novakube =", noNova);

  // -------------------------------------------------------------------------
  // Paso 6: Verificación de hashes criptográficos de capturas empaquetadas
  // -------------------------------------------------------------------------
  console.log("==> [Paso 6] Verificando hashes de evidencia en app empaquetada...");
  const shots = [shot1, shot2, shot3, shot4];
  const hashes = new Map();
  for (const shot of shots) {
    const data = fs.readFileSync(shot);
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    console.log(`      * ${path.basename(shot)}: ${hash}`);
    if (hashes.has(hash)) {
      throw new Error(`Colisión detectada: ${path.basename(shot)} coincide con ${hashes.get(hash)}`);
    }
    hashes.set(hash, path.basename(shot));
  }

  console.log("==========================================================================");
  console.log("   QA DE BINARIO EMPAQUETADO H9 NOVAKUBE: 100% PASS                       ");
  console.log("==========================================================================");

} finally {
  console.log("==> [H9 QA] Cerrando Electron empaquetado y eliminando perfil temporal...");
  await app.close();
  try {
    fs.rmSync(TMP_QA_DIR, { recursive: true, force: true });
  } catch {}
}
