# OpenLens DevOps Revival — R4-09 Validation Report

## lens-k8s-proxy authentication, bounded fixes and Release 4 status

- Branch: `feat/r4-workspace-security`, base `f462d24` (R4-08).
- Date: 2026-10-22
- Verdict: bounded fixes A–E delivered and the port-forward S6 flake root-caused and fixed. **`lens-k8s-proxy` hardening is implemented but deferred** (development policy of 2026-10-22: personal use, functionality first): Main uses mutual TLS and stdin secrets only when the bundled binary is the patched OpenLens build; with the stock 0.3.0 binary shipped today it keeps the legacy launch, and the unauthenticated local access through `lens-k8s-proxy` remains an **accepted inherited risk, not a fixed vulnerability**. Renderer isolation is also deferred. Not committed.

## 1. Vulnerabilities

| ID | Finding (before) | Fix |
|---|---|---|
| V7 (critical, **accepted risk with the stock binary**) | `lens-k8s-proxy` (one per connected cluster, 127.0.0.1:random) was protected only by a 64-bit random path prefix, passed with the TLS server private key in the child's **environment** (`API_PREFIX`, `PROXY_KEY`, `PROXY_CERT`). Any process of the same user reads it with `ps eww <pid>` and then gets the Kubernetes API with the user's credentials attached by the proxy (reads 200, `exec` upgrade 101). The binary also printed the prefix on stdout. | Patched binary `0.3.0-openlens.1`: secrets read from **stdin**; it refuses to start from the legacy environment variables; it requires a **client certificate** (`RequireAndVerifyClientCert`) whose CA is Main's in-memory client certificate (private key never leaves Main); it no longer prints the prefix. Main detects the patched build (`lens-k8s-proxy version` → `*-openlens.N`), then presents the client certificate on every path (http-proxy target, upgrade `tls.connect`, detached pod-log stream) and refuses a patched build that does not announce `client authentication: required`. With the stock binary Main keeps the legacy environment launch and logs `stock lens-k8s-proxy without client authentication (accepted inherited risk)`. Effective only once the patched binary ships (section 2.4). |
| V8 (medium) | `cluster:set-frame-id` trusted its payload: any frame could register/overwrite any cluster's frame mapping. | Main accepts it only from a non-top frame whose origin is exactly `https://<clusterId>.lens.app:<port>`. |
| V9 (low) | Clusters removed by kubeconfig sync / store reload did not revoke their proxy token. | One reaction on the clusters state revokes the token of every cluster that disappears, whatever removed it. |
| V10 (low) | The proxy kubeconfig was rewritten in place (truncate + write) and rotation rewrites were not serialized: a reader could see a partial file, an older write could land after a newer one or after `clear()`. | Atomic replace (exclusive temp file 0600 + rename), serialized rewrites, a queued token that is no longer valid is never written, a file finished after `clear()` is removed. No grace period: the old token is invalid at rotation (rotation only happens on disconnect). |

## 2. lens-k8s-proxy audit

### 2.1 Facts

- Source: `github.com/lensapp/lens-k8s-proxy` (MIT, Go, 132-line `main.go` on top of `k8s.io/kubectl/pkg/proxy`); `Open-Lens/lens-k8s-proxy` v0.3.0 is identical. Bundled version: `k8sProxyVersion` 0.3.0.
- Started by Main (`main/kube-auth-proxy/create-kube-auth-proxy.injectable.ts`), one per cluster, lifecycle tied to the cluster connection (`kube-auth-proxy-server.injectable.ts`: `ensureRunning`/`restart`/`stop`).
- Listens on `127.0.0.1:0` (TLS); credentials: the user's kubeconfig/context (tokens, client certs, exec/auth plugins) attached by client-go to every proxied request, including `exec`/`attach`/`portforward` upgrades and log streams.
- Clients: LensProxy (`/api-kube` via http-proxy, upgrades via raw TLS), the detached pod-log windows (direct). kubectl/helm/shell go through LensProxy (R4-08 token), not directly.
- No client authentication mechanism in 0.3.0 (no token, no mTLS, no unix socket); the prefix was the only secret.

### 2.2 Evidence (synthetic API server, real binaries, probes from an unrelated local process)

Script: `scratchpad/r409/k8sproxy/audit2.js`.

