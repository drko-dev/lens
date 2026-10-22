# OpenLens DevOps Revival — R4-07 Validation Report

## Images and contextual observability

- Branch: `feat/r4-workspace-security`, base `7d17d02` (R4-06B).
- Date: 2026-10-21
- Verdict: **image provenance and UID-verified ownership navigation implemented and verified in the packaged arm64 app (11/11 E2E scenarios). Alerts are not implemented (no alert source exists in the product; see section 5).** Not committed.

## 1. Scope (from `R4_IMPLEMENTATION_CHECKLIST.md`)

| Checklist item | Status |
|---|---|
| Distinguish `spec.image` tag, runtime imageID/digest and verifiable registry metadata | Done. Registry metadata is never fetched and is always shown as "not verified". |
| Navigation Deployment → ReplicaSet → Pod → container/image; optional metrics/alerts views | Navigation done (UID-verified). Metrics: existing R3-06 views reused unchanged; missing metrics verified. Alerts: not implemented. |
| No image download or registry contact without authorization and credential handling | Done: no network access added; no registry client exists. |
| Tests for UID/rollout changes, missing metrics, RBAC and GUI; `R4_07_VALIDATION.md` | Done (sections 3–4). |

## 2. Architecture and files

### Image provenance

- `packages/core/src/common/k8s-api/endpoints/container-image.ts`: new pure `describeContainerImage(specImage, imageID)`, reusing the R3-05 `parseContainerImage` (exports unchanged). Returns the declared reference, `declaredKind` (`digest-pinned` / `tag` / `untagged` = implicit `:latest`), the runtime digest parsed from `imageID` (schemes `docker-pullable://`, `docker://`, `containerd://`, `cri-o://`; `repo@sha256:…` or bare `sha256:…`; strict 64-hex validation), `runtimeStatus` (`resolved` / `unresolved` / `unparseable`), `mismatch` (only when the spec is digest-pinned and the running digest differs) and the constant `registryMetadataVerified: false`.
- `packages/core/src/renderer/components/workloads-pods/pod-details-container.tsx` (+ `.scss`): the single image badge is replaced by Declared / kind / Running digest (short form, full value in `title`) / mismatch warning / "Registry metadata not verified". Applies to containers, init containers and (new) ephemeral containers. Also fixes the pre-existing duplicated "Reason:" in the last-state block.
- `packages/core/src/renderer/components/workloads-pods/pod-details.tsx`: read-only "Ephemeral Containers" section.
- `packages/kube-object/src/specifics/pod.ts`: typing only (`spec.ephemeralContainers: Container[]`, `status.ephemeralContainerStatuses`).

### Ownership

- `packages/core/src/common/k8s-api/owner-reference.ts`: pure `resolveOwnerReference(ref, candidates)` → `verified` (same uid), `stale` (same kind/name/namespace, different uid: owner recreated) or `missing` (not loaded, forbidden, deleted or no API). Namespaced candidates must be in the ref's namespace.
- `packages/core/src/renderer/components/kube-object-meta/kube-object-meta.tsx`: "Controlled By" keyed by uid; link only when `verified`; `stale` and `missing` are shown as text without a link (`data-testid=owner-ref-<uid>`, `data-owner-state`). Previously the link was built by name and could open a recreated owner after a rollout.
- `packages/core/src/renderer/components/workloads-deployments/store.ts` (+ `store.injectable.ts`): `getChildPods(deployment)` returns pods owned by uid by the ReplicaSets owned by uid by the deployment (was: label selector match, which included pods of other controllers sharing labels). Affects the deployment details pod list and `getStatuses` counts.
- `packages/core/src/renderer/components/__tests__/deployments.store.test.ts`: fixtures now own pods through a ReplicaSet; assertions unchanged.

### Tests added

- `packages/core/src/common/k8s-api/endpoints/__tests__/r4-07-image-provenance.test.ts`
- `packages/core/src/renderer/components/workloads-pods/__tests__/r4-07-pod-container-image.test.tsx`
- `packages/core/src/common/k8s-api/r4-07-owner-reference.test.ts`
- `packages/core/src/renderer/components/kube-object-meta/r4-07-kube-object-meta.test.tsx`
- `packages/core/src/renderer/components/workloads-deployments/r4-07-child-pods.test.ts`

Untouched: the local lens proxy, R4-01…R4-06 code, production controls, cluster identity (R4-04 tool context).

## 3. Static checks and unit tests

Isolated tree: `git worktree` at `7d17d02` plus the 15 R4-07 files. Node v20.20.2.

| Gate | Result |
|---|---|
| Monorepo build | 40/40 projects, exit 0 |
| `tsc --noEmit -p tsconfig.json` (core) | exit 0 |
| `eslint --max-warnings 0` on the 14 core TS/TSX files and `kube-object/src/specifics/pod.ts` | exit 0 |
| Jest `--ci`, targeted: `common/cluster`, `common/workspace`, `common/k8s-api`, `features/workspace-tabs`, `main/__test__`, `main/detached-tool-windows`, `main/mcp`, `secure-pilot-window`, `main/shell-session`, `main/routes/port-forward`, `renderer/api`, `renderer/components/{__tests__,dock,kube-object-menu,kube-object-meta,workloads-pods,workloads-deployments,workloads-replicasets}`, `renderer/port-forward` | 98/99 suites, 970/972 tests, 27/27 snapshots, none written. The 2 failures are in `common/k8s-api/__tests__/api-manager.test.ts` and fail identically on the clean `7d17d02` tree. |
| Jest `--ci src/features` (not fully green) | 1213 passed, 140 failed. The clean `7d17d02` tree (same built dists) fails the same 140 tests; per-test comparison: 0 new failures. These are pre-existing (sidebar snapshots, helm chart dock tab). |

