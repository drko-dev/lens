# OpenLens DevOps — H8.1 RC1 Release & Validation Report

**Release Candidate:** H8.1 RC1 (Incident Center & Diagnosis Workbench — Internal QA Checkpoint)  
**Date:** 2026-11-05  
**Target Environment:** macOS ARM64 (Apple Silicon)  
**Runtime:** Electron 45.2.0, Node.js v24.22.2  
**Codebase Commit:** `b504168` (base `develop` merge `0075026`)  
**Workspace:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`  
**Distribution Gate Status:** **H8.1 RC1 APPROVED (Internal QA)**

---

## 1. Release Artifacts & Cryptographic Checksums

All artifacts are isolated in `open-lens/dist/h8-rc1/`. The previous stable release candidate `rc4` remains untouched in `open-lens/dist/rc4/`.

| Artifact File | Format | Architecture | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- | :--- |
| `OpenLens DevOps-6.5.3-dev-arm64-H8-RC1.dmg` | APFS Disk Image | `darwin-arm64` | ~245 MB | `b95eec38565c6b0df9346449d288c008b8408efc88ef822626e7365775ef9d4a` |
| `OpenLens DevOps-6.5.3-dev-arm64-H8-RC1.zip` | Compressed Archive | `darwin-arm64` | ~236 MB | `3796933c0d8f4e992afaf732cd0cfb61d8bcd2dff0a9623ab7bdac1914f32dab` |
| `OpenLens DevOps.app` | macOS App Bundle | `darwin-arm64` | Bundle | Verified via `codesign --verify --deep --strict` |
| `SHA256SUMS` | Plain text | All | 178 B | Included in distribution directory |
| `RELEASE_MANIFEST.txt` | Plain text | All | 1.4 KB | Included in distribution directory |

### Code Signing Verification
- **Signature Mechanism:** Ad-hoc deep entitlement signature (`codesign --force --deep --sign - --entitlements build/entitlements.mac.plist`).
- **Designated Requirement:** Satisfied.
- **Disk Validation:**
  ```text
  dist/h8-rc1/mac-arm64/OpenLens DevOps.app: valid on disk
  dist/h8-rc1/mac-arm64/OpenLens DevOps.app: satisfies its Designated Requirement
  ```
- **DMG Integrity:**
  ```text
  hdiutil: verify: checksum of "open-lens/dist/h8-rc1/OpenLens DevOps-6.5.3-dev-arm64-H8-RC1.dmg" is VALID
  ```
- **Notarization Status:** Internal QA only. Apple Developer ID signature and public notarization remain pending.

---

## 2. Test Execution & Verification Summary

### 2.1 Automated Unit & Integration Suites (Jest)
- **Total Test Suites:** 17 passed / 17 total (100%).
- **Total Tests:** 132 passed / 132 total (100%).
- **Suites Executed:**
  - `src/common/incident/__tests__/incident-state-machine.test.ts`: Strict state transitions, validation, and precondition enforcement.
  - `src/main/incident-storage/__tests__/incident-confirmation-manager.test.ts`: SEC-H8-01..05 security remediation, ephemeral tokens, runtime validation, replay prevention, and timeout guarantees.
  - `src/main/incident-storage/__tests__/setup-incident-ipc.test.ts`: IPC sender and frame security boundaries, origin validation, subframe rejection.
  - `src/main/incident-storage/__tests__/incident-repository.test.ts`: Atomic SQLite CRUD, timeline journaling, foreign key cascades.
  - `src/main/incident-storage/__tests__/evidence-repository.test.ts`: Cluster/namespace isolation, sanitization, deduplication, and versioning.
  - `src/main/incident-storage/__tests__/incident-purger.test.ts`: Retention policies, preview, and safe manual/time-based purge execution.
  - `src/features/incident-workbench/renderer/__tests__/`: MobX store reactivity, panel components, and tab switching.
  - `src/renderer/components/incidents/__tests__/`: Route registration and UI presentation.
  - `src/renderer/components/preferences/__tests__/`: Retention preference panel integration.
  - `src/renderer/components/split-panel/__tests__/`: Split panel security, context isolation, and layout stores (H7 regression).
  - `src/features/global-docking/renderer/__tests__/`: Global docking catalog and leaf management (H7 regression).

### 2.2 Packaged Application QA Pipeline (Playwright on Real `.app`)
Executed via `open-lens/integration/h8-rc1-packaged-qa.mjs` against the prepackaged `.app` bundle under an isolated user profile and without the webpack development server.

| Step | Validation Target | Packaged QA Outcome | Evidence Capture |
| :---: | :--- | :--- | :--- |
| **01** | **Standalone Launch** | App starts cleanly in production without dev server (`https://lens.app:64448/`). | `rc1_01_packaged_app_launch.png` |
| **02** | **SQLite Main Storage** | `openlens-devops-incidents.db` created in `userData` with WAL mode and all 3 migrations. | Console verified |
| **03** | **IPC Incident Creation** | Incident created and atomically persisted in SQLite with status `DETECTADO`. | `rc1_02_incident_created_persisted.png` |
| **04** | **Evidence Sanitization** | Sensitive tokens (`Bearer`, passwords, client secrets) redacted (`0` leaks); SHA-256 deduplicated. | Console verified |
| **05** | **State Transitions** | State machine moves `DETECTADO` → `INVESTIGANDO` → `CONFIRMADO` → `SOLUCIÓN PROPUESTA`. | Console verified |
| **06a** | **Interactive Cancel** | Privileged modal opened; operator clicked **Cancelar**; status stayed `SOLUCIÓN PROPUESTA`. | Console verified |
| **06b** | **Interactive Approval** | Injected malicious `<script>` payload neutralised (0 XSS); operator clicked **Autorizar Transición**. | `rc1_05_privileged_confirmation_modal.png` |
| **06c** | **Audit Trail** | Transitioned to `APROBACIÓN HUMANA`; logged `auditReference` without exposing plain tokens. | `rc1_06_privileged_approval_done.png` |
| **07** | **Retention & Purge** | Retention policy verified disabled by default; preview evaluated candidate counts safely. | Console verified |
| **08** | **Global Docking Host** | Lens root and layout hosts verified stable in packaged production build. | `rc1_08_global_docking_packaged.png` |
| **09** | **Restart & Recovery** | App closed and relaunched with same profile; incidents, evidence, and timeline 100% recovered. | `rc1_09_packaged_restart_recovery.png` |

