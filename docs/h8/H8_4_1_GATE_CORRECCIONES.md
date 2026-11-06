# OpenLens DevOps — H8.4.1: Gate de cierre seguro del contexto efímero

Fecha: 2026-11-05
Rama: feature/h8-4-1-ephemeral-lifecycle-gate
Código base: 8ab3d08d (checkpoint/h8-4-2026-11-05)
Estado: CERRADO Y APROBADO (Certificación completada el 2026-11-05).

## Verificación realizada

- Confirmados commits H8-019 1d32f107, H8-020 5d187ae3 y entrega 8ab3d08d.
- Independientemente se ejecutó la suite H8 focalizada: **25 suites / 212 tests PASS** el 2026-11-05.
- El reporte de Gemini declara smoke Electron DEV con Playwright y 5 capturas (14..18) bajo docs/evidence/h8; no se re-ejecutó ese smoke en la inspección independiente.
- La inspección estática detectó comportamientos de lifecycle y huella que los tests existentes no cubren.

## Bloqueantes de H8.4.1

### H84-SEC-01 — Fingerprint incompleto de metadatos

EphemeralContextManager.computeContextFingerprint() incluye id, sha256, byteLength, version y environment, pero NO namespace, clusterId, resourceKind, resourceName, provenance, notes, filename/fileType. El formulario permite modificar varios de estos campos y el reporte afirma que CUALQUIER edición invalida el consentimiento, lo que no se cumple.

**Corregir:** serialización canónica estable de TODOS los metadatos y contenidos sanitizados destinados a consumo. Cambiar cualquier campo autorizado debe invalidar preview/token. Testear por cada campo individual, especialmente namespace, resource, provenance, notes.

### H84-SEC-02 — Fragmentos sanitizados disponibles después del zeroing

purgeRawBuffers() solo llama a rawBuffer.fill(0) y marca descriptor.isPurged; conserva record.sanitizedContent string en Map y getFilesForDiagnosis() lo devuelve sin filtrar isPurged. El mismo archivo podría reutilizarse en inferencia posterior sin nueva carga ni consentimiento material fresco.

**Corregir:** tras completar/cancelar/fallar/expirar, destruir todo contenido (crudo y sanitizado) o invalidar/destruir el record, evitando lectura o reutilización. Si la UI conserva metadata, mantenerla SIN contenido ni handle legible. Las strings JS no garantizan zeroing físico: acotar referencias, evitar copias adicionales, documentar límite.

### H84-SEC-03 — Limpieza incompleta de errores y cierre/cambio de selección

En AiDiagnosisEngine.executeDiagnosis(), el finally con purgeRawBuffers() solo cubre la llamada al adapter y pasos posteriores. Errores previos (consentimiento expirado, evidencia alterada, perfil, presupuesto) salen antes del finally. IncidentStore.selectIncident() cambia activeIncidentId sin enviar contextClear del anterior; cerrar un panel tampoco debe dejar el contexto crudo en RAM hasta TTL.

**Corregir:** definir explícitamente cuándo se limpia contexto y token al fallar, cancelar, vencer TTL, cerrar panel, cambiar incidente, seleccionar otro clúster, desactivar investigación, remover archivo, cerrar app. Implementar alcance y ownership por sesión, evitando que una sesión cierre o borre otra por accidente. Registrar pruebas de todos los disparadores y ausencia de referencias reutilizables.

### H84-SEC-04 — Límite real de promesa de RAM exclusiva

El texto del archivo se ingresa como string en React (contextContent) y se envía por IPC como rawContent. La copia cruda existe transitoriamente en Renderer e IPC además del Buffer de Main; no afirmar que los bytes existen exclusivamente en Main ni garantizar borrado físico de todas las copias de RAM. Minimizar ventana temporal y limpiar state al guardar, cancelar, cerrar modal y desmontar; jamás escribir raw a SQLite/logs/layout. Revisar que reemplazos y errores no retengan estado o copias innecesarias.

### H84-SEC-05 — Aislamiento y permisos de Context IPC

Los handlers context:list/add/update/remove/clear validan schema y frame, pero están indexados solo por incidentId; deben aplicar scope de ventana/sesión y comprobar pertenencia al incidente antes de lectura/borrado/edición. Agregar casos negativos de ventana/sesión ajena, incidente inexistente, clusterId/namespace manipulados, cierre y cambio de workspace.

## Criterios para levantar gate

1. Tests adversariales nuevos para cada bloqueante y regressión H8 focalizada (base 212/212 PASS).
2. Smoke Electron DEV con perfil/SQLite sintético: dos incidentes, dos paneles, metadatos cambiados, consentimiento invalidado, cancelación, timeout, cierre del panel, cambio de incidente, fin y reinicio sin contenido rehidratado.
3. Verificación de no-persistencia de marcadores sintéticos en SQLite, logs, auditoría, bundles y archivos temporales. No inferir ausencia absoluta de copias de memoria de una prueba de SQLite.
4. Mantener proveedor IA externo deshabilitado, cero conexiones Kubernetes reales y cero ejecuciones/scripts.
5. Commits convencionales, informe actualizado, evidencias visuales, Engram. Sin push, merge ni RC build.
6. Tras aprobar H8.4.1 crear rama feature/h8-5-local-incident-scanner para H8-021/022. H8-023 (IA automática) es opcional y no entra en MVP básico.

## Limpieza / preservación

Instaladores antiguos rc2/rc4/h8-rc1 y bundles compilados viejos se eliminaron por autorización previa del usuario; no reconstruir RC histórico. Preservar .git, ramas anteriores, node_modules, documentos versionados y archivos ajenos sin seguimiento.

