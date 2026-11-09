# NovaKube — Certificación Definitiva de Release Candidate (FINAL-05-R2)

**Fecha:** 2026-11-08
**Rama:** `feature/final-05-release-candidate`
**Worktree:** `/private/var/tmp/lens-final-05-rc-20261108`
**Base de Develop:** `e72fcee7`
**Plataforma de Entrega:** macOS ARM64 (Apple Silicon)

---

## 1. Resumen Ejecutivo y Dictamen

El equipo de ingeniería (Opus como arquitecto principal y auditor de seguridad, Sonnet en implementación/packaging y Haiku en pruebas Jest, regresiones y verificación adversarial) presenta la certificación final para el hito **FINAL-05-R2: Remediación de seguridad, identidad y aislamiento**.

### Dictamen Técnico
> **ESTADO: APROBADO — RELEASE CANDIDATE OFFLINE INSTALABLE Y TÉCNICAMENTE AUDITADA**
>
> NovaKube ha sido corregida, recompilada y empaquetada como aplicación ejecutable nativa para macOS ARM64 (DMG y ZIP) conteniendo todos los binarios cliente requeridos (`kubectl`, `helm`, `lens-k8s-proxy`).
>
> El bundle supera estrictamente la verificación de firma de código en macOS (`codesign --verify --deep --strict`).
>
> **Límite de alcance y seguridad:** Las compuertas de seguridad se encuentran activas y en modo *fail-closed* por defecto (`isRealK8sAuthorized: false`). El acceso a Kubernetes real opera a través del proxy local loopback en `127.0.0.1` bajo control estricto del Broker, RBAC efectivo vía `canI` / `SelfSubjectAccessReview` y consentimiento verificable de un solo uso con scope binding. La aplicación no utiliza identidades ficticias, no inventa grupos ni credenciales de producción, y no interactúa con clústeres externos o APIs de IA reales sin autorización explícita. Por consiguiente, la Release Candidate se certifica como **instalable y técnicamente auditada en entorno controlado/offline**, reservando la calificación de "production-ready en red externa" hasta que se completen los acuerdos de autorización y despliegue corporativos.

---

## 2. Artefactos de Distribución Regenerados (R2)

Los paquetes de distribución fueron regenerados mediante `electron-builder` incorporando firma ad-hoc profunda en `afterPack`:

| Artefacto | Formato | Tamaño | SHA-256 | MD5 |
| :--- | :--- | :--- | :--- | :--- |
| **OpenLens DevOps-6.5.3-dev-arm64.dmg** | Apple Disk Image (APFS) | 243 MB | `a8693f7f46f1500da670a477fd1e0e4e29bec313223c1102afbab9af1c6a82a1` | `5e50cf77bd0642019999731c65cb80f9` |
| **OpenLens DevOps-6.5.3-dev-arm64-mac.zip** | Archivo comprimido ZIP | 234 MB | `e9658bb3203f4014d1c85d532ef2af527e36a9855a0c3bd293f17a5e82b50217` | `fafe4b1d00be0695ef6da83856e9e996` |
| **OpenLens DevOps.app** | Bundle macOS desempaquetado | ~670 MB | `open-lens/dist/mac-arm64/` | Ad-hoc Deep Strict (`valid on disk`) |

### Binarios Cliente Empaquetados
Ubicación interna: `OpenLens DevOps.app/Contents/Resources/arm64/`
- `kubectl` (v1.27.x, 50.4 MB, ejecutable ARM64 nativo)
- `helm` (v3.12.x, 52.4 MB, ejecutable ARM64 nativo)
- `lens-k8s-proxy` (37.2 MB, ejecutable ARM64 nativo)

---

## 3. Remediación de Seguridad y Aislamiento (FINAL-05-R2)

### 3.1. P0 — Identidad Auténtica y Consentimiento Verificable
- **Erradicación de Identidades Ficticias:** Se eliminó por completo el usuario fabricado `local-authorized-operator` y el grupo artificial `system:masters` en `setup-incident-ipc.injectable.ts`.
- **Resolución Auténtica desde Main:** La identidad del operador se resuelve desde el contexto autenticado del clúster en Main (`getClusterById`, `cluster.contextName` y el `user` del `KubeConfig`). Si el contexto no resuelve una identidad auténtica, el escáner falla inmediatamente en modo cerrado (`REAL_K8S_CONNECTIVITY_DISABLED`).
- **Grupos Auténticos y Principio de Menor Privilegio:** Únicamente se asigna `system:masters` si el clúster reporta explícitamente `cluster.isAdmin.get() === true`. En caso contrario, el operador retiene exclusivamente `system:authenticated`.
- **Consentimiento Verificable Criptográfico:** No se confía en un booleano `explicitConsent: true` aislado desde IPC. Se implementó `IncidentScannerConsentManager` (`incident-scanner-consent-manager.ts`), el cual genera tokens criptográficos de un solo uso vinculados estrictamente a `{ operatorUsername, clusterId, namespace }` con TTL acotado (5 minutos).
- **Consumo y Prevención Anti-Replay:** Cada token de consentimiento debe ser verificado y consumido de forma única en `scannerStart`. Cualquier token alterado, reutilizado, expirado o con discrepancia de clúster/operador provoca el rechazo inmediato (`REAL_K8S_CONNECTIVITY_DISABLED`) y la deshabilitación permanente de la fuente real (`scanner.disableRealK8sSnapshotSource()`).
- **Canal de Emisión Controlado:** Se añadió el canal IPC seguro `scannerRequestConsent` (`openlens:incident:scanner:request-consent`) para permitir que la UI o pruebas autorizadas soliciten consentimientos vinculados al contexto del operador autenticado.

