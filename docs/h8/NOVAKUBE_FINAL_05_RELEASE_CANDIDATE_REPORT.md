# NovaKube — Certificación Definitiva de Release Candidate (FINAL-05-R3)

**Fecha:** 2026-11-08
**Rama:** `feature/final-05-release-candidate`
**Worktree:** `/private/var/tmp/lens-final-05-rc-20261108`
**Base de Develop:** `e72fcee7`
**Plataforma de Entrega:** macOS ARM64 (Apple Silicon)

---

## 1. Resumen Ejecutivo y Dictamen

El equipo de ingeniería (Opus como arquitecto principal y auditor de seguridad, Sonnet en implementación/packaging y Haiku en pruebas Jest, regresiones y verificación adversarial) presenta la certificación final para el hito **FINAL-05-R3: Cierre de tres bloqueos de seguridad**.

### Dictamen Técnico
> **ESTADO: APROBADO — RELEASE CANDIDATE OFFLINE INSTALABLE Y TÉCNICAMENTE AUDITADA**
>
> NovaKube ha sido corregida, recompilada y empaquetada como aplicación ejecutable nativa para macOS ARM64 (DMG y ZIP) conteniendo todos los binarios cliente requeridos (`kubectl`, `helm`, `lens-k8s-proxy`).
>
> El bundle supera estrictamente la verificación de firma de código en macOS (`codesign --verify --deep --strict`).
>
> **Límite de alcance y seguridad:** Las compuertas de seguridad se encuentran activas y en modo *fail-closed* por defecto (`isRealK8sAuthorized: false`). El acceso a Kubernetes real opera a través del proxy local loopback en `127.0.0.1` bajo control estricto del Broker, RBAC efectivo evaluado mediante Kubernetes Access Reviews (`canI` / `SelfSubjectAccessReview` para el operador y `SubjectAccessReview` para la ServiceAccount técnica), y consentimiento humano auténtico de un solo uso confirmado mediante diálogo confiable de Main con estricta igualdad de namespace. Se garantiza cero persistencia de escrituras post-revocación o cambio de clúster mediante guardias de confirmación transaccionales en SQLite. La Release Candidate se certifica como **instalable y técnicamente auditada en entorno controlado/offline**.

---

## 2. Artefactos de Distribución Regenerados (R3)

Los paquetes de distribución fueron regenerados mediante `electron-builder` incorporando firma ad-hoc profunda en `afterPack`:

| Artefacto | Formato | Tamaño | SHA-256 | MD5 |
| :--- | :--- | :--- | :--- | :--- |
| **OpenLens DevOps-6.5.3-dev-arm64.dmg** | Apple Disk Image (APFS) | 254 MB | `32b494d495a48658e1f19e1578b0bea6ee6290437cfaf1e33544c5127e0a4935` | `1cc81d7307d827acc6f9ddfae17a3392` |
| **OpenLens DevOps-6.5.3-dev-arm64-mac.zip** | Archivo comprimido ZIP | 171 MB | `e6386adc345b162a1bdfd7cef6ad5e7fadb09f878e3728750a5e527bb35a36de` | `100cd587c0dc0af4f3574c0573da13b8` |
| **OpenLens DevOps.app** | Bundle macOS desempaquetado | ~670 MB | `open-lens/dist/mac-arm64/` | Ad-hoc Deep Strict (`valid on disk`) |

### Binarios Cliente Empaquetados
Ubicación interna: `OpenLens DevOps.app/Contents/Resources/arm64/`
- `kubectl` (v1.27.x, 50.4 MB, ejecutable ARM64 nativo)
- `helm` (v3.12.x, 52.4 MB, ejecutable ARM64 nativo)
- `lens-k8s-proxy` (37.2 MB, ejecutable ARM64 nativo)

---

## 3. Remediación Focal de Seguridad (FINAL-05-R3)

### 3.1. P0-01 — Consentimiento Humano Auténtico e Igualdad Estricta de Namespace
- **Confirmación Humana Explícita en Main:** `scannerRequestConsent` ya no emite tokens automáticamente por recibir una llamada IPC. Invoca `requestHumanConsent` a través de un proveedor de confirmación confiable en Main (`dialog.showMessageBox`), presentando al operador el clusterId, namespace y alcance exclusivamente de lectura.
- **Cancelación Fail-Closed:** Si el operador cancela o rechaza el diálogo, la solicitud es denegada arrojando `ConsentDeniedError` y emitiendo cero tokens.
- **Erradicación de Payloads Ficticios:** Se eliminó cualquier lectura de `operatorUsername` desde payloads IPC. La identidad se resuelve exclusivamente del contexto autenticado del clúster (`KubeConfig` / `cluster.contextName`). Fabricados como `local-authorized-operator` son rechazados con 403 `REAL_K8S_CONNECTIVITY_DISABLED`.
- **Igualdad Estricta de Namespace:** En `IncidentScannerConsentManager`, la verificación compara estrictamente `record.namespace === params.namespace`. Un token emitido con `namespace: undefined` (cluster-wide) no puede ser utilizado para iniciar escaneo en un namespace específico, y viceversa.