| Probe | 0.3.0 (as launched by R4-08) | 0.3.0-openlens.1 (as launched by R4-09) |
|---|---|---|
| Prefix / server key in `ps eww` | visible / visible | not present / not present |
| Prefix on stdout | yes | no |
| No prefix, no cert | 404 | TLS `CERTIFICATE_REQUIRED` |
| Prefix read from `ps`, no cert | **200 Secret list, user credential attached** | prefix not discoverable |
| Right prefix, no cert | 200 | TLS `CERTIFICATE_REQUIRED` |
| Right prefix, look-alike self-signed cert | 200 | TLS `UNKNOWN_CA` |
| `exec` upgrade, no cert | **101** | TLS `CERTIFICATE_REQUIRED` |
| Legacy env-based launch | serves | refuses to start (exit != 0) |
| Legitimate client (Main's cert + prefix): read / exec | 200 / 101 | 200 / 101 |

Packaged app (R4-08 build `f8f0020a` vs R4-09 build, same E2E `r409-e2e.js`): R4-08 fails K1 (secrets in the proxy's environment) and K3 (reachable without a certificate); R4-09 passes both.

### 2.3 Threat model, stated plainly

- Closed: other local processes (same user or not) reaching Kubernetes through `lens-k8s-proxy` without Main's client key; browsers (no client certificate); discovery through process listings or stdout.
- Not closed by this change: a process of the same user can still read the user's own kubeconfig files from disk, or inspect Main's memory where the OS allows it; a compromised renderer (section 6). 127.0.0.1 and file modes are not treated as authentication.

### 2.4 Shipping the patched binary (deferred)

The binary is downloaded at build time (`open-lens/binaries`, git-ignored). Until a patched binary is produced by the build, Main runs the stock binary in legacy mode (no functional change, accepted risk). When hardening is resumed, options:

1. **Recommended:** vendor the patched source (`main.go`, `go.mod`, `go.sum`, LICENSE) under `open-lens/k8s-proxy/` and build it per platform in CI with a pinned Go version, publishing SHA-256s; `ensure-binaries` stops downloading `lens-k8s-proxy`.
2. Publish the patched binary from an OpenLens DevOps fork release and pin URL + SHA-256 in `ensure-binaries` (requires a push to an external repository).
3. Replace `lens-k8s-proxy` with an in-process proxy (client-go auth semantics, exec plugins, OIDC) — highest regression risk, not recommended for R4.

The patch is in `docs/revival/patches/lens-k8s-proxy-v0.3.0-openlens.1.patch` (against tag `v0.3.0`, commit `7e181aaa`; zero-context diff, apply with `git apply --unidiff-zero`; rebuilding from it reproduces the tested binary byte for byte). The prototype binary was built with `go build -trimpath -ldflags "-s -w -X main.Version=0.3.0-openlens.1"` (Go 1.27.1, darwin/arm64), SHA-256 `828fc8dfa0f01a7a9fd6805022992456c031f464a7e6c39893b03cf57e113a02`. Only darwin/arm64 was built and tested.

## 3. Bounded fixes

| Item | Files | Tests |
|---|---|---|
| A `cluster:set-frame-id` | `main/electron-app/runnables/setup-ipc-main-handlers/setup-ipc-main-handlers.ts` (+ injectable) | `__tests__/r4-09-set-frame-id.test.ts` (8): wrong origin, wrong port, other cluster's origin, top frame, no senderFrame, non-string payload, unknown cluster; own origin + reload |
| B revocation | `main/lens-proxy/revoke-proxy-tokens-of-removed-clusters.injectable.ts` | `__tests__/r4-09-revoke-removed-clusters.test.ts` (1) |
| C rotation | `main/kubeconfig-manager/kubeconfig-manager.ts` (+ injectable), `main/__test__/kubeconfig-manager.test.ts` | `kubeconfig-manager-rotation.test.ts` (7, real tmp dir) |
| D port-forward in-use detection | `main/routes/port-forward/functionality/is-local-port-in-use.ts`, `start-port-forward-route.injectable.ts` | `is-local-port-in-use.test.ts` (6 × 10 detections, real sockets: 127.0.0.1, ::1, ::, 0.0.0.0, no host, free) |
| E router test harness | `main/router/router.test.ts` (test DI override only) | 141/141 (was 0/141) |
| V7 Main side (compatible mode) | `main/kube-auth-proxy/create-kube-auth-proxy.injectable.ts`, `kube-auth-proxy-client-certificate.injectable.ts` (new), `lens-k8s-proxy-supports-client-auth.injectable.ts` (new), `main/cluster/kube-auth-proxy-server.injectable.ts`, `main/lens-proxy/proxy-functions/kube-api-upgrade-request.injectable.ts`, `main/detached-tool-windows/detached-tool-session-manager.injectable.ts` | `main/__test__/kube-auth-proxy.test.ts`: fixtures emit the patched binary's banner; 3 new tests (patched build: secrets only on stdin; stock binary: legacy launch kept; patched build without client auth refused) |

Port-forward D (detection gap): the old check (`tcp-port-used` connect to 127.0.0.1) missed holders on `::1`; bind-only probing misses wildcard holders on macOS (SO_REUSEADDR), so the check is the union of connect and bind probes on 127.0.0.1 and ::1, serialized. This is a real gap fix but was not the S6 cause.

Port-forward S6 (root cause): in the failing packaged runs kubectl was started with `0:80` (random local port) — the typed port never reached the request. `PortForwardDialog.onOpen` runs after the dialog contents render and reset `desiredPort` to the port-forward's current port (0), discarding a port typed in between. Fix: `renderer/port-forward/port-forward-dialog.tsx` keeps a port edited for the same dialog opening; test `renderer/port-forward/__tests__/r4-09-port-forward-dialog-open-race.test.ts` (2) fails without the fix and passes with it. Packaged: before 8/10 S6 (2 failures, both `0:80`), after 8/8.

## 4. Packaged E2E (ARM64, synthetic APIs)

Final build: isolated worktree `f462d24` + R4-09 files, 40/40 projects, `app.asar` SHA-256 `311c95a1c6fced1bf11fc8ba23a1c588c7430f6eb6a1cde4d5762c522383118a`, bundled **stock** `lens-k8s-proxy` 0.3.0 (`3d7dea9b…`). The hardened mode was exercised on an APFS clone of the same app with the patched binary (`828fc8df…`). Earlier intermediate builds (fail-closed variant) were used for the S6 series and the R4-06/R4-07 regression and then discarded.

| Suite | Result |
|---|---|
| R4-09 stock binary (final build): X1 renderer traffic, C1 legacy mode + accepted-risk log, EXT1, Z1 | 4/4 PASS |
| R4-09 patched binary (final build clone): X1 through mTLS, K1 no secrets in proxy env, K2 loopback only, K3 no-cert / foreign-cert rejected, EXT1, Z1 | 6/6 PASS |
| R4-09 fail-closed variant with stock binary (intermediate build, FC1, Z1) | 2/2 PASS (behaviour since replaced by the compatible mode) |
| R4-06 logs/inspector (D1–D13, detached pod logs use the mTLS path) | 13/13 PASS |
| R4-06 terminal (T1–T8) | 8/8 PASS |
| R4-07 images/ownership (I0–Z1) | 11/11 PASS |
| R4-05 port-forward, intermediate build before the dialog fix, 10 runs | S6 8/10 (both failures: kubectl started with `0:80`); S11 0/10 (inherited `illegal access` at close) |
| R4-05 port-forward, build with the dialog fix, 8 runs | S6 8/8; all other scenarios PASS except inherited S11 |

EXT1 (extension API surface invoked from the DEV cluster frame of the packaged app, the same objects an extension receives): `Renderer.K8sApi.podsApi.list` works (6 pods); `Renderer.K8sApi.forCluster(DEV)` works; `forCluster(PROD)` from the DEV frame is rejected by the proxy; a raw `fetch("/api-kube/…")` without the API gets 401. A packaged third-party-style extension bundle was **not** built.

## 5. Global suite

Jest global (core, `--ci -w 3`, working tree = final R4-09): 3142 tests, 2990 passed, 143 failed (26 suites). Per-test diff against R4-08 (`global-r408-final.json`): **0 new failures**, 142 fixed (141 `router.test.ts` harness, plus 1). The 143 remaining failures are the snapshot suites below.

Snapshot audit (agentE, `--ci`, no `-u`): of 20 audited snapshot files, 15 differ only by sidebar items (Applications & Images **and** Cost & OpenCost), 4 contain additional non-sidebar UI (edit-resource cluster-context badge, log cluster-context/pod-uid badges, list CSV export and quick filters, new helm dock-tab content) and 1 is unverified. They are not updated: each needs an owner review confirming the new UI is intended. 6 failing files were not covered by the audit.

## 6. Electron isolation (analysis only, no migration)

- Root and cluster frames: `nodeIntegration: true`, `contextIsolation: false`, no sandbox. Renderer-reachable code (renderer, common, non-main features, extension API) imports Node/Electron directly: `electron` 27, `path` 24, `fs` 7 (+1 `fs/promises`), `https` 6, `events` 5, `crypto` 3, `child_process` 3, `os` 2, `util` 2, `url` 1 (excluding tests; `assert` 132 is bundleable).
- Extensions run in the renderer with full `require` and receive the same globals; any isolation breaks extensions that use Node APIs. This is an extension API change, not an internal refactor.
- Phased plan (each phase separately approved): (1) inventory and wrap renderer Node uses behind IPC/injectables, no behaviour change; (2) preload + `contextBridge` for the root frame with an extension compatibility shim and telemetry of Node use by extensions; (3) cluster frames; (4) `contextIsolation: true`, then `sandbox: true`; (5) extension API v2 without Node, legacy extensions in a separate trusted mode.
- Risk separation: inherited renderer risk (any renderer code can read its frame token and kubeconfigs on disk) — open; local-process risk — closed by R4-08 + R4-09; malicious extension — equivalent to running code as the user, not mitigated; protections implemented — LensProxy capability tokens, frame-scoped token delivery, mTLS to `lens-k8s-proxy`, Host/Origin checks.

## 7. Open risks

1. High — renderer isolation (section 6).
2. High (delivery) — the patched `lens-k8s-proxy` is not yet produced by the build; Main fails closed with the current download. Requires the decision in section 2.4 before merging to a releasable branch.
3. Medium — stale/changed snapshots awaiting owner review (section 5).
4. Medium — orphan children (`kubectl port-forward`, `lens-k8s-proxy`) after a Main crash.
5. Low — the in-use detection briefly binds the probed port; a concurrent bind by another process in that instant would fail once.
6. Synthetic APIs only; only darwin/arm64 binary built; unsigned build.
