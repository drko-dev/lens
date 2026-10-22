# OpenLens DevOps Revival — R4-08 Validation Report

## Local proxy authentication, regressions and Release 4 status

- Branch: `feat/r4-workspace-security`, base `ea3dd24` (R4-07).
- Date: 2026-10-22
- Verdict: **the critical unauthenticated access to Kubernetes through the local lens proxy is closed** (capability tokens, fail-closed, verified from outside the packaged app). **Release 4 is not fully certified**: renderers still run with Node integration (section 6), the global Jest suite is not green (inherited failures, section 4) and port-forward S6 remains intermittent. Not committed.

## 1. Vulnerabilities fixed

| ID | Finding (before) | Fix |
|---|---|---|
| V1 (critical) | Any local process could call `https://127.0.0.1:<port>/<clusterId>/…` or send `Host: <clusterId>.lens.app` and get the Kubernetes API with the user's credentials. The cluster id (a UUID present on disk and in process lists) was the only "secret". | Per-cluster capability token (32 random bytes, in Main memory only) required for `/api-kube/*`, the `127.0.0.1/<clusterId>` path form and non-shell upgrades (exec/attach/port-forward). |
| V2 (high) | Local API routes (`/api/…`: port-forward start/stop, helm, metrics, resource-applier, **service-account kubeconfig**) had no authentication. | Same token (cluster scope when the Host resolves a cluster, app scope for the root frame `lens.app`). |
| V3 (medium) | No Host/Origin validation (DNS-rebinding style requests, cross-cluster frame requests). | Host must be `127.0.0.1`/`localhost`/`lens.app`/`<id>.lens.app` with the proxy's exact port (else 421); an Origin, when present, must be `https://lens.app:<port>` or the frame of the same cluster (else 403). |
| V4 (medium) | The upgrade handler logged the full URL, which for the shell route includes the single-use `shellToken`. | Logs now contain the path only (no query string) for upgrades, proxy errors and retries. |
| V5 (medium) | Upgrade header forwarding skipped `Host`/`Authorization` case-sensitively (`authorization` in lowercase reached kube-auth-proxy). | Case-insensitive skip list that also removes the proxy token header. |
| V6 (low) | The temporary proxy kubeconfig was dumped in full to the debug log. | Only its path is logged (the file now contains a token). |

## 2. Architecture

- `common/lens-proxy-auth/proxy-auth.ts`: header `x-openlens-proxy-token`, IPC channels, `getProxyAuthHeadersInjectionToken`.
- `main/lens-proxy/proxy-auth-tokens.ts` (+ injectable): `ProxyAuthTokens` — `get`, constant-time `verify` (exact scope only, length-bounded), `rotate`, `revoke`, `revokeAll`, `onRotated`. Never persisted or logged.
- `main/lens-proxy/authorize-proxy-request.ts`: pure, fail-closed decision (Host → Origin → path classification → token of exactly the scope). Static frontend files and `/version` stay public (GET/HEAD only); the shell websocket keeps its existing single-use `shellToken`. `stripProxyAuth` removes the credential before forwarding.
- `main/lens-proxy/lens-proxy.ts` (+ injectable): authorization before routing and before the path-form rewrite; retries are not re-authorized; rejected requests get 401/403/421 with a generic body.
- Clients:
  - Main: `k8sRequest` adds the cluster header; `main/lens-proxy/get-proxy-auth-headers.injectable.ts` is the Main implementation of the injection token.
  - Shared: `common/k8s-api/create-json-api.injectable.ts` and `create-kube-json-api.injectable.ts` add the header per request (scope from the `Host` the request targets, so rotation is honoured).
  - kubectl / helm / local shell / port-forward: the temporary proxy kubeconfig (mode 0600) carries `user.token` (sent as `Authorization: Bearer`); it is rewritten on rotation and deleted on clear.
  - Renderer: `main/lens-proxy-auth/frame-token-service.ts` returns a token only to the frame that owns it (cluster frame registered in `clusterFrames` with origin `https://<id>.lens.app:<port>`, or the root top frame `https://lens.app:<port>`); any other sender, or any payload, is refused with a generic error. `renderer/lens-proxy-auth/*` caches the frame's token in memory and returns it only for the frame's own scope (requests for another cluster get no header). Rotations are pushed only to the owning frame.
