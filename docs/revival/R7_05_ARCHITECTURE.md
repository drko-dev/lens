# OpenLens DevOps Revival — R7-05 Architecture: NetworkPolicy Matrix & Pod Traffic Visualizer

| Campo | Valor |
|---|---|
| Milestone | R7-05 — Visualizador y Matriz de NetworkPolicies |
| Worktree Directory | `/Users/gustavomarcon/Documents/lens/lens-r7-05-networkpolicy-matrix` |
| Branch | `feat/r7-05-networkpolicy-matrix` |
| Base HEAD | `6ea8bb41eb9797939ecc6d9c0da6c902017cb6f4` |
| Date | 2026-10-24 |
| Status | **IMPLEMENTADO — FRESCUEZ DE DATOS POR STORE RESUELTA — NO CERTIFICADO GLOBALMENTE** |

---

## 1. Executive Architectural Overview

The **NetworkPolicy Matrix & Pod Traffic Visualizer** provides DevOps operators with instantaneous visual clarity into the effective network access topology defined by Kubernetes `networking.k8s.io/v1` resources.

Kubernetes NetworkPolicies are notoriously counter-intuitive:
1. **Additive Semantics:** Policies only declare allowed traffic; there are no explicit "Deny" rules.
2. **Directional Isolation:** A Pod is not isolated until selected by at least one policy for that specific direction (Ingress or Egress).
3. **Dual-Direction Enforcement:** A network packet between two Pods is permitted if and only if **Source Egress is allowed AND Destination Ingress is allowed**.
4. **Logical Conjunctions:** Within a single peer, `podSelector` and `namespaceSelector` act as a logical `AND`. Across multiple peers in `from` or `to` arrays, they act as independent alternatives (logical `OR`).

The R7-05 architecture completely decouples the **evaluation engine** (pure TypeScript without DOM, React, or Electron dependencies) from the **presentation components** (Midnight Graphite-styled, compact, accessible React components).

