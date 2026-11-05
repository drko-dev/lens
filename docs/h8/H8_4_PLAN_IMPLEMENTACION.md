# OpenLens DevOps — H8.4: Contexto manual y efímero

**Fecha:** 2026-11-05
**Rama:** feature/h8-4-ephemeral-context
**Origen:** 1b493199 (H8.3.1)
**Checkpoint local:** checkpoint/h8-3-1-2026-11-05
**Historias:** H8-019 y H8-020
**Estado:** PLANIFICADO / IMPLEMENTACIÓN PENDIENTE

## 0. Precondiciones y límites

- Leer GEMINI.md, docs/H8_AI_INCIDENTES_HISTORIAS_2026-11-04.md, docs/h8/H8_3_1_GATE_REPORTE.md y las clases actuales de EvidenceRepository, EvidenceSanitizer, AiDiagnosisEngine e IncidentBrokerService.
- H8.3.1 implementado: validación independiente focalizada el 2026-11-05, 24 suites y 196/196 pruebas PASS. El smoke Electron DEV fue reportado por Gemini y no se repitió en esta revisión.
- Conservar ramas H8.1/H8.2/H8.3, checkpoint H8.3.1 y documentos versionados.
- Instaladores y bundles antiguos se borraron voluntariamente en la limpieza anterior. No restaurarlos ni generar un nuevo RC sin autorización.
- Proveedores externos OpenAI/Anthropic/Gemini permanecen DESHABILITADOS. H8.4 no autoriza conexiones ni datos reales hacia APIs pagas.
- No realizar acceso Kubernetes real, modificaciones GitOps, Helm, docker build, ejecuciones de scripts, shell, ni escrituras en clústeres.
- No push ni merge; commits convencionales por historia.

## H8-019 — Adjuntar contexto multiarchivo

### Experiencia y alcance

- Incorporar en Incident Workbench la acción Agregar contexto, con selección de varios archivos, listado, eliminación individual y advertencias visibles.
- Admitir tipos de texto explícitos y justificados (Dockerfile, values.yaml, YAML/JSON de configuración, manifiestos no secretos, archivos de texto; ajustar a allowlist real de extensiones y MIME).
- Bloquear por defecto archivos Secret, credenciales, binarios, symlinks, rutas especiales y tipos no permitidos. No permitir acceso arbitrario a rutas desde Renderer.
- Registrar metadatos declarados por el operador para cada archivo: tipo, entorno, clusterId/namespace, recurso/versión y procedencia. Son DECLARACIONES, no pruebas de correspondencia con despliegue; advertir si no hay contraste read-only autorizado.
- Permitir corregir metadatos y reemplazar contenido solo mediante nueva carga explícita, nunca reusar una versión por deducción.
- Mostrar antes de cada análisis el inventario exacto: nombre seguro, tamaño, SHA256, clasificación, hallazgos redactados, bytes estimados, advertencias y límites de contexto.
- Consentimiento expreso ligado al conjunto exacto de adjuntos y evidencias del caso; cambio, agregado o remoción de un archivo invalida la autorización y exige nuevo consentimiento.

### Controles de seguridad

- No ejecutar ni interpretar instrucciones de Dockerfile RUN, Helm, YAML, templating, scripts o archivos cargados: solo análisis estático como datos no confiables.
- Sanitizar y clasificar ANTES de cualquier persistencia o preparación de envío; mantener evidencias Kubernetes y archivos manuales identificables por separado.
- No incluir raw content en logs, excepciones, timeline, snapshots de MobX, layouts, crash reports ni auditoría.
- Limitar cantidad de archivos, bytes por archivo, bytes agregados, tiempo y memoria con topes explícitos documentados; verificar límites por bytes UTF-8, no solo longitud JS.
- No utilizar sistema de archivos como almacenamiento persistente del contenido. Elegir Buffer efímero en Electron Main con handles acotados y vinculados a incidentId/sesión, nunca una referencia de path confiada al renderer.
- IPC validado en Main: verificar senderFrame, schema, tamaño, ownership de handles, scope y caducidad; no aceptar rutas arbitrarias del usuario como privilegio.

## H8-020 — Ciclo de vida y eliminación efímera

- El contenido crudo vive solo en memoria y se destruye al terminar el análisis, cancelar, fallar, vencer TTL, cerrar panel, cambiar incidencia/clúster, revocar sesión y cerrar la aplicación.
- Si una necesidad técnica obligara a temporales, justificarlo y utilizar permisos mínimos, nombres impredecibles, limpieza garantizada y barrido al reiniciar; por defecto, preferir NO crear temporales.
- Después de un crash, ninguna copia persistida del contenido debe permanecer por decisión de diseño; probar disco y SQLite con marcadores sintéticos. Reconocer que JS/Electron no puede asegurar sobreescritura física de todas las copias de memoria.
- SQLite solo debe conservar metadatos mínimos no sensibles: nombre saneado, tipo, SHA256, fecha, versión declarada y hallazgos estrictamente sanitizados; no cuerpos, fragmentos crudos, credenciales ni rutas privadas.
- Invalidar tokens/consentimientos y handles ante cualquier versión nueva, limpieza o cambio de sesión.
- Asegurar que la rotación, eliminación del incidente y retención H8.1 no accedan a contenido temporal ya purgado.
- Indicar que la eliminación local NO elimina retenciones del proveedor externo si alguna vez se habilita IA remota.

## Integración sin regresiones

- Reutilizar diseño Midnight Graphite, Incident Workbench, IPC seguro, repositorios, sanitización, presupuesto y consentimiento H8.3.1.
- No construir un segundo servidor MCP ni una segunda máquina de estados.
- El flujo mock debe poder recibir contexto manual sanitizado y mostrar qué evidencia de usuario fue utilizada, con citas y procedencia. No aceptar archivos como instrucciones.
- No modificar el mecanismo de autenticación humana ni la frontera de permisos Kubernetes salvo corrección de seguridad justificada.

## Validaciones obligatorias

1. Alta multiarchivo; reemplazo; corrección de metadatos; remoción individual y masiva.
2. Secret/configuración sensible y payloads con tokens, rutas maliciosas, nul bytes, encoding extraño, archivos excesivos, binarios y prompt injection.
3. Consentimiento anulado al editar, remover o reemplazar archivos; rechazo de handles ajenos, expirados o cross-incident.
4. Recolección de basura semántica: conclusión, cancelación, timeout, error, cierre de panel, cambio de incidente, sesión y app.
5. Comprobar con marcadores sintéticos que SQLite, auditoría, logs, layouts y filesystem temporal no guardan contenido bruto.
6. Crash/reinicio: no reaparece contenido; solo metadatos permitidos.
7. Límite de memoria, concurrencia, tamaño, conteo de archivos y bytes enviados; sin duplicación de presupuesto.
8. Diagnóstico mock en Electron DEV real contra perfil SQLite aislado; sin tráfico externo.
9. Regresión focalizada H8.1-H8.3 y Global Docking, evitando builds RC y tests masivos innecesarios.

## Entrega / gate

- Commits convencionales separados H8-019 y H8-020, más tests y docs.
- Evidencias capturadas en Electron y reporte docs/h8/H8_4_ENTREGA_REPORTE.md.
- Engram actualizado con decisiones, límites de seguridad y validación.
- Indicar con precisión qué se comprobó automáticamente y qué requiere prueba externa.
- Gate aprobado únicamente con lectura multiarchivo segura, consentimiento inmutable, ciclo de vida verificado, cero persistencia de cuerpos y cero ejecución de archivos.
- No iniciar H8.5, push, merge ni empaquetado sin autorización posterior.
