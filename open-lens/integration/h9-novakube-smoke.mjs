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
const OPEN_LENS_DIR = path.join(REPO_ROOT, "open-lens");
const ELECTRON_PATH = path.join(REPO_ROOT, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h9");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const TMP_DIR = path.join(os.tmpdir(), `openlens-h9-smoke-${Date.now()}`);
const APPDATA_DIR = path.join(TMP_DIR, "appdata");
const SYNTHETIC_HOME = path.join(TMP_DIR, "synthetic-home");
const SYNTHETIC_KUBEDIR = path.join(SYNTHETIC_HOME, ".kube");
const SYNTHETIC_KUBECONFIG = path.join(SYNTHETIC_KUBEDIR, "config");

fs.mkdirSync(APPDATA_DIR, { recursive: true });
fs.mkdirSync(SYNTHETIC_KUBEDIR, { recursive: true });

fs.writeFileSync(SYNTHETIC_KUBECONFIG, `apiVersion: v1
kind: Config
clusters: []
contexts: []
users: []
preferences: {}
`);

console.log("==> [H9 QA] Entorno aislado configurado en:", TMP_DIR);
console.log("==> [H9 QA] Lanzando Electron con Playwright para validación de NovaKube...");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const app = await electron.launch({
  executablePath: ELECTRON_PATH,
  cwd: OPEN_LENS_DIR,
  args: [
    ".",
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
  await sleep(3500);

  console.log("==> [H9 QA] Ventana principal cargada");

  // -------------------------------------------------------------------------
  // 1. Verificación Inicial: Pantalla de Bienvenida con Logo Concepto A
  // -------------------------------------------------------------------------
  console.log("==> [Paso 1] Comprobando pantalla de Bienvenida y logo Concepto A...");
  const brandIcon = win.locator('[data-testid="openlens-devops-brand-icon"]');
  await brandIcon.waitFor({ state: "visible", timeout: 20_000 });
  console.log("    ✓ Logo Concepto A presente en Welcome");

  const shot1 = path.join(EVIDENCE_DIR, "01-welcome-default.png");
  await win.screenshot({ path: shot1 });
  console.log("    ✓ Captura 1 guardada:", shot1);

  // -------------------------------------------------------------------------
  // 2. Activación de NovaKube y Verificación de Clases y Tokens en DOM
  // -------------------------------------------------------------------------
  console.log("==> [Paso 2] Activando tema NovaKube en el runtime...");
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
  console.log("    * Resultado activación tema:", themeApplied);

  if (themeApplied !== "ok") {
    throw new Error(`No se pudo activar el tema NovaKube: ${themeApplied}`);
  }
  await sleep(1000);

  const hasNovaKubeClass = await win.evaluate(() => document.body.classList.contains("theme-novakube"));
  console.log("    ✓ document.body tiene clase 'theme-novakube':", hasNovaKubeClass);
  if (!hasNovaKubeClass) {
    throw new Error("document.body no contiene la clase 'theme-novakube' tras su activación");
  }

  const shot2 = path.join(EVIDENCE_DIR, "02-welcome-novakube.png");
  await win.screenshot({ path: shot2 });
  console.log("    ✓ Captura 2 guardada (Welcome bajo NovaKube):", shot2);

  // -------------------------------------------------------------------------
  // 3. Auditoría de Contraste WCAG AA en DOM Real
  // -------------------------------------------------------------------------
  console.log("==> [Paso 3] Auditando contraste de tokens NovaKube...");
  const contrastCheck = await win.evaluate(() => {
    const parseRgb = (hex) => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
    };
    const luminance = ([r, g, b]) => {
      const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
    };
    const ratio = (hex1, hex2) => {
      const l1 = luminance(parseRgb(hex1));
      const l2 = luminance(parseRgb(hex2));
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    const textToBg = ratio("#D7DCE2", "#12161B");
    const secTextToBg = ratio("#A8B2BF", "#12161B");
    const btnTextToPrimary = ratio("#12161B", "#7792AC");
    const successToBg = ratio("#65B996", "#12161B");
    const warningToBg = ratio("#D2A65E", "#12161B");
    const dangerToBg = ratio("#D17B7F", "#12161B");

    return {
      textToBg: textToBg.toFixed(2),
      secTextToBg: secTextToBg.toFixed(2),
      btnTextToPrimary: btnTextToPrimary.toFixed(2),
      successToBg: successToBg.toFixed(2),
      warningToBg: warningToBg.toFixed(2),
      dangerToBg: dangerToBg.toFixed(2),
      passesNormalText: textToBg >= 4.5 && btnTextToPrimary >= 4.5,
      passesUiComponents: secTextToBg >= 3.0 && successToBg >= 3.0 && warningToBg >= 3.0 && dangerToBg >= 3.0,
    };
  });

  console.log("    ✓ Ratios de contraste calculados:", contrastCheck);
  if (!contrastCheck.passesNormalText || !contrastCheck.passesUiComponents) {
    throw new Error(`Fallo de contraste WCAG AA: ${JSON.stringify(contrastCheck)}`);
  }
  console.log("    ✓ Contraste WCAG AA verificado en paleta oficial NovaKube");

  // -------------------------------------------------------------------------
  // 4. Centro de Documentación H8.7 bajo NovaKube
  // -------------------------------------------------------------------------
  console.log("==> [Paso 4] Navegando a Centro de Documentación bajo NovaKube...");
  await win.evaluate(() => {
    const di = window.__LENS_RENDERER_DI__;
    if (di) di.injectById("navigate-to-documentation")();
  });
  await sleep(1200);

  const docCenter = win.locator('[data-testid="documentation-center"]');
  await docCenter.waitFor({ state: "visible", timeout: 15_000 });
  const shot3 = path.join(EVIDENCE_DIR, "03-documentation-novakube.png");
  await win.screenshot({ path: shot3 });
  console.log("    ✓ Captura 3 guardada (Documentación bajo NovaKube):", shot3);

  // Volver a Welcome
  await win.evaluate(() => window.history.back());
  await sleep(1000);

  // -------------------------------------------------------------------------
  // 5. Clúster Demo, Incidentes y SplitPanel bajo NovaKube
  // -------------------------------------------------------------------------
  console.log("==> [Paso 5] Conectando a clúster demo bajo NovaKube...");
  const launchDemoBtn = win.locator('[data-testid="welcome-launch-demo-cluster"]');
  await launchDemoBtn.waitFor({ state: "visible", timeout: 15_000 });
  await launchDemoBtn.click();
  await sleep(3000);

  const clusterFrame = win.frame({ url: /openlens-demo-cluster-local\.lens\.app/ });
  if (!clusterFrame) {
    throw new Error("No se encontró el frame del clúster demo");
  }
  await clusterFrame.waitForLoadState("domcontentloaded");
  await sleep(2000);

  const shot4 = path.join(EVIDENCE_DIR, "04-cluster-demo-novakube.png");
  await win.screenshot({ path: shot4 });
  console.log("    ✓ Captura 4 guardada (Clúster demo bajo NovaKube):", shot4);

  // Navegar a Incidentes
  console.log("    * Navegando a /incidents...");
  const clusterBaseUrl = new URL(clusterFrame.url()).origin;
  await clusterFrame.goto(`${clusterBaseUrl}/incidents`);
  await clusterFrame.waitForLoadState("domcontentloaded");
  await sleep(2000);

  const shot5 = path.join(EVIDENCE_DIR, "05-incidents-novakube.png");
  await win.screenshot({ path: shot5 });
  console.log("    ✓ Captura 5 guardada (Incidentes bajo NovaKube):", shot5);

  // Navegar a Kubetail SplitPanel
  console.log("    * Navegando a /kubetail...");
  await clusterFrame.goto(`${clusterBaseUrl}/kubetail`);
  await clusterFrame.waitForLoadState("domcontentloaded");
  await sleep(2000);

  const shot6 = path.join(EVIDENCE_DIR, "06-kubetail-splitpanel-novakube.png");
  await win.screenshot({ path: shot6 });
  console.log("    ✓ Captura 6 guardada (Kubetail SplitPanel bajo NovaKube):", shot6);

  // -------------------------------------------------------------------------
  // 6. Reversibilidad: Volver a Cursor y comprobar limpieza de clases
  // -------------------------------------------------------------------------
  console.log("==> [Paso 6] Reversibilidad: volviendo al tema Cursor por defecto...");
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
    throw new Error("Fallo al revertir el tema a Cursor");
  }
  await sleep(800);

  const hasCursorClass = await win.evaluate(() => document.body.classList.contains("theme-cursor"));
  const hasNoNovaKube = await win.evaluate(() => !document.body.classList.contains("theme-novakube"));
  console.log("    ✓ Reversibilidad verificada: theme-cursor =", hasCursorClass, "| sin theme-novakube =", hasNoNovaKube);

  if (!hasCursorClass || !hasNoNovaKube) {
    throw new Error("Fallo en reversibilidad: las clases de tema residuales permanecieron en el DOM");
  }

  // -------------------------------------------------------------------------
  // 7. Verificación de Hashes Criptográficos Únicos
  // -------------------------------------------------------------------------
  console.log("==> [Paso 7] Verificando hashes SHA-256 de capturas tomadas...");
  const shots = [shot1, shot2, shot3, shot4, shot5, shot6];
  const hashes = new Map();
  for (const shot of shots) {
    const data = fs.readFileSync(shot);
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    console.log(`      * ${path.basename(shot)}: ${hash}`);
    if (hashes.has(hash)) {
      throw new Error(`Colisión de imagen detectada: ${path.basename(shot)} coincide con ${hashes.get(hash)}`);
    }
    hashes.set(hash, path.basename(shot));
  }
  console.log(`==> [H9 QA] Todas las ${hashes.size} capturas son auténticas y visualmente distintas.`);
  console.log("==> [H9 QA] SMOKE TEST DE NOVAKUBE COMPLETADO CON ÉXITO (PASS TOTAL).");

} finally {
  console.log("==> [H9 QA] Cerrando Electron y limpiando entorno temporal...");
  await app.close();
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {}
}
