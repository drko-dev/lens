// Playwright harness for the H7 global docking QA suite.
// Launches the development Electron app with an isolated QA profile against synthetic,
// read-only Kubernetes APIs, and exposes real mouse/keyboard helpers for the cluster frame.
import { _electron as electron } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSyntheticKubeApi } from "./synthetic-kube-api.mjs";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const OPEN_LENS_DIR = path.join(REPO_ROOT, "open-lens");
export const ELECTRON_PATH = path.join(REPO_ROOT, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
export const QA_PROFILE = process.env.H7_QA_PROFILE ?? path.join(os.homedir(), "Documents/lens/qa-profiles/h7-dev");
export const DEV_SERVER_PORT = 9191;
export const API_PORTS = { a: 18443, b: 18444 };
export const FLAG_KEY = "openlens:global-docking";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const portInUse = (port) => new Promise((resolve) => {
  const socket = net.connect(port, "127.0.0.1");

  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
});

async function ensureDevServer(log) {
  if (await portInUse(DEV_SERVER_PORT)) {
    log(`dev server already running on :${DEV_SERVER_PORT} (reused, left running)`);

    return async () => {};
  }

  log("starting renderer dev server (npm run dev:renderer)");
  const child = spawn("npm", ["run", "dev:renderer"], { cwd: OPEN_LENS_DIR, detached: true, stdio: "ignore" });

  for (let i = 0; i < 300 && !(await portInUse(DEV_SERVER_PORT)); i++) await sleep(1000);
  if (!(await portInUse(DEV_SERVER_PORT))) throw new Error("dev server did not start");
  await sleep(5000); // first compilation

  return async () => { try { process.kill(-child.pid, "SIGTERM"); } catch { /* already gone */ } };
}

/**
 * Starts the whole environment. Fails fast if a QA port is taken by someone else.
 */
export async function startEnvironment({ artifactsDir, log = console.log }) {
  for (const port of Object.values(API_PORTS)) {
    if (await portInUse(port)) throw new Error(`port ${port} is in use; stop the other QA environment first`);
  }

  const stopDevServer = await ensureDevServer(log);
  const apis = { a: await startSyntheticKubeApi(API_PORTS.a), b: await startSyntheticKubeApi(API_PORTS.b) };
  const videoDir = path.join(artifactsDir, "video");

  fs.mkdirSync(videoDir, { recursive: true });

  const app = await electron.launch({
    executablePath: ELECTRON_PATH,
    cwd: OPEN_LENS_DIR,
    args: ["."],
    timeout: 120_000,
    env: {
      NODE_ENV: "development",
      CICD: path.join(QA_PROFILE, "appdata"),
      HOME: path.join(QA_PROFILE, "home"),
      KUBECONFIG: path.join(QA_PROFILE, "home/.kube/config"),
      PATH: process.env.PATH,
      SHELL: "/bin/sh",
    },
  });
  // The first window can be the splash screen; wait for the main window.
  let page;

  for (let i = 0; i < 240 && !page; i++) {
    page = app.windows().find((w) => w.url().startsWith("https://lens.app"));
    if (!page) await sleep(500);
  }
  if (!page) {
    await app.close().catch(() => {});
    await apis.a.close();
    await apis.b.close();
    await stopDevServer();
    throw new Error(`main window not found; windows: ${app.windows().map((w) => w.url()).join(", ")}`);
  }
  await page.waitForLoadState("domcontentloaded");

  const electronVersion = await app.evaluate(() => process.versions.electron);
  const recorder = await startScreencast(page, videoDir, log);

  return {
    app, page, apis, electronVersion, recorder,
    async stop() {
      await recorder.stop();
      await app.close().catch(() => {});
      await apis.a.close();
      await apis.b.close();
      await stopDevServer();
    },
  };
}

/**
 * Records the main window with the CDP screencast (the cluster iframe is composited in) and
 * encodes an MP4 with the system ffmpeg when available. Playwright's recordVideo needs its own
 * ffmpeg download, which this repo does not install.
 */
async function startScreencast(page, videoDir, log) {
  const framesDir = path.join(videoDir, "frames");
  const frames = [];
  const cdp = await page.context().newCDPSession(page);

  fs.mkdirSync(framesDir, { recursive: true });
  let recording = true;

  cdp.on("Page.screencastFrame", ({ data, sessionId, metadata }) => {
    if (!recording) return; // frames can still arrive after stopScreencast
    const file = path.join(framesDir, `${String(frames.length).padStart(6, "0")}.jpg`);

    fs.writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1280, maxHeight: 800, everyNthFrame: 2 });

  return {
    video: undefined,
    stopped: false,
    async stop() {
      if (this.stopped) return;
      this.stopped = true;
      recording = false;
      await cdp.send("Page.stopScreencast").catch(() => {});
      if (frames.length < 2) return;
      const list = path.join(videoDir, "frames.ffconcat");
      const lines = ["ffconcat version 1.0"];

      frames.forEach((frame, i) => {
        const next = frames[i + 1]?.t ?? frame.t + 0.5;

        lines.push(`file '${frame.file}'`, `duration ${Math.min(Math.max(next - frame.t, 0.01), 5).toFixed(3)}`);
      });
      lines.push(`file '${frames.at(-1).file}'`);
      fs.writeFileSync(list, lines.join("\n"));
      const out = path.join(videoDir, "h7-qa-run.mp4");

      try {
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-pix_fmt", "yuv420p", "-r", "15", out]);
        fs.rmSync(framesDir, { recursive: true, force: true });
        fs.rmSync(list, { force: true });
        this.video = out;
      } catch (error) {
        log(`ffmpeg unavailable or failed (${error.message.split("\n")[0]}); frames kept in ${framesDir}`);
        this.video = framesDir;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Cluster frame
// ---------------------------------------------------------------------------

export const clusterFrame = (page, clusterId) => page.frames().find((f) => f.url().includes(`${clusterId}.lens.app`));

export async function waitForClusterFrame(page, clusterId, timeout = 90_000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const frame = clusterFrame(page, clusterId);

    if (frame && await frame.locator("[data-testid=sidebar-item-link-for-workloads]").count().catch(() => 0)) return frame;
    await sleep(500);
  }
  throw new Error(`cluster frame ${clusterId} not ready`);
}

/** Opens a cluster from the catalog by its visible name (real clicks), returns its id. */
export async function openClusterFromCatalog(page, name) {
  await page.locator("[data-testid=home-button]").click();
  await page.locator("[data-testid=welcome-open-catalog]").click();
  const row = page.locator(".TableRow").filter({ hasText: name }).first();

  await row.waitFor({ timeout: 30_000 });
  const before = new Set(page.frames().map((f) => f.url()));

  await row.click();

  for (let i = 0; i < 180; i++) {
    const frame = page.frames().find((f) => /^https:\/\/[0-9a-f]{32}\.lens\.app/.test(f.url()) && !before.has(f.url()));
    const id = frame?.url().match(/^https:\/\/([0-9a-f]{32})\./)?.[1];

    if (id) return id;
    await sleep(500);
  }
  throw new Error(`cluster ${name} did not open`);
}

/** Switches to an already open cluster through its workspace tab (real click). */
export async function activateCluster(page, clusterId) {
  await page.locator(`[data-testid=workspace-tab-${clusterId}]`).click();

  return waitForClusterFrame(page, clusterId);
}

export async function setFlag(frame, on) {
  await frame.evaluate(([key, value]) => (value ? localStorage.setItem(key, "true") : localStorage.removeItem(key)), [FLAG_KEY, on]);
}

/** Reloads the cluster frame (fresh in-memory layout) and opens a route with real sidebar clicks. */
export async function reloadFrame(page, clusterId) {
  const frame = clusterFrame(page, clusterId);

  await frame.goto(new URL(frame.url()).origin + "/");

  return waitForClusterFrame(page, clusterId);
}

export async function navigate(frame, route) {
  if (route === "overview") {
    await frame.locator("[data-testid=sidebar-item-link-for-cluster-overview]").click();
  } else {
    const link = frame.locator(`[data-testid=sidebar-item-link-for-${route}]`);

    if (!(await link.count())) await frame.locator("[data-testid=sidebar-item-link-for-workloads]").click();
    await link.click({ timeout: 45_000 });
  }
  await sleep(1200);
}

// ---------------------------------------------------------------------------
// Layout inspection (DOM + real geometry)
// ---------------------------------------------------------------------------

/** Structure as rendered, e.g. "H(pods, deployments)", "V(...)", "tabs[pods,*deployments]". */
export function describeLayout(frame) {
  return frame.evaluate(() => {
    const kindOf = (id) => id.replace(/^leaf-/, "").replace(/-\d+-\w+$/, "");
    const describe = (el) => {
      if (!el) return "?";
      const id = el.dataset.testid || "";

      if (id.startsWith("branch-container-")) {
        const first = el.querySelector(":scope > [data-testid^=branch-first-] > *");
        const second = el.querySelector(":scope > [data-testid^=branch-second-] > *");

        return `${el.dataset.orientation === "horizontal" ? "H" : "V"}(${describe(first)}, ${describe(second)})`;
      }
      if (id.startsWith("group-node-")) {
        return `tabs[${[...el.querySelectorAll("button[data-testid^=tab-leaf-]")].map((t) => (t.className.includes("active") ? "*" : "") + kindOf(t.dataset.testid.slice(4))).join(",")}]`;
      }
      if (id.startsWith("leaf-node-")) return kindOf(id.slice("leaf-node-".length));

      return describe(el.firstElementChild);
    };

    return describe(document.querySelector("[data-testid=global-panel-host]")?.firstElementChild);
  });
}

/** Visible panel rectangles by kind, in frame CSS pixels. */
export function panelRects(frame) {
  return frame.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-testid^=panel-container-leaf-]")].map((el) => {
    const r = el.getBoundingClientRect();

    return [el.dataset.testid.replace("panel-container-leaf-", "").replace(/-\d+-\w+$/, ""), { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }];
  })));
}

