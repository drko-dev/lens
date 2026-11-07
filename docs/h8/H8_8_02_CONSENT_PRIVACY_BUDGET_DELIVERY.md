# H8.8-02 — Consent Scope, Evidence Privacy & Concurrency Budget: Delivery Report

**Date:** 2026-11-07  
**Branch:** `feature/h8-8-02-consent-evidence-budget`  
**Base Commit:** `2e698e39` (`feature/h8-8-ai-incidents-real-integration`)  
**Worktree:** `/private/var/tmp/lens-h8-8-02-consent-evidence-budget-20261107`  
**Author:** Principal Software Engineer & Security Architect  
**Status:** COMPLETE — READY FOR INDEPENDENT AUDIT  

---

## 1. Executive Summary

Milestone **H8.8-02** enforces end-to-end security invariants across the OpenLens DevOps AI diagnostic subsystem, guaranteeing that **zero AI diagnoses can process evidence or consume budget without valid authorization**, with strict incident and cluster isolation, even under concurrency, cancellations, and failures.

All external AI providers (`openai`, `anthropic`, `gemini`) remain strictly disabled (`EXTERNAL_PROVIDER_DISABLED`), and the physical HTTP network engine remains disabled (`DisabledRealNetworkEngine`), ensuring 100% offline security throughout this milestone.

---

## 2. Key Architecture & Security Implementations

### 2.1 Context-Bound Immutable Consent (H8.8-02-01)
- **Preview Immobility:** `DiagnosisConsentPreview` and `EphemeralConsent` seal the cluster scope (`clusterId`, `namespace`), provider endpoint, `operationId` (`OP-...`), and cryptographic evidence fingerprint (`evidenceFingerprintHash`) at preview creation.
- **Single-Use Enforcement:** Tokens are consumed immediately upon execution receipt (`this.consentTokens.delete(consentToken)`), preventing token reuse and replay attacks.
- **Incident State Guard:** Rejects execution if the incident is in `CERRADO` or `NO CONFIRMADO` status at preview time or if it transitions to closed before diagnosis execution (`INCIDENT_CLOSED`).
- **Scope Verification:** Enforces that `incident.clusterId === consent.clusterId` and `incident.namespace === consent.namespace`. Any tampering triggers `CONSENT_SCOPE_MISMATCH`.
- **Granular Revocation:** Added `revokeConsent(token)`, `revokeConsentsForIncident(incidentId)`, `revokeConsentsForCluster(clusterId)`, and `cancelPendingDiagnoses(incidentId)` allowing operators and lifecycle events to revoke authorization instantly.

### 2.2 Evidence Minimization & Redaction (H8.8-02-02)
- **Forbidden Kinds Filter:** Hardened both `AiDiagnosisEngine` and `FixtureAiProviderAdapter` to filter out any Kubernetes `Secret` or `ServiceAccount` resources before transport dispatch.
- **Bounded Payloads:** Capped maximum evidence items to 50 and cumulative evidence payload size to 192 KiB (196,608 bytes), truncating long snippets with `[PAYLOAD_TRUNCATED]` to prevent prompt inflation and memory exhaustion.

### 2.3 Post-Model Output Privacy & Ephemeral Protection (H8.8-02-03)
- **Post-Model Sanitization:** AI responses from external or local models are treated as untrusted text. All generated string fields (`facts[].text`, `hypotheses[].title`, `hypotheses[].rationale`, `contradictions`, `missingInformation`, `recommendedNextSteps`, and `remediationProposal` fields) pass through `EvidenceSanitizer` before SQLite persistence or renderer IPC dispatch.
- **Reflection Protection:** Any model hallucination or echo reflecting cleartext credentials, Bearer tokens, passwords, or AWS keys is replaced with `[REDACTED_...]`.
- **Ephemeral RAM Buffer Zeroing:** Guarantees that ephemeral context files (e.g. Dockerfiles) are wiped from memory via `purgeRawBuffers()` in a `finally` block post-diagnosis, including during error conditions. Raw excerpts from ephemeral files are never persisted to SQLite.

