# H8.8-04a — Safe SnapshotSource Contract & Offline Kubernetes Simulation

Decouples Kubernetes snapshot collection from `LocalIncidentScanner` via a strict `SnapshotSource` contract and introduces `FakeK8sSnapshotSource` for 100% offline deterministic simulation. `LocalIncidentScanner` and `DeterministicRulesEngine` remain pure evaluation engines with zero embedded Kubernetes client queries or live watchers.

## Quick Path

1. **Inject or instantiate `FakeK8sSnapshotSource`** (`fake-k8s-snapshot-source.injectable.ts`) and wire it into `LocalIncidentScanner`.
2. **Start the scanner** with an explicit `LocalScannerScope` (`clusterId`, `namespace`).
3. **Collect and evaluate snapshots** via `await scanner.scanFromSource({ scenarioId, user, signal })`.

## Architecture & Interfaces

| Component | File | Responsibility |
|-----------|------|----------------|
| `SnapshotSource` | `packages/core/src/common/incident/local-scanner-types.ts` | Read-only contract returning a scope-bound `SnapshotSourceEnvelope` wrapping `K8sSnapshot`. |
| `SnapshotAuthorizationGate` | `packages/core/src/main/incident-scanner/snapshot-source.ts` | Pre-collection security gate enforcing cluster/namespace/user scope, positive verb/resource allowlists, and optional broker delegation. |
| `BrokerSnapshotAuthorizationAdapter` | `packages/core/src/main/incident-scanner/snapshot-source.ts` | Adapts `IncidentBrokerService.executeDiagnosticOperation` to authorize snapshot reads under double-identity (`USER_AUTHZ ∧ AGENT_AUTHZ`) for future real cluster integration. |
| `DisabledRealK8sSnapshotSource` | `packages/core/src/main/incident-scanner/snapshot-source.ts` | Fail-closed guard (`REAL_K8S_CONNECTIVITY_DISABLED`) ensuring real cluster connections remain disabled in H8.8-04a. |
| `FakeK8sSnapshotSource` | `packages/core/src/main/incident-scanner/fake-k8s-snapshot-source.ts` | Deterministic offline simulator generating scoped Pods, Deployments, and Events for 7 operational failure classes and adversarial conditions. |
| `LocalIncidentScanner.scanFromSource` | `packages/core/src/main/incident-scanner/local-incident-scanner.ts` | Collects from `SnapshotSource`, validates TOCTOU scope generation and schema limits, and delegates evaluation to `DeterministicRulesEngine`. |

## Deterministic Scenarios Reproduced

| Scenario ID | Resources Generated | Signals Produced |
|-------------|---------------------|------------------|
| `crash_loop_backoff` | `Pod` (`waiting.reason = CrashLoopBackOff`) | `CRASH_LOOP_BACKOFF` |
| `image_pull_backoff` | `Pod` (`waiting.reason = ImagePullBackOff`) | `IMAGE_PULL_BACKOFF` |
| `oom_killed` | `Pod` (`lastState.terminated.reason = OOMKilled`, exit code `137`) | `OOM_KILLED` |
| `frequent_restarts` | `Pod` (`restartCount = 6 >= restartThreshold`) | `ABNORMAL_RESTARTS` |
| `pending_pods` | `Pod` (`phase = Pending`), `Deployment` (`availableReplicas = 0`, `ProgressDeadlineExceeded`), `Event` (`FailedScheduling`) | `ROLLOUT_DEGRADED`, `WARNING_EVENT` |
| `readiness_failure` | `Pod` (`ready = false`), `Deployment` (`availableReplicas = 0`, `ProgressDeadlineExceeded`), `Event` (`Unhealthy`) | `ROLLOUT_DEGRADED`, `WARNING_EVENT` |
| `event_anomalies` | Obsolete events (`2h`, `24h` old), duplicate events, and out-of-order timestamps | Filters obsolete events, sorts chronologically, and consolidates duplicates into 1 `WARNING_EVENT` |

## Security Decisions

- **Strict Read-Only Allowlist**: Only `list` and `get` verbs over `pods`, `deployments`, `statefulsets`, `daemonsets`, `events`, and `nodes` are permitted.
- **Explicit Prohibition of Sensitive & Mutating Operations**: Reading `Secrets` or `ServiceAccounts`, creating tokens (`TokenRequest` / `serviceaccounts/token`), subresources (`exec`, `attach`, `port-forward`, `proxy`), real watchers (`watch`), and all write verbs (`create`, `update`, `patch`, `delete`, `apply`) throw `SnapshotSourceSecurityError` (`403`).
- **Scope & Multi-Cluster Isolation**: Every request is locked to `(clusterId, namespace, user)`. Cross-cluster and cross-namespace requests fail closed (`CLUSTER_SCOPE_VIOLATION`, `NAMESPACE_SCOPE_VIOLATION`). `LocalIncidentScanner` tracks `scopeGeneration` to discard in-flight snapshots if the scanner is stopped, disposed, or switched to another cluster.
- **Deep Schema & Size Validation**: `validateK8sSnapshot` enforces the 256 KiB payload cap, 50-item per-array cap, prototype pollution checks, required metadata fields, and rejects smuggled `Secret` objects inside snapshot arrays.

## Pending Risks for Real Kubernetes Connection (H8.8-04b)

1. **API Server Pagination & ResourceVersion Bounds**: Real cluster `list` calls on large namespaces must enforce `limit` and `timeoutSeconds` at the Kubernetes API transport layer before deserializing responses in memory.
2. **Ephemeral Technical ServiceAccount Lifecycle**: Live cluster reads via `BrokerSnapshotAuthorizationAdapter` must bind short-lived `TokenRequest` credentials per cluster and revoke them immediately upon cluster disconnect or session invalidation.
3. **Rate Limiting & Circuit Breaking**: Real API server `429 Too Many Requests` and `403 Forbidden` responses must trigger exponential backoff on the scanner scheduler without blocking the Electron Main event loop.
