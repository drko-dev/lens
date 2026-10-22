# OpenLens DevOps Revival — R4-06 Validation Report

## Detached tool windows

- Branch: `feat/r4-workspace-security`, base `75abba6a9f69434f14828de2f9a9ab86d47f5784`
- Date: 2026-10-21
- Architecture: see `R4_06_ARCHITECTURE.md`.
- Verdict (R4-06A): **logs and inspector verified in the packaged app, 13/13 scenarios PASS on the final binary, including 10/10 stability iterations and cluster-frame reload.** The spontaneous redock is mitigated (section 4); its trigger is inferred, not reproduced.

## 1. Files

Main (`packages/core/src/main/detached-tool-windows/`): `detached-window-registry.ts`, `detached-window-registry.injectable.ts`, `detached-window-ipc.ts`, `open-detached-tool-window.injectable.ts`, `detached-tool-session-manager.ts`, `detached-tool-session-manager.injectable.ts`, `setup-detached-tool-ipc.injectable.ts`, `stop-detached-tool-sessions-on-quit.injectable.ts`; tests `__tests__/detached-window-registry.test.ts`, `__tests__/detached-window-ipc.test.ts`, `__tests__/open-detached-tool-window.test.ts`, `__tests__/detached-tool-session-manager.test.ts`.

Common: `packages/core/src/common/detached-tools/detached-tool-channels.ts`, `detached-tool-windows-feature-flag.injectable.ts`.

Renderer: `packages/core/src/renderer/components/dock/logs/detach-logs-controls.tsx`, `detached-logs-tabs.injectable.ts`, `setup-detached-logs-redock-listener.injectable.ts`, `detached-logs-hydration.injectable.ts`, `view.tsx` (modified); `packages/core/src/renderer/components/kube-object-menu/detach-inspector-menu-item.tsx`, `kube-object-menu.tsx` (modified, 2 lines); test `packages/core/src/renderer/components/dock/__test__/r4-06-detached-logs.test.tsx`.

Test DI: `packages/core/src/main/getDiForUnitTesting.ts` (modified: overrides for the two new side-effect injectables).

Static: `open-lens/static/detached-tool.html`, `detached-tool.css`, `detached-tool-preload.js`, `detached-tool-renderer.js`.

Docs: `docs/revival/R4_06_ARCHITECTURE.md`, `docs/revival/R4_06_VALIDATION.md`.

## 2. Static checks and unit tests

Node v20.20.2, run in `packages/core`.

| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.json` (full project) | exit 0, 0 errors |
| `eslint --max-warnings 0` on the 22 R4-06 TS/TSX files | exit 0 |
| `git diff --check` on modified tracked files | exit 0 |
| Jest `--ci`, isolated tree (`75abba6` + R4-06A files only): `common/cluster`, `common/workspace`, `features/workspace-tabs`, `main/__test__`, `main/detached-tool-windows`, `main/mcp`, `secure-pilot-window`, `main/shell-session`, `main/routes/port-forward`, `renderer/api`, `renderer/components/dock`, `renderer/components/kube-object-menu`, `renderer/port-forward` (R4-01…R4-06 suites plus dock/shell regressions) | 54/54 suites, 557/557 tests, 7/7 snapshots, none written |
| Monorepo build (isolated tree, R4-06A only) | 40/40 projects, exit 0 |

Unit coverage: flag OFF refuses (Main and UI); forged sender / unregistered frame / forged ids rejected; one owner per session (second detach focuses the owner, no second stream); stream aborted on close, redock, crash and quit; redock notifies only the originating cluster frame; inspector uid mismatch; DEV/PROD homonym isolation; terminal refused; a redock restating its own identity is accepted immediately; `frame-list-detached` returns only the sender cluster's tabs and rejects a bad sender or payload; hydration marks Main-owned tabs before logs load, with flag-OFF and Main-failure fallbacks.

The real log-stream wiring (HTTPS to the kube-auth-proxy) is mocked in unit tests; it is covered only by the packaged E2E.

## 3. Packaged-app E2E

### Binary

- Built in an isolated tree: `git worktree` at `75abba6` plus the R4-06A files only (no R4-06B code). Monorepo build 40/40 projects, exit 0; `electron-builder --mac dir --arm64`, unsigned, exit 0; Electron 22.3.3, arm64.
- `app.asar` SHA-256: `f13e496bd7faf3a683079ba2ec09a8116fc8efde5db2508b1ceb997a1b87a0ba`

### Isolation

Temporary `HOME`, `CICD`, `KUBECONFIG`; proxy env cleared. Two synthetic Kubernetes APIs on 127.0.0.1 (one per cluster: `dev-synthetic` development, `prod-synthetic` production) emitting distinct `DEV-LINE n` / `PROD-LINE n` follow logs and exposing open/total follow-stream counters. No real cluster, no `~/.kube`.

### Defect found and fixed during E2E

An earlier binary (asar `3fba5b69…`) did not close the Main-owned follow stream on redock or window close: the stream went through the local lens proxy, so aborting the Main request did not close the upstream connection. Main now calls the cluster's kube-auth-proxy directly (`https.request`, proxy CA, `agent: false`; without `agent: false` TLS failed with `DEPTH_ZERO_SELF_SIGNED_CERT` inside the app).

### Results (single full run on `f13e496b…`)

| ID | Scenario | Result |
|---|---|---|
| D1 | Flag OFF: no detach controls, no windows | PASS |
| D10 | Flag OFF: classic dock logs stream normally | PASS |
| D2 | Logs detach (DEV): lines grow in the window; dock placeholder; dock stopped polling; 1 Main stream; PROD API untouched | PASS |
| D4 | Redock button: window closes, dock resumes, Main stream closed (open 1 → 0) | PASS |
| D5 | OS window close: same as redock (open 1 → 0) | PASS |
| D6 | No Node in the detached renderer: `typeof require/process/module` = `undefined`, bridge = object | PASS |
| D3 | No duplicates: reopening logs keeps 1 window, no extra stream | PASS |
| D11 | Stability: 10 detaches, 5 s each with no action: 10/10 windows stayed open, no `redock requested`, 1 stream each, 0 after each redock | PASS |
| D12 | Legitimate Redock clicked immediately after the window opens: window closes at once, Main logs one `redock requested`, no request is ignored, open streams 0 | PASS |
| D13 | Cluster-frame reload while detached: placeholder restored, window stays, open streams stay 1, dock does not poll; after redock open 0 and dock polls again | PASS |
| D8 | Inspector (DEV pod `web-0`): JSON with the DEV uid, refresh, redock | PASS |
| D7 | PROD logs: only `PROD-LINE`, PROD badge + production banner, DEV API untouched | PASS |
| D9 | App close with an active PROD window: open streams → 0 on both APIs, 0 app processes | PASS |

Console: 17 messages, all the same Chromium notice that the `frame-ancestors` CSP directive is ignored in a `<meta>` element (harmless; the page cannot be framed anyway because navigation and `window.open` are blocked). No surviving app or synthetic-API processes.

## 4. Spontaneous redock: diagnosis and mitigation

Earlier binaries sometimes redocked a window 0.7–1.6 s after opening with no test action. Main logged `redock requested`, which only the page's Redock `click` emits. About 30 diagnostic iterations did not reproduce it. The one anomalous instrumented run showed the Redock button receiving keyboard focus 27 ms after opening (no pointer input) and then trusted key events not sent by the harness. Inferred trigger: the new window takes OS focus while the user is typing elsewhere, and Enter/Space activates the only focusable control.

Mitigation in this change: Initial focus goes to the page body (`tabindex="-1"`), not to Redock; Tab still reaches the button.

An earlier version of this change also made Main ignore any redock in the first 2.5 s after opening; it was removed because it also blocked legitimate immediate Redocks. Redock is now accepted as soon as it is requested (sender, frame, document and identity checks unchanged). D11 (10/10 windows stable for 5 s with no action) and D12 (immediate legitimate Redock works) verify the behaviour on the packaged app. The trigger itself remains an inference.

## 5. Cluster-frame reload

New allowlisted channel `detached-tool:frame-list-detached` (no payload). Main derives the cluster from the sender frame and returns only that cluster's detached tabs. `detached-logs-hydration.injectable.ts` asks once at frame start; `view.tsx` waits for the answer before loading logs, so a reloaded frame does not open a second stream (D13). If Main is unreachable, the dock owns the stream as before; with the flag OFF Main is never asked.

## Limitations of the synthetic tests

- Kubernetes APIs are local synthetic servers: no real apiserver, RBAC, admission, network latency or TLS from a real cluster. Log streams, discovery and the inspector GET are exercised only against them.
- The terminal E2E uses the local shell with a temporary `HOME`; node and pod shells (which need a reachable cluster) are covered only by unit tests.
- Windows run on the live macOS desktop of the build machine; focus-stealing behaviour depends on the window server and was reproduced only indirectly (section 4).
- Unsigned build (`mac.identity=null`); signing, notarization and Gatekeeper are not exercised.

## 6. Residual risks

1. Spontaneous redock trigger inferred, not reproduced (section 4). If it recurs with initial focus on the body, it is another path; there is no time-based guard.
2. Terminal not implemented in this change (R4-06B).
3. Output produced while detached is not replayed in the dock after redock.
4. `workspaceId` is always `"default"`.
5. Inherited and unchanged: the local lens proxy has no client authentication. The R4-06 log stream does not use it, but the inspector GET goes through `k8sRequest` (lens proxy) from Main.
6. Synthetic APIs only; real apiserver/RBAC behaviour not exercised.