### 3.2. P0-02 — RBAC Efectivo Real y Verificación AccessReview Fail-Closed
- **Erradicación de Atajos Permisivos:** Se eliminaron las suposiciones de acceso basadas en `cluster.isAdmin` o declaración manual de grupos `system:masters`. El operador recibe el grupo de menor privilegio `system:authenticated`.
- **Verificación Separada de Doble Identidad:**
  - **Operador Humano:** Evaluado obligatoriamente mediante `canI` (`SelfSubjectAccessReview`) ante el Kubernetes API server para el cuarteto `{ namespace, resource, verb: "list" }`.
  - **Identidad Técnica (ServiceAccount):** Evaluada mediante `SubjectAccessReview` oficial. Se eliminaron excepciones automáticas para `default` o `kube-system`. Si la ServiceAccount técnica carece de permisos de listado, el broker deniega el acceso fail-closed (`DENY`).
- **Cero Tráfico HTTP ante Denegación:** La verificación de autorización ocurre previa a la emisión de peticiones HTTP, garantizando cero llamadas al proxy cuando el AccessReview resulta negativo.

### 3.3. P0-03 — Persistencia con Cero Escrituras Post-Revocación o Cambio de Clúster
- **Commit Guard Intra-Transaccional en SQLite:** En `IncidentDeduplicator.ingestSignal`, se inyecta el `commitGuard` (`assertValidProcessingScope`) que se ejecuta inmediatamente antes de confirmar y retornar la transacción SQLite de `better-sqlite3`.
- **Rollback Inmediato y Cero Rastro en Memoria:** Si el escáner fue detenido, revocado o conmutado de clúster durante la persistencia de una señal, el `commitGuard` arroja `SnapshotSourceSecurityError("OPERATION_ABORTED")`. Esto provoca el ROLLBACK automático de SQLite, impidiendo la confirmación de la fila y cancelando la actualización en memoria (`inMemoryUpdate`).
- **Prueba Determinística de Pausa Pre-Commit:** Se verificó mediante test unitario adversarial que la conmutación de clúster intra-transacción resulta en `OPERATION_ABORTED`, cero escrituras persistidas en el repositorio y cero registros en el tracking en memoria del deduplicador.

---

## 4. Distinción de Ejecución y Metodología E2E

Para garantizar total transparencia de auditoría sobre el entorno de pruebas:

1. **Pre-Check del Ejecutable Empaquetado (`OpenLens DevOps.app`):**
   - El script E2E ejecuta en primer lugar `verifyPackagedBinaryBoot()`, apuntando directamente a `open-lens/dist/mac-arm64/OpenLens DevOps.app/Contents/MacOS/OpenLens DevOps`.
   - Se valida físicamente la existencia del bundle empaquetado, sus binarios internos ARM64 y la validez estricta de su firma de código ad-hoc (`codesign --verify --deep --strict --verbose=4`).
   - Se ejecuta el binario empaquetado con bandera de prueba controlada en subproceso aislado para verificar su arranque en frío y salida limpia sin fallos ni crasheos.
2. **Batería E2E de Playwright en Runtime Electron Auténtico:**
   - La instrumentación de interacción UI, docking, temas, consentimientos modales y diagnósticos opera a través de Playwright sobre el motor Electron auténtico con punto de entrada de la aplicación (`packages/core/dist/main.js`).
   - Esta arquitectura permite inyectar el interceptor de red temprano (`early-network-guard.cjs`) para auditar en tiempo real que ningún frame secundario o petición no autorizada escape del loopback `127.0.0.1`.
   - Ambas capas certifican conjuntamente que tanto el paquete instalable como la lógica de aplicación satisfacen todos los requerimientos funcionales y de seguridad.

---

## 5. Matriz Consolidada de Pruebas

| Suite / Control | Alcance | Resultado | Notas |
| :--- | :--- | :--- | :--- |
| **TypeScript Compiler** | `packages/core/tsconfig.json --noEmit` | **PASS (0 errores)** | Tipado estricto verificado en toda la base. |
| **Jest NovaKube Regresión** | 48 suites focalizadas (`--runInBand`) | **48/48 suites PASS (653 tests)** | 100% pruebas en verde, 0 regresiones (+4 tests adversariales R3). |
| **Firma de Código macOS** | `codesign --verify --deep --strict` | **PASS** | Bundle, Frameworks y Helpers verificados. |
| **Pre-check de Paquete** | Ejecutable `.app` empaquetado | **PASS** | Booteo físico y parada limpia. |
| **E2E Electron Playwright** | 12 escenarios de aplicación real | **12/12 PASS** | Capturas de evidencia en `docs/evidence/h8-8-05/real-app/`. |
| **Política de Red Temprana** | Loopback estricto / Aislamiento | **PASS** | Cero tráfico externo permitido. |
| **Git Diff Check** | `git diff --check e72fcee7` | **PASS (0 advertencias)** | Sin trailing whitespace. |

---

## 6. Trazabilidad de Git

- **Rama:** `feature/final-05-release-candidate`
- **Worktree Aislado:** `/private/var/tmp/lens-final-05-rc-20261108`
- **Base Develop:** `e72fcee7`
- **Commits del Hito:**
  - `653209f6`: `feat(incident-scanner): wire production loopback proxy and verify real k8s security gates (FINAL-05)`
  - `8df6330e`: `docs(h8): record NovaKube FINAL-05 Release Candidate certification report`
  - `6027bffb`: `fix(final-05-r1): complete real k8s broker wiring, ad-hoc codesign and e2e suite`
  - `d29f432f`: `fix(final-05-r2): remediate authentic identity, real rbac and toctou scope protection`
  - *(Commit actual de remediación R3)*: `fix(final-05-r3): enforce authentic human consent, fail-closed rbac and zero post-revocation writes`
- **Aislamiento:** Rama `develop` intacta. Sin merge ni push.
