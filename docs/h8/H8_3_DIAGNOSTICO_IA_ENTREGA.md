# OpenLens DevOps — H8.3 Entrega de Diagnóstico IA Bajo Demanda

## 1. Resumen Ejecutivo

Este documento formaliza la entrega de **H8.3 (Historias H8-014 a H8-018)** en el repositorio OpenLens (`feature/h8-3-ai-diagnostics`), incorporando capacidades de diagnóstico asistido por IA, generación de propuestas de remediación reversibles, verificación read-only posterior y control presupuestario estricto.

Todas las implementaciones se construyeron sobre la remediación de seguridad previa del broker (**H8.2.1**), garantizando aislamiento absoluto entre clústeres, sanitización en el flujo de telemetría y cumplimiento de los invariantes fundamentales del proyecto:
- **Zero Hallucinated Citations:** Toda afirmación del diagnóstico debe verificarse contra una evidencia existente en SQLite.
- **Strict Human Responsibility:** La IA carece de capacidades de ejecución o modificación (`apply`, `patch`, `exec`, `deploy`, `merge`, `pr`). Toda propuesta exige aprobación explícita de un operador humano.
- **No Auto-Closure:** El verificador posterior de remediación jamás cierra casos de forma autónoma.
- **Strict SSRF Defense:** Validación restrictiva de endpoints de proveedores rechazando loopback, RFC 1918 y servicios de metadatos de nube (`169.254.169.254`).

---

## 2. Historias Implementadas y Criterios de Aceptación

### H8-014 — Perfiles de Proveedores IA y Bóveda Segura de Credenciales
- **Arquitectura Multiproveedor:** Soporte para perfiles OpenAI, Anthropic, Google Gemini y Mock determinístico.
- **Almacenamiento Seguro:** Integración con Electron `safeStorage` (Keychain / DPAPI / Secret Service) respaldado por fallback headless de software AES-256-GCM.
- **Referencias Opacas en SQLite:** La tabla `ai_profiles` almacena exclusivamente `credential_ref` (UUID criptográfico). Cero claves en texto plano en disco ni en logs.
- **Defensa SSRF Estricta:** La función `validateAiEndpoint` exige HTTPS estricto y bloquea direcciones de loopback (`localhost`, `127.0.0.1`, `[::1]`), metadata de nube (`169.254.169.254`), redes privadas RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) y dominios `.internal` / `.local`.

### H8-015 — Diagnóstico Asistido Bajo Demanda y Consentimiento Explícito
- **Acción 'Analizar incidente con IA':** Integrada en el Incident Workbench de Electron Renderer.
- **Vista Previa de Consentimiento:** Muestra al operador el inventario detallado de evidencias, bytes a transmitir, estado de sanitización (H8-008) y conteo de redacciones.
- **Token Efímero de Consentimiento:** Criptográficamente seguro (32 bytes hex), de uso único y vencimiento a los 5 minutos (`consentTtlMs`).
- **Fail-Closed Ante Ausencia de Evidencias:** Si el caso carece de evidencias, el motor marca de inmediato el diagnóstico como `INCONCLUSO` sin llamar al modelo ni consumir tokens.
- **Verificación Antialucinación de Citas:** Cada hecho (`fact`) e hipótesis (`hypothesis`) referencia IDs de evidencia. Si el modelo genera un ID inexistente en la base de datos del incidente, se etiqueta como no verificado (`verified: false`), se penaliza la confianza y, si todas las citas son fantasmas, el estado se degrada a `INCONCLUSO`.

### H8-016 — Propuestas de Remediación Reversibles
- **Estructura Reversible:** Resumen del problema, causa probable, diff YAML sugerido, precondiciones, análisis de riesgos e impacto, pasos de validación y procedimiento de rollback.
- **Invariantes Categóricos en Tiempo de Ejecución:**
  - `requiresHumanApproval: true` (forzado por el motor de diagnóstico).
  - `isApplied: false` (inmutable por la IA).
  - Cero herramientas o permisos para mutar el clúster.

### H8-017 — Verificación Posterior Read-Only
- **Módulo `RemediationVerifier`:** Inspecciona evidencias y observaciones previas y posteriores para dictaminar el resultado: `HEALTHY`, `REGRESSION` o `INCONCLUSIVE`.
- **Identificación del Operador Humano:** Registra obligatoriamente en la auditoría y timeline la identidad del operador humano que aplicó la remediación manual.
- **Prohibición de Cierre Autónomo:** El evaluador puede transicionar a `VALIDACIÓN` si el caso estaba en `APROBACIÓN HUMANA`, pero jamás a `CERRADO`.

### H8-018 — Presupuestos, Límites de Tokens y Cancelación
- **Control Presupuestario:** `AiBudgetTracker` limita el número de solicitudes por incidente (`maxRequestsPerIncident`) y los tokens por consulta (`maxTokensPerRequest`).
- **Estimación de Costos:** Cálculo en USD basado en `estimatedCostPer1kTokens` registrado en el perfil.
- **Cancelación y Descarte Limpio:** Manejo de `AbortController` y `timeoutMs` configurables, descartando respuestas tardías sin mutar el estado.

