/** Packaged-app R4-03 multiworkspace and owned-process certification. */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  createLocalApiFixture, createProfile, launchRestorationApp, closeApp,
  sessionPath, clusterStorePath, tabOrder, openCatalogFromWelcome,
  openFromCatalog, writeProfileFile, syntheticKubeConfig, assert,
} = require("./verify-r4-03-persistence.cjs");

const root = path.resolve(__dirname, "../../..");
const screenshots = path.join(root, "docs/revival/screenshots");
const prefix = `r4-03-final-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const fixtures = [
  { name: "prod-a", alias: "Synthetic PROD A", environment: "production", color: "#EF4444" },
  { name: "prod-b", alias: "Synthetic PROD B", environment: "production", color: "#DC2626" },
  { name: "stg-a", alias: "Synthetic STG A", environment: "staging", color: "#F59E0B" },
  { name: "stg-b", alias: "Synthetic STG B", environment: "staging", color: "#D97706" },
  { name: "dev-a", alias: "Synthetic DEV A", environment: "development", color: "#10B981" },
];

function processes() {
  return execFileSync("ps", ["-axo", "pid=,ppid=,tty=,command="], { encoding: "utf8" })
    .split("\n").map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/))
    .filter(Boolean).map(match => ({ pid: Number(match[1]), ppid: Number(match[2]), tty: match[3], command: match[4] }));
}

function descendants(pid) {
  const all = processes();
  const owned = new Set([pid]);
  let changed;

  do {
    changed = false;
    for (const process of all) {
      if (owned.has(process.ppid) && !owned.has(process.pid)) {
        owned.add(process.pid);
        changed = true;
      }
    }
  } while (changed);

  return all.filter(process => owned.has(process.pid));
}

// Open PTY master/slave descriptors held by the owned process tree.
function ptyDescriptors(pids) {
  try {
    return execFileSync("lsof", ["-nP", "-p", pids.join(",")], { encoding: "utf8" })
      .split("\n").filter(line => /\/dev\/(ptmx|ttys\d+|pty)/.test(line));
  } catch (error) {
    return (error.stdout || "").split("\n").filter(line => /\/dev\/(ptmx|ttys\d+|pty)/.test(line));
  }
}

// A = Electron/helpers and the transient tty-less login-shell env sync; B = tool processes.
function classify(process) {
  if (process.tty !== "??" || /kubectl|lens-k8s-proxy|port-forward|helm/.test(process.command)) return "B";
  return "A";
}

// Samples the owned tree for a window so transient spawns during restore are not missed.
async function sampleOwned(app, ms) {
  const seen = new Map();
  const pty = new Set();

  for (const end = Date.now() + ms; Date.now() < end;) {
    const sample = descendants(app.process().pid);

    for (const process of sample) seen.set(`${process.pid}:${process.command}`, { ...process, class: classify(process) });
    for (const line of ptyDescriptors(sample.map(process => process.pid))) pty.add(line);
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  const observed = [...seen.values()];

  return { observed, tools: observed.filter(process => process.class === "B"), pty: [...pty] };
}

function assertNoTools(sample, label, allow = /$^/) {
  const tools = sample.tools.filter(process => !allow.test(process.command));

  assert(tools.length === 0, `${label}: unexpected owned tool process: ${JSON.stringify(tools)}`);
  assert(sample.pty.length === 0, `${label}: owned PTY descriptors: ${JSON.stringify(sample.pty)}`);
}

function requestCounts() {
  return Object.fromEntries(fixtures.map(fixture => [fixture.name, fixture.fixture.requests.length]));
}

async function catalog(page) {
  await page.getByText("view_list", { exact: true }).first().click({ timeout: 10_000 });
  await page.waitForURL(/\/catalog(?:\/entity\.k8slens\.dev\/KubernetesCluster)?(?:[?#].*)?$/i, { timeout: 20_000 });
}

async function openTwo(page, profile, indexes) {
  for (const [position, index] of indexes.entries()) {
    if (position) await catalog(page);
    await openFromCatalog(page, fixtures[index], profile.clusters[index].id);
  }
}

async function checkWorkspace(page, profile, id, indexes, focus) {
  await page.getByTestId("workspace-selector").selectOption(id);
  const expected = indexes.map(index => profile.clusters[index].id);
  const actual = await tabOrder(page);

  assert(JSON.stringify(actual) === JSON.stringify(expected), `${id}: order ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  assert(await page.getByTestId(`workspace-tab-${profile.clusters[focus].id}`).getAttribute("aria-selected") === "true", `${id}: focus mismatch`);
  for (const clusterId of expected) {
    assert(await page.getByTestId(`workspace-tab-${clusterId}`).getAttribute("data-restored-inactive") === "true", `${id}: tab was activated without action`);
    assert(await page.locator(`#cluster-frame-${clusterId}`).count() === 0, `${id}: cluster iframe was started`);
  }
  return actual;
}

