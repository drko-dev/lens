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
  header, leftOf, navigate, openClusterFromCatalog, panel, panelRects, pointIn, reloadFrame, setFlag, sleep,
  startEnvironment, tab, waitForClusterFrame, watchCount,
} from "./h7/harness.mjs";

const CLUSTER_A = process.env.H7_CLUSTER_A ?? "bcf6e5e75270d785e9c003028c536bb2"; // context h7-synthetic
const CLUSTER_B_NAME = "h7-synthetic-b";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const ARTIFACTS = process.env.H7_QA_ARTIFACTS ?? path.join(os.homedir(), "Documents/lens/qa-artifacts/h7-playwright", stamp);
const EVIDENCE = path.join(REPO_ROOT, "docs/evidence/h7-qa");
const TEST_TIMEOUT = 150_000;

fs.mkdirSync(path.join(ARTIFACTS, "screenshots"), { recursive: true });
fs.mkdirSync(path.join(ARTIFACTS, "traces"), { recursive: true });
fs.mkdirSync(EVIDENCE, { recursive: true });

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

async function run(id, name, input, fn) {
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

  await run("D09", "Resize with the mouse", "mouse drag (divider)", async (ctx) => {
    const frame = await freshHost(ctx);
    const before = await panelRects(frame);
    const divider = frame.locator("[data-testid^=branch-divider-]").first();
    const box = await divider.boundingBox();

    ctx.at("drag the divider 200px to the right");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 20 });
    await page.mouse.up();
    await sleep(500);
    const after = await panelRects(frame);

    ctx.notes.push(`pods ${before.pods.w}→${after.pods.w}px, deployments ${before.deployments.w}→${after.deployments.w}px`);
    expect(after.pods.w - before.pods.w > 150 && before.deployments.w - after.deployments.w > 150, ctx.notes.at(-1));
    await assertLayout(ctx, frame, "H(pods, deployments)");
    await shot("d09-resized");
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
  // H7.3 — controls and collapse: detect, never implement here
  // -------------------------------------------------------------------------
  frameA = clusterFrame(page, CLUSTER_A);
  const h73 = await frameA.locator("[data-testid^=panel-collapse-button-]").count();
  const h73Tests = [
    ["C01", "Pointer outside header"], ["C02", "Hover header"], ["C03", "Leave header"], ["C04", "Focus with Tab"],
    ["C05", "Press −"], ["C06", "Restore panel"], ["C07", "Collapse inside a group"], ["C08", "Collapse last panel"],
    ["C09", "Press ×"], ["C10", "Reopen from catalog"], ["C11", "Keyboard move"], ["C12", "Drag after restore"],
    ["C13", "Header height on hover"],
  ];

  for (const [id, name] of h73Tests) {
    record(id, name, h73 ? "BLOCKED" : "NOT IMPLEMENTED", h73 ? "collapse controls found but the H7.3 suite is not written yet" : "no panel-collapse-button-* in the host (H7.3 not implemented)");
  }

  // -------------------------------------------------------------------------
  // H7.2.1 — watch lifecycle regression (synthetic API counters)
  // -------------------------------------------------------------------------
  const podsSamples = [];
  const samplePods = (where) => podsSamples.push({ where, ...watchCount(apis.a, WATCH_PATHS.pods) });
  const dep = () => watchCount(apis.a, WATCH_PATHS.deployments);
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
    await page.mouse.up();
    await sleep(500);
    const after = await panelRects(frame);

    // Direction is asserted by D09; here the sequence only needs the divider to resize the panels.
    ctx.notes.push(`resize (divider dragged down 120px): pods ${before.pods.h}→${after.pods.h}px`);
    expect(Math.abs(after.pods.h - before.pods.h) > 80, `resize had no effect: pods ${before.pods.h}→${after.pods.h}`);
    ctx.notes.push("7–8. collapse/restore Pods: SKIPPED (H7.3 not implemented)");
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
