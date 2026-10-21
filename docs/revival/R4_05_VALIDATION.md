# OpenLens DevOps Revival — R4-05 Validation Report

## Secure multi-cluster Port-Forward Manager (stage 1 + stage 2)

- Branch: `feat/r4-workspace-security`
- Base: `97ca67a340f46e729dbbb842ac375e02ca214695` (R4-05 stage 1, fail-closed cluster context in the renderer store)
- Scope of this report: R4-05 stage 2 (Main-process PROD gate, fixed loopback bind, start/stop lifecycle, concurrency, error reporting in the UI).
- Date: 2026-10-21
- Previous (stage 1, pre stage 2) version of this file was backed up outside the repository before being rewritten.

## 1. Files changed (stage 2)

Main process (`packages/core/src/main/routes/port-forward/`):

| File | Change |
|---|---|
| `functionality/port-forward.ts` | Bind address fixed to `127.0.0.1` (no caller-provided address); classified start failures (`PORT_IN_USE`, `PREMATURE_EXIT`, `UNEXPECTED_BIND_ADDRESS`, `START_FAILED`); child `exit`/`error` (incl. `ENOENT`) fails `start()`; failed starts are removed from the registry and only the own child is killed; `stop()` SIGTERM → 3 s → SIGKILL → 2 s. |
| `functionality/port-forward.test.ts` | Rewritten for the new contract (incl. `ENOENT`). |
| `functionality/stop-port-forwards-on-quit.injectable.ts` | Awaits `stop()` of every own forward on quit (`Promise.allSettled`). |
| `functionality/stop-port-forwards-on-quit.test.ts` | Quit lifecycle tests. |
| `start-port-forward-route.injectable.ts` | Cluster identity check, port validation, in-flight request coalescing, PROD confirmation in Main with post-dialog revalidation (same cluster object, same environment id, forward not created meanwhile), diagnostic port pre-check, error body `{ error: { message, code } }`. |
| `start-port-forward-route.test.ts` | New: route, concurrency and revalidation tests. |
| `confirm-production-port-forward.injectable.ts` | New: native `dialog.showMessageBox` (Cancel default) parented to a visible window; any failure ⇒ not confirmed. |
| `confirm-production-port-forward.test.ts` | New. |
| `get-dialog-parent-window.injectable.ts` | New: focused or first visible, non-destroyed window. |

Renderer (`packages/core/src/renderer/`):

| File | Change |
|---|---|
| `port-forward/port-forward-store/port-forward-store.ts` | Records the start failure code/message; `describeStartFailure()` gives readable `PROD_DECLINED` / `PORT_IN_USE` messages that keep the code visible. |
| `port-forward/__tests__/port-forward-store.test.ts` | Failure description tests added. |
| `port-forward/port-forward-dialog.tsx` | PROD warning, "Confirm & Start (PROD)" label, read-only bind address hint, failure messages. |
| `components/network-port-forwards/port-forwards.tsx` | Environment badges in the manager list. |
| `components/network-port-forwards/port-forward-menu.tsx` | Failure messages. |
| `components/workloads-pods/pod-container-port.tsx` | Failure messages. |
| `components/network-services/service-port-component.tsx` | Failure messages. |

Plus this document.

## 2. Static checks and unit tests

All commands run in `packages/core` with Node v20.20.2.

| Gate | Result |
|---|---|
| `tsc --noEmit -p tsconfig.json` (full project) | exit 0, 0 errors |
| `eslint --max-warnings 0` on the 16 code/test files above | exit 0, 0 errors, 0 warnings |
| `git diff --check` on the R4-05 paths | exit 0 |
| Jest `--ci`, R4-05 suites only (5 suites) | 5/5 suites, **113/113 tests** |
| Jest `--ci`, R4-05 + regressions (29 suites) | 29/29 suites, **320/320 tests**, 8/8 snapshots, none written |

The 29-suite run covers: the 5 R4-05 suites (route, PROD confirmation, port-forward process incl. port-in-use and premature exit, quit lifecycle, store incl. concurrent requests and failure messages); cluster/tool context (`tool-context`, `environment-types`, `workspace-contracts`); R4-03 (`workspace-history`, `workspace-persistence-store`); R4-02 workspace tabs and multi-cluster isolation; R4-04 editor, logs and terminal suites; `keyboard-shortcuts` (16/16).

Isolated-tree check: a detached worktree at `97ca67a` containing only the 17 files of this commit gave the same results (build 40/40, `tsc` 0 errors, ESLint 0/0, Jest 29/29 suites, 320/320 tests), so the commit does not depend on other uncommitted changes.

Not executed here: the 27 legacy suites inherited from R3. No claim is made about them.

## 3. Packaged-app E2E

### Binary

- Built with `lerna run build --skip-nx-cache` (40 projects, exit 0) from the working tree described in section 1.
- Packaged with `electron-builder --publish never --mac dir --arm64 -c.mac.identity=null` (exit 0, unsigned).
- Electron 22.3.3, Mach-O 64-bit arm64.
- `Contents/Resources/app.asar` SHA-256: `38ef3f040924dc7d8f557ccf645f3246cee361b0565d3f2c5fe1661e64aa66ba`

### Isolation

- Temporary `HOME`, `CICD` (app data) and `KUBECONFIG` per run; proxy env vars cleared.
- Synthetic Kubernetes API (`fake-k8s-api.js`, 127.0.0.1, pod `default/web-0`, service `default/web`).
- Simulated `kubectl` (`fake-kubectl.js`) configured via `kubectlBinariesPath`, `downloadKubectlBinaries: false`. It logs every start/SIGTERM/EADDRINUSE/bad-address event and refuses any `--address` other than `127.0.0.1`.
- Two clusters from one synthetic kubeconfig: `dev-synthetic` (`development`) and `prod-synthetic` (`production`, explicit — never inferred from the name).
- No real cluster, no `~/.kube`, no user credentials.
- The Main-process `dialog.showMessageBox` is replaced from the test via `electronApp.evaluate` (calls recorded, response 0 = Cancel, 1 = Start). No real native dialog was shown.

