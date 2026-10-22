# OpenLens DevOps Revival — R5-07 Validation

## Detached windows follow the app theme

- Date: 2026-10-22
- Base: `025785c` (R5-06)
- Build: `scratchpad/r507-build/out/mac-arm64/OpenLens DevOps.app` (ARM64, unsigned),
  `app.asar` sha256 `14f16f3a48468a97bed59aebc3f850ab714af47ac42ce348e2d4e2c7ba78f474`
- Verdict: **done** — detached terminal, logs and inspector windows open in the active theme and update live when it changes;
  sessions, CSP, sandbox and IPC validation unchanged.

## How theme sync works

1. `renderer/themes/sync-theme-to-detached-windows.injectable.ts` (root frame only) sends the active theme on start and on every change
   over `detached-theme:update`: `{ type: "dark" | "light", colors }` built from the theme objects (not computed CSS); terminal colours come
   from the existing `terminal-colors` injectable.
2. Main (`main/detached-tool-windows/detached-theme-ipc.ts`) accepts updates only from the root frame of a non-detached window
   (rejects registered detached windows, subframes, null frames), sanitizes, caches and broadcasts `detached-theme:changed` to registered
   detached windows. `detached-theme:get` returns the cache only to registered detached root frames.
3. `common/detached-tools/detached-theme.ts` is the allowlist (72 theme tokens, all present in `LensColorName`) and validator:
   only `#rgb[a]`/`#rrggbb[aa]`, `rgb()`/`rgba()` with valid ranges, or `transparent`, max 32 chars; unknown keys dropped.
4. Each detached preload re-validates with an inline copy of the same allowlist (sandboxed preloads cannot import TS) and the renderer
   applies `style.setProperty("--token", value)` + `data-theme`; static CSS uses `var(--token, previous value)`, so a window with no
   theme renders exactly as before. No CSS, URLs, cluster data or secrets cross the channel; CSP/HTML untouched.

## Changes

| Area | Files |
|---|---|
| Contract, validator | `common/detached-tools/detached-theme.ts` (+ test), `detached-tool-channels.ts` (`detachedThemeChannels`) |
| Main | `main/detached-tool-windows/detached-theme-ipc.ts` (+ test), `setup-detached-theme-ipc.injectable.ts`, `detached-window-registry.ts` (`windowIds()`) |
| App renderer | `renderer/themes/sync-theme-to-detached-windows.injectable.ts` |
| Detached terminal | `open-lens/static/detached-terminal-preload.js`, `-renderer.js`, `.css` — xterm theme updated in place (`term.options.theme`), terminal never recreated |
| Detached logs/inspector | `open-lens/static/detached-tool-preload.js`, `-renderer.js`, `.css` — tokens for surfaces, text, header, badges, PROD banner, buttons, focus ring |

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit -p packages/core`, ESLint (TS files), `node --check` (static JS) | clean |
| Jest: theme sanitizer, theme IPC (sender rejection, broadcast, get), dock + detached-tool suites | 26 suites, 261 tests pass |
| Builds | 2 (second for the light-theme button contrast fix) |
| Live switch (round 1, windows open) | `--mainBackground` `#1e2124` → `#f1f1f1`, `--envProduction` `#EF4444` → `#DC2626`; root style holds only 71 `--` allowlisted properties; no console errors |
| Reopen after close (light) | stays light |
| PTY (no navigation away) | light: 23759/ttys004 docked = detached = redocked; dark: 27585/ttys004 same; also identical across a live theme switch (75081/ttys004) |

Defect found and fixed: Redock/Refresh buttons unreadable in light theme (`--buttonDefaultBackground` + dark text) → secondary surface,
border and hover tokens.

## Evidence

`docs/revival/evidence/r5-07/`: `b-*` (R5-06 release: dark detached windows while the app is light) and `a-*` (R5-07): terminal, logs,
inspector in light and dark, readable buttons, focus ring; `main-*` app context.

## Pending

- **Pre-existing (R4-06B), not caused by R5-07:** after leaving the cluster view (Preferences or catalog) and returning, the dock shows a live
  docked terminal instead of the detached placeholder and spawns a second PTY while the detached window keeps the first. Reproduced
  identically on the R5-06 release. Needs a dedicated handover fix (dock placeholder state must survive cluster-frame remount); tracked as **R5-07F** in the roadmap.
- Detached "DEVELOPMENT" badge renders blue instead of `--envDevelopment` green (static badge style; cosmetic).
- PROD detached terminal not captured: the PROD gate must be accepted before Detach is offered, and connecting was not allowed.
- Any non-detached root window (e.g. secure pilot) could send a theme update; impact limited to validated colours.
- Live-switch screenshots were not retained after round 2; the switch is evidenced by the computed-value check above.
- Terminal pane follows `terminalBackground` (pure black in dark), same as the docked terminal.
