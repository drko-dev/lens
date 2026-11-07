# H8.8-01a-R1 — Auditoría y Hardening de Seguridad de Transporte IA

**Fecha:** 2026-11-07  
**Rama:** `feature/h8-8-01a-secure-ai-transport`  
**Base Commit:** `07c1f296`  
**Estado:** PASS — Hallazgos SEC-01 a SEC-08 resueltos y verificados.

---

## 1. Resumen Ejecutivo

La auditoría independiente de **H8.8-01a** identificó cuatro hallazgos prioritarios (SEC-01 a SEC-04) y cuatro oportunidades de hardening (SEC-05 a SEC-08). Todas las observaciones fueron remediadas manteniendo estricta compatibilidad hacia atrás, cero regresiones y **cero tráfico de red hacia APIs reales de IA**.

---

## 2. Resolución de Hallazgos Auditados

### SEC-01 — Timeout no garantizado (P0)
- **Causa Raíz:** El coordinador esperaba pasivamente la promesa `this.engine.dispatch()` sin un deadline externo activo en la promesa misma. Si el motor subyacente se colgaba indefinidamente, el timeout del llamador no se cumplía.
- **Corrección Implementada:**
  - Se introdujo un cálculo de deadline global (`overallDeadline = startTime + overallTimeoutMs`).
  - Se instrumentó una carrera estricta con `Promise.race` contra una promesa de timeout vinculada a un `AbortController` específico de cada intento.
  - Al expirar el deadline o al abortar el usuario, el controlador interno emite `abort()`, cancelando activamente la operación en el motor subyacente y rechazando la promesa pública de inmediato con `TransportTimeoutError` o `TransportAbortError`.
  - Se garantiza limpieza absoluta de temporizadores (`clearTimeout`) y listeners de eventos en el bloque `finally`.
  - El tiempo de backoff se descuenta del presupuesto global restante; si no hay tiempo suficiente para esperar el reintento, se aborta inmediatamente sin demoras espurias.

### SEC-02 — Validación SSRF posterior al dispatch (P0)
- **Causa Raíz:** `validateResolvedIpAddress()` se ejecutaba después de que `this.engine.dispatch()` retornaba, lo cual en un motor de red real hubiese significado que el socket TCP/TLS ya se había conectado a la IP potencialmente privada.
- **Corrección Implementada:**
  - Se rediseñó el contrato `TransportDispatchEngine` requiriendo un contexto de preconexión (`PreconnectValidationContext`).
  - El motor tiene la obligación contractual de resolver el DNS y validar la IP contra `context.validatePreconnectIp(ip)` **antes** de abrir sockets.
  - La estructura de respuesta `DispatchResult` exige la bandera `wasPreconnectValidated: boolean`. Si un motor devuelve `false` o no realiza la verificación preconexión, el coordinador aborta la conexión con `SsrfSecurityViolationError`.
  - Las redirecciones HTTP (3xx) se validan estrictamente mediante `context.validateRedirectUrl(targetUrl)` antes de intentar cualquier conexión subsecuente.

### SEC-03 — Whitelist de headers sin aplicar (P1)
- **Causa Raíz:** `sanitizeHeaders()` filtraba headers prohibidos (`FORBIDDEN_REQUEST_HEADERS`), pero omitía verificar si el header pertenecía a `ALLOWED_REQUEST_HEADERS`, permitiendo que headers no aprobados como `x-private-debug` llegasen al motor.
- **Corrección Implementada:**
  - Se aplica estrictamente la lista blanca `ALLOWED_REQUEST_HEADERS` (`accept`, `content-type`, `user-agent`, `authorization`, `x-api-key`, `anthropic-version`, `openai-organization`, `openai-project`, `x-goog-api-key`, `x-goog-api-client`).
  - Se valida la sintaxis de los nombres de headers según RFC 7230 y se descartan caracteres de control o inyección CRLF (`\r`, `\n`, `\0`).
  - Todo header no aprobado o no reconocido es descartado antes de enviarse al motor.

### SEC-04 — Datos sensibles almacenados en el historial mock (P1)
- **Causa Raíz:** `MockAiTransport.recordedRequests` almacenaba el objeto `request` completo, incluyendo `request.body` en claro (con potenciales logs, prompts de diagnóstico o código del clúster).
- **Corrección Implementada:**
  - Se definió la interfaz `RecordedRequestAudit`.
  - El historial registra exclusivamente metadatos seguros: `provider`, `endpoint` saneado, `method`, `headers` con claves ofuscadas, `hasBody: boolean`, `bodyBytes: number` y el hash criptográfico `bodySha256: string`.
  - El cuerpo en claro (`body`) **nunca** se persiste en el historial ni en memoria tras el despacho.