```
+-----------------------------------------------------------------------------------+
|                            KUBERNETES DATA LAYER                                  |
|     PodStore (Pods)   |   NamespaceStore (Namespaces)   |   NetworkPolicyStore    |
|            (isLoaded / isLoading / failedLoading / lastError.statusCode)          |
+-----------------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
|                        R7-05 PURE EVALUATION ENGINE                               |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|  |     cidr.ts        |  |    selector.ts     |  |      port-resolver.ts       |  |
|  | Bitwise IPv4/IPv6  |  | matchLabels/match  |  | Named ports, endPort ranges |  |
|  | except exclusions  |  | Expressions        |  | Protocol matching (TCP/UDP) |  |
|  +--------------------+  +--------------------+  +-----------------------------+  |
|                                      |                                            |
|                                      v                                            |
|  +-----------------------------------------------------------------------------+  |
|  |                         peer-evaluator.ts                                   |  |
|  |  Namespace validation, logical AND (pod + ns), logical OR (peer list)       |  |
|  +-----------------------------------------------------------------------------+  |
|                                      |                                            |
|                                      v                                            |
|  +-----------------------------------------------------------------------------+  |
|  |                             engine.ts                                       |  |
|  |  - Isolation status determination (Default Deny vs Default Allow)           |  |
|  |  - Dual-direction connection evaluation: Source Egress + Dest Ingress       |  |
|  |  - Additive policy aggregation & verdict generation                         |  |
|  |  - Per-direction certifiability (allowedVia) for partial-data states        |  |
|  |  - Matrix build with explicit budget + partial disclosure                   |  |
|  +-----------------------------------------------------------------------------+  |
|                                      |                                            |
|                                      v                                            |
|  +-----------------------------------------------------------------------------+  |
|  |                           data-state.ts                                    |  |
|  |  Fail-closed derivation of the evaluation state from real store and        |  |
|  |  cluster state (absent / not-loaded -> unknown -> INDETERMINATE)            |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
                                       |
                                       v
+-----------------------------------------------------------------------------------+
|                     CLUSTER CONNECTION STATE (Cluster model)                      |
|        hostedClusterInjectable -> { id, disconnected, online, accessible }       |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
|                           PRESENTATION COMPONENTS                                 |
|  +-------------------------------------+  +------------------------------------+  |
|  |        NetworkPolicyMatrix          |  |         PodNetworkPolicies         |  |
|  | Compact table, multi-filter         |  | Isolation badges, policy links,    |  |
|  | Direction/Verdict/Search, tooltips  |  | expandable focused traffic matrix  |  |
|  +-------------------------------------+  +------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Pure Evaluation Engine (`packages/core/.../network-policies/engine`)

### 2.1 CIDR & Bitwise Engine (`cidr.ts`)
- **IPv4 & IPv6 Bitwise Arithmetic:** Eliminates prefix-string matching vulnerabilities. IPv4 addresses are converted into 32-bit unsigned integers; IPv6 addresses are converted into 128-bit `BigInt` representations without using ES2020-specific literal notation (`BigInt(128)`).
- **Mask Calculation:** Subnet masks `0..32` (IPv4) and `0..128` (IPv6) compute exact subnet boundaries.
- **`except` Subnet Exclusions:** Automatically tests candidate IPs against all CIDR exceptions declared in `ipBlock.except`. An address within the main CIDR but present in an exclusion CIDR evaluates as non-matching.

### 2.2 Selector Resolution (`selector.ts`)
- **Labels Storage Contract:** Inspects `pod.metadata.labels` (`Record<string, string>`) rather than string arrays.
- **Empty Selector `{}` Semantics:** An empty selector `{}` strictly matches every resource in the relevant scope (catch-all).
- **MatchExpressions:** Full support for `In`, `NotIn`, `Exists`, and `DoesNotExist` operators according to Kubernetes schema constraints.

### 2.3 Port & Protocol Resolution (`port-resolver.ts`)
- **Transport Protocols:** Supports `TCP`, `UDP`, and `SCTP`.
- **Numeric & Range Ports:** Supports exact port matching and Kubernetes `endPort` inclusive numeric intervals (`port..endPort`).
- **Named Port Resolution:** Resolves named port strings against container declarations (`container.ports[].name`) in destination Pod specifications.
- **Indeterminate Fallback:** If a named port cannot be resolved or destination pod specification is unavailable, the verdict is strictly marked **Indeterminate** (`indeterminate`), never falsely assumed as allowed.

### 2.4 Peer Resolution (`peer-evaluator.ts`)
- **Single Peer (`podSelector` + `namespaceSelector`):** Evaluated as a logical conjunction (`AND`). Both criteria must be satisfied simultaneously.
- **Namespace Verification:** Validates labels against real `Namespace` objects present in the cluster store, refusing to guess or synthesize namespace labels from the name. A `Namespace` placeholder (no uid — produced by `NamespaceStore` when cluster access is namespace-restricted) carries no label information, so the match is reported as **indeterminate** instead of "no match".
- **Empty Peer `{}`:** invalid per the `networking.k8s.io/v1` schema (a peer must specify at least one of `podSelector`, `namespaceSelector`, `ipBlock`), therefore reported as **indeterminate** — never as a definitive allow or deny.
- **Multiple Peers:** Evaluated as independent alternatives (logical `OR`).
- **Empty `from` / `to`:** an omitted or empty list does not restrict peers, matching the API
  contract ("this rule matches all sources").

### 2.5 Policy Aggregation & Isolation (`engine.ts`)
- **Effective PolicyTypes:** Correctly applies Kubernetes defaulting rules:
  - If `policyTypes` is omitted, `Ingress` is assumed.
  - If `spec.egress` contains at least one rule and `policyTypes` is omitted, both `Ingress` and
    `Egress` are assumed (an explicitly empty `egress: []` does **not** imply Egress isolation;
    source: docs "concepts/services-networking/network-policies" y API reference `NetworkPolicySpec`).
- **Per-direction certifiability (`allowedVia`):** every direction reports whether the permission
  comes from a matched rule (`matched-rule`), from the absence of selecting policies
  (`default-allow`) or from semantics not dependent on data (`not-applicable`). Under
  `partial-data`, only `matched-rule`/`not-applicable` produce a certifiable `allowed`.
- **Matrix build with explicit budget:** `buildPolicyMatrix()` returns a `MatrixBuildResult` with
  `connections`, `totalEvaluated`, `totalCandidatePairs`, `totalPossibleConnections`, `maxConnections`,
  `isPartial` and `partialReason`. Candidate peers are never truncated silently; when the budget is
  reached the omission is quantified and surfaced in the UI.
- **Additive Evaluation:** Traverses all applicable policies selecting a Pod. If any policy rule permits the connection, that direction is authorized.
- **Connection Verdict:**
  $$\text{Verdict}(A \to B) = \text{Egress}(A) \land \text{Ingress}(B)$$
  Traffic is only marked `allowed` if both the egress of source Pod $A$ and the ingress of destination Pod $B$ authorize the flow.

---

## 3. UI Presentation Architecture

### 3.0 Data State Derivation, Content Signatures & Freshness (`engine/data-state.ts`)
- **Inputs:** the real observable state of the stores in scope (`isLoaded`, `isLoading`,
  `failedLoading`, `lastError.statusCode`) plus the authentic cluster connection state.
- **Precedence (fail-closed):** `disconnected` → `permission-denied` (RBAC 403) → `partial-data`
  (other load failures) → `loading` → `unknown` (store absent or never initialized) → `ready`.
- **Guarantee:** a store that is absent or never loaded yields `unknown`, and every verdict under
  `unknown` is **indeterminate**: the UI never asserts a *Default Allow* over unknown data.
- **Connectivity precedence:** `disconnected` (explicit disconnection) → `online === false`
  (connection in progress) → `accessible === false` (reachable but access not granted) → store
  states. A reachable but inaccessible cluster is **not** considered ready.
- **Content signatures:** `computeItemsSignature()` derives a key from the membership of a store
  collection, the instance identity (a re-delivered resource is a new instance), the resource
  version, the labels and, for NetworkPolicies, the spec. It is the memoization key of the
  evaluation, because the identity of a store or of its collection does NOT change when its
  contents do.
- **Freshness (`DataFreshnessTracker`):** each store is tracked **independently**. A store is
  certified as fresh only by a delivery of its OWN resources (content signature) or by a
  **confirmed reload of that store** (`isLoading` true → false). A change exclusive to another
  store (for example new Pods) can never certify the NetworkPolicies. When the connection is lost
  or the cluster identity changes, every store becomes stale and must confirm its own reload
  before the evaluation resumes (`unknown` → `INDETERMINATE` meanwhile).

### 3.1 NetworkPolicyMatrix Component (`network-policy-matrix.tsx`)
- **Placement:** Integrated within the existing NetworkPolicy drawer directly below Ingress/Egress spec sections, and embedded in Pod Details.
- **Palette & Density:** Follows Midnight Graphite visual standards:
  - 33px row height with compact typography.
  - Accessible high-contrast verdict indicators:
    - `allowed`: Green badge with `check_circle` icon.
    - `denied`: Crimson badge with `block` icon.
    - `indeterminate`: Amber badge with `help_outline` icon.
- **Reactive Multi-Filter:**
  - Pod/IP text search.
  - Namespace selector dropdown.
  - Direction filter (`all`, `ingress`, `egress`).
  - Verdict filter (`all`, `allowed`, `denied`, `indeterminate`).
- **Limitations Disclaimer:** Displays prominent warning emphasizing that "Permitido por políticas" reflects declarative Kubernetes specifications only, and does not guarantee physical network reachability (subject to CNI plugin, Service proxying, host firewalls, or service meshes).
- **State Banners:** `disconnected`, `permission-denied` (RBAC 403), `partial-data`, `unknown`
  (store absent / not initialized) and `partial analysis` (explicit evaluation budget reached or
  namespace scope applied), each stating what is *not* being asserted.
- **Port Fidelity:** rows distinguish container-declared ports (`declared`), unrestricted rules
  (`all`) and every other potentially accessible port (`other`). The `other` row is never reported
  as allowed when the policy permits only a subset of ports.
- **Cluster Isolation:** the evaluation context carries `clusterId`; when the cluster changes, the
  filters, pagination and previously computed rows are invalidated, and the data still held by the
  stores is treated as belonging to the previous cluster (no definitive verdicts).

### 3.2 Pod Network Policies Section (`pod-network-policies.tsx`)
- **Placement:** Integrated into `PodDetails` (`packages/core/src/renderer/components/workloads-pods/pod-details.tsx`).
- **Isolation Status Badges:** Immediate indicators for Ingress and Egress isolation status,
  derived exclusively from the real state of `NetworkPolicyStore` and the real cluster state:
  - `Aislado (Default Deny Ingress)` / `No aislado (Default Allow Ingress)`
  - `Aislado (Default Deny Egress)` / `No aislado (Default Allow Egress)`
  - `Indeterminado` (store ausente o no inicializado) / `Indeterminado (datos parciales)` /
    `Desconectado` / `Permiso denegado (RBAC 403)` / `Cargando políticas...`
- **Selecting Policies Links:** Deep links to the specific selecting NetworkPolicies.
- **Interactive Traffic Matrix:** Toggleable button ("Inspeccionar matriz de tráfico del Pod") that expands the matrix scoped exclusively to the focused Pod.

---

## 4. RBAC & Data Resilience Handling

| Scenario | Derived state | System Behavior | Visual Representation |
|---|---|---|---|
| Any store failed with HTTP 403 | `permission-denied` | Fails safe; no conclusive verdict | Banner: `Acceso restringido (RBAC 403)`. Verdicts `indeterminate`. |
| Any store failed with a non-403 error | `partial-data` | Listing incomplete; only rule-based permissions stay certifiable | Banner: `Datos parciales` + razón concreta. |
| Any store loading | `loading` | Non-blocking; no verdict issued yet | Spinner + `Cargando matriz...`. |
| Any store absent or never initialized | `unknown` | **Never** asserts *Default Allow* nor a definitive block | Banner: `Estado de datos desconocido`. |
| Cluster disconnected (real `Cluster` model) | `disconnected` | Evaluation suspended; no verdict issued | Banner: `Clúster desconectado`. |
| Cluster switched | n/a | Filters, pagination and computed rows are invalidated; context carries the new `clusterId` | Matrix recomputed for the new cluster. |
| Explicit evaluation budget reached | n/a | Remaining connections are not evaluated and the omission is quantified | Banner: `Análisis parcial` with counts. |
