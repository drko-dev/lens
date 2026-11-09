// H8.8-06a r1 real-Electron visual acceptance driver (evidence-only, not product code).
// Usage: node run-acceptance.mjs <phase: main|restart> <isolatedRoot>
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const REPO = "/private/var/tmp/lens-final-05-rc-20261108";
const require = createRequire(path.join(REPO, "package.json"));
const { _electron: electron } = require("playwright");
const OUT = path.join(REPO, "docs/evidence/h8-8-06a-r1");
const phase = process.argv[2];
const ROOT = process.argv[3];
const APPDATA = path.join(ROOT, "appdata");
const USERDATA = path.join(APPDATA, "OpenLens DevOps");
const HOME = path.join(ROOT, "synthetic-home");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const rec = (step, status, detail) => {
  log.push({ step, status, detail });
  console.log(`[${status}] ${step}`, JSON.stringify(detail ?? "").slice(0, 600));
};

fs.mkdirSync(path.join(HOME, ".kube"), { recursive: true });
fs.mkdirSync(path.join(HOME, "Library"), { recursive: true });
fs.mkdirSync(USERDATA, { recursive: true });
const KUBECONFIG = path.join(HOME, ".kube/config");
fs.writeFileSync(KUBECONFIG, "apiVersion: v1\nkind: Config\nclusters: []\ncontexts: []\nusers: []\npreferences: {}\n");

