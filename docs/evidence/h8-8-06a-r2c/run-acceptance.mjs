// H8.8-06a R2c real-Electron validation driver (evidence-only). Usage: node run-acceptance.mjs <isolatedRoot>
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const REPO = "/private/var/tmp/lens-final-05-rc-20261108";
const require = createRequire(path.join(REPO, "package.json"));
const { _electron: electron } = require("playwright");
const OUT = path.join(REPO, "docs/evidence/h8-8-06a-r2c");
const ROOT = process.argv[2];
const APPDATA = path.join(ROOT, "appdata");
const USERDATA = path.join(APPDATA, "OpenLens DevOps");
const HOME = path.join(ROOT, "synthetic-home");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const rec = (step, status, detail) => { log.push({ step, status, detail }); console.log(`[${status}] ${step}`, JSON.stringify(detail ?? "").slice(0, 500)); };

fs.mkdirSync(path.join(HOME, ".kube"), { recursive: true });
fs.mkdirSync(path.join(HOME, "Library"), { recursive: true });
fs.mkdirSync(USERDATA, { recursive: true });
const KUBECONFIG = path.join(HOME, ".kube/config");
fs.writeFileSync(KUBECONFIG, "apiVersion: v1\nkind: Config\nclusters: []\ncontexts: []\nusers: []\npreferences: {}\n");

const EXE = path.join(REPO, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const CDP_PORT = 9343;
const startedAt = new Date().toISOString();
const app = await electron.launch({
  executablePath: EXE, cwd: path.join(REPO, "open-lens"),
  args: ["-r", path.join(REPO, "open-lens/integration/early-network-guard.cjs"), ".", `--user-data-dir=${USERDATA}`, `--remote-debugging-port=${CDP_PORT}`, "--use-mock-keychain", "--offline"],
  timeout: 90000,
  env: { ...process.env, NODE_ENV: "production", CICD: APPDATA, HOME, KUBECONFIG, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
});
const pid = app.process().pid;
const requests = [];
const win = await app.firstWindow();
win.on("request", (r) => requests.push({ t: new Date().toISOString(), url: r.url() }));
await win.waitForLoadState("domcontentloaded");
await sleep(3000);
const T = (id) => win.locator(`[data-testid="${id}"]`);
const shot = (name) => win.screenshot({ path: path.join(OUT, `${name}.png`) }).then(() => `${name}.png`);
const ACTIVE = `(() => { const a = document.activeElement; if (!a) return null; return { tag: a.tagName, testid: a.getAttribute("data-testid"), aria: a.getAttribute("aria-label"), role: a.getAttribute("role"), text: (a.textContent||"").trim().slice(0,40) }; })()`;
const active = () => win.evaluate(ACTIVE);
const sameEl = (a, b) => a && b && a.tag === b.tag && a.testid === b.testid && a.aria === b.aria && a.text === b.text;

async function openIncidents() {
  await T("welcome-launch-demo-cluster").waitFor({ state: "visible", timeout: 20000 });
  await T("welcome-launch-demo-cluster").click();
  let f; for (let i = 0; i < 40 && !f; i++) { f = win.frames().find((x) => /openlens-demo-cluster-local\.lens\.app/.test(x.url())); if (!f) await sleep(500); }
  await win.evaluate(() => window.__LENS_RENDERER_DI__.injectById("navigate-to-incidents")({ clusterId: "openlens-demo-cluster-local", namespace: "production" }));
  await T("incident-list-view").waitFor({ state: "visible", timeout: 20000 });
}

const metrics = () => win.evaluate(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) }; };
  const cs = (e, ...p) => { const c = getComputedStyle(e); return Object.fromEntries(p.map((k) => [k, c[k]])); };
  const bd = document.querySelector('[data-testid="ai-provider-config-modal"]');
  if (!bd) return { present: false };
  const dlg = bd.querySelector('[role="dialog"]');
  const vw = window.innerWidth, vh = window.innerHeight;
  const bR = bd.getBoundingClientRect(), dR = dlg.getBoundingClientRect();
  const cx = dR.x + dR.width / 2, cy = dR.y + dR.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  const hitCorner = document.elementFromPoint(3, 3);
  const trig = document.querySelector('[data-testid="open-ai-config-btn"], [data-testid="open-ai-provider-config-btn"], [data-testid="ai-default-banner-config-btn"]');
  const trigR = trig?.getBoundingClientRect();
  const hitTrig = trigR ? document.elementFromPoint(trigR.x + trigR.width / 2, trigR.y + trigR.height / 2) : null;
  return {
    present: true, viewport: { vw, vh, docScrollW: document.documentElement.scrollWidth, docScrollH: document.documentElement.scrollHeight },
    backdrop: { rect: r(bd), ...cs(bd, "position", "zIndex", "inset"), coversViewport: Math.abs(bR.x) < 1 && Math.abs(bR.y) < 1 && Math.abs(bR.width - vw) < 1 && Math.abs(bR.height - vh) < 1, parentTag: bd.parentElement?.tagName },
    dialog: { rect: r(dlg), ...cs(dlg, "position", "zIndex", "overflowY", "overflowX", "maxHeight", "width"), role: dlg.getAttribute("role"), ariaModal: dlg.getAttribute("aria-modal"), labelledby: dlg.getAttribute("aria-labelledby"),
      centerOffset: { dx: +(cx - vw / 2).toFixed(1), dy: +(cy - vh / 2).toFixed(1) }, scrollHeight: dlg.scrollHeight, clientHeight: dlg.clientHeight, scrollWidth: dlg.scrollWidth, clientWidth: dlg.clientWidth, scrollTop: dlg.scrollTop,
      fitsViewport: dR.x >= -0.5 && dR.y >= -0.5 && dR.right <= vw + 0.5 && dR.bottom <= vh + 0.5, hOverflow: dlg.scrollWidth > dlg.clientWidth + 1 },
    hitAtDialogCenterInsideDialog: dlg.contains(hit), hitAtDialogCenter: hit?.tagName,
    hitAtViewportCornerIsBackdrop: hitCorner === bd,
    triggerBehindBackdrop: trig ? { testid: trig.getAttribute("data-testid"), hitIsBackdropOrDialog: hitTrig === bd || dlg.contains(hitTrig) } : null,
    active: (() => { const a = document.activeElement; return { tag: a?.tagName, testid: a?.getAttribute("data-testid"), aria: a?.getAttribute("aria-label"), insideDialog: dlg.contains(a) }; })(),
    errorAlert: (() => { const e = bd.querySelector('[role="alert"]'); return e ? { text: e.textContent.trim(), inside: dlg.contains(e), visible: e.getBoundingClientRect().height > 0 } : null; })(),
    select: (() => { const s = bd.querySelector('[data-testid="ai-default-provider-select"]'); return s ? { value: s.value, text: s.options[s.selectedIndex]?.text } : null; })(),
    badge: bd.querySelector('[data-testid="ai-default-status-badge"]')?.textContent.trim() ?? null,
    focusableCount: dlg.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])').length,
  };
});

