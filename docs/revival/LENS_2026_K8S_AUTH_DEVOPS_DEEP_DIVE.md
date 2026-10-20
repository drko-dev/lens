# Official Lens (`2026.10.121159-latest`) Kubeconfig, Cloud Auth, Kubernetes Newer Versions & DevOps Deep-Dive (vs. OpenLens 6.5.3)

**Source Artifact**: `/Applications/Lens.app/Contents/Resources/app.asar` (`@k8slens/application-for-electron`, version `2026.10.121159-latest`)
**Evidence Base**: In-memory inspection of `package.json`, `static/build/main.js.map` (67 MB, 9,371 TypeScript/TSX sources with embedded `sourcesContent`), `static/build/lens.js.map` (110 MB, 21,138 sources), and `static/build/sub-window.js.map` (24 MB, 12,172 sources).

---

## 0. Platform & Bundled Runtime Baseline
- **Core Stack (`package.json`)**:
  - **Electron**: `^44.4.2` (up from Electron 22.3.3 in OpenLens 6.5.3)
  - **Node.js**: `^24.0.0`
  - **React**: `^19.2.0` + **MobX**: `^6.12.4`
  - **TypeScript**: `~7.0.2` (`typescript-native` / tsgo)
  - **Monaco Editor**: `^0.52.2`
- **Bundled Binaries (`/Applications/Lens.app/Contents/Resources/`)**:
  - `arm64/lens-k8s-proxy`: `0.4.0` (`go1.24.1`, `k8s.io/client-go v0.32.3`)
  - `arm64/helm`: `3.20.2` (`go1.25.9`, `k8s.io/client-go v0.35.1`, `oras.land/oras-go/v2 v2.6.0`, `packages/technical-features/helm-versions/versions.generated.json`)
  - `arm64/kubectl`: `1.27.16` default fallback binary + dynamic downloader supporting up to **Kubernetes `1.35.3`** (`packages/technical-features/_kube/kubectl/kubectl-versions/versions.generated.json`)
  - `Resources/cli/bin/lens-cli-darwin-arm64`: Lens CLI (`lens`) used for internal token credential helpers (`get-eks-token`, `get-aks-token`, `get-gke-token`) and stdio MCP server (`lens mcp-server`).

---

## 1. Kubeconfig Loading, Sync & Cloud Cluster Authentication

### 1.1 Per-Entry Kubeconfig Filtering, Diagnostics & Secret Redaction
- **Modules**:
  - `packages/technical-features/_kube/kube-utilities/src/kube-config.ts`
  - `packages/technical-features/_kube/kube-utilities/src/kube-helpers.ts`
  - `packages/technical-features/_kube/kube-utilities/src/load-config-from-file.injectable.ts`
- **What Changed**:
  - **Resilient Per-Entry Zod Filtering (`makeKubeConfigFilteringSchema` & `makeFilteredArraySchema`)**: Instead of rejecting an entire kubeconfig file when a single cluster, user, or context entry is malformed, `loadConfigFromStringWithDiagnostics(rawYaml)` filters `clusters`, `users`, and `contexts` entry-by-entry. Valid entries are kept while malformed entries are returned in `SkippedKubeConfigEntry[]` (`{ section: "clusters" | "contexts" | "users", name?: string, reason: string }`).
  - **Credential-Safe Validation Diagnostics (`describeIssue`)**: Explicitly constructs validation messages from `issue.code` and `issue.path` without echoing raw Zod input values, preventing `users` secrets (`token`, `password`, `client-key-data`) from leaking into application logs when a user entry fails validation.
  - **Expanded Kubeconfig Schema**: Full validation for `KubeConfigExecConfig` (`apiVersion`, `command`, `args`, `env`, `installHint`, `provideClusterInfo`, `interactiveMode: "Never" | "IfAvailable" | "Always"`) and `KubeConfigClusterDetails` (`disable-compression`, `proxy-url`, `tls-server-name`).

### 1.2 Kubeconfig Sync Manager & Local Kubeconfigs Connector UI
- **Modules**:
  - `packages/unknown-features/kubeconfig-sync-manager/src/watch-file-changes.injectable.ts`
  - `packages/unknown-features/kubeconfig-sync-manager/src/diff-changed-kubeconfig.injectable.ts`
  - `packages/unknown-features/kubeconfig-sync-manager/src/compute-diff.injectable.ts`
  - `packages/unknown-features/kubeconfig-sync-manager/src/discovered-local-kube-configs.injectable.ts`
  - `packages/business-features/local-kubeconfigs-connector/src/*`
