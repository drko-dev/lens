# OpenLens DevOps — H8.6.1 Post-RC Hardening & Review Remediation

**Fecha:** 2026-11-06  
**Rama:** `feature/h8-6-1-post-rc-hardening`  
**Commit de Entrega:** `baea0947`  
**Baseline de Entrada:** `a48f0747` (basado en RC1 `24ce1d35`)  
**Workspace:** `/Users/gustavomarcon/Documents/lens/lens-v6-ui-corrections`  
**Dictamen Técnico:** **APROBADO PARA INTEGRACIÓN A DEVELOP (PASS)**

---

## 1. Resumen Ejecutivo

Este hito ejecutó el endurecimiento post-RC1 sobre la rama `feature/h8-6-1-post-rc-hardening`, remediando de forma exhaustiva los tres hallazgos residuales identificados en `docs/h8/H8_6_1_POST_RC_INDEPENDENT_REVIEW.md` (RC-RES-01, RC-RES-02 y RC-RES-03), sin alterar el binario RC1 preservado en `open-lens/dist/h8-mvp-rc1/`.

---

## 2. Remediación Detallada de Hallazgos

### 2.1 RC-RES-01 — Deduplicación Determinística y Persistencia Indexada
- **Problema previo:** Si `findOpenIncidentByFingerprint` no hallaba coincidencia, `IncidentDeduplicator.ingestSignal` ejecutaba un fallback ambiguo por recurso (`findOpenIncidentByResource(clusterId, namespace, resourceKind, resourceName)`), agrupando anomalías de distinta naturaleza o pods recreados con nombres idénticos bajo el mismo incidente. Además, la búsqueda de huella en SQLite dependía de escanear JSON en la tabla `incident_timeline` mediante `LIKE`.
- **Remediación:**
  1. **Migración SQLite 008 (`008_incident_fingerprint_and_resource_uid`):** Incorpora columnas `fingerprint TEXT NOT NULL DEFAULT ''`, `resource_uid TEXT`, y `signal_type TEXT` directamente en la tabla `incidents`, con índices dedicados `idx_incidents_fingerprint` e `idx_incidents_resource_uid`.
  2. **Eliminación del Fallback Ambiguo:** Se removió por completo la consulta de fallback por nombre de recurso en `IncidentDeduplicator.ingestSignal()`. Cada señal se deduplica exclusivamente contra su huella determinística SHA-256 (`clusterId:namespace:kind:name:signalType:resourceUid`).
  3. **Consulta Indexada en `IncidentRepository`:** `findOpenIncidentByFingerprint(fingerprint)` consulta directamente la columna indexada en `incidents` en $O(1)$, manteniendo un fallback secundario exclusivo para datos preexistentes.
  4. **Cobertura de Pruebas:**
     - Pods recreados con nuevo UID y mismo nombre generan incidentes separados (`TEST-HARDEN-01`).
     - Dos señales distintas sobre el mismo pod (`OOM_KILLED` y `CRASH_LOOP_BACKOFF`) generan incidentes separados (`TEST-HARDEN-02`).
     - Deduplicación tras reinicio en frío verificada contra el índice de SQLite (`TEST-HARDEN-04`).
     - Resistencia a alta concurrencia probada (`TEST-HARDEN-05`).

