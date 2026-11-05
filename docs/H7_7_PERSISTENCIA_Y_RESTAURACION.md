# H7.7 — Workspace persistence and safe restore

Status: PASS. Playwright on real Electron: **186 PASS / 0 FAIL / 0 SKIP / 0 BLOCKED** (PS01–PS16 + the previous 170). Evidence: `docs/evidence/h7-7/`.

## 1. Architecture

- No second docking engine: the same `SplitPanelStore` instances (cluster store from `createGlobalPanelStore`, root store from `createRootPanelStore`) gain a persistence layer.
- `features/global-docking/common/global-layout-persistence.ts` (pure): schema, keys, `serializeGlobalLayout`, `restoreGlobalLayout` (validate + normalize).
- `features/global-docking/renderer/global-layout-persistence.ts`: `attachGlobalLayoutPersistence` — restore on creation, MobX reaction + 300 ms debounce for writes, flush on `pagehide`/`beforeunload`.
- `renderer/layout-persistence-storage.injectable.ts`: adapter over the app's disk-backed lens-local-storage (`<userData>/lens-local-storage/<clusterId>.json`, root frame `app.json`). Writes are lazy (a few seconds).
- Attached only when the `openlens:global-docking` flag is ON. Flag OFF neither reads nor writes saved layouts.
- Kubetail classic persistence (`openlens:split-layout`) and the shared `WORKSPACE_TEMPLATES` are never touched.

## 2. Schema and keys

`GlobalLayoutV1 { version: 1, scope: "cluster" | "root", clusterId?, root, collapsedLeafIds, updatedAt }`

| Scope | Key |
| --- | --- |
| cluster | `openlens:global-layout:v1:<clusterId>` |
| root | `openlens:root-layout:v1` (no clusterId) |

Each key has `:prev` (last valid layout) and `:corrupted` (raw payload of the last unreadable layout).

Persisted: stable panel ids, kind, resource descriptor, clusterId, orientation, ratios, tab order, active tab, collapsed state.
Never persisted: tokens, credentials, PROD grants, PTY/process data, terminal content, log buffers, connections, Monaco instances, unsaved drafts (whitelist serialization).

Limits: depth ≤ 8, nodes ≤ 64, panels ≤ 24, ratios clamped to 0.15–0.85.

## 3. Migration strategy

`version` is checked first. Unknown/older/newer versions are treated as unreadable (fallback below). A future `V2` adds a migrator from `V1` in the pure module; keys carry the version so versions can coexist.

## 4. Inert restore

Restoring rebuilds the tree only. Session panels (terminal, pod-logs, resource-editor, kubetail) are marked inert in `RestoredSessionGate` and render `RestoredSessionPlaceholder` (`restored-session-placeholder`, button `restored-session-resume`) until the user resumes them.

| Panel | After restore |
| --- | --- |
| Terminal | Visual identity kept, no PTY, fresh `docked-terminal:<clusterId>:<uuid>` tabId, "Start new session" action; PROD grant is never restored and must be requested again |
| Pod logs | Identity/config kept, no polling or buffer until Resume |
| Editor | Panel/document identity kept; unsaved drafts are not claimed to survive; nothing is saved |
| Kubetail | No streams; selection is not restored; after Resume it mounts with zero streams |
| Resource details | Restored as a normal panel |
| Detached windows | Not persisted; no native window opens on restore; the panel is shown at most once |

The active tab restored from disk is preserved on first mount (`revealRouteOnMount`), later route changes still reveal their panel.

## 5. Errors and recovery

Empty, malformed, unknown-version, foreign-cluster, unknown-kind, duplicate-singleton, over-limit and out-of-range data never prevent OpenLens from opening:

1. Primary unreadable → the raw payload is copied to `:corrupted` (never overwriting a valid `:prev`), then `:prev` is tried.
2. Both unreadable → default seed layout.
3. Valid parts of a tree are recovered when unambiguous; descriptors from another cluster are dropped.
4. Write failures (quota etc.) are caught and logged; writes copy the valid primary to `:prev` first.

## 6. Tests

- Jest `src/features/global-docking`: 20 suites / 204+ tests (serialization, versioning, cluster/root isolation, nesting, sizes, collapsed, descriptors, inert restore, corrupt data, flag OFF, no touching of the Kubetail key, reveal/active tab, root wiring).
- Playwright PS01–PS16 (`open-lens/integration/h7-docking-e2e.mjs`), including PS09 full Electron quit/relaunch and PS15 corruption injected while the app is closed. Full regression: 186/186.

Harness notes: legacy scenarios start from the default seed by dropping saved layouts (`dropSavedLayouts`, disabled during PS01–PS16, which depend on their own saved layouts). PS16 forces a real layout change before detaching, because detach does not mutate the tree and an unchanged seed is never written.

## 7. Resources

~17 GiB free disk during the run, one Electron DEV instance at a time, one renderer build, isolated QA profile `~/Documents/lens/qa-profiles/h7-dev`.

## 8. Limitations

- Saves are lazy (up to a few seconds); `dispose()` does not flush.
- The second root view uses its default tab/category until navigated to (H7.6.4 advisory, does not block restore).
- Detached state and Kubetail selection are not restored.
- The last panel of a host still cannot be closed; extension pages stay classic; Settings/Catalog cannot be detached natively.

## 9. Rollback

Turn the `openlens:global-docking` flag OFF: persistence stops and saved layouts are left untouched. To discard saved layouts remove the `openlens:global-layout:v1:*` and `openlens:root-layout:v1*` keys.

## 10. Acceptance smoke on Mac M4 (2026-11-04)

Focused re-run on Electron DEV (isolated QA profile, synthetic clusters), code at `da9a7d1` (identical product code to `6504144`; the diff only adds docs, evidence and the E2E harness). Scenarios GV01, GV02, PS01–PS09, PS15 + QA00: **13 PASS / 0 FAIL**. The 186-PASS record in `docs/evidence/h7-7/` is unchanged and was not re-run.

Note: `results.json` reports `uncommittedChanges: true`; the only later changes are the harness and docs committed in `da9a7d1`, no product code.

| Metric (whole process tree, ~4 min, 93 samples) | Value |
| --- | --- |
| Peak RSS | ~1.97 GB (idle samples average ~0.87 GB) |
| Peak CPU | ~250% (during relaunch/compile bursts) |
| Peak processes / listeners / established connections | 11 / 6 / 45 |
| After quit | 0 Electron/dev-server processes, ports 9191/18443/18444 free, 0 orphans |

Not measured: `lens-k8s-proxy` count is machine-wide and not attributable to this run; no per-panel listener leak check beyond the totals above.

NOT VERIFIED (no automated coverage): multiple monitors, profile without permissions, environment change, deleted-cluster restore, live flag-OFF rollback. A first subset run failed PS06/PS09 only because it skipped their prerequisites (PS02–PS05, PS08); the contiguous chain passed.