- **What Changed**:
  - **Chokidar Hardening & File Size Guards**: `watch-file-changes.injectable.ts` configures `chokidar` with `depth: isFolderSync ? 0 : 1`, `awaitWriteFinish: { pollInterval: 100, stabilityThreshold: 1000 }`, `atomic: 150`, and ignores `*.lock`, `*.swp`, `.DS_Store`. It enforces strict size caps before reading: **2 MiB** for directory-synced files (`folderSyncMaxAllowedFileReadSize`) and **32 MiB** for explicitly watched single files (`fileSyncMaxAllowedFileReadSize`).
  - **UTF-8 Validation & Context Deduplication**: `diff-changed-kubeconfig.injectable.ts` decodes files with `new TextDecoder("utf-8", { fatal: true })`, logs skipped entries via `loadConfigFromStringWithDiagnostics`, splits into per-context configs via `splitConfig`, and feeds `discovered-local-kube-configs.injectable.ts`, which deduplicates contexts by cluster `id` across overlapping file/folder sync sources.
  - **Integrations UI (`local-kubeconfigs-connector`)**: Dedicated settings/integrations table (`local-kubeconfigs-sources-table`) to add/remove synced files and folders or paste raw kubeconfigs (`openKubeconfigEditorDialogInjectionToken`).

### 1.3 Direct vs. Proxy Kubeconfig Mode & `lens-k8s-proxy` Hardening
- **Modules**:
  - `packages/business-features/proxy-preferences/src/lens-internal-kube-api-proxy/bypass-lens-kube-api-proxy.tsx`
  - `packages/unknown-features/cluster/cluster-manager/main/src/kubeconfig/ensure-kubeconfig-file.injectable.ts`
  - `packages/technical-features/cluster-kubeconfig/main/src/create-cluster-kubeconfig.injectable.ts`
  - `packages/technical-features/cluster-kubeconfig/main/src/create-proxy-kubeconfig.injectable.ts`
  - `packages/unknown-features/cluster/cluster-manager/main/src/proxy/create-kube-auth-proxy.injectable.ts`
  - `packages/technical-features/internal-proxy/main/src/kube-auth-proxy-server.injectable.ts`
  - `packages/technical-features/internal-proxy/main/src/is-long-running-request.ts`
  - `src/main/lens-k8s-proxy/lens-k8s-proxy-checksums.injectable.ts`
- **What Changed**:
  - **"Bypass Lens Internal KubeApi Proxy" Preference (`bypassLensKubeApiProxyInjectable`)**: Allows users to make `kubectl` and `helm` bypass the internal Lens proxy.
    - When **enabled**, `ensureKubeconfigFileInjectable` invokes `createClusterKubeconfigInjectable`, writing `kubeconfig-direct-${clusterId}` (mode `0o600`) with the real upstream cluster URL, CA, auth config, default namespace, and `proxy-url: httpsProxy` (if configured).
    - When **disabled**, it writes `kubeconfig-${clusterId}` pointing to `${serverAddressForInternalApis}/${clusterId}` with the self-signed Lens CA and dummy basic auth (`username: "lens", password: "fake"`).
  - **`lens-k8s-proxy` Binary Integrity & Startup Recovery**:
    - Spawned via `spawnSecureInjectionToken(lensK8sProxySpecifier)` which verifies SHA-256 checksums (`lens-k8s-proxy-checksums.injectable.ts`) and reports `binary-integrity` telemetry on mismatch.
    - Enforces a 15-second startup port-announcement timeout (`waitForPortTimeoutMs`) and a 10-second `waitUntilPortIsUsed` check; if port binding times out, it kills and restarts the proxy process automatically.
    - `kube-auth-proxy-server.injectable.ts` uses a **4-hour timeout** (`fourHoursInMs`) for watches/long-running requests (`is-long-running-request.ts`) and a **30-second timeout** for standard API calls.

### 1.4 System Proxy (`PacProxyAgent`) & OS Certificate Authorities
- **Modules**:
  - `packages/technical-features/_lens/pac-proxy-agent/src/pac-proxy-agent.ts`
  - `packages/technical-features/_lens/system-proxy/main/src/resolve-system-proxy-from-electron.injectable.ts`
  - `packages/technical-features/_lens/system-proxy/main/src/resolve-proxy-window.injectable.ts`
  - `packages/technical-features/certificates/common/src/get-cas.injectable.ts`
  - `packages/technical-features/certificates/common/src/is-certificate-expired.injectable.ts`
  - `packages/unknown-features/_legacy/core/split/main/src/features/certificate-authorities/common/macos-cas.injectable.ts`
  - `packages/unknown-features/_legacy/core/split/main/src/features/certificate-authorities/common/windows-cas.injectable.ts`
