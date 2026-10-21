# OpenLens DevOps Revival — R4-01: Global Electron Security Audit & Extension Matrix

**Date:** 2026-10-21
**Worktree:** `/Users/gustavomarcon/Documents/lens/lens-r4-gemini`
**Branch:** `feat/r4-01-02-certification-gemini`
**Base Commit:** `49ad5a5bbe20701558553ff8d92097231ee49f95`
**Node Version:** `v20.20.2`
**Electron Version:** `22.3.3` (vendored in open-lens)
**Status:** COMPLETED — CERTIFIED AUDIT & COMPATIBILITY MATRIX

---

## 1. Executive Summary

This security audit inspects all execution contexts, windows, frame hierarchies, IPC patterns, custom protocols, navigation handlers, and permission models in OpenLens DevOps.

The audit explicitly differentiates:
1. **Confirmed Vulnerabilities** (actionable gaps that could be exploited under specific threat vectors).
2. **Architectural Risks** (inherited legacy designs requiring progressive replacement).
3. **Existing Controls** (defenses currently implemented and active).
4. **Temporarily Accepted Risks** (legacy behaviors preserved to avoid breaking third-party extensions before R4-08).

Additionally, this document delivers the **Extension Compatibility Matrix**, detailing the technical dependencies of legacy extensions and the migration path towards strict context isolation.

---

## 2. Complete Inventory of Windows & Execution Contexts

| Window / Context | Creator Location | `nodeIntegration` | `contextIsolation` | `sandbox` | Preload Script | Session Partition | Active Role |
|---|---|---|---|---|---|---|---|
| **Main Application Window** | `packages/core/.../application-window/create-electron-window.injectable.ts` | **`true`** | **`false`** | **`false`** | None | Default persist | Root UI, dock, catalog, navigation shell |
| **Cluster Frame (Iframe)** | `packages/core/.../cluster-manager/cluster-frame-handler.ts` | **`true`** (`nodeIntegrationInSubFrames`) | **`false`** | **`false`** | Inherited | Default persist | Kubernetes cluster dashboard & workload views |
| **System Proxy Resolver** | `packages/core/.../resolve-system-proxy/resolve-system-proxy-window.injectable.ts` | Default (`false`) | Default (`true`) | Default | None | Default | Headless background proxy detection |
| **R4-01 Secure Pilot Window** | `packages/core/.../secure-pilot-window/create-secure-pilot-window.injectable.ts` | **`false`** | **`true`** | **`true`** | `secure-pilot-preload.js` | `openlens-secure-pilot` (isolated) | Sandboxed, verified multi-cluster pilot |

---

## 3. Deep-Dive Security Analysis by Domain

### 3.1 WebPreferences & Isolation

#### Legacy Application Shell
- **Settings:** `nodeIntegration: true`, `nodeIntegrationInSubFrames: true`, `contextIsolation: false`.
- **Finding:** Every renderer script (and any script running within cluster iframes) has direct access to Node.js runtime primitives (`require("child_process")`, `require("fs")`, `process.env`, `Buffer`).
- **Classification:** **Architectural Risk (Accepted for R1–R4 compatibility)**.
  - *Justification:* Legacy Lens extensions require direct access to node libraries, MobX stores, and React components injected into the global window namespace. Abruptly disabling `nodeIntegration` in the main shell breaks 100% of community extensions.
  - *Mitigation:* R4-01 implements an isolated, opt-in BrowserWindow pilot (`createSecurePilotWindowInjectable`) proving that OpenLens can operate with `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`.