async function trapTest(n, shift) {
  const out = []; let escaped = 0;
  for (let i = 0; i < n; i++) {
    await win.keyboard.press(shift ? "Shift+Tab" : "Tab");
    const inside = await win.evaluate(() => { const bd = document.querySelector('[data-testid="ai-provider-config-modal"]'); return !!bd && bd.contains(document.activeElement); });
    if (!inside) escaped++;
    if (i < 3 || i >= n - 2) out.push(await active());
  }
  return { presses: n, escaped, sample: out };
}
const closeViaEsc = async () => { await win.keyboard.press("Escape"); await sleep(400); };
const modalPresent = () => T("ai-provider-config-modal").count().then((c) => c > 0);

// Fail an ipc handler once in main (real rejection through ipcMain.handle -> renderer invoke rejects).
const failOnce = (channel) => app.evaluate(({ ipcMain }, ch) => {
  const orig = ipcMain._invokeHandlers.get(ch);
  if (!orig) return "no-handler";
  ipcMain.removeHandler(ch);
  ipcMain.handle(ch, async (e, ...a) => { ipcMain.removeHandler(ch); ipcMain.handle(ch, orig); throw new Error("R2-induced failure (" + ch + ")"); });
  return "armed";
}, channel);

const evidenceExtra = {};
try {
  await openIncidents();
  const hdr = T("open-ai-config-btn");

  // ===== A: header button, zero incidents =====
  const rows0 = await win.locator('[data-testid^="incident-row-"]').count();
  const trigBefore = await (async () => { await hdr.focus(); return active(); })();
  await hdr.click();
  await T("ai-provider-config-modal").waitFor({ state: "visible", timeout: 8000 });
  await sleep(600);
  const mA = await metrics();
  await shot("01-A-header-dialog-open");
  const winSize0 = await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { size: w.getSize(), bounds: w.getBounds() }; });
  // inner scroll check: force scrolling by measuring and scrolling dialog
  const scrollTest = await win.evaluate(async () => { const d = document.querySelector('[role="dialog"][aria-modal="true"]'); const before = d.scrollTop; d.scrollTop = 150; await new Promise(r => setTimeout(r, 100)); return { scrollable: d.scrollHeight > d.clientHeight, before, after: d.scrollTop, scrollHeight: d.scrollHeight, clientHeight: d.clientHeight }; });
  const okA = rows0 === 0 && mA.backdrop.position === "fixed" && mA.backdrop.coversViewport && mA.dialog.role === "dialog" && mA.dialog.ariaModal === "true"
    && Math.abs(mA.dialog.centerOffset.dx) <= 4 && (Math.abs(mA.dialog.centerOffset.dy) <= 4 || mA.dialog.rect.h >= mA.viewport.vh * 0.85) && mA.hitAtDialogCenterInsideDialog
    && mA.hitAtViewportCornerIsBackdrop && mA.triggerBehindBackdrop?.hitIsBackdropOrDialog && mA.dialog.fitsViewport && Number(mA.backdrop.zIndex) >= 1000;
  // backdrop click handled
  await win.mouse.click(4, 4); await sleep(400);
  const closedByBackdrop = !(await modalPresent());
  const focusAfterBackdrop = await active();
  rec("A1 header dialog is a real fixed modal (zero incidents)", okA ? "PASS" : "FAIL", { rows0, winSize0, m: mA, scrollTest });
  rec("A2 backdrop click closes dialog", closedByBackdrop ? "PASS" : "FAIL", { closedByBackdrop, focusAfterBackdrop, trigBefore });
  // scrollTest at default window: if not scrollable, the real scroll is validated in C
  evidenceExtra.scrollAtDefault = scrollTest;

  // ===== D (header): Escape returns focus to the exact trigger; Tab/Shift+Tab trap =====
  await hdr.focus(); const trig1 = await active();
  await hdr.click(); await T("ai-provider-config-modal").waitFor({ state: "visible" }); await sleep(400);
  const m1 = await metrics();
  const n = m1.focusableCount + 12;
  const tabF = await trapTest(n, false);
  const tabB = await trapTest(n, true);
  await shot("02-D-header-after-tab-cycles");
  await closeViaEsc();
  const focusAfterEsc = await active();
  rec("D1 header: Esc closes, focus returns to header trigger", !(await modalPresent()) && sameEl(trig1, focusAfterEsc) ? "PASS" : "FAIL", { triggerBefore: trig1, activeAfterEsc: focusAfterEsc, initialActiveInDialog: m1.active });
  rec("D2 header: Tab and Shift+Tab never leave dialog", tabF.escaped === 0 && tabB.escaped === 0 ? "PASS" : "FAIL", { focusable: m1.focusableCount, tab: tabF, shiftTab: tabB });
  await shot("03-D-header-after-escape");

  // ===== E + F: induced failures, demo, Guardar, reopen =====
  await hdr.click(); await T("ai-provider-config-modal").waitFor({ state: "visible" }); await sleep(500);
  const e0 = await metrics();
  const armed1 = await failOnce("openlens:incident:ai:ensure-demo-profile");
  await T("create-demo-profile-btn").click(); await sleep(1500);
  const e1 = await metrics();
  await shot("04-E-ensure-demo-failure-alert");
  const okE1 = armed1 === "armed" && !!e1.errorAlert && e1.errorAlert.inside && e1.errorAlert.visible && /R2-induced failure/.test(e1.errorAlert.text) && e1.select.value === "" && !/demo/i.test(e1.badge ?? "") && !/demo/i.test(e1.select.text ?? "");
  rec("E1 ensure-demo rejected once: role=alert inside dialog, selector synced to backend (no demo), no success", okE1 ? "PASS" : "FAIL", { armed1, before: { select: e0.select, badge: e0.badge }, after: { alert: e1.errorAlert, select: e1.select, badge: e1.badge } });
  // retry succeeds -> alert cleared
  await T("create-demo-profile-btn").click(); await sleep(1500);
  const f1 = await metrics();
  await shot("05-F-demo-created");
  rec("F1 Crear perfil Demo offline (offline) succeeds, alert cleared, selector shows demo", !f1.errorAlert && /demo/i.test(f1.badge ?? "") && /demo/i.test(f1.select.text ?? "") && f1.select.value ? "PASS" : "FAIL", { m: { select: f1.select, badge: f1.badge, alert: f1.errorAlert } });
  // set-default failure
  const armed2 = await failOnce("openlens:incident:ai:set-default-provider");
  await T("save-default-provider-btn").click(); await sleep(1500);
  const e2 = await metrics();
  await shot("06-E-set-default-failure-alert");
  rec("E2 set-default rejected once: role=alert in dialog, selector stays synced with backend, no success", armed2 === "armed" && !!e2.errorAlert && e2.errorAlert.inside && /R2-induced failure/.test(e2.errorAlert.text) && e2.select.value === f1.select.value && /demo/i.test(e2.badge ?? "") ? "PASS" : "FAIL", { armed2, alert: e2.errorAlert, select: e2.select, badge: e2.badge, selectBefore: f1.select });
  await T("save-default-provider-btn").click(); await sleep(1500);
  const f2 = await metrics();
  await win.locator('[aria-label="Cerrar configuración IA"]').click(); await sleep(500);
  const focusAfterClose = await active();
  await hdr.click(); await T("ai-provider-config-modal").waitFor({ state: "visible" }); await sleep(800);
  const f3 = await metrics();
  await shot("07-F-reopened-default-kept");
  rec("F2 Guardar, close, reopen keeps demo default", !f2.errorAlert && f3.select.value === f1.select.value && /demo/i.test(f3.select.text ?? "") && /demo/i.test(f3.badge ?? "") ? "PASS" : "FAIL", { afterGuardar: { alert: f2.errorAlert, select: f2.select }, focusAfterCloseButton: focusAfterClose, reopened: { select: f3.select, badge: f3.badge } });
  await closeViaEsc();

  // ===== synthetic case + workbench =====
  await T("create-synthetic-btn").click();
  await win.locator('[data-testid^="incident-row-"]').first().waitFor({ state: "visible", timeout: 15000 });
  await sleep(800);
  const rowId = (await win.locator('[data-testid^="incident-row-"]').first().getAttribute("data-testid")).replace("incident-row-", "");
  await shot("08-synthetic-oom-created");
  await T(`open-workbench-btn-${rowId}`).click();
  await T("analyze-ai-btn").waitFor({ state: "visible", timeout: 15000 });
  await sleep(800);
  const wbBtn = T("open-ai-provider-config-btn");
  await wbBtn.focus(); const trigWb = await active();
  await wbBtn.click(); await T("ai-provider-config-modal").waitFor({ state: "visible" }); await sleep(600);
  const mB = await metrics();
  await shot("09-B-workbench-dialog-open");
  const nB = mB.focusableCount + 12;
  const tabBF = await trapTest(nB, false), tabBB = await trapTest(nB, true);
  const okB = mB.backdrop.position === "fixed" && mB.backdrop.coversViewport && mB.dialog.role === "dialog" && Math.abs(mB.dialog.centerOffset.dx) <= 4 && (Math.abs(mB.dialog.centerOffset.dy) <= 4 || mB.dialog.rect.h >= mB.viewport.vh * 0.85) && mB.hitAtDialogCenterInsideDialog && mB.hitAtViewportCornerIsBackdrop && mB.triggerBehindBackdrop?.hitIsBackdropOrDialog && mB.dialog.fitsViewport;
  rec("B1 workbench dialog is a real fixed modal", okB ? "PASS" : "FAIL", { m: mB });
  rec("D3 workbench: Tab and Shift+Tab never leave dialog", tabBF.escaped === 0 && tabBB.escaped === 0 ? "PASS" : "FAIL", { tab: tabBF, shiftTab: tabBB });
  await closeViaEsc();
  const afterEscWb = await active();
  rec("D4 workbench: Esc closes, focus returns to workbench opener", !(await modalPresent()) && sameEl(trigWb, afterEscWb) ? "PASS" : "FAIL", { triggerBefore: trigWb, activeAfterEsc: afterEscWb });
  await shot("10-D-workbench-after-escape");

  // banner entry: remove default so banner shows, open via banner
  await wbBtn.click(); await T("ai-provider-config-modal").waitFor({ state: "visible" }); await sleep(400);
  await T("clear-default-provider-btn").click(); await sleep(1200);
  const activeAfterClear = await win.evaluate(ACTIVE);
  const clearBtnStillThere = await T("clear-default-provider-btn").count();
  await shot("10b-D-after-clear-default-focus-state");
  const trapClearF = await trapTest(14, false), trapClearB = await trapTest(14, true);
  rec("D7 Tab/Shift+Tab stay inside dialog after 'Quitar proveedor'", trapClearF.escaped === 0 && trapClearB.escaped === 0 ? "PASS" : "FAIL", { tab: trapClearF, shiftTab: trapClearB });
  await closeViaEsc(); await sleep(400);
  const escClosedAfterClear = !(await modalPresent());
  const trapAfterClear = escClosedAfterClear ? null : await (async () => { const r = await trapTest(14, false); return r; })();
  rec("D6 Esc closes dialog right after 'Quitar proveedor' (focused button unmounts)", escClosedAfterClear ? "PASS" : "FAIL", { activeAfterClear, clearBtnStillThere, escClosedAfterClear, tabEscapesWhileFocusOnBody: trapAfterClear, note: "if FAIL: focus fell to BODY when the focused button was removed; dialog keydown handler (on backdrop div) never receives Escape/Tab" });
  if (!escClosedAfterClear) { await shot("10c-D6-esc-did-not-close"); await win.locator('[aria-label="Cerrar configuración IA"]').click(); await sleep(500); }
  const bannerVisible = await T("ai-default-banner").isVisible().catch(() => false);
  const bBtn = T("ai-default-banner-config-btn");
  let bannerRes = { bannerVisible };
  if (bannerVisible) {
    await bBtn.focus(); const trigBan = await active();
    await bBtn.click(); await T("ai-provider-config-modal").waitFor({ state: "visible" }); await sleep(500);
    const mBan = await metrics(); await shot("11-B-banner-dialog-open");
    await closeViaEsc(); const afterBan = await active();
    const okBan = mBan.backdrop.position === "fixed" && mBan.backdrop.coversViewport && Math.abs(mBan.dialog.centerOffset.dx) <= 4 && mBan.hitAtDialogCenterInsideDialog && !(await modalPresent()) && sameEl(trigBan, afterBan);
    rec("B2 banner entry: real modal + Esc returns focus to banner button", okBan ? "PASS" : "FAIL", { m: mBan, triggerBefore: trigBan, activeAfterEsc: afterBan });
  } else rec("B2 banner entry", "FAIL", { note: "banner not visible after clearing default" });
  // restore demo default
  await wbBtn.click(); await T("ai-provider-config-modal").waitFor({ state: "visible" }); await sleep(400);
  await T("create-demo-profile-btn").click(); await sleep(1500);
  await T("save-default-provider-btn").click(); await sleep(1200);
  const restored = await metrics();
  await closeViaEsc(); await sleep(400);

  // ===== F3 + G marker: analysis flow =====
  const tAiStart = new Date().toISOString();
  await T("analyze-ai-btn").click();
  await T("ai-consent-modal").waitFor({ state: "visible", timeout: 10000 });
  await sleep(600);
  const consent = await win.evaluate(() => { const m = document.querySelector('[data-testid="ai-consent-modal"]'); return { selects: m.querySelectorAll("select").length, combos: m.querySelectorAll('[role="combobox"],[role="listbox"]').length, radios: m.querySelectorAll('input[type="radio"]').length, target: m.querySelector('[data-testid="consent-default-target"]')?.innerText.replace(/\s+/g, " ").trim(), confirm: m.querySelector('[data-testid="confirm-ai-diagnosis-btn"]')?.innerText.trim() }; });
  await shot("12-F-consent-readonly");
  rec("F3 consent: read-only destination (demo), no provider/model select", /demo/i.test(consent.target ?? "") && consent.selects === 0 && consent.combos === 0 && consent.radios === 0 && /Autorizar y Diagnosticar/.test(consent.confirm ?? "") ? "PASS" : "FAIL", { restoredDefault: restored.select, consent });
  await T("confirm-ai-diagnosis-btn").click();
  await T("demo-offline-badge").waitFor({ state: "visible", timeout: 30000 });
  await sleep(1000);
  const badgeFull = "DEMO OFFLINE · resultado sintético, no generado por IA externa";
  const badgeInfo = (noScroll) => win.evaluate(([FULL, noScroll]) => { const b = document.querySelector('[data-testid="demo-offline-badge"]'); if (!noScroll) b.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); const a = document.querySelector('[data-testid="analyze-ai-btn"]'); const R = (e) => { const x = e.getBoundingClientRect(); return { x: +x.x.toFixed(1), y: +x.y.toFixed(1), w: +x.width.toFixed(1), h: +x.height.toFixed(1), right: +x.right.toFixed(1), bottom: +x.bottom.toFixed(1) }; };
    const cs = getComputedStyle(b); const br = R(b); const ar = R(a);
    // find nearest scrolling/clipping ancestors
    const clips = []; for (let p = b.parentElement; p; p = p.parentElement) { const c = getComputedStyle(p); if (/(hidden|auto|scroll)/.test(c.overflowX + c.overflowY)) clips.push({ tag: p.tagName, cls: p.className.toString().slice(0, 40), ox: c.overflowX, oy: c.overflowY, rect: R(p), sw: p.scrollWidth, cw: p.clientWidth }); }
    const vis = (() => { const pts = []; const br2 = br; for (const fx of [0.03, 0.5, 0.97]) for (const fy of [0.1, 0.5, 0.9]) pts.push([br.x + br.w * fx, br.y + br.h * fy]); window.__hitDbg = []; const hits = pts.map(([x, y]) => { const inVp = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight; const h = inVp ? document.elementFromPoint(x, y) : null; window.__hitDbg.push([Math.round(x), Math.round(y), inVp, h ? h.tagName + ":" + (h.getAttribute("data-testid") || String(h.className).slice(0, 30)) : null]); return !!(inVp && h && (h === b || b.contains(h))); }); return { visibleFraction: +(hits.filter(Boolean).length / hits.length).toFixed(3), probePoints: hits.length, dbg: window.__hitDbg.slice(0, 4) }; })();
    return { ...vis, text: b.textContent.trim(), fullText: b.textContent.trim() === FULL, badgeRect: br, analyzeRect: ar, scrollWidth: b.scrollWidth, clientWidth: b.clientWidth, scrollHeight: b.scrollHeight, clientHeight: b.clientHeight, whiteSpace: cs.whiteSpace, overflow: cs.overflow, textOverflow: cs.textOverflow, vw: window.innerWidth, vh: window.innerHeight, withinViewportX: br.x >= 0 && br.right <= window.innerWidth + 0.5, overlapsAnalyze: !(br.right <= ar.x || br.x >= ar.right || br.bottom <= ar.y || br.y >= ar.bottom), docScrollW: document.documentElement.scrollWidth, clippingAncestors: clips.slice(0, 3) }; }, [badgeFull, !!noScroll]);
  await sleep(300); const bi0 = await badgeInfo();
  await shot("13-F-result-demo-badge-default-size");
  rec("F4 result with DEMO OFFLINE badge (default size)", bi0.text.replace(/\s+/g, " ") === badgeFull && bi0.scrollWidth <= bi0.clientWidth + 1 && bi0.scrollHeight <= bi0.clientHeight + 1 && bi0.visibleFraction >= 0.99 && !bi0.overlapsAnalyze ? "PASS" : "FAIL", bi0);

  // ===== C: narrow windows =====
  const setSize = (w, h) => app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setSize(w, h); return { size: win.getSize(), min: win.getMinimumSize() }; }, [w, h]);
  for (const [w, h] of [[700, 700], [700, 500]]) {
    await win.evaluate(() => { document.querySelector('[data-testid="incident-list-view"]').scrollTop = 0; });
    const sz = await setSize(w, h); await sleep(1200);
    const tag = `${w}x${h}`;
    // R2c: the badge must auto-reveal on narrow resize with NO test-driven scroll.
    const autoReveal = await badgeInfo(true);
    rec(`R2c auto-reveal badge @${tag} without manual scroll`, autoReveal.visibleFraction >= 0.99 && autoReveal.docScrollW <= w + 1 ? "PASS" : "FAIL", autoReveal);
    await win.evaluate(() => { document.querySelector('[data-testid="incident-list-view"]').scrollTop = 0;  });
    const biRaw = await badgeInfo(true);
    evidenceExtra['badgeNoScroll_' + tag] = { visibleFraction: biRaw.visibleFraction, badgeRect: biRaw.badgeRect, vw: biRaw.vw, vh: biRaw.vh };
    const biN = await badgeInfo();
    await shot(`14-C-${tag}-result-badge`);
    rec(`C badge @${tag}: fully visible, not clipped, beside Analizar`, biN.text.replace(/\s+/g, " ") === badgeFull && biN.scrollWidth <= biN.clientWidth + 1 && biN.scrollHeight <= biN.clientHeight + 1 && biN.visibleFraction >= 0.99 && !biN.overlapsAnalyze && biN.docScrollW <= biN.vw + 1 ? "PASS" : "FAIL", { requested: [w, h], actual: sz, ...biN });
    await wbBtn.scrollIntoViewIfNeeded().catch(() => {});
    const pre = await win.evaluate(() => { const b = document.querySelector('[data-testid="open-ai-provider-config-btn"]'); const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { innerW: innerWidth, innerH: innerHeight, btnRect: { x: r.x, y: r.y, w: r.width, h: r.height }, hit: hit === b || b.contains(hit) ? "button" : hit?.tagName + "." + String(hit?.className).slice(0, 60) + " " + (hit?.getAttribute("data-testid") ?? ""), winSizeNow: null }; });
    pre.winSizeNow = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getSize());
    evidenceExtra["preOpen_" + tag] = pre;
    let viaJsClick = false;
    try { await wbBtn.click({ timeout: 6000 }); } catch (err) { viaJsClick = true; await shot(`15x-C-${tag}-opener-click-blocked`); await wbBtn.evaluate((el) => el.click()); }
    evidenceExtra["viaJsClick_" + tag] = viaJsClick;
    await T("ai-provider-config-modal").waitFor({ state: "visible" }); await sleep(600);
    const mC = await metrics();
    const sc = await win.evaluate(async () => { const d = document.querySelector('[role="dialog"][aria-modal="true"]'); d.scrollTop = 0; d.scrollTop = 120; await new Promise(r => setTimeout(r, 100)); const a = d.scrollTop; d.scrollTop = d.scrollHeight; await new Promise(r => setTimeout(r, 100)); return { scrollable: d.scrollHeight > d.clientHeight, afterPartial: a, afterEnd: d.scrollTop, maxScroll: d.scrollHeight - d.clientHeight }; });
    await shot(`15-C-${tag}-dialog`);
    const okC = mC.backdrop.coversViewport && mC.dialog.fitsViewport && !mC.dialog.hOverflow && mC.viewport.docScrollW <= mC.viewport.vw + 1 && mC.dialog.rect.h <= mC.viewport.vh * 0.9 + 1 && (!sc.scrollable || (sc.afterPartial > 0 && sc.afterEnd >= sc.maxScroll - 2)) && Math.abs(mC.dialog.centerOffset.dx) <= 4;
    rec(`C dialog @${tag}: fits, max-height respected, scrollable, no horizontal overflow`, okC ? "PASS" : "FAIL", { requested: [w, h], actual: sz, m: mC, scroll: sc });
    if (tag === "480x700") { const tN = await trapTest(mC.focusableCount + 6, false); rec("D5 trap at 480 wide", tN.escaped === 0 ? "PASS" : "FAIL", tN); }
    await closeViaEsc();
  }
  // R2c: short wide windows must stay side-by-side, with no collapsed Workbench.
  await setSize(1440, 700); await sleep(1000);
  const wideShort = await win.evaluate(() => {
    const list = document.querySelector('[data-testid="incident-list-view"]');
    const pane = list?.querySelector('[data-testid="incident-workbench-panel"]')?.parentElement;
    const row = pane?.parentElement;
    const rect = pane?.getBoundingClientRect();
    return { rowDirection: row ? getComputedStyle(row).flexDirection : null, rowHeight: row?.getBoundingClientRect().height,
      paneHeight: rect?.height, docScrollW: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight };
  });
  rec("R2c 1440x700 remains side-by-side, pane nonzero, no horizontal overflow",
    wideShort.rowDirection === "row" && wideShort.paneHeight >= 300 && wideShort.docScrollW <= 1441 ? "PASS" : "FAIL", wideShort);
  await shot("16-R2c-1440x700-short-wide");

  await setSize(winSize0.size[0], winSize0.size[1]); await sleep(800);
  const wideNormal = await win.evaluate(() => {
    const list = document.querySelector('[data-testid="incident-list-view"]');
    const pane = list?.querySelector('[data-testid="incident-workbench-panel"]')?.parentElement;
    const row = pane?.parentElement;
    return { direction: row ? getComputedStyle(row).flexDirection : null, paneHeight: pane?.getBoundingClientRect().height,
      docScrollW: document.documentElement.scrollWidth, vw: innerWidth };
  });
  rec("R2c 1440x900 retains horizontal split, no horizontal overflow",
    wideNormal.direction === "row" && wideNormal.paneHeight > 0 && wideNormal.docScrollW <= 1441 ? "PASS" : "FAIL", wideNormal);
  await shot("17-R2c-1440x900-wide");

  // ===== G network =====
  const audit = await app.evaluate(() => ({ blocked: globalThis.__BLOCKED_REQUESTS_LOG__ ?? [], all: globalThis.__NETWORK_AUDIT_LOG__ ?? [] }));
  const hosts = (u) => { try { return new URL(u).host; } catch { return String(u); } };
  const ts = (e) => e.timestamp ?? e.time ?? null;
  const blockedBefore = audit.blocked.filter((e) => ts(e) && ts(e) < tAiStart), blockedAfter = audit.blocked.filter((e) => !ts(e) || ts(e) >= tAiStart);
  const allAfterAi = audit.all.filter((e) => ts(e) && ts(e) >= tAiStart);
  const rendererAfterOpenIncidents = requests.filter((r) => r.t >= tAiStart).map((r) => hosts(r.url));
  let lsof = ""; try { const pids = execSync(`pgrep -P ${pid}; echo ${pid}`).toString().split("\n").filter(Boolean).join(","); lsof = execSync(`lsof -nP -a -p ${pids} -i 2>/dev/null || true`).toString(); } catch (e) { lsof = String(e); }
  const inet = lsof.split("\n").filter((l) => /TCP|UDP/.test(l));
  const nonLoop = inet.filter((l) => !/127\.0\.0\.1|\[::1\]|localhost|\*:|->(127\.|\[::1\])/.test(l));
  // G scope: steps A-F start after startup; startup-time blocked attempts are reported separately
  const firstStepTs = new Date(Date.parse(startedAt) + 1).toISOString();
  rec("G no external AI traffic during A-F", blockedAfter.length === 0 && nonLoop.length === 0 && [...new Set(rendererAfterOpenIncidents)].every((h) => /lens\.app$/.test(h) || /^(localhost|127\.)/.test(h)) ? "PASS" : "FAIL", {
    tAiStart, startedAt, blockedBeforeFirstAiStep: blockedBefore, auditSample: audit.all.slice(0, 3), auditCount: audit.all.length, blockedAtOrAfterFirstAiStep: blockedAfter,
    mainAuditEntriesAfterAiStart: allAfterAi.length, rendererRequestHostsAfterAiStart: [...new Set(rendererAfterOpenIncidents)], rendererRequestHostsAll: [...new Set(requests.map((r) => hosts(r.url)))], lsofInetLines: inet.length, lsofNonLoopback: nonLoop,
  });
} catch (e) {
  rec("EXCEPTION", "FAIL", { error: String(e).slice(0, 800) });
  try { await shot("99-error-state"); } catch {}
}
fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify({ pid, exe: EXE, userData: USERDATA, cdpPort: CDP_PORT, startedAt, extra: evidenceExtra, log }, null, 2));
await app.close().catch(() => {});
// The evidence checker must fail the shell command if any step fails.
process.exit(log.every(entry => entry.status === "PASS") ? 0 : 1);
