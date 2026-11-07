# H8.8-01a-R2 — Cierre Definitivo de Seguridad del Transporte IA

**Fecha:** 2026-11-07  
**Rama:** `feature/h8-8-01a-secure-ai-transport`  
**Estado:** PASS — Cierre total de hallazgos R2-01 a R2-06.  
**Auditoría:** Resolución de hallazgos de segunda auditoría independiente (R2-01 a R2-06).

---

## 1. Resumen Ejecutivo

La segunda auditoría independiente de **H8.8-01a** identificó cuatro hallazgos de seguridad residuales y la necesidad de una infraestructura formal de streaming asíncrono acotado en memoria:
- **R2-01 (P0):** Verificación SSRF previa a la conexión dependía de un booleano no verificable (`wasPreconnectValidated: true`).
- **R2-02 (P0):** Solicitudes POST no idempotentes se reintentaban automáticamente ante errores 429 o transitorios, arriesgando doble cobro o inferencia duplicada.
- **R2-03 (P1):** La política de sanitización de headers de solicitud se aplicaba indistintamente a las respuestas, descartando headers esenciales como `Retry-After`, `Location` y rate limits.
- **R2-04 (P1):** Las redirecciones HTTP (301, 302, 303, 307, 308) no validaban el destino contra SSRF en el coordinador y no fallaban cerrado ante auto-following.
- **R2-05 (P1):** Ausencia de contrato formal de streaming asíncrono con `AsyncIterable<Uint8Array>`, corte inmediato de flujo (`cancel()`) y decodificación íntegra de secuencias UTF-8 multibyte partidas entre chunks.
- **R2-06:** Verificación integral de invariantes previas: cero llamadas externas reales a APIs de IA o Kubernetes, deny-by-default y 100% test pass.

Todos los hallazgos fueron resueltos en su totalidad sin alterar los 10 commits existentes de la rama.

---

## 2. Resolución Técnica de Hallazgos

### R2-01 (P0) — Autoridad de Preconexión SSRF con Token Criptográfico (Nonce Authority)
- **Problema previo:** `wasPreconnectValidated: true` era una aserción booleana auto-declarada por el motor de despacho. Un motor rogue o simulado podía declarar `true` sin resolver la IP ni validarla con el coordinador.
- **Solución implementada:**
  - El coordinador genera un `attemptNonce` criptográfico (`crypto.randomBytes(16)`) para cada intento de despacho.
  - La función `validatePreconnectIp(ip: string)` en `PreconnectValidationContext` valida la IP mediante `validateResolvedIpAddress(ip)` y emite un `PreconnectAuthorizationTicket` firmado con el nonce de ese intento.
  - El resultado `DispatchResult` exige retornar `preconnectTicket`.
  - El coordinador verifica que el ticket devuelto coincida exactamente con el nonce del intento actual. Si el ticket falta, es falsificado o el nonce es incorrecto, se rechaza la conexión con `SsrfSecurityViolationError`.
  - Se verifica además que la IP resuelta coincida con la IP del ticket, neutralizando ataques de DNS rebinding por condición de carrera.

### R2-02 (P0) — Cero Reintentos Automáticos en Peticiones POST No Idempotentes
- **Problema previo:** En caso de 429 o 503, la política aplicaba hasta `MAX_ALLOWED_RETRIES` a cualquier petición, incluidas peticiones POST de diagnóstico con IA. Esto generaba riesgo de consumo doble de tokens de inferencia y costos indebidos.
- **Solución implementada:**
  - Se implementó la regla:
    ```typescript
    const isIdempotent = effectiveRequest.method === "GET" || effectiveRequest.idempotent === true;
    const maxRetries = isIdempotent
      ? Math.min(Math.max(0, request.maxRetries ?? 0), MAX_ALLOWED_RETRIES)
      : 0;
    ```
  - Las peticiones POST tienen `maxRetries = 0` garantizado de forma obligatoria. Ante un código 429, el transporte lanza `TransportHttpError(429)` de inmediato en el intento 1, preservando `retryAfterMs` para que la capa de aplicación decida, sin ejecutar ningún reintento automático ni duplicar la carga.
  - Las desconexiones de red en POST tampoco se reintentan automáticamente.
  - Las peticiones GET idempotentes retienen la capacidad de reintento acotado.

### R2-03 (P1) — Separación de Políticas de Sanitización de Headers de Petición vs. Respuesta
- **Problema previo:** Se utilizaba `sanitizeHeaders()` para ambas direcciones. Como la lista permitida contenía únicamente cabeceras de cliente, las cabeceras de servidor esenciales como `Retry-After` y `Location` eran eliminadas de `response.headers`.
- **Solución implementada:**
  - Se crearon dos políticas independientes:
    - `sanitizeRequestHeaders(headers, redactSecrets?)`: controla la salida y valida contra `ALLOWED_REQUEST_HEADERS` y `FORBIDDEN_REQUEST_HEADERS`.
    - `sanitizeResponseHeaders(headers)`: controla la entrada; preserva `content-type`, `content-length`, `retry-after`, `location`, `date`, `etag`, `x-request-id`, rate limits de proveedores (`x-ratelimit-*`, `anthropic-ratelimit-*`, `openai-*`), bloqueando cookies (`Set-Cookie`) y cabeceras hop-by-hop.
  - `TransportHttpError` retiene y expone el valor numérico parseado de `retryAfterMs`.

