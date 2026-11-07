// H7 global docking — end-to-end QA on the real Electron app with Playwright.
// Usage (from open-lens/):  node integration/h7-docking-e2e.mjs
// Interactions use page.mouse / page.keyboard / locator.click only. Store state is never mutated
// directly; the synthetic Kubernetes API counters are read to verify watches.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";
import {
  REPO_ROOT, QA_PROFILE, WATCH_PATHS, ELECTRON_PATH, OPEN_LENS_DIR, above, activateCluster, clusterFrame, describeLayout, dragHeader, dropZone,
  control, header, leftOf, navigate, panelHeader, restoreChip, openClusterFromCatalog, panel, panelRects, pointIn, reloadFrame, setFlag, sleep,
  startEnvironment, tab, waitForClusterFrame, watchCount, FLAG_KEY,
} from "./h7/harness.mjs";

const CLUSTER_A = process.env.H7_CLUSTER_A ?? "bcf6e5e75270d785e9c003028c536bb2"; // context h7-synthetic
const CLUSTER_B_NAME = "h7-synthetic-b";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const ARTIFACTS = process.env.H7_QA_ARTIFACTS ?? path.join(os.homedir(), "Documents/lens/qa-artifacts/h7-playwright", stamp);
// Screenshots and results of a run live in its own artifacts folder. docs/evidence/** is versioned history:
// the suite never writes there; representative images are copied by hand (see docs/H7_QA_PLAYWRIGHT_ELECTRON.md).
const EVIDENCE_ROOT = path.join(ARTIFACTS, "evidence");
const historicalEvidence = () => {
  try {
    return execSync("git status --porcelain --untracked-files=no -- docs/evidence", { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n").filter(Boolean).sort();
  } catch { return []; }
};
const historicalEvidenceBefore = historicalEvidence();
const EVIDENCE = path.join(EVIDENCE_ROOT, "h7-qa");
const EVIDENCE_H74 = path.join(EVIDENCE_ROOT, "h7-4");
const EVIDENCE_H75 = path.join(EVIDENCE_ROOT, "h7-5");
const EVIDENCE_H761 = path.join(EVIDENCE_ROOT, "h7-6-1");
const EVIDENCE_H762 = path.join(EVIDENCE_ROOT, "h7-6-2");
const EVIDENCE_H763 = path.join(EVIDENCE_ROOT, "h7-6-3");
const EVIDENCE_H763B = path.join(EVIDENCE_ROOT, "h7-6-3b");
const EVIDENCE_H763C = path.join(EVIDENCE_ROOT, "h7-6-3c");
const EVIDENCE_H763D = path.join(EVIDENCE_ROOT, "h7-6-3d");
const EVIDENCE_H764 = path.join(EVIDENCE_ROOT, "h7-6-4");
const EVIDENCE_H77 = path.join(EVIDENCE_ROOT, "h7-7");
const TEST_TIMEOUT = 150_000;

fs.mkdirSync(path.join(ARTIFACTS, "screenshots"), { recursive: true });
fs.mkdirSync(path.join(ARTIFACTS, "traces"), { recursive: true });
fs.mkdirSync(EVIDENCE, { recursive: true });
fs.mkdirSync(EVIDENCE_H74, { recursive: true });
fs.mkdirSync(EVIDENCE_H75, { recursive: true });
fs.mkdirSync(EVIDENCE_H761, { recursive: true });
fs.mkdirSync(EVIDENCE_H762, { recursive: true });
fs.mkdirSync(EVIDENCE_H763, { recursive: true });
fs.mkdirSync(EVIDENCE_H763B, { recursive: true });
fs.mkdirSync(EVIDENCE_H763C, { recursive: true });
fs.mkdirSync(EVIDENCE_H763D, { recursive: true });
fs.mkdirSync(EVIDENCE_H764, { recursive: true });
fs.mkdirSync(EVIDENCE_H77, { recursive: true });

// H7.4 changes cluster color/environment and pins a cluster in the QA profile through the UI.
// Back the two stores up before Electron starts and put them back after it exits.
// The packaged app keeps its data under its productName; DEV appends "Dev".
const QA_STORE_DIR = path.join(QA_PROFILE, "appdata", process.env.H7_PACKAGED_APP ? "OpenLens DevOps" : "OpenLens DevOpsDev");
const QA_STORES = ["lens-cluster-store.json", "lens-hotbar-store.json"];
const QA_BACKUP = path.join(ARTIFACTS, "profile-backup");

fs.mkdirSync(QA_BACKUP, { recursive: true });
for (const file of QA_STORES) fs.copyFileSync(path.join(QA_STORE_DIR, file), path.join(QA_BACKUP, file));

// H7.7: the layouts live in lens-local-storage (one file per cluster, root app.json). Back it up and put it back as found.
const QA_LLS_DIR = path.join(QA_STORE_DIR, "lens-local-storage");
const QA_LLS_BACKUP = path.join(ARTIFACTS, "profile-backup", "lens-local-storage");
const qaLlsBefore = fs.existsSync(QA_LLS_DIR) ? fs.readdirSync(QA_LLS_DIR) : [];

fs.mkdirSync(QA_LLS_BACKUP, { recursive: true });
for (const file of qaLlsBefore) fs.copyFileSync(path.join(QA_LLS_DIR, file), path.join(QA_LLS_BACKUP, file));

const log = (...args) => console.log(`[h7-qa ${new Date().toISOString().slice(11, 19)}]`, ...args);
const results = [];
const consoleErrors = [];
const commit = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT }).toString().trim();
const dirty = execSync("git status --porcelain --untracked-files=no", { cwd: REPO_ROOT }).toString().trim();

class Check extends Error {}
const expect = (condition, message) => { if (!condition) throw new Check(message); };

log(`artifacts: ${ARTIFACTS}`);
const env = await startEnvironment({ artifactsDir: ARTIFACTS, log });
const { apis } = env;
let page = env.page; // H7.7 relaunches replace the window
let tracing = env.app.context().tracing;

page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push({ at: Date.now(), text: msg.text().slice(0, 300), url: msg.location()?.url ?? "" }); });
page.on("pageerror", (error) => consoleErrors.push({ at: Date.now(), text: `pageerror: ${error.message}`.slice(0, 300), url: "" }));
await tracing.start({ screenshots: true, snapshots: true });

async function shot(name, { evidence = false } = {}) {
  await page.screenshot({ path: path.join(ARTIFACTS, "screenshots", `${name}.png`) });
  if (evidence) await page.screenshot({ path: path.join(EVIDENCE, `${name}.jpg`), type: "jpeg", quality: 70 });
}

// H7_ONLY=<regex> runs only the matching scenario ids (focused runs); unset runs the whole suite.
const ONLY = process.env.H7_ONLY ? new RegExp(process.env.H7_ONLY) : undefined;

async function run(id, name, input, fn, timeout = TEST_TIMEOUT) {
  if (ONLY && !ONLY.test(id)) return;
  const ctx = { step: "start", notes: [] };
  const started = Date.now();

  ctx.at = (step) => { ctx.step = step; };
  await tracing.startChunk({ title: id });

  try {
    await Promise.race([fn(ctx), sleep(timeout).then(() => { throw new Error(`timeout after ${timeout} ms`); })]);
    await tracing.stopChunk();
    results.push({ id, name, status: "PASS", input, ms: Date.now() - started, notes: ctx.notes });
    log(`PASS ${id} ${name}`);
  } catch (error) {
    const trace = path.join(ARTIFACTS, "traces", `${id}.zip`);

    await shot(`FAIL-${id}`).catch(() => {});
    await tracing.stopChunk({ path: trace }).catch(() => {});
    results.push({ id, name, status: "FAIL", input, ms: Date.now() - started, step: ctx.step, error: error.message, trace, notes: ctx.notes });
    log(`FAIL ${id} ${name} @ ${ctx.step}: ${error.message}`);
  }
}

const record = (id, name, status, reason) => { results.push({ id, name, status, input: "-", notes: [reason] }); log(`${status} ${id} ${name}`); };

// Fresh host: reload the cluster frame (new in-memory layout) and open Pods with real clicks.
// H7.7: layouts persist across reloads now, so the legacy scenarios start from the default seed by dropping the saved layouts first.
let keepSavedLayouts = false; // true during PS01-PS16: they depend on layouts saved by earlier steps
async function dropSavedLayouts() {
  if (keepSavedLayouts) return;
  await sleep(3500); // let the lazy save land so it cannot overwrite the cleanup
  for (const name of fs.readdirSync(QA_LLS_DIR)) {
    const file = path.join(QA_LLS_DIR, name);
    let data;

    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    const keys = Object.keys(data).filter((key) => /^openlens:(global|root)-layout:/.test(key));

    if (!keys.length) continue;
    for (const key of keys) delete data[key];
    fs.writeFileSync(file, JSON.stringify(data));
  }
}

async function freshHost(ctx, clusterId = CLUSTER_A) {
  await dropSavedLayouts();
  ctx.at("fresh host: reload frame and open Pods");
  let frame = await reloadFrame(page, clusterId);

  await navigate(frame, "pods");
  frame = clusterFrame(page, clusterId);
  await frame.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
  await panel(frame, "deployments").waitFor({ timeout: 30_000 });
  await sleep(800);
  expect(await describeLayout(frame) === "H(pods, deployments)", `unexpected initial layout ${await describeLayout(frame)}`);

  return frame;
}

async function dockOnto(frame, source, target, fx, fy, options) {
  const zone = await dropZone(frame, target);

  return dragHeader(page, frame, source, await pointIn(zone, fx, fy), options);
}

async function assertLayout(ctx, frame, expected) {
  const actual = await describeLayout(frame);

  ctx.notes.push(`layout ${actual}`);
  expect(actual === expected, `layout ${actual}, expected ${expected}`);

  return panelRects(frame);
}