### Harness fixes made during stage 2 (test code only)

1. The previous run hung because `firstWindow()` returned the splash window (which closes), and on that error path the synthetic API child process was never killed, keeping Node alive. The harness now waits for the `https://lens.app` window and kills its children in `finally`/on exit.
2. Main-process stdout/stderr is captured to `main-process.log` for diagnosis.

### Results (final binary)

| ID | Scenario | Result | Evidence |
|---|---|---|---|
| S1 | DEV start/stop from the pod container port | PASS | kubectl `start` → row Active → Stop → `sigterm`, process gone |
| S2 | Alternative entry points: service port, manager menu Start/Stop | PASS | `service/web` start; manager Stop → `sigterm`; manager Start → new start |
| S3 | PROD requires the Main native dialog on every path (pod, service, manager) | PASS | dialog called each time, `detail` names `prod-synthetic`, buttons `["Cancel","Start port-forward"]` |
| S4 | PROD cancel starts nothing | PASS | no `start` event; notice "…was not confirmed, nothing was started (PROD_DECLINED)"; row not Active |
| S5 | PROD accept starts only the confirmed operation | PASS | exactly one new `start`, for the confirmed target only |
| S6 | Port in use: correct error, external process not killed | PASS in 2 of 3 runs, see below | holder process alive and accepting; notice "Local port N is already in use … (PORT_IN_USE)"; no kubectl event; Main log `[PORT-FORWARD-ROUTE]: port N is already in use` |
| S7 | Bind only on 127.0.0.1 | PASS | kubectl args include `--address 127.0.0.1`; `lsof` shows only `127.0.0.1:<port> (LISTEN)` |
| S8 | Restart does not auto-start | PASS | relaunch with same profile: 0 new starts, 0 kubectl processes, rows `Disabled` |
| S9 | App close terminates own kubectl processes | PASS | `fake-kubectl` pids before close `[2 pids]`, after close `[]`; Main log "Stopping all active port forwards on backend quit" |
| S10 | DEV/PROD isolation | PASS | DEV forward Active while PROD manager shows 0 rows; 0 PROD-dialog calls for DEV actions |
| S11 | Classic shell: no unexpected errors | FAIL (strict), inherited | 0 errors during use; 4 `PAGEERROR illegal access` only during `app.close()`. The same 4 errors occur with the integration baseline binary without stage 2 (`bc60ec4`), so they are not introduced by R4-05. Not filtered out. |

S6 intermittency: in one of three full runs on the final binary the PORT_IN_USE notice was not observed within 20 s (screenshot showed the pod drawer, no notice, no kubectl event; the holder was not affected). Main-process log capture was added after that run; the S6 root cause of that single miss is **not established** (harness timing vs. notification display). It must not be read as a verified pass for every run.

### Processes

- Before each run: no `fake-kubectl`, `fake-k8s-api` or app processes.
- Before close: own kubectl children present (listed in run logs).
- After each run: `pgrep -f fake-kubectl.js`, `pgrep -f fake-k8s-api.js` and the app path return nothing.

### Logs and screenshots

Kept outside the repository in the session scratchpad (`r405-e2e/out-final*/`: `run.log`, `main-process.log`, `fake-kubectl-*.log`, `proc-*.txt`, `S7-lsof.txt`, `S11-console-errors.txt`, `S*-*.png`). They are not committed.

## 4. Concurrency and error handling (unit-level evidence)

- A: identical simultaneous start requests share one in-flight promise — one process.
- B: after the PROD dialog the route re-checks cluster identity (same object from the cluster store), environment id, port validity and whether a ready forward appeared meanwhile.
- C: `ENOENT`, `PORT_IN_USE`, premature exit and an unexpected bind address reject `start()`, remove the entry from the registry, kill only the own child, and never leave a false Active.
- D: the renderer shows readable `PROD_DECLINED` / `PORT_IN_USE` messages with the code kept visible.

## 5. Residual risks

1. **Inherited, critical, unresolved: the local Lens proxy does not authenticate clients.** The cluster is selected from the `Host` subdomain and `Host`/`Origin` can be forged by any local HTTP client. Any local process can reach the port-forward routes. The Main-process PROD dialog mitigates accidental or unauthorized starts through the normal path; it does **not** protect against a compromised renderer (main window runs with `nodeIntegration: true`, `contextIsolation: false`). A per-session capability (≥256-bit) and renderer isolation require coordination with R4-01. The global proxy was not modified.
2. Orphaned kubectl processes after an app crash are not reclaimed (no PID-file cleanup; deferred by decision).
3. A bind address announcement that changes after readiness is not re-validated.
4. S6 single intermittent miss (section 3).
5. Pod drawer button after reopening with an existing forward shows "Forward…" instead of "Stop/Remove" (lookup uses `forwardPort = 0`); observed during E2E, not introduced by stage 2 and not changed here.
6. The PROD flow asks twice by design (renderer "Confirm & Start (PROD)" then the native Main dialog); only the Main dialog is the security control.

## 6. Simulator scope

The simulated kubectl only reproduces the process/port contract (arguments, readiness line, EADDRINUSE stderr, SIGTERM). It does **not** exercise real SPDY/WebSocket port-forwarding, pod connectivity, authentication or RBAC. The native dialog UI itself is stubbed. These results do not certify integration with a real Kubernetes API.