export const leftOf = (a, b) => a.x + a.w <= b.x + 2 && Math.abs(a.y - b.y) <= 2;
export const above = (a, b) => a.y + a.h <= b.y + 2 && Math.abs(a.x - b.x) <= 2;

// ---------------------------------------------------------------------------
// Real input helpers (page.mouse / page.keyboard only)
// ---------------------------------------------------------------------------

export const header = (frame, kind) => frame.locator(`[data-testid^="panel-container-leaf-${kind}-"] > [draggable=true]`);
export const panel = (frame, kind) => frame.locator(`[data-testid^="panel-container-leaf-${kind}-"]`);
export const tab = (frame, kind) => frame.locator(`button[data-testid^="tab-leaf-${kind}-"]`);

/** The zone the host resolves for a panel: its tab group when grouped, otherwise the panel. */
export async function dropZone(frame, kind) {
  const grouped = frame.locator(`[data-testid^=group-node-]:has([data-testid^="panel-container-leaf-${kind}-"])`);

  return (await grouped.count()) ? grouped.first() : panel(frame, kind);
}

/**
 * Drags a panel header with a progressive mouse path and releases it at `to` (page coordinates).
 * Returns the drop indicator state seen just before release.
 */
export async function dragHeader(page, frame, kind, to, { steps = 24, cancelWithEscape = false } = {}) {
  const box = await header(frame, kind).boundingBox();

  if (!box) throw new Error(`header of ${kind} not visible`);
  const from = { x: box.x + 40, y: box.y + box.height / 2 };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 3 });

  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
    await sleep(15);
  }
  await sleep(150);

  const indicator = await frame.evaluate(() => {
    const el = document.querySelector("[data-testid=global-panel-drop-preview]");

    return el ? { position: el.dataset.position, target: el.dataset.target?.replace(/^leaf-/, "").replace(/-\d+-\w+$/, "") } : null;
  });

  if (cancelWithEscape) await page.keyboard.press("Escape");
  await page.mouse.up();
  await sleep(700);

  return indicator;
}

/** Page coordinates of a point inside a locator, as fractions of its box. */
export async function pointIn(locator, fx, fy) {
  const box = await locator.boundingBox();

  if (!box) throw new Error("drop zone not visible");

  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Synthetic API counters for one path. `open` = still connected, `started` = historical. */
export function watchCount(api, apiPath) {
  const stats = api.stats();

  return { open: stats.open[apiPath] ?? 0, started: stats.started[apiPath] ?? 0, totalOpen: Object.values(stats.open).reduce((a, b) => a + b, 0) };
}

export const WATCH_PATHS = {
  deployments: "/apis/apps/v1/namespaces/h7-synthetic/deployments",
  pods: "/api/v1/namespaces/h7-synthetic/pods",
};
