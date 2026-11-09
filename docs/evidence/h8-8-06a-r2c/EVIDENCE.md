# H8.8-06a R2c — responsive layout hardening and DEMO OFFLINE auto-reveal

## Scope
- Replaced the fragile `[style*="min-height"] !important` selector with dedicated CSS module layout classes in `incident-list-view.tsx` / `incident-list-view.module.scss`.
- Separated the narrow-width stacking rule (`max-width: 900px`) from the short-wide (`min-width: 901px` and `max-height: 700px`) non-collapsing horizontal split.
- Accounted for the 16px gap in the 55%/45% horizontal layout (`calc(55% - 8px)` / `calc(45% - 8px)`).
- In `incident-workbench-panel.tsx`, added a resize/ResizeObserver-driven programmatic reveal of the existing mock-result badge on narrow Incident Center windows; no duplicate badge, focus changes, network calls, or consent bypass.
- Replaced R2b's CSS-attribute-selector test with `h8-8-06a-r2c-responsive-layout.test.ts`.

## Build dependency and regression finding
`open-lens`'s webpack build uses the precompiled `@openlens/core` library. Initial R2c acceptance attempts accidentally used a stale `packages/core/static/build/library/renderer.js` (Nov 9 15:12). They showed the **old** stacked-at-1440×700 behavior and failed auto-reveal; these attempts are superseded and were not counted as final evidence.

For the final run, built in this order with Node v24.22.2:
1. `cd packages/core && NODE_ENV=production ../../node_modules/.bin/webpack --config webpack/library-bundle.ts` — exit 0.
2. `cd open-lens && NODE_ENV=production ../node_modules/.bin/webpack --config webpack/webpack.ts` — exit 0.

Verified that compiled `core` JS includes the new `ResizeObserver` and `splitRow` code, and compiled CSS includes the new layout rules.

## Validation
- Jest: 12 suites, 106/106 tests PASS (`cd packages/core && ../../node_modules/.bin/jest src/features/incident-workbench --runInBand --silent`).
- `tsc -p packages/core/tsconfig.json --noEmit`: exit 0.
- Root-level `tsc --noEmit` is not clean: 35 errors in unrelated integration/build/mock sources; no error references the modified R2c files.
- `git diff --check`: exit 0.
- Real Electron: 25/25 PASS from the **final** `evidence.json`, using a fresh isolated root, synthetic kubeconfig, early network guard and `--offline`; minimum BrowserWindow size unchanged at 700×500.
- Auto-reveal without test-driven scrolling after resize: @700×700 and @700×500, `visibleFraction: 1`; document width remains 700.
- Dialog fit and accessibility: modal fits @700×700 / @700×500, no horizontal document overflow; Esc and Tab/Shift+Tab focus checks remain PASS.
- Short wide @1440×700: flex direction `row`, pane height 320px, document scroll width 1440.
- Normal wide @1440×900: flex direction `row`, pane height ~442px, document scroll width 1440.
- `01-A-header-dialog-open.png`, `09-B-workbench-dialog-open.png`, and `13-F-result-demo-badge-default-size.png` are pixel-identical to R2b's same-named captures (Pillow `ImageChops.difference(...).getbbox() is None`).
- F2 default persistence, F3 consent destination read-only, F4 synthetic result, error handling, focus restoration, and G no external AI traffic after diagnosis began all PASS.

## Important interpretation
The result badge is automatically **scrolled into view** when the narrow viewport is entered while a synthetic result is active; it has not been moved into the initial layout flow. If someone manually resets the Incident Center's scroll position to the top, the workbench result is still below the fold by design and can be reached by normal scrolling. This is not a permanently pinned badge.

## Artifacts
- `run-acceptance.mjs`: 25 real-Electron checks; fail-safe exit status on any FAIL.
- `evidence.json`: measured results.
- PNGs: dialog, consent, result, 700×500 / 700×700, and 1440×700 / 1440×900.
- Final isolated user-data root: `/private/var/tmp/r2c-final-root.lAV8Gf` (no user credentials or real kubeconfig).