- **What Changed**:
  - **`PacProxyAgent`**: Custom `agent-base` implementation that resolves PAC/system proxies via a hidden Electron `BrowserWindow.webContents.session.resolveProxy(url)` (`resolve-proxy-window.injectable.ts`), caches resolutions for 1 minute, prepends user-configured `httpsProxy`, falls back to env vars (`get-proxy-for-url.injectable.ts`), and chains through `DIRECT`, `PROXY`/`HTTP`/`HTTPS` (`hpagent`), and `SOCKS`/`SOCKS4`/`SOCKS5` (`socks-proxy-agent`).
  - **System CA Store & Expiry Filtering**:
    - macOS (`macos-cas.injectable.ts`): Extracts certs via `/usr/bin/security find-certificate -a -p` from both the user default keychain and `/System/Library/Keychains/SystemRootCertificates.keychain`.
    - Windows (`windows-cas.injectable.ts`): Spawns `win-ca/lib/roots.exe` with `maxBuffer: 128 MiB`.
    - `get-cas.injectable.ts` parses every PEM with `new crypto.X509Certificate(cert)` (`is-certificate-expired.injectable.ts`), filters out expired certificates, merges bundled CAs (`bundled-certificates.injectable.ts`), and caches them in `cached-cas.injectable.ts`.

### 1.5 Built-in Cloud Cluster Connectors & Native Token Helpers (No External Cloud CLIs Required)
All four cloud connectors live under `packages/unknown-features/builtin-entities/*` and use the bundled **Lens CLI** (`getCliPathInjectionToken`) as the kubeconfig `exec` credential plugin so users do **not** need `aws`, `az`, `kubelogin`, `gcloud`, or `gke-gcloud-auth-plugin` installed on their host:

1. **AWS EKS (`builtin-entities/aws-eks`, `technical-features/aws/aws-sso`, `business-features/aws-eks-utils`)**:
   - **Auth Flows**: Full UI and profile manager (`~/.aws/config` & `~/.aws/credentials`) for **AWS IAM Identity Center (SSO)** via `@aws-sdk/client-sso-oidc` (`RegisterClientCommand`, `StartDeviceAuthorizationCommand`) and `@aws-sdk/client-sso` (`ListAccountsCommand`, `ListAccountRolesCommand`, `GetRoleCredentialsCommand`), **IAM AssumeRole** (`@aws-sdk/client-sts`), and **IAM Access Keys / Session Tokens**.
   - **Discovery**: Auto-discovers enabled regions via `@aws-sdk/client-account` (`ListRegionsCommand`) and lists/describes EKS clusters across all regions in parallel via `@aws-sdk/client-eks` (`ListClustersCommand`, `DescribeClusterCommand`).
   - **Exec Credential (`get-eks-token.injectable.ts`)**: `update-eks-kubeconfig.injectable.ts` writes `exec: { command: cliPath, args: ["get-eks-token", clusterName, region, profile] }`. `get-eks-token` presigns an STS `GetCallerIdentity` request (`x-k8s-aws-id: clusterName`, 15-minute expiry) using `@aws-sdk/signature-v4` (`SignatureV4.presign`) and returns a `client.authentication.k8s.io/v1beta1` `ExecCredential` with `k8s-aws-v1.<base64url>`.

2. **Azure AKS (`builtin-entities/azure-aks`, `technical-features/azure/azure-sso`, `technical-features/azure/azure-client-credentials`, `business-features/azure-aks-connector`)**:
   - **Auth Flows**: Uses `@azure/identity` (`^4.13.0`: `InteractiveBrowserCredential` and `ClientSecretCredential`) with persistent encrypted cache (`@azure/identity-cache-persistence` + `@azure/msal-node-runtime`) and stale MSAL `.lockfile` cleanup (`cleanup-stale-azure-lockfile.injectable.ts`).
   - **Multi-Cloud Support (`azure-cloud.ts`)**: Supports `public` (`login.microsoftonline.com`), `us-government` (`login.microsoftonline.us`), `china` (`login.chinacloudapi.cn`), and `custom` authority/ARM endpoints.
   - **Discovery**: Discovers Tenants -> Subscriptions (`@azure/arm-subscriptions`) -> Resource Groups -> Managed Clusters (`@azure/arm-containerservice`).
   - **Exec Credential (`get-aks-token.injectable.ts`)**: `update-aks-kubeconfig.injectable.ts` writes `exec: { command: cliPath, args: ["get-aks-token", clusterName, resourceGroupName, subscriptionId, tenantId] }`. `get-aks-token` attempts `listClusterAdminCredential` (`2023-01-01`), falls back to `listClusterUserCredential` on HTTP 403, and if local accounts are disabled (`disableLocalAccounts` or `MissingClientCertError`), automatically acquires an Entra ID (AAD) token for the Azure Kubernetes Service AAD Server scope `6dae42f8-4368-4678-94ff-3960e28e3630/.default` (replacing `kubelogin`).

