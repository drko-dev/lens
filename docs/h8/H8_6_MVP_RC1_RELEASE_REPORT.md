# OpenLens DevOps — H8.6 MVP Release Candidate 1 Report

**Release Candidate:** H8.6 MVP RC1 (Incident Center, Evidence Broker, AI Diagnostics & Deterministic Local Scanner)  
**Date:** 2026-11-06  
**Target Environment:** macOS ARM64 (Apple Silicon)  
**Runtime:** Electron 45.2.0, Node.js v24.22.2  
**Branch:** `feature/h8-6-security-mvp-rc`  
**Workspace:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`  
**Distribution Gate Status:** **H8.6 MVP RC1 APPROVED (Internal QA / Synthetic Demo Scope)**

---

## 1. Release Artifacts & Cryptographic Checksums

All distribution artifacts are isolated in `open-lens/dist/h8-mvp-rc1/`. The previous checkpoints (`h8-rc1`, `rc4`) remain untouched in their respective directories.

| Artifact File | Format | Architecture | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- | :--- |
| `OpenLens DevOps-6.5.3-dev-arm64.dmg` | APFS Disk Image | `darwin-arm64` | ~245 MB | `862b227b8bdc48afd2a16e6f7cfeac9cd77d5c1b04962aa57356bf5e2cff5678` |
| `OpenLens DevOps-6.5.3-dev-arm64-mac.zip` | Compressed Archive | `darwin-arm64` | ~236 MB | `55aa127382992840e4baad01b10a10e501330a58a4403e1b0ee43ebd51b9cb8c` |
| `OpenLens DevOps.app` | macOS App Bundle | `darwin-arm64` | Mach-O thin | Verified via `codesign --verify --deep --strict` |
| `SHA256SUMS` | Plain text | All | 182 B | Included in distribution directory |

### Code Signing & Package Integrity Verification
- **Signature Mechanism:** Ad-hoc deep entitlement signature (`codesign --force --deep --sign - --entitlements build/entitlements.mac.plist`).
- **Designated Requirement:** Satisfied.
- **Codesign Audit:**
  ```text
  Executable=.../mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps
  Identifier=dev.drko.openlens-devops
  Format=app bundle with Mach-O thin (arm64)
  CodeDirectory v=20400 size=433 flags=0x2(adhoc) hashes=3+7 location=embedded
  CDHash=43982381f9c4a731a1a066afdf95395428092e9b
  Signature=adhoc
  ```
- **DMG Integrity:**
  ```text
  hdiutil: verify: checksum of "open-lens/dist/h8-mvp-rc1/OpenLens DevOps-6.5.3-dev-arm64.dmg" is VALID
  ```
- **Notarization Status:** Internal QA only. Public Apple Developer ID notarization remains pending.

---

## 2. Security Gate Remediation Summary (H86-GATE-01..06)

All six blocking findings identified in the H8.5 audit were remediated, tested, and verified prior to packaging:

| Gate Finding | Severity | Root Cause & Security Concern | Remediation Applied |
| :--- | :--- | :--- | :--- |
| **H86-GATE-01** | High | Scanner reported fake active watchers count (`1`) and ambiguous supervision status | Scanner hardcoded to `activeWatchersCount = 0`, `sourceType = "synthetic_feed"`, `isSyntheticDemo = true`. UI explicitly displays `Escáner Local (Demo Sintético)` and `DEMO ACTIVO (0 watchers)`. |
| **H86-GATE-02** | High | Untrusted snapshots from Renderer accepted without bounds | `validateK8sSnapshot` hardened with max array bounds (<= 50 items), max payload size (<= 256 KiB), and recursive prototype pollution defenses. |
| **H86-GATE-03** | High | Fingerprint collisions across recreated pods & lack of transactional boundary | Fingerprint canonical string now incorporates `resourceUid` (`cluster:namespace:kind:name:signalType:uid`). Ingestion wrapped in SQLite transaction `incidentRepository.transaction<T>()`. |
| **H86-GATE-04** | Critical | Dismissing an alert could close an incident without human confirmation | `scannerAlertAction` dismissal strictly enforces transition from `DETECTADO` to `NO CONFIRMADO`. Closing to `CERRADO` remains gated exclusively by the `IncidentConfirmationManager` privileged human gate (H8.1). |
| **H86-GATE-05** | High | Unsanitized signal metadata and timeline flooding during burst | Signals are sanitized with `EvidenceSanitizer` before SQLite insertion. Timeline entries under cooldown are rate-limited to avoid database exhaustion while updating recurrence counters. |
| **H86-GATE-06** | High | Incomplete adversarial test campaign against multi-layer authorization | Implemented comprehensive adversarial test suite covering session, cluster, origin, window, and frame spoofing attacks with strict fail-closed behavior. |

---

## 3. Test Execution & Verification Summary

### 3.1 Automated Jest Test Suites
- **Total Test Suites:** 31 passed / 31 total (100%).
- **Total Tests:** 267 passed / 267 total (100%).
- **Duration:** 23.37 seconds.

#### Test Coverage Highlights:
- `src/main/incident-scanner/__tests__/h8-6-adversarial-security.test.ts`:
  - **ADV-SEC-01**: Rejection of forged IPC sender origin and subframes.
  - **ADV-SEC-02**: Rejection of prototype pollution payloads in snapshot ingestion.
  - **ADV-SEC-03**: Multi-cluster isolation (cross-cluster snapshot rejection).
  - **ADV-SEC-04**: Fingerprint uniqueness across recreated pods with identical names.
  - **ADV-SEC-05**: Privileged confirmation bypass prevention (alert dismiss cannot close).
  - **ADV-SEC-06**: Malicious metadata sanitization before SQLite insertion.
  - **ADV-SEC-07**: Proof of ZERO Kubernetes write operations and ZERO external AI calls.
- `src/main/incident-scanner/__tests__/h8-6-resilience-performance.test.ts`:
  - **RES-01**: Burst ingestion of 100 signals handled in < 500 ms with deduplication.
  - **RES-02**: Max snapshot payload rejection (> 256 KiB).
  - **RES-03**: Memory stability during extended scanning (< 20 MB delta).
  - **RES-04**: Clean scanner shutdown and resource reclamation.
  - **RES-05**: SQLite WAL journal recovery across simulated crash.
- `src/main/incident-broker/__tests__/`: PEP authorization, read-only guarantees, prompt injection sanitization.
- `src/main/ai-diagnostics/__tests__/`: Persistent vault, citation verification, ephemeral context lifecycle.
- `src/main/incident-storage/__tests__/`: State machine, confirmation manager, retention policies, evidence storage.

---

## 4. Packaged Application QA Pipeline (Playwright on Real `.app`)

Executed autonomously via `open-lens/integration/h8-6-mvp-rc1-packaged-qa.mjs` directly against the packaged binary in `/open-lens/dist/h8-mvp-rc1/mac-arm64/OpenLens DevOps.app` without the webpack dev server and under an isolated profile:

```text
==========================================================================
   OpenLens DevOps H8.6 — MVP RC1 Packaged QA Verification Pipeline        
