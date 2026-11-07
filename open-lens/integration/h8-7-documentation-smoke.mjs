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

console.log("==> [H8.7 QA] Entorno aislado configurado en:", TMP_DIR);
console.log("==> [H8.7 QA] Lanzando Electron con Playwright y auditoría de red...");

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
  const ctx = app.context();

  // =========================================================================
  // AUDITORÍA ESTRICTA Y BLOQUEO DE RED GLOBAL (OFFLINE ENFORCEMENT)
  // =========================================================================
  const interceptedUrls = [];
  const blockedExternalRequests = [];
  const NEGATIVE_TEST_HOST = "negative-test-external.lens-security-audit.invalid";

  const isAllowedUrl = (url) => {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === "lens.app" ||
        parsed.hostname.endsWith(".lens.app") ||
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.protocol === "data:" ||
        parsed.protocol === "file:" ||
        parsed.protocol === "devtools:" ||
        parsed.protocol === "chrome-extension:"
      );
    } catch {
      return true;
    }
  };

  // 1. Intercepción global en Playwright BrowserContext (cubre todas las ventanas y frames)
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    interceptedUrls.push(url);

    if (isAllowedUrl(url)) {
      await route.continue();
    } else {
      console.log(`[NETWORK INTERCEPTOR] Solicitud externa detectada y bloqueada: ${url}`);
      blockedExternalRequests.push(url);
      await route.abort("blockedbyclient");
    }
  });

  // 2. Intercepción en el proceso Main de Electron vía session.defaultSession.webRequest
  await app.evaluate(async ({ session }) => {
    globalThis.__ALL_REQUESTS__ = [];
    globalThis.__BLOCKED_REQUESTS__ = [];

    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const url = details.url;
      globalThis.__ALL_REQUESTS__.push(url);

      let isAllowed = false;
      try {
        const parsed = new URL(url);
        isAllowed =
          parsed.hostname === "lens.app" ||
          parsed.hostname.endsWith(".lens.app") ||
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.protocol === "data:" ||
          parsed.protocol === "file:" ||
          parsed.protocol === "devtools:" ||
          parsed.protocol === "chrome-extension:";
      } catch {
        isAllowed = true;
      }

      if (isAllowed) {
        callback({});
      } else {
        globalThis.__BLOCKED_REQUESTS__.push(url);
        callback({ cancel: true });
      }
    });
  });

  // 3. Listener en nuevas ventanas
  app.on("window", (page) => {
    page.on("request", (req) => {
      const url = req.url();
      if (!interceptedUrls.includes(url)) {
        interceptedUrls.push(url);
      }
      if (!isAllowedUrl(url) && !blockedExternalRequests.includes(url)) {
        blockedExternalRequests.push(url);
      }
    });
  });

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

  console.log("==> [H8.7 QA] Ventana principal conectada:", win.url());
  win.on("pageerror", (err) => console.log("    [WIN ERROR]", err.message));

  await win.waitForLoadState("domcontentloaded");
  await sleep(2000);

  // =========================================================================
  // PRUEBA NEGATIVA SINTÉTICA SEGURA (FAIL-CLOSED VERIFICATION)
  // =========================================================================
  console.log("==> [H8.7 QA Auditoría Red] Ejecutando prueba negativa de solicitud externa sintética...");
  const negativeUrl = `https://${NEGATIVE_TEST_HOST}/telemetry-probe`;
  const negativeResult = await win.evaluate(async (targetUrl) => {
    try {
      await fetch(targetUrl, { method: "GET" });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, negativeUrl);

  console.log("    ✓ Resultado de la solicitud externa inducida:", negativeResult);
  if (negativeResult.success) {
    throw new Error("FAIL-CLOSED VIOLATION: La solicitud externa simulada no fue bloqueada.");
  }

  const mainBlocked = await app.evaluate(() => globalThis.__BLOCKED_REQUESTS__ || []);
  const negativeCaught =
    blockedExternalRequests.some((u) => u.includes(NEGATIVE_TEST_HOST)) ||
    mainBlocked.some((u) => u.includes(NEGATIVE_TEST_HOST));

  if (!negativeCaught) {
    throw new Error("FAIL-CLOSED VIOLATION: La solicitud externa no fue registrada por ningún auditor de red.");
  }
  console.log("    ✓ Prueba negativa confirmada: solicitud externa interceptada y bloqueada exitosamente.");

  // =========================================================================
  // FLUJO PRINCIPAL DE DOCUMENTACIÓN (WELCOME -> SEARCH -> BACK)
  // =========================================================================
  // 1. Verificación en Welcome screen
  console.log("==> [H8.7 QA] Verificando pantalla de Bienvenida...");
  const welcomeEl = win.locator(".Welcome, [data-testid='welcome-page'], main").first();
  await welcomeEl.waitFor({ state: "visible", timeout: 15_000 });

  const docButton = win.locator("button:has-text('Documentación')").first();
  await docButton.waitFor({ state: "visible", timeout: 10_000 });
  console.log("    ✓ Botón 'Documentación' visible en Welcome");

  const shot1 = path.join(EVIDENCE_DIR, "01-welcome-documentation-entry.png");
  await win.screenshot({ path: shot1 });
  console.log("    ✓ Captura 1 guardada:", shot1);

  // 2. Click para entrar al Centro de Documentación
  console.log("==> [H8.7 QA] Navegando al Centro de Documentación...");
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
  console.log("==> [H8.7 QA] Probando búsqueda offline de 'ventana flotante'...");
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
  console.log("==> [H8.7 QA] Probando búsqueda y apertura de 'diagnóstico'...");
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
  console.log("==> [H8.7 QA] Probando botón 'Volver'...");
  const backBtn = win.locator("[data-testid='documentation-back']");
  await backBtn.click();
  await sleep(500);
  const backTitle = await titleEl.textContent();
  console.log("    ✓ Título tras volver:", backTitle);

  // 6. Volver a Welcome
  console.log("==> [H8.7 QA] Probando botón 'Volver a Bienvenida'...");
  const backWelcomeBtn = win.locator("[data-testid='documentation-back-welcome']");
  await backWelcomeBtn.click();
  await sleep(1000);

  await welcomeEl.waitFor({ state: "visible", timeout: 5000 });
  console.log("    ✓ Regreso a pantalla de Bienvenida exitoso");

  const shot5 = path.join(EVIDENCE_DIR, "05-return-to-welcome.png");
  await win.screenshot({ path: shot5 });
  console.log("    ✓ Captura 5 guardada:", shot5);

  // =========================================================================
  // PRUEBAS DE AYUDA CONTEXTUAL MEDIANTE CLICKS REALES Y COMPONENTES AUTÉNTICOS
  // (INCIDENTES, WORKBENCH, CONSENTIMIENTO, DOCKING)
  // =========================================================================
  console.log("==> [H8.7 QA] Conectando con clúster demo y probando clicks reales en botones contextuales...");

  // Conectar al clúster demo sintético desde Welcome
  const launchDemoBtn = win.locator('[data-testid="welcome-launch-demo-cluster"]');
  await launchDemoBtn.waitFor({ state: "visible", timeout: 10_000 });
  console.log("    * Iniciando Demo Cluster sintético...");
  await launchDemoBtn.click();

  let clusterFrame;
  for (let i = 0; i < 60 && !clusterFrame; i++) {
    clusterFrame = win.frames().find((f) => f.name() === "openlens-demo-cluster" || f.url().includes(".lens.app"));
    if (!clusterFrame) await sleep(500);
  }

  if (!clusterFrame) {
    throw new Error("Cluster frame 'openlens-demo-cluster' no encontrado tras pulsar launch demo cluster.");
  }
  await clusterFrame.waitForLoadState("domcontentloaded");
  await sleep(2000);
  console.log("    ✓ Cluster frame conectado:", clusterFrame.url());

  // -------------------------------------------------------------------------
  // Preparar fixture sintético en contexto confiable (Main Window)
  // -------------------------------------------------------------------------
  console.log("    * Preparando fixture de incidente sintético en contexto confiable...");
  const syntheticIncident = await win.evaluate(async () => {
    const di = window.__LENS_RENDERER_DI__;
    const store = di.injectById("incident-store");
    const inc = await store.createIncident({
      title: "Pod en CrashLoopBackOff por OOMKilled",
      description: "Contenedor finalizado con código de salida 137 (SIGKILL por OOM). Reinicios constantes.",
      severity: "critical",
      clusterId: "openlens-demo-cluster-local",
      namespace: "production",
      workloadKind: "Pod",
      workloadName: "billing-service-worker",
    });
    if (inc) {
      await store.ingestEvidence({
        incidentId: inc.id,
        type: "pod_logs",
        origin: "kubectl logs",
        title: "Log de terminación de contenedor",
        rawContent: "2026-11-05T10:45:12Z Out of Memory: Kill process 412 (billing-service) score 950\nExit Code: 137",
        clusterId: "openlens-demo-cluster-local",
        namespace: "production",
        resourceKind: "Pod",
        resourceName: "billing-service-worker",
        resourceVersion: "4501",
      });
    }
    return inc;
  });
  console.log("    ✓ Incidente sintético creado para pruebas:", syntheticIncident?.id);

  // Navegar dentro del clúster a /incidents
  const clusterBaseUrl = clusterFrame.url().split("/overview")[0].split("/kubetail")[0].split("/incidents")[0];
  console.log("    * Navegando clúster a /incidents...");
  await clusterFrame.goto(`${clusterBaseUrl}/incidents`);
  await clusterFrame.waitForLoadState("domcontentloaded");
  await sleep(1500);

  const incidentListEl = clusterFrame.locator('[data-testid="incident-list-view"]');
  await incidentListEl.waitFor({ state: "visible", timeout: 15_000 });
  console.log("    ✓ Centro de Incidentes cargado en clúster frame");

  // -------------------------------------------------------------------------
  // Botón 1: incidents-help-button (Click Real en Centro de Incidentes)
  // -------------------------------------------------------------------------
  console.log("    * [Botón 1] Click real en 'incidents-help-button'...");
  const incHelpBtn = clusterFrame.locator('[data-testid="incidents-help-button"]');
  await incHelpBtn.waitFor({ state: "visible", timeout: 10_000 });
  await incHelpBtn.click();
  await sleep(1200);

  // Comprobar que la ventana raíz abrió el artículo de Incidentes
  await docCenter.waitFor({ state: "visible", timeout: 10_000 });
  const incDocTitle = await titleEl.textContent();
  console.log("      ✓ Título cargado en ventana raíz:", incDocTitle);
  if (!incDocTitle.includes("Centro de Incidentes")) {
    throw new Error(`Fallo en click real de incidents-help-button: esperado 'Centro de Incidentes', obtenido '${incDocTitle}'`);
  }
  const shot6 = path.join(EVIDENCE_DIR, "06-contextual-incidentes.png");
  await win.screenshot({ path: shot6 });
  console.log("      ✓ Captura 6 guardada:", shot6);

  // Volver al clúster entre consultas
  console.log("      ✓ Volviendo al clúster tras consulta 1...");
  await win.evaluate(() => window.history.back());
  await sleep(1200);
  await incidentListEl.waitFor({ state: "visible", timeout: 15_000 });
  console.log("      ✓ Regreso al clúster confirmado (Incidentes visible)");

  // -------------------------------------------------------------------------
  // Botón 2: workbench-help-button (Click Real en Incident Workbench)
  // -------------------------------------------------------------------------
  console.log("    * [Botón 2] Preparando fixture de incidente en store del clúster...");
  await clusterFrame.evaluate((inc) => {
    const di = window.__LENS_RENDERER_DI__;
    if (di) {
      const store = di.injectById("incident-store");
      store.incidents = [inc];
      store.activeIncidentId = inc.id;
      store.activeIncidentEvidence = [
        {
          id: "ev-demo-1",
          incidentId: inc.id,
          type: "pod_logs",
          title: "Log de terminación de contenedor OOMKilled",
          rawContent: "2026-11-06T00:00:00Z Out of Memory: Kill process 123 score 950\nExit Code: 137",
          createdAt: new Date().toISOString(),
        },
      ];
      store.aiProfiles = [
        {
          id: "mock-model-default",
          name: "Mock AI Provider",
          provider: "mock",
          model: "mock-v1",
          isDefault: true,
        },
      ];
      store.prepareConsentPreview = async () => {
        store.consentPreview = {
          profileId: "mock-model-default",
          profileName: "Mock AI Provider",
          provider: "mock",
          model: "mock-v1",
          incidentId: inc.id,
          evidencesCount: 1,
          sanitizedTokensEstimate: 50,
          clusterId: "openlens-demo-cluster-local",
          namespace: "production",
        };
        return store.consentPreview;
      };
      store.consentPreview = {
        profileId: "mock-model-default",
        profileName: "Mock AI Provider",
        provider: "mock",
        model: "mock-v1",
        incidentId: inc.id,
        evidencesCount: 1,
        sanitizedTokensEstimate: 50,
        clusterId: "openlens-demo-cluster-local",
        namespace: "production",
      };
    }
  }, syntheticIncident);
  await sleep(800);

  console.log("    * Abriendo Workbench mediante click real en botón de analizar incidente...");
  const openWbBtn = clusterFrame.locator(`[data-testid="open-workbench-btn-${syntheticIncident.id}"], [data-testid^="open-workbench-btn-"]`).first();
  await openWbBtn.waitFor({ state: "visible", timeout: 10_000 });
  await openWbBtn.click();
  await sleep(1500);

  const workbenchPanel = clusterFrame.locator('[data-testid="incident-workbench-panel"]');
  await workbenchPanel.waitFor({ state: "visible", timeout: 15_000 });
  console.log("      ✓ Panel de Workbench montado exitosamente");

  const wbHelpBtn = clusterFrame.locator('[data-testid="workbench-help-button"]');
  await wbHelpBtn.waitFor({ state: "visible", timeout: 10_000 });
  console.log("    * Click real en 'workbench-help-button'...");
  await wbHelpBtn.click();
  await sleep(1200);

  // Comprobar que la ventana raíz abrió el artículo de Diagnóstico IA
  await docCenter.waitFor({ state: "visible", timeout: 10_000 });
  const diagDocTitle = await titleEl.textContent();
  console.log("      ✓ Título cargado en ventana raíz:", diagDocTitle);
  if (!diagDocTitle.includes("diagnóstico con IA")) {
    throw new Error(`Fallo en click real de workbench-help-button: esperado 'diagnóstico con IA', obtenido '${diagDocTitle}'`);
  }
  const shot7 = path.join(EVIDENCE_DIR, "07-contextual-workbench.png");
  await win.screenshot({ path: shot7 });
  console.log("      ✓ Captura 7 guardada:", shot7);

  // Volver al clúster entre consultas
  console.log("      ✓ Volviendo al clúster tras consulta 2...");
  await win.evaluate(() => window.history.back());
  await sleep(1200);
  await workbenchPanel.waitFor({ state: "visible", timeout: 15_000 });
  console.log("      ✓ Regreso al clúster confirmado (Workbench visible)");

  // -------------------------------------------------------------------------
  // Botón 3: consent-help-link (Click Real en Modal de Consentimiento IA)
  // -------------------------------------------------------------------------
  console.log("    * [Botón 3] Configurando fixture de perfiles IA y abriendo modal de consentimiento...");
  await clusterFrame.evaluate((inc) => {
    const di = window.__LENS_RENDERER_DI__;
    if (di) {
      const store = di.injectById("incident-store");
      store.ipc = {
        invoke: async (channel) => {
          if (channel.includes("list-profiles") || channel.includes("ai:list")) {
            return [
              {
                id: "mock-model-default",
                name: "Mock AI Provider",
                provider: "mock",
                model: "mock-v1",
                isDefault: true,
              },
            ];
          }
          if (channel.includes("prepare-consent")) {
            return {
              profileId: "mock-model-default",
              profileName: "Mock AI Provider",
              provider: "mock",
              model: "mock-v1",
              incidentId: inc.id,
              evidencesCount: 1,
              sanitizedTokensEstimate: 50,
              clusterId: "openlens-demo-cluster-local",
              namespace: "production",
              evidenceItems: [
                {
                  id: "ev-demo-1",
                  type: "pod_logs",
                  title: "Log de terminación de contenedor OOMKilled",
                  sanitizedBytes: 120,
                  previewContent: "Exit code 137: Out of Memory",
                },
              ],
              manualContextItems: [],
            };
          }
          return [];
        },
      };
      store.incidents = [inc];
      store.activeIncidentId = inc.id;
      store.aiProfiles = [
        {
          id: "mock-model-default",
          name: "Mock AI Provider",
          provider: "mock",
          model: "mock-v1",
          isDefault: true,
        },
      ];
      store.activeIncidentEvidence = [
        {
          id: "ev-demo-1",
          incidentId: inc.id,
          type: "pod_logs",
          title: "Log de terminación de contenedor OOMKilled",
          rawContent: "2026-11-06T00:00:00Z Out of Memory: Kill process 123 score 950\nExit Code: 137",
          createdAt: new Date().toISOString(),
        },
      ];
    }
  }, syntheticIncident);
  await sleep(500);

  const debugInfo = await clusterFrame.evaluate(async () => {
    const di = window.__LENS_RENDERER_DI__;
    const store = di.injectById("incident-store");
    return {
      activeIncident: store.activeIncident,
      activeIncidentEvidenceLength: store.activeIncidentEvidence.length,
      aiProfiles: store.aiProfiles,
      consentPreview: store.consentPreview,
    };
  });
  console.log("    [DEBUG BEFORE CONSENT]", JSON.stringify(debugInfo));

  clusterFrame.page().on("pageerror", (err) => console.log("    [CLUSTER ERROR]", err.message));
  clusterFrame.page().on("console", (msg) => console.log("    [CLUSTER CONSOLE]", msg.type(), msg.text()));

  const tabDiagnostic = clusterFrame.locator('[data-testid="tab-diagnostic"]');
  await tabDiagnostic.waitFor({ state: "visible", timeout: 10_000 });
  await tabDiagnostic.click();
  await sleep(800);

  console.log("    * Click real en analyze-ai-btn...");
  const analyzeAiBtn = clusterFrame.locator('[data-testid="analyze-ai-btn"]');
  await analyzeAiBtn.waitFor({ state: "visible", timeout: 10_000 });
  await analyzeAiBtn.click();
  await sleep(1200);

  const consentModal = clusterFrame.locator('[data-testid="ai-consent-modal"]');
  await consentModal.waitFor({ state: "visible", timeout: 10_000 });
  console.log("      ✓ Modal de consentimiento IA abierto");

  const consentHelpLink = clusterFrame.locator('[data-testid="consent-help-link"]');
  await consentHelpLink.waitFor({ state: "visible", timeout: 10_000 });
  console.log("    * Click real en 'consent-help-link'...");
  await consentHelpLink.click();
  await sleep(1200);

  // Comprobar que la ventana raíz abrió el artículo de Contexto Efímero
  await docCenter.waitFor({ state: "visible", timeout: 10_000 });
  const consentDocTitle = await titleEl.textContent();
  console.log("      ✓ Título cargado en ventana raíz:", consentDocTitle);
  if (!consentDocTitle.includes("contexto") && !consentDocTitle.includes("segura")) {
    throw new Error(`Fallo en click real de consent-help-link: esperado 'contexto temporal', obtenido '${consentDocTitle}'`);
  }
  const shot8 = path.join(EVIDENCE_DIR, "08-contextual-consent.png");
  await win.screenshot({ path: shot8 });
  console.log("      ✓ Captura 8 guardada:", shot8);

  // Volver al clúster entre consultas
  console.log("      ✓ Volviendo al clúster tras consulta 3...");
  await win.evaluate(() => window.history.back());
  await sleep(1200);
  await workbenchPanel.waitFor({ state: "visible", timeout: 15_000 });
  console.log("      ✓ Regreso al clúster confirmado (Workbench visible tras consentimiento)");

  // -------------------------------------------------------------------------
  // Botón 4: docking-help-button (Click Real en SplitPanel de Kubetail)
  // -------------------------------------------------------------------------
  console.log("    * [Botón 4] Navegando clúster a /kubetail...");
  await clusterFrame.goto(`${clusterBaseUrl}/kubetail`);
  await clusterFrame.waitForLoadState("domcontentloaded");
  await sleep(2000);

  const splitContainer = clusterFrame.locator('[data-testid="split-panel-layout-container"]');
  await splitContainer.waitFor({ state: "visible", timeout: 15_000 });
  console.log("      ✓ Layout de Kubetail / SplitPanel cargado");

  const dockingHelpBtn = clusterFrame.locator('[data-testid="docking-help-button"]');
  await dockingHelpBtn.waitFor({ state: "visible", timeout: 10_000 });
  console.log("    * Click real en 'docking-help-button'...");
  await dockingHelpBtn.click();
  await sleep(1200);

  // Comprobar que la ventana raíz abrió el artículo de Ventanas Flotantes
  await docCenter.waitFor({ state: "visible", timeout: 10_000 });
  const dockDocTitle = await titleEl.textContent();
  console.log("      ✓ Título cargado en ventana raíz:", dockDocTitle);
  if (!dockDocTitle.includes("ventana flotante")) {
    throw new Error(`Fallo en click real de docking-help-button: esperado 'ventana flotante', obtenido '${dockDocTitle}'`);
  }
  const shot9 = path.join(EVIDENCE_DIR, "09-contextual-docking.png");
  await win.screenshot({ path: shot9 });
  console.log("      ✓ Captura 9 guardada:", shot9);

  // Volver al clúster entre consultas
  console.log("      ✓ Volviendo al clúster tras consulta 4...");
  await win.evaluate(() => window.history.back());
  await sleep(1200);
  await splitContainer.waitFor({ state: "visible", timeout: 15_000 });
  console.log("      ✓ Regreso al clúster confirmado (Kubetail visible tras docking)");

  // =========================================================================
  // VERIFICACIÓN DE HASHES DISTINTOS Y AUDITORÍA DE RED
  // =========================================================================
  const allShots = [shot1, shot2, shot3, shot4, shot5, shot6, shot7, shot8, shot9];
  const hashes = new Set();
  for (const s of allShots) {
    const buf = fs.readFileSync(s);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    console.log(`    SHA-256 [${path.basename(s)}]: ${hash}`);
    hashes.add(hash);
  }

  if (hashes.size !== allShots.length) {
    throw new Error(`Capturas idénticas detectadas (${hashes.size} de ${allShots.length}). Fallo de autenticidad visual.`);
  }

  console.log(`==> [H8.7 QA] Las ${hashes.size} capturas son auténticas y visualmente distintas.`);

  // Filtrar la solicitud sintética intencional de la prueba negativa
  const unauthorizedExternal = blockedExternalRequests.filter(
    (u) => !u.includes(NEGATIVE_TEST_HOST)
  );
  const finalMainBlocked = (await app.evaluate(() => globalThis.__BLOCKED_REQUESTS__ || [])).filter(
    (u) => !u.includes(NEGATIVE_TEST_HOST)
  );

  console.log(`==> [H8.7 QA Auditoría Red] Total peticiones interceptadas: ${interceptedUrls.length}`);
  console.log(`==> [H8.7 QA Auditoría Red] Peticiones externas no autorizadas: ${unauthorizedExternal.length + finalMainBlocked.length}`);

  if (unauthorizedExternal.length > 0 || finalMainBlocked.length > 0) {
    throw new Error(`FALLO OFFLINE: Se detectaron peticiones de red externas no autorizadas:\n${[...unauthorizedExternal, ...finalMainBlocked].join("\n")}`);
  }

  console.log("    ✓ Verificación offline estricta superada: 0 peticiones externas no autorizadas.");
  console.log("==> [H8.7 QA] SMOKE TEST Y AUDITORÍA COMPLETADOS CON ÉXITO (PASS TOTAL).");

} finally {
  await app.close();
  try {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  } catch {}
}