3. **Google Cloud GKE (`builtin-entities/gke`)**:
   - **Auth Flow**: Built-in browser OAuth2 PKCE (`S256`) flow via `google-auth-library` (`OAuth2Client`) and a loopback HTTP listener (`start-gke-oauth-flow.injectable.ts`, `create-gke-loopback-server.injectable.ts`).
   - **Discovery & Control Plane DNS Endpoints (`fetch-gke-clusters.injectable.ts`)**: Searches active GCP projects via `@google-cloud/resource-manager` (`ProjectsClient.searchProjectsAsync`) and lists clusters via `@google-cloud/container` (`ClusterManagerClient.listClusters`) over `PacProxyAgent`. Supports GKE **DNS-based control plane endpoints** (`controlPlaneEndpointsConfig.dnsEndpointConfig.endpoint`) when IP endpoints are disabled and `allowExternalTraffic` is enabled (omitting private CA data since DNS endpoints use Google public CAs).
   - **Exec Credential (`get-gke-token.injectable.ts`)**: `update-gke-kubeconfig-on-disk.injectable.ts` writes `exec: { command: cliPath, args: ["get-gke-token", accountId] }`, which exchanges the stored OAuth refresh token for a 55-minute access token and outputs `ExecCredential`.

4. **Mirantis Kubernetes Engine / MKE (`builtin-entities/mke`)**:
   - **Auth & Dual-Port TLS Verification**: Authenticates against `POST ${clusterUrl}/auth/login` (`authenticate-to-mke.injectable.ts`), inspects TLS certificates on both port `443` (MKE API) and port `6443` (K8s API) (`validate-mke-certificates.injectable.ts`), prompts interactive user approval with SHA-256 fingerprint inspection (`certificate-approval-modal.tsx`) if untrusted, and manages bearer token re-authentication (`re-authenticate-mke-cluster.injectable.ts`).

---

## 2. Kubernetes Newer Versions & Structural K8s Changes

### 2.1 Kubectl Version Support & Checksum Verification (Up to K8s 1.35)
- **Modules**:
  - `packages/technical-features/_kube/kubectl/kubectl-versions/versions.generated.json`
  - `packages/technical-features/_kube/kubectl/kubectl/src/download-kubectl.injectable.ts`
  - `packages/technical-features/_kube/kubectl/kubectl/src/get-kubectl-binary-path/check-kubectl-binary/check-kubectl-binary.injectable.ts`
  - `packages/technical-features/_kube/kubectl/kubectl/src/_shared/kubectl-binary-integrity-check.injectable.ts`
  - `packages/business-features/_kube/node-menu/src/node-drain-command-flag.injectable.ts`
- **What Changed**:
  - **Kubectl Version Map**: Supports automatic versioned `kubectl` download up to **Kubernetes `1.35` (`1.35.3`)**, including `1.34.6`, `1.33.10`, `1.32.13`, `1.31.14`, `1.30.14`, `1.29.15`, `1.28.15` (with per-OS/arch SHA-256 checksum verification in `check-kubectl-binary.injectable.ts` before execution).
  - **Version-Aware Node Drain (`node-drain-command-flag.injectable.ts`)**: Uses `--delete-emptydir-data` (replacing deprecated `--delete-local-data`).
  - **Dynamic Pod Eviction API Discovery (`packages/technical-features/_kube/pod/src/evict-pod.injectable.ts`)**: Queries `lookupApiResource({ ref: { kind: "Eviction", apiGroup: "policy" } })` to dynamically determine `policy/v1` vs `policy/v1beta1` before posting the `Eviction` subresource.

### 2.2 KubeApi, Watch Resilience & Reactive Resource Architecture Overhaul
- **Modules**:
  - `packages/technical-features/_kube/kube-api/src/kube-api.ts`
  - `packages/technical-features/kube-cluster-resources/src/kubernetes-resources-for-cluster.injectable.ts`
  - `packages/unknown-features/cluster/reestablish-watches/renderer/src/*`
  - `packages/technical-features/_kube/kube-resource/src/kube-resources.injectable.ts`
  - `packages/technical-features/_kube/kube-resource/src/patch-kube-resource.injectable.ts`
