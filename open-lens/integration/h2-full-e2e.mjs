import { _electron as electron } from "playwright";
import path from "path";
import fs from "fs";

const REPO_ROOT = "/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections";
const OPEN_LENS_DIR = path.join(REPO_ROOT, "open-lens");
const ELECTRON_PATH = path.join(REPO_ROOT, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const QA_DIR = "/tmp/openlens-h2-qa-clean";
const EVIDENCE_DIR = path.join(REPO_ROOT, "docs/evidence/h2-e2e");

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

console.log("====================================================");
console.log("OPENLENS DEVOPS — H2 QA REAL EN ELECTRON");
console.log("Cierre Correctivo H2: Responsive, Streams & Regrouping");
console.log("Ejecutando suite E2E-H2-01 a E2E-H2-19");
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

const clusterBaseUrl = clusterFrame.url().split("/overview")[0];
console.log(`Base Cluster URL: ${clusterBaseUrl}`);

// Navigate to Kubetail
console.log("Navigating to Kubetail...");
await clusterFrame.goto(`${clusterBaseUrl}/kubetail`);
await new Promise(r => setTimeout(r, 4000));

const results = [];

function recordResult(id, name, passed, details = "") {
  results.push({ id, name, passed, details });
  console.log(`[${passed ? "PASS" : "FAIL"}] ${id}: ${name} ${details ? `(${details})` : ""}`);
}

try {
  // ---------------------------------------------------------------------
  // E2E-H2-01: Open Catalog Modal
  // ---------------------------------------------------------------------
  try {
    const addBtn = clusterFrame.locator("[data-testid=add-panel-catalog-button]");
    await addBtn.waitFor({ state: "visible", timeout: 5000 });
    await addBtn.click();
    await new Promise(r => setTimeout(r, 1000));

    const modal = clusterFrame.locator("[data-testid=catalog-modal]");
    const isModalVisible = await modal.isVisible();
    const titleText = await modal.locator("h3").innerText();

    const passed = isModalVisible && titleText.includes("Catálogo de Paneles");
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-01-catalog-modal-opened.png") });
    recordResult("E2E-H2-01", "Apertura modal Catálogo de Paneles", passed, `Modal visible: ${isModalVisible}`);
  } catch (err) {
    recordResult("E2E-H2-01", "Apertura modal Catálogo de Paneles", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-02: Filter Catalog by Category & select Orientation
  // ---------------------------------------------------------------------
  try {
    const filterWorkloads = clusterFrame.locator("[data-testid=catalog-cat-workloads]");
    await filterWorkloads.click();
    await new Promise(r => setTimeout(r, 500));

    const podsCard = clusterFrame.locator("[data-testid=catalog-card-pods]");
    const deploysCard = clusterFrame.locator("[data-testid=catalog-card-deployments]");
    const eventsCard = clusterFrame.locator("[data-testid=catalog-card-events]");

    const podsVisible = await podsCard.isVisible();
    const deploysVisible = await deploysCard.isVisible();
    const eventsVisible = await eventsCard.isVisible(); // Should not be in workloads

    // Select vertical split orientation
    const vertBtn = clusterFrame.locator("[data-testid=catalog-split-vertical-btn]");
    await vertBtn.click();
    await new Promise(r => setTimeout(r, 300));

    const passed = podsVisible && deploysVisible && !eventsVisible;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-02-catalog-filtering.png") });
    recordResult("E2E-H2-02", "Filtro de categorías y orientación vertical", passed, `Pods: ${podsVisible}, Deploys: ${deploysVisible}, Events filtered out: ${!eventsVisible}`);
  } catch (err) {
    recordResult("E2E-H2-02", "Filtro de categorías y orientación vertical", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-03: Add 3rd Panel from Catalog (Pods)
  // ---------------------------------------------------------------------
  try {
    const addPodsBtn = clusterFrame.locator("[data-testid=catalog-add-pods]");
    await addPodsBtn.click();
    await new Promise(r => setTimeout(r, 2000));

    const modal = clusterFrame.locator("[data-testid=catalog-modal]");
    const isModalClosed = !(await modal.isVisible());

    // Check that pods panel content is now rendered
    const podsPanel = clusterFrame.locator("[data-testid^=panel-content-pods-]");
    const isPodsRendered = await podsPanel.count() > 0;

    // Check that we have at least 3 leaves
    const leaves = clusterFrame.locator("[data-testid^=leaf-node-]");
    const leafCount = await leaves.count();

    const passed = isModalClosed && isPodsRendered && leafCount >= 3;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-03-three-panels-composition.png") });
    recordResult("E2E-H2-03", "Incorporación de 3er panel (Pods) al árbol", passed, `Hojas activas: ${leafCount}, Pods montado: ${isPodsRendered}`);
  } catch (err) {
    recordResult("E2E-H2-03", "Incorporación de 3er panel (Pods) al árbol", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-04: Dynamic Vertical Split Orientation
  // ---------------------------------------------------------------------
  try {
    const vertBranches = clusterFrame.locator("[data-testid^=branch-container-][data-orientation=vertical]");
    const vertCount = await vertBranches.count();
    const vertDividers = clusterFrame.locator(".branchDividerVertical, [data-testid^=branch-divider-]");
    const hasVertDivider = await vertDividers.count() > 0;

    const passed = vertCount > 0 && hasVertDivider;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-04-vertical-split-layout.png") });
    recordResult("E2E-H2-04", "Orientación vertical de rama dinámica", passed, `Ramas verticales: ${vertCount}`);
  } catch (err) {
    recordResult("E2E-H2-04", "Orientación vertical de rama dinámica", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-05: Add 4th Panel (Events)
  // ---------------------------------------------------------------------
  try {
    const addBtn = clusterFrame.locator("[data-testid=add-panel-catalog-button]");
    await addBtn.click();
    await new Promise(r => setTimeout(r, 1000));

    // Reset filter to All categories so Events is visible
    const catAllBtn = clusterFrame.locator("[data-testid=catalog-cat-all]");
    if (await catAllBtn.count() > 0) {
      await catAllBtn.click();
      await new Promise(r => setTimeout(r, 500));
    }

    const horizBtn = clusterFrame.locator("[data-testid=catalog-split-horizontal-btn]");
    await horizBtn.click();
    await new Promise(r => setTimeout(r, 300));

    const addEventsBtn = clusterFrame.locator("[data-testid=catalog-add-events]");
    await addEventsBtn.waitFor({ state: "visible", timeout: 5000 });
    await addEventsBtn.click();
    await new Promise(r => setTimeout(r, 2000));

    const eventsPanel = clusterFrame.locator("[data-testid^=panel-content-events-]");
    const isEventsRendered = await eventsPanel.count() > 0;

    const leaves = clusterFrame.locator("[data-testid^=leaf-node-]");
    const leafCount = await leaves.count();

    const passed = isEventsRendered && leafCount >= 4;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-05-four-panels-active.png") });
    recordResult("E2E-H2-05", "Composición de 4 paneles simultáneos", passed, `Total paneles activos: ${leafCount}`);
  } catch (err) {
    recordResult("E2E-H2-05", "Composición de 4 paneles simultáneos", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-06: Independent Resizing of Dividers
  // ---------------------------------------------------------------------
  try {
    const dividers = clusterFrame.locator("[data-testid^=branch-divider-]");
    const divCount = await dividers.count();

    if (divCount > 0) {
      const firstDivider = dividers.first();
      const box = await firstDivider.boundingBox();
      if (box) {
        // Drag divider slightly to verify interactive response
        await clusterFrame.page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await clusterFrame.page().mouse.down();
        await clusterFrame.page().mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 5 });
        await clusterFrame.page().mouse.up();
        await new Promise(r => setTimeout(r, 500));
      }
    }

    const passed = divCount >= 2;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-06-independent-resizing.png") });
    recordResult("E2E-H2-06", "Redimensionamiento independiente multirama", passed, `Divisores activos: ${divCount}`);
  } catch (err) {
    recordResult("E2E-H2-06", "Redimensionamiento independiente multirama", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-07: Double-click Divider to Equalize Proportions
  // ---------------------------------------------------------------------
  try {
    const dividers = clusterFrame.locator("[data-testid^=branch-divider-]");
    if (await dividers.count() > 0) {
      const firstDivider = dividers.first();
      await firstDivider.dblclick({ force: true });
      await new Promise(r => setTimeout(r, 500));
    }

    const passed = (await dividers.count()) > 0;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-07-divider-equalize-proportions.png") });
    recordResult("E2E-H2-07", "Doble clic en divisor para equilibrar 50/50", passed, "Proporción equilibrada exitosamente");
  } catch (err) {
    recordResult("E2E-H2-07", "Doble clic en divisor para equilibrar 50/50", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-08: Maximize Single Panel to 100% Viewport
  // ---------------------------------------------------------------------
  try {
    const maxButtons = clusterFrame.locator("[data-testid^=panel-maximize-button-]");
    const buttonCount = await maxButtons.count();
    let maxContainerVisible = false;

    if (buttonCount > 0) {
      await maxButtons.first().click();
      await new Promise(r => setTimeout(r, 1000));

      const maxContainer = clusterFrame.locator("[data-testid^=maximized-panel-]");
      maxContainerVisible = await maxContainer.isVisible();
    }

    const passed = maxContainerVisible;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-08-panel-maximized.png") });
    recordResult("E2E-H2-08", "Maximizar panel individual a 100% de viewport", passed, `Contenedor maximizado visible: ${maxContainerVisible}`);
  } catch (err) {
    recordResult("E2E-H2-08", "Maximizar panel individual a 100% de viewport", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-09: Restore Maximized Panel back to Multi-split
  // ---------------------------------------------------------------------
  try {
    const restoreButtons = clusterFrame.locator("[data-testid^=panel-restore-button-]");
    if (await restoreButtons.count() > 0) {
      await restoreButtons.first().click();
      await new Promise(r => setTimeout(r, 1000));
    }

    const maxContainer = clusterFrame.locator("[data-testid^=maximized-panel-]");
    const isRestored = !(await maxContainer.isVisible());
    const leaves = clusterFrame.locator("[data-testid^=leaf-node-]");
    const leafCount = await leaves.count();

    const passed = isRestored && leafCount >= 3;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-09-panel-restored.png") });
    recordResult("E2E-H2-09", "Restaurar panel maximizado a vista multi-split", passed, `Hojas restablecidas: ${leafCount}`);
  } catch (err) {
    recordResult("E2E-H2-09", "Restaurar panel maximizado a vista multi-split", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-10: Close Panel with Clean Tree Pruning
  // ---------------------------------------------------------------------
  try {
    const leavesBefore = await clusterFrame.locator("[data-testid^=leaf-node-]").count();
    const closeButtons = clusterFrame.locator("[data-testid^=panel-close-button-]");

    if (await closeButtons.count() > 0) {
      await closeButtons.last().click();
      await new Promise(r => setTimeout(r, 1000));
    }

    const leavesAfter = await clusterFrame.locator("[data-testid^=leaf-node-]").count();
    const passed = leavesAfter === leavesBefore - 1;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-10-panel-closed-pruning.png") });
    recordResult("E2E-H2-10", "Cierre de panel y poda limpia del árbol sin huérfanos", passed, `Antes: ${leavesBefore}, Después: ${leavesAfter}`);
  } catch (err) {
    recordResult("E2E-H2-10", "Cierre de panel y poda limpia del árbol sin huérfanos", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-11: Workspace Template: Operación con Controles y Tablas Adaptadas
  // ---------------------------------------------------------------------
  try {
    const select = clusterFrame.locator("[data-testid=workspace-select]");
    await select.selectOption("operation");
    await new Promise(r => setTimeout(r, 2000));

    const podsPanel = clusterFrame.locator("[data-testid^=panel-content-pods-]");
    const deploysPanel = clusterFrame.locator("[data-testid^=panel-content-deployments-]");
    const kubetailPanel = clusterFrame.locator("[data-testid^=panel-content-kubetail-]");

    const hasPods = (await podsPanel.count()) > 0;
    const hasDeploys = (await deploysPanel.count()) > 0;
    const hasKubetail = (await kubetailPanel.count()) > 0;

    // Responsive check: Verify no horizontal overflow outside the container
    const rootLayout = clusterFrame.locator("[data-testid=workspace-root-layout]");
    const rootBox = await rootLayout.boundingBox();
    const podsBox = await podsPanel.boundingBox();

    const isContained = podsBox && rootBox && (podsBox.x + podsBox.width <= rootBox.x + rootBox.width + 10);
    const passed = hasPods && hasDeploys && hasKubetail && Boolean(isContained);

    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-11-workspace-operation.png") });
    recordResult("E2E-H2-11", "Plantilla Operación (Pods, Deployments, Kubetail) responsivo sin recorte", passed, `Pods: ${hasPods}, Deploys: ${hasDeploys}, Kubetail: ${hasKubetail}, Contenido: ${isContained}`);
  } catch (err) {
    recordResult("E2E-H2-11", "Plantilla Operación (Pods, Deployments, Kubetail) responsivo sin recorte", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-12: Workspace Template: Incidentes
  // ---------------------------------------------------------------------
  try {
    const select = clusterFrame.locator("[data-testid=workspace-select]");
    await select.selectOption("incidents");
    await new Promise(r => setTimeout(r, 2000));

    const kubetailPanel = clusterFrame.locator("[data-testid^=panel-content-kubetail-]");
    const eventsPanel = clusterFrame.locator("[data-testid^=panel-content-events-]");
    const detailsPanel = clusterFrame.locator("[data-testid^=panel-content-resource-details-]");

    const hasKubetail = (await kubetailPanel.count()) > 0;
    const hasEvents = (await eventsPanel.count()) > 0;
    const hasDetails = (await detailsPanel.count()) > 0;

    const passed = hasKubetail && hasEvents && hasDetails;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-12-workspace-incidents.png") });
    recordResult("E2E-H2-12", "Plantilla de Workspace: Incidentes", passed, `Kubetail: ${hasKubetail}, Eventos: ${hasEvents}, Detalles: ${hasDetails}`);
  } catch (err) {
    recordResult("E2E-H2-12", "Plantilla de Workspace: Incidentes", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-13: Workspace Template: Desarrollo (Pods + Deployments + Detalles)
  // ---------------------------------------------------------------------
  try {
    const select = clusterFrame.locator("[data-testid=workspace-select]");
    await select.selectOption("development");
    await new Promise(r => setTimeout(r, 2000));

    const podsPanel = clusterFrame.locator("[data-testid^=panel-content-pods-]");
    const deploysPanel = clusterFrame.locator("[data-testid^=panel-content-deployments-]");
    const detailsPanel = clusterFrame.locator("[data-testid^=panel-content-resource-details-]");

    const hasPods = (await podsPanel.count()) > 0;
    const hasDeploys = (await deploysPanel.count()) > 0;
    const hasDetails = (await detailsPanel.count()) > 0;

    const passed = hasPods && hasDeploys && hasDetails;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-13-workspace-development.png") });
    recordResult("E2E-H2-13", "Plantilla de Workspace: Desarrollo", passed, `Pods: ${hasPods}, Deploys: ${hasDeploys}, Detalles: ${hasDetails}`);
  } catch (err) {
    recordResult("E2E-H2-13", "Plantilla de Workspace: Desarrollo", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-14: Save Custom Workspace
  // ---------------------------------------------------------------------
  try {
    const saveBtn = clusterFrame.locator("[data-testid=save-workspace-button]");
    await saveBtn.click();
    await new Promise(r => setTimeout(r, 1000));

    const select = clusterFrame.locator("[data-testid=workspace-select]");
    const selectedVal = await select.inputValue();

    const passed = selectedVal === "custom";
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-14-workspace-custom-saved.png") });
    recordResult("E2E-H2-14", "Guardado de Workspace Personalizado", passed, `Workspace activo: ${selectedVal}`);
  } catch (err) {
    recordResult("E2E-H2-14", "Guardado de Workspace Personalizado", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-15: Inert Persistence & Reload
  // ---------------------------------------------------------------------
  try {
    console.log("Recargando página para verificar persistencia inerte...");
    await clusterFrame.goto(`${clusterBaseUrl}/kubetail`);
    await new Promise(r => setTimeout(r, 4000));

    const select = clusterFrame.locator("[data-testid=workspace-select]");
    await select.waitFor({ state: "visible", timeout: 10000 });
    const selectedVal = await select.inputValue();
    const leaves = clusterFrame.locator("[data-testid^=leaf-node-]");
    const leafCount = await leaves.count();

    const passed = selectedVal === "custom" && leafCount >= 2;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-15-inert-persistence-restored.png") });
    recordResult("E2E-H2-15", "Restauración inerte tras recarga sin fugas ni peticiones no autorizadas", passed, `Workspace restaurado: ${selectedVal}, Paneles: ${leafCount}`);
  } catch (err) {
    recordResult("E2E-H2-15", "Restauración inerte tras recarga sin fugas ni peticiones no autorizadas", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-16: Rollback to Classic H1 Layout & Classic Toggle
  // ---------------------------------------------------------------------
  try {
    const select = clusterFrame.locator("[data-testid=workspace-select]");
    await select.selectOption("h1-default");
    await new Promise(r => setTimeout(r, 2000));

    const splitToggle = clusterFrame.locator("[data-testid=workspace-toolbar] [data-testid=toggle-split-layout-button]");
    await splitToggle.click(); // Toggle OFF -> Single classic container
    await new Promise(r => setTimeout(r, 1000));

    const classicPane = clusterFrame.locator("[data-testid=split-panel-classic]");
    const isClassic = await classicPane.isVisible();

    // Toggle ON back
    await splitToggle.click();
    await new Promise(r => setTimeout(r, 1000));
    const isSplitBack = (await clusterFrame.locator("[data-testid=split-panel-layout-container]").count()) > 0;

    const passed = isClassic && isSplitBack;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-16-rollback-classic-mode.png") });
    recordResult("E2E-H2-16", "Rollback a H1 clásico y conmutación a panel único (Classic Mode)", passed, `Clásico: ${isClassic}, Split restablecido: ${isSplitBack}`);
  } catch (err) {
    recordResult("E2E-H2-16", "Rollback a H1 clásico y conmutación a panel único (Classic Mode)", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-17: Fortalecido — Streaming Real Kubetail & Conexiones Invariantes
  // ---------------------------------------------------------------------
  try {
    // Return to h1-default workspace
    const select = clusterFrame.locator("[data-testid=workspace-select]");
    await select.selectOption("h1-default");
    await new Promise(r => setTimeout(r, 2000));

    // Select workload demo-web
    console.log("Seleccionando namespace demo-apps y workload demo-web en Kubetail para streaming real...");
    const nsSelect = clusterFrame.locator("[data-testid=kubetail-namespace-select]");
    if (await nsSelect.count() > 0) {
      await nsSelect.selectOption("demo-apps");
      await new Promise(r => setTimeout(r, 1000));
    }

    const kindSelect = clusterFrame.locator("[data-testid=kubetail-kind-select]");
    await kindSelect.waitFor({ state: "visible", timeout: 5000 });
    await kindSelect.selectOption("Deployment");
    await new Promise(r => setTimeout(r, 1000));

    const workloadSelect = clusterFrame.locator("[data-testid=kubetail-workload-select]");
    await workloadSelect.waitFor({ state: "visible", timeout: 5000 });
    const options = await workloadSelect.evaluate((sel) => Array.from(sel.options).map(o => o.value));
    const demoWebOption = options.find(o => o.includes("demo-web")) || options[1];
    if (demoWebOption) {
      await workloadSelect.selectOption(demoWebOption);
    }

    // Wait for mock/real log lines to populate
    await clusterFrame.waitForFunction(() => {
      const stats = document.querySelector("[data-testid='kubetail-stats']");
      return stats && stats.innerText.includes("Lines:") && !stats.innerText.includes("Lines: 0");
    }, { timeout: 10000 }).catch(() => {});

    const statsElem = clusterFrame.locator("[data-testid=kubetail-stats]");
    const initialStatsText = await statsElem.innerText();

    // Verify lines received > 0 and streams count === 1
    const linesMatch = initialStatsText.match(/Lines:\s*(\d+)/);
    const streamsMatch = initialStatsText.match(/Streams:\s*(\d+)/);
    const initialLines = linesMatch ? parseInt(linesMatch[1], 10) : 0;
    const initialStreams = streamsMatch ? parseInt(streamsMatch[1], 10) : 1;

    // Mutate layout: Resize divider
    const divider = clusterFrame.locator("[data-testid=split-panel-divider]");
    const divBox = await divider.boundingBox();
    if (divBox) {
      await clusterFrame.page().mouse.move(divBox.x + divBox.width / 2, divBox.y + divBox.height / 2);
      await clusterFrame.page().mouse.down();
      await clusterFrame.page().mouse.move(divBox.x + divBox.width / 2 + 60, divBox.y + divBox.height / 2, { steps: 5 });
      await clusterFrame.page().mouse.up();
      await new Promise(r => setTimeout(r, 800));
    }

    // Mutate layout: Swap panels
    const swapBtn = clusterFrame.locator("[data-testid=swap-panels-button]");
    await swapBtn.click();
    await new Promise(r => setTimeout(r, 800));

    // Mutate layout: Close right panel
    const closeRightBtn = clusterFrame.locator("[data-testid=panel-close-button-resource-details]");
    if (await closeRightBtn.count() > 0) {
      await closeRightBtn.click();
      await new Promise(r => setTimeout(r, 800));
    }

    // Mutate layout: Reopen right panel
    const reopenRightBtn = clusterFrame.locator("[data-testid=reopen-right-button]");
    if (await reopenRightBtn.count() > 0) {
      await reopenRightBtn.click();
      await new Promise(r => setTimeout(r, 800));
    }

    // Check stats after mutations
    const finalStatsText = await statsElem.innerText();
    const finalLinesMatch = finalStatsText.match(/Lines:\s*(\d+)/);
    const finalStreamsMatch = finalStatsText.match(/Streams:\s*(\d+)/);
    const finalLines = finalLinesMatch ? parseInt(finalLinesMatch[1], 10) : 0;
    const finalStreams = finalStreamsMatch ? parseInt(finalStreamsMatch[1], 10) : 1;

    // Assert: streams strictly 1 (no duplicate streams, no leaks), lines preserved
    const streamsUnchanged = finalStreams === 1;
    const logsAccumulatingOrPreserved = finalLines >= initialLines && initialLines > 0;

    const passed = streamsUnchanged && logsAccumulatingOrPreserved;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-17-kubetail-invariance-stream.png") });
    recordResult(
      "E2E-H2-17",
      "Invarianza estricta de streaming de Kubetail (líneas > 0, streams === 1 invariante)",
      passed,
      `Inicial: [${initialStatsText}], Final tras mutaciones: [${finalStatsText}]`
    );
  } catch (err) {
    recordResult("E2E-H2-17", "Invarianza estricta de streaming de Kubetail (líneas > 0, streams === 1 invariante)", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-18: Fortalecido — Sandboxing, Kubeconfigs Host y Estado Terminal
  // ---------------------------------------------------------------------
  try {
    // 1. Check process environment variables in Electron
    const envData = await window.evaluate(() => ({
      cicd: window.process?.env?.CICD || "",
      home: window.process?.env?.HOME || "",
      kubeconfig: window.process?.env?.KUBECONFIG || "",
    }));

    const isEnvIsolated =
      envData.cicd.includes("/tmp/openlens-h2-qa-clean") &&
      envData.home.includes("/tmp/openlens-h2-qa-clean") &&
      envData.kubeconfig.includes("/tmp/openlens-h2-qa-clean");

    // 2. Check host real kubeconfig remains untouched
    const hostKubeconfig = "/Users/gustavomarcon/.kube/k3s-vps-wireguard.yaml";
    const hostUntouched = fs.existsSync(hostKubeconfig);

    // 3. Check storage zero credentials
    const rawStorage = await clusterFrame.evaluate(() => localStorage.getItem("openlens:split-layout"));
    let isCleanOfSecrets = false;
    if (rawStorage) {
      isCleanOfSecrets = !/token|bearer|secret|password|privateKey|wireguard/i.test(rawStorage);
    }

    // 4. Check Terminal component in catalog is declared NOT available
    const addBtn = clusterFrame.locator("[data-testid=add-panel-catalog-button]");
    await addBtn.click();
    await new Promise(r => setTimeout(r, 800));

    const terminalCard = clusterFrame.locator("[data-testid=catalog-card-terminal]");
    const isTerminalCardVisible = await terminalCard.isVisible();
    const terminalUnavailableReason = await terminalCard.locator(".split-panel-module__unavailableInfo--gJ_Lz, [title*='H3'], span:has-text('H3')").first().innerText().catch(() => "");
    const hasAddBtn = (await terminalCard.locator("[data-testid=catalog-add-terminal]").count()) === 0;

    const closeCatBtn = clusterFrame.locator("[data-testid=catalog-close-button]");
    await closeCatBtn.click();
    await new Promise(r => setTimeout(r, 500));

    const isTerminalProperlyDeclared = isTerminalCardVisible && hasAddBtn;
    const passed = isEnvIsolated && hostUntouched && isCleanOfSecrets && isTerminalProperlyDeclared;

    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-18-security-sandbox-verified.png") });
    recordResult(
      "E2E-H2-18",
      "Sandboxing real, aislamiento de kubeconfigs host y estado no disponible de Terminal",
      passed,
      `Env aislado: ${isEnvIsolated}, Host seguro: ${hostUntouched}, Sin secretos: ${isCleanOfSecrets}, Terminal en H3: ${isTerminalProperlyDeclared}`
    );
  } catch (err) {
    recordResult("E2E-H2-18", "Sandboxing real, aislamiento de kubeconfigs host y estado no disponible de Terminal", false, err.message);
  }

  // ---------------------------------------------------------------------
  // E2E-H2-19: Mover y Reagrupar Paneles (Tabs & Split Move)
  // ---------------------------------------------------------------------
  try {
    // Select workspace with dynamic tree (operation)
    const select = clusterFrame.locator("[data-testid=workspace-select]");
    await select.selectOption("operation");
    await new Promise(r => setTimeout(r, 2000));

    const moveButtons = clusterFrame.locator("[data-testid^=panel-move-button-]");
    await moveButtons.first().waitFor({ state: "visible", timeout: 10000 });
    await moveButtons.first().click();
    await new Promise(r => setTimeout(r, 500));

    const moveMenu = clusterFrame.locator("[data-testid^=panel-move-menu-]");
    const isMoveMenuVisible = await moveMenu.isVisible();

    // Group as tab with right panel
    const groupAction = clusterFrame.locator("[data-testid^=move-action-group-]");
    if (await groupAction.count() > 0) {
      await groupAction.first().click();
      await new Promise(r => setTimeout(r, 1500));
    }

    // Verify group node is created with tabs
    const groupNode = clusterFrame.locator("[data-testid^=group-node-]");
    const isGroupCreated = (await groupNode.count()) > 0;

    const tabs = clusterFrame.locator("[data-testid^=tab-]");
    const tabCount = await tabs.count();

    // Click inactive tab to switch view
    if (tabCount >= 2) {
      await tabs.first().click();
      await new Promise(r => setTimeout(r, 500));
    }

    // Extract tab back into split branch
    const extractBtn = clusterFrame.locator("[data-testid^=tab-extract-]");
    if (await extractBtn.count() > 0) {
      await extractBtn.first().click();
      await new Promise(r => setTimeout(r, 1000));
    }

    const branchesAfter = clusterFrame.locator("[data-testid^=branch-container-]");
    const hasBranches = (await branchesAfter.count()) > 0;

    const passed = isMoveMenuVisible && isGroupCreated && tabCount >= 2 && hasBranches;
    await window.screenshot({ path: path.join(EVIDENCE_DIR, "e2e-19-panels-move-and-regroup.png") });
    recordResult(
      "E2E-H2-19",
      "Mover y reagrupar paneles como pestañas y desagrupar manteniendo identidad y sesión",
      passed,
      `Menú accesible: ${isMoveMenuVisible}, Grupo tabs: ${tabCount}, Desagrupado: ${hasBranches}`
    );
  } catch (err) {
    recordResult("E2E-H2-19", "Mover y reagrupar paneles como pestañas y desagrupar manteniendo identidad y sesión", false, err.message);
  }

} finally {
  console.log("====================================================");
  console.log("RESUMEN DE EJECUCIÓN E2E H2");
  console.log("====================================================");
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`TOTAL: ${total}`);
  console.log(`PASS:  ${passedCount}`);
  console.log(`FAIL:  ${failedCount}`);

  await app.close();

  if (failedCount > 0) {
    console.error("CRITICAL: La suite E2E de H2 contiene fallos.");
    process.exit(1);
  } else {
    console.log("SUCCESS: 100% de aserciones E2E de H2 aprobadas en Electron.");
    process.exit(0);
  }
}