==========================================================================
Binary: .../open-lens/dist/h8-mvp-rc1/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps
Isolated Profile: /var/folders/.../T/openlens-h8-6-mvp-rc1-qa-...

==> [Paso 1] Iniciando aplicación empaquetada (Modo Producción, sin dev server)...
✓ Ventana principal cargada: https://lens.app:53450/
✓ Captura 01 guardada: docs/evidence/h8-6/mvp_rc1_01_packaged_launch.png

==> [Paso 2] Verificando SQLite y esquema de migraciones en perfil...
  Ruta SQLite: .../openlens-devops-incidents.db
  Tablas detectadas: schema_migrations, incidents, incident_timeline, incident_evidence, incident_retention_policy, incident_purge_audit, broker_audit_log, ai_profiles, ai_diagnoses, ai_vault_credentials
  Migraciones aplicadas: v1..v7 completas.
✓ Esquema SQLite verificado con 7 migraciones completas.

==> [Paso 3] Verificando Escáner Local vía IPC empaquetado...
  Estado inicial: isEnabled=false, sourceType="synthetic_feed", activeWatchersCount=0
  Estado activado: isEnabled=true, scope={"clusterId":"synthetic-demo-cluster","namespace":"production"}, sourceType="synthetic_feed", activeWatchersCount=0
