/**
 * R4-03 triage: reproduce the renderer "illegal access" console message on teardown.
 * Usage: [REPRO_ALIAS=<catalog label>] node repro-r4-03-illegal-access.cjs <path/to/OpenLens DevOps.app> <activate|idle> [tabs]
 * Pre-R4 builds list the cluster by context name, so run them with REPRO_ALIAS=repro-dev.
 * Uses only synthetic loopback fixtures and an isolated profile.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createLocalApiFixture, createProfile, appEnvironment, closeApp,
  openCatalogFromWelcome, openFromCatalog,
} = require("./verify-r4-03-persistence.cjs");
const { _electron } = require(path.resolve(__dirname, "../../../node_modules/playwright"));

const [bundle, mode = "activate", tabs] = process.argv.slice(2);
const workspaceTabs = tabs === "tabs";

async function run() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-r4-03-illegal-"));
  const fixture = { name: "repro-dev", alias: process.env.REPRO_ALIAS || "Synthetic REPRO DEV", environment: "development", color: "#10B981" };
  const messages = [];

  fixture.fixture = await createLocalApiFixture(fixture);
  fixture.endpoint = fixture.fixture.endpoint;

  try {
    const profile = createProfile(temp, "repro", [fixture]);
    const app = await _electron.launch({
      executablePath: path.join(bundle, "Contents/MacOS/OpenLens DevOps"),
      args: ["--integration-testing", ...(workspaceTabs ? ["--enable-workspace-tabs"] : []), `--user-data-dir=${profile.userData}`],
      env: appEnvironment(profile, workspaceTabs),
      timeout: 90_000,
    });
    let page;

    for (let i = 0; i < 360 && !page; i++) {
      page = app.windows().find(candidate => candidate.url().startsWith("https://lens.app"));
      if (!page) await new Promise(resolve => setTimeout(resolve, 250));
    }
    page.on("console", message => messages.push({
      type: message.type(), text: message.text(), location: message.location(),
      phase: messages.closing ? "teardown" : "runtime",
    }));
    page.on("pageerror", error => messages.push({ type: "pageerror", text: error.message, stack: error.stack }));
    await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1500);

    const step = name => console.error(`[repro step] ${name} ${new Date().toISOString()}`);

    if (mode === "activate") {
      step("open-catalog");
      await openCatalogFromWelcome(page, [fixture]);
      step("open-cluster");
      await openFromCatalog(page, fixture, profile.clusters[0].id);
      await page.waitForTimeout(4000);
    }

    messages.closing = true;
    step("quit");
    const exit = await Promise.race([
      closeApp(app),
      new Promise(resolve => setTimeout(() => resolve("QUIT_TIMEOUT_60S"), 60_000)),
    ]);

    if (exit === "QUIT_TIMEOUT_60S") app.process().kill("SIGKILL");
    const hits = messages.filter(message => /illegal access/i.test(message.text));

    console.log(JSON.stringify({
      bundle, mode, workspaceTabs, exit,
      requestsToFixture: fixture.fixture.requests.length,
      illegalAccess: hits,
      teardownTail: messages.filter(message => message.phase === "teardown").slice(-6),
      pageErrors: messages.filter(message => message.type === "pageerror"),
    }, null, 2));
  } finally {
    await fixture.fixture.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
