# OpenLens DevOps Revival — R4-06 Architecture

## Detached tool windows (logs, resource inspector, terminal)

- Branch: `feat/r4-workspace-security`, base `75abba6` (R4-01…R4-05 consolidated).
- Status: logs and read-only resource inspector are wired end to end behind a feature flag (default OFF). Terminal is implemented with PTY handover (section 5).
- The previous stage-1 version of this document (Main infrastructure only) was backed up outside the repository before being rewritten.

## 1. Decision: sandboxed window, data brokered by Main

Two designs were possible:

| Option | Description | Verdict |
|---|---|---|
| A | Open the existing cluster-frame renderer (`https://<clusterId>.lens.app:<port>`) in a new window and render only one dock tool | Rejected: the cluster-frame renderer requires `nodeIntegration` (it calls `ipcRenderer` and Node APIs directly). It would violate "no Node access in the detached renderer". |
| B | Keep the detached window sandboxed and node-less; Main owns the data session and pushes data over allowlisted, sender-validated IPC bound to the registry identity | **Chosen** |

Consequences of B: the detached UI is a small static page (`open-lens/static/detached-tool.*`), not the React dock UI. The window never chooses the cluster, namespace or object; Main uses only the registered descriptor.

## 2. Components

### Feature flag

`common/detached-tools/detached-tool-windows-feature-flag.injectable.ts` — `DetachedToolWindowsFeatureFlag`, default OFF. Enabled with `--enable-detached-tools` or `OPENLENS_DETACHED_TOOLS=1|true`. OFF ⇒ no detach controls in the UI and Main refuses detach requests. The classic dock is unchanged.

### Main process (`main/detached-tool-windows/`)

| File | Role |
|---|---|
| `detached-window-registry.ts` (+ `.injectable.ts`) | Ownership: one window per `sessionKey = clusterId/workspaceId/tabId/toolKind`; second request focuses the owner; immutable identity; max 16 windows; `authorize()` compares identity. |
| `detached-window-ipc.ts` | Window ↔ Main channels (`get-context`, `request-redock`, `start`, `refresh`) via `ipcMain.handle`; the sender must be a registered `webContents`, its `mainFrame`, on the packaged `detached-tool.html`. Main → window events on one fixed channel. |
| `open-detached-tool-window.injectable.ts` | `BrowserWindow` factory: `sandbox`, `contextIsolation`, no `nodeIntegration`, `webSecurity`, no devtools/webview, separate in-memory partition with all permissions denied, navigation and `window.open` blocked. Per-window hooks `onStart`, `onRefresh`, `onClosed` (fired after registry release on redock, OS close or renderer crash). |
| `detached-tool-session-manager.ts` (+ `.injectable.ts`) | Core: strict payload parsing; resolves the requesting cluster frame from `(processId, frameId)` using Main's `clusterFrames` map and applies `assertToolActionClusterContext` against the requested `clusterId`; owns at most one data session per `sessionKey`; aborts on close/redock/crash; notifies only the originating cluster frame on close. |
| `setup-detached-tool-ipc.injectable.ts` | Registers the cluster-frame → Main channels (`frame-request-detach`, `frame-request-redock`). |
| `stop-detached-tool-sessions-on-quit.injectable.ts` | Aborts every session on app quit. |

Data access from Main:

- **Logs**: `GET /api/v1/namespaces/{ns}/pods/{pod}/log?follow=true&container=…&tailLines=…` sent with `https.request` directly to that cluster's kube-auth-proxy (`kubeAuthProxyServer.getApiTarget(true)`: host, port, path prefix, proxy CA, `Host` header; `agent: false` as `http-proxy` does). Aborting the controller destroys the response and closes the upstream follow connection. It does not go through the unauthenticated local lens proxy.
- **Inspector**: API discovery for the group/version, then a single GET through the existing `k8sRequest`. The object's `metadata.uid` must equal the uid captured at detach time; on mismatch an error is shown and no data is sent. `managedFields` and the last-applied annotation are stripped; Secret `data`/`stringData` are redacted. Refresh is on demand, throttled to 2 s; no writes.

