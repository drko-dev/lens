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

### 3.1 New Adversarial Security Suite (H8.8-02, R1 & R2)
- File: `packages/core/src/main/ai-diagnostics/__tests__/h8-8-02-consent-evidence-budget.test.ts`
- Result: **30/30 PASS**
- Coverage areas:
  1. *Consent & Immutable Execution Scope:* preview enrichment, invalid token rejection, single-use consumption, concurrent double-execution race prevention, token expiry, closed incident guards, scope tampering rejection, explicit revocation (single/incident/cluster), and in-flight cancellation.
  2. *Privacy, Minimization & Sanitization:* exclusion of Secret/ServiceAccount, 50-item & 192-KiB payload bounding, post-model output sanitization (proves zero raw Bearer tokens or secrets reach SQLite or IPC), RAM buffer zeroing.
  3. *Atomic Budget & Concurrency:* 2 concurrent requests with 1 remaining slot (exactly 1 succeeds, 1 rejected with `BUDGET_EXCEEDED`), duplicate `operationId` rejected, timeout after dispatch marked `FAILED_DISPATCHED` and counted against quota, pre-dispatch cancellation uncounted, HTTP 429/500 after dispatch counted, max token cap rejection, strict token validator.
  4. *Invariants & Lockdown:* external providers strictly blocked (`EXTERNAL_PROVIDER_DISABLED`), fail-closed on zero evidence.
  5. *R1 Security Hardening (5 findings):* Safe failure codes in SQLite error messages (no canary leaks), canonicalization of citation metadata with unverified metadata stripping, serialized 192 KiB request payload size enforcement, strict safe integer token validator with fail-closed SQLite transaction requirement, and lifecycle listener cleanup with automated consent revocation on incident closure.
  6. *R2 Final Security Hardening (3 findings):* Canonical evidence metadata sanitization on ingestion and fact citations (R2-01), separation of preflight payload validation from actual network transport dispatch (R2-02), and late adapter response rejection with transactional state re-verification to prevent persistence on cancelled or closed incidents (R2-03).

---

## 4. Git Work Units (Commits)

The work is organized into 13 atomic conventional commits across H8.8-02 and H8.8-02-R1:
1. `c3bdfa73` `security(ai): bind consent to immutable incident execution scope`
2. `c793ebf7` `security(ai): minimize and redact evidence payloads`
3. `b491195f` `security(ai): protect ephemeral context from persistent disclosure`
4. `aac5d905` `fix(ai): enforce atomic request budget reservations`
5. `de00eb69` `test(ai): cover consent privacy and concurrency adversarial scenarios`
6. `8c3a8756` `docs(h8.8): record H8.8-02 security validation`
7. `security(ai): prevent sensitive error persistence in budget reservations` (R1-01)
8. `security(ai): validate and canonicalize untrusted citation metadata` (R1-02)
9. `fix(ai): enforce serialized request payload size limit` (R1-03)
10. `fix(ai): harden token budget validation and transaction requirements` (R1-04)
11. `security(ai): complete lifecycle cancellation and listener cleanup` (R1-05)
12. `test(ai): cover H8.8-02 R1 adversarial regressions`
13. `docs(h8.8): record R1 security audit results`
