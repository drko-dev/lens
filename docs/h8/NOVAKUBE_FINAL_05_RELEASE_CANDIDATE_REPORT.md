# NovaKube — Certificación Definitiva de Release Candidate (FINAL-05-R1)

**Fecha:** 2026-11-08  
**Rama:** `feature/final-05-release-candidate`  
**Worktree:** `/private/var/tmp/lens-final-05-rc-20261108`  
**Base de Develop:** `e72fcee7`
**Plataforma de Entrega:** macOS ARM64 (Apple Silicon)  

---

## 1. Resumen Ejecutivo y Dictamen

El equipo de ingeniería (Opus como arquitecto principal y auditor, Sonnet en implementación/packaging y Haiku en pruebas Jest, regresiones y verificación adversarial) presenta la certificación final para el hito **FINAL-05-R1: Corrección de los bloqueos de aceptación**.

### Dictamen Técnico
> **ESTADO: APROBADO — RELEASE CANDIDATE OFFLINE INSTALABLE Y TÉCNICAMENTE AUDITADA**
>
> NovaKube ha sido corregida, recompilada y empaquetada como aplicación ejecutable nativa para macOS ARM64 (DMG y ZIP) conteniendo todos los binarios cliente requeridos (`kubectl`, `helm`, `lens-k8s-proxy`).
>
> El bundle supera estrictamente la verificación de firma de código en macOS (`codesign --verify --deep --strict`).
>
> **Límite de alcance y seguridad:** Las compuertas de seguridad se encuentran activas y en modo *fail-closed* por defecto (`isRealK8sAuthorized: false`). El acceso a Kubernetes real opera a través del proxy local loopback en `127.0.0.1` bajo control estricto del Broker y doble identidad RBAC, requiriendo consentimiento explícito del operador. La aplicación no utiliza credenciales de producción ni interactúa con clústeres externos o APIs de IA reales sin autorización explícita. Por consiguiente, la Release Candidate se certifica como **instalable y técnicamente auditada en entorno controlado/offline**, reservando la calificación de "production-ready en red externa" hasta que se completen los acuerdos de autorización y despliegue corporativos.

---

## 2. Artefactos de Distribución Regenerados

Los paquetes de distribución fueron regenerados mediante `electron-builder` incorporando firma ad-hoc profunda en `afterPack`:

| Artefacto | Formato | Tamaño | SHA-256 | MD5 |
| :--- | :--- | :--- | :--- | :--- |
| **OpenLens DevOps-6.5.3-dev-arm64.dmg** | Apple Disk Image (APFS) | 244 MB | `fd208fd094774fbc3532970781dc866fd11206d6f2137d1171b64d5830c7dfc7` | `3a3d9771a6a46adb16ef671c66e49440` |
| **OpenLens DevOps-6.5.3-dev-arm64-mac.zip** | Archivo comprimido ZIP | 235 MB | `783d69dfc1d7229648b50a7dd56eb68d08723b9091af9ad16b0cb725987d627f` | `ab50c0d0c26bf6af9f2b5247ee7c3193` |
| **OpenLens DevOps.app** | Bundle macOS desempaquetado | ~670 MB | `open-lens/dist/mac-arm64/` | Ad-hoc Deep Strict (`valid on disk`) |

### Binarios Cliente Empaquetados
Ubicación interna: `OpenLens DevOps.app/Contents/Resources/arm64/`
- `kubectl` (v1.27.x, 50.4 MB, ejecutable ARM64 nativo)
- `helm` (v3.12.x, 52.4 MB, ejecutable ARM64 nativo)
- `lens-k8s-proxy` (37.2 MB, ejecutable ARM64 nativo)

---

## 3. Remediación de Bloqueos de Aceptación (FINAL-05-R1)

### 3.1. P1-01 — Cableado y Autorización de Kubernetes Real
- **Selección Autorizada Fake / Real:** `LocalIncidentScanner` soporta ambas fuentes mediante inyección de dependencias (`fakeK8sSnapshotSourceInjectable` y `realK8sSnapshotSourceInjectable`). Por defecto arranca en modo sintético offline (`fake`, `isSyntheticDemo: true`).
- **Compuerta de Consentimiento Explícito:** La activación de `RealK8sSnapshotSource` exige `explicitConsent: true` y comprobación de identidad de operador autenticado desde Main (`MISSING_USER_IDENTITY`, `REAL_K8S_CONNECTIVITY_DISABLED`).
- **Integración con IncidentBrokerService:** Se creó `incident-broker.injectable.ts` para conectar el Broker con doble identidad (RBAC de usuario + cuenta de servicio técnica). El `brokerContract` evalúa cada recurso individualmente (`authorizeResourceRead`).
- **Cero Tráfico HTTP ante Denegación:** Si el Broker deniega la solicitud (`BROKER_AUTHORIZATION_DENIED`), la recolección aborta inmediatamente antes del cliente HTTP, certificando CERO peticiones HTTP salientes.
- **Revocación y Aborto por Cambio de Contexto:** Si el operador cambia de clúster o namespace, el escáner revoca automáticamente la autorización de la fuente real, aborta las peticiones en vuelo mediante `scopeGeneration` e invalida la sesión, regresando a modo seguro Fake.
- **Demostración E2E desde IPC:** Haiku incorporó 4 nuevos escenarios en `real-k8s-snapshot-source-integration.test.ts` verificando el ciclo completo IPC -> Scanner -> Broker -> HTTP loopback proxy -> Snapshot.

