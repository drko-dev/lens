# OpenLens DevOps — Technical Closure (Final)

- Date: 2026-10-26 · Worktree: `/Users/gustavomarcon/Documents/lens/lens-r7-09-consolidation`
- Verdict: **GO_QA_ONLY** (QA distribution; not a public release; the formal 30-minute gate is not satisfied for this binary)
- Final candidate (v5): `dist-qa-final-v5-arm64/mac-arm64/OpenLens DevOps.app`
  - Executable SHA-256 `a5a53b28e777888432c8b7ede62ca3c787aaa360ff8e4c5fc393ce3a47678b21`
  - app.asar SHA-256 `6ce244b9b6867dc06897fee357180914bcc1ac608bf745667490493df995b637`
- DMG: `/Users/gustavomarcon/Documents/lens/lens-r7-09-consolidation/dist-qa-final-v5-arm64/OpenLens-DevOps-Final-v5-QA-arm64.dmg`
  - SHA-256 `bb875b06381d02eac356383afe28ca1b24edee9feb1d46c981e955a16ffb9770` (also `…dmg.sha256`)
- Previous artifacts kept untouched: `dist-qa-final-arm64` (DMG `5bed13e9…`, contains the orphan-proxy bug), `dist-qa-final-v2/v3/v4-arm64` (intermediate builds), `dist-qa-demo-fix2-arm64`.

## 1. Defects