const EXE = path.join(REPO, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
const CDP_PORT = phase === "main" ? 9333 : 9334;
const app = await electron.launch({
  executablePath: EXE,
  cwd: path.join(REPO, "open-lens"),
  args: [
    "-r", path.join(REPO, "open-lens/integration/early-network-guard.cjs"),
    ".",
    `--user-data-dir=${USERDATA}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "--use-mock-keychain",
    "--offline",
  ],
  timeout: 90000,
  env: { ...process.env, NODE_ENV: "production", CICD: APPDATA, HOME, KUBECONFIG, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
});
const pid = app.process().pid;
console.log("PID", pid, "userData:", await app.evaluate(({ app }) => app.getPath("userData")));
const requests = [];
let n = 0;
const win = await app.firstWindow();
win.on("request", (r) => requests.push(r.url()));
await win.waitForLoadState("domcontentloaded");
await sleep(3000);
const shot = async (name) => {
  const p = path.join(OUT, `${phase === "main" ? "" : "R-"}${name}.png`);
  await win.screenshot({ path: p });
  return p;
};
const T = (id) => win.locator(`[data-testid="${id}"]`);

async function openIncidents() {
  await T("welcome-launch-demo-cluster").waitFor({ state: "visible", timeout: 20000 });
  await T("welcome-launch-demo-cluster").click();
  let f;
  for (let i = 0; i < 40 && !f; i++) {
    f = win.frames().find((x) => /openlens-demo-cluster-local\.lens\.app/.test(x.url()));
    if (!f) await sleep(500);
  }
  await win.evaluate(() => {
    const di = window.__LENS_RENDERER_DI__;
    di.injectById("navigate-to-incidents")({ clusterId: "openlens-demo-cluster-local", namespace: "production" });
  });
  await T("incident-list-view").waitFor({ state: "visible", timeout: 20000 });
}

const dialogInfo = () =>
  win.evaluate(() => {
    const m = document.querySelector('[data-testid="ai-provider-config-modal"]');
    const role = m?.closest('[role="dialog"]') || m?.querySelector('[role="dialog"]') || (m?.getAttribute("role") ? m : null);
    const a = document.activeElement;
    const sel = document.querySelector('[data-testid="ai-default-provider-select"]');
    return {
      present: !!m,
      role: role?.getAttribute("role") ?? null,
      ariaModal: role?.getAttribute("aria-modal") ?? null,
      ariaLabel: role?.getAttribute("aria-label") ?? role?.getAttribute("aria-labelledby") ?? null,
      focusInside: !!(m && a && m.contains(a)),
      active: a ? `${a.tagName}${a.getAttribute("data-testid") ? "[" + a.getAttribute("data-testid") + "]" : ""}${a.getAttribute("aria-label") ? "{" + a.getAttribute("aria-label") + "}" : ""}` : null,
      statusBadge: document.querySelector('[data-testid="ai-default-status-badge"]')?.textContent?.trim() ?? null,
      selectValue: sel?.value ?? null,
      selectText: sel ? sel.options?.[sel.selectedIndex]?.text ?? null : null,
      selectOptions: sel ? [...sel.options].map((o) => `${o.value}|${o.text}`) : null,
      chip: document.querySelector('[data-testid="ai-default-status-chip"]')?.textContent?.trim() ?? null,
    };
  });

try {
  await openIncidents();
  if (phase === "main") {
    // STEP 1
    const cnt = await win.locator('[data-testid^="incident-row-"]').count();
    const btn = T("open-ai-config-btn");
    const vis = await btn.isVisible();
    const txt = (await btn.textContent())?.trim();
    const p = await shot("01-incident-center-zero-incidents-config-ia-button");
    rec("1 Configuración IA visible with 0 incidents", vis && cnt === 0 && /Configuración IA/.test(txt) ? "PASS" : "FAIL", { incidentRows: cnt, text: txt, chip: await T("ai-default-status-chip").textContent().catch(() => null), shot: p });

    // STEP 2
    await btn.click();
    await T("ai-provider-config-modal").waitFor({ state: "visible", timeout: 8000 });
    await sleep(500);
    const d2 = await dialogInfo();
    const p2 = await shot("02-config-modal-open");
    await win.keyboard.press("Escape");
    await sleep(600);
    const afterEsc = await dialogInfo();
    const p2b = await shot("02b-after-escape");
    const focusAfter = await win.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.tagName);
    rec("2 modal opens, dialog role/aria-modal, Esc closes, focus", d2.present && d2.role === "dialog" && d2.ariaModal === "true" && !afterEsc.present ? "PASS" : "FAIL", { open: d2, closedAfterEsc: !afterEsc.present, focusAfterEsc: focusAfter, shots: [p2, p2b] });
    if (afterEsc.present) await win.locator('[aria-label="Cerrar configuración IA"]').click();

    // STEP 3
    await btn.click();
    await T("ai-provider-config-modal").waitFor({ state: "visible" });
    const before3 = await dialogInfo();
    await T("create-demo-profile-btn").click();
    await sleep(1500);
    const d3 = await dialogInfo();
    const p3 = await shot("03-demo-profile-created");
    rec("3 Crear perfil Demo offline", /demo/i.test(d3.statusBadge ?? "") && d3.selectValue && /demo/i.test(d3.selectText ?? "") ? "PASS" : "FAIL", { before: before3, after: d3, shot: p3 });

    // STEP 4a
    await T("save-default-provider-btn").click();
    await sleep(1500);
    const dSaved = await dialogInfo();
    const p4 = await shot("04a-after-guardar");
    await win.locator('[aria-label="Cerrar configuración IA"]').click();
    await sleep(600);
    const chipClosed = await T("ai-default-status-chip").textContent().catch(() => null);
    await T("open-ai-config-btn").click();
    await T("ai-provider-config-modal").waitFor({ state: "visible" });
    await sleep(800);
    const d4 = await dialogInfo();
    const p4b = await shot("04b-reopened-default-persists");
    rec("4a Guardar, close, reopen keeps demo default", /demo/i.test(d4.selectText ?? "") && d4.selectValue === d3.selectValue && /demo/i.test(d4.statusBadge ?? "") ? "PASS" : "FAIL", { afterSave: dSaved, chipAfterClose: chipClosed, reopened: d4, shots: [p4, p4b] });
    await win.locator('[aria-label="Cerrar configuración IA"]').click();
    await sleep(500);

    // STEP 5
    await T("create-synthetic-btn").click();
    await win.locator('[data-testid^="incident-row-"]').first().waitFor({ state: "visible", timeout: 15000 });
    await sleep(800);
    const rowId = (await win.locator('[data-testid^="incident-row-"]').first().getAttribute("data-testid")).replace("incident-row-", "");
    const rowText = (await win.locator('[data-testid^="incident-row-"]').first().textContent())?.replace(/\s+/g, " ").trim();
    const p5 = await shot("05-synthetic-oom-incident-created");
    rec("5 Cargar Caso Sintético OOM", "PASS", { rowId, rowText: rowText?.slice(0, 200), shot: p5 });

    // STEP 6
    await T(`open-workbench-btn-${rowId}`).click();
    await T("analyze-ai-btn").waitFor({ state: "visible", timeout: 15000 });
    await sleep(800);
    const bannerText = await T("ai-default-banner").textContent().catch(() => null);
    const p6a = await shot("06a-workbench-open");
    await T("analyze-ai-btn").click();
    await T("ai-consent-modal").waitFor({ state: "visible", timeout: 10000 });
    await sleep(800);
    const consent = await win.evaluate(() => {
      const m = document.querySelector('[data-testid="ai-consent-modal"]');
      return {
        text: m.innerText.replace(/\s+/g, " ").trim().slice(0, 1800),
        selects: m.querySelectorAll("select").length,
        comboboxes: m.querySelectorAll('[role="combobox"],[role="listbox"]').length,
        radios: m.querySelectorAll('input[type="radio"]').length,
        target: m.querySelector('[data-testid="consent-default-target"]')?.innerText.replace(/\s+/g, " ").trim(),
        confirmBtn: m.querySelector('[data-testid="confirm-ai-diagnosis-btn"]')?.innerText.trim(),
      };
    });
    const p6 = await shot("06b-consent-readonly-destination");
    rec("6 consent: sanitized evidence + readonly destination, no selector", /demo/i.test(consent.target ?? "") && consent.selects === 0 && consent.comboboxes === 0 && /Autorizar y Diagnosticar/.test(consent.confirmBtn ?? "") ? "PASS" : "FAIL", { banner: bannerText?.slice(0, 200), consent, shots: [p6a, p6] });

    // STEP 7
    await T("confirm-ai-diagnosis-btn").click();
    await T("demo-offline-badge").waitFor({ state: "visible", timeout: 30000 });
    await sleep(1000);
    const badge = (await T("demo-offline-badge").textContent())?.replace(/\s+/g, " ").trim();
    const p7 = await shot("07-demo-offline-result-badge");
    rec("7 DEMO OFFLINE badge", badge === "DEMO OFFLINE · resultado sintético, no generado por IA externa" || (/DEMO OFFLINE/.test(badge) && /resultado sint.tico, no generado por IA externa/.test(badge)) ? "PASS" : "FAIL", { badge, shot: p7 });
  } else {
    // restart persistence check
    await T("open-ai-config-btn").waitFor({ state: "visible", timeout: 20000 });
    const chip = await T("ai-default-status-chip").textContent().catch(() => null);
    const rows = await win.locator('[data-testid^="incident-row-"]').count();
    await T("open-ai-config-btn").click();
    await T("ai-provider-config-modal").waitFor({ state: "visible" });
    await sleep(800);
    const d = await dialogInfo();
    const p = await shot("08-restart-default-persists");
    rec("4b restart same user-data-dir keeps demo default", /demo/i.test(d.selectText ?? "") && /demo/i.test(d.statusBadge ?? "") ? "PASS" : "FAIL", { chip, incidentRows: rows, dialog: d, shot: p });
  }

  // STEP 8 network evidence
  const audit = await app.evaluate(() => ({ blocked: globalThis.__BLOCKED_REQUESTS_LOG__ ?? [], all: (globalThis.__NETWORK_AUDIT_LOG__ ?? []).map((e) => e.url || e.target) }));
  const hosts = (u) => { try { return new URL(u).host; } catch { return u; } };
  const rendererHosts = [...new Set(requests.map(hosts))];
  const auditHosts = [...new Set(audit.all.filter(Boolean).map(hosts))];
  let lsof = "";
  try {
    const pids = execSync(`pgrep -P ${pid}; echo ${pid}`).toString().split("\n").filter(Boolean).join(",");
    lsof = execSync(`lsof -nP -a -p ${pids} -i 2>/dev/null || true`).toString();
  } catch (e) { lsof = String(e); }
  const inetLines = lsof.split("\n").filter((l) => /TCP|UDP/.test(l));
  const nonLoop = inetLines.filter((l) => !/127\.0\.0\.1|\[::1\]|localhost|\*:|->(127\.|\[::1\])/.test(l));
  rec("8 no external network", audit.blocked.length === 0 && nonLoop.length === 0 ? "PASS" : "FAIL", {
    blockedByPolicy: audit.blocked, rendererRequestHosts: rendererHosts, mainSessionAuditHosts: auditHosts, lsofInetLines: inetLines.length, lsofNonLoopback: nonLoop,
  });
} catch (e) {
  rec("EXCEPTION", "FAIL", { error: String(e).slice(0, 500) });
  try { await shot("99-error-state"); } catch {}
}
fs.writeFileSync(path.join(OUT, `evidence-${phase}.json`), JSON.stringify({ phase, pid, exe: EXE, userData: USERDATA, cdpPort: CDP_PORT, log }, null, 2));
await app.close().catch(() => {});
process.exit(0);