- **What Changed**:
  - **Chunked Pagination (`KubeApi.chunkedList`)**: Paginates list calls in batches of **`limit: 500`** using Kubernetes `continue` tokens, throttled by a 5-concurrent-request rate limiter (`listItemsInNamespaceRatelimiterInjectable`).
  - **Zero-Clone Fast List Parsing (`isPartialJsonApiDataShaped`)**: Removed per-object Zod parsing and deep cloning on list payloads in `KubeApi.parseResponse` to eliminate main/renderer thread stalls on large clusters.
  - **Watch Bookmarks & 120s Idle Watchdog (`LENSDESK-3627`)**:
    - `KubeApi.getWatchUrl` sets `allowWatchBookmarks: 1`.
    - `KubeApi.watch` processes `BOOKMARK` events (updating the per-namespace `resourceVersion` cursor without mutating items) and enforces a **120-second idle watchdog** (`WATCH_IDLE_TIMEOUT_MS = 120_000`) that aborts and reconnects silently dead TCP connections after sleep/NAT drops.
  - **Equal-Jitter Exponential Backoff (`LENSDESK-3411`)**: Applied in both `KubeApi.watch` (`1s` base, `5m` cap) and `kubernetes-resources-for-cluster.injectable.ts` (`5s` base, `5m` cap), resetting to `0` on the first healthy event or bookmark.
  - **Sleep/Wake & Network-Online Watch Recovery (`LENSDESK-3078`, `reestablish-watches`)**: Listens to Electron `powerMonitor` resume (`powerResumeChannel`) and browser `online` events (`networkOnlineChannel`), coalesced via a 5-second leading-edge gate (`bump-reestablish-watches-signal-debounced.injectable.ts`), triggering non-destructive re-list + re-watch while preserving current UI table state.
  - **Reference-Counted Reactive Resource Subscribables & Optimistic Concurrency Patching (`@k8slens/kube-resource`)**:
    - `kubeResourcesBunch` (`kube-resources.injectable.ts`) exposes lightweight immutable resource objects wrapped in `WeakMap`-cached subscribables; watches in `kubernetes-resources-for-cluster.injectable.ts` are reference-counted (`holders`) and automatically started/stopped as UI views mount/unmount.
    - `patchKubeResourceInjectable` (`patch-kube-resource.injectable.ts`) enforces optimistic concurrency preconditions (`metadata.uid` + `metadata.resourceVersion`) via JSON Patch `op: "test"` operations (`withPreconditionsTested`) or merge/strategic patch metadata (`withPreconditionsCarried`), and supports subresource patching (`<plural>/<subresource>`).

### 2.3 Modularized Core K8s Resources & New First-Class Kubernetes APIs / CRDs
Core K8s objects have been split out of the legacy monolith into dedicated packages under `packages/technical-features/_kube/<resource>` and `packages/business-features/_kube/<feature>` (all targeting GA `v1`/`v2` APIs such as `autoscaling/v2` for `HorizontalPodAutoscaler` with fallback negotiation to `v2beta2`/`v2beta1`/`v1`, `discovery.k8s.io/v1` for `EndpointSlice`, `policy/v1` for `PodDisruptionBudget`, `batch/v1` for `CronJob` and `Job`, `networking.k8s.io/v1` for `Ingress` and `IngressClass`, `coordination.k8s.io/v1` for `Lease`, `scheduling.k8s.io/v1` for `PriorityClass`, `node.k8s.io/v1` for `RuntimeClass`).

In addition, **5 major new Kubernetes/Cloud-Native resource families** are now built into Lens under `packages/features/*`:

1. **Kubernetes Admission Policies (`packages/features/admission-policies/*`)**:
   - `ValidatingAdmissionPolicy` (`admissionregistration.k8s.io/v1`)
   - `ValidatingAdmissionPolicyBinding` (`admissionregistration.k8s.io/v1`)
   - `MutatingAdmissionPolicy` (`admissionregistration.k8s.io/v1` with automatic fallback to `v1beta1` and `v1alpha1` — explicitly prepared for K8s 1.32–1.36+)
   - `MutatingAdmissionPolicyBinding` (`admissionregistration.k8s.io/v1` with fallback to `v1beta1` and `v1alpha1`)
   - Includes CEL expression viewers, cross-resource binding resolution (`cross-resource/matching-policies.ts`), and details panels.