#### R4-01 Secure Pilot Window
- **Settings:** `nodeIntegration: false`, `nodeIntegrationInSubFrames: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, `webviewTag: false`.
- **Finding:** Renderer execution is strictly sandboxed. JavaScript execution has zero access to Node.js APIs or Electron internals. Communication occurs exclusively via `contextBridge.exposeInMainWorld("lensSecurePilotBridge", ...)`.
- **Classification:** **Existing Control (Verified)**.

---

### 3.2 Inter-Process Communication (IPC)

#### Legacy Shell IPC Architecture
- **Broadcast Mechanism:** `packages/core/src/common/ipc/ipc.ts` implements `broadcastMessage(channel, ...args)`.
- **Handling:** When invoked from a renderer (`ipcRenderer.invoke("ipc:broadcast-main", ...)`), the main process relays the payload to **all** active `WebContents` and cluster subframes without validating:
  1. The identity of the sender frame (`event.senderFrame`).
  2. The target channel's scope or authorization.
- **Classification:** **Architectural Risk**.
  - Any cluster iframe can broadcast arbitrary messages to the root frame or peer cluster iframes. While within the trust boundary of the user's desktop, malicious or compromised extension code inside one frame could manipulate application state across other frames.

#### Secure Pilot IPC Architecture
- **Handlers:** Registered strictly via `registerSecurePilotIpcHandlers` in `secure-pilot-ipc-handlers.ts`.
- **Validation Rules:**
  1. **Sender Frame Origin:** Validates that `event.senderFrame.url` precisely matches `file://${htmlPath}` using `path.resolve(fileURLToPath(url)) === path.resolve(htmlPath)`.
  2. **Top-Level Frame Requirement:** Rejects any call where `event.senderFrame.parent !== null`, preventing subframes or injected iframes from invoking pilot IPC.
  3. **Strict Allowlist:** Only `secure-pilot:get-info`, `secure-pilot:list-clusters`, and `secure-pilot:query-resource` are recognized; all other channels reject.
  4. **Immutable Scopes:** The renderer cannot supply or tamper with `clusterId`; handlers resolve cluster identity strictly from authoritative server-side mappings (`tabId -> clusterId`).
- **Classification:** **Existing Control (Verified & Tested)**.

---

### 3.3 Navigation, Window Opening & Custom Protocols

#### Navigation Handlers
- **Window Open (`setWindowOpenHandler`):**
  - **Legacy Window:** Implements `setWindowOpenHandler((details) => { openLinkInBrowser(details.url); return { action: "deny" }; })`.
  - **`openLinkInBrowser` Guard:** Strictly requires `http:` or `https:`. Rejects arbitrary schemes like `file:`, `javascript:`, `data:`, or `shell:` preventing OS command injection via protocol registration.
  - **Secure Pilot Window:** Unconditionally denies window opening (`return { action: "deny" }`).
- **Top-Level Navigation (`will-navigate` & `will-redirect`):**
  - **Legacy Window:** Did not implement `will-navigate` on the top-level window. If a click targeted `_top` with a remote URL, the entire application window could attempt to navigate remotely.
  - **Secure Pilot Window:** Explicitly intercepts `will-navigate` and `will-redirect`. If the target URL is not the authoritative local HTML file, `event.preventDefault()` blocks navigation and emits a security warning.
- **Protocol Router (`lens:`):**
  - Managed by `LensProtocolRouterMain`. Enforces `protocolScheme: "lens:"`. Validates host to only allow `app` (internal navigation) or `extension` (extension deeplinks). Rejects malformed or unexpected hosts with `RoutingError`.

---

### 3.4 Permissions & Custom Certificates

#### Permissions
- **Legacy Session:** Relies on Chromium defaults.
- **Secure Pilot Session:** Configured with an isolated partition `openlens-secure-pilot`:
  ```ts
  pilotSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  pilotSession.setPermissionCheckHandler(() => false);
  ```
  Unconditionally denies geolocation, notifications, camera, microphone, MIDI, sensors, and clipboard read requests from web content.

#### Certificates
- Implements `session.setCertificateVerifyProc(sessionCertificateVerifier)` in `packages/core/src/main/start-main-application/lens-window/application-window/create-electron-window.injectable.ts`.
- Validates cluster proxy certificates against trusted root CAs and local cluster CA bundles.

