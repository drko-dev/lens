# OpenLens DevOps — H8.6: Auditoría adversarial, resiliencia y RC MVP

Fecha: 2026-11-05
Rama: feature/h8-6-security-mvp-rc
Baseline: 29298bdc (checkpoint/h8-5-2026-11-05)
Historias: H8-024, H8-025, H8-026
Estado: AUTORIZADO PARA PLAN/REMEDIACIÓN/PRUEBAS; empaquetado condicionado a aprobar seguridad. No declarar release aprobado antes de validar el build real.

## Baseline y verificación

- H8-021/022 implementados en commits 7fca8dd3 y 43caa513, reporte 29298bdc. Gemini informó 31 suites / 263 tests PASS y smoke Electron DEV; dicho smoke no se re-ejecutó independientemente.
- Verificación independiente 2026-11-05: suite focalizada H8 incluyendo scanner: 29 suites / 259 tests PASS (conjunto distinto del de Gemini), sin cambios fuente ni red real.
- Los instaladores y bundles históricos fueron eliminados voluntariamente a petición del usuario; persisten los commits e informes/checksums en Git. Solo un worktree registrado.
- No hay autorización para escanear clústeres reales ni contactar proveedores IA externos.

## Fase 0 — Correcciones bloqueantes detectadas en revisión H8.5

### H86-GATE-01 — Scanner sin fuente periódica real ni watchers reales

LocalIncidentScanner.start() cambia isEnabled y activeWatchersCount a 1, pero no crea suscripción/watcher/timer ni programa consultas. processSnapshot() solo recibe un snapshot IPC. En UI se activa con clusterId minikube-dev hardcodeado.

- No mostrar "ACTIVO"/"1 watcher"/supervisión del clúster cuando no existe fuente realmente conectada.
- Separar modo DEMO/SINTÉTICO de supervisión real. En MVP aislado usar productor sintético inyectado/cancelable o etiquetar como procesamiento manual de fixtures. No falsear métricas.
- Implementar scheduler funcional solo para origen sintético si se justifica. Conector Kubernetes real requiere autorización futura y broker read-only de doble identidad.
- Selección de scope real desde estado de clústeres OpenLens solo si el diseño lo permite; modo demo exige scope etiquetado sintético y no hardcode minikube-dev como cluster productivo.

### H86-GATE-02 — Renderer no es fuente confiable de observaciones

scannerProcessSnapshot recibe del Renderer el snapshot y lo transforma en incidente "detectado automáticamente" sin evidencia de origen técnico en Main.

- Diferenciar y validar procedencia sintética frente a observaciones fiables. Un Renderer comprometido no puede atribuir su payload a un clúster real.
- A futuro Main solo obtendrá señales reales mediante broker H8.2 con usuario y agente autorizados, scope y cuotas; nunca confiar en objetos declarados por Renderer.
- Rechazar clúster ajeno, namespace ajeno, payload grande/anidado, prototipos maliciosos, tormentas y resultados tardíos.
- Tests adversariales sobre WebContents, identidad y procedencia, con cero contaminación de incidentes legítimos.

### H86-GATE-03 — Dedupe y atomicidad insuficientes

IncidentDeduplicator busca caso abierto por clusterId, namespace, workloadKind, workloadName pero no por signalType/fingerprint. Fingerprint de reglas omite resourceUid aunque esté disponible. createIncident() y addTimelineEntry() son operaciones separadas; dedupe no tiene constraint/transaction visible que prevenga carreras. cooldown se recibe pero no limita realmente el volumen del timeline.

- Correlacionar por fingerprint persistido + UID real del objeto donde aplique; documentar handling de recreación y colisiones.
- Transacciones y unique index o UPSERT atómico, retries y tests concurrentes/procesos reiniciados; no dejar incidentes sin fingerprint.
- Cooldown real para entradas repetidas y conteos consolidados, sin ocultar evolución importante.
- Tests de dos señales distintas mismo pod, mismo nombre con UID nuevo, carreras, reinicio y ráfaga.

### H86-GATE-04 — Dismiss puede suplantar un actor humano y cerrar incidente

IncidentDeduplicator.handleAlertAction() confía en operatorName del Renderer y usa actor type human; permite transición a CERRADO para incidentes que no estén DETECTADO, directamente en IncidentRepository, sin pasarela privilegiada H8.1.

