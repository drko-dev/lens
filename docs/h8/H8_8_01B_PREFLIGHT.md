# H8.8-01b — Preflight & Integration Audit Report
## AI Provider Adapter Integration with Mock Transport & Structured Response Fixtures

**Status:** APPROVED FOR IMPLEMENTATION  
**Date:** 2026-11-07  
**Branch:** `feature/h8-8-01b-ai-fixture-integration`  
**Base Commit:** `cbd9f6dd` (H8.8-01a consolidated)  
**Environment:** Offline Test Harness (Zero External Network)  

---

### 1. Executive Summary & Objective

The objective of **H8.8-01b** is to bridge the high-level AI Incident Diagnosis system with the secure transport infrastructure established and verified in H8.8-01a, establishing an end-to-end verifiable diagnostic pipeline:

```
AiDiagnosisEngine
       │
       ▼
AiProviderAdapter (FixtureAiProviderAdapter)
       │
       ▼
SecureAiTransport (DefaultSecureAiTransport / MockAiTransport)
       │
       ▼
Synthetic JSON Fixture Response
       │
       ▼
Strict Runtime Schema Validation & Normalization
       │
       ▼
RawDiagnosisResult (CONCLUSIVE / INCONCLUSO, verified facts, hypotheses, remediation proposals, token usage)
       │
       ▼
AiDiagnosisEngine (Consent Verification, Citation Verification, Budget Tracking, SQLite Persistence)
```

**Core Invariant:** Complete offline operation. No real network calls to external AI APIs (OpenAI, Anthropic, Google Gemini) or live Kubernetes clusters. In production mode, `ExternalAiProviderStub` and `DisabledRealNetworkEngine` remain strictly fail-closed.

---

### 2. Audit of Existing Components & Contracts

#### 2.1. Diagnostic Engine (`AiDiagnosisEngine`)
- **Location:** `packages/core/src/main/ai-diagnostics/ai-diagnosis-engine.ts`
- **Key Responsibilities:**
  1. Ephemeral consent token generation with SHA-256 fingerprinting of evidence snippets and manual context files (`prepareConsentPreview`).
  2. Single-use consumption of consent tokens with scope, TTL, and parameter immutability checks (`executeDiagnosis`).
  3. Pre-execution and post-execution budget enforcement (`AiBudgetTracker`).
  4. Evidentiary grounding and citation verification against ingested evidence snippets (`resourceKind`, `resourceName`, excerpt match) and ephemeral manual contexts.
  5. Automatic downgrade to `INCONCLUSO` if citations are hallucinated or lack evidentiary backing.
  6. Persistence of reports to SQLite repository (`AiDiagnosisRepository`) and timeline recording.
  7. Reversible remediation proposal invariant (`requiresHumanApproval: true`, `isApplied: false`).

#### 2.2. Provider Adapter Contract (`AiProviderAdapter`)
- **Location:** `packages/core/src/main/ai-diagnostics/providers/ai-provider-adapter.ts`
- **Existing Implementations:**
  - `MockAiProviderAdapter`: In-memory programmatic mock generating synthetic `RawDiagnosisResult` directly without network simulation.
  - `ExternalAiProviderStub`: Throws error in offline harness when external calls are attempted.
- **Contract Definition:**
  ```typescript
  export interface AiProviderAdapter {
    readonly provider: AiProviderType;
    generateDiagnosis(
      context: DiagnosisPromptContext,
      options: DiagnosisExecutionOptions,
    ): Promise<RawDiagnosisResult>;
  }
  ```

#### 2.3. Secure AI Transport (`SecureAiTransport`)
- **Location:** `packages/core/src/main/ai-diagnostics/transport/`
- **Core Interfaces:**
  - `SecureAiTransport`: `dispatch(request: AiTransportRequest): Promise<AiTransportResponse>`
  - `DefaultSecureAiTransport`: Production coordinator enforcing SSRF preconnect validation tickets, global deadlines, 0 POST retries, header allowlisting, and streaming size limits.
  - `MockAiTransport`: High-fidelity offline transport supporting mocked HTTP responses, streaming simulation, redirect validation, and non-retention of sensitive request bodies.
  - Typed error hierarchy: `TransportHttpError`, `TransportTimeoutError`, `TransportAbortError`, `TransportResponseSizeError`, `TransportRedirectError`, `SsrfSecurityViolationError`, `RealTransportDisabledError`.

#### 2.4. Ephemeral Context & Budget Management
- `EphemeralContextManager`: Encrypted in-memory storage of technical diagnostic files with RAM zeroing after diagnosis.
- `AiBudgetTracker`: Hard limits on requests per incident and tokens per request/day.
- `AiProfileManager`: Encrypted credentials in `SecureCredentialVault` (API keys never exposed to Renderer or transport responses).

---

### 3. Architecture & Integration Strategy (H8.8-01b)