## 4. Packaged-app E2E

- `electron-builder --mac dir --arm64`, unsigned, exit 0. Electron 22.3.3.
- `app.asar` SHA-256: `d0c860edff8a19d313552bf18ea067b58b0d354959021ae657974fb6d9f4beea`
- Isolation: temporary `HOME`, `CICD`, `KUBECONFIG`; proxy env cleared. Two synthetic apiservers on 127.0.0.1 (`dev-synthetic` development, `prod-synthetic` production with distinct uids). Objects: Deployment `web`; ReplicaSets `web-new` (rev 2) and `web-old` (rev 1) owned by it; pods `web-new-a` (tag, resolved `docker-pullable://` digest, init container), `web-old-b` (old ReplicaSet, bare `sha256:` imageID), `pinned-0` (digest-pinned, different running digest), `stray-0` (same labels, owned by another controller), `stale-0` (owner ref with the name of `web-new` but a different uid), `pending-0` (ContainerCreating, no imageID). PROD forbids `replicasets` (synthetic RBAC: SSAR denied, 403 on list). No real cluster, no `~/.kube`, no registry.

| ID | Scenario | Result |
|---|---|---|
| I0 | Pods page opened first (ReplicaSets page never visited): owner of `web-new-a` resolves `verified` | PASS |
| I1 | `web-new-a`: Declared `nginx:1.25`, kind "tag (mutable)", running digest `sha256:aaaa…` with the full digest in `title`, init container digest `sha256:eeee…`, "Registry metadata not verified", no mismatch | PASS |
| I2 | `pinned-0`: kind "digest-pinned", warning "running digest differs from the digest declared in the spec" | PASS |
| I3 | `pending-0`: "not resolved yet", kind "implicit :latest"; `web-old-b` bare `sha256:` imageID parsed | PASS |
| O1 | Controlled By: `web-new-a` verified with link; `stale-0` "stale reference (owner recreated, uid mismatch)" without link; `stray-0` missing without link | PASS |
| O2 | Navigation by verified links: Pod `web-new-a` → ReplicaSet `web-new` → Deployment `web` | PASS |
| O3 | Deployment `web` pod list: `web-new-a`, `web-old-b`, `pending-0`; excludes `stray-0`, `stale-0`, `pinned-0` | PASS |
| M1 | No metrics provider: drawer renders, "Metrics not available" shown | PASS |
| R1 | PROD with `replicasets` forbidden: owner `missing` without link, image provenance still shown, no DEV uid in the PROD drawer | PASS |
| P1 | Resource use: app RSS 896 MB before opening a cluster; 15 drawer open/close cycles 926 → 929 → 918 → 921 → 925 → 925 MB (no growth) | PASS |
| Z1 | App close: 0 app processes; 0 synthetic-API processes after the run | PASS |

Console: 1 error, `illegal access`, emitted by the main window. Running the same runner against the R4-06 binary (`7477ac3d…`) produces the same error, so it is pre-existing. That control run also showed the R4-06 binary listing `stray-0` under the deployment (O3) and no verified owner states (O1), confirming the defects fixed here.

## 5. Not implemented / limitations

- **Alerts are not implemented.** No alert source is defined for the product (no Alertmanager, PrometheusRule or other provider integration), so there is nothing to display. No alert system exists in this build; this remains a pending requirement until a source is defined.
- **Registry metadata** is never fetched (no credentials handling exists), so it is always "not verified". No signature or provenance attestation checks.
- Deployment pod list now depends on the ReplicaSet store: if ReplicaSets are forbidden by RBAC or not loaded, the deployment shows no child pods (previously it showed label-matched pods, including foreign ones).
- **RBAC denied vs. non-existent owner is not distinguished.** Owner kinds forbidden by RBAC, not yet loaded, without a registered API, or really deleted all show as `missing` (text, no link). Telling "forbidden" apart from "does not exist" would need the store's access-review state; it was deliberately not added in R4-07 to avoid an uncertified functional change. Pending.
- **Invalid declared digest (known limitation):** a malformed digest in `spec.image` (e.g. `nginx@sha256:abc`, not 64 hex characters) is not treated as digest-pinned; it is shown as a tag and never triggers a mismatch warning.
- Ephemeral container fields are cast locally in core because core consumed the previous `kube-object` build during development; the typing is in `pod.ts`.
- Synthetic APIs only: no real apiserver, kubelet `imageID` formats beyond the listed schemes, real RBAC, metrics provider or registry. Unsigned build.
- Inherited and unchanged: the local lens proxy has no client authentication (critical blocker for the Release 4 certification).