2. **Dynamic Resource Allocation / DRA (`packages/features/dra/*` — K8s 1.31–1.34+ GPU/Accelerator API)**:
   - `DeviceClass` (`resource.k8s.io/v1`)
   - `ResourceClaim` (`resource.k8s.io/v1`)
   - `ResourceClaimTemplate` (`resource.k8s.io/v1`)
   - `ResourceSlice` (`resource.k8s.io/v1`)
   - Includes Pod details integration (`pod-resource-claims.injectable.tsx`), allocation status badges, and Ask AI context adapters.

3. **Kubernetes Gateway API v1 / v1.5 (`packages/features/gateway-api/*`)**:
   - `GatewayClass` (`gateway.networking.k8s.io/v1`)
   - `Gateway` (`gateway.networking.k8s.io/v1`)
   - `HTTPRoute` (`gateway.networking.k8s.io/v1`)
   - `GRPCRoute` (`gateway.networking.k8s.io/v1`)
   - `TLSRoute` (`gateway.networking.k8s.io/v1` with `v1alpha3` / `v1alpha2` fallback)
   - `ReferenceGrant` (`gateway.networking.k8s.io/v1` with `v1beta1` fallback)
   - `BackendTLSPolicy` (`gateway.networking.k8s.io/v1`)
   - `ListenerSet` (`gateway.networking.k8s.io/v1`)
   - `TCPRoute` (`gateway.networking.k8s.io/v1alpha2`) & `UDPRoute` (`gateway.networking.k8s.io/v1alpha2`)

4. **Built-in Argo CD Integration (`packages/features/argo/*`)**:
   - Native support for `argoproj.io/v1alpha1` `Application`, `ApplicationSet`, and `AppProject`, plus `ArgoClusterApi` and `ArgoRepositoryApi` (which watch Kubernetes `Secret` resources filtered server-side with `labelSelector: "argocd.argoproj.io/secret-type=cluster"` / `"repository"`).
   - Full Argo CD Overview dashboard, resource tree/status views, Sync / Refresh / Suspend actions, and Ask Prism AI actions.

5. **Built-in Flux CD Integration (`packages/features/flux/*`)**:
   - Native support with `checkPreferredVersion: true` version negotiation across:
     - `Kustomization` (`kustomize.toolkit.fluxcd.io/v1`, fallback `v1beta2`, `v1beta1`)
     - `HelmRelease` (`helm.toolkit.fluxcd.io/v2`, fallback `v2beta2`, `v2beta1`)
     - Sources (`source.toolkit.fluxcd.io/v1`): `GitRepository`, `HelmRepository`, `HelmChart`, `Bucket`, `OCIRepository` (`v1` / `v1beta2`)
     - Notifications (`notification.toolkit.fluxcd.io`): `Alert` (`v1beta3`/`v1beta2`/`v1beta1`), `Provider` (`v1beta3`/`v1beta2`/`v1beta1`), `Receiver` (`v1`/`v1beta2`/`v1beta1`)
     - Image Automation (`image.toolkit.fluxcd.io/v1`, fallback `v1beta2`/`v1beta1`): `ImagePolicy`, `ImageRepository`, `ImageUpdateAutomation`
   - Includes Flux CD Overview dashboard, Reconcile / Suspend / Resume actions, and Ask Prism AI integration.

---

## 3. DevOps, Security, AI & Platform Features

