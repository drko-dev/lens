"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { clusterFixtureId, createClusterFixture, hotbarClusterPin, classifyVisualPreflight } = require("./head-stabilization.cjs");

const ROOT = path.resolve(__dirname, "../../..");
const APP = path.join(ROOT, "open-lens/dist-stage-head-node20-20261029/mac-arm64/OpenLens DevOps.app");
const APP_ASAR = path.join(APP, "Contents/Resources/app.asar");
const APP_BINARY = path.join(APP, "Contents/MacOS/OpenLens DevOps");
const EXPECTED_SHA = "eabd34a19c49c6937d3e96d71201c72a2c144230c4f5969dc6a5d9afccb41924";
const CONTEXTS = [{ name: "ui04-prod-fixture" }, { name: "ui04-qa-fixture" }];
const FIXTURE_COUNTS = [1, 2, 5, 25, 35];
const VIEWPORTS = [[1280, 800], [900, 620], [700, 560]];
const WEBLINKS = Array.from({ length: 33 }, (_, index) => {
  const suffix = String(index + 1).padStart(3, "0");
  return { id: `ui04-local-link-${suffix}`, name: `UI04 Fixture ${suffix}`, url: `data:text/plain,UI04-${suffix}` };
});

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const OUTPUT = path.join(ROOT, `open-lens/qa/2026-10-29/head-node20-20261029/ui04-fixture-${timestamp}-${process.pid}`);
const SCREENSHOTS = path.join(OUTPUT, "screenshots");
const result = {
  candidate: path.relative(ROOT, APP),
  appAsarSha256: null,
  architecture: null,
  profileIsolation: "NOT_RUN",
  fixtureBackends: [],
  cases: [],
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  processesAfterClose: [],
  status: "FAIL",
};

let qaRoot;
let app;
let demoServers = [];
let page;
let contextIds;
let kubeconfigPath;
let userDataPath;
let baselineProxyPids = [];

process.env.TS_NODE_PROJECT = path.join(ROOT, "packages/core/tsconfig.json");
require("ts-node/register/transpile-only");
const { DemoClusterServer } = require(path.join(ROOT, "packages/core/src/main/demo-cluster/demo-cluster-server.ts"));

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function makeProfile(servers) {
  qaRoot = mkdtempSync(path.join(os.tmpdir(), "openlens-ui04-local-"));
  const profile = {
    root: qaRoot,
    home: path.join(qaRoot, "home"),
    cicd: path.join(qaRoot, "cicd"),
    tmp: path.join(qaRoot, "tmp"),
  };
  kubeconfigPath = path.join(profile.home, ".kube/config");
  userDataPath = path.join(profile.cicd, "OpenLens DevOps");
  mkdirSync(profile.tmp, { recursive: true });
  mkdirSync(userDataPath, { recursive: true });

  const kubeconfig = createClusterFixture(CONTEXTS.map((context, index) => ({
    ...context,
    endpoint: servers[index].endpoint,
  })));
  writeJson(kubeconfigPath, kubeconfig);
  contextIds = CONTEXTS.map(({ name }) => clusterFixtureId(kubeconfigPath, name));

  writeJson(path.join(userDataPath, "lens-cluster-store.json"), {
    clusters: CONTEXTS.map(({ name }, index) => ({
      id: contextIds[index],
      contextName: name,
      kubeConfigPath: kubeconfigPath,
      preferences: { clusterEnvironment: index === 0 ? "production" : "testing" },
      metadata: {},
      accessibleNamespaces: [],
      labels: {},
    })),
    __internal__: { migrations: { version: "6.5.0" } },
  });

  return profile;
}