✓ Captura 02 guardada (Escáner Demo Activo): docs/evidence/h8-6/mvp_rc1_02_scanner_demo_active.png

==> [Paso 4] Ingestando snapshot sintético con OOMKilled...
  Señales detectadas: 1
  Total incidentes en SQLite tras deduplicación: 1
  Incidente OOM: INC-5B9406CB OOMKilled detectado en pod checkout-worker-01 Estado: DETECTADO
✓ Captura 03 guardada (Incidente Deduplicado): docs/evidence/h8-6/mvp_rc1_03_incident_deduplicated.png

==> [Paso 5] Verificando acciones de alerta (Snooze y Dismiss)...
  Resultado snooze: true
  Resultado dismiss: true Incidente descartado exitosamente (NO CONFIRMADO)
  Estado posterior a dismiss: NO CONFIRMADO
✓ Captura 04 guardada (Descarte seguro a NO CONFIRMADO): docs/evidence/h8-6/mvp_rc1_04_dismiss_unconfirmed.png

==> [Paso 6] Deteniendo escáner local...
  Estado detenido: isEnabled=false, activeWatchersCount=0
✓ Escáner local detenido exitosamente sin watchers activos.

==> [Paso 7] Cerrando aplicación empaquetada y validando persistencia SQLite...
  Total incidentes persistidos en base tras cierre: 1
✓ Persistencia y WAL recovery verificados exitosamente.

==========================================================================
   H8.6 MVP RC1 — PACKAGED APPLICATION QA COMPLETADA EXITOSAMENTE (PASS)   
==========================================================================
```

### Visual Evidence Artifacts:
- `docs/evidence/h8-6/mvp_rc1_01_packaged_launch.png`: Clean launch into production window.
- `docs/evidence/h8-6/mvp_rc1_02_scanner_demo_active.png`: Scanner active in transparent synthetic demo mode with 0 watchers.
- `docs/evidence/h8-6/mvp_rc1_03_incident_deduplicated.png`: Deduplicated incident list in SQLite following burst snapshot.
- `docs/evidence/h8-6/mvp_rc1_04_dismiss_unconfirmed.png`: Privileged transition enforcement showing safe transition to `NO CONFIRMADO`.

---

## 5. Architectural Invariants Compliance

- **Zero Real Kubernetes Writes:** Strictly verified via `ADV-SEC-07` and broker proxy enforcement (zero POST/PUT/PATCH/DELETE calls).
- **Zero Real Cluster Connection:** Synthetic demo mode exclusively; broker requires explicit authorization tokens.
- **Zero Remote AI Network Calls:** Strict honest gating; mock provider utilized exclusively without external network exposure.
- **Fail-Closed Privilege Separation:** Unprivileged dismiss actions cannot transition incidents to `CERRADO`.
- **Ephemeral RAM Security:** Ephemeral context buffers are zeroed out and reclaimed on disposal and app shutdown.

---

## 6. Release Verdict

**VERDICT: H8.6 MVP RC1 APPROVED (PASS)**

The OpenLens DevOps H8.6 MVP Release Candidate 1 satisfies all functional, architectural, security, and packaging criteria defined for the MVP. Distribution packages and disk images are verified, cryptographic checksums recorded, and regression suites 100% green.