### 3.2. P0 — RBAC Efectivo y Confinamiento de Broker
- **Sustitución de Verificadores Triviales:** Se reemplazaron los verificadores de permisos simplistas de `incident-broker.injectable.ts` que concedían acceso incondicional si el verbo era `get` o `list`.
- **Evaluación Kubernetes Real:**
  - `userAccessChecker`: Verifica que el usuario esté autenticado. Valida el estado accesible y conectado del clúster. Comprueba que el namespace solicitado pertenezca a `cluster.allowedNamespaces` (evaluado mediante `SelfSubjectAccessReview`). Para usuarios que no son administradores del clúster, invoca `canI` (`createCanIInjectable` / `SelfSubjectAccessReview`) evaluando el cuarteto `{ namespace, resource, verb, name }`. Ante fallos de red o respuestas negativas, rechaza en modo cerrado.
  - `agentAccessChecker`: Valida que la identidad técnica de la ServiceAccount (`KubernetesTechnicalIdentityManager`) esté activa, posea token no expirado y coincida con el clúster. Confinamiento estricto: la ServiceAccount técnica no puede operar fuera de su namespace asignado salvo en namespaces de infraestructura permitidos.
- **Erradicación de Propiedades Privadas:** Se eliminó el acceso irregular a `(brokerService as any).sessions` en `real-k8s-snapshot-source.injectable.ts`.
- **API Pública Auditable en Broker:** Se incorporó el método público oficial `findActiveSession(clusterId: string, namespace: string, username?: string): BrokerSession | undefined` en `IncidentBrokerService`.
- **Bloqueo Preventivo HTTP:** Si la sesión del Broker o la evaluación RBAC de doble identidad deniega el acceso (`BROKER_AUTHORIZATION_DENIED`), la recolección aborta inmediatamente antes de que el cliente HTTP emita tráfico a la red loopback.

### 3.3. P0 — Restauración de Protección TOCTOU en `LocalIncidentScanner`
- **Captura Inmutable de Generación y Alcance:** Al inicio de `LocalIncidentScanner.processSnapshot()`, se capturan de forma inmutable `capturedGeneration = this.scopeGeneration` y `capturedScope = { ...this.currentScope }`.
- **Guardias Pre y Post-Persistencia:** Antes y después de cada llamada asíncrona de persistencia (`this.deduplicator.ingestSignal`), se ejecuta `assertValidProcessingScope()`, verificando `isEnabled`, `scopeGeneration`, `clusterId`, `namespace` y `AbortSignal`.
- **Defensa Cross-Cluster Estricta:** Se verifica que cada señal coincida con `capturedScope.clusterId`. Cualquier intento de persistir señales de un clúster disímil lanza `CLUSTER_SCOPE_VIOLATION`.
- **Aborto Inmediato y Cero Persistencia Post-Switch:** Ante un cambio de clúster o detención del escáner durante la ejecución de un snapshot, el bucle se interrumpe de inmediato lanzando `SnapshotSourceSecurityError("OPERATION_ABORTED", ...)`, garantizando que ninguna señal posterior sea persistida en el deduplicador ni en SQLite, y preservando la integridad de los contadores métricos.
- **Verificación Adversarial Automatizada:** Se incorporó una prueba adversarial en `real-k8s-snapshot-source-integration.test.ts` que conmuta el escáner a un clúster B a mitad de la persistencia de un snapshot con múltiples anomalías en clúster A, certificando la captura de `OPERATION_ABORTED` y CERO persistencias de señales posteriores al cambio.

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
| **Jest NovaKube Regresión** | 48 suites focalizadas (`--runInBand`) | **48/48 suites PASS (649 tests)** | 100% pruebas en verde, 0 regresiones. |
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
  - *(Commit actual de remediación R2)*: `fix(final-05-r2): remediate authentic identity, real rbac and toctou scope protection`
- **Aislamiento:** Rama `develop` intacta. Sin merge ni push.
