# QA Report — Hito 01 v6 UI Corrections (2026-10-27, autonomous run)

- Candidate: `open-lens/dist-stage-v6-ui-corrections-20261027/mac-arm64/OpenLens DevOps.app`
  - `app.asar` SHA-256: `066225ae48d329dccc3521e399b1462279a2cddf20651e4329c20425359c09ce`
  - `pty.node` SHA-256: `bccfce52…` (ARM64, ABI 110, Electron 22.3.3)
- Machine: macOS ARM64 (darwin), Build: user-built stage, QA: automated Playwright (Electron launch), isolated CICD profile.
- Test cluster: minikube profile `qa` (driver qemu, containerd), namespace `qa`, workloads: deployment `nginx` ×3, pods `busybox`, `hello` — all Running during QA.
- Harness: Playwright 1.42.1 `_electron.launch` with `--integration-testing`, isolated `HOME`, `KUBECONFIG=/var/tmp/om/kubeconfig` (auto-synced by Lens into app data).

## Verdict summary

| Scenario | Result |
| --- | --- |
| S1 Boot & welcome | PASS |
| S2 Catalog isolated (no leaks) | PASS |
| S3 Kubeconfig auto-sync (25 contexts) | PASS |
| S4 Cluster connect | PASS |
| S5 Sidebar navigation (14 pages) | PASS (14/14) |
| S6 List structure & header (no KPI, compact header, subtle selection) | PASS |
| S6-pods-table-rows (initial FAIL) | Non-defect: pods table filters by namespace `default` on first open (0 nginx rows there); switching to ns `qa` lists 5 pods incl. 3× nginx. Evidence: `s11-pods-default-ns.png`, `s11-pods-qa-ns.png`, `s11-results.json` |
| S7 Content, search, filters, namespace switch, CSV export UI | PASS (7/7) |
| S8 Integrated terminal (native pty) | PASS (2/2) |
| S9 Favorites (add 25+, vertical list, reorder, persistence) | PASS |
| Reviewer observations F1–F5 | Reproduced & pinned by unit/RTL tests; no blocking defect |

**Overall: PASS** — no critical failures, no essential test blocked.

## Scenario details

