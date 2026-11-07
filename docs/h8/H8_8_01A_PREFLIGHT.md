# H8.8-01a — Preflight Audit: Secure AI Provider Transport Infrastructure

**Date:** 2026-11-07  
**Branch:** `feature/h8-8-01a-secure-ai-transport`  
**Base Commit:** `764474ff` (feature/h8-8-ai-incidents-real-integration)  
**Target:** Safe, decoupled, and testable HTTP transport infrastructure for AI providers without real external network traffic.

---

## 1. Executive Summary

Milestone H8.8-01a establishes the transport-level contracts, security policies, and adversarial testing infrastructure required before connecting any real external AI provider (OpenAI, Anthropic, Gemini).

In this milestone:
1. **Zero Real Network Calls:** All external network access remains disabled.
2. **Decoupled Architecture:** `AiProviderAdapter` interacts with an injectable `SecureAiTransport` abstraction rather than directly using `fetch`, `axios`, or vendor SDKs.
3. **Comprehensive SSRF & Threat Defense:** In-depth mitigation against DNS rebinding, malicious redirects, encoded IP formats, IPv6 mapping, metadata service access, and proxy manipulation.
4. **Resilience & Budget Invariants:** Strict request timeouts, bounded response sizes, atomic cancellation via `AbortSignal`, typed error categorization, and safe credential handling.

---

## 2. Current Architecture Inventory

### 2.1 AI Diagnostic Engine & Adapter Layer
- **`AiDiagnosisEngine`** (`packages/core/src/main/ai-diagnostics/ai-diagnosis-engine.ts`):
  - Manages single-use ephemeral consent tokens (`prepareConsentPreview` -> `executeDiagnosis`).
  - Verifies cryptographic fingerprint of evidence snippets and ephemeral context files.
  - Re-verifies AI profile immutability between consent preview and execution.
  - Enforces `AiBudgetTracker` request quotas.
  - Disallows external providers via fail-closed guard (`EXTERNAL_PROVIDER_DISABLED`).
- **`AiProviderAdapter`** (`packages/core/src/main/ai-diagnostics/providers/ai-provider-adapter.ts`):
  - Interface: `generateDiagnosis(context: DiagnosisPromptContext, options: DiagnosisExecutionOptions): Promise<RawDiagnosisResult>`.
  - Implementations:
    - `MockAiProviderAdapter`: deterministic synthetic diagnosis with configurable behaviors (`conclusive`, `inconclusive`, `hallucinated_citation`, `timeout`, `excessive_tokens`, `custom`).
    - `ExternalAiProviderStub`: fail-closed stub throwing error on external invocation.
- **Factory:** `createAiProviderAdapter(profile, mockOverride)`.

### 2.2 Security, Credentials & Storage
- **`AiProfileManager`** (`packages/core/src/main/ai-diagnostics/ai-profile-manager.ts`):
  - Validates endpoints via `validateAiEndpoint(endpointUrl)`.
  - Persists profiles in SQLite `ai_profiles` with opaque `credentialRef`.
  - API keys are never stored in SQLite in plaintext.
- **`SecureCredentialVault`** (`packages/core/src/main/ai-diagnostics/secure-credential-vault.ts`):
  - Backends: `SafeStorageBackend` (Electron `safeStorage`) and `SoftwareAesGcmBackend` (AES-256-GCM envelope `[IV (12B)][AuthTag (16B)][Ciphertext]`).
  - Encrypted payloads stored in `ai_vault_credentials`.
  - Credentials remain strictly within the Electron Main process; never sent to Renderer.
- **`AiBudgetTracker`** (`packages/core/src/main/ai-diagnostics/ai-budget-tracker.ts`):
  - Enforces incident request limits (`maxRequestsPerIncident`) and token constraints (`maxTokensPerRequest`).
  - Aggregates daily/incident usage in SQLite `ai_diagnosis_usage`.

### 2.3 IPC Layer
- **`setup-incident-ipc.injectable.ts`**:
  - Validates IPC sender via `validateIpcSender(event)`.
  - Channels: `aiListProfiles`, `aiCreateProfile`, `aiUpdateProfile`, `aiDeleteProfile`, `aiPrepareConsent`, `aiExecuteDiagnosis`, `aiListDiagnoses`, `aiGetLatestDiagnosis`, `aiVerifyRemediation`.
  - Sanitizes returned profile payloads: `credentialRef` is opaque; API keys are never emitted.

---

## 3. Threat Model & SSRF Vulnerability Analysis

While `validateAiEndpoint` in `ai-profile-types.ts` provides baseline checks, hostname validation alone is vulnerable to multiple attack vectors:

| Threat Vector | Mechanism | Risk Level | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Alternative IP Encodings** | Decimal (`2130706433`), Hex (`0x7f000001`), Octal (`0177.0.0.1`), Dotted Hex (`0x7f.0.0.1`) bypass naive regexes. | Critical | Canonicalize all IP representations to standardized dotted-decimal or IPv6 before evaluation. |
| **IPv6 & Mapped IPv4** | `::ffff:127.0.0.1`, `[::]`, `fe80::...` (link-local), `fd00::...` (ULA) targeting local/private interfaces. | Critical | Parse and expand IPv6; strictly forbid loopback, unspecified, IPv4-mapped, link-local, and ULA addresses. |
| **Cloud Metadata Endpoints** | `169.254.169.254`, `metadata.google.internal`, `fd00:ec2::254` exposing IAM roles or cluster tokens. | Critical | Explicit denylist + link-local block + strict domain allowlist for production profiles. |
| **Embedded URL Credentials** | `https://user:password@api.openai.com/v1` leaking credentials or confusing parsers. | High | Reject URLs with `username` or `password` components. |
| **Trailing Dots & Host Manipulations** | `api.openai.com.` or mixed-case domains bypassing strict string matching. | Medium | Normalize hostnames (lowercase, strip trailing dot). |
| **DNS Rebinding** | Domain resolves to public IP during validation, but resolves to `127.0.0.1` or `169.254.169.254` when connecting. | Critical | **Connection-level IP verification**: verify resolved IP address immediately prior to or during socket connection. If not possible in transport mock, fail closed. |
| **Malicious HTTP Redirects** | 301/302/307 redirecting from valid public HTTPS endpoint to `http://localhost` or `http://169.254.169.254`. | Critical | Enforce redirect policy: do NOT follow redirects automatically; or re-validate redirect target through full SSRF pipeline (require HTTPS, public IP, same origin or allowlisted provider). |
| **Credential Leakage in Logs/Errors** | Authorization headers (`Bearer sk-...`, `x-api-key: ...`) logged in console or stack traces. | High | Automatic header redaction in all transport logging, diagnostics, and error envelopes. |
| **Memory Exhaustion (DoS)** | Giant response body (e.g. streaming 500MB payload). | High | Enforce strict `maxResponseBytes` (e.g., 2MB limit for diagnostic JSON); cut stream and abort immediately upon exceeding. |

---

## 4. Architectural Design: Secure AI Transport

### 4.1 Separation of Concerns
```
+-------------------------------------------------------------------+
|                        AiDiagnosisEngine                          |
|  - Consent Token Validation & Consumption                         |
|  - Cryptographic Evidence Fingerprinting                          |
|  - Budget & Token Enforcement                                     |
|  - Citation Grounding & Remediation Sanity Checks                 |
+---------------------------------+---------------------------------+
                                  |
                                  v
+---------------------------------+---------------------------------+
|                        AiProviderAdapter                          |
|  - Provider-Specific Prompt Construction                          |
|  - Payload Serialization & Deserialization                        |
|  - Token Usage Calculation                                        |
+---------------------------------+---------------------------------+
                                  |
                                  v
+---------------------------------+---------------------------------+
|                       SecureAiTransport                           |
|  - Destination Policy & SSRF Verification                         |
|  - Redirection Control & Validation                               |
|  - Header Sanitization & Authorization Redaction                  |
|  - AbortSignal Propagation & Timeout Enforcement                  |
|  - Response Size Limiting (maxResponseBytes)                      |
|  - Bounded Retries on Transformed Safe Statuses                   |
|  - Usage & Timing Telemetry                                       |
+---------------------------------+---------------------------------+
                                  |
              +-------------------+-------------------+
              v                                       v
+-------------+-------------+           +-------------+-------------+
|    MockAiTransport        |           |  Real Http Transport      |
| (Active: Simulated/Tests) |           | (Disabled in H8.8-01a)    |
+---------------------------+           +---------------------------+
```

### 4.2 Core Interfaces to Introduce
1. **`SecureAiTransport`**:
   - `execute(request: AiTransportRequest): Promise<AiTransportResponse>`
2. **`AiTransportRequest`**:
   - `endpoint: string`
   - `method: "GET" | "POST"`
   - `headers: Record<string, string>`
   - `body?: string`
   - `timeoutMs: number`
   - `maxResponseBytes?: number`
   - `signal?: AbortSignal`
   - `provider: AiProviderType`
   - `retries?: number`
3. **`AiTransportResponse`**:
   - `status: number`
   - `statusText: string`
   - `headers: Record<string, string>`
   - `body: string`
   - `json<T>(): T`
   - `timing: { durationMs: number; startedAt: string; completedAt: string }`
   - `bytesReceived: number`
4. **`AiTransportError` & Hierarchy**:
   - `SsrfSecurityError`: endpoint, resolved IP, or redirect violates security policy.
   - `TransportTimeoutError`: request exceeded specified timeout.
   - `TransportAbortError`: client aborted request via AbortSignal.
   - `TransportResponseSizeError`: response exceeded `maxResponseBytes`.
   - `TransportHttpError`: HTTP 4xx/5xx with sanitized error message and status code (no headers with secrets).

---

## 5. Invariants & Gates

1. **Gate 1: Zero External Traffic** — In H8.8-01a, default transport is strictly mock/simulated. Real socket creation to external networks is explicitly prevented.
2. **Gate 2: Immutability & Consent** — The transport layer cannot be used as an escape hatch to bypass `AiDiagnosisEngine` consent or `AiBudgetTracker`.
3. **Gate 3: Error Sanitization** — All transport error objects must never contain raw API keys or authorization headers.
4. **Gate 4: Clean TypeScript Compilation** — Zero TypeScript errors with strict checking and `ForkTsCheckerWebpackPlugin` enabled.

---

## 6. Preflight Sign-Off

The preflight audit confirms the feasibility of implementing H8.8-01a without modifying existing business logic or compromising the security boundaries established in H8.0–H8.7.
