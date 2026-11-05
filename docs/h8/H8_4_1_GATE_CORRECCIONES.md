# OpenLens DevOps — H8.4.1: Gate de cierre seguro del contexto efímero

Fecha: 2026-11-05
Rama: feature/h8-4-1-ephemeral-lifecycle-gate
Código base: 8ab3d08d (checkpoint/h8-4-2026-11-05)
Estado: pendiente. No comenzar H8.5 antes de remediar estas observaciones.

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