function seedFavorites(count) {
  const clusterPins = CONTEXTS.map(({ name }, index) => hotbarClusterPin(contextIds[index], name));
  const pins = [clusterPins[0], ...(count > 1 ? [clusterPins[1]] : [])];
  const links = WEBLINKS.slice(0, count - pins.length);
  const hotbarItems = [...pins, ...links.map(({ id, name }) => ({ entity: {
    uid: id,
    name,
    source: "local",
    shortName: name.slice(-2),
  } }))];

  assert.equal(hotbarItems.length, count);
  writeJson(path.join(userDataPath, "lens-weblink-store.json"), {
    weblinks: links,
    __internal__: { migrations: { version: "6.5.0" } },
  });
  writeJson(path.join(userDataPath, "lens-hotbar-store.json"), {
    hotbars: [{ id: "ui04-isolated-fixture", name: "UI-04 isolated fixtures", items: hotbarItems }],
    activeHotbarId: "ui04-isolated-fixture",
    __internal__: { migrations: { version: "6.5.0" } },
  });
}

function childEnvironment(profile) {
  return {
    PATH: process.env.PATH,
    HOME: profile.home,
    CICD: profile.cicd,
    KUBECONFIG: kubeconfigPath,
    TMPDIR: profile.tmp,
    XDG_CONFIG_HOME: path.join(profile.root, "xdg-config"),
    XDG_DATA_HOME: path.join(profile.root, "xdg-data"),
    XDG_CACHE_HOME: path.join(profile.root, "xdg-cache"),
    USER: "openlens-ui04-qa",
    LOGNAME: "openlens-ui04-qa",
    SHELL: "/bin/zsh",
    TERM: "xterm-256color",
    LANG: process.env.LANG || "en_US.UTF-8",
    PS1: "openlens-ui04$ ",
    PROMPT: "openlens-ui04% ",
  };
}

function isInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function waitUntil(predicate, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

async function launch(profile) {
  app = await electron.launch({
    executablePath: APP_BINARY,
    args: ["--integration-testing"],
    env: childEnvironment(profile),
    timeout: 90000,
  });
  const paths = await app.evaluate(({ app: electronApp }) => ({
    appData: electronApp.getPath("appData"),
    userData: electronApp.getPath("userData"),
    sessionData: electronApp.getPath("sessionData"),
  }));
  assert(Object.values(paths).every(value => isInside(value, profile.cicd)), `Electron profile escaped isolated CICD: ${JSON.stringify(paths)}`);
  result.profileIsolation = "PASS";
  page = await waitUntil(() => app.windows().find(window => window.url().startsWith("https://lens.app")), 60000);
  assert(page, "Electron main renderer did not load");
  page.setDefaultTimeout(15000);
  page.on("console", message => {
    if (message.type() === "error") result.consoleErrors.push(message.text().slice(0, 240));
  });
  page.on("pageerror", error => result.pageErrors.push(String(error.message).slice(0, 240)));
  page.on("requestfailed", request => result.requestFailures.push({
    url: request.url().replace(/\/api.*/, "/api/<redacted>"),
    error: request.failure()?.errorText,
  }));
  await page.getByTestId("welcome-page").waitFor({ timeout: 45000 });
  return page;
}

async function closeApp() {
  if (!app) return;
  const pid = app.process()?.pid;
  const running = app;
  await running.close();
  app = undefined;
  page = undefined;
  if (pid) {
    const exited = await waitUntil(() => {
      try { process.kill(pid, 0); return false; } catch { return true; }
    }, 10000);
    result.processesAfterClose.push({ pid, exited });
    assert(exited, `Electron process ${pid} remained after graceful close`);
  }
}

function pinIds(targetPage = page) {
  return targetPage.locator(".HotbarMenu .HotbarCell").evaluateAll(cells => cells
    .map(cell => cell.querySelector('[id^="hotbarIcon-"]')?.id?.replace(/^hotbarIcon-/, "") ?? null)
    .filter(Boolean));
}

async function waitForPinCount(expected) {
  const observed = await waitUntil(async () => {
    const ids = await pinIds();
    return ids.length === expected ? ids : false;
  }, 25000);
  assert(observed, `Expected ${expected} real catalog-backed pins; observed ${JSON.stringify(await pinIds())}`);
  return observed;
}

async function activeClusterFrame() {
  const iframe = page.locator('iframe[id^="cluster-frame"]:not(.hidden)').last();
  await iframe.waitFor({ timeout: 40000 });
  const frame = await iframe.elementHandle().then(handle => handle?.contentFrame());
  assert(frame, "Active cluster iframe was not accessible");
  await frame.getByTestId("cluster-sidebar").waitFor({ timeout: 60000 });
  return frame;
}

async function openCluster(id, name) {
  await page.locator(`#hotbarIcon-${id}`).click();
  const frame = await activeClusterFrame();
  const label = await frame.getByTestId("sidebar-cluster-dropdown").innerText();
  assert(label.includes(name), `Expected active context ${name}, got ${label}`);
  return frame;
}

function rectOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function inspectPin(id) {
  return page.locator(`#hotbarIcon-${id}`).evaluate(avatar => {
    const pin = avatar.closest('[data-testid="hotbar-pin"]');
    const bounds = element => {
      if (!element) return null;
      const { x, y, width, height, top, right, bottom, left } = element.getBoundingClientRect();
      return { x, y, width, height, top, right, bottom, left };
    };
    const badge = pin?.querySelector('[class*="kubernetesBadge"]');
    const production = pin?.querySelector('[class*="productionIndicator"]');
    const envTag = pin?.querySelector('[class*="envTag"]');
    const led = pin?.querySelector('[class*="led"]');
    const style = getComputedStyle(avatar);
    return {
      pin: bounds(pin),
      avatar: bounds(avatar),
      badge: bounds(badge),
      production: bounds(production),
      envTag: bounds(envTag),
      led: bounds(led),
      avatarClass: avatar.className,
      boxShadow: style.boxShadow,
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      badgeClass: badge?.className ?? null,
    };
  });
}

async function inspectResponsive(id, screenshotLabel) {
  const observations = [];
  for (const [width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(180);
    const geometry = await page.evaluate(pinId => {
      const avatar = document.querySelector(`#hotbarIcon-${CSS.escape(pinId)}`);
      const rail = document.querySelector('[data-testid="hotbar-rail"]');
      const bounds = element => {
        if (!element) return null;
        const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
        return { x, y, width, height, right, bottom };
      };
      const cells = [...document.querySelectorAll(".HotbarMenu .HotbarCell")];
      return {
        documentWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        rail: bounds(rail),
        pin: bounds(avatar),
        cellTops: cells.slice(0, 2).map(cell => cell.getBoundingClientRect().top),
      };
    }, id);
    const horizontalOverflow = geometry.documentWidth > geometry.clientWidth + 1;
    assert.equal(horizontalOverflow, false, `Horizontal overflow at ${width}x${height}: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.rail?.width, 72, `Hotbar rail width mismatch at ${width}x${height}`);
    assert.equal(geometry.pin?.width, 56, `Pin width mismatch at ${width}x${height}`);
    observations.push({ width, height, ...geometry, status: "PASS" });
    await page.screenshot({ path: path.join(SCREENSHOTS, `${screenshotLabel}-${width}x${height}.png`) });
  }
  return observations;
}

async function inspectScroll(count, viewport) {
  const list = page.locator(".HotbarItems");
  const metrics = await list.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  assert(metrics.scrollHeight > metrics.clientHeight, `${count} pins did not create a scrollable Hotbar: ${JSON.stringify(metrics)}`);
  await list.evaluate(element => { element.scrollTop = 0; });
  const before = await page.locator(".HotbarMenu .HotbarCell").first().boundingBox();
  const last = page.locator(".HotbarMenu .HotbarCell").nth(count - 1);
  await last.scrollIntoViewIfNeeded();
  const after = await last.boundingBox();
  const listRect = await list.boundingBox();
  assert(before && after && listRect);
  const lastVisible = after.y >= listRect.y && after.y + after.height <= listRect.y + listRect.height + 1;
  assert(lastVisible, `${count}th pin was not visible after scrolling`);
  const scrolled = await list.evaluate(element => element.scrollTop > 0);
  assert(scrolled, `${count}-pin Hotbar did not scroll`);
  return { count, viewport, ...metrics, scrolled, lastVisible, initialFirstY: before.y, lastY: after.y };
}

async function pointerDrag(from, to) {
  const draggables = page.locator(".HotbarMenu [data-rbd-draggable-id]");
  const cells = page.locator(".HotbarMenu .HotbarCell");
  const source = await draggables.nth(from).boundingBox();
  const target = await cells.nth(to).boundingBox();
  assert(source && target, "Drag endpoints did not have visible geometry");
  const before = await pinIds();
  const diagnostics = result.pointerDragDiagnostics = { from, to, before, source, target };
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 14, source.y + source.height / 2 + 10, { steps: 3 });
  diagnostics.afterActivation = await draggables.nth(from).evaluate(element => ({
    className: element.className,
    style: element.getAttribute("style"),
    dragging: element.getAttribute("data-rbd-dragging"),
  }));
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
  diagnostics.overTargets = await cells.evaluateAll(elements => elements.map(element => ({
    id: element.getAttribute("data-rbd-droppable-id"),
    className: element.className,
    rect: (() => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height }; })(),
  })));
  await page.screenshot({ path: path.join(SCREENSHOTS, `pointer-drag-${from}-to-${to}-before-drop.png`) });
  await page.mouse.up();
  const changed = await waitUntil(async () => JSON.stringify(await pinIds()) !== JSON.stringify(before), 8000);
  const after = await pinIds();
  diagnostics.after = after;
  assert(changed, `Pointer drag ${from} -> ${to} did not reorder pins`);
  assert.equal(new Set(after).size, after.length, "Pointer drag duplicated a favorite");
  return { from, to, before, after };
}

async function waitStoreOrder(expected) {
  const file = path.join(userDataPath, "lens-hotbar-store.json");
  const saved = await waitUntil(() => {
    const store = JSON.parse(readFileSync(file, "utf8"));
    const ids = store.hotbars?.[0]?.items?.filter(Boolean).map(item => item.entity.uid) ?? [];
    return JSON.stringify(ids) === JSON.stringify(expected) ? ids : false;
  }, 12000);
  assert(saved, "Reordered favorites were not persisted to the isolated Hotbar store");
  return saved;
}

async function startLocalApiServers() {
  const servers = [new DemoClusterServer(), new DemoClusterServer()];
  const ports = await Promise.all(servers.map(server => server.start(0)));
  assert.notEqual(ports[0], ports[1], "Independent fixture servers must use separate loopback endpoints");
  for (const port of ports) {
    const response = await fetch(`http://127.0.0.1:${port}/version`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).gitVersion, "v1.30.0-openlens-demo");
    const write = await fetch(`http://127.0.0.1:${port}/api/v1/namespaces/default/pods`, { method: "DELETE" });
    assert.equal(write.status, 403, "Local fixture API must reject resource mutations");
  }
  demoServers = servers;
  return ports.map((port, index) => ({ context: CONTEXTS[index].name, endpoint: `http://127.0.0.1:${port}`, readOnly: true }));
}

function proxyPids() {
  return execFileSync("/bin/ps", ["-axo", "pid=,command="], { encoding: "utf8" })
    .split("\n")
    .filter(line => /(?:^|\/)lens-k8s-proxy(?:\s|$)/.test(line.trim().replace(/^\d+\s+/, "")))
    .map(line => Number(line.trim().split(/\s+/, 1)[0]))
    .filter(Number.isInteger);
}

async function main() {
  assert(!existsSync(OUTPUT), `Refusing to overwrite existing QA output ${OUTPUT}`);
  mkdirSync(SCREENSHOTS, { recursive: true });
  assert(existsSync(APP_ASAR), `Candidate app.asar missing: ${APP_ASAR}`);
  result.appAsarSha256 = createHash("sha256").update(readFileSync(APP_ASAR)).digest("hex");
  const identity = classifyVisualPreflight({ appAsarSha256: result.appAsarSha256, expectedSha256: EXPECTED_SHA, arm64: true });
  assert.equal(identity.status, "READY", `Candidate hash mismatch: ${result.appAsarSha256}`);
  result.architecture = execFileSync("file", [APP_BINARY], { encoding: "utf8" }).trim();
  assert.match(result.architecture, /arm64/);
  const active = execFileSync("/bin/ps", ["-axo", "pid=,command="], { encoding: "utf8" })
    .split("\n").filter(line => line.trim().includes(APP_BINARY) && line.trim().startsWith(APP_BINARY));
  assert.equal(active.length, 0, `Candidate already has running processes: ${active.join(" | ")}`);
  baselineProxyPids = proxyPids();

  result.fixtureBackends = await startLocalApiServers();
  const profile = makeProfile(result.fixtureBackends);
  result.profile = "isolated temporary HOME/CICD/KUBECONFIG; two loopback DemoClusterServer instances; no user credentials";
  result.contexts = CONTEXTS.map((context, index) => ({ name: context.name, id: contextIds[index], endpoint: result.fixtureBackends[index].endpoint }));

  for (const count of FIXTURE_COUNTS) {
    seedFavorites(count);
    await launch(profile);
    const ids = await waitForPinCount(count);
    const caseResult = { count, ids, checks: {} };
    if (count <= 2) {
      caseResult.responsive = await inspectResponsive(contextIds[0], `pins-${count}`);
      const pin = await inspectPin(contextIds[0]);
      caseResult.pin = pin;
      assert(pin.pin && pin.avatar);
      assert(Math.abs((pin.avatar.x + pin.avatar.width / 2) - (pin.pin.x + pin.pin.width / 2)) < 1, "Pin avatar is not horizontally centered");
      assert(Math.abs((pin.avatar.y + pin.avatar.height / 2) - (pin.pin.y + pin.pin.height / 2)) < 1, "Pin avatar is not vertically centered");
      assert.equal(pin.avatar.width, 56);
      assert.equal(pin.avatar.height, 56);
      assert(pin.badge, "Kubernetes badge was not rendered by the candidate");
      assert(pin.badge.left >= pin.avatar.left && pin.badge.top >= pin.avatar.top);
      assert(pin.badge.right <= pin.avatar.right + 1 && pin.badge.bottom <= pin.avatar.bottom + 1, "Kubernetes badge overflowed the pin");
      assert(pin.badge.right > pin.avatar.right - 10 && pin.badge.bottom > pin.avatar.bottom - 10, "Kubernetes badge is not in the lower-right corner");
      caseResult.checks.pinCenterBadge = "PASS";
      if (count === 1) {
        assert(pin.production && pin.production.width >= 2 && pin.production.height > 0, "PROD indicator is missing or invisible");
        assert(pin.production.left >= pin.avatar.left && pin.production.right <= pin.avatar.right);
        caseResult.checks.productionIndicator = "PASS";
        await page.locator(`#hotbarIcon-${contextIds[0]}`).hover();
        await page.getByText(/\[PRODUCTION\]/).waitFor({ timeout: 5000 });
        caseResult.checks.productionTooltip = "PASS";
      }
    }

    if (count === 2) {
      const b = page.locator(`#hotbarIcon-${contextIds[1]}`);
      const beforeHover = await b.evaluate(element => getComputedStyle(element).boxShadow);
      await b.hover();
      const hoverShadow = await b.evaluate(element => getComputedStyle(element).boxShadow);
      assert.notEqual(hoverShadow, beforeHover, "Hover did not change the unselected pin state");
      assert.match(hoverShadow, /1px/);
      const aFrame = await openCluster(contextIds[0], CONTEXTS[0].name);
      const activeA = await page.locator(`#hotbarIcon-${contextIds[0]}`).evaluate(element => ({ className: element.className, boxShadow: getComputedStyle(element).boxShadow }));
      assert.match(activeA.boxShadow, /1\.5px/);
      assert.equal((activeA.boxShadow.match(/inset/g) ?? []).length, 1, "Selected pin has duplicate inset outlines");
      const bFrame = await openCluster(contextIds[1], CONTEXTS[1].name);
      const activeB = await page.locator(`#hotbarIcon-${contextIds[1]}`).evaluate(element => getComputedStyle(element).boxShadow);
      assert.match(activeB, /1\.5px/);
      await page.locator(`#hotbarIcon-${contextIds[1]}`).click({ button: "right" });
      await page.getByText("Remove from Hotbar").waitFor({ timeout: 5000 });
      await page.keyboard.press("Escape");
      caseResult.checks.hoverSelectionMenuContext = "PASS";
      caseResult.activeContexts = [await aFrame.getByTestId("sidebar-cluster-dropdown").innerText(), await bFrame.getByTestId("sidebar-cluster-dropdown").innerText()];
    }

    if (count === 5) {
      const pointer = await pointerDrag(0, 3);
      caseResult.drag = { pointer };
      const saved = await waitStoreOrder(await pinIds());
      caseResult.persistedOrder = saved;
      caseResult.checks.dragAndPersistence = "PASS";
      caseResult.navigation = [];
      const frame = await openCluster(contextIds[0], CONTEXTS[0].name);
      for (const route of ["nodes", "pods", "deployments"]) {
        const parent = route === "nodes" ? "cluster" : "workloads";
        if (await frame.getByTestId(`sidebar-item-link-for-${route}`).count() === 0) await frame.getByTestId(`sidebar-item-link-for-${parent}`).click();
        const navigationItem = frame.getByTestId(`sidebar-item-link-for-${route}`);
        await navigationItem.focus();
        await page.keyboard.press("Enter");
        const expectedPath = `/${route}`;
        const arrived = await waitUntil(() => frame.evaluate(pathname => location.pathname === pathname, expectedPath), 12000);
        assert(arrived, `Keyboard navigation to ${expectedPath} did not complete`);
        caseResult.navigation.push({ route, path: expectedPath, input: "Enter", status: "PASS" });
      }
      await closeApp();
      await launch(profile);
      const afterRestart = await waitForPinCount(5);
      assert.deepEqual(afterRestart, saved, "Favorite order was not restored after Electron restart");
      caseResult.restartOrder = afterRestart;
      caseResult.checks.persistenceAfterRestart = "PASS";
      await page.screenshot({ path: path.join(SCREENSHOTS, "pins-5-after-restart.png") });
    }

    if (count === 25 || count === 35) {
      caseResult.scroll = [];
      for (const [width, height] of VIEWPORTS) {
        await page.setViewportSize({ width, height });
        caseResult.scroll.push(await inspectScroll(count, `${width}x${height}`));
      }
      caseResult.checks.scroll = "PASS";
      await page.screenshot({ path: path.join(SCREENSHOTS, `pins-${count}-scrolled.png`) });
    }

    caseResult.status = "PASS";
    result.cases.push(caseResult);
    await page.screenshot({ path: path.join(SCREENSHOTS, `pins-${count}-end.png`) });
    await closeApp();
  }

  assert.equal(result.pageErrors.length, 0, `Renderer errors: ${JSON.stringify(result.pageErrors)}`);
  result.status = "PASS";
}

main().catch(error => {
  result.error = String(error.stack || error.message || error)
    .replaceAll(ROOT, "<workspace>")
    .replaceAll(qaRoot || "<qa-profile>", "<qa-profile>")
    .slice(0, 3000);
  result.status = "FAIL";
}).finally(async () => {
  try { await closeApp(); } catch (error) { result.closeError = String(error.message).slice(0, 500); result.status = "FAIL"; }
  for (const server of demoServers) {
    try { await server.stop(); } catch (error) { result.serverCloseError = String(error.message).slice(0, 500); result.status = "FAIL"; }
  }
  const remainingProxyPids = proxyPids().filter(pid => !baselineProxyPids.includes(pid));
  result.proxyProcessesAfterClose = { baselinePids: baselineProxyPids, newPidsRemaining: remainingProxyPids };
  if (remainingProxyPids.length) result.status = "FAIL";
  try { if (qaRoot) rmSync(qaRoot, { recursive: true, force: true }); } catch (error) { result.profileCleanupError = String(error.message).slice(0, 500); result.status = "FAIL"; }
  result.output = path.relative(ROOT, OUTPUT);
  result.finishedAt = new Date().toISOString();
  writeJson(path.join(OUTPUT, "result.json"), result);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "PASS" ? 0 : 1;
});
