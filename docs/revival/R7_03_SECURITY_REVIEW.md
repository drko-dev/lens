# OpenLens DevOps Revival — R7-03 Security Review

**Review date:** 2026-10-23
**Branch / base:** `feat/r7-devops-capabilities` / `11d47248774710b319912962ae780724c09031d6` (certified R7-02)
**Disposition:** Security corrections implemented; R7-scoped checks and refreshed E2E evidence pass. **Only a local R7-03 checkpoint commit is authorized; the milestone is not globally certified** while the global core test and lint results remain unresolved. No push or real-cluster operation was authorized or performed.

## Findings from the initial independent audit

1. `ControllerRevision` was modeled as though `revision` and `data` lived under `spec`, contrary to `apps/v1`.
2. Rollback preparation could trust a selected revision by its name and reuse an earlier template instead of proving that the live `ReplicaSet` was the same object and still had a template.
3. Asynchronous history, preparation, dry-run, execution, diff, and polling responses could outlive a closed/reused dialog or changed input/context; repeated confirmation events could race.
4. Pause/Resume used a mutation path without optimistic preconditions, allowing a stale menu action to overwrite a newer Deployment state.
5. Polling could overlap, hide persistent API failures, or leave the user without a deterministic terminal result.
6. Diagnostic/API error text and Monaco diffs could expose literal environment values or server-supplied sensitive details.
7. Earlier validation artifacts overstated global PASS, retained the 13 fixture non-null warnings, and attributed compact-density snapshots to R7-01 without sufficient evidence.

## Corrections and evidence

### ControllerRevision API fidelity

- `revision` and `data` are root fields. The fixture uses an `apps/v1 ControllerRevision` response with realistic owner reference and strategic-merge patch data, including `spec.template`.
- `data` is treated as controller-owned, format-varying `RawExtension`; image extraction is limited to recognizable Pod templates. Unknown historical payloads render **Not available**, never an inferred image.
- Added model and table coverage for root revision number, supported data, and unsupported historical payload.
- Kubernetes source references: [apps API types](https://github.com/kubernetes/kubernetes/blob/release-1.31/pkg/apis/apps/types.go), [StatefulSet revision helpers](https://github.com/kubernetes/kubernetes/blob/release-1.31/pkg/controller/statefulset/stateful_set_utils.go), [DaemonSet revision helpers](https://github.com/kubernetes/kubernetes/blob/release-1.31/pkg/controller/daemon/update.go).

### Rollback resource identity and mutation boundary

- Fresh Deployment UID must equal the selected Deployment UID. Fresh ReplicaSet UID must equal the selected revision UID; namespace, API kind/version, name, Deployment owner UID/kind/name, controller reference, and revision annotation are checked.
- Missing/replaced/pruned ReplicaSets and a missing fresh template fail closed before PATCH. The historical-template fallback was removed.
- Dry-run and execution use UID/resourceVersion preconditions. `execute()` fetches and prepares again after asynchronous work, compares the fresh plan/template with the dry-run-approved plan, rechecks context and confirmations, and has an imperative duplicate-execution guard.
- Negative Jest and Playwright cases cover a recreated ReplicaSet with the same name and a deleted revision; both assert no Deployment PATCH.

### Async lifecycle and observation

- Operation identity/generation guards discard stale history, preparation, dry-run, diff, execution, and polling responses after close/reopen, revision changes, or cluster-context changes.
- Polling is recursive one-shot scheduling (no overlap), with cancellable timers, a 120-second observation timeout, and a limit of three consecutive API failures.
- Terminal `timedout` and `unverified` states are distinct from a confirmed rollback failure. The UI warns that the API may have accepted the change even though progress could not be observed.
- Jest covers delayed responses, repeated API failures, timeout, close/reopen, context/revision changes, and duplicate execution. Refreshed Playwright evidence covers delayed Dry-Run close/switch/reopen and persistent polling errors.

### Pause / Resume concurrency

- Each action verifies the cluster before mutation, re-reads the Deployment, checks its UID and namespace/name, and is idempotent against the fresh `spec.paused` state.
- JSON Patch `test` operations on UID and resourceVersion precede the mutation. The returned object is verified before updating UI; 403/404/409 are handled without optimistic local state.
- PROD confirmation identifies the actual cluster, namespace, and Deployment. Tests cover concurrent 409 and context changes during confirmation/read; E2E confirms PROD cancellation sends no PATCH.

### Sensitive data

- Literal `env[].value` values are redacted before templates reach Monaco Diff; tests assert that sentinel credentials never appear in rendered diff text.
- Rollback errors expose safe status/field summaries rather than arbitrary server cause text. Diagnostic request logs contain method/path only; request bodies and full templates are not persisted.
- Existing Secret redaction in the R7-02 validation flow is preserved and revalidated on the new build.

## Validation status

Exact commands, full-suite failure inventory, baseline comparison scope, and current E2E evidence are recorded in [`R7_03_VALIDATION.md`](R7_03_VALIDATION.md). The refreshed R7-03 Playwright run passed all 14 checkpoints; the R7-02 regression passed all 18 checkpoints against the same refreshed macOS ARM64 experimental stage. E2E used local synthetic API fixtures on loopback only.

The global `packages/core` suite and global core ESLint are **not green**. The full-suite failure inventory is explicitly recorded without blanket attribution. A directed comparison at R7-02 HEAD reproduced the `view-with-extra-columns` and `workloads/pods` suite failures; no conclusion is made about un-compared failing suites. The density preference mechanism originated in R5-09 (`6012f4a`), while Release 6 (`e6de38e`, R6-04) applied compact density to the general list/catalog surfaces involved in the compared snapshot. This does not prove that all snapshot failures share that cause. No snapshots were updated.

## Residual risks / limits

- A Deployment can still change after the last GET; JSON Patch UID/resourceVersion tests reject the stale write with 409 rather than applying it. The operator must refresh and repeat validation.
- Historical ControllerRevision payloads outside recognized shapes intentionally show `Not available`; no unsupported format is guessed.
- Polling cannot prove the result after timeout or persistent API failure. The UI explicitly reports possible acceptance and asks the operator to inspect the original Deployment before retrying.
- E2E is synthetic and does not certify behavior against a live API server, admission policy, or real production cluster.
- Global core lint/test failures remain an approval risk; see the exact suite list and bounded baseline comparison in validation.