- **S1–S4**: app boots on `https://lens.app:<port>`, catalog empty with branded "Nothing connects until you open a cluster" welcome copy; kubeconfig auto-sync produced 25 cluster entities from `~/.kube` files; `qa` cluster connects in ~2.6 s (sidebar visible). Evidence: `evidence/s1-s4-results.json`, `s4-cluster-connected.png`.
- **S5**: sidebar navigation verified via `data-testid="sidebar-item-link-for-*"` for all 14 destinations (cluster-overview, nodes, workloads/*, config-maps, secrets, services, pvc, namespaces, events). Evidence: `s5-s6-results.json`, page screenshots.
- **S6**: `workload-insights-bar` count = 0; compact header = 1 NamespaceSelect + 1 search + 1 quickfilters row; active row selection uses subtle background (`rgba(0,0,0,0)` base with hover accent).
- **S7**: namespace switch to `qa` lists 5 pods; search `busybox` filters live; quick filter chips toggle; Export CSV exists in the list header (export-csv-btn + kube-list-export-csv-btn), click opens no error. Deployments (18 cells), Nodes (22), Events (270) pages render data.
- **S8**: terminal opens from dock `+` menu (`MenuItem.create-terminal-tab`); `echo OPENLENS_QA_TERMINAL_$((6*7))` executed through the real pty and verified via xterm SearchAddon (`terminal-search-status` = `Match` proves text traversed the pty buffer; canvas renderer has no DOM text). Evidence: `s8-terminal.png`, `s8-terminal-text.json`.
- **S9**: 25 favorites added via catalog context menu (`Add to Hotbar`) using 24 extra kubeconfig contexts (`qa-02..qa-25`); later extended to 33 favorites + `Catalog` + `Welcome Page` = 35 hotbar items.
  - Custom container scrolling (probe `s10`, final): the items container `.HotbarItems` is a real scroll container — `overflow-y: auto`, `scrollHeight 1876` vs `clientHeight 818` for 35 items, cell size stays a fixed 40×40 (no compression/pagination); mouse wheel reaches the last item (`scrollTop 1058`, last cell fully visible) and returns to the first (`scrollTop 0`); with a 900×620 window and gridSize layout it still scrolls (`scrollHeight 1876 / clientHeight 538`, `scrollTop 1338`). Evidence: `s10-initial-top.png`, `s10-wheel-bottom.png`, `s10-back-top.png`, `s10-small-window-bottom.png`, `s10-results.json`.
  - Earlier `s9b/s9c/s9d` scroll FAILs were a **probe artifact**, not an app defect: the probe selected the outer `.HotbarMenu` panel (`overflow: hidden`) instead of the inner `.HotbarItems` scroll container. The app CSS (`hotbar-menu.scss`, verified also in the candidate's packaged `lens.css`) already ships `overflow-y: auto`. Corrected probe `s10` supersedes them.
  - Strict reorder test: dragged a visible DOM item (target also visible); store order moved `qa-04` from index 4->12 (drop at index 10 of `lens-hotbar-store.json` `items[]`), UI ids shifted accordingly; re-validated later with both source and target in view inside the scrollable list (`s9e`: store uid moved 2->9, no lost/duplicated items, same set of uids). Evidence: `s9b-after-drag.png`, `s9e-results.json`.
  - Known limitation (documented, not an acceptance criterion): react-beautiful-dnd does **not** auto-scroll the scrollable ancestor while dragging with the pointer held at the container edge (`s9e` samples on edge held 2.5 s: `scrollTop` stays 0; drag-lift visible in `s9f-mid-drag-edge.png`), and a keyboard lift (focus handle + Space, then ArrowDown) did not reorder in this build (`s9g-*`). Work-around that works today: wheel-scroll the intended source/target into view, then drag within the visible area (verified, `s9e`).
  - Persistence: relaunch with the same app-data dir keeps all 35 favorites (`s9-persistence-relaunch.png`; re-run also passed on the final profile `cicd-…5644429`).

## Reviewer observations (5 informational findings) — disposition

| Finding | Repro | Disposition |
| --- | --- | --- |
| F1 duplicate React keys / drag ids (hotbar-menu.tsx) | Covered by existing test `hotbar-menu.test.tsx` — adds a duplicate favorite across hotbars, asserts unique draggable ids and no React key errors | Pinned; no defect |
| F2 “Add to Hotbar” pins to the *active* hotbar only (hotbar-toggle-menu-item.tsx) | New test `hotbar-reviewer-findings.test.tsx` — pins to active hotbar only (`second`), not the other | Upstream-inherited semantics; pinned as intentional |
| F3 reorder rewrites/compacts and migrates items across hotbars (hotbar-menu-items.ts) | Existing tests `hotbar-menu-items.test.ts` assert global order and cross-hotbar migration with data preserved | Upstream-parity semantics; pinned |
| F4 “Remove from Hotbar” removes from *all* hotbars (hotbar-menu.tsx `removeEntityFromAllHotbars`) | New test — removing from the menu removes the uid from both hotbars | Upstream-inherited semantics; pinned |
| F5 quick filters render inside the header and disappear if header suppressed (header.tsx) | New test `item-object-list/__tests__/header.test.tsx` — `showHeader=false` drops quick filters with the header | Upstream-inherited coupling; pinned so a future decoupling is conscious |

All 4 new tests pass; neighboring suites (hotbar-menu, hotbar-menu-items, hotbar-remove-command, kube-object-list-layout) pass. `tsc --noEmit` clean.

## Known notes / follow-ups

- Favorites drag UX: no edge auto-scroll while dragging and no working keyboard drag (rbd 13.1.1 behaviour in this build). In-view drag + wheel works and covers reorder needs; flagged as follow-up (possible `@hello-pangea/dnd` ancestry), out of Hito 01 scope.
- S6-pods-table-rows first-look FAIL explained: namespace-filtered table starts at `default` (upstream behaviour); not a defect. Documented with fresh evidence `s11-*`.
- s9b/s9c/s9d scroll FAILs were superseded by corrected probe `s10` (probe selector artifact; app CSS has real scroll). Kept as evidence trail.
- After a minikube restart the isolated kubeconfig copy must be re-synced from the cluster kubeconfig (TLS certs change); one QA run failed on this and passed after refresh.
- Test runtime leftovers are kept out of the repo: minikube `qa` profile lives in `/var/tmp/om` (STOPPED at report time), GUI pilot data in `/var/folders/.../opencode/qa/`. Disk free at close: 17 GiB. OpenLens DevOps processes: none.