---

### 3.5 Model Context Protocol (MCP) Security Gates (R4-01A)

The stdio MCP server (`OpenLensMcpServer`) is bound by strict fail-closed constraints:

| Security Gate | Contract Requirement | Verification Result |
|---|---|---|
| **Absence of Backend** | Return `NOT_CONFIGURED` (`-32003`), never return synthetic or demo data as real. | **PASS** — Verified on all 7 read tools. |
| **Input Validation** | Reject malformed JSON-RPC, invalid identifiers, and un-allowlisted arguments. | **PASS** — Tested against regex patterns and schemas. |
| **Cluster Authorization** | Require caller authorization scope; re-check after `await` to prevent race conditions during revocation. | **PASS** — Validated in unit suite. |
| **Execution Budgets** | Bounded timeouts (5s default) with `AbortSignal`, concurrency budget (max 4 concurrent requests), max output size (1 MiB). | **PASS** — Over-budget requests rejected fail-closed. |
| **Sensitive Data Redaction** | Recursive redaction of `Secret`, passwords, tokens, Authorization headers, URLs with credentials, cyclic structures. | **PASS** — Verified against comprehensive test cases. |
| **Stdio Stream Isolation** | Reserve `stdout` strictly for JSON-RPC protocol messages. Logs and diagnostics go to stderr. | **PASS** — Verified with live spawned process. |

---

## 4. Extension Compatibility Matrix (Static Architecture Mapping)

> [!NOTE]
> This matrix represents a **static architectural analysis** of the OpenLens extension API surface across 8 primary capability domains. It evaluates interface contracts and dependency topologies. It does **not** represent runtime execution testing of third-party extension packages within the sandboxed pilot window (which is deferred to milestone R4-08).

Legacy OpenLens extensions interact with the application via `@openlens/extensions` and global dependency injection.

### 4.1 Compatibility Assessment

| Extension Capability | Architectural Dependency | Compatible with Legacy Shell? | Compatible with Sandboxed Context? | Migration Path (R4-08) |
|---|---|:---:|:---:|---|
| **Catalog Registrations** | Declarative registry (`CatalogEntity`, `CategoryFilter`) | **YES** | **YES** (via IPC Bridge) | Expose declarative catalog registration through preload context bridge. |
| **Custom Status Bar Items** | Declarative React component registration | **YES** | **PARTIAL** | Renderers cannot pass live React component instances across `contextBridge`. Requires Web Components or declarative spec. |
| **Command Palette Items** | Command registration with callback action | **YES** | **YES** (via IPC Bridge) | Register command ID and label; main/renderer dispatches action via standard IPC event. |
| **Preferences & Settings** | MobX-based settings registration | **YES** | **YES** (via IPC Bridge) | Declarative schema for preferences synced via JSON-RPC. |
| **KubeObject Details & Menus** | React component injection into object drawer | **YES** | **PARTIAL** | Requires iframe sandboxing or micro-frontend container. |
| **Direct Node.js API Access** (`fs`, `child_process`, `net`) | `nodeIntegration: true` | **YES** | **NO** | Must move backend logic to extension main process (`LensMainExtension`), communicating via IPC. |
| **Direct Kubernetes API via `node-fetch` / raw socket** | Unrestricted network from renderer | **YES** | **NO** | Route all cluster requests through LensProxy / authoritative cluster context. |
| **Direct MobX Store Mutation** | In-memory reference sharing across frames | **YES** | **NO** | Migrate to message-passing state synchronization (CQRS/Event-driven). |

---

## 5. Security Categorization Summary

### 5.1 Confirmed Vulnerabilities & Threat Vectors