### 3.1 Lens Prism (Built-in Multi-Provider AI Assistant & Agent Engine)
- **Modules**: `packages/features/prism/*` (19 subpackages, ~800 source files)
- **Architecture & Capabilities**:
  - **AI Engine (`packages/features/prism/ai-engine`)**: Built on Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/azure`, `@ai-sdk/openai`) with streaming tool calls, prompt caching (`prompt-caching.ts`), W3C traceparent/span tracing (`get-traceparent.injectable.ts`), and JSON Schema validation via Ajv.
  - **5 AI Providers (`packages/features/prism/ai-providers/*`)**:
    1. `ai-provider-for-lens-gpt` (Mirantis-hosted Lens Prism cloud models)
    2. `ai-provider-for-anthropic` (Claude models)
    3. `ai-provider-for-open-ai` (OpenAI models)
    4. `ai-provider-for-azure` (Azure OpenAI deployments)
    5. `ai-provider-for-open-ai-compatible` (Local/custom OpenAI-compatible endpoints such as Ollama, vLLM, LiteLLM)
  - **Ask Mode vs. Agent Mode Skills**:
    - `kubernetes-ai/src/kubectl-skill.injectable.tsx`: In **Ask Mode**, restricts `kubectl` to read-only verbs (`get|describe|logs|top|api-resources|api-versions|cluster-info|config|events|auth|explain|version`) and blocks shell metacharacters.
    - `ai-terminal-skill/src/terminal-skill.injectable.ts`: In **Agent Mode**, executes full shell/CLI commands with cluster `KUBECONFIG` and versioned `kubectl` injected into `PATH`.
    - `ai-fetch-skill` & `ai-internet-search-skill`: Fetches documentation URLs as Markdown (`fetchTextOrHtmlAsMarkdownInjectionToken`) and performs web searches with LRU caching.
  - **Deep UI Integration (`ask-prism-consumers`, `kube-resource-as-ai-context`, `ai-kube-resource-links`, `prism-ui-controls-for-kube-resources`)**: Context-aware "Ask Prism" actions on all 36+ built-in K8s resource types, Helm releases, Cost Monitoring, Argo CD, and Flux CD, plus clickable Kubernetes resource pills inside AI chat responses.

### 3.2 Built-in Model Context Protocol (MCP) Server (`lens mcp-server`)
- **Modules**:
  - `packages/technical-features/mcp-server/*`
  - `packages/technical-features/mcp-kubernetes-tools/*`
  - `packages/technical-features/mcp-prometheus-tools/*`
  - `packages/technical-features/mcp-dock-tools/*`
  - `packages/technical-features/mcp-navigation-tools/*`
  - `packages/business-features/mcp/*`
- **Architecture & Capabilities**:
  - Runs an MCP stdio server (`@modelcontextprotocol/sdk/server/mcp.js`, server name `lens-desktop`) invoked via `<lens-cli> mcp-server` and automatically writes `~/.k8slens/.mcp.json` (`write-mcp-config-file.injectable.ts`).
  - Wraps all tool handlers with UTF-8 boundary-safe output truncation (`truncateAtUtf8Boundary`) and exception isolation (`createSafeHandler`).
  - **Built-in MCP Tool Suites**:
    - **Kubernetes Tools (`mcp-kubernetes-tools`)**: `list-clusters`, `connect-cluster`, `disconnect-cluster`, `kubectl`.
    - **Prometheus Tools (`mcp-prometheus-tools`)**: `execute-query`, `execute-range-query`, `list-metrics`, `get-metric-metadata`, `get-label-values`, `get-alerts`, `get-targets`.
    - **Dock Tools (`mcp-dock-tools`)**: `open-terminal`, `send-terminal-command`, `open-logs`, `create-resource`, `edit-resource`.
    - **Navigation Tools (`mcp-navigation-tools`)**: `show-resource-tab`, `open-resource-details`.

### 3.3 External AI Coding Agent Launcher, UI Driving & Dynamic Features (AI-Built Extensions)
- **Modules**:
  - `packages/features/ai-tools/*` & `packages/features/ai-tools-contracts/*`
  - `packages/features/ai-tool-driving/*`
  - `packages/features/ai-tool-publishing/*`
  - `packages/business-features/dynamic-features/*` & `packages/business-features/dynamic-features-preferences/*`
- **Architecture & Capabilities**:
  - **External AI CLI Detection & Integration (`built-in-tools.injectable.tsx`)**: Auto-detects and launches **Claude Code (`claude`)**, **GitHub Copilot CLI (`copilot`)**, **Google Antigravity CLI (`agy`)**, **OpenAI Codex CLI (`codex`)**, and **SST OpenCode (`opencode`)** either in Lens's integrated terminal tab (`terminal-for-main-view-tab`) or an external OS terminal, automatically seeding `AGENTS.md` / `CLAUDE.md` and skills directories.
  - **AI Tool UI Driving (`packages/features/ai-tool-driving/*`)**: Exposes tools (`click`, `type-text`, `press-key`, `read-text`, `screenshot`, `wait-for`, `evaluate`, `list-lens-windows`, `set-driving-speed`, `conclude-driving`) allowing external AI coding agents (via MCP) to visually drive and test Lens windows with animated pointer/outline cues (`driving-cues.tsx`) and user confirmation modals (`ai-tool-access-confirmation-modal.injectable.tsx`).
  - **Dynamic Features & Hot Feature Replacement (`packages/business-features/dynamic-features/*`)**:
    - Writes comprehensive extension SDK instructions and helper scripts into `~/.k8slens/extensions/extension-development-instructions/` (`write-extension-development-instructions.injectable.ts`).
    - Watches local extension `package.json` / entrypoint builds and performs live **Hot Feature Replacement** (`watching-for-hot-feature-replacement.injectable.ts`, `evict-extension-from-node-require-cache.injectable.ts`) in a module sandbox (`get-module-sandbox.injectable.ts`).
    - Provides `POST /extensions/publish` (`ai-tool-publishing/main/src/publish-route.injectable.ts`) so an AI agent can trigger Lens's interactive npm publishing dialog and await the user's publish outcome.

### 3.4 Security Center (Trivy Operator & Registry Vulnerability Scanning)
- **Modules**: `packages/business-features/security-center/*`
- **Architecture & Capabilities**:
  - Auto-detects Aqua Security **Trivy Operator** CRDs (`detect-trivy-operator.injectable.ts`: `vulnerabilityreports.aquasecurity.github.io`, `configauditreports.aquasecurity.github.io`, `exposedsecretreports.aquasecurity.github.io`, `rbacassessmentreports.aquasecurity.github.io`, `clusterrbacassessmentreports.aquasecurity.github.io`) and offers a guided Trivy Operator installation modal (`install-trivy-operator-modal.injectable.tsx`) if absent.
  - Combines in-cluster Trivy Operator reports with Lens OCI Image / Registry vulnerability stores (`oci-image-store.ts`, `registry-vulnerability-store.ts`) across a dedicated **Security Overview** dashboard, **Configuration Audits**, **Images**, **Roles**, and embedded **Vulnerabilities / Config Audit tabs** inside Pod, Deployment, DaemonSet, StatefulSet, ReplicaSet, Job, CronJob, Service, Role, and ClusterRole details panels.

### 3.5 Cost Monitoring (OpenCost, Kubecost & Zero-Backend Cloud Price Estimator)
- **Modules**: `packages/features/cost-monitoring/*`
- **Architecture & Capabilities**:
  - Supports **OpenCost** (`opencost-provider.injectable.ts`), **Kubecost** (`kubecost-provider.injectable.ts`), and a **Built-in Estimated Cost Provider** (`estimated-cost-provider.injectable.ts`) that works out-of-the-box using only Prometheus metrics (`allocation-queries.ts`) and bundled **AWS, Azure, and GCP instance pricing catalogues** (`aws-price-catalogue.ts`, `azure-price-catalogue.ts`, `gcp-price-catalogue.ts`), plus live Azure Retail Prices API refresh (`fetch-azure-prices.injectable.ts`) and custom per-node/resource rate overrides (`rate-overrides.injectable.ts`).
  - Features a Cost Dashboard (cost trend charts, idle cost toggle, efficiency metrics, namespace breakdown table) and **Optimize Cost with AI** (`optimize-cost-with-ai.injectable.ts`).

### 3.6 Additional Platform, Observability & Governance Enhancements
- **Prometheus & VictoriaMetrics / StackLight (`packages/technical-features/prometheus/common/src/*`)**: Added native **VictoriaMetrics** (`victoria-metrics-provider.injectable.ts`, `victoria-metrics-single-provider.injectable.ts`) and **Mirantis StackLight** (`stacklight-provider.injectable.ts`) metric providers, plus per-cluster HTTPS (`use-https-for-requests-prometheus-settings.injectable.ts`) and empty-container filtering (`filter-empty-containers-prometheus-settings.injectable.ts`).
- **Logical Kubernetes Applications View (`packages/technical-features/_kube/application-instance/*`, `packages/business-features/kube-applications/*`)**: Groups workloads (`Deployment`, `DaemonSet`, `StatefulSet`), `Service`, `Ingress`, and `Pod` objects into composite **Applications** based on `app.kubernetes.io/*` labels with aggregate health phases.
- **Deployment List Insights & Table Export (`packages/business-features/_kube/deployment-list-insights/*`, `packages/business-features/item-list-export*`)**: Interactive insight summary bars above resource tables (Availability, Status, Warnings, Namespaces) and CSV/JSON table export across all K8s resource lists.
- **Editor 2.0 Diff & Revert Tools (`packages/business-features/kube-resource-editing/edit-resource-tools/*`)**: Live side-by-side Monaco diff mode (`toggle-edit-resource-diff-mode.injectable.ts`) and one-click revert (`revert-edit-resource.injectable.ts`) in dock edit tabs.
- **Multi-Window / Sub-Window Architecture (`packages/features/sub-window/*`, `static/build/sub-window.js`)**: Allows detaching views and extensions into separate Electron `BrowserWindow` instances (`sub-window.html`) with synchronized state.
- **Enterprise Extension Governance (`packages/business-features/extension-governance/*`)**: Enforces JWT-based organization policies (`extensionGovernanceClaimsOf(decodedToken)`): extension allowlists/blacklists (`isBlacklisted`), auto-pushed extensions (`pushed`), marketplace keyword filters, and restrictions on local extension loading (`localExtensionsAllowed`) and publishing (`publishingAllowed`).