async function shot(page, evidence, name) {
  evidence.screenshots[name] = path.join(screenshots, `${prefix}-${name}.png`);
  await page.screenshot({ path: evidence.screenshots[name] });
}

async function run() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r4-03-final-"));
  const started = [];
  const evidence = { app: process.env.OPENLENS_R4_03_OUTPUT, stages: {}, screenshots: {} };
  let app;

  try {
    for (const fixture of fixtures) {
      fixture.fixture = await createLocalApiFixture(fixture);
      fixture.endpoint = fixture.fixture.endpoint;
      started.push(fixture.fixture);
    }

    const profile = createProfile(temp, "multiworkspace", fixtures);
    let launched = await launchRestorationApp(profile, "multiworkspace-create");
    app = launched.app;
    let page = launched.page;

    // Workspace A (default): PROD A/B, reordered, focus PROD A.
    await openCatalogFromWelcome(page, fixtures);
    await openTwo(page, profile, [0, 1]);
    await page.getByTestId(`workspace-tab-${profile.clusters[0].id}`).dragTo(page.getByTestId(`workspace-tab-${profile.clusters[1].id}`));
    await page.getByTestId(`workspace-tab-${profile.clusters[0].id}`).click();
    assert((await tabOrder(page))[0] === profile.clusters[1].id, "PROD order did not change");
    // Workspace B: STG A/B, focus STG A (history STG A -> STG B -> STG A).
    await page.getByTestId("workspace-create").click();
    assert(await page.getByTestId("workspace-selector").inputValue() === "workspace-2", "STG workspace not created");
    await openTwo(page, profile, [2, 3]);
    await page.getByTestId(`workspace-tab-${profile.clusters[2].id}`).click();
    // Workspace C: DEV A.
    await page.getByTestId("workspace-create").click();
    assert(await page.getByTestId("workspace-selector").inputValue() === "workspace-3", "DEV workspace not created");
    await openFromCatalog(page, fixtures[4], profile.clusters[4].id);
    await page.waitForTimeout(700);

    evidence.stages.snapshotBeforeClose = JSON.parse(fs.readFileSync(sessionPath(profile), "utf8"));
    assert(evidence.stages.snapshotBeforeClose.workspaces.length === 3, "Three workspaces must persist before close");
    await shot(page, evidence, "01-before-close");
    evidence.stages.processesBeforeClose = descendants(app.process().pid);
    const firstRunPids = evidence.stages.processesBeforeClose.map(process => process.pid);
    evidence.stages.firstClose = await closeApp(app);
    app = undefined;
    for (let attempt = 0; attempt < 10; attempt++) {
      evidence.stages.firstRunSurvivors = processes().filter(process => firstRunPids.includes(process.pid));
      if (!evidence.stages.firstRunSurvivors.length) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert(evidence.stages.firstRunSurvivors.length === 0, "Owned processes survived full application close");

    // Restart: restore all workspaces inactive, no requests, no tools/PTYs.
    for (const fixture of fixtures) fixture.fixture.requests.length = 0;
    launched = await launchRestorationApp(profile, "multiworkspace-restart");
    app = launched.app;
    page = launched.page;
    evidence.stages.processesAtRestore = await sampleOwned(app, 3000);
    assertNoTools(evidence.stages.processesAtRestore, "restore");
    evidence.stages.restored = {
      dev: await checkWorkspace(page, profile, "workspace-3", [4], 4),
      prod: await checkWorkspace(page, profile, "default", [1, 0], 0),
      stg: await checkWorkspace(page, profile, "workspace-2", [2, 3], 2),
    };
    evidence.stages.requestsAfterRestoreAndSwitch = requestCounts();
    assert(fixtures.every(fixture => fixture.fixture.requests.length === 0), "Restore/switch made synthetic Kubernetes requests");
    evidence.stages.processesAfterSwitch = await sampleOwned(app, 1500);
    assertNoTools(evidence.stages.processesAfterSwitch, "workspace switch");
    await shot(page, evidence, "02-restored-inactive");

    // Explicit Back/Forward in workspace B only touches STG identities.
    await page.getByTestId("workspace-nav-back").click();
    assert(await page.getByTestId(`workspace-tab-${profile.clusters[3].id}`).getAttribute("aria-selected") === "true", "STG history back crossed workspace");
    await page.getByTestId("workspace-nav-forward").click();
    assert(await page.getByTestId(`workspace-tab-${profile.clusters[2].id}`).getAttribute("aria-selected") === "true", "STG history forward crossed workspace");
    await page.waitForTimeout(3000);
    evidence.stages.requestsAfterExplicitHistory = requestCounts();
    assert(["prod-a", "prod-b", "dev-a"].every(name => evidence.stages.requestsAfterExplicitHistory[name] === 0), "Explicit STG navigation reached another cluster");
    assert(evidence.stages.requestsAfterExplicitHistory["stg-a"] > 0, "Explicit activation did not reach the chosen STG cluster");
    // The auth proxy is the expected effect of explicit activation; shells/PTYs/kubectl are not.
    evidence.stages.processesAfterExplicitActivation = await sampleOwned(app, 1500);
    assertNoTools(evidence.stages.processesAfterExplicitActivation, "explicit activation", /lens-k8s-proxy/);
    await shot(page, evidence, "03-explicit-activation-stg");
    evidence.stages.secondClose = await closeApp(app);
    app = undefined;
    evidence.stages.snapshotAfterSecondClose = JSON.parse(fs.readFileSync(sessionPath(profile), "utf8"));

    // Remove STG B and add a different identity with the same visible name.
    const removed = profile.clusters[3].id;
    const replacementContext = "stg-b-replacement";
    const replacementId = crypto.createHash("md5").update(`${profile.kubeConfigPath}:${replacementContext}`).digest("hex");
    const clusters = JSON.parse(fs.readFileSync(clusterStorePath(profile), "utf8"));

    clusters.clusters = clusters.clusters.filter(cluster => cluster.id !== removed);
    clusters.clusters.push({
      id: replacementId, kubeConfigPath: profile.kubeConfigPath, contextName: replacementContext,
      preferences: { clusterAlias: fixtures[3].alias, clusterEnvironment: "staging", clusterColor: fixtures[3].color },
    });
    writeProfileFile(clusterStorePath(profile), JSON.stringify(clusters));
    writeProfileFile(profile.kubeConfigPath, syntheticKubeConfig([
      ...fixtures.filter(fixture => fixture.name !== "stg-b"),
      { name: replacementContext, endpoint: fixtures[3].endpoint },
    ]));
    const syncedKubeConfigDir = path.join(profile.userData, "kubeconfigs");

    if (fs.existsSync(syncedKubeConfigDir)) fs.rmSync(syncedKubeConfigDir, { recursive: true, force: true });
    for (const fixture of fixtures) fixture.fixture.requests.length = 0;
    const refreshed = await launchRestorationApp(profile, "multiworkspace-missing");
    app = refreshed.app;
    page = refreshed.page;
    evidence.stages.processesAfterRemoval = await sampleOwned(app, 2000);
    assertNoTools(evidence.stages.processesAfterRemoval, "removed-cluster restart");
    evidence.stages.snapshotCleaned = JSON.parse(fs.readFileSync(sessionPath(profile), "utf8"));
    const cleaned = JSON.stringify(evidence.stages.snapshotCleaned);

    assert(!cleaned.includes(removed), "Removed cluster remained on disk");
    assert(!cleaned.includes(replacementId), "Homonymous replacement was written into the snapshot");
    assert(evidence.stages.snapshotCleaned.workspaces.length === 3, "A workspace was lost");
    assert(JSON.stringify(evidence.stages.snapshotCleaned.layouts.default) === JSON.stringify(evidence.stages.snapshotAfterSecondClose.layouts.default), "PROD layout changed");
    assert(JSON.stringify(evidence.stages.snapshotCleaned.layouts["workspace-3"]) === JSON.stringify(evidence.stages.snapshotAfterSecondClose.layouts["workspace-3"]), "DEV layout changed");
    assert(JSON.stringify(evidence.stages.snapshotCleaned.history.default) === JSON.stringify(evidence.stages.snapshotAfterSecondClose.history.default), "PROD history changed");
    assert(evidence.stages.snapshotCleaned.layouts["workspace-2"].tabs.map(tab => tab.clusterId).join() === profile.clusters[2].id, "STG layout was not selectively cleaned");
    assert(evidence.stages.snapshotCleaned.history["workspace-2"].entries.every(entry => entry.clusterId === profile.clusters[2].id), "Stale STG history remained");
    evidence.stages.cleanedUi = {
      prod: await checkWorkspace(page, profile, "default", [1, 0], 0),
      dev: await checkWorkspace(page, profile, "workspace-3", [4], 4),
      stg: await checkWorkspace(page, profile, "workspace-2", [2], 2),
    };
    assert(await page.getByTestId(`workspace-tab-${replacementId}`).count() === 0, "Tab was redirected to a homonymous cluster");
    evidence.stages.requestsAfterRemoval = requestCounts();
    assert(fixtures.every(fixture => fixture.fixture.requests.length === 0), "Removed-cluster restore made synthetic Kubernetes requests");
    await shot(page, evidence, "04-cleaned-missing-cluster");
    evidence.stages.thirdClose = await closeApp(app);
    app = undefined;
    evidence.result = "PASS";
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    if (app) await closeApp(app);
    await Promise.all(started.map(fixture => fixture.close()));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