1. **Unauthenticated Local Cluster Proxy via Host/Origin Header Spoofing (`127.0.0.1`):**
   - **Threat Detail:** The internal HTTP proxy (`LensProxy`) binds to `127.0.0.1` and routes requests to Kubernetes clusters by resolving the `clusterId` strictly from `req.headers.host` (or the URL prefix for `127.0.0.1`) via `getClusterForRequestInjectable`. It does **not** authenticate the incoming HTTP client (no shared secret, session cookie, capability token, or mutual handshake).
   - **Confirmed Attack Vector:** Any unprivileged process running locally on the user's host (or a local script executing in another application or browser capable of communicating with loopback) can forge `Host: <clusterId>.localhost` or issue HTTP requests to `http://127.0.0.1:<port>/<clusterId>/api/v1/...` and execute Kubernetes API calls using OpenLens's active kubeconfig credentials.
   - **Scope and Boundaries:** The proxy listens strictly on the loopback interface (`127.0.0.1`); it is never exposed directly to external networks. However, process-level isolation on the host machine is unauthenticated.
   - **Contrast with Secure Pilot:** The Secure Pilot BrowserWindow pilot achieves renderer sandboxing (`nodeIntegration: false`, `contextIsolation: true`, anti-spoofing IPC), but it does **not** resolve the proxy authentication gap. The global proxy remains shared across all frames and local processes.
   - **Remediation Requirement:** Capability-based token authorization (e.g., ephemeral per-cluster session tokens generated by main and required in `Authorization: Bearer <token>` or custom headers for proxy access).
   - **Architectural Dependency:** Remediating this requires updating all renderer cluster fetch clients (`api-manager`, `kube-api`, terminal, logs, extensions) to attach the capability token, which is dependent on renderer modernization and the decoupling work in R4-05/R4-08.
   - **Status in R4-01:** **BLOQUEADO / RIESGO HEREDADO CONFIRMADO**. Not mitigated in R4-01. Any criterion demanding end-to-end zero-risk authentication across the proxy is marked BLOQUEADO pending user risk acceptance or R4-08 completion.

2. **Lack of `will-navigate` in Legacy BrowserWindow:**
   - *Risk:* If a renderer is compromised or loads untrusted Markdown/HTML with an un-intercepted link, the root window could navigate away from local files.
   - *Remediation implemented:* Documented and mitigated in the Secure Pilot. Recommended hardening for legacy window in R4-08 without breaking internal routing.

### 5.2 Architectural Risks (Temporarily Accepted)
1. **`nodeIntegration: true` in Legacy Application Shell:**
   - *Reason:* Necessary to maintain backwards compatibility with existing ecosystem of OpenLens extensions prior to R4-08.
   - *Compensating Control:* All external links are denied and redirected to system browser via `openLinkInBrowser`. Local file system loading is restricted to packaged assets.

2. **Unvalidated Global IPC Relay (`broadcastMainChannel`):**
   - *Reason:* Used for inter-frame catalog synchronization and menu events.
   - *Compensating Control:* Secure Pilot completely bypasses this router and uses dedicated, validated channels.

### 5.3 Existing Controls (Certified Working)
1. **R4-01 Secure Pilot Sandbox:** Fully isolated, sandboxed BrowserWindow with explicit preload and anti-spoofing IPC.
2. **MCP Fail-Closed Protocol:** Strict rejection of unconfigured backends, bounded execution, and robust redaction.
3. **Safe Link Opening:** Strict scheme allowlist (`http:`, `https:` only) via `openLinkInBrowser`.
4. **Certificate Verification:** Verification procedure active for all internal proxy requests.

---

## 6. Audit Verdict

- **Secure Pilot & MCP Fail-Closed Gates:** **APPROVED & CERTIFIED**.
- **Static Extension Compatibility Matrix:** **APPROVED & COMPLETED**.
- **Local Proxy HTTP Authentication:** **BLOQUEADO (Inherited Architecture Risk — requires R4-08 capability tokens)**. Full system-wide authentication cannot be certified while the legacy proxy listens without client verification.
