# OpenLens DevOps Revival — R7-04 Security Review

**Review date:** 2026-10-23
**Branch / base:** `feat/r7-devops-capabilities` / `6ea8bb41eb9797939ecc6d9c0da6c902017cb6f4` (R7-03)
**Disposition:** R7-04-specific verification passed (directed Jest/lint/tsc and refreshed E2E evidence, 14/14 checkpoints). **No commit yet and no global certification**: the global `packages/core` test suite and global core ESLint remain unresolved as inventoried at R7-03 and were not re-executed in R7-04. No push, no real cluster, and no CSI drivers/CRDs were installed or touched.

## Threat model

R7-04 introduces two new mutation paths against storage objects:

1. **Create VolumeSnapshot** — `POST /apis/snapshot.storage.k8s.io/v1/.../volumesnapshots`
2. **Expand PVC** — `PATCH /api/v1/namespaces/<ns>/persistentvolumeclaims/<name>`

Both are operator-initiated, both re-use the R7-02 `dryRun=All` infrastructure, and both may run against PROD clusters. The review therefore focused on: mutation authorization, adversarial input, concurrency, PROD confirmation integrity, dynamic-discovery trust boundaries, and information exposure.

## Findings and controls

### Mutation boundary: dry-run first, then real

- Every mutation is two-phase: a server-side dry-run (`?dryRun=All`) that the UI must show as passed before the dialog exposes the real-execute step. The real request is sent **without** `dryRun`.
- Expand PVC's JSON Patch prepends `test` operations on `/metadata/uid` and `/metadata/resourceVersion`. A stale write is rejected by the API server with 409 rather than applied to a replaced PVC.
- `buildVolumeSnapshotManifest` derives the snapshot source from the PVC actually opened in the dialog (same namespace, `persistentVolumeClaimName`); there is no arbitrary source field editable through the UI, so the endpoint cannot be redirected to an unrelated namespace through the dialog.
- E2E asserts **exactly one** dry-run precedes the single real PROD PATCH, and that the DEV flows issue one dry-run and one real request each.

### PROD confirmation integrity

- In clusters marked `production`, both dialogs require: red `#EF4444` banner identifying cluster/namespace/resource, an explicit acknowledgment, and typing the exact PVC name before the execute control enables.
- The E2E PROD checkpoint verifies the guard banner appears before expansion and the real PATCH happens only after the confirmation step.

### Input validation (adversarial)

- `parseQuantity` strictly parses Kubernetes quantity syntax (binary SI and decimal SI). Invalid quantities fail closed with `NaN` instead of being coerced or truncated.
- `validatePvcExpansion` rejects equal or smaller sizes, missing StorageClass, missing `spec`, and StorageClasses without `allowVolumeExpansion: true`. The destination is always strictly larger, so expansion cannot be used to shrink or zero-out requests via the UI.
- `validateSnapshotName` accepts only valid DNS subdomain names (≤253 chars, RFC 1123 charset); invalid names never reach the API.
- StorageClass and PVC-related lookups guard against `spec` being absent mid-flight in freshly refreshed objects.

### Concurrency and staleness

- Preconditions (UID/resourceVersion) protect the PATCH. If the PVC was replaced or resized elsewhere between read and write, the API server returns 409 and the flow requires re-validation rather than overwriting.
- No optimistic local mutation occurs: the store reflects server-returned objects only after the API call resolves.

### Dynamic-discovery trust boundary

- Sidebar/routes visibility is derived from the cluster's own API discovery (`shouldShowResourceInjectionToken` over `resourcesToShow`), not from hardcoded assumptions or a single main-process-only field. A legacy cluster without `snapshot.storage.k8s.io/v1` shows nothing (verified E2E), so nonexistent groups are never surfaced for blind probing.
- The app never requests snapshot-group resources beyond discovery; absence yields hiding, not forced 404 polling.

### Information exposure

- Dialog errors surface status codes and safe field summaries; no environment values or arbitrary server cause text are rendered beyond standard API errors already handled by the R7-02 error model.
- No Secret content is involved in snapshot creation or expansion; nothing new reads or displays Secret data.
- Synthetic fixtures contain no credentials; the E2E script logs method/path only, not bodies.

### Defensive fix kept out-of-scope of security

- `EventStore.getEventsByObject` now ignores events without `involvedObject` instead of crashing on malformed items. This is a robustness fix (crash prevention), not a security control.

## Validation status

Exact commands, results, and the current E2E evidence are recorded in [`R7_04_VALIDATION.md`](R7_04_VALIDATION.md). Directed regression across dry-run (R7-02), rollout (R7-03), and storage suites passed 232/232 tests on the refreshed experimental build. E2E used local synthetic HTTP fixtures on loopback only.

## Residual risks / limits

- Snapshot deletion policies (`deletionPolicy`) belong to cluster admins; this milestone only reads and creates snapshots and never deletes `VolumeSnapshotContent`s.
- Reparse drift: if LiveMigration/other controllers change the PVC between the dry-run and execution, the preconditions reject with 409; the operator repeats with fresh state.
- Server-side dry-run remains subject to the R7-02 caveat: it cannot guarantee absence of side effects from external mutating webhooks.
- E2E is synthetic and does not certify behavior against a live CSI driver, snapshot-controller admission behavior, or a production cluster.
- Global core lint failures (298 errors / 14 warnings) and global test-suite failures persist exactly as inventoried at R7-03; none of the R7-04 changed paths appear in that inventory, but no blanket pre-existing label is asserted.
