/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "../../..");
const { _electron } = require(path.join(projectRoot, "node_modules/playwright"));
const stage = path.join(projectRoot, "open-lens/dist-r6-02-stage");
const appDir = path.join(stage, "mac-arm64/OpenLens DevOps.app");
const executable = path.join(appDir, "Contents/MacOS/OpenLens DevOps");
const report = path.join(projectRoot, "docs/revival/R6_02_VERIFICATION.json");
const evidenceDir = path.join(projectRoot, "docs/revival/evidence/r6-02");
const hash = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const sleep = ms => new Promise(r => setTimeout(r, ms));

function prepareProfile(tempRoot) {
  const home = path.join(tempRoot, "home");
  const appData = path.join(home, "Library/Application Support/OpenLens");
  const storage = path.join(appData, "lens-local-storage");
  fs.mkdirSync(storage, { recursive: true });
  fs.writeFileSync(path.join(storage, "lens-cluster-store.json"), JSON.stringify({
    clusters: [],
    __internal__: { migrations: { version: "6.5.0" }},
  }), { mode: 0o600 });
  fs.writeFileSync(path.join(storage, "lens-user-store.json"), JSON.stringify({
    preferences: { colorTheme: "Dark", tableDensity: "compact", environmentColors: {} },
    __internal__: { migrations: { version: "6.5.0" }},
  }), { mode: 0o600 });
  return { home, appData };
}