| Defect | Root cause | Fix | Evidence |
|---|---|---|---|
| Orphan `lens-k8s-proxy` after quit (4/4 runs before) | Race in `create-kube-auth-proxy.injectable.ts`: `run()` guarded only by `if (proxyProcess)`, which is assigned **after** two `await`s. Concurrent `run()` calls each spawned a proxy; the second overwrote the reference, so `exit()` killed only one. Reproduced deterministically: 2 proxies for 1 cluster, 1 survivor, which answers SIGTERM (it was never signalled). | `run()` coalesces concurrent starts onto one promise; `exit()` bumps a generation counter that cancels a start still in flight before it can spawn. Idempotent. | 2 new regression tests in `src/main/__test__/kube-auth-proxy.test.ts`: RED on HEAD (2 fail), GREEN with fix (13/13). Packaged v2–v5: exactly 1 proxy, **0 survivors** with SIGTERM and with CDP `Browser.close`; also from the mounted DMG. |
| `illegal access` exceptions (3 per run) | Thrown as a bare string by the engine (the literal exists only in Electron's `v8_context_snapshot`, not in product code or bundles) from a DOM operation inside React's commit, called from `listen-unload.injectable.ts` → `unmountComponentAtNode` in `beforeunload`; React's pending commits rethrow it asynchronously. Pause-on-exception: `jg ← ig ← Xj ← unmountComponentAtNode`. **Occurs only at frame unload**: the exception records labelled with the real phase give `shutdown` only (0 during 35 cycles); the earlier "close-tab" label was a stale variable. | Removed the unmount from the unload handler (both frames are discarded right after; root frame exits through `app.exit()`). | Causal experiment variant: 0 exceptions / 116 cycles. Final v5: 139 cycles, **0 exceptions, 0 console errors**. Limitation: there is no unit test for this handler; the regression guard is the packaged-app cycling script. The engine-level reason the DOM call throws was not identified. |
| Hito 3 matrix after changes | — | — | v5: 17/17 PASS, cleanup complete, token revoked, hashes match (`hotfix3-matrix-20261026232218-07dea78970dc.json`; smoke `…232058-0af3c436490b.json`). Earlier candidates v2/v3/v4 also 17/17. |
| Lint / types | — | — | `npm run lint` exit 0 (27 projects), `tsc` exit 0, `eslint` on touched files 0/0. Runner tests 68/68. |

## 2. Full `@openlens/core` suite (final source)

Full run, preserved: `../scratchpad` JSON (`jest-final.json`). **395 suites: 322 passed / 73 failed. 4039 tests: 3682 passed / 348 failed / 9 skipped.** This suite is **not green** and is not presented as PASS.

- 327 failures are identical in two complete runs and also fail on the base comparison (36 touched files restored to HEAD content, failing suites rerun): **319 snapshot diffs** (stale markup snapshots: extra `<div`/`/>` lines, from earlier uncommitted product work, not from this session's changes) and **8 `toHaveBeenCalledWith`**. They are pre-existing relative to this session; they are **not** proven to be present in a pristine clean HEAD, because the worktree contains uncommitted work from earlier milestones. Snapshots were deliberately **not** regenerated (that would bless unreviewed markup changes).
- 21 failures vary between runs: 18 `asyncFn` timeouts in `refresh-accessibility-technical.test.ts` (112/112 pass in isolation, with and without the proxy fix), plus 3 in `rbac-inspector` / `kubeconfig-manager-rotation`. Isolated reruns of these were launched but their output was truncated and not recorded; treat the 3 as **unconfirmed**.
- `ipcRenderer.send is not a function` (mobx reaction in `HpaDetails` tests): test-environment mocking, not investigated further; not changed.
- Impact: the shipped binary's runtime behaviour is covered by the 17-scenario live matrix; the unit suite's snapshot drift needs a human review of the markup change before regenerating.

## 3. Historical stability evidence (Hito 4) — no 30-minute run was executed

Repository inventory (`docs/revival`, `docs/revival/evidence`):

| Evidence | Candidate | Environment | Result |
|---|---|---|---|
| `evidence/demo-fix2-soak-30min-20261026.json` | DemoFix2 (`81c72d13…` / asar `7286197d…`) | **Demo Cluster** (local simulated), CDP | PASS; 1,800,002 ms; 359 samples; route/connection/tab/sidebar held; 6 candidate processes at first and last sample |
| `DEMO_FIX2_STABILITY_30MIN_FINAL.md` | DemoFix2 | Kubernetes real (`openlens-r8r9-qemu`) | **SOAK_BLOCKED**, 0 ms measured (supervisor refused a failing matrix) |
| `R8_R9_STABILITY_30MIN_REPORT.md` (2026-10-25, other binaries) | `open-lens/dist` builds | mixed | historical narrative only; no completed ≥1,800,000 ms record found in structured evidence |

Only **one** completed ≥30-minute record exists in the repository, on the Demo Cluster and on a different binary. A second long test mentioned by the user is **not present** in the repo/evidence; if it exists elsewhere, provide its path. Consequently: Hito 4 is **not** marked PASS for v5, and not for Kubernetes real; the DemoFix2 PASS is not attributed to v5 (the code changed: proxy lifecycle, unload handler, 37 lint files).

Fast checks on v5 (do **not** substitute the formal run): 139 open/close cycles of the Demo Cluster in 4 minutes, 0 cycle errors, 0 uncaught exceptions, RSS plateau ~700 MB (peak 737 MB), ≤5 processes, CPU peak 21%, 0 survivors at exit. Evidence: `evidence/final-quick-stability-v5.json`.

## 4. Real Kubernetes
Existing lab `openlens-r8r9-qemu`, read-only: smoke and matrix on v5 PASS (real Nodes/Pods rendered, read-only gateway, temporary RBAC identity created and revoked, app kubeconfig removed, Electron and gateway closed). No workloads changed; no cluster provisioned. The 30-minute Kubernetes-real soak remains **pending** (runner phase `soak`).

## 5. Integrity, signing, orphans, R9-RC
- v5 is arm64 (executable, bundled `kubectl` and `lens-k8s-proxy`); `codesign --verify --deep --strict` OK; DMG `hdiutil verify` VALID; mounted read-only: identical hashes; the app launched from the mounted DMG, opened the Demo Cluster and quit with 0 survivors; detached; 0 mounts left.
- Signature: **ad-hoc only**. The keychain has a single *Apple Development* identity, no Developer ID Application, so signing for distribution and notarization were not attempted; Gatekeeper `spctl` rejects the app. This is a credential limitation, not a functional defect.
- Orphans: 0 processes of any `dist-qa-final*` build at the end. Two orphan proxies from the **old** binary (left by my diagnostic probes) were terminated by PID after confirming they belonged to `dist-qa-final-arm64`.
- R9-RC (`releases/R9-RC`, pid 97512): never touched; process list identical before/after every run.

## 6. Files changed
Product: `main/kube-auth-proxy/create-kube-auth-proxy.injectable.ts`, `renderer/before-frame-starts/runnables/listen-unload.injectable.ts`, 37 lint-only files from the previous milestone. Tests: `main/__test__/kube-auth-proxy.test.ts` (+2). Tooling (`docs/revival/scripts`): `hotfix3-e2e-orchestrator.cjs`, `hotfix3-e2e-electron.cjs` (pins → v5), `hotfix3-e2e-supervisor.test.cjs` (pin), `final-quick-stability.cjs`. Nothing committed.

## 7. Pending (strictly)
1. Formal 30-min soak on v5 (Demo Cluster and Kubernetes real) — prohibited this mission; owner to run `hotfix3-e2e-orchestrator.cjs soak`.
2. Core unit suite: 327 pre-existing failures need human triage (snapshot regeneration after markup review; 8 mock expectations); 3 varying failures unconfirmed.
3. Root cause of why the engine throws during unload DOM teardown (mitigated by not unmounting).
4. Developer ID signing and Apple notarization (external credentials).