### Renderer (cluster frame)

| File | Role |
|---|---|
| `dock/logs/detach-logs-controls.tsx` | "Detach" button on a logs tab (flag ON only); stops the dock's own log loading **before** asking Main, marks the tab detached; placeholder "Detached — Redock". |
| `dock/logs/detached-logs-tabs.injectable.ts` | Observable set of detached tab ids (per cluster frame). |
| `dock/logs/setup-detached-logs-redock-listener.injectable.ts` | On Main's redock notice for this cluster frame, clears the detached state; the dock resumes loading. |
| `dock/logs/detached-logs-hydration.injectable.ts` | At cluster-frame start asks Main (`frame-list-detached`) which of this cluster's tabs are detached and marks them before any log loading. |
| `dock/logs/view.tsx` | Waits for hydration, does not load logs while the tab is detached; shows the placeholder. |
| `kube-object-menu/detach-inspector-menu-item.tsx` (+ 2 lines in `kube-object-menu.tsx`) | "Inspect (detached)" item (flag ON only). |

### Detached page (`open-lens/static/`)

`detached-tool.html` (strict CSP meta: `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; …`), `detached-tool.css`, `detached-tool-preload.js` (`contextBridge` → `lensDetachedTool` with `getContext`, `requestRedock`, `start`, `refresh`, `onEvent`), `detached-tool-renderer.js` (renders with `textContent` only, max 5000 lines, auto-scroll; environment badge with PROD highlighted and a production banner).

## 3. Lifecycle

1. Dock (flag ON) → stop own stream → mark detached → `frame-request-detach` (cluster frame, validated by Main).
2. Main → registry `register` (or focus existing owner) → open window.
3. Page → `get-context` → `start` → Main opens the single data session and pushes events.
4. Redock (page button, OS close, crash) → window `closed` → registry release → `onClosed`: abort session, notify the originating cluster frame → dock clears detached state and reloads.
5. App quit → abort all sessions.

## 4. Guarantees and how they are enforced

| Guarantee | Mechanism |
|---|---|
| Exact cluster identity | Cluster resolved from the sending frame in Main + `assertToolActionClusterContext`; descriptor is immutable; the window cannot pass ids that change the target |
| No duplicate log streams | Dock stops before detach; one session per `sessionKey`; `start` aborts a previous session first |
| Redock is real | Ownership returns to the dock, which resumes; not just a window close |
| Cleanup | Abort on close/redock/crash/quit |
| No Node in the detached renderer | `sandbox` + `contextIsolation` + no `nodeIntegration`; verified in the packaged app (`typeof require/process/module` = `undefined`) |
| IPC allowlist | Fixed channels, sender/frame/document checks, strict payload parsing |
| Flag OFF by default, classic fallback | Flag checked in renderer and Main |

## 5. Terminal (R4-06B): PTY handover

Main already owns every PTY (`shellSessionProcesses`, `terminalId = <clusterId>:<tabId>`). Detaching moves its single consumer from the dock websocket to a sandboxed window; the PTY is never respawned or killed by the handover.

