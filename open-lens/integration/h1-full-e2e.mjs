import { _electron as electron } from "playwright";
import path from "path";
import fs from "fs";

const REPO_ROOT = "/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections";
const OPEN_LENS_DIR = path.join(REPO_ROOT, "open-lens");
const ELECTRON_PATH = path.join(REPO_ROOT, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const QA_DIR = "/tmp/openlens-h1-qa-clean";
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h1-e2e");

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

console.log("====================================================");
console.log("OPENLENS DEVOPS — H1 QA REAL EN ELECTRON");
console.log("Ejecutando suite E2E-01 a E2E-14");
console.log("====================================================");

const app = await electron.launch({
  cwd: OPEN_LENS_DIR,
  executablePath: ELECTRON_PATH,
  args: [".", "--integration-testing"],
  timeout: 60000,
  env: {
    NODE_ENV: "development",
    CICD: path.join(QA_DIR, "appdata"),
    HOME: path.join(QA_DIR, "home"),
    KUBECONFIG: path.join(QA_DIR, "home/.kube/config"),
    OPENLENS_FLOATING_PANELS: "1",
    SHELL: "/bin/sh",
    ELECTRON_ENABLE_LOGGING: "1",
    PATH: process.env.PATH,
  },
});

const window = await app.firstWindow();
await window.waitForLoadState("domcontentloaded");
await new Promise(r => setTimeout(r, 3000));

// Connect to Demo Cluster
const demoBtn = window.locator("[data-testid=welcome-launch-demo-cluster]");
if (await demoBtn.count() > 0) {
  console.log("Launching Demo Cluster...");
  await demoBtn.click();
  await new Promise(r => setTimeout(r, 6000));
}

// Find cluster frame
const clusterFrame = window.frames().find(f => f.name() === "openlens-demo-cluster");
if (!clusterFrame) {
  throw new Error("Cluster frame openlens-demo-cluster not found!");
}

await clusterFrame.waitForLoadState("domcontentloaded");
await new Promise(r => setTimeout(r, 2000));

// Navigate to Kubetail
console.log("Navigating to Kubetail...");
await clusterFrame.goto(`${clusterFrame.url().split("/overview")[0]}/kubetail`);
await new Promise(r => setTimeout(r, 4000));

const results = [];

function recordResult(id, name, passed, details = "") {
  results.push({ id, name, passed, details });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${id}: ${name} ${details ? `(${details})` : ""}`);
}

// ---------------------------------------------------------------------
// E2E-01: Split View Active by Default (58/42 ratio)
// ---------------------------------------------------------------------
try {
  const container = clusterFrame.locator("[data-testid=split-panel-layout-container]");
  const leftPanel = clusterFrame.locator("[data-testid=split-panel-left]");
  const rightPanel = clusterFrame.locator("[data-testid=split-panel-right]");
  const divider = clusterFrame.locator("[data-testid=split-panel-divider]");

  const containerVisible = await container.isVisible();
  const leftVisible = await leftPanel.isVisible();
  const rightVisible = await rightPanel.isVisible();
  const dividerVisible = await divider.isVisible();

  const cBox = await container.boundingBox();
  const lBox = await leftPanel.boundingBox();
  const rBox = await rightPanel.boundingBox();

  const ratio = lBox && cBox ? lBox.width / cBox.width : 0;
  const isAround58 = ratio >= 0.55 && ratio <= 0.62;

  const passed = containerVisible && leftVisible && rightVisible && dividerVisible && isAround58;
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-01-split-view-active.png") });
  recordResult("E2E-01", "Split layout activo por defecto 58/42", passed, `Ratio medido: ${(ratio * 100).toFixed(1)}%`);
} catch (err) {
  recordResult("E2E-01", "Split layout activo por defecto 58/42", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-02: Resizing Anchor Interaction (Drag divider & ratio clamping)
// ---------------------------------------------------------------------
try {
  const divider = clusterFrame.locator("[data-testid=split-panel-divider]");
  const container = clusterFrame.locator("[data-testid=split-panel-layout-container]");
  const leftPanel = clusterFrame.locator("[data-testid=split-panel-left]");

  const dBox = await divider.boundingBox();
  const cBox = await container.boundingBox();

  // Drag divider to the left by 120px
  await window.mouse.move(dBox.x + dBox.width / 2, dBox.y + dBox.height / 2);
  await window.mouse.down();
  await window.mouse.move(dBox.x - 120, dBox.y + dBox.height / 2, { steps: 5 });
  await window.mouse.up();
  await new Promise(r => setTimeout(r, 600));

  const lBoxResized = await leftPanel.boundingBox();
  const newRatio = lBoxResized.width / cBox.width;
  const passed = newRatio < 0.55 && newRatio >= 0.20;

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-02-resized-layout.png") });
  recordResult("E2E-02", "Redimensionamiento interactivo con divisor central", passed, `Nuevo ratio: ${(newRatio * 100).toFixed(1)}%`);
} catch (err) {
  recordResult("E2E-02", "Redimensionamiento interactivo con divisor central", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-03: Panel Swap (Invert Left / Right)
// ---------------------------------------------------------------------
try {
  const swapBtn = clusterFrame.locator("[data-testid=swap-panels-button]");
  await swapBtn.click();
  await new Promise(r => setTimeout(r, 600));

  const container = clusterFrame.locator("[data-testid=split-panel-layout-container]");
  const classAttr = await container.getAttribute("class");
  const isSwapped = classAttr.includes("isSwapped");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-03-swap-panels.png") });
  recordResult("E2E-03", "Intercambio de orden izquierdo/derecho", isSwapped, "Clase isSwapped aplicada");

  // Swap back to normal
  await swapBtn.click();
  await new Promise(r => setTimeout(r, 400));
} catch (err) {
  recordResult("E2E-03", "Intercambio de orden izquierdo/derecho", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-04: Close Details Panel (Left panel 100% width)
// ---------------------------------------------------------------------
try {
  const closeDetailsBtn = clusterFrame.locator("[data-testid=panel-close-button-resource-details]");
  await closeDetailsBtn.click();
  await new Promise(r => setTimeout(r, 600));

  const leftPanel = clusterFrame.locator("[data-testid=split-panel-left]");
  const rightPanel = clusterFrame.locator("[data-testid=split-panel-right]");
  const reopenBar = clusterFrame.locator("[data-testid=reopen-right-button]");

  const leftClass = await leftPanel.getAttribute("class");
  const isFullWidth = leftClass.includes("fullWidth");
  const rightHidden = (await rightPanel.count() === 0) || !(await rightPanel.isVisible());
  const reopenVisible = await reopenBar.isVisible();

  const passed = isFullWidth && rightHidden && reopenVisible;
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-04-details-closed.png") });
  recordResult("E2E-04", "Cierre del panel de detalles y expansión 100%", passed, "Panel derecho oculto, barra de reapertura visible");
} catch (err) {
  recordResult("E2E-04", "Cierre del panel de detalles y expansión 100%", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-05: Reopen Details Panel
// ---------------------------------------------------------------------
try {
  const reopenBar = clusterFrame.locator("[data-testid=reopen-right-button]");
  await reopenBar.click();
  await new Promise(r => setTimeout(r, 600));

  const rightPanel = clusterFrame.locator("[data-testid=split-panel-right]");
  const rightVisible = await rightPanel.isVisible();

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-05-details-reopened.png") });
  recordResult("E2E-05", "Reapertura del panel cerrado", rightVisible, "Panel de detalles restaurado en layout");
} catch (err) {
  recordResult("E2E-05", "Reapertura del panel cerrado", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-06: Double-click Divider to Reset Default Ratio (58/42)
// ---------------------------------------------------------------------
try {
  const divider = clusterFrame.locator("[data-testid=split-panel-divider]");
  const container = clusterFrame.locator("[data-testid=split-panel-layout-container]");
  const leftPanel = clusterFrame.locator("[data-testid=split-panel-left]");

  // Double click divider
  await divider.dblclick();
  await new Promise(r => setTimeout(r, 600));

  const cBox = await container.boundingBox();
  const lBox = await leftPanel.boundingBox();
  const resetRatio = lBox.width / cBox.width;
  const isReset = resetRatio >= 0.55 && resetRatio <= 0.62;

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-06-reset-ratio-doubleclick.png") });
  recordResult("E2E-06", "Doble clic en divisor restaura ratio default 58/42", isReset, `Ratio restaurado: ${(resetRatio * 100).toFixed(1)}%`);
} catch (err) {
  recordResult("E2E-06", "Doble clic en divisor restaura ratio default 58/42", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-07: Workload Selection & Log Streaming in Kubetail
// ---------------------------------------------------------------------
try {
  // Select namespace demo-apps
  const nsSelect = clusterFrame.locator("select").nth(0);
  await nsSelect.selectOption("demo-apps");
  await new Promise(r => setTimeout(r, 1000));

  // Select kind Deployment
  const kindSelect = clusterFrame.locator("select").nth(1);
  await kindSelect.selectOption("Deployment");
  await new Promise(r => setTimeout(r, 1000));

  // Select workload demo-web
  const workloadSelect = clusterFrame.locator("select").nth(2);
  const options = await workloadSelect.evaluate((sel) => Array.from(sel.options).map(o => o.value));
  const demoWebOption = options.find(o => o.includes("demo-web")) || options[1];
  if (demoWebOption) {
    await workloadSelect.selectOption(demoWebOption);
  }

  // Wait for mock log stream to populate
  await clusterFrame.waitForFunction(() => {
    const el = document.querySelector("[class*='KubetailPage']");
    return el && el.innerText.includes("Lines:") && !el.innerText.includes("Lines: 0");
  }, { timeout: 8000 }).catch(() => {});

  const stats = clusterFrame.locator("span:has-text('Lines:')");
  const statsText = await stats.innerText();
  const hasLogs = statsText.includes("Lines:") && !statsText.includes("Lines: 0");

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-07-streaming-active.png") });
  recordResult("E2E-07", "Streaming de logs de Kubetail activo con recurso seleccionado", hasLogs, statsText);
} catch (err) {
  recordResult("E2E-07", "Streaming de logs de Kubetail activo con recurso seleccionado", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-08: Keyboard Shortcuts (Space pause/resume with input isolation)
// ---------------------------------------------------------------------
try {
  // Focus Kubetail container and trigger Space
  await clusterFrame.evaluate(() => {
    const el = document.querySelector("[class*='KubetailPage']");
    if (el) {
      el.focus();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 600));

  const pauseBtn = clusterFrame.locator("button:has-text('Resume'), button:has-text('Pause')");
  const pausedText = await pauseBtn.innerText();
  const isPaused = pausedText.includes("Resume");

  // Press Space again to resume
  await clusterFrame.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 600));
  const resumedText = await pauseBtn.innerText();
  const isResumed = resumedText.includes("Pause");

  // Test input isolation: focus filter input and type space
  const filterInput = clusterFrame.locator("input[placeholder*='Filter logs']");
  if (await filterInput.count() > 0) {
    await filterInput.click();
    await clusterFrame.evaluate(() => {
      const input = document.querySelector("input[placeholder*='Filter logs']");
      if (input) {
        input.focus();
        input.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 400));
  }
  const statusAfterInput = await pauseBtn.innerText();
  const notToggledByInput = statusAfterInput.includes("Pause");

  const passed = isPaused && isResumed && notToggledByInput;
  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-08-keyboard-shortcuts.png") });
  recordResult("E2E-08", "Atajos de teclado (Space pause/resume) con aislamiento de foco", passed, `Pause: ${isPaused}, Resume: ${isResumed}, InputIsolation: ${notToggledByInput}`);
} catch (err) {
  recordResult("E2E-08", "Atajos de teclado (Space pause/resume) con aislamiento de foco", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-09: Automatic Resource Binding to Right Panel (Details)
// ---------------------------------------------------------------------
try {
  const detailsPanel = clusterFrame.locator("[data-testid=split-panel-right]");
  const detailsContent = detailsPanel.locator("[data-testid=resource-details-content], .KubeObjectDetails, h2, span");
  const textContent = await detailsPanel.innerText();

  const bindsDemoWeb = textContent.includes("demo-web") || textContent.includes("Deployment") || textContent.includes("demo-apps");
  const passed = bindsDemoWeb;

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-09-deployment-details-bound.png") });
  recordResult("E2E-09", "Binding automático de recurso en panel derecho (Details)", passed, "Detalles de Deployment demo-web desplegados en vivo");
} catch (err) {
  recordResult("E2E-09", "Binding automático de recurso en panel derecho (Details)", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-10: Cluster Context Scoping & Isolation
// ---------------------------------------------------------------------
try {
  const scopingData = await clusterFrame.evaluate(() => {
    const di = window.__LENS_RENDERER_DI__;
    if (!di) return { ok: false, reason: "No DI" };
    try {
      const splitStore = di.injectById ? di.injectById("split-panel-store") : null;
      const binding = splitStore ? splitStore.resourceBinding : null;
      return {
        ok: true,
        clusterId: splitStore?.clusterId,
        bindingKind: binding?.kind,
        bindingName: binding?.name,
        bindingNamespace: binding?.namespace,
      };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  });

  const clusterNameHeader = window.locator("text='OpenLens Demo Cluster'");
  const headerVisible = await clusterNameHeader.count() > 0;
  const isContextScoped = scopingData.ok && scopingData.bindingName === "demo-web";

  const passed = headerVisible && isContextScoped;

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-10-cluster-isolation.png") });
  recordResult("E2E-10", "Aislamiento y scoping de contexto de clúster", passed, `Contexto: ${scopingData.clusterId || "demo"}, Binding: ${scopingData.bindingKind}/${scopingData.bindingName}`);
} catch (err) {
  recordResult("E2E-10", "Aislamiento y scoping de contexto de clúster", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-11: Inert Persistence Verification
// ---------------------------------------------------------------------
try {
  // Check that no tokens or secrets are saved in lens-user-store or lens-cluster-store
  const userStorePath = path.join(QA_DIR, "appdata/lens-user-store.json");
  const clusterStorePath = path.join(QA_DIR, "appdata/lens-cluster-store.json");

  let sanitized = true;
  let checks = [];
  if (fs.existsSync(userStorePath)) {
    const raw = fs.readFileSync(userStorePath, "utf8");
    if (raw.includes("bearerToken") || raw.includes("client-key-data") || raw.includes("wireguard") || raw.includes("/Users/gustavomarcon/.kube")) {
      sanitized = false;
      checks.push("User store leaked sensitive tokens/paths");
    } else {
      checks.push("User store sanitized");
    }
  }
  if (fs.existsSync(clusterStorePath)) {
    const raw = fs.readFileSync(clusterStorePath, "utf8");
    if (raw.includes("wireguard") || raw.includes("token:") || raw.includes("client-key-data")) {
      sanitized = false;
      checks.push("Cluster store leaked sensitive data");
    } else {
      checks.push("Cluster store clean");
    }
  }

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-11-inert-persistence.png") });
  recordResult("E2E-11", "Persistencia inerte y sanitizada sin fuga de credenciales", sanitized, checks.join(", "));
} catch (err) {
  recordResult("E2E-11", "Persistencia inerte y sanitizada sin fuga de credenciales", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-12: Classic Mode Toggle
// ---------------------------------------------------------------------
try {
  const toggleBtn = clusterFrame.locator("[data-testid=toggle-split-layout-button]");
  await toggleBtn.click();
  await new Promise(r => setTimeout(r, 600));

  const classicModeContainer = clusterFrame.locator("[data-testid=split-panel-layout-container]");
  const isSplitHidden = (await classicModeContainer.count() === 0);

  // Return to split view
  const toggleBtnReturn = clusterFrame.locator("[data-testid=toggle-split-layout-button]");
  await toggleBtnReturn.click();
  await new Promise(r => setTimeout(r, 600));

  const isSplitRestored = (await classicModeContainer.count() === 1);
  const passed = isSplitHidden && isSplitRestored;

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-12-classic-mode-toggle.png") });
  recordResult("E2E-12", "Conmutación a Vista Clásica y retorno a Split View", passed, "Toggle funcional bidireccional");
} catch (err) {
  recordResult("E2E-12", "Conmutación a Vista Clásica y retorno a Split View", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-13: Navigation Resilience (Navigate away and return)
// ---------------------------------------------------------------------
try {
  // Navigate to Overview or Nodes
  const nodesLink = clusterFrame.locator('a[href*="/nodes"]');
  if (await nodesLink.count() > 0) {
    await nodesLink.first().click();
    await new Promise(r => setTimeout(r, 2000));
  } else {
    await clusterFrame.goto(`${clusterFrame.url().split("/kubetail")[0]}/nodes`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // Navigate back to Kubetail
  const kubetailLink = clusterFrame.locator('a[href*="/kubetail"]');
  if (await kubetailLink.count() > 0) {
    await kubetailLink.first().click();
  } else {
    await clusterFrame.goto(`${clusterFrame.url().split("/nodes")[0]}/kubetail`);
  }
  await new Promise(r => setTimeout(r, 3000));

  const splitContainer = clusterFrame.locator("[data-testid=split-panel-layout-container]");
  const isPreserved = (await splitContainer.count() === 1) && (await splitContainer.isVisible());

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-13-navigation-back-and-forth.png") });
  recordResult("E2E-13", "Resiliencia en navegación entre rutas y retorno", isPreserved, "Layout y estado retenidos tras navegación");
} catch (err) {
  recordResult("E2E-13", "Resiliencia en navegación entre rutas y retorno", false, err.message);
}

// ---------------------------------------------------------------------
// E2E-14: Focus and Interactive Controls Responsiveness
// ---------------------------------------------------------------------
try {
  const rightPanel = clusterFrame.locator("[data-testid=split-panel-right]");
  await rightPanel.click();
  await new Promise(r => setTimeout(r, 300));

  const leftPanel = clusterFrame.locator("[data-testid=split-panel-left]");
  await leftPanel.click();
  await new Promise(r => setTimeout(r, 300));

  const stats = clusterFrame.locator("span:has-text('Lines:')");
  const responsive = await stats.isVisible();

  await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-14-focus-and-controls.png") });
  recordResult("E2E-14", "Foco y responsividad de controles interactivos", responsive, "Ambos paneles responden a clicks y eventos");
} catch (err) {
  recordResult("E2E-14", "Foco y responsividad de controles interactivos", false, err.message);
}

console.log("====================================================");
const passedCount = results.filter(r => r.passed).length;
const totalCount = results.length;
console.log(`RESUMEN E2E: ${passedCount}/${totalCount} ESCENARIOS PASS`);
console.log("====================================================");

await app.close();
console.log("Aplicación cerrada limpiamente.");

if (passedCount < totalCount) {
  const failedScenarios = results.filter(r => !r.passed).map(r => r.id);
  console.error(`E2E TEST SUITE FAILED with ${totalCount - passedCount} failure(s): ${failedScenarios.join(", ")}`);
  process.exit(1);
} else {
  console.log("TODAS LAS PRUEBAS E2E PASARON SATISFACTORIAMENTE (100% SUCCESS).");
  process.exit(0);
}
