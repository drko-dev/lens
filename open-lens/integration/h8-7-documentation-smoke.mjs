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
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h8-7");
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const TMP_DIR = path.join(os.tmpdir(), `openlens-h8-7-smoke-${Date.now()}`);
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

console.log("==> [H8.7 Smoke] Entorno aislado configurado en:", TMP_DIR);
console.log("==> [H8.7 Smoke] Lanzando Electron con Playwright...");

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
  let win;
  for (let i = 0; i < 60 && !win; i++) {
    win = app.windows().find((w) => {
      const url = w.url();
      return url.startsWith("https://lens.app") || url.includes("index.html");
    });
    if (!win) await sleep(500);
  }

  if (!win) {
    throw new Error(`Ventana principal de Electron no encontrada. Ventanas activas: ${app.windows().map((w) => w.url()).join(", ")}`);
  }

  console.log("==> [H8.7 Smoke] Ventana principal conectada:", win.url());
  await win.waitForLoadState("domcontentloaded");
  await sleep(2000);

  // 1. Verificación en Welcome screen
  console.log("==> [H8.7 Smoke] Verificando pantalla de Bienvenida...");
  const welcomeEl = win.locator(".Welcome, [data-testid='welcome-page'], main").first();
  await welcomeEl.waitFor({ state: "visible", timeout: 15_000 });

  // Botón Documentación en Welcome
  const docButton = win.locator("button:has-text('Documentación')").first();
  await docButton.waitFor({ state: "visible", timeout: 10_000 });
  console.log("    ✓ Botón 'Documentación' visible en Welcome");

  const shot1 = path.join(EVIDENCE_DIR, "01-welcome-documentation-entry.png");
  await win.screenshot({ path: shot1 });
  console.log("    ✓ Captura 1 guardada:", shot1);

  // 2. Click para entrar al Centro de Documentación
  console.log("==> [H8.7 Smoke] Navegando al Centro de Documentación...");
  await docButton.click();
  await sleep(1500);

  const docCenter = win.locator("[data-testid='documentation-center']");
  await docCenter.waitFor({ state: "visible", timeout: 10_000 });
  console.log("    ✓ Centro de Documentación cargado correctamente");

  const titleEl = win.locator("[data-testid='documentation-article-title']");
  const initialTitle = await titleEl.textContent();
  console.log("    ✓ Título inicial:", initialTitle);

  const shot2 = path.join(EVIDENCE_DIR, "02-documentation-center-inicio.png");
  await win.screenshot({ path: shot2 });
  console.log("    ✓ Captura 2 guardada:", shot2);

  // 3. Buscar "ventana flotante" y abrir artículo
  console.log("==> [H8.7 Smoke] Probando búsqueda offline de 'ventana flotante'...");
  const searchInput = win.locator("[data-testid='documentation-search'], input[type='search']").first();
  await searchInput.fill("ventana flotante");
  await sleep(500);

  const vfArticleBtn = win.locator("[data-testid='documentation-article-ventanas-flotantes']");
  await vfArticleBtn.waitFor({ state: "visible", timeout: 5000 });
  await vfArticleBtn.click();
  await sleep(500);

  const vfTitle = await titleEl.textContent();
  console.log("    ✓ Título de artículo abierto:", vfTitle);

  const shot3 = path.join(EVIDENCE_DIR, "03-article-ventanas-flotantes.png");
  await win.screenshot({ path: shot3 });
  console.log("    ✓ Captura 3 guardada:", shot3);

  // 4. Buscar "diagnóstico" y abrir artículo de Diagnóstico IA
  console.log("==> [H8.7 Smoke] Probando búsqueda y apertura de 'diagnóstico'...");
  await searchInput.fill("diagnóstico");
  await sleep(500);

  const aiArticleBtn = win.locator("[data-testid='documentation-article-diagnostico-ia']");
  await aiArticleBtn.waitFor({ state: "visible", timeout: 5000 });
  await aiArticleBtn.click();
  await sleep(500);

  const aiTitle = await titleEl.textContent();
  console.log("    ✓ Título de artículo abierto:", aiTitle);

  const shot4 = path.join(EVIDENCE_DIR, "04-article-diagnostico-ia.png");
  await win.screenshot({ path: shot4 });
  console.log("    ✓ Captura 4 guardada:", shot4);

  // 5. Probar navegación de historial (Volver)
  console.log("==> [H8.7 Smoke] Probando botón 'Volver'...");
  const backBtn = win.locator("[data-testid='documentation-back']");
  await backBtn.click();
  await sleep(500);
  const backTitle = await titleEl.textContent();
  console.log("    ✓ Título tras volver:", backTitle);

  // 6. Volver a Welcome
  console.log("==> [H8.7 Smoke] Probando botón 'Volver a Bienvenida'...");
  const backWelcomeBtn = win.locator("[data-testid='documentation-back-welcome']");
  await backWelcomeBtn.click();
  await sleep(1000);

  await welcomeEl.waitFor({ state: "visible", timeout: 5000 });
  console.log("    ✓ Regreso a pantalla de Bienvenida exitoso");

  const shot5 = path.join(EVIDENCE_DIR, "05-return-to-welcome.png");
  await win.screenshot({ path: shot5 });
  console.log("    ✓ Captura 5 guardada:", shot5);

  // Comprobar hashes distintos de capturas
  const shots = [shot1, shot2, shot3, shot4, shot5];
  const hashes = new Set();
  for (const s of shots) {
    const buf = fs.readFileSync(s);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    console.log(`    SHA-256 [${path.basename(s)}]: ${hash}`);
    hashes.add(hash);
  }

  if (hashes.size !== shots.length) {
    throw new Error(`Capturas idénticas detectadas (${hashes.size} de ${shots.length}). Fallo de autenticidad visual.`);
  }

  console.log(`==> [H8.7 Smoke] Todas las ${hashes.size} capturas son auténticas y visualmente distintas.`);
  console.log("==> [H8.7 Smoke] SMOKE TEST COMPLETADO CON ÉXITO (PASS).");

} finally {
  await app.close();
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {}
}
