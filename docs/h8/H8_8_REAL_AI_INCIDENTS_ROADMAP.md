# H8.8 — Diagnóstico IA real y detección de incidentes con seguridad verificable

**Inicio:** 2026-11-07
**Rama:** `feature/h8-8-ai-incidents-real-integration`
**Base histórica de H8.8-00:** `develop@914152fa` (baseline previo a la estabilización y los merges).
**Estado actual al 2026-11-07:** H8.8-00 PASS; **H8.8-01a PASS e integrado localmente** en `develop@6c4cc83b` y en la rama de continuidad; **H8.8-01b PENDIENTE (P0)**; H8.8-02 y siguientes pendientes. Sin acceso externo productivo autorizado. `origin/develop` público mantiene historial depurado independiente y NO recibió H8.8-01a.

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

### H8.8-01b — Integración y fixtures de respuestas [P0, PENDIENTE]
- Mantener interfaz `AiProviderAdapter` intercambiable, salida estructurada `CONCLUSIVE|INCONCLUSO`, citas auditables, estimación de tokens/costo y propuesta solo revisable.
- Definir selección explícita del primer proveedor **con el usuario**; nunca asumir que una suscripción ChatGPT/Claude incluye API.
- Probar **solo con un servidor fake/transport mock**, credenciales ficticias, fallos 401/429/500, respuestas corruptas, timeouts, aborto/cancelación, límites de tamaño/tokens y cero logs con datos sensibles.
- No hacer una llamada pagada ni usar Keychain real por defecto. Fallar cerrado si la bóveda OS no está disponible; `--use-mock-keychain` exclusivamente para QA aislado.

## H8.8-02 — Consentimiento, evidencias y presupuesto [P0, PENDIENTE]

- Redactar secretos/PII antes de construir prompts; tratar logs, YAML, eventos y archivos adjuntos como **datos no confiables**, nunca instrucciones.
- Revalidar hash de evidencia, incidente, perfil y alcance después de la previsualización y antes de enviar; token de consentimiento de un solo uso.
- Enviar sólo extractos necesarios y citables; rechazar citas inexistentes o resultados que no identifiquen evidencia suficiente. Conservar hipótesis sin convertirlas en causas probadas.
- Presupuesto máximo por incidente, request, tokens, retries y tiempo; cancelar en cierre de incidente, cambio de clúster, pérdida de autorización o agotamiento de cuota.
- Nunca persistir contenidos originales de adjuntos efímeros ni exponer credenciales API en IPC/SQLite/errores.

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
