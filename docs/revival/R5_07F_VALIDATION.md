# OpenLens DevOps Revival — R5-07F Validation

## Detached terminal lifecycle fix

- Date: 2026-10-22
- Base: `8ed3468` (R5-07)
- Build: `scratchpad/r507f-build/out/mac-arm64/OpenLens DevOps.app` (ARM64, unsigned), `app.asar` sha256 `7fd9272d0a4ec5bdb296e9b496cc6d5ad09c4ab1e50dc950f89adcfb218b452f`
- Verdict: **done** — navigating away and back (and a cluster-frame reload) keeps one PTY and the detached placeholder; redock recovers the same PID/tty.

## Root cause (demonstrated, packaged R5-07 release, synthetic DEV cluster)

One instrumented run per variant (`detach -> leave -> back -> redock`), recording cluster-frame identity (a marker set on the frame's
`window`), dock tab ids, persisted dock storage and Main's PTY log lines.

| Variant | Cluster frame | Dock tabs | Placeholder after return | PTYs started | PID/tty docked → detached → redocked |
|---|---|---|---|---|---|
| Preferences and back | same (not remounted) | unchanged | yes | 1 | 85922 / ttys004 (no redock step) |
| Catalog and back | same | unchanged | yes | 1 | 90057 → 90057 → 90057 / ttys004 |
| Cluster-frame reload | **reloaded** | unchanged (persisted) | **no** | 1, Main **refused 2 extra consumers** | 92387 → 92387 → 92387 / ttys004 |

Findings:

1. Navigating to Preferences or Catalog does **not** remount the cluster frame and does **not** lose the detached state. The "second shell"
   recorded in R5-07 was the reproduction harness clicking the first dock tab after returning: the dock's default tab `terminal`
   (terminalId `<cluster>:terminal`), a different session. Main logged it as a new PTY for that id, never for the detached tab.
2. The real defect is on a **cluster-frame reload**: which terminal tabs are detached lived only in the frame's memory
   (`detached-terminal-tabs` map). Nothing rebuilt it from Main, so the reloaded dock rendered a live terminal pane for the detached tab
   and kept trying to connect it. Main's handover hold (R4-06B) refused each attempt ("refusing a second consumer"), so no second PTY was
   spawned, but the placeholder and its Redock button were gone. Logs already had this hydration (R4-06A); the terminal never got it.

## Fix

Main stays the authority. On cluster-frame start the frame asks Main which of **its own cluster's** tabs are detached and marks the
terminal ones before the dock renders.

| Area | File | Change |
|---|---|---|
| Main | `main/detached-tool-windows/detached-tool-session-manager.ts` | `listDetached` also returns terminal windows (ids only; still scoped to the sender frame's cluster, no payload) |
| Contract | `common/detached-tools/detached-tool-channels.ts` | `DetachedTabsResult` tool kind includes `"terminal"` |
| Renderer | `renderer/components/dock/terminal/setup-detached-terminal-redock-listener.injectable.ts` | after registering the redock listener, `await` Main's list and mark terminal tabs `"detached"`; skips tabs already known or redocked/exited while the request was pending; flag OFF never asks; Main errors keep the old behaviour |
| Dock view | `renderer/components/dock/terminal/view.tsx` | `componentDidMount`/`componentDidUpdate` do not connect while the tab is detached/ended (after the PROD gate, unchanged); redock connects through the existing path |
| Tests | `main/.../__tests__/detached-tool-session-manager.test.ts`, new `renderer/components/dock/__test__/r5-07f-detached-terminal-hydration.test.ts`, new `r5-07f-terminal-window-detached.test.tsx` | terminal listing per cluster; hydration, flag OFF, unreachable Main, redock-while-pending; no dock connect while detached, one connect after redock |

The runnable is on `beforeClusterFrameStartsSecondInjectionToken`, which `start-frame` awaits, so the dock never renders before hydration.
Hydration never spawns, resumes or kills a PTY. After an app restart Main owns no windows, so nothing is re-marked or re-activated.
The dock view does not open a websocket for a tab Main owns, so a reloaded frame no longer probes Main's handover guard.
Unchanged: xterm, shell session / handover, terminal bridge and manager, IPC sender validation, PROD gate, theme sync, DockStore, logs.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit -p packages/core` | clean |
| ESLint (5 changed files) | clean |
| Hydration regression test, original injectable restored temporarily | 3 failed, 1 passed (only "flag OFF" passes); after the fix 4 passed |
| Dock-view regression test, original `view.tsx` restored temporarily | fails (`connect` called once while detached); after the fix passes |
| Jest: dock, detached-tool-windows, detached-tools | 28 suites, 267 tests pass |
| Builds | 2 (second adds the dock-view guard; first deleted) |
| Packaged: Preferences and back | same frame, placeholder shown, 1 PTY; PID 56106 / ttys004 docked = detached = redocked |
| Packaged: cluster-frame reload | frame reloaded, placeholder shown (was missing before), 1 PTY, 0 refused consumers (2 on the first build); PID 58160 / ttys004 docked = detached = redocked |

## Pending / risks

- A tab whose shell exited while detached and whose window is still open is re-marked `"detached"` (not `"ended"`) after a frame reload;
  the placeholder still offers Redock, which closes the window. Main's list carries no exit state.
- The dock's default `terminal` tab is a separate session by design; opening it after detaching another terminal starts its own shell.
- PROD detached terminal still not exercised end to end (the PROD gate must be accepted first; not allowed in this lab).