### 3.2. P1-02 — Integridad y Firma de Código macOS
- **Causa Raíz:** `electron-builder` con `CSC_IDENTITY_AUTO_DISCOVERY=false` omitía la firma ad-hoc profunda del bundle, generando un Mach-O con requerimiento de recursos pero sin sellado en `CodeResources`.
- **Solución Implementada:** Se implementó un hook `afterPack` en `open-lens/build/sign-adhoc.js` configurado en `open-lens/package.json`.
- **Verificación Estricta:** Ejecuta `codesign --force --deep --sign -` y valida con:
  ```bash
  codesign --verify --deep --strict --verbose=4 "OpenLens DevOps.app"
  ```
  Resultado comprobado: `valid on disk` y `satisfies its Designated Requirement` tanto para la app como para sus Helpers y Frameworks embebidos.
- **Estado de Notarización:** Registrado formalmente como **BLOQUEADO (BY DESIGN)** por ausencia justificada de credenciales de Apple Developer ID (`APPLEID`, `APPLEIDPASS`).

### 3.3. P1-03 — Batería E2E de la Versión Correcta
- **Resolución Dinámica de Rutas:** Se erradicó el path estático hacia worktrees antiguos en `open-lens/integration/h8-8-05-real-app.mjs`, resolviendo dinámicamente la raíz del repositorio con `import.meta.url`.
- **Autosuficiencia del Worktree:** Se integraron los módulos y dists necesarios (`@openlens/messaging-for-main`, `Electron.app`) en el worktree FINAL-05, eliminando cualquier dependencia de directorios externos.
- **Pre-check de Aplicación Empaquetada:** Se incorporó `verifyPackagedBinaryBoot()`, verificando físicamente la existencia del ejecutable empaquetado `OpenLens DevOps.app`, su firma ad-hoc estricta y su arranque en sandbox sin crasheos.
- **Ejecución de 12 Escenarios E2E (12/12 PASS):**
  1. Activación de tema NovaKube en Welcome screen.
  2. Conexión al clúster demo y navegación al Centro de Incidentes en frame principal.
  3. Detección determinista con snapshots y deduplicación verificada.
  4. Apertura de Incident Workbench y verificación de pestañas.
  5. Ingestión de evidencia con secretos sensibles y verificación de saneamiento en SQLite.
  6. Modal de consentimiento IA con emisión de token de un solo uso.
  7. Diagnóstico conclusivo con citas verificadas y rechazo anti-replay.
  8. Diagnóstico inconcluso por telemetría faltante.
  9. Transición de ciclo de vida de la máquina de estados y defensa cross-cluster TOCTOU.
  10. Detención limpia del escáner en reposo (0 watchers activos).
  11. Verificación de Terminal y Kubetail en el shell auténtico (`dock-store`).
  12. Verificación de Docking y Ventanas Desacopladas (`split-panel-store`).
- **Procesos Residuales:** Limpieza confirmada al cierre sin procesos huérfanos.

---

## 4. Matriz Consolidada de Pruebas

| Suite / Control | Alcance | Resultado | Notas |
| :--- | :--- | :--- | :--- |
| **TypeScript Compiler** | `packages/core/tsconfig.json --noEmit` | **PASS (0 errores)** | Tipado estricto verificado. |
| **Jest NovaKube Regresión** | 48 suites focalizadas (`--runInBand`) | **48/48 suites PASS (646 tests)** | 100% pruebas en verde. |
| **Firma de Código macOS** | `codesign --verify --deep --strict` | **PASS** | Bundle, Frameworks y Helpers verificados. |
| **Pre-check de Paquete** | Ejecutable `.app` empaquetado | **PASS** | Booteo físico y parada limpia. |
| **E2E Electron Playwright** | 12 escenarios de aplicación real | **12/12 PASS** | Capturas de evidencia en `docs/evidence/h8-8-05/real-app/`. |
| **Política de Red Temprana** | Loopback estricto / Aislamiento | **PASS** | Cero tráfico externo permitido. |
| **Git Diff Check** | `git diff --check` | **PASS (0 advertencias)** | Sin trailing whitespace. |

---

## 5. Trazabilidad de Git

- **Rama:** `feature/final-05-release-candidate`
- **Worktree Aislado:** `/private/var/tmp/lens-final-05-rc-20261108`
- **Base Develop:** `e72fcee7`
- **Commits del Hito:**
  - `653209f6`: `feat(incident-scanner): wire production loopback proxy and verify real k8s security gates (FINAL-05)`
  - `8df6330e`: `docs(h8): record NovaKube FINAL-05 Release Candidate certification report`
  - *(Commit actual de remediación R1)*: `fix(final-05-r1): complete real k8s broker wiring, ad-hoc codesign and e2e suite`
- **Aislamiento:** Rama `develop` intacta. Sin merge ni push.