### R2-04 (P1) — Validación de Redirecciones HTTP y Fail-Closed
- **Problema previo:** Las respuestas con códigos de redirección (301, 302, 303, 307, 308) no validaban el encabezado `Location` contra la política SSRF en el coordinador.
- **Solución implementada:**
  - En `DefaultSecureAiTransport` y `MockAiTransport`:
    ```typescript
    if ([301, 302, 303, 307, 308].includes(status) && headers["location"]) {
      validateRedirectTarget(effectiveRequest.endpoint, headers["location"], {
        allowSyntheticLocal: this.allowSyntheticLocal,
      });
    }
    ```
  - Redirecciones que apunten a `127.0.0.1`, esquemas no seguros (`http://`), metadatos de nube (`169.254.169.254`) o redes privadas lanzan de inmediato `SsrfSecurityViolationError`.
  - El transporte seguro offline rechaza el auto-following ciego; si el destino es seguro, preserva el código 3xx y expone la URL validada en `headers["location"]`.

### R2-05 (P1) — Contrato de Streaming Bounded Async y Preservación de UTF-8
- **Solución implementada:**
  - Se introdujo `BoundedResponseStream` con interfaz `AsyncIterable<Uint8Array>` y método `cancel(reason?: string): Promise<void>`.
  - Módulo `readBoundedStream(stream, maxBytes, signal?)`:
    - Emplea `StringDecoder("utf8")` de Node.js, garantizando que caracteres multibyte (como `ñ` o emojis como `🎉`) cuyos bytes queden divididos entre el final de un chunk y el inicio del siguiente se recompongan sin corrupción ni caracteres de reemplazo (`\uFFFD`).
    - Comprueba de forma incremental el acumulador de bytes; si supera `maxBytes`, ejecuta inmediatamente `await stream.cancel(...)` antes de consumir memoria adicional y lanza `TransportResponseSizeError`.
    - Atiende cancelaciones y abortos de usuario, cancelando el stream en curso.
  - Soporte en `MockAiTransport` y `createMockAsyncStream` para pruebas de estrés de fragmentos.

### R2-06 — Verificación de Invariantes y Regresión Completa
- Invariantes de seguridad activas y validadas:
  - Motor de red real deshabilitado por defecto (`DisabledRealNetworkEngine` lanza `RealTransportDisabledError`).
  - Cero llamadas salientes a endpoints externos de IA o clústeres Kubernetes reales.
  - Historial mock sin retención de cuerpos de solicitud (`hasBody: true`, `bodySha256`, cero texto plano).
  - Secretos y tokens ofuscados en telemetría y mensajes de error.
  - 33 suites y 339 tests PASS en Jest con ejecución secuencial `--runInBand`.
  - Compilación de producción estricta de `@openlens/core` y `open-lens` exitosa.

---

## 3. Matriz de Evidencias de Pruebas

| Suite | Componente | Tests | Estado |
|---|---|---|---|
| `secure-ai-transport.test.ts` | Transporte seguro, SSRF token, POST zero-retry, BoundedStream | 32 | PASS |
| `transport-security-policy.test.ts` | SSRF, alternativas IP, rebinding, redirecciones | 28 | PASS |
| `ai-ipc.test.ts`, `ai-profile-manager.test.ts`, `h8-3-1-integration-gate.test.ts`, etc. | Perfiles IA, Vault, Consentimiento inmutable | 64 | PASS |
| `incident-storage` | Repositorio, SQLite WAL, sanitizador, purga | 74 | PASS |
| `incident-broker` | Doble identidad RBAC, límites, herramientas de solo lectura | 54 | PASS |
| `incident-scanner` | Escáner local, reglas deterministas, deduplicación | 66 | PASS |
| `incident-workbench` | Panel de incidentes, visualización, diagnóstico mock | 21 | PASS |
| **Total General** | **Todas las suites de regresión H8** | **339** | **PASS** |

---

## 4. Estado de Producción y Git

- **Worktree:** `/private/var/tmp/lens-h8-8-01a-secure-ai-transport-20261107`
- **Rama:** `feature/h8-8-01a-secure-ai-transport`
- **TypeScript:** 0 errores (`tsc --noEmit` exitoso en `@openlens/core`).
- **Webpack Core:** Compilado en modo producción (`@openlens/core@6.5.3 published in store`).
- **Webpack OpenLens:** Compilado en modo producción (`open-lens@6.5.3-dev compiled successfully`).
- **Restricciones Git respetadas:** Sin push, sin merge, sin rebase, 10 commits previos intactos.
