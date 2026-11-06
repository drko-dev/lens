# OpenLens DevOps — H8.6 MVP RC1 / revisión independiente posterior

**Fecha:** 2026-11-06
**Commit de RC:** 24ce1d35
**Rama congelada:** feature/h8-6-security-mvp-rc
**Checkpoint:** checkpoint/h8-6-mvp-rc1-2026-11-06
**Rama de revisión:** feature/h8-6-1-post-rc-hardening
**Dictamen:** PASS para QA INTERNO / DEMO SINTÉTICA; NO aprobado para clústeres reales ni distribución pública.

## Evidencia comprobada directamente

- Artefactos presentes en open-lens/dist/h8-mvp-rc1/.
- SHA256 DMG: 862b227b8bdc48afd2a16e6f7cfeac9cd77d5c1b04962aa57356bf5e2cff5678 (recalculado, coincidente).
- SHA256 ZIP: 55aa127382992840e4baad01b10a10e501330a58a4403e1b0ee43ebd51b9cb8c (recalculado, coincidente).
- codesign --verify --deep --strict de OpenLens DevOps.app: salida exitosa.
- hdiutil verify del DMG: checksum VALID.
- Jest focalizado por rutas incident, ai-diagnostics, incident-scanner: **33 suites, 284 tests PASS** (conjunto más amplio que el reportado de 31/267).
- La documentación de Gemini informa 7 migraciones y 7 pasos de QA sobre .app empaquetada con perfil aislado, pero este QA de Electron no fue reejecutado en la revisión independiente.

## Limitaciones del alcance

- Modo scanner synthetic_feed, isSyntheticDemo=true, 0 watchers K8s reales. Un usuario debe suministrar fixtures/snapshots; no es un monitor Kubernetes activo 24/7.
- No hay autorización ni identidad de acceso productivo K8s; cero operaciones reales requeridas para QA.
- Proveedores de IA externos deshabilitados; mock local únicamente.
- Firma ad-hoc. No certificado Developer ID ni notarización; instalar fuera de QA interno requerirá acciones adicionales.
- El reporte de RC dice que artefactos de rc4/h8-rc1 anteriores permanecen en carpetas. **Corrección:** esas carpetas de builds fueron eliminadas explícitamente a petición del usuario en una limpieza anterior; solo persisten ramas, commits, documentación y checksums históricos. Actualmente solo h8-mvp-rc1/ existe dentro de open-lens/dist/.

## Hallazgos residuales verificables — NO alterar el binario RC1

### RC-RES-01 — Fallback por recurso debilita el aislamiento de señal y UID

IncidentDeduplicator.ingestSignal() utiliza findOpenIncidentByFingerprint() pero luego, si no halla coincidencia, hace fallback con findOpenIncidentByResource(clusterId, namespace, resourceKind, resourceName), sin cotejar tipo de señal o UID. Dos anomalías distintas sobre el mismo pod, o un pod recreado con el mismo nombre, pueden terminar asociadas al mismo incidente aunque los fingerprints SHA-256 sean distintos.

**Acción:** eliminar fallback ambiguo, o restringirlo a casos donde la huella persista y se pueda probar equivalencia semántica. Persistir identificador de huella/UID en columnas indexadas o entidad propia, con transacción e índices adecuados, en lugar de buscar JSON del timeline con LIKE. Pruebas de dos señales mismo recurso, UID nuevo, reinicio, simultaneidad y concurrencia SQLite.

### RC-RES-02 — Actor de alerta todavía procede del Renderer

IncidentDeduplicator.handleAlertAction() utiliza payload.operatorName y solo lo limpia mediante EvidenceSanitizer; luego registra authorType human e id fijo authenticated-operator. Sanitizar un nombre no demuestra la identidad de la persona. El requisito H8.1 de control de cierre está protegido (dismiss solo DETECTADO -> NO CONFIRMADO), pero la atribución de autor en timeline puede ser falseada.

**Acción:** eliminar operatorName del payload confiable, derivar principal/sesión desde un mecanismo de confianza de Electron Main cuando exista; hasta entonces etiquetar el evento como user-action/unknown-local-operator sin aseverar autenticación. Probar suplantación y sesión ajena.

### RC-RES-03 — Las llamadas del Renderer y las señales sintéticas

scannerProcessSnapshot desde Renderer es entrada de DEMO, no telemetría genuina. Aunque hay cotas y validación de esquema, debe conservar etiqueta/procedencia sintética en incidentes y auditoría, evitar apariencia de evento real, y aplicar controles por ventana/sesión/incidentId que se revalidarán antes de Kubernetes real.

**Acción:** pruebas cruzadas para dos ventanas válidas, namespaces diferentes y cierre/revocación. Antes de conectar cluster real, Main deberá consumir broker H8.2 autorizado sin confiar en observaciones arbitrarias del Renderer.

## Regla de avance

1. Congelar RC1 en checkpoint local; no borrar el binario más reciente hasta disponer de candidato nuevo aceptado.
2. Corregir hallazgos en feature/h8-6-1-post-rc-hardening, sin reescribir historial ni retocar la rama RC.
3. Ejecutar tests negativos focalizados y smoke Electron DEMO si cambian UI/IPC.
4. Si se genera un RC2 futuro, empaquetar en carpeta nueva y revisar espacio antes de construir. Tras aceptar RC2, el usuario autoriza limpiar RC1 compilado obsoleto.
5. No push, merge, servicios externos, clústeres reales ni distribución sin autorización explícita.
6. El último paso será decisión humana de integrar a develop después de las correcciones o mantener como MVP demo.

**No crear otra fase funcional de H8 antes de decidir qué compromisos de producto se necesitan.**
