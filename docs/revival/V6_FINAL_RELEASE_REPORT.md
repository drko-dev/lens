# OpenLens DevOps v6 - Final release report (Milestone 4)

**Verdict: GO (technical, internal use).** Not suitable for public distribution: ad hoc signed, **not notarized**.

## Source

- Branch: `feat/v6-final-release`, worktree `/Users/gustavomarcon/Documents/lens/lens-v6-final`
- Starting commit: `a9ef5a9` (Milestone 3 HEAD; contains Milestone 1 `c48cf06`/`0583d40`, Milestone 2 `6608548`, Milestone 3 `a9ef5a9`)
- Milestone 4 commits: `10a8a67` (Nodes fixture fix) plus this report.

## Milestone 4 change

`Cannot read properties of undefined (reading 'taints')` on Nodes: `Node.getTaints()` is `this.spec.taints || []`, so it tolerates
missing taints but not a missing `spec`. A real Kubernetes Node always has `spec`; the Demo Cluster fixtures
(`main/demo-cluster/demo-cluster-data.ts`) did not. Fixed in the fixture only (no UI guard, no production logic touched): both nodes
get a `spec` (`podCIDR`), the control-plane node gets its standard `NoSchedule` taint. Two regression tests added.

## Tests

- Jest `src/main/demo-cluster` + `components/welcome`: 16/16 pass. `tsc --noEmit` (packages/core) clean. ESLint on `main/demo-cluster` clean.
- Table/preferences tests (49) not repeated: that code did not change since Milestone 3.

## Packaged app smoke (copy extracted from the mounted DMG, isolated)

Isolation: temporary HOME, `CICD`, `sandbox-exec` denying writes to the real profile and `~/.kube`; migration/log paths confirmed under the temp HOME.

| Check | Result |
| --- | --- |
| Opens, Home, Catalog | PASS |
| Demo Cluster | **CONNECTED** (cluster iframe present, online LED, one packaged `lens-k8s-proxy`) |
| Pods, Deployments, Nodes | PASS (Nodes: 2 nodes, taints 1/0, roles, version, Ready) |
| Densities | PASS: Compact 29 px, Lens 35 px (default, no stored key), Spacious 43 px |
| Favorites | PASS: 56 px, 25 pins, vertical scroll, collapse 6 px / expand 56 px, pin clicks navigate without duplicate tabs |
| Search, sort | PASS (verified in Milestone 3, same code) |
| Export | PASS: dialog with columns; Copy to Clipboard produced the expected CSV (`Name,CPU,Memory,...` plus both node rows) and the JSON array |
| Columns | PASS: visibility toggle (QoS hidden/shown), "Reset column layout" present |
| Closing | PASS: no leftover v6 or `lens-k8s-proxy` processes |

Screenshots: `/private/tmp/claude-501/-Users-gustavomarcon-Documents-lens/4ccd083d-ebcc-4918-9688-2cd14fa635a3/scratchpad/shots-final/` (1440x900 and one 1920x1080).

## Isolation and protected items

Real profile hashes (46 files) before and after: 46/46 identical. R9-RC (PID 97512) never touched, uptime continuous. v5 DMG
`bb875b06381d02eac356383afe28ca1b24edee9feb1d46c981e955a16ffb9770` unchanged (a copy of the v5 app was run isolated only to compare Back-button behavior, then deleted).

## Artifacts

- DMG: `/Users/gustavomarcon/Documents/lens-out-of-repo-20261030/releases/v6/OpenLens-DevOps-v6-arm64.dmg` (189,472,571 bytes)
- SHA-256: `950398627201328d9cd343a540c948dd64ca41368bcc723f5365894847fed625` (file `OpenLens-DevOps-v6-arm64.dmg.sha256` next to it, `shasum -c` OK)
- App: `/Users/gustavomarcon/Documents/lens-out-of-repo-20261030/releases/v6/OpenLens DevOps.app` (executable sha256 `508facd8...dd56d`, `app.asar` sha256 `123a600f...a0753`)
- Build copy: `lens-v6-final/dist-v6-arm64/` (not committed)
- Architecture: arm64 (main executable, `kubectl`, `helm`, `lens-k8s-proxy`).
- DMG checks: `hdiutil verify` VALID; mounted read-only; contains `OpenLens DevOps.app` and an Applications link; `codesign --verify --deep --strict` OK inside the mounted DMG; `app.asar` identical to the build; detached cleanly.

## Signing

Ad hoc (`codesign --force --deep --sign -`, `Signature=adhoc`, identifier `dev.drko.openlens-devops`). No Developer ID Application identity or notarization
credentials exist (only an Apple Development identity, which is not valid for distribution). **Not notarized.** The first DMG produced by electron-builder
(`identity=null`) failed `codesign --verify` ("code has no resources but signature indicates they must be present"); the app was signed ad hoc and the DMG rebuilt
from it with `--prepackaged`. That first DMG was discarded. Gatekeeper will warn on other Macs (right-click > Open).

## Version and identity

Product name `OpenLens DevOps`, DMG named `...-v6-arm64.dmg`. The internal version stays `6.5.3-dev` and the app id `dev.drko.openlens-devops` unchanged: the
stores carry migration version 6.5.0, so lowering or renaming them would risk data compatibility. Branding and logo unchanged.

## Known limitations

- Not notarized, ad hoc signed: internal use only.
- The top-bar Back/Forward arrows do not navigate when exercised by synthetic/CDP clicks; the v5 binary behaves identically under the same test, so it is not a v6 regression.
  Navigation through pins, tabs and `history.back()` works. Workspace tab Back/Forward was validated in Milestone 1.
- The CSV/JSON export dialog layout (labels overlapping the sidebar) is unchanged since the v5 base; the native "Download" save dialog was not exercised (clipboard export used instead).
- Column drag-resize was not conclusively verified live (columns moved, direction inconsistent); the resizer unit tests passed in Milestone 3.
- Demo Cluster only: no real Kubernetes, no metrics (CPU/Memory/Disk bars empty), no soak, no long-run test.
- `hovering-hotbar-menu` snapshots remain stale (pre-existing, from Milestone 2). 11 sidebar snapshot tests fail identically on the base (Milestone 1).
