# H8.8-06a-R2 real-Electron validation (dev Electron, NOT packaged)

Repo: /private/var/tmp/lens-final-05-rc-20261108, HEAD bee9d69e + uncommitted R2 changes. No source edited, nothing committed.
Exe: /private/var/tmp/lens-final-05-rc-20261108/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron
Launch (Playwright `_electron.launch`, cwd open-lens): `-r integration/early-network-guard.cjs . --user-data-dir=<ROOT>/appdata/"OpenLens DevOps" --remote-debugging-port=9341 --use-mock-keychain --offline`; env NODE_ENV=production CICD=<ROOT>/appdata HOME=<ROOT>/synthetic-home KUBECONFIG=<empty synthetic file>.
Final-run ROOT (kept): /private/var/tmp/r2-root.fHPEbH (earlier iterations: other /private/var/tmp/r2-root.* dirs, same synthetic layout).
Driver: run-acceptance.mjs; raw data: evidence.json (from the last run; every number below is from it).

Build (rebuilt because prebuilt predated R2):
- `cd packages/core && npm run build`: exit 0, ~62 s
- `cd open-lens && npx cross-env NODE_ENV=production webpack --config webpack/webpack.ts`: exit 0, ~15 s
- Marker check: `ai-provider-config-dialog-module__modalBackdrop` present in 3 files under open-lens/static/build (lens.js, lens.js.map, ...) and `ai-config-dialog-error` present in lens.js.

## Results (final run)
| Step | Result | Key measured data |
|---|---|---|
| A1 header dialog, 0 incidents | PASS | backdrop position:fixed, z-index 1000, rect 0,0,1440x900 = viewport, parent BODY (portal); dialog 620x785 at x410,y57, center offset dx=0 dy=0; elementFromPoint(dialog center) inside dialog; elementFromPoint(3,3)=backdrop; header trigger center hit = backdrop (page behind not clickable); role=dialog aria-modal=true aria-labelledby. 01-A-header-dialog-open.png |
| A2 backdrop click | PASS | click at (4,4) closes, focus returns to header button |
| A inner scroll | PASS (at C sizes) | At 1440x900 content (783) fits, not scrollable (honest: not testable there). At 700x700/700x500/600x700/480x700 dialog overflowY:auto, scrollTop moves to max (e.g. 700x500: 0->120->364.5 of max 365) |
| B1 workbench opener ("Proveedores IA") | PASS | same fixed/centered (dx=0, dy=0), hit inside dialog, 09-B-workbench-dialog-open.png |
| B2 banner opener (ai-default-banner-config-btn, after "Quitar proveedor") | PASS | real modal, Esc returns focus to banner button, 11-B-banner-dialog-open.png |
| C dialog narrow | PASS | 700x700 dlg 620x630 maxH 630px; 700x500 dlg 620x450 maxH 450px; 600x700 dlg 568x630; 480x700 dlg 448x630; hOverflow=false, docScrollW==viewport width in all, scrollable. Shots 15-C-*.png |
| C DEMO badge narrow | FAIL | Badge box itself not clipped (scrollWidth==clientWidth, scrollHeight==clientHeight, wraps to 2-4 lines, text complete in DOM) but it is NOT visible: probe-point visibility 0.333 @700x700, 0 @700x500, 0 @600x700, 0 @480x700. Cause (computed): ancestors `incident-workbench-panel-module__workbench...` overflow hidden with height 0 (rect h=0) inside incident-list-view layout, so the whole workbench panel is squeezed out. 14-C-*-result-badge.png. Default 1440x900: PASS (417x21, fully visible beside buttons, 13-F-result-demo-badge-default-size.png) |
| D1/D4 Esc -> focus returns to exact trigger | PASS | header: before {BUTTON open-ai-config-btn} == after; workbench: {BUTTON open-ai-provider-config-btn} == after |
| D2/D3/D5 Tab and Shift+Tab (n = focusable+12 = 21/22 presses each way; 480-wide run too) | PASS | 0 escapes outside dialog |
| D6 Esc right after "Quitar proveedor predeterminado" | FAIL (defect) | clicking that button unmounts it; document.activeElement becomes BODY, so the keydown handler (attached to the backdrop div) never sees Escape: dialog stays open (10c-D6-esc-did-not-close.png). Tab from BODY lands inside dialog in the probe, but Escape is dead until the user clicks/focuses inside. Likely same class: any action that removes the focused element |
| E1 ensure-demo rejected once | PASS (validated in Electron) | Induced from main process: ipcMain handler for `openlens:incident:ai:ensure-demo-profile` replaced once to throw (real ipc rejection, no source edits, no network). role=alert inside dialog, visible; select value "" and badge "No configurado"; no demo shown. 04-E-ensure-demo-failure-alert.png |
| E2 set-default rejected once | PASS | same for `openlens:incident:ai:set-default-provider`: role=alert in dialog; select stays on demo profile id == backend (badge "Demo offline"); no success shown. Retry succeeded and alert cleared. 06-E-... |
| F1 Create demo offline | PASS | select "Demo offline (sintético) (mock/mock-v1)", badge "Demo offline", alert cleared |
| F2 Guardar, close, reopen | PASS | same profile id kept; focus after Close button returns to header trigger |
| F3 consent | PASS | destination shows demo; 0 select, 0 combobox, 0 radio; "Autorizar y Diagnosticar" button. 12-F-consent-readonly.png |
| F4 result | PASS | badge text exactly "DEMO OFFLINE · resultado sintético, no generado por IA externa" |
| G network | PASS (scoped) | Method: early-network-guard globals (__BLOCKED_REQUESTS_LOG__, __NETWORK_AUDIT_LOG__), Playwright request hosts, lsof of app+children after run. Blocked: 6 TLS connects (k8slens.dev, docs.k8slens.dev, forums.k8slens.dev, twitter.com, medium.com, kubernetes.io) all at 18:04:58Z, i.e. startup welcome-page links, before any A-F step; blocked at/after first AI step (analysis start): 0. Renderer request hosts: only lens.app / openlens-demo-cluster-local.lens.app (local). lsof: 37 inet lines, 0 non-loopback. Limits: guard is in-process (JS-level) and lsof is a single end-of-run snapshot; no packet capture; timestamp window starts at the Analizar step, A-E network not separately timestamped beyond the audit log having no other blocked entries |

## Defects
1. D6: Escape/Tab handling lost when the focused element is removed (e.g. "Quitar proveedor predeterminado"). Screenshots: 10b-D-after-clear-default-focus-state.png, 10c-D6-esc-did-not-close.png.
2. C: at window widths 700 and below (700x500 is the app's real minimum size; 600/480 only reachable here by overriding setMinimumSize in the harness) the workbench panel is collapsed to height 0 by the Incident Center layout, so the DEMO OFFLINE badge is not visible, and at 700 the page itself overflows horizontally (14-C-700x700-result-badge.png). The R2 badge CSS (wrap, min-width 0) works on the badge element; the container layout is outside R2's diff.

## Limits
- Window below 700 wide needed `BrowserWindow.setMinimumSize(200,200)` in the harness (product min is 700x500).
- At narrow sizes the workbench opener button was occluded by a layout DIV (hit test), so dialog opening used `el.click()` (flag viaJsClick_* in evidence.json); dialog metrics are still real.
- E induced via main-process ipc handler wrapping (in-app, not source); equivalent to a real ipc rejection.
- Incidents do not persist across restart (known from r1); restart not re-run.
