# OpenLens DevOps — H8 MVP Release Candidate 2 Report

**Release Candidate:** H8 MVP RC2 (Hardened Fingerprint Deduplication, Audit Identity, Provenance Isolation & SQLite v8 Migration)  
**Date:** 2026-11-06  
**Target Environment:** macOS ARM64 (Apple Silicon)  
**Runtime:** Electron 45.2.0, Node.js v24.22.2 (via NVM)  
**Branch:** `feature/h8-mvp-rc2`  
**Workspace:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`  
**Distribution Gate Status:** **H8 MVP RC2 APPROVED (PASS)**

---

## 1. Release Artifacts & Cryptographic Checksums

All distribution artifacts for RC2 are isolated in `open-lens/dist/h8-mvp-rc2/`. The previous baseline RC1 artifacts remain intact in `open-lens/dist/h8-mvp-rc1/` and were verified via SHA-256 prior to building RC2.

### 1.1 RC2 Distribution Artifacts (`open-lens/dist/h8-mvp-rc2/`)

| Artifact File | Format | Architecture | Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- | :--- |
| `OpenLens DevOps-6.5.3-dev-arm64.dmg` | APFS Disk Image | `darwin-arm64` | ~245 MB | `b9ae0fb74ac0372a466365461dc017154f63b0b0f12bcd9d6a906d0cb611d9a1` |
| `OpenLens DevOps-6.5.3-dev-arm64-mac.zip` | Compressed Archive | `darwin-arm64` | ~236 MB | `209d9da9bb8547df4f2dc437a2012610a428d0fce33a9b919f6bdeecd0a5e681` |
| `mac-arm64/OpenLens DevOps.app` | macOS App Bundle | `darwin-arm64` | Mach-O thin | Verified via `codesign --verify --deep --strict` |
| `SHA256SUMS` | Manifest | Text | 208 B | Included in distribution directory |

### 1.2 Preserved Baseline Checksums (`open-lens/dist/h8-mvp-rc1/`)

- **RC1 DMG:** `862b227b8bdc48afd2a16e6f7cfeac9cd77d5c1b04962aa57356bf5e2cff5678` (VALID)
- **RC1 ZIP:** `55aa127382992840e4baad01b10a10e501330a58a4403e1b0ee43ebd51b9cb8c` (VALID)

### 1.3 Code Signing & Integrity Verification
- **Signature Mechanism:** Ad-hoc deep entitlement signature (`codesign --force --deep --sign - --entitlements build/entitlements.mac.plist`).
- **Codesign Audit:**
  ```text
  Executable=.../mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps
  Identifier=dev.drko.openlens-devops
  Format=app bundle with Mach-O thin (arm64)
  CodeDirectory v=20400 size=433 flags=0x2(adhoc) hashes=3+7 location=embedded
  CDHash=43982381f9c4a731a1a066afdf95395428092e9b
  Signature=adhoc
  ```
- **DMG APFS Volume Integrity:**
  ```text
  hdiutil: verify: checksum of "open-lens/dist/h8-mvp-rc2/OpenLens DevOps-6.5.3-dev-arm64.dmg" is VALID
  ```
- **Notarization:** Internal QA distribution only. Public Apple Developer ID notarization remains pending.

---

## 2. Hardening Remediations (RC-RES-01..03 & Migration 008)

The following post-RC1 review findings were resolved and integrated into RC2:

| Item | Focus | Risk / Issue | Resolution & Hardening |
| :--- | :--- | :--- | :--- |
| **RC-RES-01** | Deterministic Deduplication | Ambiguous fallback grouped signals solely by resource name; pod recreations or distinct signal types collided | Fingerprint canonical key incorporates `resourceUid` and `signalType` (`${clusterId}:${namespace}:${kind}:${name}:${signalType}:${resourceUid}`). Backed by SQLite migration 008 adding `fingerprint`, `resource_uid`, `signal_type` columns and indexed with `idx_incidents_fingerprint`. Tested across pod recreation, multiple signal types, concurrency, and cold restart. |
| **RC-RES-02** | Audit Identity Hardening | Operator name supplied from Renderer was recorded without verified provenance | Renderer claims cannot impersonate trusted actors. Main records `actorId: "unverified-local-operator"` with `isVerifiedIdentity: false` and logs the requested string into `claimedOperatorName`. |
| **RC-RES-03** | Synthetic Provenance & Isolation | Potential ambiguity between synthetic scanner alerts and broker observations | Snapshots are explicitly tagged `isSyntheticDemo: true` and prefixed `[DEMO SINTÉTICO]`. Multi-window and cross-incident authorization enforces complete tenant isolation. |
| **Migration 008** | SQLite Schema Evolution | Upgrading from older v7 databases required non-destructive schema migration | Authored `MIGRATION_008_SQL` running safely in WAL mode, updating older records with default empty strings, creating query indexes, and preserving existing incident timeline and evidence intact. |

---

## 3. Test Suite & Regression Verification

### 3.1 Focused Jest Suites
- **Test Suites:** 34 passed / 34 total (100%).
- **Tests:** 294 passed / 294 total (100%).
- **Scope:** `incident`, `ai-diagnostics`, `global-panel-store`, `drop-zones`.

#### Verified Scenarios:
1. `h8-6-1-deduplication-hardening.test.ts`: Pod UID recreation, dual signals on same pod, index query performance, restart deduplication.
2. `h8-6-1-audit-identity.test.ts`: `unverified-local-operator` tracking, Renderer claim neutralization.
3. `h8-6-1-provenance-isolation.test.ts`: Explicit synthetic demo labeling, multi-window boundary enforcement.
4. `h8-6-adversarial-security.test.ts` & `h8-6-resilience-performance.test.ts`: Fail-closed security gates, rate-limiting, and WAL crash recovery.
5. `ai-diagnostics`, `incident-broker`, `incident-storage`: Full lifecycle, encrypted vault, ephemeral context, and citation integrity.

---

## 4. Packaged Application QA Pipeline (`open-lens/integration/h8-mvp-rc2-packaged-qa.mjs`)

Executed autonomously against the packaged macOS ARM64 binary (`mac-arm64/OpenLens DevOps.app`) under an isolated profile with pre-populated synthetic v7 database:

```text
==========================================================================
   OpenLens DevOps H8 MVP RC2 — Packaged QA Verification Pipeline         
