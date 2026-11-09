# H8.8-06a R2b - narrow-window DEMO OFFLINE badge + Escape revalidation (real Electron)

Root cause: in incident-list-view.tsx the table/workbench split row is an inline-styled `display:flex; flex:1; min-height:0`
inside `.container` (flex column, overflow-y:auto). At 700px wide the header/stats/filters/scanner fill the container, so the
split row (and the Workbench at height:100%) collapsed to ~0px with overflow hidden -> badge invisible; `.actions` (no wrap) and the
table (min ~756px) pushed layout wider than 700.
Fix (CSS only, incident-list-view.module.scss): `.actions{flex-wrap:wrap}` and an `@media (max-width:900px),(max-height:700px)` block that
stacks the split panes at natural height (workbench pane 560px) so `.container` scrolls vertically. Wide layout untouched.

Harness: run-acceptance.mjs (mktemp ROOT outside repo, CICD/HOME isolation, early-network-guard, --offline, synthetic kubeconfig, no min-size override).
Window min size reported by app: 700x500. Results in evidence.json (21 steps, all PASS).

| Step | Result | Measured |
|---|---|---|
| D1/D4/B2 Esc closes, focus returns (header, workbench, banner opener) | PASS | |
| D6 Esc after "Quitar proveedor predeterminado" | PASS | closed; focus was on dialog container (role=dialog) |
| D7 Tab/Shift+Tab after removal | PASS | 0 escapes in 14+14 presses |
| C badge @700x700 | PASS | after scroll-into-view: visibleFraction 1, rect y=359.6 h=21.4, docScrollW 700 |
| C badge @700x500 | PASS | visibleFraction 1, rect y=259.1, docScrollW 700 |
| C dialog @700x700 / 700x500 | PASS | fits, no hOverflow, docScrollW 700 |
| F4 @1440x900 | PASS | visibleFraction 1, rect 858.6,663 417x21 |
| 1440x900 unchanged | PASS | 01-A and 09-B screenshots pixel-identical to h8-8-06a-r2; 13 differs only in a 115x19px region at bottom-right (live counter) |
| F2 demo create, Guardar, reopen keeps default | PASS | |
| F3 consent -> diagnosis with badge | PASS | |
| G no external AI traffic | PASS | blocked=[], non-loopback sockets=[], renderer hosts after AI start=[] |

Limits: at 700 the badge is reachable by vertical scroll of the Incident Center (not in the initial viewport: unscrolled y=1146); scrolled
visibility measured. Media query also applies to windows <=700px tall at any width. The split-row selector is an attribute match on the inline style
(`[style*="min-height"]`) because tsx edits were out of scope; a unit test pins that coupling.