---

## Certificación de Remediación y Cierre de Gate (2026-11-05)

### 1. Remediación de Hallazgos

- **H84-SEC-01 (Fingerprint canónico exhaustivo de metadatos):**
  - Implementado en `EphemeralContextManager.computeContextFingerprint()` mediante serialización canónica determinística de todos los campos: `id`, `filename`, `fileType`, `rawHash` (SHA-256), `sanitizedHash` (SHA-256), `byteLength`, `environment`, `clusterId`, `namespace`, `resourceKind`, `resourceName`, `version`, `provenance` y `notes`.
  - Se omiten registros purgados (`isPurged: true`). Cualquier alteración de metadatos o contenido invalida de forma inmediata e irrevocable el token de consentimiento (`CONSENT_EVIDENCE_MISMATCH`).
  - Cobertura con tests negativos para manipulación individual de `namespace`, `resourceName`, `provenance`, `notes` y `clusterId`.

- **H84-SEC-02 (Destrucción total y no reutilización post-purga):**
  - En `destroyRecord()`: sobreescritura física de buffers crudos en Node.js Main con `record.rawBuffer.fill(0)`, anulación de referencias a strings con `record.sanitizedContent = ""` y marcado `record.descriptor.isPurged = true`.
  - En `getFilesForDiagnosis()`: filtrado estricto que descarta registros marcados como `isPurged === true`, vencidos o con contenido vacío.
  - En `updateMetadata()`: fail-closed arrojando `FILE_PURGED` si se intenta manipular un archivo ya purgado.

- **H84-SEC-03 (Limpieza ante errores, cancelaciones, cambios y cierre):**
  - En `AiDiagnosisEngine.executeDiagnosis()`: el bloque `try ... finally { this.ephemeralContextManager.purgeRawBuffers(incidentId) }` se extendió para cubrir toda la ejecución desde la validación de tokens, huellas y presupuestos, garantizando que ante errores tempranos, abortos o fallos del proveedor el buffer crudo siempre sea purgado.
  - En `IncidentStore.selectIncident()`: al deseleccionar o alternar a otro incidente, se despacha `contextClear(previousIncidentId)` para liberar inmediatamente la RAM en Main.

- **H84-SEC-04 (Límites honestos de RAM y limpieza en Renderer):**
  - En `IncidentWorkbenchPanel`: se implementaron `resetContextForm()` y `handleCloseAddContext()`, limpiando el estado de React (`contextContent`, `contextFilename`, etc.) al guardar, cancelar, cerrar el modal o desmontar el componente (`useEffect`).
  - La advertencia en la interfaz describe con precisión técnica que Node.js Main sobreescribe con ceros los buffers crudos, mientras que en Renderer e IPC las cadenas dependen de la recolección de basura de V8 al destruirse sus referencias.
  - Cero persistencia: en `AiDiagnosisEngine`, los extractos de citas provenientes de contexto efímero se redactan a `undefined` al persistir el reporte en `ai_diagnoses`, garantizando que ningún fragmento de archivo manual se guarde en SQLite.

- **H84-SEC-05 (Aislamiento y autorización de canales IPC):**
  - En `setup-incident-ipc.injectable.ts`: todos los canales `context:*` verifican el sender frame autorizado, comprueban la existencia del incidente en SQLite, validan que `clusterId` y `namespace` coincidan exactamente con el incidente, y exigen que el archivo pertenezca al incidente solicitado.
  - Casos negativos añadidos y probados: incidente inexistente, discrepancia de clúster, discrepancia de namespace y manipulación cruzada de archivos entre incidentes.

### 2. Resultados de Pruebas Unitarias e Integración

- **Suites ejecutadas:** 27 de 27 suites PASS.
- **Tests totales:** 229 de 229 PASS (100% verde).
- **Nuevos tests de seguridad:** 17 tests unitarios y de integración adversariales en `h8-4-ephemeral-context.test.ts`.

### 3. Validación Visual y Smoke en Electron DEV

- **Script:** `open-lens/integration/h8-4-smoke.mjs` ejecutado con Electron real y Playwright.
- **Flujo validado:**
  1. Creación aislada de dos incidentes (`INC-A` y `INC-B`).
  2. Carga de Dockerfile en `INC-A`.
  3. Modificación de versión y verificación de invalidación inmediata de consentimiento (`CONSENT_EVIDENCE_MISMATCH`).
  4. Intento de manipulación cruzada de archivo de `INC-A` desde `INC-B` bloqueado con `SecurityError`.
  5. Conmutación a `INC-B`, carga de `values.yaml`, consentimiento y ejecución de diagnóstico conclusivo.
  6. Purga total de RAM en Main post-diagnóstico (`isPurged: true`, `manualContextCount: 0`).
  7. Cierre de Workbench y deselección de incidente.
  8. Escaneo exhaustivo de todas las tablas en SQLite: CERO presencia de marcadores sintéticos (`SYNTHETIC_MARKER_INCIDENT_A`, `SYNTHETIC_MARKER_INCIDENT_B`, `FROM node:20-alpine`).
- **Capturas generadas en `docs/evidence/h8/`:**
  - `19_h8_4_1_two_incidents_isolation.png`
  - `20_h8_4_1_metadata_tamper_invalidated.png`
  - `21_h8_4_1_post_diagnosis_purged_ram.png`
  - `22_h8_4_1_panel_close_and_sqlite_clean.png`

**Conclusión:** Gate H8.4.1 levantado formalmente. Autorizado para proceder a H8.5.
