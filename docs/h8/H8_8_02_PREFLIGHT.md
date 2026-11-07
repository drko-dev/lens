# H8.8-02 — Preflight Architecture & Gap Analysis
## Consent Verification, Evidence Privacy, and Concurrency-Safe Budget Reservations

**Date:** 2026-11-07  
**Worktree:** `/private/var/tmp/lens-h8-8-02-consent-evidence-budget-20261107`  
**Branch:** `feature/h8-8-02-consent-evidence-budget`  
**Base Commit:** `2e698e39`  
**Status:** PREFLIGHT COMPLETE  

---

### 1. Executive Context & Objective

Milestone **H8.8-02** hardens governance, data privacy, and resource budgeting across the OpenLens AI diagnostic pipeline (`AiDiagnosisEngine -> FixtureAiProviderAdapter -> SecureAiTransport`).

Its central requirement: **Zero AI diagnostic execution or budget consumption may occur without verifiable, immutable, single-use human authorization and strictly bounded, atomic transactional accounting — even under concurrency, timeouts, and network failures.**

---

### 2. Deep Component Inspection & Baseline

| Component | Current State | Confirmed Gaps / Vulnerabilities |
| :--- | :--- | :--- |
| **`AiDiagnosisEngine`** | Enforces single-use consent token, checks evidence fingerprint, binds profile endpoint/model. | 1. Consent does not seal `clusterId`, `namespace`, `issuedAt`, or `operationId`.<br>2. Does not reject closed incidents (`CERRADO`).<br>3. Does not sanitize model output strings (facts, hypotheses, yaml diffs) before saving to SQLite or returning to IPC.<br>4. No mechanism to revoke consent tokens on cluster switch or incident close. |
| **`AiBudgetTracker`** | Queries `AiDiagnosisRepository.countDiagnosesByIncident`. | **P0 RACE CONDITION:** Checked read-only in memory before dispatch; diagnosis is only persisted AFTER async dispatch completes. Concurrent requests can all pass the budget check simultaneously and exceed `maxRequestsPerIncident`. |
| **`AiDiagnosisRepository`** | Stores completed diagnoses in `ai_diagnoses` table. | No transactional reservation table. Dispatched attempts that fail or timeout leave zero record in SQLite, breaking accounting. |
| **`IncidentRepository`** | SQLite storage with state machine transitions. | Provides incident cluster, namespace, and status. `isClosed()` invariant not checked in AI engine. |
| **`EvidenceRepository`** | Ingests, sanitizes credentials, deduplicates and computes SHA-256. | Evidence list is not capped by request byte/count limits prior to dispatch payload assembly. |
| **`EphemeralContextManager`** | RAM-only multi-file context, auto-sweep, canonical metadata fingerprinting. | Cleanly isolates RAM buffers and zeroizes memory, but needs coordinated revocation when incident or cluster is switched. |
| **`FixtureAiProviderAdapter`** | Dispatches POST to `SecureAiTransport`, validates schema, 0 POST retries. | Operates 100% offline with synthetic fixtures. |
| **`SecureAiTransport`** | Blocked real engine (`DisabledRealNetworkEngine`), timeout & abort guarantees, SSRF defense. | Functional and audited. |
| **AI IPC Handlers** | Authorizes frame origins, validates IDs and schemas. | Transparently delegates to `AiDiagnosisEngine`. |

---

### 3. Detailed Gap Analysis on Critical Dimensions

#### 3.1. Temporal Validity and Single-Use of Consent
- **Existing:** `consentTokens` stored in RAM `Map<string, ConsentTokenRecord>` with `expiresAt = now + ttl`. First access consumes the token (`this.consentTokens.delete(token)`).
- **Gaps:**
  - Token metadata only tracks `incidentId`, `profileId`, `provider`, `model`, `endpoint`, `evidenceFingerprintHash`.
  - Missing context binding: `clusterId`, `namespace`, `issuedAt`, and `operationId`.
  - Replay protection in memory works for a single Node.js process, but revocation across cluster changes or explicit cancellations does not exist.

#### 3.2. Evidence and Ephemeral Context Fingerprinting
- **Existing:** `computeEvidenceFingerprint` generates a deterministic SHA-256 hash combining evidence IDs, snippet lengths, and canonical metadata of ephemeral manual files.
- **Gaps:**
  - No explicit request-level evidence ceiling (e.g., maximum 50 evidences or 192 KiB).
  - No defense-in-depth check excluding forbidden resource kinds (`Secret`, `ServiceAccount`) prior to dispatch serialization.