---

## 3. Security Boundary & Architectural Clarifications

1. **Local Interactive Consent vs. OS Authentication:**  
   The privileged transition gateway provides **explicit human consent in an isolated, sandboxed BrowserWindow with strict CSP (`default-src 'none'`) and `textContent` DOM binding**. It guarantees non-tampering and prevents automated UI clicks from subframes or Renderer XSS. It **does not** constitute biometric or cryptographic OS authentication (TouchID, Windows Hello, FIDO2/WebAuthn).
2. **Main vs. Renderer Security Boundary:**  
   The SQLite database driver (`better-sqlite3`), data migrations, evidence sanitization, retention pruning, and state machine validation reside strictly within Electron Main. The Renderer has no direct filesystem or database driver access.
3. **Loopback Server Origin Hardening:**  
   In production packaged mode, OpenLens renders from an internal loopback server (`https://lens.app:<port>/`). The IPC sender validator (`validateIpcSender`) verifies this origin, rejects subframes, checks registered top-level windows, and prevents directory traversal attacks.

---

## 4. Rollback Procedure to RC4

The baseline stable release candidate RC4 is completely decoupled and preserved.

### Immediate Rollback Steps:
1. **Preserve Current Workspace:** Do not delete or overwrite `open-lens/dist/rc4/`.
2. **Verify RC4 Baseline Integrity:**
   ```bash
   shasum -a 256 "open-lens/dist/rc4/OpenLens DevOps-6.5.3-dev-arm64-RC4.dmg"
   # Expected: 1a4e9979adc79f17209b9d7a9775a09683fd6ba2a4bbe76114fdb8124c35fc92
   ```
3. **Execution:** Launch RC4 directly from the preserved DMG or app bundle:
   ```bash
   open "/Volumes/OpenLens DevOps 6.5.3-dev-arm64/OpenLens DevOps.app"
   ```
4. **Data Isolation:** H8 SQLite databases are stored in `openlens-devops-incidents.db` within `userData`. Rolling back to RC4 leaves standard Lens cluster preferences and catalog settings intact, as RC4 does not touch the incident storage database.

---

## 5. Identified Limitations & Out-of-Scope Items

- **Public Distribution:** Artifacts have ad-hoc codesigning only. Public distribution requires an Apple Developer ID certificate, Apple notarization ticket stapling, and Windows/Linux code signing.
- **Cluster Broker (H8.2):** Kubernetes log/event collection in this checkpoint was validated with synthetic and sanitized inputs over IPC. Live cluster evidence ingestion via an Electron Main broker and independent service account identity is scheduled for H8.2.
- **AI Diagnostics Engine (H8.3):** Automated hypothesis generation, RCA analysis, and LLM-assisted remediation proposals are deferred to subsequent milestones.

---

## 6. Release Gate Verdict

**Dictamen:** **H8.1 RC1 APROBADO** (Internal QA Checkpoint).  
The package successfully satisfies all preflight checks, isolated packaging rules, Electron 45.2.0 ARM64 compatibility, `better-sqlite3` native loading, hardened confirmation modal lifecycle, and full restart recovery.