- Lifecycle: cluster disconnect rotates its token; deleting a cluster revokes it; app quit revokes all.

## 3. Security results

Unit (Jest `--ci`): `main/lens-proxy/__tests__/r4-08-proxy-auth.test.ts` (22 tests: tokens, missing/foreign/revoked/cross-cluster tokens, app vs cluster scope, path form, query-string tokens ignored, upgrades, shell exemption, static/`/version`, non-GET on static paths, Host and Origin), `main/lens-proxy-auth/__tests__/r4-08-frame-token-service.test.ts`, `renderer/lens-proxy-auth/__tests__/r4-08-frame-proxy-auth.test.ts`, `main/lens-proxy/r4-08-main-proxy-auth.test.ts` — 57 tests across the four suites, all passing.

Packaged E2E (`r408-sec-e2e`), probing the real proxy from outside the app, tokens read from the proxy kubeconfig exactly as kubectl reads them:

| ID | Scenario | Result |
|---|---|---|
| X1 | Renderer traffic works through the authenticated proxy (DEV pods page, 6 rows) | PASS |
| K1 | Per-cluster proxy kubeconfigs, mode 600, distinct 43-char tokens | PASS |
| A1 | Path form without token → 401, no data | PASS |
| A2 | Cluster Host `/api-kube` without token → 401 | PASS |
| A3 | DEV token on DEV (Bearer, kubectl style) → 200 with pods | PASS |
| A4 | Cross-cluster: DEV token on PROD (path form and Host) 401/401, PROD token on DEV 401; PROD token on PROD 200 | PASS |
| A5 | Token in the query string ignored → 401 | PASS |
| A6 | Foreign Host 421, look-alike `…lens.app.evil.example` 421, foreign Origin 403, other cluster frame's Origin 403 | PASS |
| A7 | `/api` routes: charts 401, port-forward start 401, cluster token on app route 401 | PASS |
| A8 | Exec upgrade without token and with the other cluster's token: connection closed, no `101` | PASS |
| A9 | Static frontend and `/version` public (200) | PASS |
| A10 | Tokens in the Main log: 0; rejections logged without credentials | PASS |
| Z1 | After quit: proxy unreachable, 0 app processes, 0 proxy kubeconfigs left | PASS |

## 4. Regression

Isolated tree: `git worktree` at `ea3dd24` + the R4-08 files. Node v20.20.2.

| Gate | Result |
|---|---|
| Monorepo build | 40/40 projects, exit 0 |
| `tsc --noEmit` (core) | exit 0 |
| `eslint --max-warnings 0` on every R4-08 TS file | exit 0 |
| Jest global (core, `--ci -w 3`) | 2821 passed, 285 failed of 3115 (296 suites). Baseline `ea3dd24`, same dists: 2763 passed, 286 failed of 3058. Per-test diff: the only test failing in R4-08 but not in the baseline was `kubeconfig-manager.test.ts` (1 test, random token starting with `-` is quoted by the YAML serializer); the test now uses a deterministic token and passed 5/5 runs. 2 tests fixed (`api-manager.test.ts`), 57 new. |

Inherited failures (identical on the baseline, not hidden, no snapshot updated):

| Failures | Cause | Class |
|---|---|---|
| 140 in `src/features/*` (25 files) + 3 in `renderer/frames/cluster-frame/cluster-frame.test.tsx` | Snapshots predate the R3 "applications" sidebar item (extra `keyboard_arrow_down` / `tab-link-for-applications`) | Pre-existing test debt |
| 141 in `main/router/router.test.ts` | The test DI prevents side effects but R4-05's `confirm-production-port-forward` needs `get-port-forward-dialog-parent-window` | Pre-existing test-setup defect (since R4-05) |
| (fixed) 2 in `common/k8s-api/__tests__/api-manager.test.ts` | Fixture reused the `aquasecurity` apiBase now registered by R3's Trivy API; fixture moved to a fictitious group, assertions unchanged | Fixed (test only) |

