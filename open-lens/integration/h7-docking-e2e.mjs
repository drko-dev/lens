// H7 global docking — end-to-end QA on the real Electron app with Playwright.
// Usage (from open-lens/):  node integration/h7-docking-e2e.mjs
// Interactions use page.mouse / page.keyboard / locator.click only. Store state is never mutated
// directly; the synthetic Kubernetes API counters are read to verify watches.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  REPO_ROOT, QA_PROFILE, WATCH_PATHS, above, activateCluster, clusterFrame, describeLayout, dragHeader, dropZone,
  control, header, leftOf, navigate, panelHeader, restoreChip, openClusterFromCatalog, panel, panelRects, pointIn, reloadFrame, setFlag, sleep,
  startEnvironment, tab, waitForClusterFrame, watchCount,
} from "./h7/harness.mjs";

const CLUSTER_A = process.env.H7_CLUSTER_A ?? "bcf6e5e75270d785e9c003028c536bb2"; // context h7-synthetic
const CLUSTER_B_NAME = "h7-synthetic-b";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const ARTIFACTS = process.env.H7_QA_ARTIFACTS ?? path.join(os.homedir(), "Documents/lens/qa-artifacts/h7-playwright", stamp);
const EVIDENCE = path.join(REPO_ROOT, "docs/evidence/h7-qa");
const EVIDENCE_H74 = path.join(REPO_ROOT, "docs/evidence/h7-4");
const EVIDENCE_H75 = path.join(REPO_ROOT, "docs/evidence/h7-5");
const TEST_TIMEOUT = 150_000;

fs.mkdirSync(path.join(ARTIFACTS, "screenshots"), { recursive: true });
fs.mkdirSync(path.join(ARTIFACTS, "traces"), { recursive: true });
fs.mkdirSync(EVIDENCE, { recursive: true });
fs.mkdirSync(EVIDENCE_H74, { recursive: true });
fs.mkdirSync(EVIDENCE_H75, { recursive: true });

// H7.4 changes cluster color/environment and pins a cluster in the QA profile through the UI.
// Back the two stores up before Electron starts and put them back after it exits.
const QA_STORE_DIR = path.join(QA_PROFILE, "appdata/OpenLens DevOpsDev");
const QA_STORES = ["lens-cluster-store.json", "lens-hotbar-store.json"];
const QA_BACKUP = path.join(ARTIFACTS, "profile-backup");

fs.mkdirSync(QA_BACKUP, { recursive: true });
for (const file of QA_STORES) fs.copyFileSync(path.join(QA_STORE_DIR, file), path.join(QA_BACKUP, file));

const log = (...args) => console.log(`[h7-qa ${new Date().toISOString().slice(11, 19)}]`, ...args);
const results = [];
const consoleErrors = [];
const commit = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT }).toString().trim();
const dirty = execSync("git status --porcelain --untracked-files=no", { cwd: REPO_ROOT }).toString().trim();

class Check extends Error {}
const expect = (condition, message) => { if (!condition) throw new Check(message); };

log(`artifacts: ${ARTIFACTS}`);
const env = await startEnvironment({ artifactsDir: ARTIFACTS, log });
const { page, apis } = env;
const tracing = env.app.context().tracing;

page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push({ at: Date.now(), text: msg.text().slice(0, 300), url: msg.location()?.url ?? "" }); });
page.on("pageerror", (error) => consoleErrors.push({ at: Date.now(), text: `pageerror: ${error.message}`.slice(0, 300), url: "" }));
await tracing.start({ screenshots: true, snapshots: true });

async function shot(name, { evidence = false } = {}) {
  await page.screenshot({ path: path.join(ARTIFACTS, "screenshots", `${name}.png`) });
  if (evidence) await page.screenshot({ path: path.join(EVIDENCE, `${name}.jpg`), type: "jpeg", quality: 70 });
}

// H7_ONLY=<regex> runs only the matching scenario ids (focused runs); unset runs the whole suite.
const ONLY = process.env.H7_ONLY ? new RegExp(process.env.H7_ONLY) : undefined;

async function run(id, name, input, fn) {
  if (ONLY && !ONLY.test(id)) return;
  const ctx = { step: "start", notes: [] };
  const started = Date.now();

  ctx.at = (step) => { ctx.step = step; };
  await tracing.startChunk({ title: id });

  try {
    await Promise.race([fn(ctx), sleep(TEST_TIMEOUT).then(() => { throw new Error(`timeout after ${TEST_TIMEOUT} ms`); })]);
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
async function freshHost(ctx, clusterId = CLUSTER_A) {
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

  await run("D13", "Catalog + offers only Pods and Deployments", "locator.click", async (ctx) => {
    const frame = await freshHost(ctx);
    const offered = () => frame.evaluate(() => [...document.querySelectorAll("[data-testid^=catalog-card-]")].map((e) => e.dataset.testid.slice("catalog-card-".length)));

    ctx.at("open catalog with both panels open");
    await frame.locator("[data-testid^=panel-add-button-leaf-pods-]").click();
    await frame.locator("[data-testid=catalog-modal]").waitFor();
    const withBoth = await offered();

    ctx.notes.push(`both open → offered [${withBoth}]`);
    expect(withBoth.every((k) => k === "pods" || k === "deployments") && withBoth.length === 0, `offered ${withBoth}`);
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
    expect(afterClose.join() === "deployments", `offered ${afterClose}`);
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
  const electronApp = env.app;
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
  const prun = (id, name, input, fn) => run(id, name, input, async (ctx) => {
    try {
      await fn(ctx);
    } finally {
      await closeAllDetached().catch(() => {});
      await sleep(600);
    }
  });

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
    expect(state.rows.length === 1 && state.rows[0][0] === "h7-pod-0" && state.rows[0][2] === "Running" && state.rows[0][3] === "1/1", `rows ${JSON.stringify(state.rows)}`);
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
  const drun = (id, name, input, fn) => prun(id, name, input, async (ctx) => {
    await connect(CLUSTER_A); // visible (and connected) before each scenario
    await fn(ctx);
  });
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
} catch (error) {
  log(`setup failed: ${error.stack}`);
  await shot("FAIL-setup").catch(() => {});
  results.push({ id: "SETUP", name: "Environment setup", status: "BLOCKED", error: error.message });
} finally {
  // Leave the QA profile as found: flag OFF in every synthetic cluster frame that exists.
  for (const frame of page.frames().filter((f) => /\.lens\.app/.test(f.url()) && /^https:\/\/[0-9a-f]{32}\./.test(f.url()))) {
    await setFlag(frame, false).catch(() => {});
  }
  await tracing.stop().catch(() => {});
  await env.recorder.stop().catch(() => {});
  const video = env.recorder.video;

  await env.stop();
  for (const file of QA_STORES) fs.copyFileSync(path.join(QA_BACKUP, file), path.join(QA_STORE_DIR, file));
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