==========================================================================
Binary: .../open-lens/dist/h8-mvp-rc2/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps
Isolated Profile: /var/folders/.../T/openlens-h8-mvp-rc2-qa-...

==> [Paso 1] Creando base sintética previa (v7) para validar migración v7 -> v8...
✓ Base sintética v7 creada con incidente preexistente 'INC-V7-LEGACY-01'.

==> [Paso 2] Iniciando aplicación empaquetada RC2 (Modo Producción, sin dev server)...
✓ Ventana principal cargada: https://lens.app:.../welcome
✓ Captura 01 guardada: docs/evidence/h8-mvp-rc2/01_rc2_packaged_launch.png

==> [Paso 3] Verificando ejecución de migración 008 y esquema SQLite...
  Migraciones aplicadas: v1..v8 completas.
  Columnas en tabla 'incidents': ... fingerprint, resource_uid, signal_type
  Índices detectados: ... idx_incidents_fingerprint
✓ Incidente legado v7 conservado intacto con fingerprint por defecto ('').
✓ Captura 02 guardada (Migración 8/8 Verificada): docs/evidence/h8-mvp-rc2/02_rc2_sqlite_v8_migration_upgrade.png

==> [Paso 4] Verificando Escáner Local (OFF por defecto) y activación Demo...
  Estado inicial: isEnabled=false, sourceType="synthetic_feed", activeWatchersCount=0
  Estado activado: isEnabled=true, activeWatchersCount=0
