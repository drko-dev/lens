# OpenLens DevOps — H8.3.1 Reporte del Gate de Integración

Fecha: 2026-11-05  
Rama: `feature/h8-3-1-integration-gate`  
Baseline: `bc73178d`  
Estado: **APROBADO Y SUPERADO** (Gate de Integración completado exitosamente con verificación en Electron Real).

---

## 1. Resumen Ejecutivo

Este documento certifica el cumplimiento riguroso de todos los criterios de aceptación de **H8.3.1 (Gate de Integración previo a H8.4)** en el repositorio OpenLens.

H8.3.1 resuelve de raíz las brechas arquitectónicas identificadas tras el desarrollo modular de H8.3:
1. **Cableado Real vía DI en Electron Main:** Todos los componentes de diagnóstico IA (`AiProfileManager`, `SecureCredentialVault`, `AiDiagnosisEngine`, `AiDiagnosisRepository`, `AiBudgetTracker`, `RemediationVerifier`) están registrados en el contenedor de inversión de dependencias de Lens e inyectados automáticamente en el arranque de la aplicación a través de `setupIncidentIpcInjectable`.
2. **Bóveda de Credenciales Persistente y Cifrada:** Implementación de almacenamiento físico respaldado por SQLite (`ai_vault_credentials`, Migración 007) y `safeStorage` del sistema operativo (Keychain / Secret Service / DPAPI). Las credenciales se conservan cifradas tras el reinicio de Electron sin requerir llaves en texto plano en disco ni fallbacks volátiles silenciosos en producción.
3. **Bloqueo Honesto de Proveedores Externos:** En este hito, únicamente el proveedor `mock` es ejecutable y opera 100% de manera local y offline. Los proveedores externos (OpenAI, Anthropic, Gemini) están formalmente deshabilitados en el motor y en la interfaz de usuario con advertencias transparentes (`[Deshabilitado hasta H8.4]`), con cero tráfico a APIs de pago o redes externas.
4. **Consentimiento Inmutable Vinculado a Evidencias (Anti-Tamper):** El token efímero de consentimiento inmoviliza la huella SHA-256 del inventario exacto de evidencias sanitizadas, los identificadores, bytes y parámetros del perfil. Cualquier alteración, agregado o remoción posterior de evidencias invalida el token de inmediato con `CONSENT_EVIDENCE_MISMATCH`.
5. **Verificación Estricta de Citas:** El motor valida que los fragmentos citados por el modelo existan literalmente dentro del texto sanitizado y pertenezcan al recurso indicado; citas no fundamentadas son marcadas como `verified: false` y degradan el caso a `INCONCLUSO`.
6. **Smoke Test en Electron Real DEV:** Ejecución exitosa de un flujo de extremo a extremo automatizado con Playwright sobre Electron Real con perfil y base de datos sintéticos aislados.

---

## 2. Historias y Criterios Técnicos Implementados

### 2.1 Wiring DI en Electron Main (`setup-incident-ipc.injectable.ts`)
- Se crearon los injectables para cada servicio en `packages/core/src/main/ai-diagnostics/`:
  - `secure-credential-vault.injectable.ts`
  - `ai-diagnosis-repository.injectable.ts`
  - `ai-budget-tracker.injectable.ts`
  - `ai-profile-manager.injectable.ts`
  - `ai-diagnosis-engine.injectable.ts`
  - `remediation-verifier.injectable.ts`
- Se integraron en `setupIncidentIpcInjectable.instantiate(di)` asociando los canales IPC:
  - `openlens:incident:ai:list-profiles`
  - `openlens:incident:ai:create-profile`
  - `openlens:incident:ai:update-profile`
  - `openlens:incident:ai:delete-profile`
  - `openlens:incident:ai:prepare-consent`
  - `openlens:incident:ai:execute-diagnosis`
  - `openlens:incident:ai:list-diagnoses`
  - `openlens:incident:ai:get-latest-diagnosis`
  - `openlens:incident:ai:verify-remediation`
- Validación de esquemas y sender de frame estricta en cada handler vía `incident-ipc-validator.ts`.