#### 3.3. Incident and Cluster Integrity
- **Existing:** Evidence repository checks cluster scope on ingestion.
- **Gaps:**
  - `executeDiagnosis` does not verify that `incident.clusterId` matches `consent.clusterId` and `incident.namespace` matches `consent.namespace`.
  - An incident transitioned to `CERRADO` or `NO CONFIRMADO` could theoretically still execute diagnosis if a token was prepared prior to closure.

#### 3.4. Simultaneous Concurrent Requests (P0 Concurrency Race)
- **Problem Statement:**
  `checkRequestBudget` runs `SELECT count(*) FROM ai_diagnoses WHERE incident_id = ?`.
  If an incident has budget for 1 request, and two concurrent calls invoke `executeDiagnosis`:
  Both query `ai_diagnoses` -> count is 0 for both.
  Both start async HTTP dispatch (`await adapter.generateDiagnosis(...)`).
  Both finish and both save -> 2 diagnoses saved, budget of 1 violated.
- **Required Architecture:**
  - Migration 009: `ai_budget_reservations` table in SQLite.
  - States: `RESERVED`, `DISPATCHED`, `COMPLETED`, `FAILED_DISPATCHED`, `CANCELLED_BEFORE_DISPATCH`.
  - Atomic reservation within a SQLite transaction (`BEGIN IMMEDIATE`):
    - Check active + consumed count (`RESERVED + DISPATCHED + COMPLETED + FAILED_DISPATCHED`).
    - If `>= maxRequestsPerIncident`, throw `BUDGET_EXCEEDED` immediately.
    - Otherwise insert atomic reservation with unique `operationId`.

#### 3.5. Accounting of Failed Attempts
- **Principle:** A request dispatched to a provider over network represents potential billable consumption.
- **Policy:**
  - Failed *before* dispatch (validation error, consent mismatch, profile inactive): Mark `CANCELLED_BEFORE_DISPATCH` (unbilled / refunded).
  - Failed *after* dispatch (timeout, 500 error, network reset, malformed response): Mark `FAILED_DISPATCHED` (counted against incident request budget, no auto-refund).

#### 3.6. Exposure of Sensitive Data in Responses and Persistence
- **Problem Statement:**
  Model outputs (`facts`, `hypotheses[].rationale`, `remediationProposal.suggestedYamlDiff`, etc.) are written directly to `ai_diagnoses` without credential scanning.
- **Required Defense:**
  Scan all textual fields of the model response using `EvidenceSanitizer` before persisting to SQLite or sending over IPC.

#### 3.7. Cancellation on Close or Scope Switch
- Expose explicit `cancelPendingDiagnoses(incidentId)` and `revokeConsentsForIncident(incidentId)` / `revokeConsentsForCluster(clusterId)` in `AiDiagnosisEngine` and wire them into incident closure and cluster switch paths.

---

### 4. Implementation Plan

1. **Phase H8.8-02-01 (Scope-Bound Consent):**
   - Enhance `DiagnosisConsentPreview` and token storage with `clusterId`, `namespace`, `issuedAt`, `operationId`.
   - Add verification of `clusterId`, `namespace`, and rejection of closed incidents in `executeDiagnosis`.
   - Implement `revokeConsent(token)`, `revokeConsentsForIncident(incidentId)`, `revokeConsentsForCluster(clusterId)`.

2. **Phase H8.8-02-02 (Evidence Minimization & Sanitization):**
   - Enforce request-level bounds (`MAX_EVIDENCES_PER_REQUEST = 50`, `MAX_EVIDENCE_BYTES_PER_REQUEST = 192 KiB`).
   - Filter forbidden kinds (`Secret`, `ServiceAccount`) before dispatch payload creation.
   - Fencing and sanitization of prompt injections in snippets.

3. **Phase H8.8-02-03 (Output Privacy & Ephemeral Isolation):**
   - Post-inference sanitization of model response fields (`facts`, `hypotheses`, `remediationProposal`, recommendations) using `EvidenceSanitizer.sanitizeSnippet` before SQLite save.

4. **Phase H8.8-02-04 (Atomic Budget Reservations & Concurrency):**
   - Add Migration 009: `ai_budget_reservations` table.
   - Implement `reserveRequestBudget`, `markDispatched`, `markCompleted`, `markFailed` in `AiBudgetTracker` / `AiDiagnosisRepository` with atomic SQLite transactions.
   - Add unique `operationId` support and prevent duplicate operation processing.

5. **Phase H8.8-02-05 / 06 (Adversarial Tests & Full Regression):**
   - Comprehensive test suite covering consent replay, concurrency races, budget exhaustion, post-inference leak prevention, and cancellation.
   - Full regression across all 36+ test suites with strictly $\le 1$ process at a time.
