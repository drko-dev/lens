# H8.8 — Diagnóstico IA real y detección de incidentes con seguridad verificable

**Inicio:** 2026-11-07
**Rama:** `feature/h8-8-ai-incidents-real-integration`
**Base histórica de H8.8-00:** `develop@914152fa` (baseline previo a la estabilización y los merges).
**Estado actual al 2026-11-07:** H8.8-00 PASS; **H8.8-01a y H8.8-01b PASS e integrados localmente** en `develop` y la rama de continuidad; **H8.8-02 PASS (completado y verificado con 36 suites / 434 tests PASS, 0 errores tsc, builds Core/OpenLens PASS)**. No hay autorización para APIs IA ni clústeres reales. `origin/develop` público conserva un historial depurado independiente: no recibió H8.8-01a/01b/02.

## Punto de partida verificado

- H8.0–H8.7: Centro de Incidentes local, SQLite, timeline, evidencias sanitizadas, broker con identidad técnica independiente, diagnóstico mock, consentimiento, cuotas, contexto efímero y documentación offline implementados. No confundir reportes de QA sintético con conexión real.
- Los perfiles `openai`, `anthropic` y `gemini` existen, pero `createAiProviderAdapter()` devuelve `ExternalAiProviderStub`; no hacen inferencias de red. La UI deshabilita perfiles no mock.
- `LocalIncidentScanner` produce `sourceType: synthetic_feed`, `isSyntheticDemo: true`, `activeWatchersCount: 0`. Sin fuente real de snapshots, ni watchers Kubernetes.
- 2026-11-07: Jest focalizado 4 suites / 44 tests PASS (`ai-diagnosis-engine`, `ai-profile-manager`, `local-incident-scanner`, `incident-broker-service`); log `/tmp/h8-8-baseline-focused-20261107.log`. No equivale a E2E ni auditoría de seguridad completa.
- **Antecedente del baseline:** hubo 123 errores TypeScript antes de STAB; fueron corregidos en la integración posterior. La auditoría independiente de H8.8-01a R3 verificó **33 suites / 365 tests PASS**, compilación estricta Core y OpenLens PASS, sin desactivar ForkTsChecker.
- H9 NovaKube: [PR remoto #3](https://github.com/drko-dev/lens/pull/3) **MERGED**, junto al [PR #4](https://github.com/drko-dev/lens/pull/4) de integración pública depurada. La documentación privada local continúa separada de `origin/develop`; no publicar directamente el historial privado.
- La app Electron de desarrollo y la carpeta RC1 permanecen intactas; el usuario postergó el nuevo empaquetado.

## H8.8-00 — Preflight y matriz de riesgos [PASS documental]

1. Identificar lo que es demostración, implementación real y bloqueo de seguridad para IA, broker y scanner.
2. Congelar reglas: usuario debe autorizar cada diagnóstico y presupuesto; ningún modelo recibe kubeconfig/token/Secret; cero escrituras en Kubernetes o repositorios.
3. Conservar módulos existentes y sus gates H8.2/H8.3/H8.6; la identidad técnica del agente NO puede heredar el kubeconfig de un usuario administrador.
4. Guardar baseline focalizado con resultados reales, no simular QA sobre servicios externos.

## H8.8-01 — Contrato de proveedor IA y ejecución offline
### H8.8-01a — Infraestructura segura de transporte HTTP [PASS, 2026-11-07; R1, R2 y R3 Final Closed]
- Contrato de transporte desacoplado: `AiTransportRequest`, `AiTransportResponse`, `SecureAiTransport`, `BoundedResponseStream`.
- Prohibición incondicional de reintentos para peticiones POST (R3-01): previene doble cobro y duplicación de tokens de inferencia independientemente de cualquier flag de idempotencia. Reintentos acotados exclusivamente para peticiones GET idempotentes.
- Delimitación del límite del ticket de preconexión (R3-02): el ticket valida la interacción lógica contractual; el transporte HTTP real permanece deshabilitado por defecto (`DisabledRealNetworkEngine` lanza `RealTransportDisabledError`). El DNS pinning físico a nivel socket queda asentado como gate de seguridad obligatorio para H8.8-03.
- Deadline global único para streaming (R3-03): el timeout global cubre dispatch y lectura completa de streaming; cancelación oportuna y cooperativa ante timeout/abort (`safelyCancelStream`) con interrupción inmediata de la espera pública.
- Validación obligatoria de Location en redirecciones (R3-04): las respuestas 301, 302, 303, 307 y 308 exigen cabecera `Location` válida contra SSRF o arrojan `TransportRedirectError`; HTTP 304 no requiere Location y se procesa normalmente.
- Streaming acotado en memoria (2 MiB) y preservación UTF-8: `readBoundedStream` con `StringDecoder("utf8")`, aborto y cancelación inmediata al exceder el límite de bytes, decodificando caracteres partidos entre chunks sin corrupción.
- Simulación 100% offline con `MockAiTransport` (33 suites, 365 tests totales PASS, 0 errores TypeScript en compilación estricta de producción de `@openlens/core` y `open-lens`). Ver `docs/h8/H8_8_01A_R3_FINAL_AUDIT.md`.

### H8.8-01b — Integración y fixtures de respuestas [PASS, R1 auditado e integrado localmente]
- Mantener interfaz `AiProviderAdapter` intercambiable, salida estructurada `CONCLUSIVE|INCONCLUSO`, citas auditables, estimación de tokens/costo y propuesta solo revisable.
- Definir selección explícita del primer proveedor **con el usuario**; nunca asumir que una suscripción ChatGPT/Claude incluye API.
- Probar **solo con un servidor fake/transport mock**, credenciales ficticias, fallos 401/429/500, respuestas corruptas, timeouts, aborto/cancelación, límites de tamaño/tokens y cero logs con datos sensibles.
- No hacer una llamada pagada ni usar Keychain real por defecto. Fallar cerrado si la bóveda OS no está disponible; `--use-mock-keychain` exclusivamente para QA aislado.
- **Auditoría independiente 2026-11-07:** R1-01 tokens enteros seguros con suma exacta, R1-02 proveedores externos siempre bloqueados pese a overrides, R1-03 mensajes de error sin fragmentos de payload; 36 suites / 421 tests PASS; tsc y builds Core/OpenLens PASS. Ver `docs/h8/H8_8_01B_R1_SECURITY_AUDIT.md`. El proveedor real y el acceso Kubernetes continúan bloqueados.

## H8.8-02 — Consentimiento, evidencias y presupuesto [PASS, 2026-11-07; R1 HARDENING COMPLETADO]

- Redacción de secretos y PII antes de construir prompts; logs, YAML, eventos y adjuntos tratados estrictamente como **datos no confiables**.
- Post-sanitización de respuestas de modelos IA para prevenir fuga de credenciales reflejadas hacia SQLite o IPC.
- Revalidación inmutable de hash de evidencias, incidente (CERRADO/NO CONFIRMADO rechazados), perfil y alcance (cluster/namespace) tras previsualización; token de consentimiento efímero de un solo uso con soporte de revocación granular y cancelación en vuelo.
- Minimización de evidencias: exclusión de recursos Secret y ServiceAccount, y límites duros de 50 ítems y 192 KiB por payload.
- Control presupuestario atómico con reservas inmediatas en SQLite (Migración 009 `ai_budget_reservations`): prevención de condiciones de carrera concurrentes, política de fallos post-dispatch vs pre-dispatch, y validación estricta de tokens no negativos.
- Contexto efímero protegido: buffers en RAM purgados inmediatamente tras ejecución, citas con extracto indefinido para prevenir persistencia no autorizada. Ver `docs/h8/H8_8_02_CONSENT_PRIVACY_BUDGET_DELIVERY.md`.
- **Auditoría independiente H8.8-02-R1 (2026-11-07):** R1-01 códigos de fallo normalizados en SQLite para prevenir persistencia de canarios/errores sensibles, R1-02 canonicalización estricta de metadatos de citas y saneamiento de IDs no confiables, R1-03 límite duro de 192 KiB sobre el payload total serializado en adaptador y motor, R1-04 validación de tokens enteros seguros y fail-closed ante ausencia de transacciones SQLite inmediatas, R1-05 limpieza determinística de listeners de AbortSignal y revocación de consentimientos en cierre de incidentes. 27/27 tests adversariales PASS; 37 suites y 448 tests PASS; compila en producción `@openlens/core` y `open-lens`. Ver `docs/h8/H8_8_02_R1_FINAL_SECURITY_AUDIT.md`.
- **Auditoría independiente H8.8-02-R2 (2026-11-07):** R2-01 saneamiento de metadatos de recursos canónicos al ingestar evidencia y en citas de hechos verificados para prevenir fugas de secretos en SQLite `ai_diagnoses` e IPC, R2-02 separación estricta entre validación preflight de payload serializado y despacho real al transporte preservando reservas `CANCELLED_BEFORE_DISPATCH` sin consumir cuota presupuestaria ante fallos previos al despacho, R2-03 descarte determinístico de respuestas tardías de adaptadores no cooperativos con revalidación transaccional SQLite de estado (`CERRADO`, `NO CONFIRMADO`), alcance y aborto para impedir persistencia de diagnósticos ni eventos de timeline tras cancelaciones o cierres de casos. 30/30 tests adversariales PASS; 37 suites y 451 tests PASS; compilación limpia en producción `@openlens/core` y `open-lens`. Ver `docs/h8/H8_8_02_R2_FINAL_SECURITY_AUDIT.md`.
- **Auditoría independiente H8.8-02-R3 (2026-11-07):** R3-01 acotamiento lineal y eliminación de backtracking catastrófico en regexes de `EvidenceSanitizer` (de >2000ms a 0.08ms en 32 KiB), guardia preflight de 256 KiB en entrada cruda, y límites de 256 caracteres en metadatos de recursos; R3-02 tests de rendimiento adversarial con cadenas sin separadores, logs extensos, JSON/YAML densos, claves con prefijos largos y UTF-8 multibyte; R3-03 garantía de invocación única del callback `onBeforeDispatch` en `MockAiProviderAdapter` previniendo duplicación de transiciones de reserva. 31/31 tests adversariales H8.8-02 PASS; 443/443 tests PASS en suites de incidentes; compilación limpia en producción `@openlens/core` y `open-lens`. Ver `docs/h8/H8_8_02_R3_FINAL_AUDIT.md`.
- **Auditoría independiente H8.8-02-R3a (2026-11-07):** R3a-01 escaneo lineal tokenizado en `EvidenceSanitizer` que soporta claves sensibles con sufijos y prefijos arbitrariamente largos (hasta 256 caracteres) eliminando alternancias en regex; verificación adversaria de no persistencia de canarios sensibles en SQLite (`incident_evidence.content_snippet`). 37 suites y 462 tests PASS; TypeScript 0 errores; compilación limpia en producción `@openlens/core` y `open-lens`. Ver `docs/h8/H8_8_02_R3A_FINAL_SECURITY_AUDIT.md`.
- **Auditoría independiente H8.8-02-R3b (2026-11-07):** R3b-01 validación estricta de valores completamente redactados (`isFullyRedactedValue`) eliminando fugas por marcadores incrustados en YAML y JSON entrecomillado; captura continua de valores unquoted sin interrupción prematura por corchetes `]`; rechazo explícito y seguro antes de `INSERT` ante claves mayores a 256 caracteres (`EXCESSIVE_KEY_LENGTH`); preservación de formatos legítimos `Bearer`/`Basic [REDACTED_TOKEN]`. 37 suites y 467 tests PASS; TypeScript 0 errores; compilación limpia en producción `@openlens/core` y `open-lens`. Ver `docs/h8/H8_8_02_R3B_FINAL_SECURITY_AUDIT.md`.

## H8.8-03 — Primer adaptador externo opt-in [P1, BLOQUEADO POR SELECCIÓN]

- Implementar **un solo** proveedor inicial cuando se defina la opción con el usuario; los demás continúan claramente identificados como no disponibles.
- Probar contrato de respuestas reales mediante fixtures grabados **sin secretos**, sin generar solicitudes de red salvo consentimiento específico de prueba.
- Exponer límites de costos y errores comprensibles en Workbench; no mostrar capacidad real donde todavía haya un stub.
- Gate: pruebas de redirección, DNS, filtrado y exfiltración; validación de salida y coherencia de citas; aceptación manual antes de usar proveedores externos.

## H8.8-04 — Fuente Kubernetes para escáner [P0 de seguridad; P1 funcional, PENDIENTE]

- Diseñar un `SnapshotSource` inyectable, primero mock, separado de `LocalIncidentScanner`. No montar watchers hasta aprobar las condiciones de identidad.
- Conexión de solo lectura mediante broker existente y **ServiceAccount/identidad técnica propia** verificada, con intersección efectiva de permisos usuario ∩ agente ∩ clúster ∩ namespace ∩ recurso/verbo.
- Denegar por defecto Secrets, exec, attach, portforward, proxy, token minting, RBAC write y cualquier subrecurso no permitido; evitar fallback administrador.
- Opt-in por clúster/namespace, límites de polling/watch, backoff, cancelación y limpieza en switch/logout/close; mostrar claramente fuente real vs sintética.
- Pruebas iniciales con API Kubernetes **falsa local**, incluyendo revocación, doble clúster, errores 403, eventos viejos y deduplicación; ningún clúster productivo en el gate inicial.
- Activar lectura en un clúster real únicamente con autorización separada y luego de pasar el gate de seguridad.

## H8.8-05 — UX y QA Electron DEV [PENDIENTE]

- Señalizar estado `demo`, `sin proveedor`, `listo`, `sin permiso` y `INCONCLUSO` sin engañar al operador.
- Recorrido completo de un incidente ficticio en Electron real: snapshot -> alerta -> evidencia -> consentimiento -> diagnóstico mock transport -> hipótesis/citas -> propuesta no ejecutable -> cierre.
- Aislar HOME/CICD/KUBECONFIG y keychain en QA; 0 red a clústeres reales; capturas reales y prueba negativa de solicitudes no autorizadas.
- Regresión focalizada de H7 docking, H8, H8.7 y NovaKube; no alterar temas ni el PR #3.

## H8.8-06 — Gate independiente y handoff [PENDIENTE]

- Verificar autorizaciones, privacidad, falta de writes, saneamiento, límites, multiclúster, errores, costos y recuperación.
- Resultado puede ser **QA sintético PASS / proveedor externo BLOCKED / clúster real BLOCKED** por separado, nunca equivalentes.
- Packaging pendiente hasta resolver TypeScript y release gates H11; no sobrescribir RC1, ni borrar builds, ni push/merge sin autorización.
- Decidir con usuario cuándo integrar esta rama y con qué proveedor/entorno hacer el piloto real.

## Próximo trabajo técnico concreto

**H8.8-01b — COMPLETADO & AUDITADO (R1):** adaptador de respuestas sintéticas integrado mediante DI y `MockAiTransport`, preservando `ExternalAiProviderStub` y el bloqueo del motor real (`DisabledRealNetworkEngine`); fixtures estructurados `CONCLUSIVE` e `INCONCLUSO`, errores 401/403/429/500/503, cancelación, timeouts, validación estricta de tokens no negativos enteros seguros y consistentes (R1-01), cierre total de bypasses de proveedores externos por overrides de prueba (R1-02), prevención completa de fugas de datos sensibles en errores de validación y parsing (R1-03), citas verificadas y cero retención de secretos en auditoría. 36 suites y 421 tests PASS; Core y OpenLens compilan en producción.

**Después H8.8-02:** reforzar consentimiento, minimización de evidencias, privacidad y presupuestos. **H8.8-04a** (snapshot Kubernetes fake) puede planificarse de forma independiente, sin leer clústeres reales.

**Decisión pendiente para pasar a H8.8-03:** elegir el primer proveedor de IA real (OpenAI, Anthropic o Gemini) y el modelo/presupuesto. No se requiere esa decisión para cerrar H8.8-01b.