✓ Escáner activado en modo demo sintético transparente (0 watchers).
✓ Captura 03 guardada (Escáner Demo Activo): docs/evidence/h8-mvp-rc2/03_rc2_scanner_demo_mode.png

==> [Paso 5] Probando deduplicación por UID y coexistencia de señales distintas...
  Total incidentes en SQLite tras ingesta de 3 señales: 3
  Incidente Pod Gen 1: INC-... [CRASH_LOOP_BACKOFF]
  Incidente Pod Gen 2 (recreado): INC-... [CRASH_LOOP_BACKOFF]
  Incidente Señal OOMKilled: INC-... [OOM_KILLED]
✓ Deduplicación por UID y coexistencia de señales distintas verificadas exitosamente.
✓ Captura 04 guardada: docs/evidence/h8-mvp-rc2/04_rc2_signal_uid_deduplication.png

==> [Paso 6] Verificando auditoría con identidad de operador local no verificada...
  Resultado dismiss: true
  Actor ID en metadatos: unverified-local-operator
  isVerifiedIdentity: false
  claimedOperatorName: cluster-admin-root
✓ Identidad de operador local no verificada registrada correctamente.
✓ Captura 05 guardada: docs/evidence/h8-mvp-rc2/05_rc2_audit_unverified_operator.png

==> [Paso 7] Verificando Contexto Efímero, Diagnóstico Mock y Global Docking...
  Tablas presentes en SQLite: [sin tablas de cuerpos de contexto efímero]
  Global Docking host / SplitPanel verificado en DOM: true

==> [Paso 8] Probando reinicio en frío de la aplicación empaquetada RC2...
✓ Primera sesión cerrada limpiamente.
  Relanzando aplicación empaquetada RC2 con el mismo perfil...
  Re-ingestando señal existente tras reinicio: INC-...
  Total incidentes en SQLite tras reinicio y deduplicación: 3
✓ Deduplicación indexada post-reinicio confirmada exitosamente.
✓ Captura 06 guardada: docs/evidence/h8-mvp-rc2/06_rc2_restart_persistence_docking.png

==========================================================================
   H8 MVP RC2 — PACKAGED APPLICATION QA COMPLETADA EXITOSAMENTE (PASS)   
==========================================================================
```

### Visual Evidence Artifacts (`docs/evidence/h8-mvp-rc2/`):
- `01_rc2_packaged_launch.png`: Packaged production launch into production window.
- `02_rc2_sqlite_v8_migration_upgrade.png`: SQLite schema upgraded to v8 with legacy incident preserved.
- `03_rc2_scanner_demo_mode.png`: Scanner active in demo mode with 0 watchers.
- `04_rc2_signal_uid_deduplication.png`: Multiple signals and recreated pod UIDs coexisting deterministically.
- `05_rc2_audit_unverified_operator.png`: Safe dismissal with `unverified-local-operator` audit tracking.
- `06_rc2_restart_persistence_docking.png`: State recovery and deduplication post cold app restart.

---

## 5. Security & Architectural Invariants Compliance

- **Zero Real Kubernetes Writes:** Guaranteed by broker PEP policy enforcement (all mutating verbs rejected).
- **Zero Real Cluster Connections:** Tested exclusively with synthetic fixtures and mock cluster descriptors.
- **Zero Remote AI Calls:** Honest gating strictly active; mock diagnosis provider only.
- **Zero Data Leakage:** Ephemeral context buffers are zeroized upon investigation end, error, or app quit; zero raw file bytes are persisted to SQLite or disk.
- **Git Hygiene:** Executed strictly on branch `feature/h8-mvp-rc2`; zero git push and zero git merge performed.

---

## 6. Release Verdict

**Verdict:** **H8 MVP RC2 APPROVED (PASS)**  
OpenLens DevOps H8 MVP RC2 meets all cryptographic, architectural, security, and packaging criteria defined for the macOS ARM64 release candidate.