### 2.4 Atomic Budget Reservations & Concurrency Protection (H8.8-02-04)
- **Database Schema Migration 009:** Created table `ai_budget_reservations` with indexed `operation_id` (UNIQUE), `incident_id`, `profile_id`, `status`, token metrics, `diagnosis_id`, and timestamps.
- **Immediate SQLite Transactions:** `reserveBudget()` executes inside `db.transaction()` to count active and consumed requests (`RESERVED`, `DISPATCHED`, `COMPLETED`, `FAILED_DISPATCHED`) atomically, eliminating race conditions when concurrent requests arrive.
- **Failure Accounting Policy:**
  - *Pre-dispatch failure:* Marked `CANCELLED_BEFORE_DISPATCH` (unbilled, does not consume incident request quota).
  - *Post-dispatch failure:* Network timeouts, connection drops, or HTTP 429/500 errors after transport dispatch are marked `FAILED_DISPATCHED` (counted as a consumed attempt to prevent unmetered external calls).
- **Safe Integer & Positive Token Validation:** Disallows NaN, negative numbers, decimals, or strings in token counters.

---

## 3. Test Suites & Verification Results

### 3.1 New Adversarial Security Suite (H8.8-02)
- File: `packages/core/src/main/ai-diagnostics/__tests__/h8-8-02-consent-evidence-budget.test.ts`
- Result: **22/22 PASS**
- Coverage areas:
  1. *Consent & Immutable Execution Scope:* preview enrichment, invalid token rejection, single-use consumption, concurrent double-execution race prevention, token expiry, closed incident guards, scope tampering rejection, explicit revocation (single/incident/cluster), and in-flight cancellation.
  2. *Privacy, Minimization & Sanitization:* exclusion of Secret/ServiceAccount, 50-item & 192-KiB payload bounding, post-model output sanitization (proves zero raw Bearer tokens or secrets reach SQLite or IPC), RAM buffer zeroing.
  3. *Atomic Budget & Concurrency:* 2 concurrent requests with 1 remaining slot (exactly 1 succeeds, 1 rejected with `BUDGET_EXCEEDED`), duplicate `operationId` rejected, timeout after dispatch marked `FAILED_DISPATCHED` and counted against quota, pre-dispatch cancellation uncounted, HTTP 429/500 after dispatch counted, max token cap rejection, strict token validator.
  4. *Invariants & Lockdown:* external providers strictly blocked (`EXTERNAL_PROVIDER_DISABLED`), fail-closed on zero evidence.

### 3.2 Full Regression Campaign (Sequential, `--runInBand`)
| Test Category | Suite Count | Tests Passed | Status |
|---|---|---|---|
| AI Diagnostics Unit Tests | 9 suites | 192 tests | **PASS** |
| AI Diagnostics Integration Suites | 2 suites | 36 tests | **PASS** |
| Incident Storage | 8 suites | 74 tests | **PASS** |
| Incident Broker | 6 suites | 45 tests | **PASS** |
| Incident Scanner | 7 suites | 66 tests | **PASS** |
| Incident Workbench (UI) | 4 suites | 21 tests | **PASS** |
| **Total** | **36 suites** | **434 tests** | **100% PASS** |

### 3.3 TypeScript & Production Build Verification
- **TypeScript Typecheck:** `npx tsc --project packages/core/tsconfig.json --noEmit` -> **0 errors (Exit code 0)**.
- **`@openlens/core` Production Build:** `npm --prefix packages/core run build` -> **COMPILED & PUBLISHED (Exit code 0)**.
- **`open-lens` Production Build:** `npm --prefix open-lens run build` -> **COMPILED (Exit code 0)**.

---

## 4. Git Work Units (Commits)

The work is organized into 6 atomic conventional commits:
1. `security(ai): bind consent to immutable incident execution scope`
2. `security(ai): minimize and redact evidence payloads`
3. `security(ai): protect ephemeral context from persistent disclosure`
4. `fix(ai): enforce atomic request budget reservations`
5. `test(ai): cover consent privacy and concurrency adversarial scenarios`
6. `docs(h8.8): record H8.8-02 security validation`