// ---------------------------------------------------------------------------
// Setup: open cluster A, enable the flag (QA profile only)
// ---------------------------------------------------------------------------
let psLaunched = null; // H7.7: the Electron app started by the PS scenarios; closed in finally
try {
  await sleep(4000);
  log(`electron ${env.electronVersion}, commit ${commit}${dirty ? " (+uncommitted changes)" : ""}`);
  await shot("00-welcome");
  let frameA = await activateCluster(page, CLUSTER_A).catch(async () => {
    await openClusterFromCatalog(page, "h7-synthetic");

    return waitForClusterFrame(page, CLUSTER_A);
  });

  await setFlag(frameA, true);
  frameA = await freshHost({ at: () => {} });
  await shot("01-initial-side-by-side", { evidence: true });

  // -------------------------------------------------------------------------
  // H7.2 — docking with real mouse drags
  // -------------------------------------------------------------------------
  await run("D02", "Drag Pods to the right", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    ctx.at("drag Pods header to the right edge of Deployments");
    const indicator = await dockOnto(frame, "pods", "deployments", 0.92, 0.5);

    expect(indicator?.position === "right" && indicator?.target === "deployments", `indicator ${JSON.stringify(indicator)}`);
    const r = await assertLayout(ctx, frame, "H(deployments, pods)");

    expect(leftOf(r.deployments, r.pods), `geometry ${JSON.stringify(r)}`);
    await shot("d02-right", { evidence: true });
  });

  await run("D01", "Drag Pods to the left", "mouse drag", async (ctx) => {
    let frame = clusterFrame(page, CLUSTER_A);

    if (await describeLayout(frame) !== "H(deployments, pods)") {
      frame = await freshHost(ctx);
      ctx.at("setup: Pods to the right");
      await dockOnto(frame, "pods", "deployments", 0.92, 0.5);
    }
    ctx.at("drag Pods header to the left edge of Deployments");
    const indicator = await dockOnto(frame, "pods", "deployments", 0.08, 0.5);

    expect(indicator?.position === "left", `indicator ${JSON.stringify(indicator)}`);
    const r = await assertLayout(ctx, frame, "H(pods, deployments)");

    expect(leftOf(r.pods, r.deployments), `geometry ${JSON.stringify(r)}`);
    await shot("d01-left");
  });

  await run("D03", "Drag Pods to the top", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    ctx.at("drag Pods header to the top edge of Deployments");
    const indicator = await dockOnto(frame, "pods", "deployments", 0.5, 0.08);

    expect(indicator?.position === "top", `indicator ${JSON.stringify(indicator)}`);
    const r = await assertLayout(ctx, frame, "V(pods, deployments)");

    expect(above(r.pods, r.deployments), `geometry ${JSON.stringify(r)}`);
    await shot("d03-top", { evidence: true });
  });

  await run("D04", "Drag Pods to the bottom", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    ctx.at("drag Pods header to the bottom edge of Deployments");
    const indicator = await dockOnto(frame, "pods", "deployments", 0.5, 0.92);

    expect(indicator?.position === "bottom", `indicator ${JSON.stringify(indicator)}`);
    const r = await assertLayout(ctx, frame, "V(deployments, pods)");

    expect(above(r.deployments, r.pods), `geometry ${JSON.stringify(r)}`);
    await shot("d04-bottom");
  });

  await run("D05", "Drop Pods in the center (tabs)", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    ctx.at("drag Pods header to the center of Deployments");
    const indicator = await dockOnto(frame, "pods", "deployments", 0.5, 0.5);

    expect(indicator?.position === "center", `indicator ${JSON.stringify(indicator)}`);
    const r = await assertLayout(ctx, frame, "tabs[deployments,*pods]");

    expect(Object.keys(r).join() === "pods", `visible panels ${Object.keys(r)}`);
    await shot("d05-tabs", { evidence: true });
  });

  await run("D06", "Switch tabs", "locator.click", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    expect((await describeLayout(frame)).startsWith("tabs["), "precondition: grouped tabs from D05");
    ctx.at("click Deployments tab");
    await tab(frame, "deployments").click();
    await sleep(600);
    let r = await assertLayout(ctx, frame, "tabs[*deployments,pods]");

    expect(Object.keys(r).join() === "deployments", `visible ${Object.keys(r)}`);
    ctx.at("click Pods tab");
    await tab(frame, "pods").click();
    await sleep(600);
    r = await assertLayout(ctx, frame, "tabs[deployments,*pods]");
    expect(Object.keys(r).join() === "pods", `visible ${Object.keys(r)}`);
  });

  await run("D07", "Reorder tabs", "mouse drag", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    ctx.at("drag active Pods header onto the Deployments tab");
    const indicator = await dragHeader(page, frame, "pods", await pointIn(tab(frame, "deployments"), 0.5, 0.5));

    expect(indicator?.position === "center", `indicator ${JSON.stringify(indicator)}`);
    await assertLayout(ctx, frame, "tabs[*pods,deployments]");
    const tabs = await frame.evaluate(() => [...document.querySelectorAll("button[data-testid^=tab-leaf-]")].map((t) => Math.round(t.getBoundingClientRect().x)));

    expect(tabs[0] < tabs[1], `tab x order ${tabs}`);
  });

  await run("D08", "Extract a tab from the group", "mouse drag", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    ctx.at("drag active Pods header to the right edge of its own group");
    const indicator = await dockOnto(frame, "pods", "pods", 0.92, 0.5);

    expect(indicator?.position === "right", `indicator ${JSON.stringify(indicator)}`);
    const r = await assertLayout(ctx, frame, "H(deployments, pods)");

    expect(leftOf(r.deployments, r.pods), `geometry ${JSON.stringify(r)}`);
  });

  // Drags a divider with the real mouse along one axis; returns the rects after release.
  async function dragDivider(frame, divider, dx, dy) {
    const box = await divider.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 20 });
    await sleep(250); // ResizingAnchor throttles mousemove to 100 ms
    await page.mouse.up();
    await sleep(400);

    return panelRects(frame);
  }

  await run("D09", "Resize with the mouse (direction and limits)", "mouse drag (divider)", async (ctx) => {
    let frame = await freshHost(ctx);
    const divider = () => frame.locator("[data-testid^=branch-divider-]").first();
    const start = await panelRects(frame);
    const total = start.pods.w + start.deployments.w;
    const check = (label, cond, detail) => { ctx.notes.push(`${label}: ${detail}`); expect(cond, `${label}: ${detail}`); };

    ctx.at("horizontal: drag the divider 200px to the right");
    let r = await dragDivider(frame, divider(), 200, 0);

    check("right +200", r.pods.w - start.pods.w > 150 && r.pods.w - start.pods.w < 250, `pods ${start.pods.w}→${r.pods.w}px`);
    ctx.at("horizontal: drag the divider 300px to the left");
    const before = r;

    r = await dragDivider(frame, divider(), -300, 0);
    check("left −300", before.pods.w - r.pods.w > 250 && before.pods.w - r.pods.w < 350, `pods ${before.pods.w}→${r.pods.w}px`);
    ctx.at("horizontal: limits");
    r = await dragDivider(frame, divider(), 2000, 0);
    check("max limit", Math.abs(r.pods.w / total - 0.8) < 0.03, `pods ${(r.pods.w / total * 100).toFixed(1)}% of ${total}px`);
    r = await dragDivider(frame, divider(), -2000, 0);
    check("min limit", Math.abs(r.pods.w / total - 0.2) < 0.03, `pods ${(r.pods.w / total * 100).toFixed(1)}%`);
    await assertLayout(ctx, frame, "H(pods, deployments)");

    ctx.at("vertical: dock Pods on top");
    frame = await freshHost(ctx);
    await dockOnto(frame, "pods", "deployments", 0.5, 0.08);
    await assertLayout(ctx, frame, "V(pods, deployments)");
    const top = await panelRects(frame);

    ctx.at("vertical: drag the divider 120px down");
    r = await dragDivider(frame, divider(), 0, 120);
    check("down +120", r.pods.h - top.pods.h > 80 && r.pods.h - top.pods.h < 160, `pods ${top.pods.h}→${r.pods.h}px`);
    ctx.at("vertical: drag the divider 200px up");
    const mid = r;

    r = await dragDivider(frame, divider(), 0, -200);
    check("up −200", mid.pods.h - r.pods.h > 150 && mid.pods.h - r.pods.h < 250, `pods ${mid.pods.h}→${r.pods.h}px`);
    await shot("d09-resized-vertical", { evidence: true });
  });

  await run("K01", "Kubetail splitter follows the mouse", "mouse drag (divider)", async (ctx) => {
    let frame = clusterFrame(page, CLUSTER_A);

    ctx.at("open Kubetail");
    await navigate(frame, "kubetail");
    frame = clusterFrame(page, CLUSTER_A);
    const container = frame.locator("[data-testid=split-panel-layout-container]").first();

    await container.waitFor({ timeout: 30_000 });
    await sleep(800);
    const dynamic = frame.locator("[data-testid=split-panel-layout-container] [data-testid^=branch-divider-]").first();
    const isDynamic = await dynamic.count() > 0;
    const divider = isDynamic ? dynamic : frame.locator("[data-testid=split-panel-divider]").first();
    const firstSize = () => frame.evaluate((dyn) => {
      const el = dyn ? document.querySelector("[data-testid=split-panel-layout-container] [data-testid^=branch-first-]") : document.querySelector("[data-testid=split-panel-left]");

      return el ? Math.round(el.getBoundingClientRect().width) : -1;
    }, isDynamic);

    ctx.notes.push(`mode: ${isDynamic ? "dynamic (DynamicLayoutRenderer)" : "classic (SplitPanelLayout)"}`);
    expect(await divider.count() === 1, "no Kubetail divider visible");
    const w0 = await firstSize();

    ctx.at("drag the divider 150px to the right");
    await dragDivider(frame, divider, 150, 0);
    const w1 = await firstSize();

    ctx.at("drag the divider 150px to the left");
    await dragDivider(frame, divider, -150, 0);
    const w2 = await firstSize();

    ctx.notes.push(`left panel ${w0}→${w1}→${w2}px`);
    expect(w1 - w0 > 100, `right drag did not grow the left panel (${w0}→${w1})`);
    expect(w1 - w2 > 100, `left drag did not shrink the left panel (${w1}→${w2})`);
    await shot("k01-kubetail");
  });

  await run("D10", "Cancel a drag (Escape)", "mouse drag + keyboard", async (ctx) => {
    const frame = await freshHost(ctx);

    ctx.at("drag Pods to the right edge, press Escape, release");
    const indicator = await dockOnto(frame, "pods", "deployments", 0.92, 0.5, { cancelWithEscape: true });

    ctx.notes.push(`indicator during drag ${JSON.stringify(indicator)}`);
    expect(indicator?.position === "right", "indicator should be visible during the drag");
    await assertLayout(ctx, frame, "H(pods, deployments)");
    expect(!(await frame.locator("[data-testid=global-panel-drop-preview]").count()), "indicator still visible after cancel");
  });

  await run("D11", "Drop on an invalid zone", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    ctx.at("drag Pods onto the sidebar");
    const indicator = await dragHeader(page, frame, "pods", await pointIn(frame.locator("[data-testid=cluster-nav-column]"), 0.5, 0.6));

    expect(indicator === null, `indicator ${JSON.stringify(indicator)}`);
    await assertLayout(ctx, frame, "H(pods, deployments)");
  });

  await run("D12", "Drop a panel on itself", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    for (const [fx, fy, label] of [[0.5, 0.6, "center"], [0.08, 0.5, "left edge"], [0.92, 0.5, "right edge"]]) {
      ctx.at(`drag Pods onto its own ${label}`);
      const indicator = await dockOnto(frame, "pods", "pods", fx, fy);

      expect(indicator === null, `${label}: indicator ${JSON.stringify(indicator)}`);
      await assertLayout(ctx, frame, "H(pods, deployments)");
    }
  });

  // H7.6.1: the host catalog offers the seven workload views, each only while it is not open.
  const NEW_WORKLOADS = "statefulsets,daemonsets,replicasets,jobs,cronjobs";
  // H7.6.2: resources and networking, in catalog order.
  const NEW_RESOURCES = "configmaps,services,ingresses,persistentvolumeclaims,nodes,events";

  await run("D13", "Catalog + offers only the hosted workloads not yet open", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);
    const offered = () => frame.evaluate(() => [...document.querySelectorAll("[data-testid^=catalog-card-]")].map((e) => e.dataset.testid.slice("catalog-card-".length)).filter((kind) => kind !== "terminal" && kind !== "kubetail"));

    ctx.at("open catalog with both panels open");
    await frame.locator("[data-testid^=panel-add-button-leaf-pods-]").click();
    await frame.locator("[data-testid=catalog-modal]").waitFor();
    const withBoth = await offered();

    ctx.notes.push(`both open → offered [${withBoth}]`);
    expect(withBoth.join() === `${NEW_WORKLOADS},${NEW_RESOURCES}`, `offered ${withBoth}`);
    await shot("d13-catalog-both-open");
    await frame.locator("[data-testid=catalog-close-button]").click();

    ctx.at("close Deployments with ×, reopen catalog");
    await frame.locator("[data-testid^=panel-close-button-leaf-deployments-]").click();
    await sleep(600);
    await assertLayout(ctx, frame, "pods");
    await frame.locator("[data-testid^=panel-add-button-leaf-pods-]").click();
    await frame.locator("[data-testid=catalog-modal]").waitFor();
    const afterClose = await offered();

    ctx.notes.push(`deployments closed → offered [${afterClose}]`);
    expect(afterClose.join() === `deployments,${NEW_WORKLOADS},${NEW_RESOURCES}`, `offered ${afterClose}`);
    await shot("d13-catalog-offers-deployments", { evidence: true });

    ctx.at("add Deployments from the catalog");
    await frame.locator("[data-testid=catalog-add-deployments]").click();
    await sleep(800);
    expect(await panel(frame, "deployments").count() === 1, "Deployments did not come back");
  });

  await run("D14", "Route changes keep the layout", "locator.click (sidebar)", async (ctx) => {
    let frame = await freshHost(ctx);

    ctx.at("dock Pods on top");
    await dockOnto(frame, "pods", "deployments", 0.5, 0.08);
    await assertLayout(ctx, frame, "V(pods, deployments)");

    for (const route of ["deployments", "overview", "pods"]) {
      ctx.at(`navigate to ${route}`);
      await navigate(frame, route);
      frame = clusterFrame(page, CLUSTER_A);
      if (route === "overview") {
        expect(!(await frame.locator("[data-testid=global-panel-host]").count()), "host should not render on Overview");
      } else {
        await frame.locator("[data-testid=global-panel-host]").waitFor();
        await assertLayout(ctx, frame, "V(pods, deployments)");
      }
    }
  });

  await run("D15", "Flag OFF keeps the classic UI", "locator.click (sidebar)", async (ctx) => {
    let frame = clusterFrame(page, CLUSTER_A);

    ctx.at("flag OFF and reload");
    await setFlag(frame, false);
    frame = await reloadFrame(page, CLUSTER_A);

    for (const route of ["pods", "deployments"]) {
      ctx.at(`classic ${route}`);
      await navigate(frame, route);
      expect(!(await frame.locator("[data-testid=global-panel-host]").count()), `host rendered on ${route} with flag OFF`);
      await frame.locator(".KubeObjectListLayout").first().waitFor({ timeout: 20_000 });
      ctx.notes.push(`${route}: ${(await frame.locator(".KubeObjectListLayout").first().getAttribute("class")).split(" ").pop()}`);
    }
    await shot("d15-flag-off-classic", { evidence: true });
    await setFlag(frame, true);
  });

  let clusterB;

  await run("D16", "Switching clusters does not mix panels", "locator.click (catalog/tabs) + mouse drag", async (ctx) => {
    let frameA = await freshHost(ctx);

    ctx.at("cluster A: dock Pods at the bottom");
    await dockOnto(frameA, "pods", "deployments", 0.5, 0.92);
    await assertLayout(ctx, frameA, "V(deployments, pods)");

    ctx.at("open cluster B from the catalog");
    clusterB = await openClusterFromCatalog(page, CLUSTER_B_NAME);
    expect(clusterB !== CLUSTER_A, "cluster B id equals A");
    let frameB = await waitForClusterFrame(page, clusterB);

    await setFlag(frameB, true);
    frameB = await reloadFrame(page, clusterB);
    await navigate(frameB, "pods");
    await frameB.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
    await panel(frameB, "deployments").waitFor({ timeout: 30_000 });
    await assertLayout(ctx, frameB, "H(pods, deployments)");
    const hostB = await frameB.locator("[data-testid=global-panel-host]").getAttribute("data-cluster-id");

    expect(hostB === clusterB, `host B cluster ${hostB}`);
    const bWatch = watchCount(apis.b, WATCH_PATHS.deployments);

    ctx.notes.push(`B deployments watch open=${bWatch.open}`);
    expect(bWatch.open === 1, "cluster B view is not served by API B");
    await shot("d16-cluster-b", { evidence: true });

    ctx.at("back to cluster A through its workspace tab");
    frameA = await activateCluster(page, CLUSTER_A);
    await frameA.locator("[data-testid=global-panel-host]").waitFor();
    await assertLayout(ctx, frameA, "V(deployments, pods)");
    expect(await frameA.locator("[data-testid=global-panel-host]").getAttribute("data-cluster-id") === CLUSTER_A, "host A cluster id");
  });

  // -------------------------------------------------------------------------
  // H7.3 — compact controls, collapse and keyboard move (real mouse/keyboard)
  // -------------------------------------------------------------------------
  const dep = () => watchCount(apis.a, WATCH_PATHS.deployments);
  const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(150); } return fn(); };
  const actionsOpacity = (frame, kind) => control(frame, "collapse", kind).evaluate((el) => Number(getComputedStyle(el.parentElement).opacity));
  const activeTestId = (frame) => frame.evaluate(() => document.activeElement?.dataset?.testid ?? document.activeElement?.tagName);
  const moveAway = async (frame, kind) => { const p = await pointIn(panel(frame, kind), 0.5, 0.75); await page.mouse.move(p.x, p.y, { steps: 4 }); await sleep(250); };
  // Clicking the (non-focusable) title focuses the panel container, so the next Tab lands in its header controls.
  const focusPanel = async (frame, kind) => { await panelHeader(frame, kind).locator("span").first().click(); await moveAway(frame, kind); };
  const layoutWidth = (frame) => frame.locator("[data-testid=global-panel-host] > div").first().evaluate((el) => el.getBoundingClientRect().width);

  await run("C01", "Pointer outside header", "mouse move", async (ctx) => {
    const frame = await freshHost(ctx);

    await moveAway(frame, "pods");
    const [pods, deployments] = [await actionsOpacity(frame, "pods"), await actionsOpacity(frame, "deployments")];

    ctx.notes.push(`controls opacity: pods ${pods}, deployments ${deployments}`);
    expect(pods === 0 && deployments === 0, "controls visible without hover or focus");
  });

  await run("C02", "Hover header", "mouse move", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);
    const p = await pointIn(panelHeader(frame, "pods"), 0.35, 0.5);

    await page.mouse.move(p.x, p.y, { steps: 6 });
    await sleep(300);
    const [pods, deployments] = [await actionsOpacity(frame, "pods"), await actionsOpacity(frame, "deployments")];

    ctx.notes.push(`hover Pods header: pods ${pods}, deployments ${deployments}`);
    expect(pods === 1 && deployments === 0, "hover must reveal only the hovered header controls");
    await shot("c02-hover-controls", { evidence: true });
  });

  await run("C03", "Leave header", "mouse move", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    await moveAway(frame, "pods");
    const pods = await actionsOpacity(frame, "pods");

    ctx.notes.push(`after leaving: pods ${pods}`);
    expect(pods === 0, "controls stay visible after leaving the header");
  });

  await run("C04", "Focus with Tab", "keyboard Tab", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    await focusPanel(frame, "pods");
    await page.keyboard.press("Tab");
    await sleep(250);
    const focused = await activeTestId(frame);
    const opacity = await actionsOpacity(frame, "pods");
    const names = await frame.evaluate(() => [...document.querySelectorAll("[data-testid^=panel-header-leaf-pods-] button")].map((b) => b.getAttribute("aria-label")));

    ctx.notes.push(`focused ${focused}; opacity ${opacity}; names [${names.join(" | ")}]`);
    expect(String(focused).startsWith("panel-add-button-leaf-pods-"), `Tab focused ${focused}`);
    expect(opacity === 1, "keyboard focus did not reveal the controls");
    // "Pods Overview" is the catalog defaultTitle shown in the header.
    expect(["Collapse", "Close", "Move"].every((verb) => names.includes(`${verb} Pods Overview panel`)), `accessible names ${names}`);
    await shot("c04-keyboard-focus", { evidence: true });
  });

  await run("C05", "Press −", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);

    expect(await until(() => dep().open === 1), `deployments watch before ${dep().open}`);
    await control(frame, "collapse", "deployments").click();
    await assertLayout(ctx, frame, "pods");
    const [rects, width] = [await panelRects(frame), await layoutWidth(frame)];

    ctx.notes.push(`pods width ${rects.pods.w}/${width}px`);
    expect(rects.pods.w >= width - 2, "Pods did not take the freed space");
    expect(await restoreChip(frame, "deployments").isVisible(), "no restore band for Deployments");
    expect(await until(() => dep().open === 0), `deployments watch after collapse ${dep().open}`);
    ctx.notes.push(`deployments watch open=${dep().open}`);
    await shot("c05-collapsed", { evidence: true });
  });

  await run("C06", "Restore panel", "locator.click", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);
    const started = dep().started;

    await restoreChip(frame, "deployments").click();
    await sleep(600);
    const rects = await assertLayout(ctx, frame, "H(pods, deployments)");
    const width = await layoutWidth(frame);

    ctx.notes.push(`pods ${rects.pods.w}px, deployments ${rects.deployments.w}px of ${width}`);
    expect(Math.abs(rects.pods.w - rects.deployments.w) < 12, "50/50 split not restored");
    expect(!(await restoreChip(frame, "deployments").count()), "restore band still shown");
    expect(await until(() => dep().open === 1), `deployments watch after restore ${dep().open}`);
    await sleep(1000);
    ctx.notes.push(`deployments watch open=${dep().open}, started +${dep().started - started}`);
    expect(dep().open === 1 && dep().started - started === 1, "duplicated deployments watch after restore");
  });

  await run("C07", "Collapse inside a group", "mouse drag + locator.click", async (ctx) => {
    const frame = await freshHost(ctx);

    await dockOnto(frame, "pods", "deployments", 0.5, 0.5);
    await assertLayout(ctx, frame, "tabs[deployments,*pods]");
    await control(frame, "collapse", "pods").click();
    await assertLayout(ctx, frame, "tabs[*deployments]");
    expect(await until(() => dep().open === 1), `deployments watch with its tab shown ${dep().open}`);
    await shot("c07-group-collapsed");
    await restoreChip(frame, "pods").click();
    await sleep(500);
    await assertLayout(ctx, frame, "tabs[deployments,*pods]");
    expect(await until(() => dep().open === 0), `deployments watch with Pods active ${dep().open}`);
  });

  await run("C08", "Collapse last panel", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);

    await control(frame, "collapse", "deployments").click();
    await control(frame, "collapse", "pods").click();
    await assertLayout(ctx, frame, "(all collapsed)");
    const chips = await frame.locator("[data-testid^=panel-restore-collapsed-]").count();

    ctx.notes.push(`restore chips ${chips}`);
    expect(chips === 2, "both panels must be restorable");
    expect(await until(() => dep().open === 0), `deployments watch ${dep().open}`);
    await shot("c08-all-collapsed", { evidence: true });
    await restoreChip(frame, "pods").click();
    await assertLayout(ctx, frame, "pods");
    await restoreChip(frame, "deployments").click();
    await sleep(500);
    await assertLayout(ctx, frame, "H(pods, deployments)");
    expect(await until(() => dep().open === 1), `deployments watch after restore ${dep().open}`);
  });

  await run("C09", "Press ×", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);

    await control(frame, "close", "deployments").click();
    await sleep(600);
    await assertLayout(ctx, frame, "pods");
    expect(await until(() => dep().open === 0), `deployments watch after close ${dep().open}`);
    expect(!(await control(frame, "close", "pods").count()), "the last panel must not offer ×");
    expect(!(await frame.locator("[data-testid^=panel-restore-collapsed-]").count()), "a closed panel is not a collapsed panel");
  });

  await run("C10", "Reopen from catalog", "locator.click", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    await control(frame, "add", "pods").click();
    await frame.locator("[data-testid=catalog-add-deployments]").click();
    await sleep(800);
    expect(await panel(frame, "deployments").count() === 1, "Deployments did not come back");
    expect(await until(() => dep().open === 1), `deployments watch after reopen ${dep().open}`);
    ctx.notes.push(`layout ${await describeLayout(frame)}; deployments watch open=${dep().open}`);
  });

  await run("C11", "Keyboard move", "keyboard (Tab, Enter, arrows, Escape)", async (ctx) => {
    const frame = await freshHost(ctx);
    const menu = frame.locator("[data-testid^=panel-move-menu-leaf-pods-]");

    await focusPanel(frame, "pods");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(String(await activeTestId(frame)).startsWith("panel-move-button-leaf-pods-"), `focus on ${await activeTestId(frame)}`);

    ctx.at("open with Enter, cancel with Escape");
    await page.keyboard.press("Enter");
    await menu.waitFor();
    const options = await menu.locator("[role=menuitem]").allTextContents();

    ctx.notes.push(`options [${options.join(" | ")}]`);
    await shot("c11-keyboard-menu", { evidence: true });
    await page.keyboard.press("Escape");
    await sleep(200);
    expect(!(await menu.count()), "Escape did not close the menu");
    expect(String(await activeTestId(frame)).startsWith("panel-move-button-leaf-pods-"), "focus did not return to the trigger");
    await assertLayout(ctx, frame, "H(pods, deployments)");

    ctx.at("ArrowDown + Enter: above Deployments");
    await page.keyboard.press("Enter");
    await menu.waitFor();
    await page.keyboard.press("ArrowDown");
    expect(await activeTestId(frame) === (await menu.locator("[role=menuitem]").nth(1).getAttribute("data-testid")), "ArrowDown did not move focus");
    await page.keyboard.press("Enter");
    await sleep(500);
    const rects = await assertLayout(ctx, frame, "V(pods, deployments)");

    expect(above(rects.pods, rects.deployments), "Pods is not above Deployments");
    expect(String(await activeTestId(frame)).startsWith("panel-move-button-leaf-pods-"), `focus after move on ${await activeTestId(frame)}`);

    ctx.at("End + Enter: group with Deployments");
    await page.keyboard.press("Enter");
    await menu.waitFor();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await sleep(500);
    await assertLayout(ctx, frame, "tabs[deployments,*pods]");
  });

  await run("C12", "Drag after restore", "locator.click + mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    await control(frame, "collapse", "pods").click();
    await assertLayout(ctx, frame, "deployments");
    await restoreChip(frame, "pods").click();
    await sleep(500);
    await assertLayout(ctx, frame, "H(pods, deployments)");
    await dockOnto(frame, "pods", "deployments", 0.5, 0.92);
    const rects = await assertLayout(ctx, frame, "V(deployments, pods)");

    expect(above(rects.deployments, rects.pods), "Pods is not below Deployments");
  });

  await run("C13", "Header height on hover", "mouse move + keyboard Tab", async (ctx) => {
    const frame = await freshHost(ctx);
    const measure = () => frame.evaluate(() => {
      const headerEl = document.querySelector("[data-testid^=panel-header-leaf-pods-]");
      const body = headerEl.nextElementSibling;

      return { header: headerEl.getBoundingClientRect().height, bodyTop: body.getBoundingClientRect().top, background: getComputedStyle(headerEl).backgroundColor };
    });

    await moveAway(frame, "pods");
    const idle = await measure();
    const p = await pointIn(panelHeader(frame, "pods"), 0.35, 0.5);

    await page.mouse.move(p.x, p.y, { steps: 4 });
    await sleep(300);
    const hovered = await measure();

    await focusPanel(frame, "pods");
    await page.keyboard.press("Tab");
    await sleep(250);
    const focused = await measure();

    ctx.notes.push(`header ${idle.header}/${hovered.header}/${focused.header}px, body top ${idle.bodyTop}/${hovered.bodyTop}/${focused.bodyTop}, background ${idle.background}`);
    expect(idle.header >= 26 && idle.header <= 28, `header height ${idle.header}`);
    expect(idle.header === hovered.header && idle.header === focused.header, "header height changes on hover/focus");
    expect(idle.bodyTop === hovered.bodyTop && idle.bodyTop === focused.bodyTop, "content shifts on hover/focus");
  });

  // -------------------------------------------------------------------------
  // H7.4 — cluster identity (accent, environment, Settings and hotbar dialog)
  // -------------------------------------------------------------------------
  const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
  // Computed 2px inset accent of every matching element: [{ color, inset, px, height }].
  const accents = (frame, selector) => frame.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => {
    const shadow = getComputedStyle(el).boxShadow;
    const match = shadow.match(/^(rgba?\([^)]*\)) 0px (\d+)px 0px 0px inset$/);

    return { color: match?.[1], px: match ? Number(match[2]) : 0, height: el.getBoundingClientRect().height, cluster: el.dataset.clusterId, raw: shadow };
  }), selector);
  const HEADERS = "[data-testid^=panel-header-leaf-]";
  const TABS = "button[data-testid^=tab-leaf-]";
  const CHIPS = "[data-testid^=panel-restore-collapsed-]";
  const expectAccent = (list, color, what) => {
    expect(list.length > 0, `no ${what} found`);
    expect(list.every((a) => a.px === 2), `${what}: accent is not a 2px inset line (${list.map((a) => a.raw).join(" | ")})`);
    expect(list.every((a) => a.color === color), `${what}: ${list.map((a) => a.color).join(", ")}, expected ${color}`);
  };
  const vshot = (name) => page.screenshot({ path: path.join(EVIDENCE_H74, `${name}.jpg`), type: "jpeg", quality: 70 }).then(() => shot(name));
  const clusterMenu = async (frame, item) => {
    await frame.locator("[data-testid=sidebar-cluster-dropdown]").click();
    await frame.locator(".MenuItem", { hasText: item }).first().click();
  };
  // Settings is a root-frame route; the color swatches are the shared ClusterAppearancePicker.
  const pickInSettings = async (clusterId, { color, environment }) => {
    await clusterMenu(clusterFrame(page, clusterId), "Settings");
    await page.waitForURL(/\/entity\/[^/]+\/settings/, { timeout: 20_000 }).catch(() => {});
    if (color) await page.locator(`button[title="${color}"]`).first().click();
    if (environment) await page.locator("button", { hasText: new RegExp(`^${environment}$`) }).first().click();
    await sleep(800);
    await vshot(`settings-${color ?? environment}`.toLowerCase());
    // Settings is a full-page overlay over the workspace tabs: leave it the way a user does.
    await page.keyboard.press("Escape");
    await page.waitForURL((url) => !/\/settings/.test(url.pathname), { timeout: 20_000 }).catch(() => {});
    await sleep(800);
    const frame = await activateCluster(page, clusterId);

    await frame.locator("[data-testid=global-panel-host]").waitFor();
    await sleep(800);

    return frame;
  };
  const pickInHotbarDialog = async (clusterId, color, { shotName } = {}) => {
    await page.locator(`#hotbarPin-${clusterId}`).click({ button: "right" });
    await page.locator(".MenuItem", { hasText: "Change Color, Icon & Environment..." }).click();
    const dialog = page.locator(".ClusterAppearanceDialog");

    await dialog.waitFor({ timeout: 10_000 });
    await dialog.locator(`button[title="${color}"]`).first().click();
    await sleep(600);
    if (shotName) await vshot(shotName);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached", timeout: 10_000 });
    await sleep(800);
  };
  const TEAL = hexToRgb("#14B8A6");
  const INDIGO = hexToRgb("#6366F1");
  const PINK = hexToRgb("#EC4899");
  let neutral;

  await run("V01", "Normal panel shows a 2px accent", "locator + DOM geometry", async (ctx) => {
    const frame = await freshHost(ctx);
    const headers = await accents(frame, HEADERS);

    neutral = headers[0]?.color;
    ctx.notes.push(`no color configured → neutral ${neutral}; header height ${headers.map((h) => h.height)}; cluster ${headers.map((h) => h.cluster)}`);
    expectAccent(headers, neutral, "headers");
    expect(headers.every((h) => h.height === 28 && h.cluster === CLUSTER_A), "header height or cluster id");
    const preview = await frame.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--blue").trim());

    ctx.notes.push(`drop preview color ${preview || "#7BA3E3 (fallback)"}`);
    expect(neutral !== hexToRgb("#7BA3E3"), "accent must not look like the drop preview");
    await vshot("v01-neutral-accent");
  });

  await run("V06", "Change color from Settings", "locator.click (sidebar menu → Settings → swatch)", async (ctx) => {
    const frame = await pickInSettings(CLUSTER_A, { color: "Teal" });
    const headers = await accents(frame, HEADERS);

    ctx.notes.push(`headers ${headers.map((h) => h.color)}`);
    expectAccent(headers, TEAL, "headers after Settings");
    await vshot("v06-settings-teal");
  });

  await run("V02", "Panels of the same cluster share the color", "DOM", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);
    const headers = await accents(frame, HEADERS);

    ctx.notes.push(`${headers.length} headers: ${headers.map((h) => h.color).join(", ")}`);
    expect(headers.length === 2, "expected Pods and Deployments");
    expectAccent(headers, TEAL, "headers");
  });

  await run("V03", "Grouped tabs keep the identity", "mouse drag", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    await dockOnto(frame, "pods", "deployments", 0.5, 0.5);
    await assertLayout(ctx, frame, "tabs[deployments,*pods]");
    const tabs = await accents(frame, TABS);

    ctx.notes.push(`tabs ${tabs.map((t) => t.color).join(", ")}`);
    expectAccent(tabs, TEAL, "tabs");
    expectAccent(await accents(frame, HEADERS), TEAL, "active tab header");
    await vshot("v03-tabs-teal");
  });

  await run("V04", "Collapsed band shows the cluster color", "locator.click", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    await control(frame, "collapse", "pods").click();
    await assertLayout(ctx, frame, "tabs[*deployments]");
    const chips = await accents(frame, CHIPS);
    const title = await restoreChip(frame, "pods").getAttribute("title");

    ctx.notes.push(`chip ${chips.map((c) => c.color)}; title "${title}"`);
    expectAccent(chips, TEAL, "restore chips");
    expect(/cluster h7-synthetic/.test(title ?? ""), `chip title ${title}`);
    await vshot("v04-collapsed-band-teal");
  });

  await run("V05", "Restoring keeps the identity", "locator.click", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    await restoreChip(frame, "pods").click();
    await sleep(500);
    await assertLayout(ctx, frame, "tabs[deployments,*pods]");
    const headers = await accents(frame, HEADERS);

    expectAccent(headers, TEAL, "restored header");
    expect(headers.every((h) => h.cluster === CLUSTER_A), "cluster id changed");
    expectAccent(await accents(frame, TABS), TEAL, "tabs");
  });

  await run("V07", "Change color from the hotbar context menu", "right click + locator.click", async (ctx) => {
    let frame = clusterFrame(page, CLUSTER_A);

    if (!(await page.locator(`#hotbarPin-${CLUSTER_A}`).count())) {
      ctx.at("pin cluster A (sidebar menu → Add to Hotbar)");
      await clusterMenu(frame, "Add to Hotbar");
      await page.locator(`#hotbarPin-${CLUSTER_A}`).waitFor({ timeout: 10_000 });
    }
    ctx.at("hotbar menu → Change Color, Icon & Environment... → Indigo");
    await pickInHotbarDialog(CLUSTER_A, "Indigo", { shotName: "v07-hotbar-dialog" });
    frame = clusterFrame(page, CLUSTER_A);
    expectAccent(await accents(frame, TABS), INDIGO, "tabs");
    expectAccent(await accents(frame, HEADERS), INDIGO, "header");
    ctx.at("extract, then collapse after the menu change");
    // Pods is the active (visible) tab: dragging it to its own right edge extracts it beside the group.
    await dockOnto(frame, "pods", "pods", 0.92, 0.5);
    await assertLayout(ctx, frame, "H(deployments, pods)");
    expectAccent(await accents(frame, HEADERS), INDIGO, "both headers");
    await control(frame, "collapse", "deployments").click();
    expectAccent(await accents(frame, CHIPS), INDIGO, "restore chip");
    await vshot("v07-indigo-collapsed");
    await restoreChip(frame, "deployments").click();
    await sleep(500);
  });

  await run("V12", "Color change with panels open: no remount, no new watches", "right click + locator.click", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    await assertLayout(ctx, frame, "H(deployments, pods)");
    expect(await until(() => dep().open === 1), `deployments watch ${dep().open}`);
    await sleep(1000);
    // DOM marker on the mounted list views: a remount would replace these nodes.
    await frame.evaluate(() => document.querySelectorAll("[data-testid^=panel-container-leaf-] .KubeObjectListLayout").forEach((el) => { el.h74Marker = true; }));
    const before = { started: dep().started, open: dep().open, pods: watchCount(apis.a, WATCH_PATHS.pods) };

    await pickInHotbarDialog(CLUSTER_A, "Pink");
    await sleep(1500);
    const marked = await frame.evaluate(() => [...document.querySelectorAll("[data-testid^=panel-container-leaf-] .KubeObjectListLayout")].map((el) => el.h74Marker === true));
    const after = { started: dep().started, open: dep().open, pods: watchCount(apis.a, WATCH_PATHS.pods) };

    ctx.notes.push(`list views kept: [${marked}]; deployments started ${before.started}→${after.started}, open ${before.open}→${after.open}; pods started ${before.pods.started}→${after.pods.started}`);
    expectAccent(await accents(frame, HEADERS), PINK, "headers");
    // Each panel holds nested .KubeObjectListLayout nodes; every one must keep its marker.
    expect(marked.length >= 2 && marked.every(Boolean), "a list view was re-mounted by a color change");
    expect(after.started === before.started && after.pods.started === before.pods.started, "a color change opened new watches");
    expect(after.open === 1, `deployments open ${after.open}`);
  });

  await run("V08", "Color survives a reload", "frame reload", async (ctx) => {
    let frame = await reloadFrame(page, CLUSTER_A);

    await navigate(frame, "pods");
    frame = clusterFrame(page, CLUSTER_A);
    await panel(frame, "deployments").waitFor({ timeout: 30_000 });
    await sleep(800);
    const headers = await accents(frame, HEADERS);

    ctx.notes.push(`after reload ${headers.map((h) => h.color)}`);
    expectAccent(headers, PINK, "headers after reload");
  });

  await run("V09", "Changing cluster A does not change cluster B", "workspace tab click", async (ctx) => {
    let frameB = await activateCluster(page, clusterB);

    await frameB.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
    await sleep(800);
    const headers = await accents(frameB, HEADERS);

    ctx.notes.push(`cluster B headers ${headers.map((h) => `${h.color}@${h.cluster?.slice(0, 6)}`)}`);
    expectAccent(headers, neutral, "cluster B headers");
    expect(headers.every((h) => h.cluster === clusterB), "cluster B panels carry another cluster id");
    await vshot("v09-cluster-b-unchanged");
    frameB = clusterFrame(page, clusterB);
    // Cross-cluster drag is still rejected: B's store only docks panels from its own cluster.
    expect(await frameB.locator("[data-testid=global-panel-host]").getAttribute("data-cluster-id") === clusterB, "host B cluster id");
  });

  await run("V10", "Synthetic PROD environment is labelled", "locator.click (Settings → Production)", async (ctx) => {
    const frameB = await pickInSettings(clusterB, { environment: "Production" });
    const headers = await accents(frameB, HEADERS);
    const labels = await frameB.evaluate(() => [...document.querySelectorAll("[data-testid^=panel-env-leaf-]")].map((e) => `${e.textContent.trim()}|${e.getAttribute("aria-label")}`));
    const flags = await frameB.evaluate(() => [...document.querySelectorAll("[data-testid^=panel-header-leaf-]")].map((e) => e.dataset.production));
    const frameA = clusterFrame(page, CLUSTER_A);
    const labelsA = await frameA.evaluate(() => document.querySelectorAll("[data-testid^=panel-env-leaf-]").length);

    ctx.notes.push(`B labels [${labels.join(", ")}]; production [${flags}]; heights ${headers.map((h) => h.height)}; A labels ${labelsA}`);
    // The badge text is the "warning" icon ligature followed by PROD.
    expect(labels.length === 2 && labels.every((l) => /PROD\|/.test(l) && l.includes("Environment: Production")), `labels ${labels}`);
    expect(flags.every((f) => f === "true"), "data-production");
    expect(headers.every((h) => h.height === 28 && h.px === 2), "PROD header must stay 28px with the 2px accent");
    expect(labelsA === 0, "cluster A must not be labelled PROD");
    await vshot("v10-prod-cluster-b");
  });

  await run("V11", "Flag OFF keeps classic navigation", "locator.click (sidebar)", async (ctx) => {
    let frame = await activateCluster(page, CLUSTER_A);

    await setFlag(frame, false);
    frame = await reloadFrame(page, CLUSTER_A);
    await navigate(frame, "pods");
    await frame.locator(".KubeObjectListLayout").first().waitFor({ timeout: 20_000 });
    const hosts = await frame.locator("[data-testid=global-panel-host]").count();
    const headers = await frame.locator(HEADERS).count();

    ctx.notes.push(`flag OFF: hosts ${hosts}, global headers ${headers}`);
    expect(hosts === 0 && headers === 0, "global docking chrome rendered with the flag OFF");
    await setFlag(frame, true);
    frame = await reloadFrame(page, CLUSTER_A);
    await navigate(frame, "pods");
    await clusterFrame(page, CLUSTER_A).locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
  });

  // -------------------------------------------------------------------------
  // H7.2.1 — watch lifecycle regression (synthetic API counters)
  // -------------------------------------------------------------------------
  const podsSamples = [];
  const samplePods = (where) => podsSamples.push({ where, ...watchCount(apis.a, WATCH_PATHS.pods) });
  let baselineTotal;

  await run("W01", "10 navigations Deployments → Overview", "locator.click (sidebar)", async (ctx) => {
    let frame = await freshHost(ctx);

    await sleep(1500);
    baselineTotal = dep().totalOpen;
    const start = dep().started;

    for (let i = 1; i <= 10; i++) {
      ctx.at(`cycle ${i}: Deployments`);
      await navigate(frame, "deployments");
      frame = clusterFrame(page, CLUSTER_A);
      await sleep(1200);
      expect(dep().open === 1, `cycle ${i} on Deployments: open=${dep().open}`);
      samplePods(`W01#${i} deployments`);
      ctx.at(`cycle ${i}: Overview`);
      await navigate(frame, "overview");
      await sleep(1500);
      expect(dep().open === 0, `cycle ${i} on Overview: open=${dep().open}`);
      samplePods(`W01#${i} overview`);
    }
    ctx.notes.push(`deployments started ${start}→${dep().started}, open on Overview 0 every cycle`);
  });

  await run("W02", "10 drags of the Deployments panel", "mouse drag", async (ctx) => {
    let frame = clusterFrame(page, CLUSTER_A);

    await navigate(frame, "deployments");
    frame = clusterFrame(page, CLUSTER_A);
    await panel(frame, "deployments").waitFor();
    const start = dep().started;

    for (let i = 1; i <= 10; i++) {
      ctx.at(`drag ${i}`);
      await dockOnto(frame, "deployments", "pods", i % 2 ? 0.08 : 0.92, 0.5);
      await sleep(1000);
      expect(dep().open === 1, `after drag ${i}: open=${dep().open}`);
      samplePods(`W02#${i}`);
    }
    ctx.notes.push(`deployments started ${start}→${dep().started}, open stayed 1, layout ${await describeLayout(frame)}`);
  });

  await run("W03", "Group and alternate tabs", "mouse drag + locator.click", async (ctx) => {
    const frame = clusterFrame(page, CLUSTER_A);

    ctx.at("group Deployments onto Pods");
    await dockOnto(frame, "deployments", "pods", 0.5, 0.5);
    await sleep(1000);
    expect(dep().open === 1, `grouped: open=${dep().open}`);

    for (let i = 1; i <= 5; i++) {
      ctx.at(`alternate ${i}: Pods tab`);
      await tab(frame, "pods").click();
      await sleep(1200);
      expect(dep().open === 0, `Pods tab ${i}: deployments open=${dep().open}`);
      samplePods(`W03#${i} pods tab`);
      ctx.at(`alternate ${i}: Deployments tab`);
      await tab(frame, "deployments").click();
      await sleep(1200);
      expect(dep().open === 1, `Deployments tab ${i}: open=${dep().open}`);
    }
  });

  await run("W04", "Close and reopen the Deployments panel", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);

    ctx.at("close Deployments");
    await frame.locator("[data-testid^=panel-close-button-leaf-deployments-]").click();
    await sleep(1500);
    expect(dep().open === 0, `closed: open=${dep().open}`);
    ctx.at("reopen from the catalog");
    await frame.locator("[data-testid^=panel-add-button-leaf-pods-]").click();
    await frame.locator("[data-testid=catalog-add-deployments]").click();
    await sleep(1500);
    expect(dep().open === 1, `reopened: open=${dep().open}`);
    samplePods("W04 reopened");
  });

  await run("W05", "Shared Pods subscription stays single and valid; no growth", "programmatic (API counters)", async (ctx) => {
    let frame = await freshHost(ctx);

    await sleep(1500);
    const finalTotal = dep().totalOpen;
    const counts = [...new Set(podsSamples.map((s) => s.open))];

    ctx.notes.push(`pods open values seen ${JSON.stringify(counts)} over ${podsSamples.length} samples; total open baseline ${baselineTotal} → ${finalTotal}`);
    expect(podsSamples.every((s) => s.open <= 1), "duplicate Pods watches");
    expect(podsSamples.filter((s) => !s.where.includes("deployments tab")).every((s) => s.open === 1), "Pods watch missing while a Pods consumer was mounted");
    expect(finalTotal <= baselineTotal, `total open grew ${baselineTotal} → ${finalTotal}`);
    frame = clusterFrame(page, CLUSTER_A);
  });

  // -------------------------------------------------------------------------
  // Stability: combined sequence
  // -------------------------------------------------------------------------
  await run("S01", "Combined stability sequence", "mouse drag + locator.click", async (ctx) => {
    const errorsBefore = new Set(consoleErrors.map((e) => e.text));
    const from = Date.now();
    const frame = await freshHost(ctx);

    ctx.at("2. Pods to the right");
    await dockOnto(frame, "pods", "deployments", 0.92, 0.5);
    await assertLayout(ctx, frame, "H(deployments, pods)");
    ctx.at("3. group as tabs");
    await dockOnto(frame, "pods", "deployments", 0.5, 0.5);
    await assertLayout(ctx, frame, "tabs[deployments,*pods]");
    ctx.at("4. alternate");
    await tab(frame, "deployments").click(); await sleep(500);
    await tab(frame, "pods").click(); await sleep(500);
    await tab(frame, "deployments").click(); await sleep(500);
    await assertLayout(ctx, frame, "tabs[*deployments,pods]");
    ctx.at("5. extract Deployments to the bottom");
    await dockOnto(frame, "deployments", "deployments", 0.5, 0.92);
    await assertLayout(ctx, frame, "V(pods, deployments)");
    ctx.at("6. resize");
    const before = await panelRects(frame);
    const box = await frame.locator("[data-testid^=branch-divider-]").first().boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120, { steps: 15 });
    await sleep(250);
    await page.mouse.up();
    await sleep(500);
    const after = await panelRects(frame);

    ctx.notes.push(`resize (divider dragged down 120px): pods ${before.pods.h}→${after.pods.h}px`);
    expect(after.pods.h - before.pods.h > 80, `top panel did not grow: pods ${before.pods.h}→${after.pods.h}`);
    ctx.at("7. collapse Pods");
    await control(frame, "collapse", "pods").click();
    await assertLayout(ctx, frame, "deployments");
    ctx.at("8. restore Pods");
    await restoreChip(frame, "pods").click();
    await sleep(500);
    const restored = await assertLayout(ctx, frame, "V(pods, deployments)");

    ctx.notes.push(`7–8. collapse/restore Pods: height ${after.pods.h}→${restored.pods.h}px`);
    expect(Math.abs(restored.pods.h - after.pods.h) <= 4, "restore lost the resized ratio");
    ctx.at("9. close Deployments");
    await frame.locator("[data-testid^=panel-close-button-leaf-deployments-]").click();
    await sleep(1200);
    await assertLayout(ctx, frame, "pods");
    expect(dep().open === 0, `deployments open after close ${dep().open}`);
    ctx.at("10. reopen Deployments");
    await frame.locator("[data-testid^=panel-add-button-leaf-pods-]").click();
    await frame.locator("[data-testid=catalog-add-deployments]").click();
    await sleep(1500);
    ctx.at("11. both views work");
    for (const kind of ["pods", "deployments"]) {
      expect(await frame.locator(`[data-testid^=panel-content-${kind}-] .KubeObjectListLayout`).first().isVisible(), `${kind} view not rendered`);
      expect(!(await frame.locator(`[data-testid^=panel-content-${kind}-] .load-error`).count()), `${kind} load error`);
    }
    ctx.at("12. active watches");
    expect(dep().open === 1 && watchCount(apis.a, WATCH_PATHS.pods).open === 1, `deployments=${dep().open} pods=${watchCount(apis.a, WATCH_PATHS.pods).open}`);
    await shot("s01-final", { evidence: true });
    ctx.at("13. no new console errors");
    const fresh = consoleErrors.filter((e) => e.at >= from && !errorsBefore.has(e.text));

    ctx.notes.push(`new console errors: ${fresh.length}`);
    expect(fresh.length === 0, `new console errors: ${fresh.map((e) => e.text).join(" | ")}`);
  });

  // -------------------------------------------------------------------------
  // H7.5 — native detached panels (sandboxed read-only windows fed by Main)
  // -------------------------------------------------------------------------
  let electronApp = env.app; // H7.7 relaunches replace the app
  const DETACHED_PAGE = "detached-tool.html";
  const pshot = async (name, target = page) => {
    await target.screenshot({ path: path.join(EVIDENCE_H75, `${name}.jpg`), type: "jpeg", quality: 70 });
    await target.screenshot({ path: path.join(ARTIFACTS, "screenshots", `${name}.png`) });
  };
  const detachedPages = () => electronApp.windows().filter((w) => w.url().endsWith(DETACHED_PAGE));
  // Native state only (Electron API): bounds, focus, minimized, web preferences, display.
  const native = (title) => electronApp.evaluate(({ BrowserWindow, screen }, t) => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith("detached-tool.html") && w.getTitle().endsWith(t));

    if (!win) return null;
    const prefs = win.webContents.getLastWebPreferences();

    return {
      bounds: win.getBounds(), minimized: win.isMinimized(), focused: win.isFocused(), visible: win.isVisible(),
      sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation, nodeIntegration: prefs.nodeIntegration,
      displayId: screen.getDisplayMatching(win.getBounds()).id,
    };
  }, title);
  const nativeAction = (title, action, arg) => electronApp.evaluate(({ BrowserWindow }, [t, a, x]) => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith("detached-tool.html") && w.getTitle().endsWith(t));

    if (a === "close") win?.close();
    if (a === "minimize") win?.minimize();
    if (a === "setBounds") win?.setBounds(x);

    return Boolean(win);
  }, [title, action, arg]);
  const closeAllDetached = () => electronApp.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed() && w.webContents.getURL().endsWith("detached-tool.html")) w.close();
  });
  const windowCount = () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length);
  const winState = (win) => win.evaluate(() => ({
    title: document.title,
    status: document.querySelector("[data-testid=detached-status]")?.textContent,
    rows: [...document.querySelectorAll("[data-testid=detached-list-rows] tr")].map((tr) => [...tr.children].map((td) => td.textContent)),
    readOnlyNotice: !document.querySelector("[data-testid=detached-readonly-notice]").hidden,
    banner: !document.querySelector("[data-testid=detached-production-banner]").hidden,
    badge: document.querySelector("[data-testid=detached-environment-badge]")?.textContent,
    accent: getComputedStyle(document.body).borderTopColor,
    accentWidth: getComputedStyle(document.body).borderTopWidth,
    buttons: [...document.querySelectorAll("button")].filter((b) => !b.hidden).map((b) => b.textContent.trim()),
    tableWidth: document.querySelector("[data-testid=detached-list]")?.getBoundingClientRect().width ?? 0,
    innerWidth: window.innerWidth,
  }));
  const contextOf = (win) => win.evaluate(() => window.lensDetachedTool.getContext().then((c) => c.descriptor));
  // Real UI: hover the header (controls fade in) and click "Open in a separate window".
  const detachViaUi = async (frame, kind) => {
    await panelHeader(frame, kind).hover();
    const opened = electronApp.waitForEvent("window", { timeout: 20_000 });

    await control(frame, "detach", kind).click();
    const win = await opened;

    await win.waitForLoadState("domcontentloaded");
    await win.locator("[data-testid=detached-status]", { hasText: "live" }).waitFor({ timeout: 20_000 });

    return win;
  };
  const placeholder = (frame, kind) => frame.locator(`[data-testid^=panel-detached-placeholder-leaf-${kind}-]`);
  const dockedList = (frame, kind) => panel(frame, kind).locator(".KubeObjectListLayout");
  const pods = () => watchCount(apis.a, WATCH_PATHS.pods);
  const prun = (id, name, input, fn, timeout) => run(id, name, input, async (ctx) => {
    try {
      await fn(ctx);
    } finally {
      await closeAllDetached().catch(() => {});
      await sleep(600);
    }
  }, timeout);

  await prun("P01", "Detach Pods", "hover + locator.click + waitForEvent(window)", async (ctx) => {
    const frame = await freshHost(ctx);

    expect(await dockedList(frame, "pods").count() > 0, "Pods view not mounted before detaching");

    ctx.at("detach Pods from its header");
    const windowsBefore = await windowCount();
    const win = await detachViaUi(frame, "pods");
    const state = await winState(win);
    const nat = await native("Pods");

    ctx.notes.push(`window ${win.url().split("/").pop()} "${state.title}" status ${state.status}; rows ${JSON.stringify(state.rows)}; buttons [${state.buttons}]; webPreferences sandbox=${nat.sandbox} contextIsolation=${nat.contextIsolation} nodeIntegration=${nat.nodeIntegration}`);
    expect(await windowCount() === windowsBefore + 1, "no new native window");
    expect(win.url().startsWith("file://") && win.url().endsWith(DETACHED_PAGE), `window url ${win.url()}`);
    expect(nat.sandbox === true && nat.contextIsolation === true && nat.nodeIntegration === false, "window is not sandboxed");
    expect(nat.visible, "window not visible");
    expect(state.title.endsWith("h7-synthetic · Pods") && state.status === "live", `title/status ${state.title} ${state.status}`);
    expect(state.rows.length === 1 && state.rows[0][0] === "h7-pod-0" && state.rows[0][2] === "Running" && state.rows[0][3] === "2/2", `rows ${JSON.stringify(state.rows)}`);
    expect(state.readOnlyNotice, "read-only notice hidden");
    expect(state.buttons.join() === "Redock", `unexpected controls: ${state.buttons}`);
    await pshot("p01-pods-window", win);
    await pshot("p01-main-placeholder");
  });

  await prun("P02", "Detach Deployments", "hover + locator.click", async (ctx) => {
    const frame = await freshHost(ctx);
    const win = await detachViaUi(frame, "deployments");
    const state = await winState(win);

    ctx.notes.push(`"${state.title}" rows ${JSON.stringify(state.rows)}`);
    expect(state.title.endsWith("h7-synthetic · Deployments"), state.title);
    expect(state.rows.length === 1 && state.rows[0][0] === "h7-deploy" && state.rows[0][3] === "1/1", `rows ${JSON.stringify(state.rows)}`);
    expect(detachedPages().length === 1, `detached windows ${detachedPages().length}`);
    await pshot("p02-deployments-window", win);
  });

  await prun("P03", "Detached panel has no second active view", "hover + locator.click", async (ctx) => {
    const frame = await freshHost(ctx);

    ctx.at("baseline: both panels collapsed (no docked list view mounted)");
    await control(frame, "collapse", "deployments").click();
    await control(frame, "collapse", "pods").click();
    await sleep(2000);
    const baseline = { pods: pods().open, deployments: dep().open };

    await restoreChip(frame, "pods").click();
    await restoreChip(frame, "deployments").click();
    await panel(frame, "deployments").waitFor();
    expect(await until(() => dep().open === 1), `deployments watch before ${dep().open}`);

    ctx.at("detach both");
    await detachViaUi(frame, "deployments");
    await detachViaUi(frame, "pods");
    await sleep(2000);
    const views = { pods: await dockedList(frame, "pods").count(), deployments: await dockedList(frame, "deployments").count() };
    const placeholders = { pods: await placeholder(frame, "pods").count(), deployments: await placeholder(frame, "deployments").count() };

    ctx.notes.push(`docked list views ${JSON.stringify(views)}; placeholders ${JSON.stringify(placeholders)}; frame baseline with no list view mounted ${JSON.stringify(baseline)}; detached: deployments open=${dep().open} pods open=${pods().open}`);
    expect(views.pods === 0 && views.deployments === 0, "a docked list view is still mounted");
    expect(placeholders.pods === 1 && placeholders.deployments === 1, "placeholders missing");
    // Each detached window adds exactly one watch (owned by Main) to what the frame keeps without views.
    expect(dep().open === baseline.deployments + 1 && pods().open === baseline.pods + 1, `watches deployments=${dep().open} pods=${pods().open}, baseline ${JSON.stringify(baseline)}`);
  });

  await prun("P04", "External window keeps the clusterId", "hover + locator.click", async (ctx) => {
    const frame = await freshHost(ctx);
    const win = await detachViaUi(frame, "pods");
    const descriptor = await contextOf(win);
    const tab = await win.locator("[data-testid=detached-tab]").textContent();

    ctx.notes.push(`descriptor ${JSON.stringify(descriptor)}; tab "${tab}"`);
    expect(descriptor.clusterId === CLUSTER_A && descriptor.toolKind === "resource-list" && descriptor.tabId === "pods", "window identity");
    expect(descriptor.list?.kind === "Pod" && descriptor.list?.namespace === "h7-synthetic", `list ${JSON.stringify(descriptor.list)}`);
    expect(tab === "global-docking / pods", tab);
    expect(await frame.locator("[data-testid=global-panel-host]").getAttribute("data-cluster-id") === CLUSTER_A, "origin host cluster");
  });

  await prun("P05", "Window shows cluster color and environment", "Settings swatch + hover + locator.click", async (ctx) => {
    ctx.at("set cluster A color to Teal in Settings");
    let frame = await pickInSettings(CLUSTER_A, { color: "Teal" });

    frame = await freshHost(ctx);
    const win = await detachViaUi(frame, "pods");
    const state = await winState(win);
    const descriptor = await contextOf(win);

    ctx.notes.push(`accent ${state.accentWidth} ${state.accent}; badge ${state.badge}; environment ${descriptor.environment}; banner ${state.banner}`);
    expect(state.accent === TEAL && state.accentWidth === "2px", `accent ${state.accent} ${state.accentWidth}`);
    expect(descriptor.environment === "none" && !descriptor.isProduction && !state.banner, "cluster A must not look like production");
    await pshot("p05-window-teal-accent", win);
  });

  await prun("P06", "Explicit redock", "locator.click (window Redock)", async (ctx) => {
    const frame = await freshHost(ctx);
    const win = await detachViaUi(frame, "pods");
    const open = pods().open;

    await win.locator("[data-testid=detached-redock]").click();
    await sleep(1500);
    ctx.notes.push(`windows ${detachedPages().length}; placeholder ${await placeholder(frame, "pods").count()}; docked view ${await dockedList(frame, "pods").count()}; pods watches ${open}→${pods().open}`);
    expect(detachedPages().length === 0, "window still open");
    expect(await placeholder(frame, "pods").count() === 0 && await dockedList(frame, "pods").count() > 0, "Pods view did not come back");
    await assertLayout(ctx, frame, "H(pods, deployments)");
    expect(await until(() => pods().open === 1), `pods watches after redock ${pods().open}`);
  });

  await prun("P07", "Closing the window redocks", "BrowserWindow.close (OS close path)", async (ctx) => {
    const frame = await freshHost(ctx);

    await detachViaUi(frame, "deployments");
    expect(await nativeAction("Deployments", "close"), "window not found");
    await sleep(1500);
    ctx.notes.push(`windows ${detachedPages().length}; placeholder ${await placeholder(frame, "deployments").count()}; deployments open ${dep().open}`);
    expect(detachedPages().length === 0, "window still open");
    expect(await placeholder(frame, "deployments").count() === 0 && await dockedList(frame, "deployments").count() > 0, "Deployments did not come back");
    expect(await until(() => dep().open === 1), `deployments watch ${dep().open}`);
  });

  await prun("P08", "Detach/redock 10 times without duplicates", "hover + click ×10 (window Redock)", async (ctx) => {
    const frame = await freshHost(ctx);
    const metrics = () => electronApp.evaluate(({ app }) => ({ processes: app.getAppMetrics().length, rssMb: Math.round(process.memoryUsage().rss / 1048576) }));
    const startedBefore = dep().started;
    const errorsBefore = consoleErrors.length;
    const before = { windows: await windowCount(), ...(await metrics()) };
    const samples = [];

    for (let i = 1; i <= 10; i++) {
      ctx.at(`cycle ${i}`);
      const win = await detachViaUi(frame, "deployments");

      expect(detachedPages().length === 1 && await placeholder(frame, "deployments").count() === 1, `cycle ${i}: windows ${detachedPages().length}`);
      expect(await until(() => dep().open === 1), `cycle ${i} detached: deployments open ${dep().open}`);
      await win.locator("[data-testid=detached-redock]").click();
      await sleep(900);
      expect(await until(() => detachedPages().length === 0 && dep().open === 1), `cycle ${i} redocked: windows ${detachedPages().length} open ${dep().open}`);
      await assertLayout(ctx, frame, "H(pods, deployments)");
      samples.push((await metrics()).rssMb);
    }
    await sleep(1500);
    const after = { windows: await windowCount(), ...(await metrics()) };
    const appErrors = consoleErrors.slice(errorsBefore).filter((e) => !/webpack-dev-server|\/ws' failed/.test(e.text));

    ctx.notes.push(`windows ${before.windows}→${after.windows}; Electron processes ${before.processes}→${after.processes}; main RSS MB ${before.rssMb}→[${samples}]; deployments started +${dep().started - startedBefore}, open ${dep().open}; new app console errors ${appErrors.length}`);
    expect(after.windows === before.windows, "native windows leaked");
    expect(after.processes <= before.processes + 1, "renderer processes leaked");
    expect(dep().open === 1, "watches accumulated");
    expect(appErrors.length === 0, appErrors.map((e) => e.text).join(" | "));
  });

  await prun("P09", "Two detached windows work independently", "hover + click; synthetic watch events", async (ctx) => {
    const frame = await freshHost(ctx);
    const podsWin = await detachViaUi(frame, "pods");
    const depWin = await detachViaUi(frame, "deployments");

    ctx.at("push a Deployment event: only the Deployments window changes");
    apis.a.emit(WATCH_PATHS.deployments, { type: "ADDED", object: { metadata: { name: "h7-deploy-live", namespace: "h7-synthetic", creationTimestamp: "2026-11-02T02:00:00Z" }, spec: { replicas: 2 }, status: { readyReplicas: 1, availableReplicas: 1 } } });
    await sleep(800);
    const depRows = (await winState(depWin)).rows.map((r) => `${r[0]}:${r[3]}`);
    const podRows = (await winState(podsWin)).rows.map((r) => r[0]);

    ctx.at("push a Pod event: only the Pods window changes");
    apis.a.emit(WATCH_PATHS.pods, { type: "ADDED", object: { metadata: { name: "h7-pod-live", namespace: "h7-synthetic" }, status: { phase: "Pending", containerStatuses: [{ ready: false }] } } });
    await sleep(800);
    const podRowsAfter = (await winState(podsWin)).rows.map((r) => `${r[0]}:${r[2]}`);

    ctx.notes.push(`deployments window [${depRows}]; pods window [${podRows}] → [${podRowsAfter}]`);
    expect(depRows.join() === "h7-deploy:1/1,h7-deploy-live:1/2", `deployments ${depRows}`);
    expect(podRows.join() === "h7-pod-0", `pods changed on a deployment event: ${podRows}`);
    expect(podRowsAfter.join() === "h7-pod-0:Running,h7-pod-live:Pending", `pods ${podRowsAfter}`);
    await pshot("p09-two-windows-pods", podsWin);
  });

  await prun("P10", "Closing one window leaves the other working", "BrowserWindow.close + synthetic event", async (ctx) => {
    const frame = await freshHost(ctx);

    await detachViaUi(frame, "pods");
    const depWin = await detachViaUi(frame, "deployments");

    await nativeAction("Pods", "close");
    await sleep(1500);
    apis.a.emit(WATCH_PATHS.deployments, { type: "MODIFIED", object: { metadata: { name: "h7-deploy", namespace: "h7-synthetic" }, spec: { replicas: 3 }, status: { readyReplicas: 3, availableReplicas: 3 } } });
    await sleep(800);
    const state = await winState(depWin);

    ctx.notes.push(`pods placeholder ${await placeholder(frame, "pods").count()}; deployments window ${state.status} rows ${JSON.stringify(state.rows.map((r) => r[3]))}`);
    expect(await placeholder(frame, "pods").count() === 0 && await dockedList(frame, "pods").count() > 0, "Pods did not redock");
    expect(await placeholder(frame, "deployments").count() === 1, "Deployments lost its window");
    expect(state.status === "live" && state.rows[0]?.[3] === "3/3", `deployments window ${JSON.stringify(state.rows)}`);
  });

  await prun("P11", "Resize and move to another display", "BrowserWindow.setBounds + screen API", async (ctx) => {
    const frame = await freshHost(ctx);
    const win = await detachViaUi(frame, "pods");
    const displays = await electronApp.evaluate(({ screen }) => screen.getAllDisplays().map((d) => ({ id: d.id, workArea: d.workArea })));
    const sizes = [];

    for (const [w, h] of [[700, 420], [1300, 760]]) {
      await nativeAction("Pods", "setBounds", { ...(await native("Pods")).bounds, width: w, height: h });
      await sleep(600);
      const state = await winState(win);

      sizes.push(`${w}→inner ${state.innerWidth}/table ${Math.round(state.tableWidth)}`);
      expect(Math.abs(state.innerWidth - w) <= 2 && state.tableWidth >= state.innerWidth - 40, `content did not follow ${w}px: ${JSON.stringify(state)}`);
    }

    let moved = "single display: positioned inside its work area only";

    if (displays.length > 1) {
      const target = displays[1].workArea;

      await nativeAction("Pods", "setBounds", { x: target.x + 40, y: target.y + 40, width: 900, height: 600 });
      await sleep(600);
      const nat = await native("Pods");

      moved = `moved to display ${nat.displayId} (target ${displays[1].id})`;
      expect(nat.displayId === displays[1].id, moved);
      expect((await winState(win)).status === "live", "window stopped after moving");
    }
    ctx.notes.push(`displays ${displays.map((d) => `${d.id}:${d.workArea.width}x${d.workArea.height}@${d.workArea.x},${d.workArea.y}`).join(" ")}; sizes [${sizes.join("; ")}]; ${moved}`);
  });

  await prun("P12", "Minimize, restore and focus from OpenLens", "BrowserWindow.minimize + locator.click (Show window)", async (ctx) => {
    const frame = await freshHost(ctx);

    await detachViaUi(frame, "pods");
    await nativeAction("Pods", "minimize");
    await sleep(800);
    const minimized = await native("Pods");

    await placeholder(frame, "pods").locator("button", { hasText: "Show window" }).click();
    await sleep(1200);
    const restored = await native("Pods");

    ctx.notes.push(`minimized ${minimized.minimized} → after "Show window": minimized ${restored.minimized}, visible ${restored.visible}, focused ${restored.focused}; windows ${detachedPages().length}`);
    expect(minimized.minimized, "window did not minimize");
    expect(!restored.minimized && restored.visible, "window not restored from OpenLens");
    expect(detachedPages().length === 1, "Show window opened a second window");
  });

  await prun("P13", "Simulated open failure keeps the panel", "ipcMain handler swapped (controlled failure) + locator.click", async (ctx) => {
    const frame = await freshHost(ctx);

    ctx.at("make Main refuse the next detach");
    await electronApp.evaluate(({ ipcMain }) => {
      const handlers = ipcMain._invokeHandlers;

      globalThis.__h75Original = handlers.get("detached-tool:request-detach");
      handlers.set("detached-tool:request-detach", async () => { throw new Error("Simulated failure"); });
    });

    try {
      await panelHeader(frame, "pods").hover();
      await control(frame, "detach", "pods").click();
      await frame.locator("[data-testid^=panel-detach-error-leaf-pods-]").waitFor({ timeout: 10_000 });
      const message = await frame.locator("[data-testid^=panel-detach-error-leaf-pods-]").textContent();

      ctx.notes.push(`error shown: "${message}"; windows ${detachedPages().length}; docked view ${await dockedList(frame, "pods").count()}`);
      expect(detachedPages().length === 0, "a window opened anyway");
      expect(await placeholder(frame, "pods").count() === 0 && await dockedList(frame, "pods").count() > 0, "the panel disappeared");
      await pshot("p13-open-failure");
    } finally {
      await electronApp.evaluate(({ ipcMain }) => { ipcMain._invokeHandlers.set("detached-tool:request-detach", globalThis.__h75Original); });
    }

    ctx.at("retry after the failure");
    await detachViaUi(frame, "pods");
    expect(await placeholder(frame, "pods").count() === 1, "retry did not detach");
  });

  await prun("P14", "Closing the origin workspace is safe", "locator.click (close tab, Disconnect)", async (ctx) => {
    let frame = await freshHost(ctx);
    const win = await detachViaUi(frame, "pods");

    ctx.at("close cluster A's workspace tab: the frame stays alive, the window keeps its cluster");
    await page.locator(`[data-testid=close-tab-${CLUSTER_A}]`).click();
    await sleep(1500);
    const descriptor = await contextOf(win);

    expect((await winState(win)).status === "live" && descriptor.clusterId === CLUSTER_A, "window lost its cluster");
    await win.locator("[data-testid=detached-redock]").click();
    await sleep(1200);
    expect(detachedPages().length === 0, "window still open");

    ctx.at("reopen cluster A from its hotbar pin (pinned in V07): one Pods panel, docked");
    await page.locator(`#hotbarPin-${CLUSTER_A}`).click();
    await page.locator(`[data-testid=workspace-tab-${CLUSTER_A}]`).waitFor({ timeout: 30_000 });
    frame = clusterFrame(page, CLUSTER_A);
    await frame.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
    expect(await panel(frame, "pods").count() === 1 && await placeholder(frame, "pods").count() === 0, "Pods duplicated or still detached");

    ctx.at("disconnect cluster A while Pods is detached: Main closes its window");
    await detachViaUi(frame, "pods");
    const openBefore = pods().open;

    await frame.locator("[data-testid=sidebar-cluster-dropdown]").click();
    await frame.locator(".MenuItem", { hasText: "Disconnect" }).first().click();
    await until(() => detachedPages().length === 0, 15_000);
    await sleep(1500);
    ctx.notes.push(`after close-tab: window live, cluster ${descriptor.clusterId}; after Disconnect: windows ${detachedPages().length}, pods watches ${openBefore}→${pods().open}`);
    expect(detachedPages().length === 0, "window outlived its cluster frame");
    // Both the window's watch and the frame's own Pods watch must close: since 1f36511 (H7.6) Disconnect no
    // longer reconnects the cluster, so nothing reopens a watch afterwards.
    expect(pods().open === 0, `watches still open after Disconnect: ${openBefore}→${pods().open}`);

    ctx.at("reconnect cluster A from its hotbar pin");
    await page.locator(`#hotbarPin-${CLUSTER_A}`).click();
    frame = await waitForClusterFrame(page, CLUSTER_A);
    await navigate(frame, "pods");
    await clusterFrame(page, CLUSTER_A).locator("[data-testid=global-panel-host]").waitFor({ timeout: 45_000 });
  });

  await prun("P15", "Different cluster: transfer refused", "frame IPC probe + hover + click", async (ctx) => {
    ctx.at("cluster B (PROD since V10) detaches its own Pods");
    let frameB = await activateCluster(page, clusterB);

    frameB = await reloadFrame(page, clusterB);
    await navigate(frameB, "pods");
    frameB = clusterFrame(page, clusterB);
    await panel(frameB, "pods").waitFor({ timeout: 30_000 });
    await sleep(800);
    const win = await detachViaUi(frameB, "pods");
    const state = await winState(win);
    const descriptor = await contextOf(win);

    expect(descriptor.clusterId === clusterB && descriptor.isProduction && state.banner && state.badge === "PROD", `B window ${JSON.stringify({ c: descriptor.clusterId, p: descriptor.isProduction, b: state.banner, badge: state.badge })}`);
    expect(state.title.startsWith("[PRODUCTION] "), state.title);
    await pshot("p15-prod-window-cluster-b", win);

    ctx.at("frame B asks Main for a window of cluster A, and to redock A's panel");
    const attempts = await frameB.evaluate(async (a) => {
      const { ipcRenderer } = require("electron");
      const result = async (channel, payload) => ipcRenderer.invoke(channel, payload).then(() => "accepted", (e) => `refused: ${String(e.message).slice(-60)}`);

      return {
        detach: await result("detached-tool:request-detach", { clusterId: a, workspaceId: "global-docking", tabId: "pods", toolKind: "resource-list", list: { kind: "Pod" } }),
        redock: await result("detached-tool:frame-request-redock", { clusterId: a, workspaceId: "global-docking", tabId: "pods", toolKind: "resource-list" }),
      };
    }, CLUSTER_A);

    ctx.notes.push(`B window cluster ${descriptor.clusterId.slice(0, 8)} PROD banner ${state.banner}; cross-cluster detach ${attempts.detach}; cross-cluster redock ${attempts.redock}; rejected mutations a=${apis.a.stats().rejected} b=${apis.b.stats().rejected}`);
    expect(attempts.detach.startsWith("refused") && attempts.redock.startsWith("refused"), JSON.stringify(attempts));
    expect(detachedPages().length === 1, "a cluster A window was created from cluster B");
    expect(apis.a.stats().rejected === 0 && apis.b.stats().rejected === 0, "write attempted against Kubernetes");
  });

  await prun("P16", "Flag OFF keeps the classic UI", "locator.click (sidebar)", async (ctx) => {
    let frame = await activateCluster(page, CLUSTER_A);

    await setFlag(frame, false);
    frame = await reloadFrame(page, CLUSTER_A);
    await navigate(frame, "pods");
    await frame.locator(".KubeObjectListLayout").first().waitFor({ timeout: 20_000 });
    const hosts = await frame.locator("[data-testid=global-panel-host]").count();
    const detachButtons = await frame.locator("[data-testid^=panel-detach-button-leaf-]").count();

    ctx.notes.push(`flag OFF: hosts ${hosts}, global detach buttons ${detachButtons}, detached windows ${detachedPages().length}`);
    expect(hosts === 0 && detachButtons === 0 && detachedPages().length === 0, "global docking chrome with the flag OFF");
    await setFlag(frame, true);
  });

  // -------------------------------------------------------------------------
  // H7.6 — Disconnect lifecycle: the cluster must stay disconnected with no open watches
  // -------------------------------------------------------------------------
  const openWatches = (api) => Object.values(api.stats().open).reduce((a, b) => a + b, 0);
  const frameCount = (id) => page.locator(`#cluster-frame-${id}`).count();
  const disconnectFromSidebar = async (frame) => {
    await frame.locator("[data-testid=sidebar-cluster-dropdown]").click();
    await frame.locator(".MenuItem", { hasText: "Disconnect" }).first().click();
  };
  const proxyPids = () => {
    try { return execSync("pgrep -f lens-k8s-proxy", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").filter(Boolean); } catch { return []; }
  };
  // Samples the cluster's API and the proxies at fixed times after Disconnect. From t+2 every sample must
  // show 0 watches, no frame for the cluster and no proxy started after Disconnect (t+0 is only recorded).
  const assertStaysDisconnected = async (ctx, api, id, times = [0, 2, 5, 10, 20], proxiesBefore = proxyPids()) => {
    const t0 = Date.now();
    const samples = [];
    const failures = [];

    for (const t of times) {
      await sleep(Math.max(0, t * 1000 - (Date.now() - t0)));
      const watches = openWatches(api);
      const frames = await frameCount(id);
      const newProxies = proxyPids().filter((pid) => !proxiesBefore.includes(pid));

      samples.push(`t+${t}s watches=${watches} frames=${frames} newProxies=${newProxies.length}`);
      if (t >= 2 && (watches !== 0 || frames !== 0 || newProxies.length)) failures.push(`t+${t}s`);
    }
    ctx.notes.push(`after Disconnect: ${samples.join("; ")}`);
    expect(failures.length === 0, `cluster active again after Disconnect at ${failures.join(", ")}: ${samples.join("; ")}`);
  };
  // Reconnect through real UI: its workspace tab when still listed, otherwise its hotbar pin (pinned in V07).
  const connect = async (id) => {
    const tabLocator = page.locator(`[data-testid=workspace-tab-${id}]`);

    if (await tabLocator.count()) await tabLocator.click();
    else await page.locator(`#hotbarPin-${id}`).click();

    return waitForClusterFrame(page, id);
  };
  const drun = (id, name, input, fn, timeout) => prun(id, name, input, async (ctx) => {
    await connect(CLUSTER_A); // visible (and connected) before each scenario
    await fn(ctx);
  }, timeout);
  const disconnectWith = async (ctx, keep, times) => {
    const frame = await freshHost(ctx);

    for (const kind of ["pods", "deployments"].filter((k) => !keep.includes(k))) {
      await panelHeader(frame, kind).hover();
      await control(frame, "close", kind).click();
      await panel(frame, kind).waitFor({ state: "detached", timeout: 10_000 });
    }
    await sleep(1500);
    const before = { pods: pods().open, deployments: watchCount(apis.a, WATCH_PATHS.deployments).open, total: openWatches(apis.a) };

    ctx.notes.push(`before Disconnect (${keep.join("+")}): ${JSON.stringify(before)}`);
    expect(keep.every((k) => before[k] >= 1), `the ${keep.join("+")} watch was not open before Disconnect`);
    ctx.at("Disconnect from the sidebar cluster menu");
    const proxies = proxyPids();

    await disconnectFromSidebar(frame);
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A, times, proxies);
  };

  await drun("DC01", "Disconnect with Pods open (ON)", "hover × + sidebar Disconnect", (ctx) => disconnectWith(ctx, ["pods"], [0, 2, 5, 10, 20, 60]));
  await drun("DC02", "Disconnect with Deployments open (ON)", "hover × + sidebar Disconnect", (ctx) => disconnectWith(ctx, ["deployments"]));
  await drun("DC03", "Disconnect with both panels (ON)", "sidebar Disconnect", (ctx) => disconnectWith(ctx, ["pods", "deployments"]));

  await drun("DC04", "Disconnect with a detached window", "detach + sidebar Disconnect", async (ctx) => {
    const frame = await freshHost(ctx);

    await detachViaUi(frame, "pods");
    expect(pods().open >= 2, `expected frame + window Pods watches, got ${pods().open}`);
    const proxies = proxyPids();

    await disconnectFromSidebar(frame);
    await until(() => detachedPages().length === 0, 15_000);
    expect(detachedPages().length === 0, "detached window outlived Disconnect");
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A, undefined, proxies);
  });

  await drun("DC05", "Disconnect with the flag OFF (classic)", "sidebar Disconnect", async (ctx) => {
    let frame = await activateCluster(page, CLUSTER_A);

    await setFlag(frame, false);
    try {
      frame = await reloadFrame(page, CLUSTER_A);
      await navigate(frame, "pods");
      await frame.locator(".KubeObjectListLayout").first().waitFor({ timeout: 20_000 });
      await sleep(1500);
      expect(pods().open >= 1 && await frame.locator("[data-testid=global-panel-host]").count() === 0, "classic Pods view not live");
      await disconnectFromSidebar(frame);
      await assertStaysDisconnected(ctx, apis.a, CLUSTER_A);
    } finally {
      await setFlag(await connect(CLUSTER_A), true);
    }
  });

  await drun("DC06", "Reconnect after Disconnect", "sidebar Disconnect + workspace tab/hotbar", async (ctx) => {
    let frame = await freshHost(ctx);

    await disconnectFromSidebar(frame);
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A);
    ctx.at("reconnect: exactly one Pods watch again");
    frame = await connect(CLUSTER_A);
    await navigate(frame, "pods");
    await clusterFrame(page, CLUSTER_A).locator("[data-testid=global-panel-host]").waitFor({ timeout: 45_000 });
    await sleep(2500);
    ctx.notes.push(`after reconnect: pods ${pods().open}, total ${openWatches(apis.a)}`);
    expect(pods().open === 1, `expected one Pods watch after reconnect, got ${pods().open}`);
    await disconnectFromSidebar(clusterFrame(page, CLUSTER_A));
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A);
  });

  await drun("DC07", "Two clusters: Disconnect A leaves B intact", "workspace tabs + sidebar Disconnect", async (ctx) => {
    clusterB ??= await openClusterFromCatalog(page, CLUSTER_B_NAME); // opened by an earlier scenario in a full run
    const frameB = await connect(clusterB);

    await navigate(frameB, "pods");
    await sleep(2500);
    const bBefore = openWatches(apis.b);

    expect(bBefore >= 1, "cluster B has no open watches");
    await connect(CLUSTER_A);
    const frameA = await freshHost(ctx);

    await disconnectFromSidebar(frameA);
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A);
    ctx.notes.push(`B watches ${bBefore}→${openWatches(apis.b)}`);
    expect(openWatches(apis.b) === bBefore && await frameCount(clusterB) === 1, `cluster B changed: ${bBefore}→${openWatches(apis.b)}`);
  });

  await drun("DC08", "Switch clusters after reconnect", "workspace tabs A↔B", async (ctx) => {
    clusterB ??= await openClusterFromCatalog(page, CLUSTER_B_NAME);
    const bBefore = openWatches(apis.b);
    await connect(clusterB);
    const frame = await connect(CLUSTER_A);
    await navigate(frame, "pods");
    await sleep(2500);
    const aOpen = pods().open;

    await connect(clusterB);
    await sleep(1500);
    await connect(CLUSTER_A);
    await sleep(1500);
    ctx.notes.push(`A pods ${aOpen}→${pods().open}; B total ${bBefore}→${openWatches(apis.b)}`);
    expect(aOpen === 1 && pods().open === 1, `A Pods watches changed on switching: ${aOpen}→${pods().open}`);
    expect(openWatches(apis.b) === bBefore, `B watches changed on switching: ${bBefore}→${openWatches(apis.b)}`);
  });

  // -------------------------------------------------------------------------
  // H7.6.1 — workload views (existing Lens lists) inside the global host
  // -------------------------------------------------------------------------
  const NS = "/namespaces/h7-synthetic";
  const WL = {
    statefulsets: { route: "stateful-sets", row: "h7-sts", watch: `/apis/apps/v1${NS}/statefulsets` },
    daemonsets: { route: "daemon-sets", row: "h7-ds", watch: `/apis/apps/v1${NS}/daemonsets` },
    replicasets: { route: "replica-sets", row: "h7-rs", watch: `/apis/apps/v1${NS}/replicasets` },
    jobs: { route: "jobs", row: "h7-job", watch: `/apis/batch/v1${NS}/jobs` },
    cronjobs: { route: "cron-jobs", row: "h7-cron", watch: `/apis/batch/v1${NS}/cronjobs` },
  };
  const ROUTE_OF = { pods: "pods", deployments: "deployments", ...Object.fromEntries(Object.entries(WL).map(([k, v]) => [k, v.route])) };
  const SEVEN = ["pods", "deployments", ...Object.keys(WL)];
  const wlWatch = (kind) => watchCount(apis.a, WL[kind].watch);
  const wshot = (name) => page.screenshot({ path: path.join(EVIDENCE_H761, `${name}.jpg`), type: "jpeg", quality: 70 }).then(() => shot(name));
  const catalogCards = (frame) => frame.evaluate(() => [...document.querySelectorAll("[data-testid^=catalog-card-]")].map((e) => e.dataset.testid.slice("catalog-card-".length)).filter((kind) => kind !== "terminal" && kind !== "kubetail"));
  // The panel must hold the real Lens list with the synthetic row; a mounted-but-empty panel is a failure.
  const expectRendered = async (frame, kind) => {
    const list = panel(frame, kind).locator(".KubeObjectListLayout").first();

    await list.waitFor({ timeout: 20_000 });
    await list.locator(".TableRow", { hasText: WL[kind].row }).first().waitFor({ timeout: 20_000 });
  };
  const expectOneWatch = async (kind) => {
    expect(await until(() => wlWatch(kind).open === 1), `${kind} watch open=${wlWatch(kind).open}, expected 1`);
  };
  const addFromCatalog = async (frame, kind, via = "pods") => {
    await control(frame, "add", via).click();
    await frame.locator("[data-testid=catalog-modal]").waitFor();
    await frame.locator(`[data-testid=catalog-add-${kind}]`).click();
    await panel(frame, kind).waitFor({ timeout: 15_000 });
    await sleep(700);
  };
  const hostCluster = (frame) => frame.locator("[data-testid=global-panel-host]").getAttribute("data-cluster-id");
  const headerCluster = (frame, kind) => panelHeader(frame, kind).getAttribute("data-cluster-id");

  // WL01–WL05: real sidebar navigation to each workload route shows its panel inside the host.
  for (const [n, kind, label] of [[1, "statefulsets", "StatefulSets"], [2, "daemonsets", "DaemonSets"], [3, "replicasets", "ReplicaSets"], [4, "jobs", "Jobs"], [5, "cronjobs", "CronJobs"]]) {
    await drun(`WL0${n}`, `Open ${label}`, "locator.click (sidebar)", async (ctx) => {
      let frame = await freshHost(ctx);

      ctx.at(`sidebar → ${label}`);
      await navigate(frame, WL[kind].route);
      frame = clusterFrame(page, CLUSTER_A);
      await frame.locator("[data-testid=global-panel-host]").waitFor({ timeout: 20_000 });
      await expectRendered(frame, kind);
      await expectOneWatch(kind);
      const layout = await describeLayout(frame);

      ctx.notes.push(`layout ${layout}; ${kind} watch ${WL[kind].watch} open=${wlWatch(kind).open}; host ${await hostCluster(frame)}; header ${await headerCluster(frame, kind)}`);
      expect(await panel(frame, kind).count() === 1, `${kind} panels ${await panel(frame, kind).count()}`);
      expect(layout.includes("pods") && layout.includes("deployments") && layout.includes(kind), `layout ${layout}`);
      expect(await hostCluster(frame) === CLUSTER_A && await headerCluster(frame, kind) === CLUSTER_A, "panel not bound to cluster A");
      if (n === 1) await wshot("wl01-statefulsets-from-sidebar");
    });
  }

  await drun("WL06", "Open the seven types from the catalog", "locator.click (catalog)", async (ctx) => {
    const frame = await freshHost(ctx);

    await control(frame, "add", "pods").click();
    await frame.locator("[data-testid=catalog-modal]").waitFor();
    const offered = await catalogCards(frame);

    ctx.notes.push(`offered with Pods+Deployments open [${offered}]`);
    expect(offered.join() === `${NEW_WORKLOADS},${NEW_RESOURCES}`, `offered ${offered}`);
    await frame.locator("[data-testid=catalog-close-button]").click();

    // Spread the splits so every panel keeps room for its table.
    for (const [kind, via] of [["statefulsets", "pods"], ["daemonsets", "deployments"], ["replicasets", "statefulsets"], ["jobs", "daemonsets"], ["cronjobs", "pods"]]) {
      ctx.at(`add ${kind} from the catalog of ${via}`);
      await addFromCatalog(frame, kind, via);
    }
    for (const kind of Object.keys(WL)) {
      await expectRendered(frame, kind);
      await expectOneWatch(kind);
    }
    const counts = await Promise.all(SEVEN.map((k) => panel(frame, k).count()));

    await control(frame, "add", "pods").click();
    await frame.locator("[data-testid=catalog-modal]").waitFor();
    const left = await catalogCards(frame);

    await wshot("wl06-seven-workloads");
    await frame.locator("[data-testid=catalog-close-button]").click();
    ctx.notes.push(`panels ${SEVEN.map((k, i) => `${k}=${counts[i]}`).join(" ")}; layout ${await describeLayout(frame)}; catalog left [${left}]; pods watch ${pods().open}`);
    expect(counts.every((c) => c === 1), `panel counts ${counts}`);
    expect(left.join() === NEW_RESOURCES, `catalog after the seven workloads offers ${left}`);
    expect(pods().open === 1, `pods watch ${pods().open}`);
  });

  await drun("WL07", "Navigate between workloads without unmounting the host", "locator.click (sidebar)", async (ctx) => {
    let frame = await freshHost(ctx);

    await frame.evaluate(() => { document.querySelector("[data-testid=global-panel-host]").dataset.wlMark = "same-node"; });
    for (const kind of [...Object.keys(WL), "deployments", "pods"]) {
      ctx.at(`sidebar → ${kind}`);
      await navigate(frame, ROUTE_OF[kind]);
      frame = clusterFrame(page, CLUSTER_A);
      const mark = await frame.locator("[data-testid=global-panel-host]").getAttribute("data-wl-mark");

      expect(mark === "same-node", `host remounted on ${kind}`);
      expect(await panel(frame, kind).count() === 1, `${kind} panel not shown after navigating`);
    }
    await sleep(1500);
    const opens = Object.keys(WL).map((k) => wlWatch(k).open);

    ctx.notes.push(`layout ${await describeLayout(frame)}; watches ${Object.keys(WL).map((k, i) => `${k}=${opens[i]}`).join(" ")} pods=${pods().open}`);
    expect(opens.every((o) => o === 1) && pods().open === 1, "duplicated or missing watches after navigating");
  });

  await drun("WL08", "Drag a new workload onto another (four sides)", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    await addFromCatalog(frame, "statefulsets", "pods");
    await addFromCatalog(frame, "jobs", "deployments");
    const started = wlWatch("statefulsets").started;
    const sides = [
      ["left", 0.08, 0.5, (r) => leftOf(r.statefulsets, r.jobs)],
      ["right", 0.92, 0.5, (r) => leftOf(r.jobs, r.statefulsets)],
      ["top", 0.5, 0.08, (r) => above(r.statefulsets, r.jobs)],
      ["bottom", 0.5, 0.92, (r) => above(r.jobs, r.statefulsets)],
    ];

    for (const [side, fx, fy, holds] of sides) {
      ctx.at(`drop StatefulSets on the ${side} of Jobs`);
      const indicator = await dockOnto(frame, "statefulsets", "jobs", fx, fy);
      const rects = await panelRects(frame);

      ctx.notes.push(`${side}: indicator ${indicator?.position}; ${await describeLayout(frame)}`);
      expect(indicator?.position === side && indicator.target === "jobs", `${side} indicator ${JSON.stringify(indicator)}`);
      expect(holds(rects), `${side}: geometry ${JSON.stringify([rects.statefulsets, rects.jobs])}`);
    }
    await expectRendered(frame, "statefulsets");
    await expectOneWatch("statefulsets");
    ctx.notes.push(`statefulsets watch started +${wlWatch("statefulsets").started - started} over 4 moves`);
  });

  await drun("WL09", "Group workloads as tabs", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    await addFromCatalog(frame, "daemonsets", "pods");
    await addFromCatalog(frame, "replicasets", "deployments");
    await addFromCatalog(frame, "cronjobs", "deployments");
    await dockOnto(frame, "daemonsets", "replicasets", 0.5, 0.5);
    expect((await describeLayout(frame)).includes("tabs[replicasets,*daemonsets]"), `layout ${await describeLayout(frame)}`);
    // Only the active tab is rendered; its group is the drop zone.
    await dockOnto(frame, "cronjobs", "daemonsets", 0.5, 0.5);
    const layout = await describeLayout(frame);

    ctx.notes.push(`layout ${layout}`);
    expect(/tabs\[[^\]]*replicasets[^\]]*\]/.test(layout) && /tabs\[[^\]]*daemonsets/.test(layout) && /tabs\[[^\]]*\*cronjobs/.test(layout), `layout ${layout}`);
    await expectRendered(frame, "cronjobs");
    await wshot("wl09-workload-tabs");
  });

  await drun("WL10", "Switch and reorder tabs", "locator.click + mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    await addFromCatalog(frame, "daemonsets", "pods");
    await addFromCatalog(frame, "replicasets", "deployments");
    await dockOnto(frame, "daemonsets", "replicasets", 0.5, 0.5);
    expect((await describeLayout(frame)).includes("tabs[replicasets,*daemonsets]"), `layout ${await describeLayout(frame)}`);
    const startDs = wlWatch("daemonsets").started;

    for (let i = 0; i < 3; i++) {
      ctx.at(`switch round ${i + 1}`);
      await tab(frame, "replicasets").click();
      await expectRendered(frame, "replicasets");
      expect(await until(() => wlWatch("daemonsets").open === 0 && wlWatch("replicasets").open === 1), `inactive DaemonSets still watched (${wlWatch("daemonsets").open}/${wlWatch("replicasets").open})`);
      await tab(frame, "daemonsets").click();
      await expectRendered(frame, "daemonsets");
      expect(await until(() => wlWatch("daemonsets").open === 1 && wlWatch("replicasets").open === 0), `inactive ReplicaSets still watched (${wlWatch("daemonsets").open}/${wlWatch("replicasets").open})`);
    }
    ctx.notes.push(`3 switches: daemonsets started +${wlWatch("daemonsets").started - startDs}, open ${wlWatch("daemonsets").open}`);

    ctx.at("reorder: drag the active DaemonSets header onto the ReplicaSets tab");
    const indicator = await dragHeader(page, frame, "daemonsets", await pointIn(tab(frame, "replicasets"), 0.5, 0.5));
    const order = await frame.evaluate(() => [...document.querySelectorAll("button[data-testid^=tab-leaf-]")]
      .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
      .map((t) => t.dataset.testid.replace(/^tab-leaf-/, "").replace(/-\d+-\w+$/, "")));

    ctx.notes.push(`indicator ${indicator?.position}; tab order ${order}; layout ${await describeLayout(frame)}`);
    expect(indicator?.position === "center", `indicator ${JSON.stringify(indicator)}`);
    expect(order.join() === "daemonsets,replicasets", `tab order ${order}`);
  });

  await drun("WL11", "Collapse and restore a new view", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);

    await addFromCatalog(frame, "replicasets", "deployments");
    await expectOneWatch("replicasets");
    const { started } = wlWatch("replicasets");
    const lists = () => apis.a.stats().lists[WL.replicasets.watch] ?? 0;
    const listsBefore = lists();

    await control(frame, "collapse", "replicasets").click();
    await sleep(500);
    expect(!(await panel(frame, "replicasets").count()) && await restoreChip(frame, "replicasets").isVisible(), "ReplicaSets not collapsed into a restore band");
    expect(await until(() => wlWatch("replicasets").open === 0), `collapsed ReplicaSets still watched (${wlWatch("replicasets").open})`);
    await wshot("wl11-collapsed-replicasets");
    await restoreChip(frame, "replicasets").click();
    await expectRendered(frame, "replicasets");
    await expectOneWatch("replicasets");
    ctx.notes.push(`watch started +${wlWatch("replicasets").started - started}; list requests +${lists() - listsBefore}; layout ${await describeLayout(frame)}`);
    expect(wlWatch("replicasets").started - started === 1, "restore did not query again exactly once");
  });

  await drun("WL12", "Close and reopen from the catalog", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);

    await addFromCatalog(frame, "cronjobs", "pods");
    await expectOneWatch("cronjobs");
    await panelHeader(frame, "cronjobs").hover();
    await control(frame, "close", "cronjobs").click();
    await panel(frame, "cronjobs").waitFor({ state: "detached", timeout: 10_000 });
    expect(await until(() => wlWatch("cronjobs").open === 0), `closed CronJobs still watched (${wlWatch("cronjobs").open})`);
    expect(!(await restoreChip(frame, "cronjobs").count()), "a closed panel is not a collapsed panel");
    await control(frame, "add", "pods").click();
    await frame.locator("[data-testid=catalog-modal]").waitFor();
    const offered = await catalogCards(frame);

    expect(offered.includes("cronjobs"), `catalog does not offer CronJobs again: ${offered}`);
    await frame.locator("[data-testid=catalog-add-cronjobs]").click();
    await expectRendered(frame, "cronjobs");
    await expectOneWatch("cronjobs");
    ctx.notes.push(`reopened; catalog had [${offered}]; layout ${await describeLayout(frame)}`);
  });

  await drun("WL13", "Color, environment and cluster identity", "locator.click (Settings → swatch + Production)", async (ctx) => {
    let frame = await freshHost(ctx);

    await addFromCatalog(frame, "statefulsets", "pods");
    await addFromCatalog(frame, "jobs", "deployments");
    frame = await pickInSettings(CLUSTER_A, { color: "Pink", environment: "Production" });
    const headers = await accents(frame, HEADERS);
    const labels = await frame.evaluate(() => [...document.querySelectorAll("[data-testid^=panel-env-leaf-]")].map((e) => `${e.textContent.trim()}|${e.getAttribute("aria-label")}`));
    const flags = await frame.evaluate(() => [...document.querySelectorAll("[data-testid^=panel-header-leaf-]")].map((e) => e.dataset.production));

    ctx.notes.push(`headers ${headers.map((h) => `${h.color}/${h.px}px/${h.height}px/${h.cluster}`).join(", ")}; labels [${labels.join(", ")}]`);
    expect(headers.length === 4, `expected 4 headers, got ${headers.length}`);
    expectAccent(headers, PINK, "headers incl. StatefulSets and Jobs");
    expect(headers.every((h) => h.height === 28 && h.cluster === CLUSTER_A), "header height or cluster id");
    expect(labels.length === 4 && labels.every((l) => /PROD\|/.test(l) && l.includes("Environment: Production")), `labels ${labels}`);
    expect(flags.every((f) => f === "true"), "data-production");
    await wshot("wl13-identity-prod");
    await control(frame, "collapse", "jobs").click();
    await sleep(400);
    expectAccent(await accents(frame, CHIPS), PINK, "collapsed Jobs band");
  });

  await drun("WL14", "Detach not offered for unsupported types", "hover + DOM", async (ctx) => {
    const frame = await freshHost(ctx);

    for (const [kind, via] of [["statefulsets", "pods"], ["daemonsets", "deployments"], ["replicasets", "statefulsets"], ["jobs", "daemonsets"], ["cronjobs", "pods"]]) {
      await addFromCatalog(frame, kind, via);
    }
    const detachable = {};

    for (const kind of SEVEN) {
      await panelHeader(frame, kind).hover();
      await sleep(200);
      detachable[kind] = await control(frame, "detach", kind).count();
    }
    ctx.notes.push(`detach buttons ${JSON.stringify(detachable)}; detached windows ${detachedPages().length}`);
    expect(detachable.pods === 1 && detachable.deployments === 1, "detached windows are not enabled in this run (Pods/Deployments lost their button)");
    expect(Object.keys(WL).every((k) => detachable[k] === 0), "a type without a safe window offers detach");
    expect(detachedPages().length === 0, "a window was opened");
  });

  await drun("WL15", "Disconnect with no orphan watches", "catalog + sidebar Disconnect", async (ctx) => {
    const frame = await freshHost(ctx);

    for (const [kind, via] of [["statefulsets", "pods"], ["jobs", "deployments"], ["cronjobs", "statefulsets"]]) {
      await addFromCatalog(frame, kind, via);
      await expectOneWatch(kind);
    }
    ctx.notes.push(`before Disconnect: total ${openWatches(apis.a)}; ${["statefulsets", "jobs", "cronjobs"].map((k) => `${k}=${wlWatch(k).open}`).join(" ")}`);
    const proxies = proxyPids();

    await disconnectFromSidebar(frame);
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A, [0, 2, 5, 10, 20], proxies);
  });

  // -------------------------------------------------------------------------
  // H7.6.2 — navigation to panels that already exist (inactive tab, collapsed)
  // -------------------------------------------------------------------------
  const activeTabs = (frame) => frame.evaluate(() => [...document.querySelectorAll("button[data-testid^=tab-leaf-]")]
    .filter((t) => t.className.includes("active")).map((t) => t.dataset.testid.replace(/^tab-leaf-/, "").replace(/-\d+-\w+$/, "")));
  const dep2 = () => watchCount(apis.a, WATCH_PATHS.deployments);

  await drun("RN09", "Activate an inactive tab from the sidebar", "mouse drag + locator.click (sidebar)", async (ctx) => {
    let frame = await freshHost(ctx);

    await dockOnto(frame, "deployments", "pods", 0.5, 0.5);
    await tab(frame, "pods").click();
    await sleep(600);
    await assertLayout(ctx, frame, "tabs[*pods,deployments]");
    expect(await until(() => dep2().open === 0), `inactive Deployments still watched (${dep2().open})`);
    const started = dep2().started;

    for (let i = 1; i <= 3; i++) {
      ctx.at(`sidebar → Deployments (${i})`);
      await navigate(frame, "deployments");
      frame = clusterFrame(page, CLUSTER_A);
      await assertLayout(ctx, frame, "tabs[pods,*deployments]");
      await panel(frame, "deployments").locator(".KubeObjectListLayout .TableRow", { hasText: "h7-deploy" }).first().waitFor({ timeout: 20_000 });
    }
    expect(await until(() => dep2().open === 1), `deployments watch ${dep2().open}`);
    const panels = await frame.locator("[data-testid^=panel-container-leaf-deployments-]").count();

    ctx.at("sidebar → Pods brings Pods back");
    await navigate(frame, "pods");
    await assertLayout(ctx, frame, "tabs[*pods,deployments]");
    ctx.notes.push(`active ${await activeTabs(frame)}; deployments panels ${panels}; deployments watch started +${dep2().started - started}, open ${dep2().open}`);
    expect(panels === 1, `deployments panels ${panels}`);
    expect(dep2().started - started === 1, `deployments watch started ${dep2().started - started} times for 3 navigations`);
    expect(await until(() => dep2().open === 0 && pods().open === 1), `watches deployments=${dep2().open} pods=${pods().open}`);
    await shot("rn09-inactive-tab");
  });

  await drun("RN10", "Restore a collapsed panel from its route", "locator.click + sidebar", async (ctx) => {
    let frame = await freshHost(ctx);

    await dockOnto(frame, "deployments", "pods", 0.5, 0.5);
    ctx.at("add StatefulSets beside the group (catalog of the active Deployments tab)");
    await addFromCatalog(frame, "statefulsets", "deployments");
    await control(frame, "collapse", "deployments").click();
    await sleep(500);
    expect(await restoreChip(frame, "deployments").isVisible(), "Deployments not collapsed");
    const before = await describeLayout(frame);

    ctx.at("sidebar → Deployments");
    await navigate(frame, "deployments");
    frame = clusterFrame(page, CLUSTER_A);
    const after = await describeLayout(frame);

    ctx.notes.push(`${before} → ${after}`);
    expect(!(await restoreChip(frame, "deployments").count()), "restore band still shown");
    expect(after.includes("*deployments") && after.includes("statefulsets"), `layout ${after}`);
    await panel(frame, "deployments").locator(".TableRow", { hasText: "h7-deploy" }).first().waitFor({ timeout: 20_000 });
    expect(await until(() => dep2().open === 1), `deployments watch ${dep2().open}`);
    expect(await panel(frame, "statefulsets").count() === 1 && await panel(frame, "deployments").count() === 1, "panel duplicated or lost");
  });

  // -------------------------------------------------------------------------
  // H7.6.2 — resources and networking (existing Lens route views inside the host)
  // -------------------------------------------------------------------------
  const RES = {
    events: { nav: [null, "events"], row: "h7 synthetic event", watch: `/api/v1${NS}/events` },
    configmaps: { nav: ["config", "config-maps"], row: "h7-config", watch: `/api/v1${NS}/configmaps` },
    services: { nav: ["network", "services"], row: "h7-svc", watch: `/api/v1${NS}/services` },
    ingresses: { nav: ["network", "ingresses"], row: "h7-ingress", watch: `/apis/networking.k8s.io/v1${NS}/ingresses` },
    persistentvolumeclaims: { nav: ["storage", "persistent-volume-claims"], row: "h7-pvc", watch: `/api/v1${NS}/persistentvolumeclaims` },
    nodes: { nav: [null, "nodes"], row: "h7-node", watch: "/api/v1/nodes" },
  };
  const resWatch = (kind) => watchCount(apis.a, RES[kind].watch);
  const rshot = (name) => page.screenshot({ path: path.join(EVIDENCE_H762, `${name}.jpg`), type: "jpeg", quality: 70 }).then(() => shot(name));
  // Real sidebar clicks; collapsed parents (Config, Network, Storage) are expanded first.
  const navTo = async (frame, kind) => {
    const [parent, child] = RES[kind]?.nav ?? [null, ROUTE_OF[kind]];
    const link = frame.locator(`[data-testid=sidebar-item-link-for-${child}]`);

    if (parent && !(await link.isVisible().catch(() => false))) await frame.locator(`[data-testid=sidebar-item-link-for-${parent}]`).click();
    await link.click({ timeout: 45_000 });
    await sleep(1200);

    return clusterFrame(page, CLUSTER_A);
  };
  const expectResRendered = async (frame, kind) => {
    await panel(frame, kind).locator(".KubeObjectListLayout").first().waitFor({ timeout: 20_000 });
    await panel(frame, kind).locator(".TableRow", { hasText: RES[kind].row }).first().waitFor({ timeout: 20_000 });
  };
  const expectResWatch = async (kind, n = 1) => {
    expect(await until(() => resWatch(kind).open === n), `${kind} watch open=${resWatch(kind).open}, expected ${n}`);
  };
  // Nodes metrics are POSTed by the cluster frame through Node (invisible to Chromium's network events);
  // each poll makes Main run Prometheus discovery against the synthetic API, which counts it.
  const pollTotal = () => Object.values(apis.a.stats().polling).reduce((a, b) => a + b, 0);

  for (const [n, kind, label] of [[1, "events", "Events"], [2, "configmaps", "ConfigMaps"], [3, "services", "Services"], [4, "ingresses", "Ingresses"], [5, "persistentvolumeclaims", "PVCs"], [6, "nodes", "Nodes"]]) {
    await drun(`RN0${n}`, `Open ${label}`, "locator.click (sidebar)", async (ctx) => {
      let frame = await freshHost(ctx);

      ctx.at(`sidebar → ${label}`);
      frame = await navTo(frame, kind);
      await frame.locator("[data-testid=global-panel-host]").waitFor({ timeout: 20_000 });
      await expectResRendered(frame, kind);
      await expectResWatch(kind);
      const layout = await describeLayout(frame);

      ctx.notes.push(`layout ${layout}; watch ${RES[kind].watch} open=${resWatch(kind).open}; header cluster ${await headerCluster(frame, kind)}`);
      expect(await panel(frame, kind).count() === 1 && layout.includes(kind) && layout.includes("pods"), `layout ${layout}`);
      expect(await headerCluster(frame, kind) === CLUSTER_A, "panel not bound to cluster A");
      if (kind === "nodes" || kind === "configmaps" || kind === "ingresses") await rshot(`rn0${n}-${kind}`);
    });
  }

  await drun("RN07", "Catalog offers exactly 13 types", "locator.click (catalog)", async (ctx) => {
    const frame = await freshHost(ctx);

    await control(frame, "add", "pods").click();
    await frame.locator("[data-testid=catalog-modal]").waitFor();
    const offered = await catalogCards(frame);
    const hosted = ["pods", "deployments", ...offered];

    ctx.notes.push(`open pods,deployments + offered [${offered}] = ${hosted.length}`);
    await rshot("rn07-catalog-13");
    await frame.locator("[data-testid=catalog-close-button]").click();
    expect(hosted.length === 13 && new Set(hosted).size === 13, `hosted kinds ${hosted.length}`);
    expect(offered.join() === `${NEW_WORKLOADS},${NEW_RESOURCES}`, `offered ${offered}`);
    expect(!offered.some((k) => /secret|kubetail|terminal|editor|details/.test(k)), `unexpected kinds offered: ${offered}`);
  });

  await drun("RN08", "Navigate between resources keeping the host", "locator.click (sidebar)", async (ctx) => {
    let frame = await freshHost(ctx);

    await frame.evaluate(() => { document.querySelector("[data-testid=global-panel-host]").dataset.rnMark = "same-node"; });
    for (const kind of [...Object.keys(RES), "pods"]) {
      ctx.at(`sidebar → ${kind}`);
      frame = await navTo(frame, kind);
      expect(await frame.locator("[data-testid=global-panel-host]").getAttribute("data-rn-mark") === "same-node", `host remounted on ${kind}`);
      expect(await panel(frame, kind).count() === 1, `${kind} panel not shown`);
    }
    await sleep(1500);
    const opens = Object.keys(RES).map((k) => resWatch(k).open);

    ctx.notes.push(`layout ${await describeLayout(frame)}; watches ${Object.keys(RES).map((k, i) => `${k}=${opens[i]}`).join(" ")}`);
    expect(opens.every((o) => o === 1), `duplicated or missing resource watches ${opens}`);
  });

  await drun("RN11", "Drag and group the new resources", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    await addFromCatalog(frame, "configmaps", "pods");
    await addFromCatalog(frame, "services", "deployments");
    for (const [side, fx, fy, holds] of [
      ["left", 0.08, 0.5, (r) => leftOf(r.configmaps, r.services)],
      ["right", 0.92, 0.5, (r) => leftOf(r.services, r.configmaps)],
      ["top", 0.5, 0.08, (r) => above(r.configmaps, r.services)],
      ["bottom", 0.5, 0.92, (r) => above(r.services, r.configmaps)],
    ]) {
      const indicator = await dockOnto(frame, "configmaps", "services", fx, fy);
      const rects = await panelRects(frame);

      ctx.notes.push(`${side}: ${indicator?.position}`);
      expect(indicator?.position === side && holds(rects), `${side}: indicator ${JSON.stringify(indicator)} rects ${JSON.stringify([rects.configmaps, rects.services])}`);
    }
    await dockOnto(frame, "configmaps", "services", 0.5, 0.5);
    const layout = await describeLayout(frame);

    ctx.notes.push(`grouped: ${layout}`);
    expect(layout.includes("tabs[services,*configmaps]"), `layout ${layout}`);
    await expectResRendered(frame, "configmaps");
    expect(await until(() => resWatch("configmaps").open === 1 && resWatch("services").open === 0), `watches configmaps=${resWatch("configmaps").open} services=${resWatch("services").open}`);
    const clusters = await frame.evaluate(() => [...document.querySelectorAll("[data-testid^=panel-header-leaf-]")].map((h) => h.dataset.clusterId));

    expect(clusters.every((c) => c === CLUSTER_A), `clusterId changed by a move: ${clusters}`);
    await rshot("rn11-resources-tabs");
  });

  await drun("RN12", "Reorder tabs and move with the keyboard", "mouse drag + keyboard (Tab, Enter, End)", async (ctx) => {
    const frame = await freshHost(ctx);

    await addFromCatalog(frame, "services", "deployments");
    await addFromCatalog(frame, "ingresses", "services");
    await dockOnto(frame, "ingresses", "services", 0.5, 0.5);
    expect((await describeLayout(frame)).includes("tabs[services,*ingresses]"), `layout ${await describeLayout(frame)}`);
    ctx.at("reorder: drag Ingresses onto the Services tab");
    const indicator = await dragHeader(page, frame, "ingresses", await pointIn(tab(frame, "services"), 0.5, 0.5));
    const order = await frame.evaluate(() => [...document.querySelectorAll("button[data-testid^=tab-leaf-]")]
      .sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x)
      .map((t) => t.dataset.testid.replace(/^tab-leaf-/, "").replace(/-\d+-\w+$/, "")));

    expect(indicator?.position === "center" && order.join() === "ingresses,services", `indicator ${indicator?.position}, order ${order}`);

    ctx.at("keyboard: move Pods into the Ingresses group");
    const menu = frame.locator("[data-testid^=panel-move-menu-leaf-pods-]");

    await focusPanel(frame, "pods");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(String(await activeTestId(frame)).startsWith("panel-move-button-leaf-pods-"), `focus on ${await activeTestId(frame)}`);
    await page.keyboard.press("Enter");
    await menu.waitFor();
    const options = await menu.locator("[role=menuitem]").allTextContents();
    const target = options.findIndex((o) => /group|tab/i.test(o) && /ingress/i.test(o));

    ctx.notes.push(`order ${order}; menu [${options.join(" | ")}]`);
    expect(target >= 0, `no keyboard option to group with Ingresses: ${options}`);
    for (let i = 0; i < target; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await sleep(600);
    const layout = await describeLayout(frame);

    ctx.notes.push(`after keyboard move: ${layout}`);
    expect(/tabs\[[^\]]*ingresses[^\]]*\*pods|tabs\[[^\]]*\*pods[^\]]*ingresses/.test(layout), `layout ${layout}`);
  });

  await drun("RN13", "Collapse, close and reopen", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);

    await addFromCatalog(frame, "ingresses", "deployments");
    await expectResWatch("ingresses");
    const started = resWatch("ingresses").started;

    await control(frame, "collapse", "ingresses").click();
    expect(await restoreChip(frame, "ingresses").isVisible(), "no restore band for Ingresses");
    await expectResWatch("ingresses", 0);
    await restoreChip(frame, "ingresses").click();
    await expectResRendered(frame, "ingresses");
    await expectResWatch("ingresses");
    await panelHeader(frame, "ingresses").hover();
    await control(frame, "close", "ingresses").click();
    await panel(frame, "ingresses").waitFor({ state: "detached", timeout: 10_000 });
    await expectResWatch("ingresses", 0);
    await addFromCatalog(frame, "ingresses", "deployments");
    await expectResRendered(frame, "ingresses");
    await expectResWatch("ingresses");
    ctx.notes.push(`ingresses watch started +${resWatch("ingresses").started - started} (restore + reopen), cancelled total ${apis.a.stats().cancelled}`);
    expect(resWatch("ingresses").started - started === 2, "restore/reopen did not query exactly once each");
  });

  await drun("RN14", "Color, environment and PROD", "locator.click (Settings → swatch + Production)", async (ctx) => {
    let frame = await freshHost(ctx);

    await addFromCatalog(frame, "configmaps", "pods");
    await addFromCatalog(frame, "nodes", "deployments");
    frame = await pickInSettings(CLUSTER_A, { color: "Indigo", environment: "Production" });
    const headers = await accents(frame, HEADERS);
    const labels = await frame.evaluate(() => [...document.querySelectorAll("[data-testid^=panel-env-leaf-]")].map((e) => `${e.textContent.trim()}|${e.getAttribute("aria-label")}`));

    ctx.notes.push(`headers ${headers.map((h) => `${h.color}/${h.px}px/${h.height}px`).join(", ")}; labels ${labels.length}`);
    expect(headers.length === 4, `headers ${headers.length}`);
    expectAccent(headers, INDIGO, "headers incl. ConfigMaps and Nodes");
    expect(headers.every((h) => h.height === 28 && h.cluster === CLUSTER_A), "header height or cluster");
    expect(labels.length === 4 && labels.every((l) => /PROD\|/.test(l)), `labels ${labels}`);
    await rshot("rn14-identity-prod");
  });

  await drun("RN15", "Nodes: polling without accumulating requests", "catalog + mouse drag + collapse/restore/close", async (ctx) => {
    const frame = await freshHost(ctx);
    const p0 = pollTotal();

    await addFromCatalog(frame, "nodes", "deployments");
    await expectResRendered(frame, "nodes");
    expect(await until(() => pollTotal() > p0, 10_000), "Nodes did not poll metrics");
    await sleep(4000);
    const perPoll = pollTotal() - p0; // discovery requests of one poll (the immediate one on mount)

    ctx.at("move Nodes three times");
    for (const [fx, fy] of [[0.08, 0.5], [0.5, 0.92], [0.92, 0.5]]) await dockOnto(frame, "nodes", "pods", fx, fy);
    await sleep(4000);
    const pMoved = pollTotal();

    ctx.at("65 s with Nodes visible: one timer only");
    await sleep(65_000);
    const steady = pollTotal() - pMoved;

    ctx.at("collapse: no requests for 35 s");
    await control(frame, "collapse", "nodes").click();
    await sleep(4000);
    const pCollapsed = pollTotal();

    await sleep(35_000);
    const collapsed = pollTotal() - pCollapsed;
    const pRestore = pollTotal();

    await restoreChip(frame, "nodes").click();
    await expectResRendered(frame, "nodes");
    await sleep(4000);
    const restored = pollTotal() - pRestore;

    await panelHeader(frame, "nodes").hover();
    await control(frame, "close", "nodes").click();
    await sleep(4000);
    const pClosed = pollTotal();

    await sleep(35_000);
    const closed = pollTotal() - pClosed;

    ctx.notes.push(`discovery requests per poll ${perPoll}; steady 65 s after 3 moves ${steady} (${(steady / perPoll).toFixed(1)} polls); collapsed 35 s ${collapsed}; restore ${restored}; closed 35 s ${closed}; nodes watch ${resWatch("nodes").open}; paths ${Object.keys(apis.a.stats().polling).join(", ")}`);
    expect(perPoll > 0 && steady <= 3 * perPoll, `metrics accumulate after moving: ${steady} requests in 65 s, ${perPoll} per poll (one 30 s timer gives 2 polls)`);
    expect(collapsed === 0, `collapsed Nodes still polls (${collapsed})`);
    expect(restored >= 1, "restored Nodes did not request metrics again");
    expect(closed === 0, `closed Nodes still polls (${closed})`);
    expect(resWatch("nodes").open === 0, `closed Nodes still watched (${resWatch("nodes").open})`);
  }, 300_000); // observes two 30 s polling windows plus collapse and close

  await drun("RN16", "Disconnect with no orphan watches or polling", "catalog + sidebar Disconnect", async (ctx) => {
    const frame = await freshHost(ctx);

    for (const [kind, via] of [["nodes", "pods"], ["ingresses", "deployments"], ["events", "nodes"]]) {
      await addFromCatalog(frame, kind, via);
      await expectResWatch(kind);
    }
    ctx.notes.push(`before Disconnect: total watches ${openWatches(apis.a)}`);
    const proxies = proxyPids();

    await disconnectFromSidebar(frame);
    let p2 = pollTotal();

    setTimeout(() => { p2 = pollTotal(); }, 2000); // baseline at t+2 s, like the other samples
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A, [0, 2, 5, 10, 20, 40], proxies);
    const polled = pollTotal() - p2;

    ctx.notes.push(`metrics discovery requests after t+2s: ${polled}; rejected writes ${apis.a.stats().rejected}`);
    expect(polled === 0, `Nodes kept polling after Disconnect (${polled})`);
  });

  // -------------------------------------------------------------------------
  // H7.6.3 — Resource Details pilot: a docked panel bound to one resource, not to the route
  // -------------------------------------------------------------------------
  const DETAILS = "resource-details";
  const boundDetails = (frame) => frame.locator("[data-testid=bound-details]");
  const identityOf = (frame) => frame.evaluate(() => [...document.querySelectorAll("[data-testid=bound-details], [data-testid=bound-details-unavailable]")]
    .map((el) => `${el.dataset.kind}/${el.dataset.namespace}/${el.dataset.name}@${el.dataset.clusterId}`));
  const POD_ID = `Pod/h7-synthetic/h7-pod-0@${CLUSTER_A}`;
  const DEPLOY_ID = `Deployment/h7-synthetic/h7-deploy@${CLUSTER_A}`;
  // Real UI: the row "⋮" menu of the list view → "Details (docked)".
  const dockDetailsFromRow = async (frame, kind, name) => {
    const row = panel(frame, kind).locator(".TableRow", { hasText: name }).first();

    await row.waitFor({ timeout: 20_000 });
    await row.locator(`[aria-label="Actions for ${name}"]`).click();
    const item = frame.locator(".Menu.MenuActions [data-testid=dock-details-btn]").last();

    await item.waitFor({ timeout: 10_000 });
    await item.click();
    await sleep(800);
  };
  const expectPodDetails = async (frame) => {
    await boundDetails(frame).waitFor({ timeout: 20_000 });
    const ids = await identityOf(frame);

    expect(ids.join() === POD_ID, `bound identity ${ids}`);
    expect(await boundDetails(frame).locator("text=h7-pod-0").count() > 0, "Pod details content not rendered");
  };

  await drun("DT01", "Open Details from a Pod row", "row menu click", async (ctx) => {
    const frame = await freshHost(ctx);
    const podsWatchBefore = pods().open;

    ctx.at("Pods row ⋮ → Details (docked)");
    await dockDetailsFromRow(frame, "pods", "h7-pod-0");
    await expectPodDetails(frame);
    const layout = await describeLayout(frame);

    ctx.notes.push(`layout ${layout}; identity ${await identityOf(frame)}; pods watch ${podsWatchBefore}→${pods().open}; header ${await panelHeader(frame, DETAILS).innerText()}`);
    expect(layout.includes(DETAILS) && layout.includes("pods") && layout.includes("deployments"), `layout ${layout}`);
    expect(await until(() => pods().open === 1), `pods watches ${pods().open} (details must share the list watch)`);
    expect(await headerCluster(frame, DETAILS) === CLUSTER_A, "details header cluster");
    await shot("dt01-pod-details");
    await page.screenshot({ path: path.join(EVIDENCE_H763, "dt01-pod-details.jpg"), type: "jpeg", quality: 70 });
  });

  await drun("DT02", "Distinct resources keep distinct identities", "row menu click", async (ctx) => {
    const frame = await freshHost(ctx);

    await dockDetailsFromRow(frame, "pods", "h7-pod-0");
    await dockDetailsFromRow(frame, "deployments", "h7-deploy");
    await dockDetailsFromRow(frame, "pods", "h7-pod-0"); // same resource again: reveal, not duplicate
    const ids = (await identityOf(frame)).sort();

    ctx.notes.push(`identities [${ids}]; details panels ${await panel(frame, DETAILS).count()}`);
    expect(ids.join() === [DEPLOY_ID, POD_ID].sort().join(), `identities ${ids}`);
    expect(await panel(frame, DETAILS).count() === 2, "a resource got two Details panels");
  });

  await drun("DT03", "Dock Details on four sides and as a tab", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);

    await dockDetailsFromRow(frame, "pods", "h7-pod-0");
    for (const [side, fx, fy, holds] of [
      ["left", 0.08, 0.5, (r) => leftOf(r[DETAILS], r.deployments)],
      ["right", 0.92, 0.5, (r) => leftOf(r.deployments, r[DETAILS])],
      ["top", 0.5, 0.08, (r) => above(r[DETAILS], r.deployments)],
      ["bottom", 0.5, 0.92, (r) => above(r.deployments, r[DETAILS])],
    ]) {
      const indicator = await dockOnto(frame, DETAILS, "deployments", fx, fy);

      expect(indicator?.position === side && holds(await panelRects(frame)), `${side}: ${JSON.stringify(indicator)}`);
      expect((await identityOf(frame)).join() === POD_ID, `identity changed after ${side}: ${await identityOf(frame)}`);
    }
    await dockOnto(frame, DETAILS, "deployments", 0.5, 0.5);
    const layout = await describeLayout(frame);

    ctx.notes.push(`grouped ${layout}`);
    expect(layout.includes(`*${DETAILS}`) && /tabs\[/.test(layout), `layout ${layout}`);
    await expectPodDetails(frame);
    await page.screenshot({ path: path.join(EVIDENCE_H763, "dt03-details-tab.jpg"), type: "jpeg", quality: 70 });
  });

  await drun("DT04", "Collapse and restore; shared watch released only when unused", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);
    // Pods keeps a frame-wide watch even with every panel collapsed (baseline), so a Deployment is bound here.
    const dep = () => watchCount(apis.a, WATCH_PATHS.deployments);

    await dockDetailsFromRow(frame, "deployments", "h7-deploy");
    expect(await until(() => dep().open === 1), `deployments watch with list + Details ${dep().open} (must be shared)`);
    ctx.at("close Pods and Deployments: Details alone keeps the Deployments watch");
    for (const kind of ["pods", "deployments"]) {
      await panelHeader(frame, kind).hover();
      await control(frame, "close", kind).click();
      await panel(frame, kind).waitFor({ state: "detached", timeout: 10_000 });
    }
    expect(await until(() => dep().open === 1), `deployments watch with Details only ${dep().open}`);
    ctx.at("collapse Details: no consumer left");
    await control(frame, "collapse", DETAILS).click();
    expect(await restoreChip(frame, DETAILS).isVisible(), "no restore band for Details");
    expect(await until(() => dep().open === 0), `collapsed Details still watching (${dep().open})`);
    const started = dep().started;

    await restoreChip(frame, DETAILS).click();
    await boundDetails(frame).waitFor({ timeout: 20_000 });
    expect((await identityOf(frame)).join() === DEPLOY_ID, `identity after restore ${await identityOf(frame)}`);
    expect(await until(() => dep().open === 1), `deployments watch after restore ${dep().open}`);
    ctx.notes.push(`deployments watch started +${dep().started - started} on restore; identity ${await identityOf(frame)}`);
    expect(dep().started - started === 1, "restore did not re-subscribe exactly once");
  });

  await drun("DT05", "Route changes keep the bound resource", "locator.click (sidebar)", async (ctx) => {
    let frame = await freshHost(ctx);

    await dockDetailsFromRow(frame, "pods", "h7-pod-0");
    for (const kind of ["deployments", "services", "nodes", "pods"]) {
      ctx.at(`sidebar → ${kind}`);
      frame = await navTo(frame, kind);
      expect((await identityOf(frame)).join() === POD_ID, `identity after ${kind}: ${await identityOf(frame)}`);
    }
    await expectPodDetails(frame);
    ctx.notes.push(`layout ${await describeLayout(frame)}`);
  });

  await drun("DT06", "Close and reopen Details", "locator.click + row menu", async (ctx) => {
    const frame = await freshHost(ctx);

    await dockDetailsFromRow(frame, "deployments", "h7-deploy");
    await panelHeader(frame, DETAILS).hover();
    await control(frame, "close", DETAILS).click();
    await panel(frame, DETAILS).waitFor({ state: "detached", timeout: 10_000 });
    expect(!(await restoreChip(frame, DETAILS).count()), "closed Details shows a restore band");
    await dockDetailsFromRow(frame, "deployments", "h7-deploy");
    await boundDetails(frame).waitFor({ timeout: 20_000 });
    ctx.notes.push(`reopened identity ${await identityOf(frame)}; deployments watch ${watchCount(apis.a, WATCH_PATHS.deployments).open}`);
    expect((await identityOf(frame)).join() === DEPLOY_ID, `identity ${await identityOf(frame)}`);
    expect(await until(() => watchCount(apis.a, WATCH_PATHS.deployments).open === 1), "deployments watch duplicated");
  });

  await drun("DT07", "Flag OFF: no docked Details entry", "locator.click (row menu)", async (ctx) => {
    let frame = await activateCluster(page, CLUSTER_A);

    await setFlag(frame, false);
    try {
      frame = await reloadFrame(page, CLUSTER_A);
      await navigate(frame, "pods");
      const row = frame.locator(".TableRow", { hasText: "h7-pod-0" }).first();

      await row.waitFor({ timeout: 20_000 });
      await row.locator("[aria-label=\"Actions for h7-pod-0\"]").click();
      await frame.locator(".Menu.MenuActions").last().waitFor();
      const items = await frame.locator(".Menu.MenuActions").last().locator("[data-testid]").evaluateAll((els) => els.map((e) => e.dataset.testid));

      ctx.notes.push(`classic row menu [${items}]`);
      expect(!items.includes("dock-details-btn"), "docked Details offered with the flag OFF");
      await page.keyboard.press("Escape");
    } finally {
      await setFlag(clusterFrame(page, CLUSTER_A), true);
    }
  });

  await drun("DT08", "Disconnect with Details open", "row menu + sidebar Disconnect", async (ctx) => {
    const frame = await freshHost(ctx);

    await dockDetailsFromRow(frame, "pods", "h7-pod-0");
    await dockDetailsFromRow(frame, "deployments", "h7-deploy");
    const proxies = proxyPids();

    ctx.notes.push(`before Disconnect: total watches ${openWatches(apis.a)}`);
    await disconnectFromSidebar(frame);
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A, [0, 2, 5, 10, 20], proxies);
    expect(apis.a.stats().rejected === 0, `writes ${apis.a.stats().rejected}`);
  });

  // -------------------------------------------------------------------------
  // H7.6.3B — Pod Logs in the host: history, follow and lifecycle survive moves; close/Disconnect release
  // -------------------------------------------------------------------------
  const LOGS = "pod-logs";
  const LOG_NS = "h7-synthetic";
  const logKey = (container, pod = "h7-pod-0") => `${LOG_NS}/${pod}/${container}`;
  const logStat = (api, container, pod) => api.stats().logs[logKey(container, pod)] ?? { total: 0, tail: 0, since: 0 };
  const boundLogs = (frame) => frame.locator("[data-testid=bound-logs]");
  const logIdentity = (frame) => frame.evaluate(() => [...document.querySelectorAll("[data-testid=bound-logs], [data-testid=bound-logs-unavailable]")]
    .map((el) => `${el.dataset.kind}/${el.dataset.namespace}/${el.dataset.name}:${el.dataset.container}@${el.dataset.clusterId}#${el.dataset.tabId}`));
  // Numbers of the log lines rendered right now ("... line 00049"); the list is virtualized, so this is the visible window.
  const lineNos = async (scope) => (await scope.locator(".LogRow").evaluateAll((els) => els.map((el) => el.textContent ?? "")))
    .map((text) => /line (\d{5})/.exec(text)?.[1]).filter(Boolean).map(Number);
  const hasLine = async (scope, n) => (await lineNos(scope)).includes(n);
  const currentCount = (api, container) => api.appendLogs(LOG_NS, "h7-pod-0", container, 0);
  // Real UI: the row "⋮" menu of the Pods list → "Logs (docked): <container>".
  const dockLogsFromRow = async (frame, container, name = "h7-pod-0") => {
    const row = panel(frame, "pods").locator(".TableRow", { hasText: name }).first();

    await row.waitFor({ timeout: 20_000 });
    await row.locator(`[aria-label="Actions for ${name}"]`).click();
    const item = frame.locator(`.Menu.MenuActions [data-testid=dock-logs-btn-${container}]`).last();

    await item.waitFor({ timeout: 10_000 });
    await item.click();
    await sleep(800);
  };
  const expectLogsShown = async (ctx, frame, scope, upTo) => {
    await scope.waitFor({ timeout: 20_000 });
    expect(await until(async () => hasLine(scope, upTo), 20_000), `line ${upTo} not shown: visible ${(await lineNos(scope)).join(",")}`);
  };
  // Real scroll position of the list (rendered rows include a direction-dependent overscan, so rows are not a position).
  const scrollState = (scope) => scope.locator(".LogList").first().evaluate((root) => {
    const el = [root, ...root.querySelectorAll("*")].find((node) => node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY));

    return el ? { top: Math.round(el.scrollTop), max: Math.round(el.scrollHeight - el.clientHeight) } : { top: 0, max: 0 };
  });
  const scrollLogs = async (scope, deltaY) => {
    const box = await scope.locator(".LogList").first().boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, deltaY);
    await sleep(1200); // the list debounces scroll state (700 ms)
  };
  // The poll runs every 10 s: wait for two periods to prove it stopped (or kept going).
  const requestsOver = async (api, container, ms = 25_000) => { const before = logStat(api, container).total; await sleep(ms); return logStat(api, container).total - before; };

  await drun("LG01", "Open Pod Logs of a container from its row menu", "row menu click", async (ctx) => {
    const frame = await freshHost(ctx);
    const base = logStat(apis.a, "app");
    const last = (await currentCount(apis.a, "app")) - 1;

    ctx.at("Pods row ⋮ → Logs (docked): app");
    await dockLogsFromRow(frame, "app");
    const logs = boundLogs(frame).first();

    await expectLogsShown(ctx, frame, logs, last);
    const layout = await describeLayout(frame);
    const ids = await logIdentity(frame);

    ctx.notes.push(`layout ${layout}; identity ${ids}; app requests ${base.total}→${logStat(apis.a, "app").total}; header ${await panelHeader(frame, LOGS).innerText()}`);
    expect(layout.includes(LOGS) && layout.includes("pods") && layout.includes("deployments"), `layout ${layout}`);
    expect(ids.length === 1 && ids[0].startsWith(`Pod/${LOG_NS}/h7-pod-0:app@${CLUSTER_A}#docked-logs:${CLUSTER_A}:${LOG_NS}:`), `identity ${ids}`);
    expect(await headerCluster(frame, LOGS) === CLUSTER_A, "logs header cluster");
    expect(logStat(apis.a, "app").tail - base.tail === 1, "the first open must be exactly one tail request");
    await shot("lg01-docked-logs");
    await page.screenshot({ path: path.join(EVIDENCE_H763B, "lg01-docked-logs.jpg"), type: "jpeg", quality: 70 });
  });

  await drun("LG02", "Lines come from the synthetic API and are consecutive", "row menu + mouse wheel", async (ctx) => {
    const frame = await freshHost(ctx);
    const last = (await currentCount(apis.a, "app")) - 1;

    await dockLogsFromRow(frame, "app");
    const logs = boundLogs(frame).first();

    await expectLogsShown(ctx, frame, logs, last);
    const tail = await lineNos(logs);
    const text = await logs.locator(".LogRow").first().innerText();

    ctx.notes.push(`visible ${tail[0]}..${tail.at(-1)} (${tail.length}); first row "${text.trim().slice(0, 60)}"`);
    expect(tail.every((n, i) => i === 0 || n === tail[i - 1] + 1), `visible lines are not consecutive: ${tail}`);
    expect(text.includes(`app@${apis.a.port}`), `row not served by API A: ${text}`);
    ctx.at("scroll up with the mouse wheel to the first line");
    await scrollLogs(logs, -20_000);
    expect(await hasLine(logs, 0), `history does not reach line 0: ${await lineNos(logs)}`);
  });

  await drun("LG03", "Drag Logs to four sides without losing history", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);
    const last = (await currentCount(apis.a, "app")) - 1;

    await dockLogsFromRow(frame, "app");
    await expectLogsShown(ctx, frame, boundLogs(frame).first(), last);
    const idBefore = (await logIdentity(frame)).join();
    const before = logStat(apis.a, "app");

    for (const [side, fx, fy, holds] of [
      ["left", 0.08, 0.5, (r) => leftOf(r[LOGS], r.deployments)],
      ["right", 0.92, 0.5, (r) => leftOf(r.deployments, r[LOGS])],
      ["top", 0.5, 0.08, (r) => above(r[LOGS], r.deployments)],
      ["bottom", 0.5, 0.92, (r) => above(r.deployments, r[LOGS])],
    ]) {
      const indicator = await dockOnto(frame, LOGS, "deployments", fx, fy);

      expect(indicator?.position === side && holds(await panelRects(frame)), `${side}: ${JSON.stringify(indicator)}`);
      expect((await logIdentity(frame)).join() === idBefore, `identity changed after ${side}: ${await logIdentity(frame)}`);
      await expectLogsShown(ctx, frame, boundLogs(frame).first(), last);
    }
    const after = logStat(apis.a, "app");

    ctx.notes.push(`app requests tail ${before.tail}→${after.tail}, since ${before.since}→${after.since}`);
    expect(after.tail === before.tail, `a remount reloaded the history (${after.tail - before.tail} extra tail requests)`);
    await scrollLogs(boundLogs(frame).first(), -20_000);
    expect(await hasLine(boundLogs(frame).first(), 0), "history lost after the moves");
  });

  await drun("LG04", "Group Logs with another panel as a tab", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);
    const last = (await currentCount(apis.a, "app")) - 1;

    await dockLogsFromRow(frame, "app");
    await expectLogsShown(ctx, frame, boundLogs(frame).first(), last);
    const tailBefore = logStat(apis.a, "app").tail;

    await dockOnto(frame, LOGS, "deployments", 0.5, 0.5);
    const layout = await describeLayout(frame);

    ctx.notes.push(`grouped ${layout}`);
    expect(layout.includes(`*${LOGS}`) && /tabs\[/.test(layout), `layout ${layout}`);
    await expectLogsShown(ctx, frame, boundLogs(frame).first(), last);
    expect(logStat(apis.a, "app").tail === tailBefore, "grouping reloaded the history");
  });

  await drun("LG05", "Switch tabs keeps lines", "locator.click (tabs)", async (ctx) => {
    const frame = await freshHost(ctx);
    const last = (await currentCount(apis.a, "app")) - 1;

    await dockLogsFromRow(frame, "app");
    await dockOnto(frame, LOGS, "deployments", 0.5, 0.5);
    await expectLogsShown(ctx, frame, boundLogs(frame).first(), last);
    const tailBefore = logStat(apis.a, "app").tail;

    for (let round = 0; round < 3; round++) {
      await tab(frame, "deployments").click();
      await sleep(600);
      expect(await boundLogs(frame).count() === 0, "an inactive tab keeps its logs mounted");
      await tab(frame, LOGS).click();
      await expectLogsShown(ctx, frame, boundLogs(frame).first(), last);
    }
    ctx.notes.push(`3 round trips; app tail requests ${tailBefore}→${logStat(apis.a, "app").tail}; identity ${await logIdentity(frame)}`);
    expect(logStat(apis.a, "app").tail === tailBefore, "switching tabs reloaded the history");
    await scrollLogs(boundLogs(frame).first(), -20_000);
    expect(await hasLine(boundLogs(frame).first(), 0), "history lost after switching tabs");
  }, 240_000);

  await drun("LG06", "Collapse stops polling, restore recovers the missed lines", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);
    let last = (await currentCount(apis.a, "app")) - 1;

    await dockLogsFromRow(frame, "app");
    await expectLogsShown(ctx, frame, boundLogs(frame).first(), last);
    const tailBefore = logStat(apis.a, "app").tail;

    ctx.at("collapse Logs: no consumer left");
    await control(frame, "collapse", LOGS).click();
    expect(await restoreChip(frame, LOGS).isVisible(), "no restore band for Logs");
    await sleep(500);
    const polled = await requestsOver(apis.a, "app");

    last = apis.a.appendLogs(LOG_NS, "h7-pod-0", "app", 4) - 1; // lines produced while collapsed
    ctx.notes.push(`requests while collapsed (25 s): ${polled}; appended up to line ${last}`);
    expect(polled === 0, `collapsed Logs kept polling (${polled} requests)`);
    ctx.at("restore");
    await restoreChip(frame, LOGS).click();
    await expectLogsShown(ctx, frame, boundLogs(frame).first(), last);
    ctx.notes.push(`after restore: tail ${tailBefore}→${logStat(apis.a, "app").tail}; visible ${(await lineNos(boundLogs(frame).first())).slice(-6)}`);
    expect(logStat(apis.a, "app").tail === tailBefore, "restore reloaded the history instead of resuming");
    expect(await logIdentity(frame).then((ids) => ids.length === 1), "restore duplicated the session");
  }, 240_000);

  await drun("LG07", "Follow, reading position and no duplicates", "mouse wheel + locator.click", async (ctx) => {
    const frame = await freshHost(ctx);
    let last = (await currentCount(apis.a, "app")) - 1;

    await dockLogsFromRow(frame, "app");
    const logs = () => boundLogs(frame).first();

    await expectLogsShown(ctx, frame, logs(), last);
    ctx.at("following: new lines arrive and the view stays at the bottom");
    last = apis.a.appendLogs(LOG_NS, "h7-pod-0", "app", 3) - 1;
    await expectLogsShown(ctx, frame, logs(), last); // next 10 s poll
    let visible = await lineNos(logs());

    expect(visible.filter((n) => n === last).length === 1, `last line shown ${visible.filter((n) => n === last).length} times`);
    expect(visible.every((n, i) => i === 0 || n === visible[i - 1] + 1), `duplicates or gaps while following: ${visible}`);

    ctx.at("reading old lines: scroll up, collapse and restore must not jump to the bottom");
    await sleep(1500); // Lens schedules scrollToBottom 500 ms after a new line while following: let it fire before reading
    await scrollLogs(logs(), -20_000);
    const readingAt = await scrollState(logs());

    await control(frame, "collapse", LOGS).click();
    last = apis.a.appendLogs(LOG_NS, "h7-pod-0", "app", 3) - 1;
    await sleep(500);
    await restoreChip(frame, LOGS).click();
    await logs().waitFor({ timeout: 20_000 });
    await sleep(2500);
    visible = await lineNos(logs());
    const restoredAt = await scrollState(logs());

    ctx.notes.push(`reading position (scrollTop/max) ${readingAt.top}/${readingAt.max} → ${restoredAt.top}/${restoredAt.max}; visible ${visible[0]}..${visible.at(-1)}`);
    expect(readingAt.max > 200 && readingAt.top < readingAt.max - 200, `test premise: the reader was not scrolled up (${readingAt.top}/${readingAt.max})`);
    expect(Math.abs(restoredAt.top - readingAt.top) <= 4, `the reading position moved: ${readingAt.top} → ${restoredAt.top}`);
    expect(restoredAt.top < restoredAt.max - 200 && !visible.includes(last), "restore sent a reader to the bottom");

    ctx.at("pressing To bottom resumes following");
    await frame.locator("[data-testid=bound-logs] .ToBottom, [data-testid=bound-logs] [class*=ToBottom]").first().click().catch(async () => scrollLogs(logs(), 40_000));
    await expectLogsShown(ctx, frame, logs(), last);
  }, 240_000);

  await drun("LG08", "Close releases the session and the polling", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);
    const last = (await currentCount(apis.a, "app")) - 1;

    await dockLogsFromRow(frame, "app");
    await expectLogsShown(ctx, frame, boundLogs(frame).first(), last);
    const tailBefore = logStat(apis.a, "app").tail;

    ctx.at("close the Logs panel");
    await panelHeader(frame, LOGS).hover();
    await control(frame, "close", LOGS).click();
    await panel(frame, LOGS).waitFor({ state: "detached", timeout: 10_000 });
    expect(!(await restoreChip(frame, LOGS).count()), "closed Logs shows a restore band");
    const polled = await requestsOver(apis.a, "app");

    ctx.notes.push(`requests after close (25 s): ${polled}`);
    expect(polled === 0, `closed Logs kept polling (${polled})`);
    ctx.at("reopen: a fresh session, not the old buffer");
    await dockLogsFromRow(frame, "app");
    await expectLogsShown(ctx, frame, boundLogs(frame).first(), last);
    ctx.notes.push(`tail requests ${tailBefore}→${logStat(apis.a, "app").tail}`);
    expect(logStat(apis.a, "app").tail === tailBefore + 1, "reopening did not start a new session (buffer was not released)");
    expect(apis.a.stats().rejected === 0, `writes ${apis.a.stats().rejected}`);
  }, 240_000);

  await drun("LG09", "Containers and clusters never mix", "row menu click", async (ctx) => {
    const frame = await freshHost(ctx);
    const lastApp = (await currentCount(apis.a, "app")) - 1;
    const lastSide = (await currentCount(apis.a, "sidecar")) - 1;

    await dockLogsFromRow(frame, "app");
    await dockLogsFromRow(frame, "sidecar");
    await dockLogsFromRow(frame, "app"); // same container again: reveal, not duplicate
    const ids = (await logIdentity(frame)).sort();

    ctx.notes.push(`identities ${ids.map((id) => id.replace(/#.*/, ""))}`);
    expect(ids.length === 2 && ids[0].includes(":app@") && ids[1].includes(":sidecar@"), `identities ${ids}`);
    const [appLogs, sideLogs] = [frame.locator("[data-testid=bound-logs][data-container=app]"), frame.locator("[data-testid=bound-logs][data-container=sidecar]")];

    await expectLogsShown(ctx, frame, appLogs, lastApp);
    await expectLogsShown(ctx, frame, sideLogs, lastSide);
    const texts = [await appLogs.locator(".LogRow").allInnerTexts(), await sideLogs.locator(".LogRow").allInnerTexts()];

    expect(texts[0].every((t) => !t.includes("sidecar@")) && texts[1].every((t) => !t.includes("app@")), "a container shows another container's lines");

    ctx.at("cluster B: its own panel, its own API");
    clusterB ??= await openClusterFromCatalog(page, CLUSTER_B_NAME);
    let frameB = await connect(clusterB); // visible and active even when an earlier scenario left it in the background

    await setFlag(frameB, true);
    frameB = await reloadFrame(page, clusterB);
    await navigate(frameB, "pods");
    await frameB.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
    const aBefore = logStat(apis.a, "app").total;

    await dockLogsFromRow(frameB, "app");
    const logsB = boundLogs(frameB).first();

    await expectLogsShown(ctx, frameB, logsB, 49);
    const textB = await logsB.locator(".LogRow").first().innerText();
    const idB = (await logIdentity(frameB)).join();

    ctx.notes.push(`B row "${textB.trim().slice(0, 50)}"; B identity ${idB.replace(/#.*/, "")}; A app requests ${aBefore}→${logStat(apis.a, "app").total}; B requests ${logStat(apis.b, "app").total}`);
    expect(textB.includes(`app@${apis.b.port}`) && !textB.includes(`@${apis.a.port}`), `cluster B shows ${textB}`);
    expect(idB.includes(`@${clusterB}#docked-logs:${clusterB}:`), `B identity ${idB}`);
    expect(logStat(apis.b, "app").total >= 1, "cluster B API was not asked for logs");
    expect(logStat(apis.a, "app").total === aBefore || logStat(apis.a, "app").total - aBefore <= 1, "cluster B activity hit API A");
    expect(apis.a.stats().rejected === 0 && apis.b.stats().rejected === 0, "write attempted against Kubernetes");
    await connect(CLUSTER_A);
  }, 240_000);

  await drun("LG10", "Disconnect with Logs open leaves no orphan activity", "row menu + sidebar Disconnect", async (ctx) => {
    const frame = await freshHost(ctx);
    const last = (await currentCount(apis.a, "app")) - 1;

    await dockLogsFromRow(frame, "app");
    await dockLogsFromRow(frame, "sidecar");
    await expectLogsShown(ctx, frame, frame.locator("[data-testid=bound-logs][data-container=app]"), last);
    await sleep(3000);
    const proxies = proxyPids();

    ctx.notes.push(`before Disconnect: watches ${openWatches(apis.a)}; log requests app ${logStat(apis.a, "app").total}, sidecar ${logStat(apis.a, "sidecar").total}`);
    await disconnectFromSidebar(frame);
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A, [0, 2, 5, 10, 20, 30], proxies);
    const after = [logStat(apis.a, "app").total, logStat(apis.a, "sidecar").total];

    await sleep(25_000);
    ctx.notes.push(`log requests after Disconnect: app ${after[0]}→${logStat(apis.a, "app").total}, sidecar ${after[1]}→${logStat(apis.a, "sidecar").total}`);
    expect(logStat(apis.a, "app").total === after[0] && logStat(apis.a, "sidecar").total === after[1], "log polling continued after Disconnect");
    expect(apis.a.stats().rejected === 0, `writes ${apis.a.stats().rejected}`);
  }, 300_000);
  // -------------------------------------------------------------------------
  // H7.6.3C — Monaco Editor in the host: draft, undo/redo and release survive moves; confirmed close releases
  // -------------------------------------------------------------------------
  const ED = "resource-editor";
  const MOD = process.platform === "darwin" ? "Meta" : "Control"; // Playwright 1.42 has no ControlOrMeta
  // Start/end of the document: Cmd+Up/Down on macOS, Ctrl+Home/End elsewhere.
  const DOC_EDGE = process.platform === "darwin" ? { Home: "Meta+ArrowUp", End: "Meta+ArrowDown" } : { Home: "Control+Home", End: "Control+End" };
  const boundEditor = (frame) => frame.locator("[data-testid=bound-editor]");
  const editorIds = (frame) => frame.evaluate(() => [...document.querySelectorAll("[data-testid=bound-editor], [data-testid=bound-editor-unavailable]")]
    .map((el) => `${el.dataset.kind}/${el.dataset.name}@${el.dataset.clusterId}#${el.dataset.tabId}`));
  const confirmation = (frame) => frame.locator("[data-testid=confirmation-dialog]");
  // Real UI: the row "⋮" menu of a list → "Edit (docked)".
  const dockEditFromRow = async (frame, kind, name) => {
    const row = panel(frame, kind).locator(".TableRow", { hasText: name }).first();

    await row.waitFor({ timeout: 20_000 });
    await row.locator(`[aria-label="Actions for ${name}"]`).click();
    const item = frame.locator(".Menu.MenuActions [data-testid=dock-edit-btn]").last();

    await item.waitFor({ timeout: 10_000 });
    await item.click();
    await sleep(800);
  };
  // Real click when the editor is reachable; in a short panel the toolbar can cover the click point, so fall back to focusing its input.
  const focusEditor = async (scope) => {
    try {
      await viewLines(scope).click({ timeout: 3000 });
    } catch {
      await scope.locator(".monaco-editor textarea").first().focus();
    }
  };
  const viewLines = (scope) => scope.locator(".monaco-editor .view-lines").first();
  // The marker is always the last line, so jumping to the end makes it visible whatever the restored scroll was.
  const readEditor = async (scope, edge = "End") => {
    await focusEditor(scope);
    await page.keyboard.press(DOC_EDGE[edge]);
    await sleep(250);

    return (await viewLines(scope).innerText()).replace(/ /g, " ");
  };
  const typeDraft = async (scope, marker) => {
    await focusEditor(scope);
    await page.keyboard.press(DOC_EDGE.End);
    await page.keyboard.press("Enter");
    await page.keyboard.type(marker, { delay: 15 });
    await sleep(300);
  };
  const undoUntilGone = async (scope, marker, max = 8) => {
    for (let i = 0; i < max && (await readEditor(scope)).includes(marker); i++) {
      await page.keyboard.press(`${MOD}+z`);
      await sleep(200);
    }

    return !(await readEditor(scope)).includes(marker);
  };
  const noWrites = () => apis.a.stats().rejected === 0 && apis.b.stats().rejected === 0;
  const openDraft = async (ctx, marker, { kind = "deployments", name = "h7-deploy" } = {}) => {
    const frame = await freshHost(ctx);

    ctx.at(`row ⋮ → Edit (docked): ${name}`);
    await dockEditFromRow(frame, kind, name);
    const editor = boundEditor(frame).first();

    await editor.waitFor({ timeout: 30_000 });
    expect(await until(async () => (await readEditor(editor, "Home")).includes(name), 20_000), `editor does not show ${name}`);
    if (marker) {
      await typeDraft(editor, marker);
      expect((await readEditor(editor)).includes(marker), "the draft was not typed");
    }

    return { frame, editor };
  };

  await drun("ED01", "Open the Editor of a synthetic resource from its row menu", "row menu click", async (ctx) => {
    const { frame, editor } = await openDraft(ctx, undefined);
    const layout = await describeLayout(frame);
    const ids = await editorIds(frame);

    ctx.notes.push(`layout ${layout}; identity ${ids}`);
    expect(layout.includes(ED) && layout.includes("pods") && layout.includes("deployments"), `layout ${layout}`);
    expect(ids.length === 1 && ids[0].startsWith(`Deployment/h7-deploy@${CLUSTER_A}#docked-edit:${CLUSTER_A}:`) && ids[0].endsWith("h7-deploy"), `identity ${ids}`);
    expect(await headerCluster(frame, ED) === CLUSTER_A, "editor header cluster");
    expect((await readEditor(editor, "Home")).includes("kind"), "the YAML of the resource is not shown");
    expect(noWrites(), "write attempted against Kubernetes");
    await shot("ed01-docked-editor");
    await page.screenshot({ path: path.join(EVIDENCE_H763C, "ed01-docked-editor.jpg"), type: "jpeg", quality: 70 });
  });

  await drun("ED02", "Edit without saving: the draft stays local", "keyboard typing", async (ctx) => {
    const { frame, editor } = await openDraft(ctx, "#ED02-DRAFT");

    await sleep(2000);
    ctx.notes.push(`text has marker; rejected writes A ${apis.a.stats().rejected}, B ${apis.b.stats().rejected}`);
    expect((await readEditor(editor)).includes("#ED02-DRAFT"), "draft lost");
    expect(noWrites(), "typing reached Kubernetes");
    expect(await describeLayout(frame).then((l) => l.includes(ED)), "editor gone");
  });

  await drun("ED03", "Dragging to the four sides and moving by keyboard keeps the draft", "mouse drag + keyboard", async (ctx) => {
    const { frame, editor } = await openDraft(ctx, "#ED03-DRAFT");
    const tabId = (await editorIds(frame))[0].split("#")[1];

    for (const [side, fx, fy] of [["right", 0.92, 0.5], ["left", 0.08, 0.5], ["top", 0.5, 0.08], ["bottom", 0.5, 0.92]]) {
      ctx.at(`drag the Editor to the ${side} of Deployments`);
      await dockOnto(frame, ED, "deployments", fx, fy);
      await sleep(600);
      const layout = await describeLayout(frame);
      const text = await readEditor(boundEditor(frame).first());

      ctx.notes.push(`${side}: ${layout}`);
      expect(layout.includes(ED), `Editor missing after ${side}: ${layout}`);
      expect(text.includes("#ED03-DRAFT"), `draft lost after dragging ${side}`);
      expect((await editorIds(frame))[0].endsWith(`#${tabId}`), `identity changed after ${side}`);
    }

    ctx.at("keyboard: Tab Tab Enter ArrowDown Enter");
    const before = await describeLayout(frame);

    await focusPanel(frame, ED);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await frame.locator("[data-testid^=panel-move-menu-leaf-resource-editor-]").waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await sleep(600);
    const after = await describeLayout(frame);

    ctx.notes.push(`keyboard: ${before} → ${after}`);
    expect(after !== before && after.includes(ED), `keyboard move did not relocate: ${before} → ${after}`);
    expect((await readEditor(boundEditor(frame).first())).includes("#ED03-DRAFT"), "draft lost after the keyboard move");
    expect(noWrites(), "docking wrote to Kubernetes");
    expect((await boundEditor(frame).count()) === 1, "duplicate editor after moves");
    void editor;
  }, 240_000);

  await drun("ED04", "Group as a tab, switch tabs and recover the content", "mouse drag + tab clicks", async (ctx) => {
    const { frame } = await openDraft(ctx, "#ED04-DRAFT");

    await dockOnto(frame, ED, "deployments", 0.5, 0.5);
    await sleep(600);
    const layout = await describeLayout(frame);

    ctx.notes.push(`layout ${layout}`);
    expect(await tab(frame, ED).count() === 1 && await tab(frame, "deployments").count() === 1, `no tabs: ${layout}`);
    for (let i = 0; i < 3; i++) {
      await tab(frame, "deployments").click();
      await sleep(500);
      expect(await boundEditor(frame).count() === 0 || !(await boundEditor(frame).first().isVisible()), "editor still visible on the Deployments tab");
      await tab(frame, ED).click();
      await sleep(700);
      expect((await readEditor(boundEditor(frame).first())).includes("#ED04-DRAFT"), `draft lost on switch ${i + 1}`);
    }
    expect(noWrites(), "tab switch wrote to Kubernetes");
    await shot("ed04-editor-tab");
  }, 180_000);

  await drun("ED05", "Collapse and restore keep the draft", "collapse button + restore chip", async (ctx) => {
    const { frame } = await openDraft(ctx, "#ED05-DRAFT");

    await control(frame, "collapse", ED).click();
    await sleep(800);
    expect(await restoreChip(frame, ED).count() === 1, "no restore chip");
    ctx.notes.push(`collapsed layout ${await describeLayout(frame)}`);
    await restoreChip(frame, ED).click();
    await sleep(900);
    const editor = boundEditor(frame).first();

    await editor.waitFor({ timeout: 20_000 });
    expect((await readEditor(editor)).includes("#ED05-DRAFT"), "draft lost after collapse/restore");
    expect(noWrites(), "collapse/restore wrote to Kubernetes");
  });

  await drun("ED06", "Undo and redo still work after the editor was remounted", "drag + Ctrl/Cmd+Z, Shift+Z", async (ctx) => {
    const { frame } = await openDraft(ctx, "#ED06-DRAFT");

    await dockOnto(frame, ED, "deployments", 0.92, 0.5); // unmounts and remounts the view
    await sleep(800);
    const editor = boundEditor(frame).first();

    expect((await readEditor(editor)).includes("#ED06-DRAFT"), "draft lost by the move");
    ctx.at("undo until the typed text is gone");
    expect(await undoUntilGone(editor, "#ED06-DRAFT"), "undo history was lost by the remount");
    ctx.at("redo brings it back");
    for (let i = 0; i < 8 && !(await readEditor(editor)).includes("#ED06-DRAFT"); i++) {
      await page.keyboard.press(`${MOD}+Shift+z`);
      await sleep(200);
    }
    expect((await readEditor(editor)).includes("#ED06-DRAFT"), "redo did not restore the text");
    expect(noWrites(), "undo/redo wrote to Kubernetes");
  }, 180_000);

  await drun("ED07", "Dirty state survives move, tab, collapse and restore", "drag, tabs, collapse, close click", async (ctx) => {
    const { frame } = await openDraft(ctx, "#ED07-DRAFT");

    await dockOnto(frame, ED, "pods", 0.08, 0.5);
    await sleep(600);
    await dockOnto(frame, ED, "deployments", 0.5, 0.5);
    await sleep(600);
    await tab(frame, "deployments").click();
    await tab(frame, ED).click();
    await sleep(500);
    await control(frame, "collapse", ED).click();
    await sleep(600);
    await restoreChip(frame, ED).click();
    await sleep(900);
    const editor = boundEditor(frame).first();

    expect((await readEditor(editor)).includes("#ED07-DRAFT"), "draft lost along the sequence");
    ctx.at("the editor still knows it is dirty: closing asks for confirmation");
    await control(frame, "close", ED).click();
    await confirmation(frame).waitFor({ timeout: 10_000 });
    ctx.notes.push(`confirmation: ${(await confirmation(frame).innerText()).replace(/\s+/g, " ").slice(0, 90)}`);
    await confirmation(frame).locator(".cancel").click();
    await sleep(500);
    expect(await boundEditor(frame).count() === 1, "cancel closed the editor");
    expect(noWrites(), "the sequence wrote to Kubernetes");
  }, 240_000);

  await drun("ED08", "Cancelling the close with changes leaves everything intact", "close click + Cancel", async (ctx) => {
    const { frame } = await openDraft(ctx, "#ED08-DRAFT");
    const idBefore = await editorIds(frame);

    await control(frame, "close", ED).click();
    await confirmation(frame).waitFor({ timeout: 10_000 });
    expect(await boundEditor(frame).count() === 1, "editor removed before the answer");
    await confirmation(frame).locator(".cancel").click();
    await sleep(700);
    const editor = boundEditor(frame).first();

    expect(await confirmation(frame).count() === 0, "dialog still open");
    expect(JSON.stringify(await editorIds(frame)) === JSON.stringify(idBefore), "identity changed by the cancelled close");
    expect((await readEditor(editor)).includes("#ED08-DRAFT"), "draft lost by the cancelled close");
    ctx.at("undo still works after the cancelled close");
    expect(await undoUntilGone(editor, "#ED08-DRAFT"), "undo history lost by the cancelled close");
    expect(noWrites(), "the cancelled close wrote to Kubernetes");
  });

  await drun("ED09", "Confirming the discard closes the editor and writes nothing", "close click + confirm", async (ctx) => {
    const { frame } = await openDraft(ctx, "#ED09-DRAFT");

    await control(frame, "close", ED).click();
    await confirmation(frame).waitFor({ timeout: 10_000 });
    await confirmation(frame).locator("[data-testid=confirm]").click();
    await sleep(900);
    const layout = await describeLayout(frame);

    ctx.notes.push(`after discard: ${layout}`);
    expect(await boundEditor(frame).count() === 0 && !layout.includes(ED), `editor still there: ${layout}`);
    expect(noWrites(), "discard wrote to Kubernetes");
  });

  await drun("ED10", "Reopening after a discard does not reuse released state", "close+confirm, reopen, undo", async (ctx) => {
    const { frame } = await openDraft(ctx, "#ED10-DRAFT");

    await control(frame, "close", ED).click();
    await confirmation(frame).waitFor({ timeout: 10_000 });
    await confirmation(frame).locator("[data-testid=confirm]").click();
    await sleep(900);
    ctx.at("reopen the same document");
    await dockEditFromRow(frame, "deployments", "h7-deploy");
    const editor = boundEditor(frame).first();

    await editor.waitFor({ timeout: 30_000 });
    expect(await until(async () => (await readEditor(editor, "Home")).includes("h7-deploy"), 20_000), "reopened editor is empty");
    expect(!(await readEditor(editor)).includes("#ED10-DRAFT"), "the discarded draft came back");
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press(`${MOD}+z`);
      await sleep(150);
    }
    expect(!(await readEditor(editor)).includes("#ED10-DRAFT"), "undo resurrected the discarded text (model/history reused)");
    expect(noWrites(), "reopen wrote to Kubernetes");
    await shot("ed10-reopened-clean");
  }, 180_000);

  await drun("ED11", "Documents and clusters never mix", "row menu clicks", async (ctx) => {
    const { frame } = await openDraft(ctx, "#ED11-DEPLOY");

    await dockEditFromRow(frame, "pods", "h7-pod-0");
    const [depEditor, podEditor] = [frame.locator("[data-testid=bound-editor][data-kind=Deployment]"), frame.locator("[data-testid=bound-editor][data-kind=Pod]")];

    await podEditor.waitFor({ timeout: 30_000 });
    expect(await until(async () => (await readEditor(podEditor, "Home")).includes("h7-pod-0"), 20_000), "pod editor empty");
    await typeDraft(podEditor, "#ED11-POD");
    const ids = await editorIds(frame);

    ctx.notes.push(`identities ${ids.map((id) => id.replace(/#docked-edit:[^:]+:/, "#"))}`);
    expect(ids.length === 2 && new Set(ids.map((id) => id.split("#")[1])).size === 2, `identities ${ids}`);
    const [depText, podText] = [await readEditor(depEditor), await readEditor(podEditor)];

    expect(depText.includes("#ED11-DEPLOY") && !depText.includes("#ED11-POD"), "deployment editor shows the pod draft");
    expect(podText.includes("#ED11-POD") && !podText.includes("#ED11-DEPLOY"), "pod editor shows the deployment draft");

    ctx.at("cluster B: its own editor, its own API");
    clusterB ??= await openClusterFromCatalog(page, CLUSTER_B_NAME);
    let frameB = await connect(clusterB);

    await setFlag(frameB, true);
    frameB = await reloadFrame(page, clusterB);
    await navigate(frameB, "pods");
    await frameB.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
    const bBefore = Object.keys(apis.b.stats().lists).length;

    await dockEditFromRow(frameB, "pods", "h7-pod-0");
    const editorB = boundEditor(frameB).first();

    await editorB.waitFor({ timeout: 30_000 });
    expect(await until(async () => (await readEditor(editorB, "Home")).includes("h7-pod-0"), 20_000), "cluster B editor empty");
    const [idB, textB] = [(await editorIds(frameB)).join(), await readEditor(editorB)];

    ctx.notes.push(`B identity ${idB.replace(/#.*/, "")}; B lists ${bBefore}→${Object.keys(apis.b.stats().lists).length}`);
    expect(idB.includes(`@${clusterB}#docked-edit:${clusterB}:`), `B identity ${idB}`);
    expect(!textB.includes("#ED11"), "cluster A draft leaked into cluster B");
    expect(noWrites(), "write attempted against Kubernetes");
    await connect(CLUSTER_A);
  }, 300_000);

  await drun("ED12", "Disconnect with a dirty Editor leaves no orphan activity", "typing + sidebar Disconnect", async (ctx) => {
    const { frame } = await openDraft(ctx, "#ED12-DRAFT");

    await sleep(3000);
    const proxies = proxyPids();

    ctx.notes.push(`before Disconnect: watches ${openWatches(apis.a)}`);
    await disconnectFromSidebar(frame);
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A, [0, 2, 5, 10, 20, 30], proxies);
    expect(noWrites(), `writes ${apis.a.stats().rejected}`);
    await connect(CLUSTER_A);
  }, 300_000);
  // -------------------------------------------------------------------------
  // H7.6.3D — Terminal in the host: one PTY session across moves, collapse, tabs and close
  // -------------------------------------------------------------------------
  const TM = "terminal";
  const TM_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "h7-tm-"));
  const TM_HOME = path.join(QA_PROFILE, "home");
  const TM_ZSHRC = path.join(TM_HOME, ".zshrc");
  const tmCreatedZshrc = !fs.existsSync(TM_ZSHRC);
  globalThis.__h7Tm = { dir: TM_DIR, zshrc: tmCreatedZshrc ? TM_ZSHRC : undefined };
  const mainPid = await env.app.evaluate(() => process.pid);
  const spawnedShells = new Set(); // PTY shells started by this block; reaped after every scenario
  const tmFile = (name) => path.join(TM_DIR, name);
  const readPid = (tag) => {
    try {
      const text = fs.readFileSync(tmFile(`${tag}.pid`), "utf8").trim();

      return /^\d+$/.test(text) ? Number(text) : undefined;
    } catch { return undefined; }
  };
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const psField = (pid, field) => { try { return execSync(`ps -o ${field}= -p ${pid}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
  // Interactive shells owned by the Electron main process = the PTYs of the app (never foreign processes).
  const shellKids = () => {
    try {
      return execSync("ps -axo pid=,ppid=,command=", { stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n")
        .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
        .filter((m) => Number(m[2]) === mainPid && /(^|\/)(zsh|bash|fish|sh)(\s|$)/.test(m[3])).map((m) => Number(m[1]));
    } catch { return []; }
  };
  const reapShells = async () => {
    for (const pid of spawnedShells) {
      if (alive(pid) && Number(psField(pid, "ppid")) === mainPid) process.kill(pid, "SIGKILL");
    }
    spawnedShells.clear();
    await sleep(500);
  };
  const tmrun = (id, name, input, fn, timeout = 240_000) => drun(id, name, input, async (ctx) => {
    try { await fn(ctx); } finally { await reapShells(); }
  }, timeout);
  const termBoxById = (frame, tabId) => frame.locator(`[data-testid=bound-terminal][data-tab-id="${tabId}"]`);
  const termBox = (frame) => frame.locator("[data-testid=bound-terminal]").first();
  const termIds = (frame) => frame.evaluate(() => [...document.querySelectorAll("[data-testid=bound-terminal]")].map((el) => el.dataset.tabId));
  // xterm 4 renders to a canvas (no text in the DOM): read the real buffer, scrollback included, through the
  // TerminalStore that BoundTerminal receives as a prop (React fiber), without any product-side test hook.
  const termText = (box) => box.evaluate((el) => {
    let fiber = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];

    while (fiber && !fiber.memoizedProps?.terminalStore) fiber = fiber.return;
    const buffer = fiber?.memoizedProps.terminalStore.getTerminal(el.dataset.tabId)?.xterm.buffer.active;
    const lines = [];

    for (let i = 0; buffer && i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? "");

    return lines.join("\n");
  });
  const termRows = (box) => box.evaluate((el) => {
    let fiber = el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))];

    while (fiber && !fiber.memoizedProps?.terminalStore) fiber = fiber.return;

    return fiber?.memoizedProps.terminalStore.getTerminal(el.dataset.tabId)?.xterm.rows;
  });
  const sendLine = async (box, line, enter = true) => {
    await box.locator(".xterm-helper-textarea").focus();
    await page.keyboard.type(line, { delay: 4 });
    if (enter) await page.keyboard.press("Enter");
  };
  const count = (text, needle) => text.split(needle).length - 1;
  const tickNums = (text, tag) => [...text.matchAll(new RegExp(`TICK-${tag}-(\\d+)`, "g"))].map((m) => Number(m[1]));
  const lastTick = async (box, tag) => (tickNums(await termText(box), tag).at(-1) ?? 0);
  const openTermBy = async (ctx, frame) => {
    const before = await termIds(frame);

    ctx.at("catalog → Terminal");
    await control(frame, "add", "pods").click();
    await frame.locator("[data-testid=catalog-modal]").waitFor();
    await frame.locator("[data-testid=catalog-add-terminal]").click();
    expect(await until(async () => (await termIds(frame)).length === before.length + 1, 20_000), "terminal panel did not open");
    await sleep(900);
    const tabId = (await termIds(frame)).find((id) => !before.includes(id));

    return { tabId, box: termBoxById(frame, tabId) };
  };
  // Starts a controlled session: records the PTY shell pid, prints three numbered lines and a ticker that stays active.
  const startSession = async (box, tag) => {
    await box.locator(".xterm").waitFor({ timeout: 30_000 });
    await sendLine(box, `echo $$ > ${tmFile(`${tag}.pid`)}`);
    expect(await until(() => readPid(tag) !== undefined, 30_000), `shell ${tag} did not start`);
    const pid = readPid(tag);

    spawnedShells.add(pid);
    await sendLine(box, `for i in 1 2 3; do echo TMA-${tag}-$i; done`);
    await sendLine(box, `(n=0; while kill -0 $$ 2>/dev/null; do n=$((n+1)); echo TICK-${tag}-$n; sleep 3; done) &`);
    expect(await until(async () => (await lastTick(box, tag)) >= 1, 15_000), `ticker ${tag} produced no output`);
    await box.locator(".xterm").evaluate((el, t) => { el.__tm = t; }, tag);

    return pid;
  };
  const snapshot = async (box, tag, pid) => ({
    pid, kids: shellKids().length, tabId: await box.getAttribute("data-tab-id"), tick: await lastTick(box, tag),
  });
  // The continuity contract: same PTY (pid, parent, count), same xterm instance, previous output not duplicated, new output
  // received, input still reaches the same shell.
  let markSeq = 0;
  const assertContinuity = async (ctx, box, tag, base, label) => {
    await box.locator(".xterm").waitFor({ timeout: 15_000 });
    expect(await until(async () => (await lastTick(box, tag)) > base.tick, 20_000), `${label}: no new output after the change (last tick ${base.tick})`);
    const text = await termText(box);
    const ticks = tickNums(text, tag);

    expect(new Set(ticks).size === ticks.length, `${label}: duplicated output ${ticks}`);
    expect(alive(base.pid) && Number(psField(base.pid, "ppid")) === mainPid, `${label}: PTY ${base.pid} gone or re-parented`);
    expect(shellKids().length === base.kids, `${label}: shells ${shellKids().length}, expected ${base.kids} (a second PTY?)`);
    expect(await box.getAttribute("data-tab-id") === base.tabId, `${label}: session id changed`);
    expect(await box.locator(".xterm").evaluate((el) => el.__tm) === tag, `${label}: xterm instance was recreated`);
    const n = ++markSeq;

    await sendLine(box, `echo IN-${tag}-$((1000+${n})) $$`);
    expect(await until(async () => new RegExp(`IN-${tag}-${1000 + n} ${base.pid}`).test(await termText(box)), 10_000), `${label}: input did not reach shell ${base.pid}`);
    ctx.notes.push(`${label}: pid ${base.pid}, ticks ${ticks.at(0)}…${ticks.at(-1)}, shells ${base.kids}`);
  };
  const tmShot = async (name) => page.screenshot({ path: path.join(EVIDENCE_H763D, `${name}.jpg`), type: "jpeg", quality: 70 });

  // The QA cluster A may be PROD from earlier identity scenarios: terminals need a DEV cluster to start without the gate.
  fs.mkdirSync(TM_HOME, { recursive: true });
  if (tmCreatedZshrc) fs.writeFileSync(TM_ZSHRC, "PS1='$ '\n");
  {
    const frameA = await connect(CLUSTER_A);

    await setFlag(frameA, true);
    const fresh = await reloadFrame(page, CLUSTER_A);

    await navigate(fresh, "pods");
    await fresh.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
  }
  await pickInSettings(CLUSTER_A, { environment: "Development" });

  await tmrun("TM01", "Open a controlled terminal", "catalog click + keyboard", async (ctx) => {
    const frame = await freshHost(ctx);
    const kids0 = shellKids().length;

    expect(!(await describeLayout(frame)).includes(TM), "navigation added a terminal panel");
    await sleep(1500);
    expect(shellKids().length === kids0, "navigation created a PTY");
    const { tabId, box } = await openTermBy(ctx, frame);
    const layout = await describeLayout(frame);

    expect(new RegExp(`^docked-terminal:${CLUSTER_A}:[0-9a-f-]{36}$`).test(tabId), `session id ${tabId}`);
    expect(layout.includes(TM) && layout.includes("pods") && layout.includes("deployments"), `layout ${layout}`);
    expect(await headerCluster(frame, TM) === CLUSTER_A, "terminal header cluster");
    expect(await panelHeader(frame, TM).evaluate((el) => el.getBoundingClientRect().height) === 28, "header must stay 28px");
    expect(await frame.locator("[data-testid^=terminal-prod-gate-]").count() === 0, "a DEV cluster must not show the PROD gate");
    const pid = await startSession(box, "tm01");

    expect(shellKids().includes(pid) && shellKids().length === kids0 + 1, `shells ${shellKids()}, pid ${pid}, before ${kids0}`);
    ctx.notes.push(`layout ${layout}; session ${tabId}; PTY ${pid} child of main ${mainPid}`);
    await tmShot("tm01-docked-terminal");
  });

  await tmrun("TM02", "Verify PTY session identity", "ps + shell output", async (ctx) => {
    const frame = await freshHost(ctx);
    const kids0 = shellKids().length;
    const { box } = await openTermBy(ctx, frame);
    const pid = await startSession(box, "tm02");
    const started = psField(pid, "lstart");

    await sleep(6000);
    await sendLine(box, "echo WHO $$");
    expect(await until(async () => new RegExp(`WHO ${pid}`).test(await termText(box)), 10_000), "the same shell did not answer");
    expect(psField(pid, "lstart") === started && Number(psField(pid, "ppid")) === mainPid, "PTY identity changed");
    expect(shellKids().length === kids0 + 1, `one session must own exactly one PTY: ${shellKids().length - kids0}`);
    ctx.notes.push(`PTY ${pid} started ${started}; shells +${shellKids().length - kids0}`);
  });

  await tmrun("TM03", "Drag the terminal without recreating the session", "mouse drag", async (ctx) => {
    const frame = await freshHost(ctx);
    const { box } = await openTermBy(ctx, frame);
    const pid = await startSession(box, "tm03");
    let base = await snapshot(box, "tm03", pid);

    for (const [side, fx, fy] of [["right", 0.92, 0.5], ["left", 0.08, 0.5], ["top", 0.5, 0.08], ["bottom", 0.5, 0.92]]) {
      ctx.at(`drag the Terminal to the ${side} of Deployments`);
      await dockOnto(frame, TM, "deployments", fx, fy);
      await sleep(900);
      const layout = await describeLayout(frame);

      expect(layout.includes(TM), `Terminal missing after ${side}: ${layout}`);
      expect(await termIds(frame).then((ids) => ids.length === 1), "duplicate terminal view after the move");
      await assertContinuity(ctx, box, "tm03", base, side);
      base = await snapshot(box, "tm03", pid);
      if (side === "left") await tmShot("tm03-terminal-moved-left");
    }
  }, 300_000);

  await tmrun("TM04", "Group as a tab, switch tabs and keep the output", "mouse drag + tab clicks", async (ctx) => {
    const frame = await freshHost(ctx);
    const { box } = await openTermBy(ctx, frame);
    const pid = await startSession(box, "tm04");
    const base = await snapshot(box, "tm04", pid);

    await dockOnto(frame, TM, "deployments", 0.5, 0.5);
    await sleep(800);
    expect(await tab(frame, TM).count() === 1 && await tab(frame, "deployments").count() === 1, `no tabs: ${await describeLayout(frame)}`);
    for (let i = 0; i < 3; i++) {
      await tab(frame, "deployments").click();
      await sleep(4000); // at least one tick arrives while the Terminal is hidden
      expect(alive(pid), `switching away ended the process (switch ${i + 1})`);
      await tab(frame, TM).click();
      await sleep(700);
      await assertContinuity(ctx, termBoxById(frame, base.tabId), "tm04", { ...base, tick: base.tick }, `switch ${i + 1}`);
    }
    await tmShot("tm04-terminal-tab");
  }, 300_000);

  await tmrun("TM05", "Collapse and restore", "collapse + restore chip", async (ctx) => {
    const frame = await freshHost(ctx);
    const { box } = await openTermBy(ctx, frame);
    const pid = await startSession(box, "tm05");
    const base = await snapshot(box, "tm05", pid);

    await control(frame, "collapse", TM).click();
    await sleep(8000); // ≥2 ticks while the view is unmounted
    expect(alive(pid), "collapsing ended the process");
    await restoreChip(frame, TM).click();
    await sleep(900);
    await assertContinuity(ctx, termBoxById(frame, base.tabId), "tm05", base, "restore");
    const ticks = tickNums(await termText(termBoxById(frame, base.tabId)), "tm05");

    expect(ticks.at(-1) >= base.tick + 2, `output produced while collapsed was lost: ${ticks}`);
  });

  await tmrun("TM06", "Keep buffer, shell state and input after remount", "collapse + tab + drag", async (ctx) => {
    const frame = await freshHost(ctx);
    const { box } = await openTermBy(ctx, frame);
    const pid = await startSession(box, "tm06");
    const base = await snapshot(box, "tm06", pid);

    await sendLine(box, "export TMV_tm06=alive");
    await sendLine(box, "echo PARTIAL-", false); // unfinished line owned by the shell
    await control(frame, "collapse", TM).click();
    await sleep(1200);
    await restoreChip(frame, TM).click();
    await sleep(900);
    await dockOnto(frame, TM, "deployments", 0.5, 0.5);
    await sleep(700);
    await tab(frame, "deployments").click();
    await sleep(600);
    await tab(frame, TM).click();
    await sleep(900);
    const again = termBoxById(frame, base.tabId);

    await sendLine(again, "$((7*6))");
    expect(await until(async () => (await termText(again)).includes("PARTIAL-42"), 10_000), "the unfinished line was lost");
    await sendLine(again, "echo $TMV_tm06 $$");
    expect(await until(async () => new RegExp(`alive ${pid}`).test(await termText(again)), 10_000), "shell state lost: another shell answered");
    await assertContinuity(ctx, again, "tm06", base, "after remounts");
  }, 300_000);

  await tmrun("TM07", "Resize updates the PTY geometry and never sends an invalid one", "drag + collapse + stty", async (ctx) => {
    const frame = await freshHost(ctx);
    const { box } = await openTermBy(ctx, frame);
    const pid = await startSession(box, "tm07");
    const log = tmFile("tm07.winch");
    const sizes = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => l.split(" ").map(Number)) : []);

    await sendLine(box, `TRAPWINCH() { echo "$LINES $COLUMNS" >> ${log} }`);
    await sendLine(box, `echo "$LINES $COLUMNS" >> ${log}`);
    await sleep(600);
    const dims = async (label) => ctx.notes.push(`${label}: xterm ${await termBoxById(frame, await box.getAttribute("data-tab-id")).evaluate((el) => el.getBoundingClientRect().width | 0)}px, rows ${await termRows(box)}, winch ${JSON.stringify(sizes())}`);

    await dims("start");
    await dockOnto(frame, TM, "deployments", 0.92, 0.5);
    await sleep(1500);
    await dims("right");
    await dockOnto(frame, TM, "deployments", 0.5, 0.92);
    await sleep(1500);
    await dims("bottom");
    await control(frame, "collapse", TM).click();
    await sleep(1500);
    await restoreChip(frame, TM).click();
    await sleep(2000);
    await dims("restored");
    const seen = sizes();
    const rows = await termRows(termBoxById(frame, await box.getAttribute("data-tab-id")));

    ctx.notes.push(`geometries ${JSON.stringify(seen)}; xterm rows ${rows}`);
    expect(seen.length >= 2 && new Set(seen.map((s) => s.join("x"))).size >= 2, `PTY geometry did not follow the panel: ${JSON.stringify(seen)}`);
    expect(seen.every(([r, c]) => Number.isInteger(r) && Number.isInteger(c) && r >= 2 && c >= 10), `invalid geometry sent to the PTY: ${JSON.stringify(seen)}`);
    expect(seen.at(-1)[0] === rows, `PTY rows ${seen.at(-1)[0]} ≠ xterm rows ${rows}`);
    expect(alive(pid), "resizing ended the process");
  }, 300_000);

  await tmrun("TM08", "Keyboard move keeps the session", "Tab Tab Enter ArrowDown Enter", async (ctx) => {
    const frame = await freshHost(ctx);
    const { box } = await openTermBy(ctx, frame);
    const pid = await startSession(box, "tm08");
    const base = await snapshot(box, "tm08", pid);
    const before = await describeLayout(frame);

    await focusPanel(frame, TM);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await frame.locator("[data-testid^=panel-move-menu-leaf-terminal-]").waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await sleep(900);
    const after = await describeLayout(frame);

    expect(after !== before && after.includes(TM), `keyboard move did not relocate: ${before} → ${after}`);
    await assertContinuity(ctx, termBoxById(frame, base.tabId), "tm08", base, "keyboard move");
  });

  await tmrun("TM09", "Close and release the session exactly once", "close button + confirm + exit", async (ctx) => {
    const frame = await freshHost(ctx);
    const kids0 = shellKids().length;
    const { tabId, box } = await openTermBy(ctx, frame);
    const pid = await startSession(box, "tm09");
    const base = await snapshot(box, "tm09", pid);

    ctx.at("close → Keep Open");
    await control(frame, "close", TM).click();
    await confirmation(frame).waitFor({ timeout: 10_000 });
    ctx.notes.push(`confirmation: ${(await confirmation(frame).innerText()).replace(/\s+/g, " ").slice(0, 90)}`);
    await confirmation(frame).locator(".cancel").click();
    await sleep(800);
    expect(await termBoxById(frame, tabId).count() === 1 && alive(pid), "a cancelled close ended the session");
    await assertContinuity(ctx, box, "tm09", base, "cancelled close");

    ctx.at("close → Close Terminal");
    await control(frame, "close", TM).click();
    await confirmation(frame).waitFor({ timeout: 10_000 });
    await confirmation(frame).locator("[data-testid=confirm]").click();
    expect(await until(() => !alive(pid), 15_000), `PTY ${pid} still alive after the confirmed close`);
    await sleep(3000);
    expect(await termIds(frame).then((ids) => ids.length === 0), "terminal view still present");
    expect(shellKids().length === kids0 && !shellKids().includes(pid), `shells after close ${shellKids()}, expected ${kids0}`);
    expect(await confirmation(frame).count() === 0, "dialog reappeared");

    ctx.at("a shell that exits cleanly closes its panel without asking");
    const second = await openTermBy(ctx, frame);

    await second.box.locator(".xterm").waitFor({ timeout: 30_000 });
    await sendLine(second.box, `echo $$ > ${tmFile("tm09b.pid")}`);
    expect(await until(() => readPid("tm09b") !== undefined, 30_000), "second shell did not start");
    spawnedShells.add(readPid("tm09b"));
    await sendLine(second.box, "exit");
    expect(await until(async () => (await termIds(frame)).length === 0, 20_000), "the panel stayed after a clean exit");
    expect(await confirmation(frame).count() === 0, "a clean exit asked for confirmation");
    await sleep(2000);
    expect(shellKids().length === kids0, `shells after clean exit ${shellKids()}`);
  }, 300_000);

  await tmrun("TM10", "Two independent terminals without mixing", "catalog x2 + drag + close one", async (ctx) => {
    const frame = await freshHost(ctx);
    const a = await openTermBy(ctx, frame);
    const pidA = await startSession(a.box, "tm10a");
    const b = await openTermBy(ctx, frame);
    const pidB = await startSession(b.box, "tm10b");

    expect(a.tabId !== b.tabId && pidA !== pidB, `ids ${a.tabId} / ${b.tabId}, pids ${pidA} / ${pidB}`);
    await sendLine(a.box, "echo ONLY-IN-A");
    await sendLine(b.box, "echo ONLY-IN-B");
    await sleep(800);
    const [ta, tb] = [await termText(a.box), await termText(b.box)];

    expect(ta.includes("ONLY-IN-A") && !ta.includes("ONLY-IN-B") && !ta.includes("TICK-tm10b"), "terminal A shows B output");
    expect(tb.includes("ONLY-IN-B") && !tb.includes("ONLY-IN-A") && !tb.includes("TICK-tm10a"), "terminal B shows A output");
    const baseB = await snapshot(b.box, "tm10b", pidB);

    const fromBox = await header(frame, TM).first().boundingBox();
    const to = await pointIn(await dropZone(frame, "deployments"), 0.92, 0.5);

    await page.mouse.move(fromBox.x + 40, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(fromBox.x + 46, fromBox.y + fromBox.height / 2 + 6, { steps: 3 });
    for (let i = 1; i <= 24; i++) {
      await page.mouse.move(fromBox.x + 40 + (to.x - fromBox.x - 40) * i / 24, fromBox.y + fromBox.height / 2 + (to.y - fromBox.y - fromBox.height / 2) * i / 24);
      await sleep(15);
    }
    await sleep(150);
    await page.mouse.up();
    await sleep(900);
    const ids = await termIds(frame);

    expect(ids.length === 2 && ids.includes(a.tabId) && ids.includes(b.tabId), `terminals after a move ${ids}`);
    await tmShot("tm10-two-terminals");
    ctx.at("close terminal A only");
    await control(frame, "close", TM).first().click();
    await confirmation(frame).waitFor({ timeout: 10_000 });
    await confirmation(frame).locator("[data-testid=confirm]").click();
    expect(await until(async () => (await termIds(frame)).length === 1, 15_000), "closing one terminal did not remove exactly one");
    const left = (await termIds(frame))[0];
    const closedPid = left === a.tabId ? pidB : pidA;
    const keptPid = left === a.tabId ? pidA : pidB;

    expect(await until(() => !alive(closedPid), 15_000), `PTY ${closedPid} of the closed terminal still alive`);
    expect(alive(keptPid), "closing one terminal killed the other");
    await assertContinuity(ctx, termBoxById(frame, left), left === a.tabId ? "tm10a" : "tm10b", { ...baseB, pid: keptPid, tabId: left, kids: shellKids().length, tick: await lastTick(termBoxById(frame, left), left === a.tabId ? "tm10a" : "tm10b") }, "surviving terminal");
  }, 300_000);

  await tmrun("TM11", "PROD confirmation cannot be bypassed and never leaks", "gate + drag + collapse + confirm", async (ctx) => {
    clusterB ??= await openClusterFromCatalog(page, CLUSTER_B_NAME);
    let frameB = await connect(clusterB);

    await setFlag(frameB, true);
    frameB = await reloadFrame(page, clusterB);
    await navigate(frameB, "pods");
    await pickInSettings(clusterB, { environment: "Production" }); // the synthetic PROD cluster (the settings page waits for the host)
    frameB = await reloadFrame(page, clusterB);
    ctx.notes.push(`B flag ${await frameB.evaluate(() => localStorage.getItem("openlens:global-docking"))}; url ${frameB.url().slice(0, 60)}`);
    await navigate(frameB, "pods");
    ctx.notes.push(`B after navigate: hosts ${await frameB.locator("[data-testid=global-panel-host]").count()}, lists ${await frameB.locator(".KubeObjectListLayout").count()}`);
    await frameB.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
    await panel(frameB, "deployments").waitFor({ timeout: 30_000 });
    const kids0 = shellKids().length;
    const gate = (id) => frameB.locator(`[data-testid="terminal-prod-gate-${id}"]`);

    // Main now asks for its own native confirmation before a PROD PTY. The QA harness answers that native dialog
    // (and counts it) from the Electron main process; nothing in the product is stubbed.
    await env.app.evaluate(({ dialog }) => {
      globalThis.__h7Prod = { calls: 0, answer: 1 };
      dialog.showMessageBox = async () => { globalThis.__h7Prod.calls++; return { response: globalThis.__h7Prod.answer, checkboxChecked: false }; };
    });
    const prodDialog = () => env.app.evaluate(() => globalThis.__h7Prod);
    const answerDialog = (answer) => env.app.evaluate((_, value) => { globalThis.__h7Prod.answer = value; }, answer);
    const one = await openTermBy(ctx, frameB);

    await sleep(4000);
    expect(await gate(one.tabId).count() === 1, "the PROD gate is not shown");
    expect(shellKids().length === kids0, `a PTY started before the confirmation (${shellKids().length - kids0})`);
    ctx.notes.push(`gate shown; shells +0 after 4s; hazard ${await frameB.locator("[data-testid=terminal-prod-hazard]").count()}`);
    await tmShot("tm11-prod-gate");

    ctx.at("bypass attempts: drag, collapse/restore, tab switch, typing");
    await dockOnto(frameB, TM, "deployments", 0.92, 0.5);
    await sleep(900);
    await control(frameB, "collapse", TM).click();
    await sleep(700);
    await restoreChip(frameB, TM).click();
    await sleep(900);
    await page.keyboard.type("echo BYPASS", { delay: 5 });
    await page.keyboard.press("Enter");
    await sleep(1500);
    expect(await gate(one.tabId).count() === 1 && shellKids().length === kids0, `a move/remount bypassed the PROD gate (shells +${shellKids().length - kids0})`);

    const two = await openTermBy(ctx, frameB);

    expect(await gate(two.tabId).count() === 1, "the second terminal did not get its own gate");
    ctx.at("authorize only the first session");
    await frameB.locator(`[data-testid="terminal-prod-confirm-btn-${one.tabId}"]`).click();
    await sleep(3000);
    ctx.notes.push(`after the gate: native confirmations ${(await prodDialog()).calls}; shells +${shellKids().length - kids0}; terminal: ${(await termText(one.box)).replace(/\s+/g, " ").slice(-160)}`);
    const pid = await startSession(one.box, "tm11");

    expect(await gate(one.tabId).count() === 0 && await gate(two.tabId).count() === 1, "authorization leaked to another session");
    expect(shellKids().length === kids0 + 1, `shells +${shellKids().length - kids0}, expected 1`);
    await control(frameB, "collapse", TM).first().click();
    await sleep(700);
    await restoreChip(frameB, TM).first().click();
    await sleep(900);
    expect(await gate(one.tabId).count() === 0 && alive(pid), "a remount asked again or ended the authorized session");

    ctx.at("close the unauthorized session: no PTY ever existed");
    const idsBefore = await termIds(frameB);
    const twoLeaf = frameB.locator(`[data-testid=bound-terminal][data-tab-id="${two.tabId}"]`).locator("xpath=ancestor::*[starts-with(@data-testid,'panel-container-leaf-terminal-')]").first();
    const twoLeafId = (await twoLeaf.getAttribute("data-testid")).replace("panel-container-", "");

    await frameB.locator(`[data-testid="panel-close-button-${twoLeafId}"]`).click();
    expect(await until(async () => (await termIds(frameB)).length === idsBefore.length - 1, 10_000), "the unauthorized terminal did not close");
    expect(await confirmation(frameB).count() === 0 && shellKids().length === kids0 + 1, "closing a never-started terminal asked or spawned a PTY");

    ctx.at("closing the authorized session releases its authorization");
    await control(frameB, "close", TM).first().click();
    await confirmation(frameB).waitFor({ timeout: 10_000 });
    await confirmation(frameB).locator("[data-testid=confirm]").click();
    expect(await until(() => !alive(pid), 15_000), "authorized PTY still alive after close");
    const three = await openTermBy(ctx, frameB);

    expect(await gate(three.tabId).count() === 1, "a new terminal inherited a released authorization");
    expect(shellKids().length === kids0, `shells +${shellKids().length - kids0} for an unauthorized terminal`);
    expect((await prodDialog()).calls === 1, `native confirmations so far ${(await prodDialog()).calls}, expected exactly 1 (remounts must not ask again)`);

    ctx.at("Main refuses when the native confirmation is cancelled, even after the renderer gate");
    await answerDialog(0);
    await frameB.locator(`[data-testid="terminal-prod-confirm-btn-${three.tabId}"]`).click();
    await sleep(4000);
    ctx.notes.push(`native confirmations ${(await prodDialog()).calls}; shells +${shellKids().length - kids0}`);
    expect((await prodDialog()).calls === 2, `the cancelled request did not reach the native dialog (${(await prodDialog()).calls})`);
    expect(shellKids().length === kids0, `Main spawned a PROD PTY after the native dialog was cancelled (+${shellKids().length - kids0})`);
    await connect(CLUSTER_A);
  }, 360_000);

  await tmrun("TM12", "Disconnect leaves no orphan PTY", "sidebar Disconnect", async (ctx) => {
    const frame = await freshHost(ctx);
    const kids0 = shellKids().length;
    const { box } = await openTermBy(ctx, frame);
    const pid = await startSession(box, "tm12");

    expect(shellKids().length === kids0 + 1, "session did not start");
    const proxies = proxyPids();

    await disconnectFromSidebar(frame);
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A, [0, 2, 5, 10, 20], proxies);
    const released = await until(() => !alive(pid), 25_000);

    ctx.notes.push(`PTY ${pid} after Disconnect: ${released ? "released" : "STILL ALIVE (orphan)"}; shells ${shellKids().length}, before ${kids0}`);
    expect(released && shellKids().length === kids0, `Disconnect left an orphan PTY (${pid}); shells ${shellKids()}`);
    const back = await connect(CLUSTER_A);

    await setFlag(back, true);
    expect(await frameCount(CLUSTER_A) <= 1, "unexpected frames after reconnect");
  }, 360_000);
  // -------------------------------------------------------------------------
  // H7.6.3E — Kubetail in the host: one KubetailStore, one set of streams, one selection
  // -------------------------------------------------------------------------
  const KB = "kubetail";
  const EVIDENCE_H763E = path.join(EVIDENCE_ROOT, "h7-6-3e");
  fs.mkdirSync(EVIDENCE_H763E, { recursive: true });
  const kbShot = async (name) => page.screenshot({ path: path.join(EVIDENCE_H763E, `${name}.jpg`), type: "jpeg", quality: 70 });
  const kbBox = (frame) => frame.locator("[data-testid=bound-kubetail]");
  const kbStats = async (frame) => {
    const text = await frame.locator("[data-testid=kubetail-stats]").first().innerText();
    const m = text.match(/Streams:\s*(\d+)\s*\|\s*Lines:\s*(\d+)/);

    return m ? { streams: Number(m[1]), lines: Number(m[2]), text } : { streams: -1, lines: -1, text };
  };
  const kbLogTotal = () => logStat(apis.a, "app").total + logStat(apis.a, "sidecar").total;
  const kbSelection = (frame) => frame.evaluate(() => Object.fromEntries(["namespace", "kind", "workload"].map((k) => [k, document.querySelector(`[data-testid=kubetail-${k}-select]`)?.value])));
  const classicLayout = (frame) => frame.evaluate(() => localStorage.getItem("openlens:split-layout"));
  const openKb = async (ctx, frame) => {
    ctx.at("catalog → Kubetail");
    await control(frame, "add", "pods").click();
    await frame.locator("[data-testid=catalog-modal]").waitFor();
    await frame.locator("[data-testid=catalog-add-kubetail]").click();
    await kbBox(frame).first().waitFor({ timeout: 30_000 });
    await sleep(1200);
  };
  // Real UI: the three native selects of the Kubetail toolbar.
  const selectKbWorkload = async (ctx, frame) => {
    const box = kbBox(frame).first();

    ctx.at("select namespace / kind / workload");
    await box.locator("[data-testid=kubetail-namespace-select]").selectOption("h7-synthetic");
    await box.locator("[data-testid=kubetail-kind-select]").selectOption("Pod"); // the synthetic Deployment has no owned ReplicaSets, so its pod is a standalone Pod
    await sleep(800);
    const options = await box.locator("[data-testid=kubetail-workload-select] option").evaluateAll((els) => els.map((el) => ({ value: el.value, label: el.textContent })));
    const wanted = options.find((o) => /h7-pod-0/.test(o.label ?? "") || /h7-pod-0/.test(o.value));

    ctx.notes.push(`workload options ${JSON.stringify(options).slice(0, 160)}`);
    expect(Boolean(wanted), `no workload option for h7-pod-0: ${JSON.stringify(options)}`);
    await box.locator("[data-testid=kubetail-workload-select]").selectOption(wanted.value);
    expect(await until(async () => (await kbStats(frame)).streams >= 1 && (await kbStats(frame)).lines >= 1, 30_000), `Kubetail produced no streams/lines: ${(await kbStats(frame)).text}`);
  };
  const openKbWithLogs = async (ctx) => {
    const frame = await freshHost(ctx);

    await openKb(ctx, frame);
    await selectKbWorkload(ctx, frame);

    return frame;
  };
  const kbBase = async (frame) => ({ ...(await kbStats(frame)), selection: await kbSelection(frame), requests: kbLogTotal(), classic: await classicLayout(frame) });
  // The continuity contract: one view, same selection, same number of streams, history kept, nothing written into the classic layout.
  const assertKbContinuity = async (ctx, frame, base, label) => {
    await kbBox(frame).first().waitFor({ timeout: 15_000 });
    await sleep(1200);
    const now = await kbStats(frame);

    ctx.notes.push(`${label}: streams ${base.streams}→${now.streams}, lines ${base.lines}→${now.lines}, log requests +${kbLogTotal() - base.requests}`);
    expect(await kbBox(frame).count() === 1, `${label}: ${await kbBox(frame).count()} Kubetail views`);
    expect(now.streams === base.streams, `${label}: streams ${base.streams}→${now.streams}`);
    expect(now.lines >= base.lines, `${label}: history lost (${base.lines}→${now.lines})`);
    expect(JSON.stringify(await kbSelection(frame)) === JSON.stringify(base.selection), `${label}: selection changed ${JSON.stringify(await kbSelection(frame))}`);
    expect(await classicLayout(frame) === base.classic, `${label}: the classic Kubetail layout was written`);
  };
  // Log requests the synthetic API receives while nothing moves: the steady state a move must not exceed.
  const idleRate = async (ms) => { const before = kbLogTotal(); await sleep(ms); return kbLogTotal() - before; };

  await tmrun("KB01", "Open Kubetail in Global Docking", "catalog click", async (ctx) => {
    const frame = await freshHost(ctx);

    expect(!(await describeLayout(frame)).includes(KB), "navigation added a Kubetail panel");
    await openKb(ctx, frame);
    const layout = await describeLayout(frame);

    expect(layout.includes(KB) && layout.includes("pods") && layout.includes("deployments"), `layout ${layout}`);
    expect(await kbBox(frame).count() === 1, "expected one Kubetail view");
    expect(await kbBox(frame).first().getAttribute("data-tab-id") === `docked-kubetail:${CLUSTER_A}`, "identity");
    expect(await headerCluster(frame, KB) === CLUSTER_A, "Kubetail header cluster");
    expect(await panelHeader(frame, KB).evaluate((el) => el.getBoundingClientRect().height) === 28, "header must stay 28px");
    ctx.notes.push(`layout ${layout}; stats ${(await kbStats(frame)).text}`);
    await kbShot("kb01-docked-kubetail");
  });

  await tmrun("KB02", "Show real logs from the synthetic API", "native selects", async (ctx) => {
    const frame = await freshHost(ctx);
    const before = kbLogTotal();

    await openKb(ctx, frame);
    await selectKbWorkload(ctx, frame);
    const stats = await kbStats(frame);
    const text = await kbBox(frame).first().innerText();

    ctx.notes.push(`stats ${stats.text}; API log requests +${kbLogTotal() - before}`);
    expect(kbLogTotal() > before, "the synthetic API did not receive log requests");
    expect(text.includes(`@${apis.a.port}`) || /line \d{4}/.test(text), "no synthetic log line is visible");
    expect(noWrites(), "write attempted against Kubernetes");
    await kbShot("kb02-kubetail-logs");
  });

  await tmrun("KB03", "Drag Kubetail without creating another stream", "mouse drag", async (ctx) => {
    const frame = await openKbWithLogs(ctx);
    const idle = await idleRate(6000);
    let base = await kbBase(frame);
    const movesStart = Date.now();
    const requestsStart = kbLogTotal();

    for (const [side, fx, fy] of [["right", 0.92, 0.5], ["left", 0.08, 0.5], ["top", 0.5, 0.08], ["bottom", 0.5, 0.92]]) {
      ctx.at(`drag Kubetail to the ${side} of Deployments`);
      await dockOnto(frame, KB, "deployments", fx, fy);
      await sleep(700);
      expect((await describeLayout(frame)).includes(KB), `Kubetail missing after ${side}`);
      await assertKbContinuity(ctx, frame, base, side);
      base = await kbBase(frame);
    }
    const elapsed = Date.now() - movesStart;
    const moved = kbLogTotal() - requestsStart;
    const ceiling = Math.ceil(idle * elapsed / 6000) + 3;

    ctx.notes.push(`idle log requests in 6s: ${idle}; during ${elapsed}ms of moves: ${moved} (ceiling ${ceiling})`);
    expect(moved <= ceiling, `moving added log requests: ${moved} > ${ceiling}`);
    expect(noWrites(), "docking wrote to Kubernetes");
  }, 300_000);

  await tmrun("KB04", "Group as a tab", "mouse drag", async (ctx) => {
    const frame = await openKbWithLogs(ctx);
    const base = await kbBase(frame);

    await dockOnto(frame, KB, "deployments", 0.5, 0.5);
    await sleep(800);
    expect(await tab(frame, KB).count() === 1 && await tab(frame, "deployments").count() === 1, `no tabs: ${await describeLayout(frame)}`);
    await assertKbContinuity(ctx, frame, base, "grouped");
    await kbShot("kb04-kubetail-tab");
  });

  await tmrun("KB05", "Switch tabs keeping history", "tab clicks", async (ctx) => {
    const frame = await openKbWithLogs(ctx);

    await dockOnto(frame, KB, "deployments", 0.5, 0.5);
    await sleep(800);
    const base = await kbBase(frame);

    for (let i = 0; i < 3; i++) {
      await tab(frame, "deployments").click();
      await sleep(2500);
      expect(await kbBox(frame).count() === 0 || !(await kbBox(frame).first().isVisible()), "Kubetail still visible on the Deployments tab");
      await tab(frame, KB).click();
      await sleep(900);
      await assertKbContinuity(ctx, frame, base, `switch ${i + 1}`);
    }
  }, 300_000);

  await tmrun("KB06", "Collapse and verify the pause policy", "collapse + API", async (ctx) => {
    const frame = await openKbWithLogs(ctx);
    const base = await kbBase(frame);

    await control(frame, "collapse", KB).click();
    await sleep(1500);
    expect(await kbBox(frame).count() === 0, "the Kubetail view must unmount while collapsed");
    const added = apis.a.appendLogs(LOG_NS, "h7-pod-0", "app", 6);

    ctx.notes.push(`collapsed: appended 6 lines (app now ${added}); streams unchanged in the store`);
    const rate = await idleRate(8000);

    ctx.notes.push(`log requests while collapsed (8s): ${rate}`);
    expect(await restoreChip(frame, KB).count() === 1, "no restore chip for the collapsed Kubetail");
    expect(noWrites(), "collapse wrote to Kubernetes");
    void base;
  });

  await tmrun("KB07", "Restore and verify continuity", "restore chip", async (ctx) => {
    const frame = await openKbWithLogs(ctx);
    const base = await kbBase(frame);

    await control(frame, "collapse", KB).click();
    await sleep(1200);
    apis.a.appendLogs(LOG_NS, "h7-pod-0", "app", 6);
    await sleep(6000);
    await restoreChip(frame, KB).click();
    await sleep(1200);
    await assertKbContinuity(ctx, frame, base, "restore");
    expect(await until(async () => (await kbStats(frame)).lines >= base.lines + 6, 30_000), `lines produced while collapsed did not arrive (${base.lines}→${(await kbStats(frame)).lines})`);
    expect((await kbStats(frame)).lines === base.lines + 6, `duplicated lines: ${base.lines} + 6 ≠ ${(await kbStats(frame)).lines}`);
  });

  await tmrun("KB08", "Selection stays independent of other panels", "native selects + Details + Pods", async (ctx) => {
    const frame = await openKbWithLogs(ctx);
    const base = await kbBase(frame);

    ctx.at("open Details of the pod from the Pods row menu");
    await dockDetailsFromRow(frame, "pods", "h7-pod-0");
    await sleep(1500);
    expect(await frame.locator("[data-testid=bound-details]").count() >= 1, "Details did not open");
    await assertKbContinuity(ctx, frame, base, "after Details");
    await panel(frame, "pods").locator(".TableRow", { hasText: "h7-pod-0" }).first().click();
    await sleep(800);
    await assertKbContinuity(ctx, frame, base, "after a Pods click");
    expect(noWrites(), "selection wrote to Kubernetes");
  });

  await tmrun("KB09", "Keyboard move keeps the session", "Tab Tab Enter ArrowDown Enter", async (ctx) => {
    const frame = await openKbWithLogs(ctx);
    const base = await kbBase(frame);
    const before = await describeLayout(frame);

    await focusPanel(frame, KB);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await frame.locator("[data-testid^=panel-move-menu-leaf-kubetail-]").waitFor();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await sleep(900);
    const after = await describeLayout(frame);

    expect(after !== before && after.includes(KB), `keyboard move did not relocate: ${before} → ${after}`);
    await assertKbContinuity(ctx, frame, base, "keyboard move");
  });

  await tmrun("KB10", "Close and release the streams", "close button + reopen", async (ctx) => {
    const frame = await openKbWithLogs(ctx);
    const base = await kbBase(frame);

    await control(frame, "close", KB).click();
    await sleep(1500);
    expect(await confirmation(frame).count() === 0, "closing Kubetail asked for confirmation");
    expect(await kbBox(frame).count() === 0, "Kubetail view still present");
    const rate = await idleRate(10_000);

    ctx.notes.push(`log requests 10s after close: ${rate}`);
    expect(rate === 0, `streams still active after close (+${rate} log requests)`);
    ctx.at("reopen");
    await openKb(ctx, frame);
    await sleep(2000);
    const again = await kbStats(frame);

    ctx.notes.push(`reopened: ${again.text}; selection ${JSON.stringify(await kbSelection(frame))}`);
    expect(await kbBox(frame).count() === 1, "reopen did not produce exactly one view");
    expect(again.streams <= base.streams, `reopen produced ${again.streams} streams, expected ≤ ${base.streams}`);
    expect(noWrites(), "close/reopen wrote to Kubernetes");
  }, 300_000);

  await tmrun("KB11", "Classic Kubetail without regressions", "sidebar Kubetail", async (ctx) => {
    const frame = await openKbWithLogs(ctx);
    const classicBefore = await classicLayout(frame);

    ctx.at("sidebar → Kubetail (classic page)");
    await navigate(frame, "kubetail");
    const classic = clusterFrame(page, CLUSTER_A);

    await classic.locator("[data-testid=kubetail-stats]").first().waitFor({ timeout: 30_000 });
    await sleep(1500);
    const views = await classic.locator("[data-testid=kubetail-stats]").count();
    const stats = await kbStats(classic);

    ctx.notes.push(`classic page: ${views} stats element(s), ${stats.text}`);
    expect(views === 1, `${views} Kubetail views while the classic page is open`);
    expect(await classic.locator("[data-testid=kubetail-namespace-select]").count() === 1 && await classic.locator("[data-testid=kubetail-kind-select]").count() === 1, "classic toolbar missing");
    await kbShot("kb11-classic-kubetail");
    ctx.at("back to Pods: the host and its Kubetail panel return");
    await navigate(classic, "pods");
    const back = clusterFrame(page, CLUSTER_A);

    await back.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
    expect(await classicLayout(back) === classicBefore, "the classic layout storage changed");
    expect(noWrites(), "classic Kubetail wrote to Kubernetes");
  });

  await tmrun("KB12", "Disconnect leaves no orphan streams", "sidebar Disconnect", async (ctx) => {
    const frame = await openKbWithLogs(ctx);
    const proxies = proxyPids();
    const totalBefore = kbLogTotal();

    ctx.notes.push(`before Disconnect: ${(await kbStats(frame)).text}; log requests ${totalBefore}`);
    await disconnectFromSidebar(frame);
    await assertStaysDisconnected(ctx, apis.a, CLUSTER_A, [0, 2, 5, 10, 20], proxies);
    const after = kbLogTotal();

    await sleep(15_000);
    ctx.notes.push(`log requests after Disconnect: ${after} → ${kbLogTotal()}`);
    expect(kbLogTotal() === after, `log streams continued after Disconnect (+${kbLogTotal() - after})`);
    const back = await connect(CLUSTER_A);

    await setFlag(back, true);
  }, 360_000);

  // -------------------------------------------------------------------------
  // H7.6.4 — Settings and Catalog in the ROOT frame (main window), docked by the same engine.
  // The root host is data-testid=root-panel-host with data-cluster-id="". The flag is read when the root
  // injectables are created, so every scenario loads its route with a full navigation.
  // -------------------------------------------------------------------------
  const RV = "settings";
  const RC = "catalog";
  const rootHost = () => page.locator("[data-testid=root-panel-host]");
  const rootFlagBefore = await page.evaluate((key) => localStorage.getItem(key), FLAG_KEY).catch(() => null);
  const setRootFlag = (on) => page.evaluate(([key, value]) => (value ? localStorage.setItem(key, "true") : localStorage.removeItem(key)), [FLAG_KEY, on]);
  const gvShot = (name) => page.screenshot({ path: path.join(EVIDENCE_H764, `${name}.jpg`), type: "jpeg", quality: 70 });
  const gotoRoot = async (route) => {
    await dropSavedLayouts(); // each root scenario starts from the default seed, not the previous scenario's saved layout
    await page.goto(`${new URL(page.url()).origin}${route}`, { waitUntil: "domcontentloaded" });
    await sleep(1500);
  };
  // Same walk as describeLayout, scoped to the root host.
  const rootLayout = () => page.evaluate(() => {
    const kindOf = (id) => id.replace(/^leaf-/, "").replace(/-\d+-\w+$/, "");
    const describe = (el) => {
      if (!el) return "?";
      const id = el.dataset.testid || "";

      if (id.startsWith("branch-container-")) {
        const first = el.querySelector(":scope > [data-testid^=branch-first-] > *");
        const second = el.querySelector(":scope > [data-testid^=branch-second-] > *");

        if (!first || !second) return describe(first ?? second);

        return `${el.dataset.orientation === "horizontal" ? "H" : "V"}(${describe(first)}, ${describe(second)})`;
      }
      if (id.startsWith("group-node-")) {
        return `tabs[${[...el.querySelectorAll("button[data-testid^=tab-leaf-]")].map((t) => (t.className.includes("active") ? "*" : "") + kindOf(t.dataset.testid.slice(4))).join(",")}]`;
      }
      if (id.startsWith("leaf-node-")) return kindOf(id.slice("leaf-node-".length));
      if (id === "global-panel-all-collapsed") return "(all collapsed)";

      return describe(el.firstElementChild);
    };

    return describe(document.querySelector("[data-testid=root-panel-host]")?.firstElementChild);
  });
  const assertRootLayout = async (ctx, expected) => {
    const actual = await rootLayout();

    ctx.notes.push(`layout ${actual}`);
    expect(actual === expected, `layout ${actual}, expected ${expected}`);

    return panelRects(page);
  };
  const expectNoClusterIdentity = async (ctx) => {
    const host = rootHost();
    const attr = await host.getAttribute("data-cluster-id");
    const tagged = await page.locator("[data-testid=root-panel-host] [data-cluster-id]:not([data-cluster-id=''])").count();
    const envHeader = await page.locator("[data-testid=root-panel-host] [data-testid^=panel-header-leaf-]").getByText(/\bPROD\b|Production|Development/).count();

    ctx.notes.push(`host data-cluster-id="${attr}", tagged descendants ${tagged}, env labels in headers ${envHeader}`);
    expect(attr === "", `host data-cluster-id="${attr}"`);
    expect(tagged === 0, `${tagged} cluster-identified element(s) inside the root host`);
    expect(envHeader === 0, `${envHeader} environment label(s) in root panel headers`);
  };
  const openRoot = async (ctx, route, kind) => {
    ctx.at(`root: navigate ${route}`);
    await gotoRoot(route);
    await rootHost().waitFor({ timeout: 30_000 });
    await panel(page, kind).waitFor({ timeout: 30_000 });
    await sleep(600);
  };
  // "+" on a panel → catalog modal → card (real clicks). Adding the other view here does not navigate.
  const addFromModal = async (ctx, fromKind, kind) => {
    ctx.at(`+ on ${fromKind} → catalog-add-${kind}`);
    await page.locator(`[data-testid^="panel-add-button-leaf-${fromKind}-"]`).first().click();
    await page.locator("[data-testid=catalog-modal]").waitFor({ timeout: 10_000 });
    await page.locator(`[data-testid=catalog-add-${kind}]`).click();
    await sleep(900);
    await panel(page, kind).waitFor({ timeout: 10_000 });
  };
  const openPair = async (ctx) => {
    await openRoot(ctx, "/preferences", RV);
    await addFromModal(ctx, RV, RC);
    expect(new URL(page.url()).pathname.startsWith("/preferences"), `navigated to ${page.url()} when adding Catalog from the modal`);
  };
  const catalogSearch = () => panel(page, RC).locator("input").first();

  await tmrun("GV01", "Settings opens in the root host (flag on)", "navigate /preferences", async (ctx) => {
    await setRootFlag(true);
    await openRoot(ctx, "/preferences", RV);
    expect(await rootHost().isVisible(), "root-panel-host not visible");
    expect(await page.locator("[data-testid=bound-settings]").count() >= 1, "bound-settings missing");
    await expectNoClusterIdentity(ctx);
    const header = await panelHeader(page, RV).first().boundingBox();

    expect(header && Math.round(header.height) === 28, `header height ${header?.height}`);
    await assertRootLayout(ctx, "settings");
    await gvShot("gv01-settings-root");
  });

  await tmrun("GV02", "Catalog opens in the root host", "navigate /catalog", async (ctx) => {
    await setRootFlag(true);
    await openRoot(ctx, "/catalog", RC);
    expect(await page.locator("[data-testid=bound-catalog]").count() >= 1, "bound-catalog missing");
    const row = rootHost().locator(".TableRow", { hasText: "h7-synthetic" }).first();

    await row.waitFor({ timeout: 20_000 });
    expect(await row.isVisible(), "synthetic cluster row not visible");
    await expectNoClusterIdentity(ctx);
    await assertRootLayout(ctx, "catalog");
  });

  await tmrun("GV03", "Distribute side by side (right edge)", "mouse drag", async (ctx) => {
    await setRootFlag(true);
    await openPair(ctx);
    ctx.at("drag Settings header onto the right edge of Catalog");
    const indicator = await dockOnto(page, RV, RC, 0.92, 0.5);

    expect(indicator?.position === "right" && indicator?.target === RC, `indicator ${JSON.stringify(indicator)}`);
    const r = await assertRootLayout(ctx, "H(catalog, settings)");

    expect(leftOf(r[RC], r[RV]) && Math.abs(r[RC].h - r[RV].h) <= 2, `geometry ${JSON.stringify(r)}`);
    await gvShot("gv03-horizontal");
  });

  await tmrun("GV04", "Distribute stacked (bottom edge)", "mouse drag", async (ctx) => {
    await setRootFlag(true);
    await openPair(ctx);
    ctx.at("drag Settings header onto the bottom edge of Catalog");
    const indicator = await dockOnto(page, RV, RC, 0.5, 0.92);

    expect(indicator?.position === "bottom" && indicator?.target === RC, `indicator ${JSON.stringify(indicator)}`);
    const r = await assertRootLayout(ctx, "V(catalog, settings)");

    expect(above(r[RC], r[RV]) && Math.abs(r[RC].w - r[RV].w) <= 2, `geometry ${JSON.stringify(r)}`);
  });

  await tmrun("GV05", "Group as tabs (center drop)", "mouse drag", async (ctx) => {
    await setRootFlag(true);
    await openPair(ctx);
    ctx.at("drag Settings header onto the center of Catalog");
    const indicator = await dockOnto(page, RV, RC, 0.5, 0.5);

    expect(indicator?.position === "center", `indicator ${JSON.stringify(indicator)}`);
    const r = await assertRootLayout(ctx, "tabs[catalog,*settings]");

    expect(Object.keys(r).join() === RV, `visible panels ${Object.keys(r)}`);
    await gvShot("gv05-tabs");
  });

  await tmrun("GV06", "Switch and reorder tabs", "locator.click + mouse drag", async (ctx) => {
    await setRootFlag(true);
    await openPair(ctx);
    await dockOnto(page, RV, RC, 0.5, 0.5);
    ctx.at("click Catalog tab");
    await tab(page, RC).click();
    await sleep(600);
    let r = await assertRootLayout(ctx, "tabs[*catalog,settings]");

    expect(Object.keys(r).join() === RC, `visible ${Object.keys(r)}`);
    ctx.at("click Settings tab");
    await tab(page, RV).click();
    await sleep(600);
    r = await assertRootLayout(ctx, "tabs[catalog,*settings]");
    expect(Object.keys(r).join() === RV, `visible ${Object.keys(r)}`);
    ctx.at("drag active Settings header onto the Catalog tab");
    const indicator = await dragHeader(page, page, RV, await pointIn(tab(page, RC), 0.5, 0.5));

    expect(indicator?.position === "center", `indicator ${JSON.stringify(indicator)}`);
    await assertRootLayout(ctx, "tabs[*settings,catalog]");
    const xs = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("button[data-testid^=tab-leaf-]")].map((t) => [t.dataset.testid.slice(9).replace(/-\d+-\w+$/, ""), Math.round(t.getBoundingClientRect().x)])));

    ctx.notes.push(`tab x ${JSON.stringify(xs)}`);
    expect(xs[RV] < xs[RC], `tab order ${JSON.stringify(xs)}`);
  });

  await tmrun("GV07", "Collapse and restore keeps the view state", "collapse button + restore chip", async (ctx) => {
    await setRootFlag(true);
    await openPair(ctx);
    ctx.at("type a Catalog search");
    await catalogSearch().click();
    await page.keyboard.type("h7", { delay: 20 });
    await sleep(300);
    ctx.at("collapse Catalog");
    await control(page, "collapse", RC).click();
    await sleep(900);
    expect(await page.locator("[data-testid=global-panel-collapsed-bar]").count() >= 1 || await restoreChip(page, RC).count() >= 1, "no collapse bar or restore chip after collapse");
    ctx.at("restore Catalog");
    await restoreChip(page, RC).click();
    await sleep(900);
    await panel(page, RC).waitFor({ timeout: 10_000 });
    const search = await catalogSearch().inputValue();

    ctx.notes.push(`catalog search after restore "${search}"`);
    expect(search === "h7", `catalog search "${search}" after restore`);
    await gvShot("gv07-restored");
  });

  await tmrun("GV08", "Keyboard move to another side", "Tab Tab Enter ArrowDown Enter", async (ctx) => {
    await setRootFlag(true);
    await openPair(ctx);
    const before = await rootLayout();
    const rectsBefore = await panelRects(page);

    await focusPanel(page, RC);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.locator(`[data-testid^=panel-move-menu-leaf-${RC}-]`).waitFor({ timeout: 10_000 });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await sleep(900);
    const after = await rootLayout();
    const rectsAfter = await panelRects(page);

    ctx.notes.push(`layout ${before} → ${after}`);
    expect(after !== before && after.includes(RC) && after.includes(RV), `keyboard move did not relocate: ${before} → ${after}`);
    expect(JSON.stringify(rectsBefore) !== JSON.stringify(rectsAfter), "geometry unchanged after keyboard move");
  });

  await tmrun("GV09", "State survives a move (Settings tab, Catalog search)", "locator.click + mouse drag", async (ctx) => {
    await setRootFlag(true);
    await openPair(ctx);
    ctx.at("pick a non-default Settings tab");
    const settingsBody = page.locator("[data-testid=bound-settings]");
    const beforeTab = await settingsBody.innerText();
    let picked = null;

    for (const label of ["Kubernetes", "Proxy", "Telemetry", "Extensions"]) {
      const item = panel(page, RV).getByText(label, { exact: true }).first();

      if (!(await item.count())) continue;
      await item.click();
      await sleep(700);
      if ((await settingsBody.innerText()) !== beforeTab) { picked = label; break; }
    }
    expect(picked, "no Settings tab changed the content");
    ctx.notes.push(`settings tab: ${picked}`);
    const tabText = await settingsBody.innerText();

    ctx.at("type a Catalog search");
    await catalogSearch().click();
    await page.keyboard.type("h7", { delay: 20 });
    await sleep(300);
    ctx.at("move Settings onto the right edge of Catalog");
    await dockOnto(page, RV, RC, 0.92, 0.5);
    await assertRootLayout(ctx, "H(catalog, settings)");
    expect(await settingsBody.innerText() === tabText, `Settings content changed after the move (${picked})`);
    expect(await catalogSearch().inputValue() === "h7", `Catalog search "${await catalogSearch().inputValue()}" after the move`);
    await gvShot("gv09-state-after-move");
  });

  await tmrun("GV10", "Flag off keeps classic navigation", "flag off + navigate", async (ctx) => {
    await setRootFlag(false);
    ctx.at("navigate /preferences (flag off)");
    await gotoRoot("/preferences");
    expect(await rootHost().count() === 0, "root-panel-host rendered with the flag off");
    expect(await page.locator("[data-testid=bound-settings]").count() === 0, "bound-settings with the flag off");
    expect(await page.getByText("Appearance", { exact: true }).count() >= 1, "classic Settings page content missing");
    ctx.at("navigate /catalog (flag off)");
    await gotoRoot("/catalog");
    expect(await rootHost().count() === 0, "root-panel-host rendered for Catalog with the flag off");
    expect(await page.locator("[data-testid^=catalog-list-for-]").count() >= 1, "classic Catalog list missing");
    await setRootFlag(true);
  });

  await tmrun("GV11", "Cluster and root layouts stay independent", "workspace tab + Home", async (ctx) => {
    await setRootFlag(true);
    await openPair(ctx);
    const rootBefore = await rootLayout();

    ctx.at("open cluster A from its workspace tab");
    const cluster = await activateCluster(page, CLUSTER_A);

    // The cluster opens on its overview; the cluster GlobalPanelHost renders on the workloads route (as freshHost does).
    await navigate(cluster, "pods");
    await cluster.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
    // Mark the cluster iframe node only once it exists, then check the same node after the root round trip.
    await page.evaluate((id) => {
      const el = [...document.querySelectorAll("iframe, webview")].find((f) => (f.src || f.getAttribute("src") || "").includes(id));

      if (el) el.dataset.gvMark = "1";
    }, CLUSTER_A);
    expect(await page.locator("[data-gv-mark='1']").count() === 1, "cluster iframe node not found to mark");
    expect(await cluster.locator("[data-testid=root-panel-host]").count() === 0, "root host rendered inside the cluster frame");
    expect(await cluster.locator("[data-testid=global-panel-host]").getAttribute("data-cluster-id") === CLUSTER_A, "cluster host lost its cluster id");
    const clusterLayout = await describeLayout(cluster);

    ctx.notes.push(`cluster layout ${clusterLayout}; root layout while in cluster ${rootBefore}`);
    expect(!/settings|catalog/.test(clusterLayout), `cluster layout shows root views: ${clusterLayout}`);
    ctx.at("back to root: Home → Catalog");
    await page.locator("[data-testid=home-button]").click();
    await sleep(800);
    await page.locator("[data-testid=welcome-open-catalog]").click();
    await rootHost().waitFor({ timeout: 30_000 });
    await sleep(800);
    expect(await rootLayout() === rootBefore, `root layout changed: ${rootBefore} → ${await rootLayout()}`);
    expect(await page.evaluate(() => document.querySelector("[data-gv-mark='1']")?.isConnected === true), "cluster iframe was remounted");
    expect(await describeLayout(clusterFrame(page, CLUSTER_A)) === clusterLayout, "cluster layout changed while the root was shown");
    await gvShot("gv11-root-after-cluster");
  });

  await tmrun("GV12", "Close, reopen, no app errors", "close buttons + route", async (ctx) => {
    await setRootFlag(true);
    const errorsFrom = consoleErrors.length;

    await openPair(ctx);
    ctx.at("close Catalog");
    await control(page, "close", RC).click();
    await sleep(900);
    expect(await confirmation(page).count() === 0, "closing Catalog asked for confirmation");
    ctx.notes.push(`after closing Catalog: host ${await rootHost().count()}, settings panels ${await panel(page, RV).count()}, classic settings text ${await page.getByText("Appearance", { exact: true }).count()}, url ${new URL(page.url()).pathname}`);
    // Product rule (dynamic-layout-renderer: canClose = activePanelsCount > 1): the last panel has no close button.
    ctx.at("last panel has no close control");
    expect(await control(page, "close", RV).count() === 0, "last Settings panel shows a close button");
    expect(await panel(page, RV).count() === 1, "last Settings panel is not in the host");
    ctx.at("reopen via /preferences");
    await openRoot(ctx, "/preferences", RV);
    expect(await panel(page, RC).count() === 0, "Catalog came back with the reopened Settings");
    await assertRootLayout(ctx, "settings");
    const appErrors = consoleErrors.slice(errorsFrom).filter((e) => !/webpack-dev-server|\/ws' failed/.test(e.text));

    ctx.notes.push(`app console errors: ${appErrors.length}`);
    expect(appErrors.length === 0, `console errors: ${appErrors.map((e) => e.text).join(" | ")}`);
    await gvShot("gv12-reopened");
  });

  // -------------------------------------------------------------------------
  // H7.7 — versioned persistence and safe restore of the Global Docking layouts.
  // Keys live in lens-local-storage (cluster file per id, root app.json). Restore needs the flag; every
  // relaunch sets the cluster flag again (its origin changes per launch). Only real mouse/keyboard builds layouts.
  // -------------------------------------------------------------------------
  const PS_IDS = Array.from({ length: 16 }, (_, i) => `PS${String(i + 1).padStart(2, "0")}`);

  if (!ONLY || PS_IDS.some((id) => ONLY.test(id))) {
    const KEY_A = `openlens:global-layout:v1:${CLUSTER_A}`;
    const ROOT_KEY = "openlens:root-layout:v1";
    const FILE_A = path.join(QA_LLS_DIR, `${CLUSTER_A}.json`);
    const ROOT_FILE = path.join(QA_LLS_DIR, "app.json");
    const clusterKey = (id) => `openlens:global-layout:v1:${id}`;
    const fileOf = (id) => path.join(QA_LLS_DIR, `${id}.json`);
    const readStore = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
    const storedRaw = (file, key) => { const value = readStore(file)[key]; return typeof value === "string" ? value : undefined; };
    const storedLayout = (file, key) => { try { return JSON.parse(storedRaw(file, key) ?? "null") ?? undefined; } catch { return undefined; } };
    const psWriteKey = (file, key, value) => { const data = readStore(file); data[key] = value; fs.writeFileSync(file, JSON.stringify(data)); };
    const psClearLayoutKeys = () => {
      for (const name of fs.readdirSync(QA_LLS_DIR)) {
        const file = path.join(QA_LLS_DIR, name);
        const data = readStore(file);
        const layoutKeys = Object.keys(data).filter((key) => /^openlens:(global|root)-layout:/.test(key));

        if (!layoutKeys.length) continue;
        for (const key of layoutKeys) delete data[key];
        fs.writeFileSync(file, JSON.stringify(data));
      }
    };
    // Same words as describeLayout, so the stored tree and the DOM compare directly.
    const treeSig = (node) => {
      if (!node) return undefined;
      if (node.type === "branch") return `${node.orientation === "horizontal" ? "H" : "V"}(${treeSig(node.first)}, ${treeSig(node.second)})`;
      if (node.type === "group") return `tabs[${node.panels.map((p) => (p.id === node.activePanelId ? "*" : "") + p.panelKind).join(",")}]`;

      return node.panelKind;
    };
    const rectsMatch = (a, b, tol) => Object.keys(a).every((k) => b[k] && ["x", "y", "w", "h"].every((f) => Math.abs(a[k][f] - b[k][f]) <= tol));
    const psShot = (name) => page.screenshot({ path: path.join(EVIDENCE_H77, `${name}.jpg`), type: "jpeg", quality: 70 });
    const liveA = () => describeLayout(clusterFrame(page, CLUSTER_A));
    const psWaitSaved = async (ctx, live, file, key, label) => {
      const stored = () => treeSig(storedLayout(file, key)?.root);
      const ok = await until(async () => stored() !== undefined && stored() === await live(), 30_000);

      expect(ok, `${label}: file has ${stored()}, live ${await live()}`);
      await sleep(3000); // the save is lazy: the file must stay equal before anything reloads or quits
      expect(stored() === await live(), `${label}: changed after settling, file ${stored()}, live ${await live()}`);
      ctx.notes.push(`${label} file ${stored()}`);
    };
    const activateTab = async (frame, kind, ctx) => {
      const before = await describeLayout(frame);

      await tab(frame, kind).click();
      await sleep(600);
      if (await describeLayout(frame) === before) {
        const probe = await tab(frame, kind).evaluate((el) => {
          const r = el.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);

          return { cls: el.className.slice(0, 80), hit: hit?.tagName + " " + (hit?.getAttribute("data-testid") || "").slice(0, 60) };
        }).catch((e) => ({ error: e.message.slice(0, 80) }));

        ctx?.notes?.push(`tab probe ${kind}: ${JSON.stringify(probe)}`);
        const point = await pointIn(tab(frame, kind), 0.5, 0.5);

        await page.mouse.click(point.x, point.y); // real mouse fallback when the locator click does not change the active tab
        await sleep(600);
      }
    };
    const showPods = async (frame) => {
      if (await tab(frame, "pods").count()) await activateTab(frame, "pods");
    };
    let psMainPid = 0;
    // A fresh Electron on the same QA profile; the window, tracing and screencast-free helpers move to it.
    const psLaunch = async () => {
      // Keep cold-restart QA on the same packaged build as the initial launch.
      const packaged = process.env.H7_PACKAGED_APP;
      const app = await electron.launch({
        executablePath: packaged ?? ELECTRON_PATH,
        cwd: packaged ? path.dirname(packaged) : OPEN_LENS_DIR,
        args: packaged ? ["--use-mock-keychain", "--offline"] : ["."],
        timeout: 120_000,
        env: {
          NODE_ENV: packaged ? "production" : "development",
          CICD: path.join(QA_PROFILE, "appdata"),
          HOME: path.join(QA_PROFILE, "home"),
          KUBECONFIG: path.join(QA_PROFILE, "home/.kube/config"),
          PATH: process.env.PATH,
          SHELL: "/bin/sh",
          OPENLENS_DETACHED_TOOLS: "1",
        },
      });
      let win;

      psLaunched = app;
      for (let i = 0; i < 240 && !win; i++) {
        win = app.windows().find((w) => w.url().startsWith("https://lens.app"));
        if (!win) await sleep(500);
      }
      if (!win) throw new Error(`relaunch: main window not found; windows ${app.windows().map((w) => w.url()).join(", ")}`);
      await win.waitForLoadState("domcontentloaded");
      win.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push({ at: Date.now(), text: msg.text().slice(0, 300), url: msg.location()?.url ?? "" }); });
      win.on("pageerror", (error) => consoleErrors.push({ at: Date.now(), text: `pageerror: ${error.message}`.slice(0, 300), url: "" }));
      page = win;
      electronApp = app;
      tracing = app.context().tracing;
      await tracing.start({ screenshots: true, snapshots: true });
      psMainPid = await app.evaluate(() => process.pid);
      await sleep(2500);
    };
    const psQuit = async () => {
      const pid = psMainPid;

      await electronApp.close().catch(() => {});
      if (pid > 0) await until(() => !alive(pid), 30_000); // initial session has no tracked main PID
      await sleep(500);
    };
    const psRestart = async () => { await psQuit(); await psLaunch(); };
    // Cluster A through its tab (or hotbar pin after a relaunch), flag set/unset, frame reloaded, Pods route.
    const psOpen = async (on = true) => {
      await page.keyboard.press("Escape"); // leaves a Settings overlay that covers the workspace tabs, as pickInSettings does
      await sleep(800);
      if (!(await page.locator(`[data-testid=workspace-tab-${CLUSTER_A}]`).isVisible().catch(() => false))) {
        await page.locator("[data-testid=home-button]").click().catch(() => {});
        await sleep(800);
      }
      let frame = await connect(CLUSTER_A);

      await setFlag(frame, on);
      frame = await reloadFrame(page, CLUSTER_A);
      await navigate(frame, "pods");
      frame = clusterFrame(page, CLUSTER_A);
      if (on) await frame.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
      await sleep(800);

      return frame;
    };
    // Shell children of the app's main process (the PTYs of the current launch).
    const psShellKids = () => {
      try {
        return execSync("ps -axo pid=,ppid=,command=", { stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n")
          .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
          .filter((m) => Number(m[2]) === psMainPid && /(^|\/)(zsh|bash|fish|sh)(\s|$)/.test(m[3])).map((m) => Number(m[1]));
      } catch { return []; }
    };
    const psRun = (id, name, input, fn, timeout = 240_000) => run(id, name, input, fn, timeout); // relaunches need more than 150 s

    // Start from a profile without saved layouts (put back as found in finally).
    await psQuit();
    psClearLayoutKeys();
    keepSavedLayouts = true;
    await psLaunch();

    await psRun("PS01", "Save a horizontal layout to the cluster key", "mouse drag + stored JSON", async (ctx) => {
      const frame = await psOpen();

      await assertLayout(ctx, frame, "H(pods, deployments)");
      ctx.at("drag Pods onto the right edge of Deployments");
      const indicator = await dockOnto(frame, "pods", "deployments", 0.92, 0.5);

      expect(indicator?.position === "right" && indicator?.target === "deployments", `indicator ${JSON.stringify(indicator)}`);
      await assertLayout(ctx, frame, "H(deployments, pods)");
      ctx.at("wait for the layout to reach the cluster file");
      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A");
      const raw = storedRaw(FILE_A, KEY_A);
      const saved = JSON.parse(raw);

      expect(saved.version === 1 && saved.scope === "cluster" && saved.clusterId === CLUSTER_A, `envelope ${Object.keys(saved).join(",")}`);
      expect(saved.root?.type === "branch" && saved.root.orientation === "horizontal", `root ${saved.root?.type}/${saved.root?.orientation}`);
      expect(!/grant|secret|token|kubeconfig|sessionId|pty|"pid"/i.test(raw), "saved layout carries session, grant or secret fields");
      ctx.notes.push(`keys ${Object.keys(saved).join(",")}; ${raw.length} bytes`);
      await psShot("ps01-saved-horizontal");
    });

    await psRun("PS02", "Restore a vertical layout after a frame reload", "mouse drag + reload", async (ctx) => {
      let frame = await psOpen();

      await assertLayout(ctx, frame, "H(deployments, pods)");
      ctx.at("drag Pods to the top edge of Deployments");
      const indicator = await dockOnto(frame, "pods", "deployments", 0.5, 0.08);

      expect(indicator?.position === "top", `indicator ${JSON.stringify(indicator)}`);
      await assertLayout(ctx, frame, "V(pods, deployments)");
      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A");
      const before = await panelRects(frame);

      ctx.at("reload the cluster frame");
      frame = await psOpen();
      await assertLayout(ctx, frame, "V(pods, deployments)");
      expect(rectsMatch(before, await panelRects(frame), 3), "geometry changed after reload");
      await psShot("ps02-restored-vertical");
    });

    await psRun("PS03", "Custom split sizes survive a reload", "mouse drag (divider) + reload", async (ctx) => {
      let frame = await psOpen();

      await assertLayout(ctx, frame, "V(pods, deployments)");
      const defaultRatio = storedLayout(FILE_A, KEY_A).root.ratio;
      ctx.at("drag the vertical divider 120px down");
      const live = await dragDivider(frame, frame.locator("[data-testid^=branch-divider-]").first(), 0, 120);
      const share = live.pods.h / (live.pods.h + live.deployments.h);
      const beforeReload = live;

      ctx.notes.push(`ratio default ${defaultRatio}, live pods share ${share.toFixed(3)}`);
      expect(Math.abs(share - 0.5) > 0.05, `divider did not move: pods share ${share.toFixed(3)}`);
      const stored = () => storedLayout(FILE_A, KEY_A).root.ratio;
      const near = () => Math.min(Math.abs(stored() - share), Math.abs(stored() - (1 - share))) <= 0.03;

      expect(await until(near, 30_000), `stored ratio ${stored()} vs live share ${share.toFixed(3)}`);
      expect(stored() !== defaultRatio, `stored ratio still the default ${defaultRatio}`);
      frame = await psOpen();
      await assertLayout(ctx, frame, "V(pods, deployments)");
      expect(rectsMatch(beforeReload, await panelRects(frame), 4), "sizes not restored after reload");
      await psShot("ps03-custom-sizes");
    });

    await psRun("PS04", "Tab order survives a reload", "mouse drag (center drop, reorder)", async (ctx) => {
      let frame = await psOpen();

      await assertLayout(ctx, frame, "V(pods, deployments)");
      ctx.at("drop Pods in the center of Deployments (tabs)");
      const indicator = await dockOnto(frame, "pods", "deployments", 0.5, 0.5);

      await assertLayout(ctx, frame, "tabs[deployments,*pods]"); // the drag indicator is not read reliably here; the layout is the proof
      ctx.at("drag active Pods onto the Deployments tab (reorder)");
      const reorder = await dragHeader(page, frame, "pods", await pointIn(tab(frame, "deployments"), 0.5, 0.5));

      await assertLayout(ctx, frame, "tabs[*pods,deployments]");
      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A");
      frame = await psOpen();
      await assertLayout(ctx, frame, "tabs[*pods,deployments]");
      const ids = await frame.evaluate(() => [...document.querySelectorAll("button[data-testid^=tab-leaf-]")].map((t) => t.dataset.testid));

      expect(ids.findIndex((id) => id.includes("-pods-")) < ids.findIndex((id) => id.includes("-deployments-")), `tab order ${ids}`);
      await psShot("ps04-tab-order");
    });

    await psRun("PS05", "Active tab restored", "locator.click + reload", async (ctx) => {
      let frame = await psOpen();

      await assertLayout(ctx, frame, "tabs[*pods,deployments]");
      ctx.at("click the Deployments tab");
      await activateTab(frame, "deployments", ctx);
      await assertLayout(ctx, frame, "tabs[pods,*deployments]");
      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A");
      frame = await psOpen();
      await assertLayout(ctx, frame, "tabs[pods,*deployments]");
      await psShot("ps05-active-tab");
    });

    await psRun("PS06", "Collapsed panel keeps its state and restores", "collapse button + reload + restore chip", async (ctx) => {
      let frame = await psOpen();

      await assertLayout(ctx, frame, "tabs[pods,*deployments]");
      ctx.at("activate Pods and collapse it");
      await activateTab(frame, "pods");
      await control(frame, "collapse", "pods").click();
      await sleep(900);
      expect(await restoreChip(frame, "pods").count() >= 1, "no restore chip after collapse");
      expect(await until(() => (storedLayout(FILE_A, KEY_A)?.collapsedLeafIds ?? []).length >= 1, 30_000), "collapsed state not saved");
      ctx.at("reload: collapsed Pods comes back as a chip");
      frame = await psOpen();
      expect(await restoreChip(frame, "pods").count() >= 1, `no restore chip after reload: ${await describeLayout(frame)}`);
      await psShot("ps06-collapsed-after-reload");
      ctx.at("restore Pods from its chip");
      await restoreChip(frame, "pods").click();
      await sleep(900);
      await panel(frame, "pods").waitFor({ timeout: 10_000 });
      expect(await until(() => (storedLayout(FILE_A, KEY_A)?.collapsedLeafIds ?? []).length === 0, 30_000), "restored Pods still saved as collapsed");
    });

    await psRun("PS07", "Per-cluster independence (cluster A vs B)", "dock in B + stored keys of both files", async (ctx) => {
      const frameA = await psOpen();
      const aLive = await describeLayout(frameA);
      const aRaw = storedRaw(FILE_A, KEY_A);

      ctx.notes.push(`cluster A layout ${aLive}`);
      ctx.at("open cluster B from the catalog");
      clusterB ??= await openClusterFromCatalog(page, CLUSTER_B_NAME);
      const FILE_B = fileOf(clusterB);
      let frameB = await connect(clusterB);

      await setFlag(frameB, true);
      frameB = await reloadFrame(page, clusterB);
      await navigate(frameB, "pods");
      await frameB.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
      await panel(frameB, "deployments").waitFor({ timeout: 30_000 });
      await sleep(800);
      expect(await describeLayout(frameB) === "H(pods, deployments)", `cluster B default ${await describeLayout(frameB)}`);
      ctx.at("drag Pods to the bottom edge of Deployments in B");
      const indicator = await dockOnto(frameB, "pods", "deployments", 0.5, 0.92);

      expect(indicator?.position === "bottom", `indicator ${JSON.stringify(indicator)}`);
      await assertLayout(ctx, frameB, "V(deployments, pods)");
      await psWaitSaved(ctx, () => describeLayout(clusterFrame(page, clusterB)), FILE_B, clusterKey(clusterB), "cluster B");
      expect(storedRaw(FILE_A, KEY_A) === aRaw, "cluster A's stored layout changed while B moved");
      expect(storedRaw(FILE_A, clusterKey(clusterB)) === undefined && storedRaw(FILE_B, KEY_A) === undefined, "a cluster key landed in the other cluster's file");
      expect(!aRaw.includes(clusterB) && !storedRaw(FILE_B, clusterKey(clusterB)).includes(CLUSTER_A), "layout identities cross between clusters");
      ctx.at("back to cluster A through its workspace tab");
      const frameA2 = await activateCluster(page, CLUSTER_A);

      await sleep(800);
      expect(await describeLayout(frameA2) === aLive, `cluster A layout ${await describeLayout(frameA2)} after switching back, expected ${aLive}`);
      await psShot("ps07-two-clusters");
    });

    await psRun("PS08", "Root host layout is independent of the clusters", "root dock + cluster tab change", async (ctx) => {
      await setRootFlag(true);
      await openPair(ctx);
      ctx.at("drag Settings onto the right edge of Catalog (root)");
      const indicator = await dockOnto(page, RV, RC, 0.92, 0.5);

      expect(indicator?.position === "right" && indicator?.target === RC, `indicator ${JSON.stringify(indicator)}`);
      await assertRootLayout(ctx, "H(catalog, settings)");
      await psWaitSaved(ctx, rootLayout, ROOT_FILE, ROOT_KEY, "root");
      const rootRaw = storedRaw(ROOT_FILE, ROOT_KEY);
      const aStored = storedRaw(FILE_A, KEY_A);

      expect(storedRaw(ROOT_FILE, KEY_A) === undefined, "a cluster key was written into the root file");
      expect(!rootRaw.includes(CLUSTER_A), "root layout carries the cluster id");
      ctx.at("cluster A: change its active tab");
      const frameA = await activateCluster(page, CLUSTER_A);

      await navigate(frameA, "pods");
      await frameA.locator("[data-testid=global-panel-host]").waitFor({ timeout: 30_000 });
      await sleep(600);
      await activateTab(frameA, "deployments");
      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A after tab change");
      expect(storedRaw(ROOT_FILE, ROOT_KEY) === rootRaw, "root layout changed when the cluster changed");
      await psShot("ps08-root-independent");
    });

    await psRun("PS09", "Full Electron restart keeps cluster and root layouts", "close app + relaunch + flag + reload", async (ctx) => {
      const frame = clusterFrame(page, CLUSTER_A);
      const layoutA = await describeLayout(frame);
      const rectsA = await panelRects(frame);
      const aRaw = storedRaw(FILE_A, KEY_A);
      const rootRaw = storedRaw(ROOT_FILE, ROOT_KEY);
      const rootSig = treeSig(storedLayout(ROOT_FILE, ROOT_KEY)?.root);

      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A before quit");
      ctx.notes.push(`before quit: A ${layoutA}, root ${rootSig}`);
      expect(rootSig === "H(catalog, settings)", `root layout not saved before quit: ${rootSig}`);
      ctx.at("quit the whole app and relaunch on the same profile");
      await psRestart();
      let reopened = await psOpen();

      expect(await describeLayout(reopened) === layoutA, `cluster A after restart ${await describeLayout(reopened)}, expected ${layoutA}`);
      expect(rectsMatch(rectsA, await panelRects(reopened), 3), "cluster A geometry changed across the restart");
      ctx.notes.push(`stored A unchanged by the restart: ${storedRaw(FILE_A, KEY_A) === aRaw}; root unchanged: ${storedRaw(ROOT_FILE, ROOT_KEY) === rootRaw}`);
      expect(treeSig(storedLayout(FILE_A, KEY_A)?.root) === treeSig(JSON.parse(aRaw).root), "stored cluster layout changed across the restart");
      await setRootFlag(true);
      await gotoRoot("/preferences");
      await rootHost().waitFor({ timeout: 30_000 });
      await sleep(800);
      expect(await rootLayout() === rootSig, `root after restart ${await rootLayout()}, expected ${rootSig}`);
      await psShot("ps09-after-restart-root");
      reopened = await psOpen();
      await psShot("ps09-after-restart-cluster");
    });

    await psRun("PS10", "Flag off: classic navigation, saved layouts untouched; flag on again restores", "flag off + navigate + flag on", async (ctx) => {
      await sleep(2000);
      const aRaw = storedRaw(FILE_A, KEY_A);
      const rootRaw = storedRaw(ROOT_FILE, ROOT_KEY);
      const aSig = treeSig(storedLayout(FILE_A, KEY_A)?.root);

      await setRootFlag(false);
      ctx.at("navigate /preferences (flag off)");
      await gotoRoot("/preferences");
      expect(await rootHost().count() === 0, "root-panel-host rendered with the flag off");
      expect(await page.locator("[data-testid=bound-settings]").count() === 0, "bound-settings with the flag off");
      expect(await page.getByText("Appearance", { exact: true }).count() >= 1, "classic Settings content missing");
      ctx.at("cluster with the flag off");
      const frame = await psOpen(false);

      expect(await frame.locator("[data-testid=global-panel-host]").count() === 0, "global-panel-host rendered with the flag off");
      expect(await frame.locator(".KubeObjectListLayout").count() >= 1, "classic list missing with the flag off");
      await sleep(3000);
      expect(storedRaw(FILE_A, KEY_A) === aRaw && storedRaw(ROOT_FILE, ROOT_KEY) === rootRaw, "a saved layout was rewritten or removed with the flag off");
      ctx.at("flag on again");
      const back = await psOpen(true);

      expect(treeSig(storedLayout(FILE_A, KEY_A)?.root) === aSig && await describeLayout(back) === aSig, `cluster after flag on ${await describeLayout(back)}, expected ${aSig}`);
      await setRootFlag(true);
      await gotoRoot("/preferences");
      await rootHost().waitFor({ timeout: 30_000 });
      await sleep(800);
      expect(await rootLayout() === treeSig(storedLayout(ROOT_FILE, ROOT_KEY)?.root), `root after flag on ${await rootLayout()}`);
      ctx.notes.push(`saved layouts byte-identical across the flag-off window: ${storedRaw(FILE_A, KEY_A) === aRaw && storedRaw(ROOT_FILE, ROOT_KEY) === rootRaw}`);
    });

    await psRun("PS11", "Resource Details restored as a mounted view", "row menu Details (docked) + reload", async (ctx) => {
      let frame = await psOpen();

      await showPods(frame);
      ctx.at("Pods row ⋮ → Details (docked)");
      await dockDetailsFromRow(frame, "pods", "h7-pod-0");
      expect(await until(async () => (await describeLayout(frame)).includes(DETAILS), 20_000), `details not docked: ${await describeLayout(frame)}`);
      await expectPodDetails(frame);
      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A");
      ctx.at("reload");
      frame = await psOpen();
      expect((await describeLayout(frame)).includes(DETAILS), `details not restored: ${await describeLayout(frame)}`);
      expect(await frame.locator(`[data-testid=restored-session-placeholder][data-panel-kind=${DETAILS}]`).count() === 0, "details restored as a placeholder");
      await expectPodDetails(frame);
      await psShot("ps11-details-restored");
    });

    await psRun("PS12", "Terminal: placeholder after restart, no PTY, Resume starts a new session", "catalog click + full restart + Resume", async (ctx) => {
      let frame = await psOpen();

      await showPods(frame);
      const { box } = await openTermBy(ctx, frame);
      const pid = await startSession(box, "ps12");

      ctx.notes.push(`session pid ${pid}; shells of the launch before restart ${psShellKids().length}`);
      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A");
      ctx.at("full restart with a live PTY");
      await psRestart();
      frame = await psOpen();
      const placeholder = frame.locator("[data-testid=restored-session-placeholder][data-panel-kind=terminal]");

      await placeholder.waitFor({ timeout: 30_000 });
      expect(await placeholder.count() === 1, "terminal placeholder missing");
      expect(psShellKids().length === 0, `shells after restart ${psShellKids().length}`);
      expect(!alive(pid), `previous PTY ${pid} still alive after restart`);
      await electronApp.evaluate(({ dialog }) => {
        globalThis.__h7Prod = { calls: 0 };
        dialog.showMessageBox = async () => { globalThis.__h7Prod.calls++; return { response: 1, checkboxChecked: false }; };
      });
      ctx.at("Resume the terminal");
      const resume = placeholder.locator("[data-testid=restored-session-resume]");

      expect((await resume.innerText()).includes("Start new session"), `resume label "${await resume.innerText()}"`);
      await resume.click();
      expect(await until(() => psShellKids().length === 1, 30_000), `shells after Resume ${psShellKids().length}`);
      const live = termBox(frame);

      await live.locator(".xterm").waitFor({ timeout: 30_000 });
      await sendLine(live, "echo PS12-$((6*7))");
      expect(await until(async () => (await termText(live)).includes("PS12-42"), 15_000), "terminal did not respond after Resume");
      const calls = await electronApp.evaluate(() => globalThis.__h7Prod.calls);

      expect(calls === 0, `native dialog invoked ${calls} time(s)`);
      await psShot("ps12-terminal-resumed");
      for (const kid of psShellKids()) { try { process.kill(kid, "SIGKILL"); } catch { /* already gone */ } }
    });

    await psRun("PS13", "Pod Logs and Kubetail: placeholders, no requests, one Resume each", "dock + reload + Resume", async (ctx) => {
      let frame = await psOpen();

      await showPods(frame);
      ctx.at("Pods row ⋮ → Logs (docked): app");
      await dockLogsFromRow(frame, "app");
      expect(await until(() => logStat(apis.a, "app").total > 0, 20_000), "no log requests for the docked logs");
      await showPods(frame);
      await openKb(ctx, frame);
      await selectKbWorkload(ctx, frame);
      const base = await kbStats(frame);

      ctx.notes.push(`before reload: kubetail streams ${base.streams}, lines ${base.lines}`);
      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A");
      ctx.at("reload with streams running");
      frame = await psOpen();
      const logsPh = frame.locator("[data-testid=restored-session-placeholder][data-panel-kind=pod-logs]");
      const kbPh = frame.locator(`[data-testid=restored-session-placeholder][data-panel-kind=${KB}]`);

      await logsPh.waitFor({ timeout: 30_000 });
      await kbPh.waitFor({ timeout: 30_000 });
      expect(await boundLogs(frame).count() === 0 && await kbBox(frame).count() === 0, "live views mounted under placeholders");
      const idleStart = kbLogTotal();

      await sleep(5000);
      expect(kbLogTotal() === idleStart, `log requests while placeholders shown: +${kbLogTotal() - idleStart}`);
      expect(await frame.locator("[data-testid=kubetail-stats]").count() === 0, "Kubetail stats rendered under a placeholder");
      ctx.at("Resume Pod Logs");
      await logsPh.locator("[data-testid=restored-session-resume]").click();
      await boundLogs(frame).first().waitFor({ timeout: 30_000 });
      expect(await until(async () => (await lineNos(boundLogs(frame))).length > 0, 20_000), "Pod Logs resumed without lines");
      expect(await kbPh.count() === 1, "Kubetail left its placeholder when Pod Logs resumed");
      ctx.at("Resume Kubetail");
      await kbPh.locator("[data-testid=restored-session-resume]").click();
      await sleep(800);
      // The Kubetail workload selection is not part of the saved layout: Resume shows the view, the user picks the workload again.
      await selectKbWorkload(ctx, frame);
      const after = await kbStats(frame);

      ctx.notes.push(`after Resume: kubetail streams ${after.streams} (before ${base.streams})`);
      expect(after.streams === base.streams, `Kubetail streams ${base.streams} → ${after.streams} after Resume`);
      await psShot("ps13-logs-kubetail-resumed");
    });

    await psRun("PS14", "Resource editor: placeholder after reload, no write, Resume loads", "row menu Edit (docked) + reload + Resume", async (ctx) => {
      let frame = await psOpen();

      await showPods(frame);
      const errorsFrom = consoleErrors.length;

      ctx.at("Pods row ⋮ → Edit (docked)");
      await dockEditFromRow(frame, "pods", "h7-pod-0");
      await boundEditor(frame).first().waitFor({ timeout: 30_000 });
      expect(noWrites(), "write attempted before the reload");
      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A");
      ctx.at("reload");
      frame = await psOpen();
      const ph = frame.locator(`[data-testid=restored-session-placeholder][data-panel-kind=${ED}]`);

      await ph.waitFor({ timeout: 30_000 });
      await sleep(3000);
      expect(await boundEditor(frame).count() === 0, "editor mounted under its placeholder");
      expect(noWrites(), `write attempted while the placeholder was shown (rejected ${apis.a.stats().rejected})`);
      ctx.at("Resume the editor");
      await ph.locator("[data-testid=restored-session-resume]").click();
      await boundEditor(frame).first().waitFor({ timeout: 30_000 });
      await sleep(1500);
      expect(noWrites(), `write attempted by Resume (rejected ${apis.a.stats().rejected})`);
      const pageErrors = consoleErrors.slice(errorsFrom).filter((e) => e.text.startsWith("pageerror"));

      expect(pageErrors.length === 0, `page errors: ${pageErrors.map((e) => e.text).join(" | ")}`);
      await psShot("ps14-editor-resumed");
    });

    await psRun("PS15", "Corrupt, unknown-version and foreign-cluster layouts fall back to the default", "state file edit + relaunch", async (ctx) => {
      const GARBAGE = "{not json";
      const ROOT_BAD = JSON.stringify({ version: 99, scope: "root", root: {} });
      const errorsFrom = consoleErrors.length;

      ctx.at("garbage in the cluster key, unknown version in the root key; relaunch");
      await psQuit();
      psClearLayoutKeys(); // :prev holds a valid earlier layout and would win over the default seed
      psWriteKey(FILE_A, KEY_A, GARBAGE);
      psWriteKey(ROOT_FILE, ROOT_KEY, ROOT_BAD);
      await psLaunch();
      let frame = await psOpen();

      ctx.notes.push(`stored keys ${Object.keys(readStore(FILE_A)).filter((k) => /layout/.test(k)).join(",")}`);
      expect(await describeLayout(frame) === "H(pods, deployments)", `cluster default after garbage ${await describeLayout(frame)}`);
      expect(await until(() => storedRaw(FILE_A, `${KEY_A}:corrupted`) === GARBAGE, 15_000), `cluster :corrupted ${storedRaw(FILE_A, `${KEY_A}:corrupted`)}`);
      ctx.at("root: default view after an unknown version");
      await setRootFlag(true);
      await gotoRoot("/preferences");
      await rootHost().waitFor({ timeout: 30_000 });
      await sleep(800);
      expect(await rootLayout() === RV, `root default ${await rootLayout()}`);
      expect(await until(() => storedRaw(ROOT_FILE, `${ROOT_KEY}:corrupted`) === ROOT_BAD, 30_000), `root :corrupted ${storedRaw(ROOT_FILE, `${ROOT_KEY}:corrupted`)}`);
      expect(await confirmation(page).count() === 0, "an error dialog is shown");

      ctx.at("foreign cluster layout under the cluster A key; relaunch");
      const FOREIGN = JSON.stringify({ version: 1, scope: "cluster", clusterId: clusterB ?? "0".repeat(32), root: { type: "leaf", id: "leaf-pods-foreign", panelKind: "pods" }, collapsedLeafIds: [] });

      await psQuit();
      psClearLayoutKeys();
      psWriteKey(FILE_A, KEY_A, FOREIGN);
      await psLaunch();
      frame = await psOpen();
      expect(await describeLayout(frame) === "H(pods, deployments)", `cluster default after foreign layout ${await describeLayout(frame)}`);
      expect(await until(() => storedRaw(FILE_A, `${KEY_A}:corrupted`) === FOREIGN, 30_000), `foreign :corrupted ${storedRaw(FILE_A, `${KEY_A}:corrupted`)}`);
      const pageErrors = consoleErrors.slice(errorsFrom).filter((e) => e.text.startsWith("pageerror"));

      expect(pageErrors.length === 0, `page errors: ${pageErrors.map((e) => e.text).join(" | ")}`);
      await psShot("ps15-fallback-default");
    });

    await psRun("PS16", "Detached Pod window: no window after restart, panel at most once", "detach (UI) + quit with it open + restart", async (ctx) => {
      const frame = await psOpen();

      await showPods(frame);
      // Detaching does not change the tree and an untouched seed is never written: make a real layout change first.
      await dragDivider(frame, frame.locator("[data-testid^=branch-divider-]").first(), 80, 0);
      const before = await windowCount();

      ctx.at("detach Pods from its header");
      await detachViaUi(frame, "pods");
      expect(await windowCount() === before + 1, "no native window for the detached Pods");
      await psWaitSaved(ctx, liveA, FILE_A, KEY_A, "cluster A before quit");
      ctx.at("quit with the detached window open, then restart");
      await psRestart();
      const detachedCount = () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
        .filter((w) => !w.isDestroyed() && w.webContents.getURL().endsWith("detached-tool.html")).length);
      const detachedAfter = await detachedCount();

      ctx.notes.push(`after restart: windows ${await windowCount()}, detached ${detachedAfter}`);
      expect(detachedAfter === 0, `${detachedAfter} detached window(s) opened by the restart`);
      const reopened = await psOpen();
      const layout = await describeLayout(reopened);
      const pods = (layout.match(/pods/g) ?? []).length;

      ctx.notes.push(`layout ${layout}`);
      expect(pods <= 1, `Pods appears ${pods} times: ${layout}`);
      expect(await detachedCount() === 0, "a detached window appeared after the workspace loaded");
      await psShot("ps16-after-restart");
    });
  }

  // H7.6.4: leave the root flag as the run found it.
  await page.evaluate(([key, value]) => (value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)), [FLAG_KEY, rootFlagBefore]).catch(() => {});
} catch (error) {
  log(`setup failed: ${error.stack}`);
  await shot("FAIL-setup").catch(() => {});
  results.push({ id: "SETUP", name: "Environment setup", status: "BLOCKED", error: error.message });
} finally {
  // Leave the QA profile as found: flag OFF in every synthetic cluster frame that exists.
  for (const frame of page.frames().filter((f) => /\.lens\.app/.test(f.url()) && /^https:\/\/[0-9a-f]{32}\./.test(f.url()))) {
    await setFlag(frame, false).catch(() => {});
  }
  // H7.6.3D: remove the scratch dir and the .zshrc this run created in the isolated QA home.
  if (globalThis.__h7Tm) {
    fs.rmSync(globalThis.__h7Tm.dir, { recursive: true, force: true });
    if (globalThis.__h7Tm.zshrc) fs.rmSync(globalThis.__h7Tm.zshrc, { force: true });
  }
  await tracing.stop().catch(() => {});
  await env.recorder.stop().catch(() => {});
  const video = env.recorder.video;

  // QA00: running the suite must not touch versioned evidence (compared with the state before the run).
  {
    const changed = historicalEvidence().filter((line) => !historicalEvidenceBefore.includes(line));

    record("QA00", "Versioned evidence in docs/evidence untouched by the run", changed.length ? "FAIL" : "PASS", changed.length ? `changed: ${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ` (+${changed.length - 5})` : ""}` : `0 tracked files changed under docs/evidence (images written to ${EVIDENCE_ROOT})`);
  }
  if (psLaunched) await psLaunched.close().catch(() => {});
  await env.stop();
  for (const file of QA_STORES) fs.copyFileSync(path.join(QA_BACKUP, file), path.join(QA_STORE_DIR, file));
  // H7.7: lens-local-storage as found (layouts written by the PS scenarios are removed).
  for (const file of fs.existsSync(QA_LLS_DIR) ? fs.readdirSync(QA_LLS_DIR) : []) {
    if (!qaLlsBefore.includes(file)) fs.rmSync(path.join(QA_LLS_DIR, file), { force: true });
  }
  for (const file of qaLlsBefore) fs.copyFileSync(path.join(QA_LLS_BACKUP, file), path.join(QA_LLS_DIR, file));
  writeReports(video);
}

function writeReports(video) {
  const count = (status) => results.filter((r) => r.status === status).length;
  const summary = {
    commit, uncommittedChanges: Boolean(dirty), electron: env.electronVersion, profile: QA_PROFILE, artifacts: ARTIFACTS, video,
    totals: { PASS: count("PASS"), FAIL: count("FAIL"), SKIP: count("SKIP"), BLOCKED: count("BLOCKED"), "NOT IMPLEMENTED": count("NOT IMPLEMENTED") },
    consoleErrors: consoleErrors.length,
    apiRejectedMutations: { a: apis.a.stats().rejected, b: apis.b.stats().rejected },
    results,
  };
  const rows = results.map((r) => `<tr class="${r.status.replace(" ", "-")}"><td>${r.id}</td><td>${r.name}</td><td>${r.status}</td><td>${r.input ?? ""}</td><td>${[r.step && `step: ${r.step}`, r.error, ...(r.notes ?? [])].filter(Boolean).join("<br>").replace(/</g, "&lt;").replace(/&lt;br>/g, "<br>")}</td></tr>`).join("\n");
  const html = `<!doctype html><meta charset="utf-8"><title>H7 Playwright QA</title>
<style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;vertical-align:top}.PASS td:nth-child(3){color:#1a7f37}.FAIL td:nth-child(3){color:#cf222e;font-weight:bold}.NOT-IMPLEMENTED td:nth-child(3){color:#9a6700}</style>
<h1>H7 Playwright QA</h1><p>Commit ${commit}${dirty ? " (+uncommitted)" : ""} · Electron ${env.electronVersion} · ${JSON.stringify(summary.totals)}</p>
<table><tr><th>ID</th><th>Test</th><th>Status</th><th>Input</th><th>Details</th></tr>${rows}</table>`;

  fs.writeFileSync(path.join(ARTIFACTS, "results.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(ARTIFACTS, "report.html"), html);
  fs.writeFileSync(path.join(ARTIFACTS, "console-errors.json"), JSON.stringify(consoleErrors, null, 2));
  fs.writeFileSync(path.join(EVIDENCE, "results.json"), JSON.stringify({ ...summary, artifacts: "local only", video: video ? path.basename(video) : undefined }, null, 2));
  log(`totals ${JSON.stringify(summary.totals)}`);
  log(`report ${path.join(ARTIFACTS, "report.html")}`);
  process.exitCode = summary.totals.FAIL || summary.totals.BLOCKED ? 1 : 0;
}