- Para triage validar solo transiciones no privilegiadas y justificación con identidad derivada en Main, no del payload.
- CERRADO y otras transiciones privilegiadas SIEMPRE mediante pasarela aislada H8.1; ninguna acción scannerAlertAction puede saltearla.
- Tests con nombres falsificados, incidentes ajenos y estados invalidos, carreras con cierre/revocación.

### H86-GATE-05 — Sanitización antes de persistir

Deduplicación persiste rawMetadata y mensajes K8s derivados del snapshot sin sanitización explícita; pueden contener password, token, Bearer, URL con credenciales, Secret y prompt injection.

- Evidencia/alerta/texto de entrada siempre datos NO confiables.
- Sanitizar titulo, descripción, timeline, metadata, errores y auditoría ANTES de SQLite o UI, mediante EvidenceSanitizer y schemas de metadatos no sensibles.
- Tests con logs/advertencias JWT/Bearer/password/manifests y escaneo de SQLite y auditoría con marcadores sintéticos.

### H86-GATE-06 — Autorizar por ventana/sesión real

H8.4.1 coteja incidente, clusterId/namespace y fileId, pero no demuestra vinculación completa de WebContents/sesión/operador a cada caso. Scanner hereda riesgo.

- Tests de otro WebContents interno, frame ajeno, cluster switch, dos incidentes, revocación y TOCTOU.
- Identidad/scope deben derivarse desde Main; nunca equiparar conocer un incidentId con permiso.
- Incluir ataques a MCP, consentimientos, token/vault, output del broker y escritura Kubernetes; fail-closed.

## H8-024 — Seguridad adversarial

- Matriz de pruebas negativas: Secret, tokens, proxy, impersonación, escritura, logs/manifiestos maliciosos, URL SSRF, IDs ajenos, cross-cluster/namespace, revocación, herramienta prohibida, citas y archivos temporales.
- Ejecutar API K8s sintética y proveedor mock; 0 llamadas a Kubernetes real, 0 escrituras, 0 gasto en proveedores remotos.
- Hallazgos críticos/altos bloquean el RC hasta corregir, retestear y documentar riesgo residual.

## H8-025 — Resiliencia y límites

- Probar cerrar/reabrir, corrupción SQLite, caída de API mock, red perdida, cancelación, respuestas tardías, cambio de scope, permisos revocados, cuotas agotadas.
- Medir listeners/timers/streams reales, memoria, CPU y latencia; no reportar métricas inventadas.
- Controlar rate limit/backoff, cleanup y carreras. Preservar UX y sesiones H7.
- Jest focalizado H8 y docking acotado; evitar suites gigantes de H7.

## H8-026 — RC MVP condicionado

**No empaquetar ANTES de aprobar H8-024 y H8-025.**
1. Preflight: Git HEAD, Node requerido, módulos nativos y estimación de espacio libre (host ~13 GiB). No borrar materiales ajenos para hacer lugar.
2. Crear NUEVOS artefactos en open-lens/dist/h8-mvp-rc1/, sin reconstruir RC2/RC4/H8.1 RC1 antiguos.
3. ARM64: Electron empaquetado sin dev server, better-sqlite3, .node, CSP/modal/preload, SQLite, firma ad-hoc verificada. No reclamar notarización sin credenciales.
4. QA sobre .app real con perfil y DB sintéticos: Centro, scanner OFF, modo DEMO etiquetado, señales, dedup, snooze/dismiss, stop, contexto efímero, consentimiento, diagnóstico mock, restart/rollback.
5. 0 K8s real, 0 IA externa. Si no existe conector autorizado, el RC es MVP DEMO, no scanner productivo.
6. SHA-256 DMG/ZIP, codesign, capturas, pruebas, reporte docs/h8/H8_6_MVP_RC1_RELEASE_REPORT.md y dictamen PASS/PARTIAL/BLOCKED.
7. Sin push/merge, publicación, distribución ni conexión a producción.

## Entrega y control de cambios

- Commits convencionales para H86-GATE, H8-024, H8-025 y H8-026 si realmente se completa.
- Informe adversarial para revisión ANTES de generar RC; no declarar gate verde solo por Jest.
- H8-023 (triaje IA automático) sigue excluido.
- Actualizar Engram, informes y evidencias.
- No borrar .git, node_modules, datos de usuario, archivos ajenos sin seguimiento ni checkpoints anteriores.