#### 3.1. New Component: `FixtureAiProviderAdapter`
To satisfy requirements without duplicating logic or creating a secondary diagnosis engine, we introduce `FixtureAiProviderAdapter`:
1. Implements `AiProviderAdapter`.
2. Injected with `SecureAiTransport` (defaults to `MockAiTransport` in offline harness).
3. Translates `DiagnosisPromptContext` into an HTTP request (`POST /v1/diagnose` or provider-specific synthetic endpoint).
4. Dispatches the request through `SecureAiTransport`, ensuring all security policies (SSRF check, headers, timeout, cancellation) are exercised.
5. Receives `AiTransportResponse` and performs **strict runtime validation** on the parsed JSON payload.
6. Returns validated `RawDiagnosisResult` to `AiDiagnosisEngine`.

#### 3.2. Runtime Schema Validation (`validateRawDiagnosisResult`)
AI model outputs must be treated as completely untrusted input. The validator checks:
- `status`: Must be strictly `"CONCLUSIVE"` or `"INCONCLUSO"`.
- `inconclusiveReason`: String, required if `status === "INCONCLUSO"`.
- `facts`: Array of objects with `text: string` and optional `citation: { evidenceId, excerpt?, resourceKind?, resourceName? }`.
- `hypotheses`: Array of objects with `id: string`, `title: string`, `confidence: number` (clamped/verified $0.0 \le c \le 1.0$), `rationale: string`, `citationIds: string[]`.
- `contradictions`, `missingInformation`, `recommendedNextSteps`: String arrays.
- `remediationProposal`: Optional object with required fields (`id`, `title`, `problemSummary`, `preconditions`, `risksAndImpact`, `validationSteps`, `rollbackProcedure`), optional diffs. **Never executable code or automated commands**.
- `tokenUsage`: Object with non-negative numbers for `promptTokens`, `completionTokens`, `totalTokens`.

#### 3.3. Fixture Inventory (`packages/core/src/main/ai-diagnostics/fixtures/`)
Standardized JSON fixtures representing real-world diagnostic responses and failure modes:
1. `conclusive-valid-citations.json`: CrashLoopBackOff due to OOM with valid citations to pod logs and events.
2. `inconclusive-insufficient-evidence.json`: Inconclusive diagnosis citing missing metrics and truncated logs.
3. `hallucinated-citation.json`: Conclusive status referencing non-existent evidence IDs (`EVD-PHANTOM-999`).
4. `low-confidence-hypothesis.json`: Hypotheses with fractional confidence (0.35, 0.45).
5. `valid-token-usage.json`: Typical token count (450 prompt, 380 completion, 830 total).
6. `excessive-token-usage.json`: Token count exceeding incident/profile budget limit (15,000 tokens).
7. `malformed-json.txt`: Broken JSON syntax.
8. `missing-fields.json`: Missing mandatory fields (`facts`, `status`, or `hypotheses`).
9. `unexpected-types.json`: Status as integer, confidence as string, etc.
10. `remediation-diff.json`: Passive YAML diff for resource adjustment.

---

### 4. Gate Verification & Security Boundaries

| Gate ID | Security Control | Verification Mechanism |
| :--- | :--- | :--- |
| **SEC-01** | Ephemeral Consent Single-Use | Token consumed immediately on lookup; replay returns `INVALID_CONSENT_TOKEN`. |
| **SEC-02** | Evidence Fingerprint Immutability | SHA-256 fingerprint verified before calling transport; any modification aborts. |
| **SEC-03** | Zero External Network Traffic | Real transport fails closed via `RealTransportDisabledError` or mock transport. |
| **SEC-04** | Citation Grounding Enforcement | Citations verified against ingested evidence; ungrounded citations downgrade to `INCONCLUSO`. |
| **SEC-05** | No Execution of Code or Diffs | `requiresHumanApproval: true`, `isApplied: false` enforced by engine; no shell execution. |
| **SEC-06** | Zero Retries on POST | POST requests strictly never retry on 429/503/timeout (verified in H8.8-01a-R3). |
| **SEC-07** | Strict Payload Validation | Malformed or typed-polluted JSON rejected with `TransportPayloadValidationError`. |
| **SEC-08** | Sensitive Data Non-Retention | Cleartext bodies omitted from mock transport request history; secrets redacted. |

---

### 5. Next Steps
1. **Fase 01b-01 & 01b-02:** Implement `FixtureAiProviderAdapter`, runtime validator, and fixture library.
2. **Fase 01b-03 & 01b-04:** Wire into `AiDiagnosisEngine` test harness and verify security gates.
3. **Fase 01b-05 & 01b-06:** Comprehensive offline integration test suite and sequential regression.
4. **Fase 01b-07:** Delivery documentation (`H8_8_01B_FIXTURE_ADAPTER_DELIVERY.md`) and atomic commits.