| File | Role |
|---|---|
| `common/terminal/detached-terminal-channels.ts` | Channels, limits, notice types. |
| `main/shell-session/shell-session-handover.injectable.ts` | Set of PTYs held by a detached window; registers the current dock consumer so Main can close it. |
| `main/shell-session/shell-session.ts` (+ the three `open.injectable.ts`) | While a PTY is held: a websocket close never kills it, its data listener is disposed, and a second dock websocket is refused with private close code 4001 (`DetachedHandover`) without spawning. 4001 is not 1000, so the dock does not treat it as "shell exited". |
| `main/detached-tool-windows/terminal/detached-terminal-bridge.ts` | Window ↔ PTY bridge: never spawns or kills; buffers output until the page starts (256 KiB cap); validates input and resize. |
| `main/detached-tool-windows/terminal/detached-terminal-manager.ts` (+ `.injectable.ts`) | Policy: flag, cluster resolved from the sender frame + `assertToolActionClusterContext`, environment from cluster preferences, PROD confirmation, sender validation; sandboxed window, own partition and preload, CSP, no devtools. |
| `main/detached-tool-windows/terminal/confirm-production-terminal-detach.injectable.ts` | Native dialog for PROD; Cancel is default and cancel id; any failure means declined. |
| `main/detached-tool-windows/terminal/setup-detached-terminal-ipc.injectable.ts` | IPC registration. |
| `renderer/api/terminal-api.ts` | `suspend()` / `resume()`: no connect or auto-reconnect while detached. |
| `renderer/components/dock/terminal/{detach-terminal-controls.tsx, detached-terminal-tabs.injectable.ts, setup-detached-terminal-redock-listener.injectable.ts, view.tsx}` | Detach button (flag ON only), placeholder, resume on redock. |
| `open-lens/static/detached-terminal.{html,css}`, `detached-terminal-preload.js` (`lensDetachedTerminal`), `detached-terminal-renderer.js` | Sandboxed page. |
| `open-lens/static/vendor/xterm/` | xterm 4.19.0 + xterm-addon-fit 0.5.0 with licenses, shipped as static files. |

Lifecycle: dock suspends its `TerminalApi` → Main (PROD: native confirmation first) holds the PTY and closes the dock websocket with 4001 → window attaches to the same PTY. Redock or OS close: Main releases the PTY, notifies the originating cluster frame, the dock resumes and reconnects to the same `terminalId`. `exit` in the window ends the shell and shows "session ended". App quit kills PTYs as before.

## 6. Known limitations

- `workspaceId` is always `"default"` (the renderer has no real workspace id yet).
- Output produced while detached is not replayed in the dock after redock; the dock reloads from `tailLines`.
- The cluster name shown in the window header is derived from the window title.
- Terminal: screen content produced while detached is not replayed in the dock beyond its last-data line; the shell is nudged with a resize.
- Terminal: closing the dock tab while detached leaves the PTY owned by the window until that window closes.
- Terminal windows share the registry's 16-window cap with logs and inspector windows.

## R4-06A: stabilization

### Spontaneous redock (defect): initial-focus fix, trigger inferred
- Only path that logs "redock requested by window N" is the page's `request-redock` IPC; dock-side redock (`frame-request-redock`) never logs it, so it was ruled out. Window-id reuse, IPC disposer race and re-render paths were audited in code: no path calls `onRedockRequested` without that IPC.
- Evidence: 30+ synthetic packaged-app iterations (open logs, detach, wait 3-5 s) with page probes produced 0 spontaneous closes and 0 untrusted clicks. One run showed the Redock button receiving keyboard focus at t=27 ms with no pointer input and trusted keydown/keyup events on it at 209-644 ms, i.e. external keystrokes reach a just-shown window whose only focusable control is Redock.
- Fix: the page puts initial focus on its body (`tabindex="-1"`), not on Redock, so stray Enter/Space keystrokes cannot activate it; Tab still reaches the button.
- An interim 2.5 s guard in Main that ignored any early redock was removed: it also blocked legitimate immediate Redocks. Redock is accepted as soon as requested; sender, frame, document and identity checks are unchanged.

### Frame reload
- New allowlisted frame channel `detached-tool:frame-list-detached` (no payload). Cluster is derived from the sender frame (`handleFrameListDetached`), only that cluster's windows are returned (`registry.windowsForCluster`).
- Renderer `detached-logs-hydration.injectable` asks once when the cluster frame starts (listener setup) and marks the tabs; the logs view waits for that answer before `reloadLogs`. Main unreachable: dock owns the stream as before. Flag OFF: never asked.
- Main already refuses a second detach for an owned sessionKey (focuses the owner); covered by a test.