### 2.2 RC-RES-02 — Hardening de Identidad de Auditoría
- **Problema previo:** `handleAlertAction` aceptaba el campo `payload.operatorName` enviado desde el Renderer y registraba al actor en el timeline como `authorType: "human"` con `id: "authenticated-operator"`, permitiendo que un cliente no confiable suplantara un rol administrativo en auditoría.
- **Remediación:**
  1. **Actor Local No Verificado:** Main ya no confiere estatus autenticado al Renderer para estas acciones de alerta. El actor se registra estrictamente como:
     ```typescript
     {
       type: "human",
       id: "unverified-local-operator",
       name: "Operador Local (No verificado: ${claimedName})",
       authorizationContext: { role: "operator", tokenVerified: false }
     }
     ```
  2. **Aislamiento en Metadatos de Auditoría:** El nombre provisto por el cliente se sanitiza y se conserva únicamente bajo `metadata.claimedOperatorName`, marcando explícitamente `metadata.isVerifiedIdentity: false`.
  3. **Cobertura de Pruebas:**
     - Enviar `operatorName: "cluster-admin"` no eleva privilegios ni otorga `authenticated-operator` (`TEST-HARDEN-06`).
     - Acciones de `snooze` y `analyze_now` registran al actor como no verificado sin desencadenar llamadas de IA (`TEST-HARDEN-07`, `TEST-HARDEN-08`).

### 2.3 RC-RES-03 — Procedencia Sintética y Aislamiento de Alcance
- **Problema previo:** Las ingestas de snapshots desde Renderer requerían una delimitación inequívoca para no confundirse con observaciones reales certificadas por el broker H8.2.
- **Remediación:**
  1. **Etiquetado Explícito de Procedencia:** Los incidentes generados por el escáner local incorporan el prefijo `[DEMO SINTÉTICO]` en su mensaje inicial y sellan en metadatos `sourceType: "synthetic_feed"`, `isSyntheticDemo: true` y `provenance: "synthetic_renderer_snapshot"`.
  2. **Aislamiento Estricto de Namespace:** El escáner filtra y descarta cualquier recurso cuyo namespace no coincida con el ámbito autorizado (`TEST-HARDEN-10`).
  3. **Validación de Frame Emisor:** Se reforzó la verificación de emisor IPC (`validateIpcSender`), rechazando invocaciones desde subframes, ventanas destruidas u orígenes no autorizados (`TEST-HARDEN-11`).

### 2.4 Actualización Documental sobre Instaladores en Disco
- En `docs/h8/H8_6_MVP_RC1_RELEASE_REPORT.md` se corrigió la mención a builds antiguos: se aclaró explícitamente que las carpetas de empaquetado anteriores (`rc4`, `h8-rc1`) fueron eliminadas en limpiezas previas por decisión del usuario para preservar espacio en disco. En `open-lens/dist/` únicamente existe `h8-mvp-rc1/`.

---

## 3. Matriz de Verificación y Pruebas

- **Total Test Suites:** 32 passed / 32 total (100%).
- **Total Tests:** 278 passed / 278 total (100%).
- **Suites Clave Ejecutadas:**
  - `src/main/incident-scanner/__tests__/h8-6-1-post-rc-hardening.test.ts` (11 tests — 100% PASS).
  - `src/main/incident-scanner/__tests__/h8-6-adversarial-security.test.ts` (7 tests — 100% PASS).
  - `src/main/incident-scanner/__tests__/h8-6-resilience-performance.test.ts` (5 tests — 100% PASS).
  - `src/main/incident-scanner/__tests__/incident-deduplicator.test.ts` (10 tests — 100% PASS).
  - `src/main/incident-broker/__tests__/` (13 tests de broker y PEP — 100% PASS).
  - `src/main/ai-diagnostics/__tests__/` (ephemeral context, vault, citations — 100% PASS).

---

## 4. Dictamen Final y Recomendación para Develop

1. **Estado del Binario RC1:** El release candidate compilado en `open-lens/dist/h8-mvp-rc1/` (DMG: `862b227...`, ZIP: `55aa127...`) se mantiene intacto y congelado para pruebas internas y demostración sintética.
2. **Listo para Merge:** La rama `feature/h8-6-1-post-rc-hardening` contiene las correcciones arquitectónicas limpias, transaccionales y respaldadas por 278 pruebas unitarias y de integración.
3. **Recomendación:** Se dictamina **PASS** y se recomienda la integración de `feature/h8-6-1-post-rc-hardening` a la rama principal de desarrollo (`develop`) mediante fast-forward o merge limpio sin reescritura de historia.