Two tests (`refresh-accessibility-technical`, `navigate-to-extension-page`) failed once under full-suite load and pass in isolation on both trees (112/112, 12/12) and in the final run: timing-sensitive, pre-existing.

Packaged E2E regression on the R4-08 binary:

| Suite | Result |
|---|---|
| R4-06 logs/inspector (D1–D13) | 13/13 PASS |
| R4-06 terminal (T1–T8, same PID across handover, PROD confirm) | 8/8 PASS |
| R4-07 images/ownership (I0–Z1, incl. RSS cycles 15 drawer opens) | 11/11 PASS |
| R4-05 port-forward (S1, S7, S6, S9, S8, S11), 3 runs | S1/S7/S8/S9 3/3 PASS; S6 1/3 PASS; S11 0/3 (the inherited `illegal access` page error at app close) |
| R4-01 security pilot script | PASS (100%) |
| R4-02 workspace tabs script | PASS |
| R4-03 persistence script | 5/5 PASS |
| R4-04 tools script | PASS |
| Surviving processes after each suite | 0 (the R4-02 script leaves 2 app processes at exit; killed by the runner) |

S6 analysis: in the failing runs Main never logs `port N is already in use` and the proxy logged 0 rejections, so the cause is the in-use detection (`tcp-port-used` check before spawning), not authentication and not the notification. Pre-existing (R4-05 recorded 1/3 misses); root cause still not established.

## 5. Inherited defects classified

| Defect | Class | Action |
|---|---|---|
| `illegal access` page error at app close | Pre-existing (Chromium/V8 teardown of a cluster iframe, R4-03) | Accepted limitation |
| Orphan `kubectl port-forward` / `lens-k8s-proxy` after a Main crash (SIGKILL) | Real defect: children are not tied to Main's lifetime | Open; proposal: record child PIDs and sweep them at startup |
| Port-forward S6 intermittency | Pre-existing, cause narrowed to in-use detection | Open |
| Snapshot debt, router test DI | Pre-existing test defects | Open (requires a deliberate snapshot review, not `-u` to hide failures) |

R4-07 pending items reviewed: alerts (no alert source defined; not implemented, no source invented), RBAC-denied vs missing owner (still shown as `missing`), invalid declared digest treated as a tag. All remain documented future work; none is a security blocker.

## 6. Open risks

1. **High — renderer isolation.** The main window and every cluster frame run with `nodeIntegration: true`, `contextIsolation: false`, no sandbox. A compromised renderer (including extension code) can read its frame's token, and also read kubeconfigs from disk directly. The proxy token protects against other local processes, other users and browsers; it does not protect against a compromised renderer. Closing this needs the planned Electron/renderer migration (preload + contextBridge, sandbox), which is out of R4-08's implemented scope.
2. **Medium — `cluster:set-frame-id` is not sender-validated.** A frame can overwrite another cluster's frame mapping (misrouting rotation and redock notices). It cannot obtain another cluster's token (the token handler also checks the exact origin).
3. **Medium — kube-auth-proxy** (`lens-k8s-proxy`, one per cluster) listens on a random 127.0.0.1 port without client authentication; its binary source is not in the repo. A local process that discovers the port can reach the cluster through it. Unchanged by R4-08.
4. Token rotation rewrites the proxy kubeconfig asynchronously; a kubectl started during the rewrite may briefly use the previous token (401, retry succeeds).
5. Clusters removed by kubeconfig sync (not via the delete dialog) do not revoke their token explicitly; requests still fail because the cluster no longer resolves.
6. Port-forward S6 intermittency; orphan children after a Main crash.
7. Synthetic APIs only; no real apiserver, RBAC, registry or metrics provider. Unsigned build.