### 2.2 Bóveda Persistente y Migración 007 (`007_ai_vault_credentials.sql`)
- **Migración 007:** Crea la tabla relacional `ai_vault_credentials (credential_ref TEXT PRIMARY KEY, ciphertext BLOB NOT NULL, created_at TEXT, updated_at TEXT)`.
- **Clase `SqliteCredentialStorage`:** Gestiona la persistencia física de blobs cifrados en SQLite vinculados al UUID opaco del perfil.
- **Fail-Closed en Producción:** `SecureCredentialVault` arroja una excepción fatal al inicializar si el cifrado del sistema operativo (`safeStorage`) no está disponible en producción, impidiendo fallbacks inseguros a texto plano.

### 2.3 Proveedores Externos Honestos y Gating Estricto
- En `AiDiagnosisEngine`: Rechaza con `EXTERNAL_PROVIDER_DISABLED` cualquier intento de invocar o preparar consentimiento para un proveedor diferente a `mock` (salvo que exista un override de test explícito).
- En `incident-workbench-panel.tsx`: La lista desplegable de perfiles marca las opciones externas como `[Deshabilitado hasta H8.4]` y deshabilita su selección interactiva.

### 2.4 Consentimiento Criptográficamente Sellado
- Función `computeEvidenceFingerprint(evidences)`: Calcula un hash SHA-256 determinístico sobre los identificadores ordenados, hashes de sanitización, bytes y metadatos de recursos (`resourceKind`, `resourceName`, `resourceVersion`).
- El token efímero vincula este hash junto a la cuota, modelo, endpoint y TTL de 5 minutos.
- En `executeDiagnosis`: Re-calcula la huella del estado actual de evidencias del caso. Si el hash difiere, rechaza la ejecución con `CONSENT_EVIDENCE_MISMATCH`.

### 2.5 Verificación Estricta de Citas y Grounding
- Valida la existencia de la evidencia referenciada en la base de datos del caso.
- Valida que `resourceKind` y `resourceName` coincidan con la evidencia registrada.
- Valida que `excerpt` exista como subsecuencia exacta normalizada (espacios y mayúsculas/minúsculas) dentro de `contentSnippet`.
- Si una cita no cumple estos criterios, se marca `verified: false`. Si todas las citas fallan, el diagnóstico concluye como `INCONCLUSO`.

---

## 3. Resultados de Pruebas Automatizadas

### 3.1 Pruebas Unitarias e Integradas Jest
Se ejecutaron las suites completas del ecosistema de incidentes, pasando al 100%:

| Área | Suites | Tests | Resultado |
|---|---|---|---|
| AI Diagnostics & Gate H8.3.1 | 5 suites | 43 tests | **PASS** |
| Incident Storage & Security IPC | 8 suites | 62 tests | **PASS** |
| Incident Workbench UI & MobX | 3 suites | 25 tests | **PASS** |
| Incident Broker PEP & MCP Bridge | 7 suites | 54 tests | **PASS** |
| **TOTAL CONSOLIDADO** | **23 suites** | **184 tests** | **100% PASS** |

### 3.2 Smoke Test en Electron Real DEV (`open-lens/integration/h8-3-1-smoke.mjs`)
El script de smoke se ejecutó de forma autónoma con Playwright controlando una instancia real de Electron:

```
==> [H8.3.1 Smoke] Compilando bundle de Renderer con esbuild...
==> [H8.3.1 Smoke] Bundle de Renderer generado exitosamente.
==> [H8.3.1 Smoke] Lanzando Electron con Playwright...
==> [H8.3.1 Smoke] Ventana abierta. Esperando renderizado de incident-list-view...
==> [H8.3.1 Smoke] Captura 1 guardada: 09_h8_3_1_initial_ui.png
==> [H8.3.1 Smoke] Creando perfil mock local sobre IPC...
==> [H8.3.1 Smoke] Perfil creado con ID: profile-513457bd-a369-4e79-b04f-55bf2577d6ce, ref: cred-b5e51b57-ec85-4ff4-a34f-36404ba5e2fa
==> [H8.3.1 Smoke] Verificado: Clave cifrada en tabla SQLite ai_vault_credentials sin fugas en texto plano.
==> [H8.3.1 Smoke] Creando caso sintético OOMKilled...
==> [H8.3.1 Smoke] Abriendo Incident Workbench...
==> [H8.3.1 Smoke] Verificado: Evidencia sanitizada correctamente.
==> [H8.3.1 Smoke] Captura 2 guardada: 10_h8_3_1_workbench_evidence.png
==> [H8.3.1 Smoke] Cambiando a pestaña 'Diagnóstico e Hipótesis' y solicitando IA...
==> [H8.3.1 Smoke] Verificado: Modal de consentimiento refleja inventario inmutable y sanitizado.
==> [H8.3.1 Smoke] Captura 3 guardada: 11_h8_3_1_consent_modal.png
==> [H8.3.1 Smoke] Confirmando autorización de diagnóstico por clic...
==> [H8.3.1 Smoke] Diagnóstico completado exitosamente: Status CONCLUSIVE reflejado en UI.
==> [H8.3.1 Smoke] Cita estricta verificada: verifiedEVD-62C84C9D (Verificada)
==> [H8.3.1 Smoke] Propuesta de remediación reversible presente con botón de verificación.
==> [H8.3.1 Smoke] Captura 4 guardada: 12_h8_3_1_diagnosis_conclusive.png
==> [H8.3.1 Smoke] Verificado: ai_diagnoses persistido con status CONCLUSIVE y remediación segura.
==> [H8.3.1 Smoke] Verificado: Evento de auditoría registrado en incident_timeline por autor 'ai'.
==> [H8.3.1 Smoke] Ejecutando pruebas de invariantes de seguridad negativas...
==> [H8.3.1 Smoke] Invariante 1 superada: Proveedor externo 'anthropic' rechazado inmediatamente.
==> [H8.3.1 Smoke] Invariante 2 superada: Consentimiento invalidado (CONSENT_EVIDENCE_MISMATCH) tras alteración.
==> [H8.3.1 Smoke] Verificando persistencia y recuperación de bóveda tras reinicio simulado...
==> [H8.3.1 Smoke] Invariante 3 superada: Perfiles y referencias conservados íntegramente.
==> [H8.3.1 Smoke] Captura final 5 guardada: 13_h8_3_1_smoke_complete.png
==> [H8.3.1 Smoke] Smoke test completado con ÉXITO ABSOLUTO (Criterios de H8.3.1 superados).
==> [H8.3.1 Smoke] Cerrando aplicación Electron...
```

---

## 4. Evidencias Visuales Generadas

Las capturas fueron generadas y almacenadas en `docs/evidence/h8/`:
1. `09_h8_3_1_initial_ui.png`: Centro de Incidentes inicial renderizado en Electron.
2. `10_h8_3_1_workbench_evidence.png`: Incident Workbench con evidencias sanitizadas (`[REDACTED_TOKEN]`).
3. `11_h8_3_1_consent_modal.png`: Modal de consentimiento con inventario exacto y token efímero intransferible.
4. `12_h8_3_1_diagnosis_conclusive.png`: Diagnóstico `CONCLUSIVE`, citas verificadas, barra de confianza y propuesta de remediación reversible.
5. `13_h8_3_1_smoke_complete.png`: Estado final de la interfaz tras superar todas las verificaciones.

---

## 5. Invariantes de Seguridad Verificados

- **Cero Tráfico Externo:** 0 llamadas a endpoints de internet, 0 credenciales reales expuestas.
- **Cero Mutaciones en Clúster:** 0 llamadas destructivas o de escritura a Kubernetes.
- **Fail-Closed de Bóveda:** Imposible arrancar en producción con llaves inseguras o almacenamiento plano.
- **Inmutabilidad del Consentimiento:** Tokens bloqueados frente a modificaciones del caso (TOCTOU protegido).
- **Aislamiento de Entorno:** Datos de prueba en directorio temporal efímero aislado, eliminado al cerrar.
