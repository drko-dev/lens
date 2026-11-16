# H7.6.3D — Terminal with stable PTY session in Global Docking
Objective: docked Terminal keeps one PTY session across move/collapse/tab; PROD authorization lives outside React; explicit close releases once.
Branch: feature/global-docking-h7 | Delivery: one local commit, no push | Runner: jest (packages/core) + Playwright (open-lens)

## Specs
S1. Stable session id `docked-terminal:<clusterId>:<uuid>` created only by an explicit user action (catalog "Terminal"); never by navigation.
S2. PTY owner stays in main (`shellSessionProcesses`, key `<clusterId>:<tabId>`) and TerminalStore in the renderer; no second manager.
S3. Moving, collapsing, switching tabs never creates a PTY, never kills it, never duplicates output.
S4. PROD: pending / authorized(sessionId+clusterId) / started / ended are separate; remount does not re-ask; another session or cluster never inherits it; TerminalStore.connect refuses an unauthorized PROD session.
S5. Explicit close (after confirmation) destroys the session exactly once and revokes its authorization; Disconnect leaves no orphan PTY.
S6. Resize never sends invalid dimensions to the PTY (collapsed/hidden panel).
S7. Reuse the original TerminalWindow. No native detach. No Kubetail/H7.7.
S8. Unit tests RED->GREEN + Playwright TM01-TM12, then full regression (target 146).

## Tasks
- T1 (S4) PROD authorization store + view.tsx + connect gate + clearer — inline — pending
- T2 (S6) fit/size guards — inline — pending
- T3 (S1,S3,S5) openTerminalPanel + BoundTerminal + resolver + catalog + release/confirm — inline — pending
- T4 (S8) TM01-TM12, build, regression — inline — pending
- T5 docs + commit — inline — pending

## Log
L1. Original request: prompt "H7.6.3D: Terminal con sesión PTY estable" (see conversation).
L2. Audit (Opus): PTY owned by main; xterm+websocket in renderer TerminalStore survive remount; isProdConfirmed is a TerminalWindow instance field (re-asks on remount, leaks across tabs since Dock does not key the component); no PTY kill on Disconnect; FitAddon clamps a hidden panel to 2x1.
