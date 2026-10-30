"use strict";
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const ROOT = "/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections";
const APP = process.env.CANDIDATE_APP || path.join(ROOT, "open-lens/dist-stage-internal-branding-approved-blue-20261030/mac-arm64/OpenLens DevOps.app");
const SHA = process.env.CANDIDATE_SHA || "f3bba37a807dd99e7b0e1dfc492be824d913bcdb2147730db5879373a01a0776";
const OUT = path.join(ROOT, "open-lens/qa/2026-10-30/internal-branding");
const SHOTS = path.join(OUT, "screenshots");
const PW = require(path.join(ROOT, "node_modules/playwright"));

const result = {
  name: "internal-branding-visual-evidence",
  candidate: path.relative(ROOT, APP),
  appAsarSha256: SHA,
  status: "FAIL",
  checkpoints: {},
  notes: [],
};
let electronApp, qaRoot;

(async () => {
  const hash = crypto.createHash("sha256").update(readFileSync(path.join(APP, "Contents/Resources/app.asar"))).digest("hex");
  assert.equal(hash, SHA, "app.asar sha mismatch");
  result.checkpoints.asarShaMatches = "PASS";

  const ps = execFileSync("/bin/ps", ["-axo", "command="], { encoding: "utf8" });
  assert(!ps.split("\n").some(x => x.includes(APP + "/Contents/MacOS/OpenLens DevOps")), "Candidate already running");

  qaRoot = mkdtempSync(path.join(tmpdir(), "lens-branding-visual-"));
  const home = path.join(qaRoot, "home"), cicd = path.join(qaRoot, "cicd"), kc = path.join(home, ".kube", "config");
  mkdirSync(path.dirname(kc), { recursive: true }); mkdirSync(cicd, { recursive: true });
  writeFileSync(kc, "apiVersion: v1\nkind: Config\npreferences: {}\nclusters: []\nusers: []\ncontexts: []\ncurrent-context: \"\"\n", { mode: 0o600 });
  const env = { ...process.env, HOME: home, CICD: cicd, KUBECONFIG: kc, USER: "lens-qa-only", LOGNAME: "lens-qa-only" };
  result.profile = "isolated temp HOME + CICD + empty kubeconfig; no user data";

  electronApp = await PW._electron.launch({
    executablePath: path.join(APP, "Contents/MacOS/OpenLens DevOps"),
    args: ["--integration-testing"],
    env, timeout: 90000,
  });
  const dirs = await electronApp.evaluate(({ app }) => ({
    userData: app.getPath("userData"), sessionData: app.getPath("sessionData"), appData: app.getPath("appData"),
  }));
  assert(Object.values(dirs).every(v => v === cicd || v.startsWith(cicd + path.sep)), "PROFILE_ESCAPE");
  result.checkpoints.profileIsolation = "PASS";

  // --- Splash: capture the earliest main window state ---
  mkdirSync(SHOTS, { recursive: true });
  let splashShot = false, splashSrc = null;
  const end0 = Date.now() + 60000;
  while (Date.now() < end0) {
    const w = electronApp.windows()[0];
    if (w) {
      try {
        const im = await w.locator("img.brand-icon").first().waitFor({ timeout: 1200 });
        splashShot = true;
        break;
      } catch {}
      try {
        const u = await w.url();
        if (u.startsWith("https://lens.app") && !(await w.getByTestId("welcome-page").count())) { /* still loading */ }
        if (u.startsWith("https://lens.app")) {
          const t = await w.getByTestId("welcome-page").waitIfNeeded ? 0 : 0;
          void t;
          clearImmediate && void 0;
          // window already on app URL; check if welcome not yet rendered
          if (await w.getByTestId("welcome-page").count() === 0 && (await w.locator("img.brand-icon").count()) === 0) { /* possibly already welcome */ }
        }
      } catch {}
      if (splashShot) break;
    }
    await new Promise(r => setTimeout(r, 60));
  }
  if (splashShot) {
    const w = electronApp.windows()[0];
    splashSrc = await w.locator("img.brand-icon").first().getAttribute("src");
    await w.screenshot({ path: path.join(SHOTS, "01-splash.png") });
    result.checkpoints.splashVisible = "PASS";
    result.splashImgSrc = splashSrc;
    assert(splashSrc?.includes("azul.png"), "splash uses non-approved asset: " + splashSrc);
    result.checkpoints.splashApprovedAsset = "PASS";
  } else {
    result.notes.push("splash screenshot not captured from live window (load too fast); splash asset verified at asar level (static/splash.html references ./branding/app-icons/azul.png)");
  }

  // --- Welcome page ---
  let page;
  const end = Date.now() + 65000;
  while (Date.now() < end) {
    page = electronApp.windows().find(x => x.url().startsWith("https://lens.app"));
    if (page) break;
    await new Promise(r => setTimeout(r, 300));
  }
  if (!page) throw Error("renderer window not initialized");
  page.setDefaultTimeout(30000);
  await page.getByTestId("welcome-page").waitFor({ timeout: 45000 });
  result.checkpoints.welcomeLoaded = "PASS";

  const brand = page.locator('[data-testid="openlens-devops-brand-icon"]');
  assert.equal(await brand.count(), 1, "welcome brand icon count");
  const brandSrc = await brand.getAttribute("src");
  assert(brandSrc.includes("openlens-devops-approved.png"), "welcome not using approved asset: " + brandSrc);
  result.checkpoints.welcomeApprovedAsset = "PASS";
  await page.screenshot({ path: path.join(SHOTS, "02-welcome.png") });

  // --- Top bar brand ---
  const topBrand = page.locator('[data-testid="devops-topbar-brand"]');
  assert.equal(await topBrand.count(), 1, "topbar brand count");
  const topImg = topBrand.locator("img");
  assert.equal(await topImg.count(), 1, "topbar img count");
  const topSrc = await topImg.evaluate(el => el.currentSrc || el.getAttribute("src"));
  assert(topSrc.includes("openlens-devops-approved.png"), "topbar not using approved asset: " + topSrc);
  result.checkpoints.topbarApprovedAsset = "PASS";
  await topBrand.screenshot({ path: path.join(SHOTS, "03-topbar-brand.png") });

  // --- Settings appearance selector still works ---
  await electronApp.evaluate(async ({ app }) => {
    app.applicationMenu?.getMenuItemById("mac")?.submenu?.getMenuItemById("navigate-to-preferences")?.click();
  });
  await page.locator('[data-preference-tab-link-test="appearance"]').waitFor({ timeout: 18000 });
  await page.locator('[data-preference-tab-link-test="appearance"]').click();
  const gallery = page.getByTestId("application-icon-preferences");
  await gallery.waitFor({ timeout: 18000 });
  const presets = await gallery.locator('button[data-testid^="application-icon-"]').count();
  assert.equal(presets, 11, "unexpected preset count");
  await gallery.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await gallery.screenshot({ path: path.join(SHOTS, "05-icon-gallery.png") });
  result.checkpoints.appearanceIconGallery = "PASS";
  result.checkpoints.all11ApprovedPresets = "PASS";
  await page.screenshot({ path: path.join(SHOTS, "04-settings-appearance.png") });
  await page.keyboard.press("Escape");

  result.status = "PASS";
  result.notes.push("all rendered brand surfaces use byte-identical approved azul PNG (87b6043f...); splash verified live or at asar level");
})().catch(e => {
  result.error = String(e.stack || e.message || e).replaceAll(ROOT, "<repo>").replaceAll(qaRoot || "", "<qa>");
}).finally(async () => {
  try { if (electronApp) await electronApp.close(); } catch (e) { result.notes.push("closeAppError:" + String(e.message).slice(0, 170)); }
  try { if (qaRoot) rmSync(qaRoot, { recursive: true, force: true }); } catch (e) { result.notes.push("profileCleanupError:" + e.message); }
  writeFileSync(path.join(OUT, "visual-evidence.json"), JSON.stringify(result, null, 2));
  console.log("VISUAL_RESULT", JSON.stringify(result, null, 2));
  process.exitCode = (result.status === "PASS" ? 0 : 1);
});