async function waitForRenderer(app) {
  for (let i=0; i<360; i++) {
    const page = app.windows().find(w => w.url().startsWith("https://lens.app"));
    if (page) { await page.locator("body").waitFor({state:"visible",timeout:30000}); return page; }
    await sleep(250);
  }
  throw new Error("Timeout waiting for packaged renderer");
}
async function navigate(app, route) {
  await app.evaluate(({BrowserWindow}, url) => {
    const win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed());
    if (!win) throw new Error("No Electron BrowserWindow");
    win.webContents.send("renderer:navigate", url);
  }, route);
}
async function run() {
  assert(fs.existsSync(executable), "Packaged ARM64 app not found: " + executable);
  fs.mkdirSync(evidenceDir, { recursive:true });
  const checks={};
  const nativeIcns=path.join(appDir,"Contents/Resources/icon.icns");
  assert(fs.existsSync(nativeIcns), "macOS native icon missing");
  const sourceIcns=path.join(projectRoot,"open-lens/build/icon.icns");
  assert.strictEqual(hash(nativeIcns),hash(sourceIcns),"Packaged Dock/Finder icon differs from branded source");
  const bundleIcon=execFileSync("/usr/libexec/PlistBuddy",
    ["-c","Print :CFBundleIconFile",path.join(appDir,"Contents/Info.plist")],{encoding:"utf8"}).trim();
  assert(bundleIcon.includes("icon"), "Bundle icon reference incorrect: "+bundleIcon);
  checks.nativeFinderDockIcon=true;

  const trayDir=path.join(appDir,"Contents/Resources/app.asar");
  const traySource=path.join(projectRoot,"open-lens/static/build/tray");
  for (const suffix of ["trayIconTemplate.png","trayIconTemplate@2x.png",
                         "trayIconUpdateAvailableTemplate.png","trayIconCheckingForUpdatesTemplate.png"]) {
    assert(fs.statSync(path.join(traySource,suffix)).size>100,"Missing regenerated tray source "+suffix);
  }
  assert(fs.existsSync(trayDir), "Packaged app.asar missing");
  // Check the actual packaged ASAR, not just the intermediate source assets.
  const asar=require(path.join(projectRoot,"node_modules/asar"));
  const packagedFiles=new Set(asar.listPackage(trayDir).map(x=>x.replace(/^\//,"")));
  for(const suffix of ["trayIconTemplate.png","trayIconTemplate@2x.png",
    "trayIconUpdateAvailableTemplate.png","trayIconCheckingForUpdatesTemplate.png"]) {
    assert(packagedFiles.has("static/build/tray/"+suffix), "Missing packaged tray asset: "+suffix);
  }
  const packagedSplash=asar.extractFile(trayDir,"static/splash.html").toString("utf8");
  assert(packagedSplash.includes("OpenLens DevOps") &&
         packagedSplash.includes("branding/openlens-devops-symbol.svg"),
         "Splash branding missing in packaged app");
  assert(packagedFiles.has("static/branding/openlens-devops-symbol.svg"),"Packaged splash logo missing");
  const packageData=JSON.parse(asar.extractFile(trayDir,"package.json").toString("utf8"));
  assert.strictEqual(packageData.author,"Gustavo Marcon","Packaged fork author metadata incorrect");
  assert(packageData.copyright.includes("OpenLens Maintainers"),"Original authorship lost");
  checks.menuBarTemplateAssets=true;
  checks.brandedSplashAndForkCredits=true;

  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),"openlens-r6-02-"));
  const profile=prepareProfile(tempRoot);
  let app;
  try {
    app=await _electron.launch({
      executablePath:executable,
      env:{...process.env,HOME:profile.home,CICD:profile.appData,OPENLENS_WORKSPACE_TABS:"true",
        HTTP_PROXY:"",HTTPS_PROXY:"",ALL_PROXY:"",http_proxy:"",https_proxy:"",all_proxy:"",
        NO_PROXY:"127.0.0.1,localhost",no_proxy:"127.0.0.1,localhost"},
      args:["--no-sandbox","--disable-gpu"],
    });
    const page=await waitForRenderer(app);
    await page.setViewportSize({width:1440,height:900});
    await page.locator('[data-testid="openlens-devops-brand-icon"]').waitFor({state:"visible",timeout:20000});
    const initial=await page.evaluate(()=>({
      icon:!!document.querySelector('[data-testid="openlens-devops-brand-icon"] svg'),
      header:!!document.querySelector('[data-testid="devops-topbar-brand"] svg'),
      heading:[...document.querySelectorAll("h2")].some(el=>el.textContent?.includes("OpenLens DevOps")),
      color:document.documentElement.style.getPropertyValue("--mainBackground").trim(),
    }));
    assert(initial.icon && initial.header && initial.heading,"Fork branding missing on classic Welcome");
    checks.brandedWelcomeAndHeader=true;
    await page.screenshot({path:path.join(evidenceDir,"01-branded-welcome-classic-dark.png")});

    // The new theme is opt-in. Select it via actual Preferences rather than assuming
    // user-profile store migrations have already finished on a freshly created profile.
    await navigate(app,"/preferences/app");
    await page.keyboard.press("Meta+,");
    await page.locator(".Preferences").waitFor({state:"visible",timeout:15000});
    await page.locator('[data-preference-tab-link-test="app"]').click();
    await page.locator("#theme-input").click();
    await page.locator("text=Midnight Graphite").click();
    await sleep(500);
    await navigate(app,"/welcome");
    await page.locator('[data-testid="openlens-devops-brand-icon"]').waitFor({state:"visible",timeout:15000});
    const branding=await page.evaluate(() => ({
      icon:!!document.querySelector('[data-testid="openlens-devops-brand-icon"] svg'),
      header:!!document.querySelector('[data-testid="devops-topbar-brand"] svg'),
      heading:[...document.querySelectorAll("h2")].some(el=>el.textContent?.includes("OpenLens DevOps")),
      color:document.documentElement.style.getPropertyValue("--mainBackground").trim(),
      prod:document.documentElement.style.getPropertyValue("--envProduction").trim(),
      family:getComputedStyle(document.body).fontFamily,
      theme:document.body.classList.contains("theme-midnight-graphite"),
    }));
    assert(branding.icon && branding.heading && branding.header,"Branded Midnight Welcome absent");
    assert.strictEqual(branding.color,"#0D1117");
    assert.strictEqual(branding.prod,"#EF4444");
    assert(branding.theme && branding.family.toLowerCase().includes("system"),"System typography not active");
    checks.midnightTypographyAndProdSafety=true;
    await page.screenshot({path:path.join(evidenceDir,"02-branded-welcome-midnight.png")});

    await navigate(app,"/preferences/appearance");
    await page.locator("#table-density-preferences").waitFor({state:"visible",timeout:15000});
    assert(await page.locator('[data-testid="table-density-preview"]').evaluate(el=>el.classList.contains("density-compact")),
      "Compact table density changed");
    assert(await page.locator('[data-testid="prod-locked-indicator"]').isVisible(),"PROD safety lock hidden");
    checks.compactDensityAndProdLock=true;
    await page.screenshot({path:path.join(evidenceDir,"03-appearance-and-prod-lock.png")});

    await page.locator('[data-preference-tab-link-test="app"]').click();
    await page.locator("#theme-input").click();
    await page.locator("text=Light").click();
    await sleep(500);
    await navigate(app,"/welcome");
    await page.locator('[data-testid="openlens-devops-brand-icon"]').waitFor({state:"visible",timeout:15000});
    const light=await page.evaluate(()=>({
      theme:document.body.classList.contains("theme-light"),
      icon:!!document.querySelector('[data-testid="openlens-devops-brand-icon"] svg'),
      brand:!!document.querySelector('[data-testid="devops-topbar-brand"] svg'),
    }));
    assert(light.theme && light.icon && light.brand,"Fork identity missing in classic Light");
    checks.brandedLightTheme=true;
    await page.screenshot({path:path.join(evidenceDir,"04-branded-welcome-light.png")});

    const output={
      date:new Date().toISOString(), executable, checks,
      metrics:{
        appAsarSha256:hash(path.join(appDir,"Contents/Resources/app.asar")),
        executableSha256:hash(executable),
        finderDockIconSha256:hash(nativeIcns),
        screenshots:evidenceDir,
      },
    };
    fs.writeFileSync(report,JSON.stringify(output,null,2));
    console.log("PASS",JSON.stringify(output,null,2));
  } finally {
    if(app) { try { await app.close(); } catch {} }
    try { fs.rmSync(tempRoot,{recursive:true,force:true}); } catch {}
  }
}
run().catch(err=>{console.error("R6-02 E2E FAILED",err);process.exit(1)});