### SEC-05 — Retry-After y límites temporales
- **Corrección Implementada:**
  - Función `parseRetryAfterHeader()` con soporte dual para enteros en segundos (`Retry-After: 5`) y fechas HTTP (`Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`).
  - Límite máximo de espera estricto: `MAX_RETRY_AFTER_MS = 10000` (10 segundos). Esperas solicitadas mayores son acotadas para evitar congelar el diagnóstico.
  - Si el usuario aborta durante el backoff, la espera se cancela de inmediato (`sleepWithAbort`) y no se ejecutan reintentos adicionales.

### SEC-06 — Tamaño de respuesta incremental (Streaming Guard)
- **Corrección Implementada:**
  - Soporte de lectura por fragmentos (`streamChunks`).
  - La acumulación de bytes se verifica de manera incremental; en el instante en que `accumulatedBytes > maxResponseBytes`, se interrumpe el procesamiento y se arroja `TransportResponseSizeError` sin cargar el resto de la respuesta en RAM.

### SEC-07 — Synthetic local y valores por defecto (Deny by Default)
- **Corrección Implementada:**
  - `allowSyntheticLocal` ahora tiene valor por defecto `false` en `DefaultSecureAiTransport`.
  - El injectable productivo (`secure-ai-transport.injectable.ts`) establece explícitamente `allowSyntheticLocal: false`.
  - Solo en los arneses de prueba que lo configuren de manera explícita se permite el destino `https://synthetic-ai.local/v1`.

### SEC-08 — Tipado estricto y errores
- **Corrección Implementada:**
  - Se eliminaron todos los `catch (err: any)`.
  - Se normalizó el manejo a `catch (err: unknown)` con comprobación de tipo segura (`err instanceof Error`).
  - Se ampliaron las reglas de redacción de `sanitizeSensitiveText()` para eliminar credenciales en estructuras JSON (`"apiKey": "..."`, `"password": "..."`).

---

## 3. Matriz de Cobertura y Métricas Verificables

Siguiendo la **regla de un único proceso de pruebas secuencial con `--runInBand`**, se ejecutó la totalidad de las suites del Centro de Incidentes y Diagnóstico IA:

| Grupo de Pruebas | Archivos / Módulo | Suites | Tests | Resultado |
| :--- | :--- | :---: | :---: | :---: |
| **Transporte & SSRF** | `packages/core/src/main/ai-diagnostics/transport/__tests__/` | 2 | 47 | **PASS** |
| **Diagnóstico IA & Consentimiento** | `packages/core/src/main/ai-diagnostics/__tests__/` | 5 | 64 | **PASS** |
| **Incident Storage & SQLite** | `packages/core/src/main/incident-storage/__tests__/` | 8 | 74 | **PASS** |
| **Broker de Evidencias K8s** | `packages/core/src/main/incident-broker/__tests__/` | 7 | 54 | **PASS** |
| **Scanner Local de Incidentes** | `packages/core/src/main/incident-scanner/__tests__/` | 7 | 66 | **PASS** |
| **Incident Workbench UI** | `packages/core/src/features/incident-workbench/renderer/__tests__/` | 4 | 21 | **PASS** |
| **TOTAL VERIFICADO** | **Sin solapamientos ni duplicación** | **33** | **326** | **100% PASS** |

*(Nota de auditoría: Se corrigió la discrepancia previa de conteo; 33 suites distintas y 326 tests unitarios/adversariales ejecutados de manera determinística).*

---

## 4. Compilación Estricta de Producción

1. **`@openlens/core`**:
   - Comando: `npm run build -- --env=production`
   - `ForkTsCheckerWebpackPlugin`: **ACTIVO**
   - Errores TypeScript: **0**
   - Paquete emitido en store: `@openlens/core@6.5.3`.

2. **`open-lens`**:
   - Comando: `npm run build -- --env=production`
   - `ForkTsCheckerWebpackPlugin`: **ACTIVO**
   - Errores TypeScript: **0**
   - Iconos de bandeja y binarios verificados exitosamente.

---

## 5. Garantía de Aislamiento de Red

**Se certifica que:**
- El motor predeterminado es `DisabledRealNetworkEngine` (bloqueo estricto fail-closed).
- El adaptador externo de diagnóstico continúa siendo `ExternalAiProviderStub`.
- Ninguna solicitud de prueba o compilación abrió sockets hacia proveedores externos de IA ni hacia clústeres Kubernetes reales.
- El transporte HTTP real permanece deshabilitado hasta la fase H8.8-03 con aprobación explícita del usuario.