---

## 3. Matriz de Componentes y Archivos Creados / Modificados

| Componente | Archivo | Responsabilidad |
|---|---|---|
| Tipos de Diagnóstico | `packages/core/src/common/incident/ai-diagnosis-types.ts` | Contratos tipados para hechos, citas, hipótesis, propuestas y preview de consentimiento. |
| Migración SQLite 006 | `packages/core/src/main/incident-storage/migrations/006_ai_diagnoses.sql` | Esquema relacional para auditoría de diagnósticos, tokens y costos. |
| Repositorio Diagnósticos | `packages/core/src/main/ai-diagnostics/ai-diagnosis-repository.ts` | Almacenamiento, consulta histórica y métricas de costo por incidente. |
| Adaptador de Proveedores | `packages/core/src/main/ai-diagnostics/providers/ai-provider-adapter.ts` | Interfaz unificada, mock determinístico para tests y stubs de proveedores externos. |
| Control Presupuestario | `packages/core/src/main/ai-diagnostics/ai-budget-tracker.ts` | Verificación de cuotas de tokens, límites por incidente y estimación de costos. |
| Motor de Diagnóstico | `packages/core/src/main/ai-diagnostics/ai-diagnosis-engine.ts` | Orquestación, validación de consentimiento, verificación de citas y fail-closed. |
| Verificador Posterior | `packages/core/src/main/ai-diagnostics/remediation-verifier.ts` | Evaluación read-only de salud post-remediación e invariante anti-autocierre. |
| Canales y Contratos IPC | `packages/core/src/common/incident/incident-ipc.ts` | Canales seguros `openlens:incident:ai:*`. |
| Validación de Esquemas IPC | `packages/core/src/main/incident-storage/incident-ipc-validator.ts` | Validación en runtime de orígenes de frame y payloads de IA. |
| Registro de Handlers IPC | `packages/core/src/main/incident-storage/setup-incident-ipc.injectable.ts` | Conexión segura de los endpoints de IA en Electron Main. |
| MobX Incident Store | `packages/core/src/features/incident-workbench/renderer/incident-store.ts` | Estado reactivo para perfiles, vista previa de consentimiento y diagnósticos. |
| UI Incident Workbench | `packages/core/src/features/incident-workbench/renderer/incident-workbench-panel.tsx` | Panel de diagnóstico asistido, modal de consentimiento y modal de verificación. |
| Estilos SCSS | `packages/core/src/features/incident-workbench/renderer/incident-workbench-panel.module.scss` | Badges de confianza, diff container, tags de citas y métricas de tokens. |

---

## 4. Resultados de la Suite de Pruebas

Se ejecutó la suite completa de pruebas unitarias y de integración de H8:

```bash
Test Suites: 22 passed, 22 total
Tests:       175 passed, 175 total
Snapshots:   0 total
Time:        22.266 s
```

### Cobertura Específica H8.3:
1. `src/main/ai-diagnostics/__tests__/ai-profile-manager.test.ts` (9 tests PASS)
   - Validación de endpoints HTTPS y bloqueo de loopback, RFC 1918 y AWS/GCP metadata.
   - Rotación y borrado de credenciales opacas en bóveda.
2. `src/main/ai-diagnostics/__tests__/ai-diagnosis-engine.test.ts` (14 tests PASS)
   - Consentimiento humano explícito y expiración de tokens efímeros.
   - Fail-closed inmediato ante cero evidencias.
   - Detección y degradación ante citas alucinadas.
   - Invariantes de remediación (`requiresHumanApproval: true`, `isApplied: false`).
   - Verificación posterior read-only y respeto del no-cierre automático.
   - Límite de presupuesto por caso y cancelación por timeout.
3. `src/main/ai-diagnostics/__tests__/ai-ipc.test.ts` (4 tests PASS)
   - Listado de perfiles, preparación de consentimiento y diagnóstico sobre IPC seguro.
   - Rechazo de WebContents maliciosos o marcos no autorizados.
4. `src/features/incident-workbench/renderer/__tests__/incident-workbench-ai.test.tsx` (4 tests PASS)
   - Renderizado del botón de análisis, apertura del modal de consentimiento con inventario, ejecución y renderizado del reporte estructurado y post-verificación.

---

## 5. Garantía de Invariantes y Seguridad

- **Cero llamadas externas o clústeres reales:** Todos los tests operan contra mocks determinísticos en memoria y el API sintético de Kubernetes.
- **Cero atribución AI en commits:** Estricto cumplimiento de commits convencionales.
- **Ramas y RCs preservados:** H8.1 RC1, RC4 y ramas previas (`develop`, `feature/h8-ai-incident-workbench`, `feature/h8-2-kubernetes-evidence-broker`) intactas.
